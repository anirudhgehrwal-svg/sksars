import { ref, onValue, update } from 'firebase/database';
import { db, isFirebaseConfigured } from '../firebase.js';
import { escapeHtml, formatDate } from './database.js';

let activeUnsub = null;
let latestNotifications = [];

export function startNotificationsListener(uid, onUpdate = null) {
  if (!isFirebaseConfigured() || !db || !uid) return () => {};
  if (activeUnsub) activeUnsub();

  const notifRef = ref(db, `notifications/${uid}`);
  activeUnsub = onValue(
    notifRef,
    (snap) => {
      const data = snap.exists() ? snap.val() : {};
      latestNotifications = Object.entries(data)
        .map(([id, item]) => ({ id, ...item }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      const unreadCount = latestNotifications.filter((n) => !n.read).length;
      document.querySelectorAll('[data-notif-count]').forEach((el) => {
        el.textContent = unreadCount > 0 ? String(unreadCount) : '';
      });

      if (onUpdate) onUpdate(latestNotifications, unreadCount);
      window.dispatchEvent(
        new CustomEvent('sksars:notifications', { detail: { list: latestNotifications, unreadCount } })
      );
    },
    (err) => {
      console.warn('Notifications listener error:', err.message);
    }
  );

  return activeUnsub;
}

export function getCachedNotifications() {
  return latestNotifications;
}

export async function markNotificationRead(uid, notificationId) {
  if (!isFirebaseConfigured() || !db || !uid || !notificationId) return;
  await update(ref(db, `notifications/${uid}/${notificationId}`), { read: true });
}

export async function markAllNotificationsRead(uid) {
  if (!isFirebaseConfigured() || !db || !uid || latestNotifications.length === 0) return;
  const updates = {};
  latestNotifications.forEach((n) => {
    if (!n.read) updates[`notifications/${uid}/${n.id}/read`] = true;
  });
  if (Object.keys(updates).length > 0) {
    await update(ref(db), updates);
  }
}

export function renderNotificationsList(container, uid, list = latestNotifications) {
  if (!container) return;
  if (!list.length) {
    container.innerHTML = `
      <div class="state-box">
        <h3>No notifications yet</h3>
        <p>Inquiry alerts, listing approvals, verification updates, and rental reminders will appear here.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
      <span style="font-size:13px; color:var(--text-secondary);">${list.filter((n) => !n.read).length} unread</span>
      <button type="button" class="btn btn-outline btn-sm" id="mark-all-notif-btn">Mark all as read</button>
    </div>
    <div style="display:flex; flex-direction:column; gap:10px;">
      ${list
        .map(
          (n) => `
          <div class="panel" style="padding:14px 16px; background:${n.read ? 'var(--bg-surface)' : 'var(--primary-soft)'};">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
              <div>
                <div style="font-weight:700; font-size:14px; color:var(--primary);">${escapeHtml(n.title)}</div>
                <div style="font-size:13.5px; color:var(--text-secondary); margin-top:4px;">${escapeHtml(n.message)}</div>
                <div style="font-size:12px; color:var(--text-muted); margin-top:6px;">${formatDate(n.createdAt)} · ${escapeHtml(n.read ? 'Read' : 'Unread')}</div>
              </div>
              <div style="display:flex; gap:8px; flex-shrink:0;">
                ${n.link ? `<a href="${escapeHtml(n.link)}" class="btn btn-outline btn-sm">Open</a>` : ''}
                ${!n.read ? `<button type="button" class="btn btn-primary btn-sm" data-mark-read="${escapeHtml(n.id)}">Mark Read</button>` : ''}
              </div>
            </div>
          </div>
        `
        )
        .join('')}
    </div>
  `;

  container.querySelector('#mark-all-notif-btn')?.addEventListener('click', () => {
    markAllNotificationsRead(uid);
  });

  container.querySelectorAll('[data-mark-read]').forEach((btn) => {
    btn.addEventListener('click', () => {
      markNotificationRead(uid, btn.getAttribute('data-mark-read'));
    });
  });
}
