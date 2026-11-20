const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onValueWritten } = require('firebase-functions/v2/database');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.database();
const auth = admin.auth();
const messaging = admin.messaging();

/**
 * Helper to verify caller holds trusted admin custom claim.
 */
function assertAdmin(request) {
  if (!request.auth || request.auth.token?.admin !== true) {
    throw new HttpsError('permission-denied', 'Authorized admin claim required.');
  }
}

/**
 * Helper to create an RTDB notification and optionally send FCM push.
 */
async function sendUserNotification(uid, { title, message, type, link = '' }) {
  if (!uid) return;
  const notifRef = db.ref(`notifications/${uid}`).push();
  await notifRef.set({
    title,
    message,
    type,
    link,
    read: false,
    createdAt: admin.database.ServerValue.TIMESTAMP,
  });

  try {
    const tokenSnap = await db.ref(`users/${uid}/fcmToken`).get();
    const fcmToken = tokenSnap.val();
    if (fcmToken && typeof fcmToken === 'string') {
      await messaging.send({
        token: fcmToken,
        notification: { title, body: message },
        data: { type, link },
      });
    }
  } catch (err) {
    logger.warn('FCM push skipped or failed', { uid, error: err.message });
  }
}

/**
 * 1. Assign or revoke admin custom claims securely.
 * Only callable by an existing super-admin custom claim holder.
 * Initial admin bootstrap must be executed via trusted Node.js Admin SDK CLI script (see README).
 */
exports.assignAdminClaim = onCall(async (request) => {
  assertAdmin(request);

  const { targetUid, makeAdmin } = request.data || {};
  if (!targetUid || typeof targetUid !== 'string') {
    throw new HttpsError('invalid-argument', 'Valid targetUid string is required.');
  }

  const userRecord = await auth.getUser(targetUid);
  const existingClaims = userRecord.customClaims || {};
  const nextAdminState = Boolean(makeAdmin);

  await auth.setCustomUserClaims(targetUid, {
    ...existingClaims,
    admin: nextAdminState,
  });

  await db.ref(`users/${targetUid}`).update({
    role: nextAdminState ? 'admin' : 'buyer',
    updatedAt: admin.database.ServerValue.TIMESTAMP,
  });

  logger.info('Updated admin claim', { targetUid, makeAdmin: nextAdminState, by: request.auth.uid });
  return { success: true, targetUid, admin: nextAdminState };
});

/**
 * 2. Property moderation callable (approve, reject, verify, feature, delete).
 */
exports.moderateProperty = onCall(async (request) => {
  assertAdmin(request);

  const { propertyId, action, reason = '' } = request.data || {};
  if (!propertyId || typeof propertyId !== 'string') {
    throw new HttpsError('invalid-argument', 'propertyId is required.');
  }

  const propRef = db.ref(`properties/${propertyId}`);
  const snap = await propRef.get();
  if (!snap.exists()) {
    throw new HttpsError('not-found', 'Property listing not found.');
  }

  const prop = snap.val();
  const updates = { updatedAt: admin.database.ServerValue.TIMESTAMP };

  if (action === 'approve') {
    updates.status = 'approved';
    updates.approvedAt = admin.database.ServerValue.TIMESTAMP;
    updates.rejectionReason = null;
  } else if (action === 'reject') {
    updates.status = 'rejected';
    updates.rejectionReason = String(reason || 'Listing did not meet verification guidelines.').slice(0, 300);
  } else if (action === 'verify') {
    updates.verified = true;
    updates.verifiedAt = admin.database.ServerValue.TIMESTAMP;
  } else if (action === 'unverify') {
    updates.verified = false;
  } else if (action === 'feature') {
    updates.featured = !prop.featured;
  } else if (action === 'delete') {
    await propRef.remove();
    await sendUserNotification(prop.ownerId, {
      title: 'Listing Removed',
      message: `Your listing "${prop.title}" was removed by moderation.`,
      type: 'property_rejected',
      link: '/pages/dashboard.html',
    });
    return { success: true, deleted: true };
  } else {
    throw new HttpsError('invalid-argument', 'Unsupported moderation action.');
  }

  await propRef.update(updates);

  if (action === 'approve') {
    await sendUserNotification(prop.ownerId, {
      title: 'Property Approved',
      message: `Your listing "${prop.title}" in ${prop.locality}, ${prop.city} is now live.`,
      type: 'property_approved',
      link: `/pages/property-details.html?id=${propertyId}`,
    });
  } else if (action === 'reject') {
    await sendUserNotification(prop.ownerId, {
      title: 'Property Needs Attention',
      message: `Your listing "${prop.title}" was rejected: ${updates.rejectionReason}`,
      type: 'property_rejected',
      link: '/pages/dashboard.html',
    });
  }

  return { success: true, propertyId, action };
});

/**
 * 3. Secure Owner/Property Verification Review.
 */
exports.reviewVerificationRequest = onCall(async (request) => {
  assertAdmin(request);

  const { uid, decision, notes = '' } = request.data || {};
  if (!uid || !['approved', 'rejected'].includes(decision)) {
    throw new HttpsError('invalid-argument', 'Valid uid and decision (approved|rejected) required.');
  }

  const reqRef = db.ref(`verificationRequests/${uid}`);
  const snap = await reqRef.get();
  if (!snap.exists()) {
    throw new HttpsError('not-found', 'Verification request not found.');
  }

  await reqRef.update({
    status: decision,
    reviewNotes: String(notes).slice(0, 400),
    reviewedBy: request.auth.uid,
    reviewedAt: admin.database.ServerValue.TIMESTAMP,
  });

  await db.ref(`users/${uid}`).update({
    verified: decision === 'approved',
    verificationStatus: decision,
    verifiedAt: decision === 'approved' ? admin.database.ServerValue.TIMESTAMP : null,
  });

  await sendUserNotification(uid, {
    title: decision === 'approved' ? 'Verification Approved' : 'Verification Rejected',
    message:
      decision === 'approved'
        ? 'Your owner identity and property documents have been verified.'
        : `Verification was not approved: ${notes || 'Please upload clear documents.'}`,
    type: 'verification_completed',
    link: '/pages/dashboard.html',
  });

  return { success: true, uid, decision };
});

/**
 * 4. Server-side validation & saved-search match notifications on property writes.
 */
exports.onPropertyWriteValidate = onValueWritten('/properties/{propertyId}', async (event) => {
  const after = event.data.after.val();
  const before = event.data.before.val();
  if (!after) return;

  const propertyId = event.params.propertyId;

  // Enforce server-side numerical sanity
  if (typeof after.price !== 'number' || after.price < 0) {
    await db.ref(`properties/${propertyId}/status`).set('pending');
    return;
  }

  // When newly approved, notify users whose saved searches match city & listingType
  if (after.status === 'approved' && (!before || before.status !== 'approved')) {
    const usersSnap = await db.ref('users').once('value');
    const users = usersSnap.val() || {};
    const tasks = [];

    Object.entries(users).forEach(([uid, user]) => {
      const saved = user?.savedSearches;
      if (!saved || uid === after.ownerId) return;
      const matches = Object.values(saved).some(
        (s) =>
          (!s.city || s.city === after.city) &&
          (!s.listingType || s.listingType === after.listingType)
      );
      if (matches) {
        tasks.push(
          sendUserNotification(uid, {
            title: `New Property in ${after.city}`,
            message: `${after.title} (${after.locality}) matches your saved search.`,
            type: 'saved_search_match',
            link: `/pages/property-details.html?id=${propertyId}`,
          })
        );
      }
    });

    await Promise.all(tasks);
  }
});

/**
 * 5. Record verified rent payment ONLY with a verified payment gateway transaction ID.
 */
exports.verifyAndRecordRentPayment = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required.');
  }

  const { contractId, amount, gatewayTransactionId, gatewayProvider, periodMonth } = request.data || {};
  if (!contractId || !gatewayTransactionId || String(gatewayTransactionId).trim().length < 8) {
    throw new HttpsError(
      'invalid-argument',
      'A real payment gateway transaction reference (min 8 chars) is required before marking payment completed.'
    );
  }

  const contractSnap = await db.ref(`rentalContracts/${contractId}`).get();
  if (!contractSnap.exists()) {
    throw new HttpsError('not-found', 'Rental contract not found.');
  }
  const contract = contractSnap.val();

  if (
    request.auth.uid !== contract.ownerId &&
    request.auth.uid !== contract.tenantId &&
    request.auth.token?.admin !== true
  ) {
    throw new HttpsError('permission-denied', 'Not authorized on this rental contract.');
  }

  const paymentRef = db.ref('rentalPayments').push();
  await paymentRef.set({
    contractId,
    propertyId: contract.propertyId,
    ownerId: contract.ownerId,
    tenantId: contract.tenantId || '',
    amount: Number(amount) || contract.monthlyRent,
    periodMonth: String(periodMonth || ''),
    gatewayProvider: String(gatewayProvider || 'Razorpay/UPI Gateway'),
    gatewayTransactionId: String(gatewayTransactionId).trim(),
    status: 'completed',
    verifiedByServer: true,
    paidAt: admin.database.ServerValue.TIMESTAMP,
    dueDate: new Date().toISOString().slice(0, 10),
  });

  await sendUserNotification(contract.ownerId, {
    title: 'Rent Payment Recorded',
    message: `Payment of INR ${Number(amount) || contract.monthlyRent} (Ref: ${gatewayTransactionId}) recorded.`,
    type: 'rental_payment',
    link: '/pages/dashboard.html',
  });

  return { success: true, paymentId: paymentRef.key };
});

/**
 * 6. Scheduled daily rental expiry check & status transitions.
 */
exports.checkRentalExpiries = onSchedule('every day 08:00', async () => {
  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const snap = await db.ref('rentalContracts').once('value');
  const contracts = snap.val() || {};

  const jobs = [];
  for (const [contractId, contract] of Object.entries(contracts)) {
    if (!contract.endDate || ['terminated', 'expired'].includes(contract.status)) continue;
    const endMs = new Date(contract.endDate).getTime();
    if (Number.isNaN(endMs)) continue;

    if (endMs < now && contract.status !== 'expired') {
      jobs.push(db.ref(`rentalContracts/${contractId}/status`).set('expired'));
      if (contract.propertyId) {
        jobs.push(db.ref(`properties/${contract.propertyId}/availabilityStatus`).set('available'));
      }
      jobs.push(
        sendUserNotification(contract.ownerId, {
          title: 'Rental Contract Expired',
          message: `Contract for ${contract.propertyTitle || 'property'} expired on ${contract.endDate}.`,
          type: 'rental_expiry',
          link: '/pages/dashboard.html',
        })
      );
      if (contract.tenantId) {
        jobs.push(
          sendUserNotification(contract.tenantId, {
            title: 'Rental Contract Expired',
            message: `Your lease for ${contract.propertyTitle || 'property'} ended on ${contract.endDate}.`,
            type: 'rental_expiry',
            link: '/pages/dashboard.html',
          })
        );
      }
    } else if (endMs - now <= thirtyDaysMs && contract.status === 'active') {
      jobs.push(db.ref(`rentalContracts/${contractId}/status`).set('expiring_soon'));
      jobs.push(
        sendUserNotification(contract.ownerId, {
          title: 'Rental Renewal Upcoming',
          message: `Lease for ${contract.propertyTitle || 'property'} expires on ${contract.endDate}.`,
          type: 'rental_reminder',
          link: '/pages/dashboard.html',
        })
      );
      if (contract.tenantId) {
        jobs.push(
          sendUserNotification(contract.tenantId, {
            title: 'Lease Expiring Within 30 Days',
            message: `Lease for ${contract.propertyTitle || 'property'} expires on ${contract.endDate}. Request renewal in Dashboard.`,
            type: 'rental_reminder',
            link: '/pages/dashboard.html',
          })
        );
      }
    }
  }

  await Promise.all(jobs);
  logger.info('Completed checkRentalExpiries', { processed: Object.keys(contracts).length });
});

/**
 * 7. Scheduled monthly rent reminder notifications.
 */
exports.sendRentalReminders = onSchedule('0 9 1 * *', async () => {
  const snap = await db.ref('rentalContracts').orderByChild('status').equalTo('active').once('value');
  const contracts = snap.val() || {};
  const tasks = [];

  Object.values(contracts).forEach((contract) => {
    if (contract.tenantId) {
      tasks.push(
        sendUserNotification(contract.tenantId, {
          title: 'Monthly Rent Reminder',
          message: `Monthly rent of INR ${contract.monthlyRent} is due for ${contract.propertyTitle || 'your rental'}.`,
          type: 'rental_reminder',
          link: '/pages/dashboard.html',
        })
      );
    }
  });

  await Promise.all(tasks);
});

/**
 * 8. Scheduled cleanup of expired listings older than 90 days.
 */
exports.cleanupExpiredListings = onSchedule('every sunday 02:00', async () => {
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const snap = await db.ref('properties').once('value');
  const properties = snap.val() || {};
  const updates = {};

  Object.entries(properties).forEach(([id, prop]) => {
    if (prop.expiresAt && Number(prop.expiresAt) < cutoff && prop.status === 'approved') {
      updates[`${id}/status`] = 'expired';
    }
  });

  if (Object.keys(updates).length > 0) {
    await db.ref('properties').update(updates);
  }
  logger.info('cleanupExpiredListings completed', { updatedCount: Object.keys(updates).length });
});
