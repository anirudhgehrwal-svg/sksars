import {
  createInquiryRecord,
  getInquiriesByField,
  updateInquiryStatus,
  escapeHtml,
  formatDate,
} from './database.js';
import { isFirebaseConfigured } from '../firebase.js';
import { APP_STATE, showToast } from '../app.js';

export async function submitPropertyInquiry({ property, senderName, senderPhone, senderEmail, message }) {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured yet.');
  }
  if (!APP_STATE.user) {
    throw new Error('Please sign in to send an inquiry to the owner.');
  }
  if (!message || message.trim().length < 5) {
    throw new Error('Please enter a message (minimum 5 characters).');
  }

  return createInquiryRecord({
    propertyId: property.id,
    propertyTitle: property.title,
    ownerId: property.ownerId,
    senderId: APP_STATE.user.uid,
    senderName: senderName || APP_STATE.profile?.name || APP_STATE.user.email,
    senderPhone: senderPhone || APP_STATE.profile?.phone || '',
    senderEmail: senderEmail || APP_STATE.user.email || '',
    message,
  });
}

export function buildWhatsAppInquiryLink(property) {
  const rawPhone = String(property.contactNumber || '').replace(/[^0-9]/g, '');
  const phone = rawPhone.length === 10 ? `91${rawPhone}` : rawPhone;
  const text = encodeURIComponent(
    `Hello ${property.ownerName || ''}, I saw your property "${property.title}" in ${property.locality}, ${property.city} on SKSARS Housing and would like to know more.`
  );
  if (!phone) return null;
  return `https://wa.me/${phone}?text=${text}`;
}

export async function loadUserInquiries(uid) {
  const [received, sent] = await Promise.all([
    getInquiriesByField('ownerId', uid),
    getInquiriesByField('senderId', uid),
  ]);
  return { received, sent };
}

export function renderInquiriesSection(container, { received = [], sent = [] }, onRefresh) {
  if (!container) return;

  const renderRows = (items, mode) => {
    if (!items.length) {
      return `<div class="state-box" style="margin-top:12px;"><h3>No ${mode} inquiries</h3><p>${
        mode === 'received'
          ? 'Inquiries from interested buyers and tenants will appear here.'
          : 'Messages you send to property owners will be tracked here.'
      }</p></div>`;
    }

    return `
      <div class="table-wrap" style="margin-top:12px;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Property</th>
              <th>${mode === 'received' ? 'From' : 'Message'}</th>
              <th>Contact</th>
              <th>Status</th>
              <th>Date</th>
              ${mode === 'received' ? '<th>Action</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${items
              .map(
                (inq) => `
                <tr>
                  <td>
                    <a href="./property-details.html?id=${encodeURIComponent(inq.propertyId)}" style="color:var(--primary); font-weight:600;">
                      ${escapeHtml(inq.propertyTitle || inq.propertyId)}
                    </a>
                    ${mode === 'received' ? `<div style="font-size:12.5px; color:var(--text-secondary); margin-top:4px;">${escapeHtml(inq.message)}</div>` : ''}
                  </td>
                  <td>${mode === 'received' ? escapeHtml(inq.senderName) : escapeHtml(inq.message)}</td>
                  <td>${escapeHtml(inq.senderPhone || '—')}<br><span style="font-size:12px; color:var(--text-muted);">${escapeHtml(inq.senderEmail || '')}</span></td>
                  <td><span class="status-label ${inq.status === 'unread' ? 'status-pending' : 'status-approved'}">${escapeHtml(inq.status)}</span></td>
                  <td class="tabular-nums">${formatDate(inq.createdAt)}</td>
                  ${
                    mode === 'received'
                      ? `<td>
                          ${
                            inq.status === 'unread'
                              ? `<button type="button" class="btn btn-outline btn-sm" data-inq-read="${escapeHtml(inq.id)}">Mark Read</button>`
                              : `<button type="button" class="btn btn-outline btn-sm" data-inq-reply="${escapeHtml(inq.id)}">Mark Replied</button>`
                          }
                        </td>`
                      : ''
                  }
                </tr>
              `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  };

  container.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:28px;">
      <div>
        <h3 style="font-size:18px; color:var(--primary);">Received Inquiries (${received.length})</h3>
        ${renderRows(received, 'received')}
      </div>
      <div>
        <h3 style="font-size:18px; color:var(--primary);">Sent Inquiries (${sent.length})</h3>
        ${renderRows(sent, 'sent')}
      </div>
    </div>
  `;

  container.querySelectorAll('[data-inq-read]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await updateInquiryStatus(btn.getAttribute('data-inq-read'), 'read');
      showToast('Inquiry marked as read.', 'success');
      if (onRefresh) onRefresh();
    });
  });

  container.querySelectorAll('[data-inq-reply]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await updateInquiryStatus(btn.getAttribute('data-inq-reply'), 'replied');
      showToast('Inquiry marked as replied.', 'success');
      if (onRefresh) onRefresh();
    });
  });
}
