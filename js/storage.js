import {
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import { storage, isFirebaseConfigured } from '../firebase.js';

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const DOC_MIME_TYPES = [...IMAGE_MIME_TYPES, 'application/pdf'];

function assertStorageReady() {
  if (!isFirebaseConfigured() || !storage) {
    throw new Error('Firebase Storage is not configured.');
  }
}

export function validateFile(file, { allowedTypes = IMAGE_MIME_TYPES, maxMB = 5 } = {}) {
  if (!file) throw new Error('No file selected.');
  if (!allowedTypes.includes(file.type)) {
    throw new Error(`Unsupported file type (${file.type}). Allowed: ${allowedTypes.join(', ')}`);
  }
  const maxBytes = maxMB * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(`File "${file.name}" exceeds ${maxMB} MB limit.`);
  }
}

function sanitizeFileName(name) {
  return String(name || 'file')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 80);
}

function uploadSingle(path, file, onProgress) {
  assertStorageReady();
  return new Promise((resolve, reject) => {
    const fileRef = storageRef(storage, path);
    const task = uploadBytesResumable(fileRef, file, { contentType: file.type });

    task.on(
      'state_changed',
      (snapshot) => {
        if (onProgress && snapshot.totalBytes > 0) {
          const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          onProgress(pct);
        }
      },
      (error) => reject(error),
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        resolve({ url, path });
      }
    );
  });
}

/**
 * Upload multiple property photos to property-images/{uid}/{propertyId}/
 */
export async function uploadPropertyImages(uid, propertyId, files, onProgress) {
  const fileList = Array.from(files || []);
  if (fileList.length === 0) return [];
  if (fileList.length > 10) throw new Error('Maximum 10 images allowed per property.');

  fileList.forEach((f) => validateFile(f, { allowedTypes: IMAGE_MIME_TYPES, maxMB: 5 }));

  const results = [];
  for (let i = 0; i < fileList.length; i += 1) {
    const file = fileList[i];
    const cleanName = `${Date.now()}_${i}_${sanitizeFileName(file.name)}`;
    const path = `property-images/${uid}/${propertyId}/${cleanName}`;
    const uploaded = await uploadSingle(path, file, (pct) => {
      if (onProgress) {
        const overall = Math.round(((i + pct / 100) / fileList.length) * 100);
        onProgress(overall, i + 1, fileList.length);
      }
    });
    results.push(uploaded);
  }

  return results;
}

/**
 * Upload user profile avatar to profile-images/{uid}/
 */
export async function uploadProfileAvatar(uid, file, onProgress) {
  validateFile(file, { allowedTypes: IMAGE_MIME_TYPES, maxMB: 3 });
  const path = `profile-images/${uid}/avatar_${Date.now()}_${sanitizeFileName(file.name)}`;
  return uploadSingle(path, file, onProgress);
}

/**
 * Upload private verification document to verification-documents/{uid}/
 * Protected by storage.rules: only owner and admin can read.
 */
export async function uploadVerificationDocument(uid, docKind, file, onProgress) {
  validateFile(file, { allowedTypes: DOC_MIME_TYPES, maxMB: 10 });
  const path = `verification-documents/${uid}/${docKind}_${Date.now()}_${sanitizeFileName(file.name)}`;
  return uploadSingle(path, file, onProgress);
}

/**
 * Get authorized download URL for private verification doc (owner or admin only).
 */
export async function getAuthorizedDocUrl(storagePath) {
  assertStorageReady();
  return getDownloadURL(storageRef(storage, storagePath));
}

export async function deleteStorageFile(storagePath) {
  if (!storagePath || !isFirebaseConfigured() || !storage) return;
  try {
    await deleteObject(storageRef(storage, storagePath));
  } catch (err) {
    console.warn('Storage delete warning:', err.message);
  }
}
