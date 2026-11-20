import {
  ref,
  get,
  set,
  push,
  update,
  remove,
  query,
  orderByChild,
  equalTo,
  serverTimestamp,
} from 'firebase/database';
import { db, isFirebaseConfigured } from '../firebase.js';

export const PROPERTY_CATEGORIES = [
  'Buy Residential Property',
  'Rent Residential Property',
  'PG / Hostel',
  'Commercial Property',
  'Office Space',
  'Shop / Showroom',
  'Land / Plot',
  'Farm House',
  'Independent House',
  'Apartment / Flat',
  'Villa',
  'Warehouse',
];

export const MP_CITIES_DATA = [
  {
    id: 'bhopal',
    name: 'Bhopal',
    lat: 23.2599,
    lng: 77.4126,
    localities: ['Arera Colony', 'Kolar Road', 'MP Nagar', 'Hoshangabad Road', 'Shahpura', 'Bawadiya Kalan', 'Ayodhya Bypass', 'TT Nagar'],
  },
  {
    id: 'indore',
    name: 'Indore',
    lat: 22.7196,
    lng: 75.8577,
    localities: ['Vijay Nagar', 'Super Corridor', 'AB Road', 'Palasia', 'Rau', 'Nipania', 'Bhawarkua', 'MG Road'],
  },
  {
    id: 'jabalpur',
    name: 'Jabalpur',
    lat: 23.1815,
    lng: 79.9864,
    localities: ['Civil Lines', 'Vijay Nagar', 'Napier Town', 'Wright Town', 'Adhartal', 'Tilhari'],
  },
  {
    id: 'gwalior',
    name: 'Gwalior',
    lat: 26.2183,
    lng: 78.1828,
    localities: ['City Centre', 'Lashkar', 'Morar', 'DD Nagar', 'Thatipur', 'Sirol'],
  },
  {
    id: 'ujjain',
    name: 'Ujjain',
    lat: 23.1765,
    lng: 75.7885,
    localities: ['Freeganj', 'Nanakheda', 'Rishi Nagar', 'Mahananda Nagar', 'Dewas Road'],
  },
  {
    id: 'sagar',
    name: 'Sagar',
    lat: 23.8388,
    lng: 78.7378,
    localities: ['Makronia', 'Civil Lines', 'Gopalganj', 'Tili Road'],
  },
  {
    id: 'rewa',
    name: 'Rewa',
    lat: 24.5362,
    lng: 81.3037,
    localities: ['Civil Lines', 'Sirmour Chowk', 'University Road', 'Nehru Nagar'],
  },
  {
    id: 'satna',
    name: 'Satna',
    lat: 24.6005,
    lng: 80.8322,
    localities: ['Civil Lines', 'Bharhut Nagar', 'Panna Naka', 'Rajendra Nagar'],
  },
  {
    id: 'ratlam',
    name: 'Ratlam',
    lat: 23.3315,
    lng: 75.0367,
    localities: ['Station Road', 'Alkapuri', 'Shastri Nagar', 'Kasturba Nagar'],
  },
  {
    id: 'dewas',
    name: 'Dewas',
    lat: 22.9676,
    lng: 76.0534,
    localities: ['AB Road', 'Civil Lines', 'Vikas Nagar', 'Mukherjee Nagar'],
  },
  {
    id: 'chhindwara',
    name: 'Chhindwara',
    lat: 22.0574,
    lng: 78.9382,
    localities: ['Parasia Road', 'Gulabra', 'Chandan Nagar', 'Civil Lines'],
  },
  {
    id: 'vidisha',
    name: 'Vidisha',
    lat: 23.5251,
    lng: 77.8081,
    localities: ['Sherpura', 'Durga Nagar', 'Sanchi Road', 'Madhav Ganj'],
  },
  {
    id: 'sehore',
    name: 'Sehore',
    lat: 23.2032,
    lng: 77.0844,
    localities: ['Englishpura', 'Ganj', 'Mandi', 'Bhopal Naka'],
  },
  {
    id: 'narmadapuram',
    name: 'Hoshangabad / Narmadapuram',
    lat: 22.7441,
    lng: 77.7369,
    localities: ['Rasuliya', 'Malakhedi', 'Kothi Bazar', 'Itarsi Road'],
  },
  {
    id: 'khandwa',
    name: 'Khandwa',
    lat: 21.8314,
    lng: 76.3498,
    localities: ['Civil Lines', 'Anand Nagar', 'Padawa', 'Indore Road'],
  },
  {
    id: 'burhanpur',
    name: 'Burhanpur',
    lat: 21.3145,
    lng: 76.2180,
    localities: ['Lalbagh', 'Shikarpura', 'Sindhi Basti', 'Indira Colony'],
  },
];

export const DEFAULT_PROPERTY_IMAGES = {
  apartment: '/src/assets/images/prop_luxury_apartment_1795138146268.jpg',
  villa: '/src/assets/images/prop_independent_villa_1795138145585.jpg',
  commercial: '/src/assets/images/prop_commercial_office_1795138146563.jpg',
  farmhouse: '/src/assets/images/prop_farmhouse_plot_1795138145747.jpg',
  hero: '/src/assets/images/hero_mp_residence_1795138146302.jpg',
};

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatPriceINR(amount, listingType = 'buy') {
  const num = Number(amount) || 0;
  if (listingType === 'rent' || listingType === 'pg') {
    return `₹${num.toLocaleString('en-IN')}/mo`;
  }
  if (num >= 10000000) {
    return `₹${(num / 10000000).toFixed(2)} Cr`;
  }
  if (num >= 100000) {
    return `₹${(num / 100000).toFixed(2)} L`;
  }
  return `₹${num.toLocaleString('en-IN')}`;
}

export function formatDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function getFallbackImageByCategory(category = '') {
  const c = String(category).toLowerCase();
  if (c.includes('commercial') || c.includes('office') || c.includes('shop') || c.includes('warehouse')) {
    return DEFAULT_PROPERTY_IMAGES.commercial;
  }
  if (c.includes('villa') || c.includes('independent')) {
    return DEFAULT_PROPERTY_IMAGES.villa;
  }
  if (c.includes('farm') || c.includes('land') || c.includes('plot')) {
    return DEFAULT_PROPERTY_IMAGES.farmhouse;
  }
  return DEFAULT_PROPERTY_IMAGES.apartment;
}

function assertDbReady() {
  if (!isFirebaseConfigured() || !db) {
    throw new Error('Firebase Realtime Database is not configured. Add your Firebase credentials in firebase.js.');
  }
}

function mapSnapshot(snap) {
  if (!snap.exists()) return [];
  const data = snap.val();
  return Object.entries(data).map(([id, val]) => ({ id, ...val }));
}

/* ==================== CITIES & LOCALITIES ==================== */

export async function getCities() {
  if (!isFirebaseConfigured() || !db) {
    return MP_CITIES_DATA.map((c) => ({ ...c, state: 'Madhya Pradesh', active: true }));
  }
  try {
    const snap = await get(ref(db, 'cities'));
    if (!snap.exists()) {
      return MP_CITIES_DATA.map((c) => ({ ...c, state: 'Madhya Pradesh', active: true }));
    }
    const list = mapSnapshot(snap).filter((c) => c.active !== false);
    return list.length ? list : MP_CITIES_DATA.map((c) => ({ ...c, state: 'Madhya Pradesh', active: true }));
  } catch {
    return MP_CITIES_DATA.map((c) => ({ ...c, state: 'Madhya Pradesh', active: true }));
  }
}

export async function getLocalitiesByCity(cityName) {
  const baseCity = MP_CITIES_DATA.find((c) => c.name.toLowerCase() === String(cityName || '').toLowerCase());
  const defaultLocs = baseCity ? baseCity.localities : [];

  if (!isFirebaseConfigured() || !db) return defaultLocs;

  try {
    const q = query(ref(db, 'localities'), orderByChild('cityName'), equalTo(cityName));
    const snap = await get(q);
    if (!snap.exists()) return defaultLocs;
    const dbLocs = mapSnapshot(snap).map((l) => l.name).filter(Boolean);
    return Array.from(new Set([...defaultLocs, ...dbLocs]));
  } catch {
    return defaultLocs;
  }
}

export async function seedMpCitiesToDb() {
  assertDbReady();
  const cityUpdates = {};
  const localityUpdates = {};

  MP_CITIES_DATA.forEach((city) => {
    cityUpdates[`cities/${city.id}`] = {
      name: city.name,
      state: 'Madhya Pradesh',
      lat: city.lat,
      lng: city.lng,
      active: true,
    };
    city.localities.forEach((loc, idx) => {
      const locKey = `${city.id}_${idx}_${loc.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
      localityUpdates[`localities/${locKey}`] = {
        cityId: city.id,
        cityName: city.name,
        name: loc,
      };
    });
  });

  await update(ref(db), { ...cityUpdates, ...localityUpdates });
}

export async function addCity({ name, lat = 23.2599, lng = 77.4126 }) {
  assertDbReady();
  const cleanName = String(name || '').trim();
  if (!cleanName) throw new Error('City name is required.');
  const id = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  await set(ref(db, `cities/${id}`), {
    name: cleanName,
    state: 'Madhya Pradesh',
    lat: Number(lat) || 23.2599,
    lng: Number(lng) || 77.4126,
    active: true,
    createdAt: serverTimestamp(),
  });
  return id;
}

export async function addLocality({ cityName, name }) {
  assertDbReady();
  const cleanCity = String(cityName || '').trim();
  const cleanLoc = String(name || '').trim();
  if (!cleanCity || !cleanLoc) throw new Error('City and locality names are required.');
  const cityId = cleanCity.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const locRef = push(ref(db, 'localities'));
  await set(locRef, {
    cityId,
    cityName: cleanCity,
    name: cleanLoc,
    createdAt: serverTimestamp(),
  });
  return locRef.key;
}

/* ==================== PROPERTIES ==================== */

export async function getApprovedProperties() {
  if (!isFirebaseConfigured() || !db) return [];
  const q = query(ref(db, 'properties'), orderByChild('status'), equalTo('approved'));
  const snap = await get(q);
  const list = mapSnapshot(snap);
  return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function getPropertyById(propertyId) {
  if (!isFirebaseConfigured() || !db || !propertyId) return null;
  const snap = await get(ref(db, `properties/${propertyId}`));
  if (!snap.exists()) return null;
  return { id: snap.key, ...snap.val() };
}

export async function getOwnerProperties(ownerId) {
  assertDbReady();
  const q = query(ref(db, 'properties'), orderByChild('ownerId'), equalTo(ownerId));
  const snap = await get(q);
  return mapSnapshot(snap).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function saveProperty(propertyData, existingId = null) {
  assertDbReady();

  const targetRef = existingId ? ref(db, `properties/${existingId}`) : push(ref(db, 'properties'));
  const propertyId = existingId || targetRef.key;

  const payload = {
    title: String(propertyData.title || '').trim(),
    category: String(propertyData.category || 'Apartment / Flat'),
    listingType: String(propertyData.listingType || 'buy'),
    description: String(propertyData.description || '').trim(),
    city: String(propertyData.city || 'Bhopal'),
    locality: String(propertyData.locality || '').trim(),
    address: String(propertyData.address || '').trim(),
    price: Number(propertyData.price) || 0,
    securityDeposit: Number(propertyData.securityDeposit) || 0,
    monthlyRent: Number(propertyData.monthlyRent) || 0,
    maintenanceCharges: Number(propertyData.maintenanceCharges) || 0,
    bhk: Number(propertyData.bhk) || 0,
    bathrooms: Number(propertyData.bathrooms) || 0,
    balconies: Number(propertyData.balconies) || 0,
    carpetArea: Number(propertyData.carpetArea) || 0,
    builtUpArea: Number(propertyData.builtUpArea) || 0,
    furnishing: String(propertyData.furnishing || 'Semi-Furnished'),
    possessionStatus: String(propertyData.possessionStatus || 'Ready to Move'),
    propertyAge: String(propertyData.propertyAge || '0-1 Years'),
    floorNumber: Number(propertyData.floorNumber) || 0,
    totalFloors: Number(propertyData.totalFloors) || 1,
    parking: String(propertyData.parking || '1 Covered'),
    facing: String(propertyData.facing || 'East'),
    amenities: Array.isArray(propertyData.amenities) ? propertyData.amenities : [],
    ownerName: String(propertyData.ownerName || '').trim(),
    contactNumber: String(propertyData.contactNumber || '').trim(),
    postedByRole: String(propertyData.postedByRole || 'owner'),
    ownerId: propertyData.ownerId,
    lat: Number(propertyData.lat) || 23.2599,
    lng: Number(propertyData.lng) || 77.4126,
    images: Array.isArray(propertyData.images) ? propertyData.images : [],
    status: propertyData.status === 'draft' ? 'draft' : 'pending',
    verified: false,
    featured: false,
    availabilityStatus: 'available',
    updatedAt: serverTimestamp(),
  };

  if (!existingId) {
    payload.createdAt = serverTimestamp();
    await set(targetRef, payload);
  } else {
    // Preserve existing createdAt and prevent client self-approval
    await update(targetRef, payload);
  }

  return propertyId;
}

export async function deletePropertyRecord(propertyId) {
  assertDbReady();
  await remove(ref(db, `properties/${propertyId}`));
}

/* ==================== FAVORITES ==================== */

export async function getUserFavoriteIds(uid) {
  if (!isFirebaseConfigured() || !db || !uid) return [];
  const snap = await get(ref(db, `favorites/${uid}`));
  if (!snap.exists()) return [];
  return Object.keys(snap.val());
}

export async function setFavorite(uid, propertyId, isFavorite) {
  assertDbReady();
  const favRef = ref(db, `favorites/${uid}/${propertyId}`);
  if (isFavorite) {
    await set(favRef, { propertyId, savedAt: serverTimestamp() });
  } else {
    await remove(favRef);
  }
}

/* ==================== INQUIRIES & REPORTS ==================== */

export async function createInquiryRecord(data) {
  assertDbReady();
  const inqRef = push(ref(db, 'inquiries'));
  const payload = {
    propertyId: data.propertyId,
    propertyTitle: String(data.propertyTitle || ''),
    ownerId: data.ownerId,
    senderId: data.senderId,
    senderName: String(data.senderName || '').trim(),
    senderPhone: String(data.senderPhone || '').trim(),
    senderEmail: String(data.senderEmail || '').trim(),
    message: String(data.message || '').trim(),
    status: 'unread',
    createdAt: serverTimestamp(),
  };
  await set(inqRef, payload);

  // Notify property owner
  if (data.ownerId && data.ownerId !== data.senderId) {
    await pushNotification(data.ownerId, {
      senderUid: data.senderId,
      title: 'New Property Inquiry',
      message: `${payload.senderName} inquired about "${payload.propertyTitle}".`,
      type: 'new_inquiry',
      link: '/pages/dashboard.html#inquiries',
    });
  }

  return inqRef.key;
}

export async function getInquiriesByField(field, uid) {
  assertDbReady();
  const q = query(ref(db, 'inquiries'), orderByChild(field), equalTo(uid));
  const snap = await get(q);
  return mapSnapshot(snap).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function updateInquiryStatus(inquiryId, status) {
  assertDbReady();
  await update(ref(db, `inquiries/${inquiryId}`), {
    status,
    updatedAt: serverTimestamp(),
  });
}

export async function createPropertyReport(data) {
  assertDbReady();
  const reportRef = push(ref(db, 'reports'));
  await set(reportRef, {
    propertyId: data.propertyId,
    propertyTitle: String(data.propertyTitle || ''),
    reporterId: data.reporterId,
    reason: String(data.reason || '').trim(),
    details: String(data.details || '').trim(),
    status: 'open',
    createdAt: serverTimestamp(),
  });
  return reportRef.key;
}

/* ==================== RENTAL MANAGEMENT ==================== */

export async function createRentalContract(data) {
  assertDbReady();
  const contractRef = push(ref(db, 'rentalContracts'));
  await set(contractRef, {
    propertyId: data.propertyId,
    propertyTitle: String(data.propertyTitle || ''),
    ownerId: data.ownerId,
    ownerName: String(data.ownerName || ''),
    tenantId: String(data.tenantId || ''),
    tenantName: String(data.tenantName || ''),
    tenantPhone: String(data.tenantPhone || ''),
    tenantEmail: String(data.tenantEmail || ''),
    monthlyRent: Number(data.monthlyRent) || 0,
    securityDeposit: Number(data.securityDeposit) || 0,
    startDate: String(data.startDate || ''),
    endDate: String(data.endDate || ''),
    status: 'active',
    createdAt: serverTimestamp(),
  });

  if (data.propertyId) {
    await update(ref(db, `properties/${data.propertyId}`), {
      availabilityStatus: 'rented',
    });
  }
  return contractRef.key;
}

export async function getUserRentalContracts(uid) {
  assertDbReady();
  const [ownerSnap, tenantSnap] = await Promise.all([
    get(query(ref(db, 'rentalContracts'), orderByChild('ownerId'), equalTo(uid))),
    get(query(ref(db, 'rentalContracts'), orderByChild('tenantId'), equalTo(uid))),
  ]);
  const merged = new Map();
  [...mapSnapshot(ownerSnap), ...mapSnapshot(tenantSnap)].forEach((c) => merged.set(c.id, c));
  return Array.from(merged.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

export async function updateRentalContract(contractId, updates) {
  assertDbReady();
  await update(ref(db, `rentalContracts/${contractId}`), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function createPendingRentPayment(data) {
  assertDbReady();
  // Never mark payment completed without server/gateway verification
  const payRef = push(ref(db, 'rentalPayments'));
  await set(payRef, {
    contractId: data.contractId,
    ownerId: data.ownerId,
    tenantId: data.tenantId || '',
    amount: Number(data.amount) || 0,
    dueDate: String(data.dueDate || ''),
    periodMonth: String(data.periodMonth || ''),
    status: 'awaiting_verification',
    gatewayTransactionId: String(data.gatewayTransactionId || ''),
    createdAt: serverTimestamp(),
  });
  return payRef.key;
}

export async function getRentalPaymentsForUser(uid) {
  assertDbReady();
  const [ownerSnap, tenantSnap] = await Promise.all([
    get(query(ref(db, 'rentalPayments'), orderByChild('ownerId'), equalTo(uid))),
    get(query(ref(db, 'rentalPayments'), orderByChild('tenantId'), equalTo(uid))),
  ]);
  const merged = new Map();
  [...mapSnapshot(ownerSnap), ...mapSnapshot(tenantSnap)].forEach((p) => merged.set(p.id, p));
  return Array.from(merged.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

/* ==================== VERIFICATION WORKFLOW ==================== */

export async function submitVerificationRequest(uid, data) {
  assertDbReady();
  await set(ref(db, `verificationRequests/${uid}`), {
    uid,
    fullName: String(data.fullName || '').trim(),
    idType: String(data.idType || 'Aadhaar / PAN'),
    idDocPath: data.idDocPath,
    ownershipDocPath: data.ownershipDocPath,
    notes: String(data.notes || '').trim(),
    status: 'pending',
    submittedAt: serverTimestamp(),
  });
}

export async function getUserVerificationRequest(uid) {
  if (!isFirebaseConfigured() || !db || !uid) return null;
  const snap = await get(ref(db, `verificationRequests/${uid}`));
  return snap.exists() ? snap.val() : null;
}

/* ==================== NOTIFICATIONS ==================== */

export async function pushNotification(uid, notif) {
  if (!isFirebaseConfigured() || !db || !uid) return;
  const nRef = push(ref(db, `notifications/${uid}`));
  await set(nRef, {
    senderUid: notif.senderUid || '',
    title: String(notif.title || 'Notification'),
    message: String(notif.message || ''),
    type: String(notif.type || 'general'),
    link: String(notif.link || ''),
    read: false,
    createdAt: serverTimestamp(),
  });
}

/* ==================== ADMIN OPERATIONS ==================== */

export async function getAdminOverviewData() {
  assertDbReady();
  const [usersSnap, propsSnap, inquiriesSnap, reportsSnap, verifSnap, settingsSnap] = await Promise.all([
    get(ref(db, 'users')),
    get(ref(db, 'properties')),
    get(ref(db, 'inquiries')),
    get(ref(db, 'reports')),
    get(ref(db, 'verificationRequests')),
    get(ref(db, 'settings')),
  ]);

  return {
    users: mapSnapshot(usersSnap),
    properties: mapSnapshot(propsSnap),
    inquiries: mapSnapshot(inquiriesSnap),
    reports: mapSnapshot(reportsSnap),
    verificationRequests: mapSnapshot(verifSnap),
    settings: settingsSnap.exists() ? settingsSnap.val() : {},
  };
}

export async function adminUpdateProperty(propertyId, updates) {
  assertDbReady();
  await update(ref(db, `properties/${propertyId}`), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function adminUpdateVerification(uid, status, notes = '') {
  assertDbReady();
  await update(ref(db, `verificationRequests/${uid}`), {
    status,
    reviewNotes: notes,
    reviewedAt: serverTimestamp(),
  });
  await update(ref(db, `users/${uid}`), {
    verified: status === 'approved',
    verificationStatus: status,
  });
  await pushNotification(uid, {
    title: status === 'approved' ? 'Verification Approved' : 'Verification Rejected',
    message: status === 'approved' ? 'Your identity and ownership documents are verified.' : `Verification rejected: ${notes}`,
    type: 'verification_completed',
    link: '/pages/dashboard.html',
  });
}

export async function adminUpdateReport(reportId, status) {
  assertDbReady();
  await update(ref(db, `reports/${reportId}`), {
    status,
    reviewedAt: serverTimestamp(),
  });
}

export async function adminSaveSettings(settingsObj) {
  assertDbReady();
  await update(ref(db, 'settings/site'), {
    ...settingsObj,
    updatedAt: serverTimestamp(),
  });
}

export async function getSiteSettings() {
  if (!isFirebaseConfigured() || !db) return {};
  try {
    const snap = await get(ref(db, 'settings/site'));
    return snap.exists() ? snap.val() : {};
  } catch {
    return {};
  }
}

export async function saveUserSearchAlert(uid, searchParams) {
  assertDbReady();
  const alertRef = push(ref(db, `users/${uid}/savedSearches`));
  await set(alertRef, {
    city: searchParams.city || '',
    listingType: searchParams.listingType || '',
    category: searchParams.category || '',
    maxPrice: Number(searchParams.maxPrice) || 0,
    createdAt: serverTimestamp(),
  });
}
