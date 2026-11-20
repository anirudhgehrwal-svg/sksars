import {
  getOwnerProperties,
  deletePropertyRecord,
  getUserRentalContracts,
  createRentalContract,
  updateRentalContract,
  getRentalPaymentsForUser,
  createPendingRentPayment,
  submitVerificationRequest,
  getUserVerificationRequest,
  escapeHtml,
  formatPriceINR,
  formatDate,
} from './database.js';
import { uploadVerificationDocument, deleteStorageFile } from './storage.js';
import { loadFavoritePropertiesList } from './favorites.js';
import { loadUserInquiries, renderInquiriesSection } from './inquiries.js';
import { renderNotificationsList, getCachedNotifications } from './notifications.js';
import { createPropertyCardHtml, bindPropertyCardActions } from './properties.js';
import { resetPassword } from './auth.js';
import { APP_STATE, onAuthReady, showToast, getRecentlyViewed } from '../app.js';

export function initDashboardPage() {
  const root = document.getElementById('dashboard-main-view');
  if (!root) return;

  onAuthReady(async (state) => {
    if (!state.user) {
      root.innerHTML = `
        <div class="state-box">
          <h3>Sign in required</h3>
          <p>Sign in to manage your properties, favourites, inquiries, rental contracts, and verification documents.</p>
          <a href="./login.html" class="btn btn-primary">Sign In</a>
        </div>
      `;
      return;
    }

    const uid = state.user.uid;
    const profile = state.profile || {};
    const sideLinks = document.querySelectorAll('[data-dash-tab]');

    function switchTab(tabKey) {
      sideLinks.forEach((btn) => btn.classList.toggle('active', btn.getAttribute('data-dash-tab') === tabKey));
      if (tabKey === 'overview') renderOverview();
      else if (tabKey === 'properties') renderMyProperties();
      else if (tabKey === 'favorites') renderFavoritesTab();
      else if (tabKey === 'recent') renderRecentTab();
      else if (tabKey === 'inquiries') renderInquiriesTab();
      else if (tabKey === 'rentals') renderRentalsTab();
      else if (tabKey === 'verification') renderVerificationTab();
      else if (tabKey === 'notifications') renderNotificationsTab();
      else if (tabKey === 'settings') renderSettingsTab();
    }

    sideLinks.forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.getAttribute('data-dash-tab')));
    });

    async function renderOverview() {
      root.innerHTML = `<div class="panel"><p>Loading dashboard overview...</p></div>`;
      try {
        const [myProps, favs, inq, contracts] = await Promise.all([
          getOwnerProperties(uid),
          loadFavoritePropertiesList(uid),
          loadUserInquiries(uid),
          getUserRentalContracts(uid),
        ]);

        root.innerHTML = `
          <div style="margin-bottom:20px;">
            <h1 style="font-size:24px; color:var(--primary);">Welcome, ${escapeHtml(profile.name || state.user.email)}</h1>
            <p style="font-size:14px; color:var(--text-secondary); margin:4px 0 0;">
              Role: ${escapeHtml(profile.role || 'buyer')} · Verification: ${escapeHtml(profile.verified ? 'Verified' : 'Unverified')}
              ${state.isAdmin ? ' · <a href="./admin.html" style="color:var(--secondary); font-weight:600;">Open Admin Console</a>' : ''}
            </p>
          </div>

          <div class="kpi-grid">
            <div class="kpi-box"><div class="kpi-label">My Properties</div><div class="kpi-value tabular-nums">${myProps.length}</div></div>
            <div class="kpi-box"><div class="kpi-label">Saved Favourites</div><div class="kpi-value tabular-nums">${favs.length}</div></div>
            <div class="kpi-box"><div class="kpi-label">Received Inquiries</div><div class="kpi-value tabular-nums">${inq.received.length}</div></div>
            <div class="kpi-box"><div class="kpi-label">Rental Contracts</div><div class="kpi-value tabular-nums">${contracts.length}</div></div>
          </div>

          <div class="panel">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
              <div>
                <h2 style="font-size:18px; color:var(--primary);">Quick Actions</h2>
                <p style="font-size:13.5px; color:var(--text-secondary); margin:4px 0 0;">Manage your Madhya Pradesh listings, rentals, and verification status.</p>
              </div>
              <div style="display:flex; gap:10px; flex-wrap:wrap;">
                <a href="./add-property.html" class="btn btn-primary btn-sm">Add New Property</a>
                <a href="./profile.html" class="btn btn-outline btn-sm">Edit Profile</a>
              </div>
            </div>
          </div>
        `;
      } catch (err) {
        root.innerHTML = `<div class="state-box"><h3>Unable to load overview</h3><p>${escapeHtml(err.message)}</p></div>`;
      }
    }

    async function renderMyProperties() {
      root.innerHTML = `<div class="panel"><p>Loading your properties...</p></div>`;
      try {
        const list = await getOwnerProperties(uid);
        if (!list.length) {
          root.innerHTML = `
            <div class="state-box">
              <h3>No properties posted yet</h3>
              <p>Post residential, PG, land, or commercial properties across Madhya Pradesh for admin approval.</p>
              <a href="./add-property.html" class="btn btn-primary">Post First Property</a>
            </div>
          `;
          return;
        }

        root.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <h2 style="font-size:20px; color:var(--primary);">My Properties (${list.length})</h2>
            <a href="./add-property.html" class="btn btn-primary btn-sm">Add Property</a>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Title &amp; Location</th>
                  <th>Category</th>
                  <th class="num">Price</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${list
                  .map(
                    (p) => `
                    <tr>
                      <td>
                        <div style="font-weight:700; color:var(--primary);">${escapeHtml(p.title)}</div>
                        <div style="font-size:12px; color:var(--text-muted);">${escapeHtml(p.locality)}, ${escapeHtml(p.city)}</div>
                      </td>
                      <td>${escapeHtml(p.category)}</td>
                      <td class="num">${escapeHtml(formatPriceINR(p.price, p.listingType))}</td>
                      <td>
                        <span class="status-label status-${escapeHtml(p.status)}">${escapeHtml(p.status)}</span>
                        ${p.rejectionReason ? `<div style="font-size:11.5px; color:var(--danger);">${escapeHtml(p.rejectionReason)}</div>` : ''}
                      </td>
                      <td>
                        <div style="display:flex; gap:8px;">
                          <a href="./add-property.html?edit=${encodeURIComponent(p.id)}" class="btn btn-outline btn-sm">Edit</a>
                          <button type="button" class="btn btn-danger btn-sm" data-delete-prop="${escapeHtml(p.id)}">Delete</button>
                        </div>
                      </td>
                    </tr>
                  `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        `;

        root.querySelectorAll('[data-delete-prop]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-delete-prop');
            const target = list.find((item) => item.id === id);
            try {
              if (target && Array.isArray(target.images)) {
                await Promise.all(target.images.map((img) => deleteStorageFile(img.path)));
              }
              await deletePropertyRecord(id);
              showToast('Property deleted.', 'success');
              renderMyProperties();
            } catch (err) {
              showToast(err.message, 'error');
            }
          });
        });
      } catch (err) {
        root.innerHTML = `<div class="state-box"><h3>Error</h3><p>${escapeHtml(err.message)}</p></div>`;
      }
    }

    async function renderFavoritesTab() {
      root.innerHTML = `<div class="panel"><p>Loading saved favourites...</p></div>`;
      try {
        const favs = await loadFavoritePropertiesList(uid);
        if (!favs.length) {
          root.innerHTML = `<div class="state-box"><h3>No saved properties</h3><p>Explore listings and tap the heart icon to save them here.</p><a href="./search.html" class="btn btn-primary">Explore Properties</a></div>`;
          return;
        }
        root.innerHTML = `<h2 style="font-size:20px; color:var(--primary); margin-bottom:16px;">My Favourites (${favs.length})</h2><div class="grid-2" id="dash-fav-grid"></div>`;
        const grid = document.getElementById('dash-fav-grid');
        grid.innerHTML = favs.map(createPropertyCardHtml).join('');
        bindPropertyCardActions(grid);
      } catch (err) {
        root.innerHTML = `<div class="state-box"><h3>Error</h3><p>${escapeHtml(err.message)}</p></div>`;
      }
    }

    function renderRecentTab() {
      const recent = getRecentlyViewed();
      if (!recent.length) {
        root.innerHTML = `<div class="state-box"><h3>No recently viewed properties</h3><p>Properties you view will appear here for quick access.</p><a href="./search.html" class="btn btn-primary">Browse Listings</a></div>`;
        return;
      }
      root.innerHTML = `<h2 style="font-size:20px; color:var(--primary); margin-bottom:16px;">Recently Viewed</h2><div class="grid-2" id="dash-recent-grid"></div>`;
      const grid = document.getElementById('dash-recent-grid');
      grid.innerHTML = recent.map(createPropertyCardHtml).join('');
      bindPropertyCardActions(grid);
    }

    async function renderInquiriesTab() {
      root.innerHTML = `<div class="panel"><p>Loading inquiries...</p></div>`;
      try {
        const data = await loadUserInquiries(uid);
        root.innerHTML = `<div id="dash-inq-box"></div>`;
        renderInquiriesSection(document.getElementById('dash-inq-box'), data, renderInquiriesTab);
      } catch (err) {
        root.innerHTML = `<div class="state-box"><h3>Error</h3><p>${escapeHtml(err.message)}</p></div>`;
      }
    }

    async function renderRentalsTab() {
      root.innerHTML = `<div class="panel"><p>Loading rental management...</p></div>`;
      try {
        const [myProps, contracts, payments] = await Promise.all([
          getOwnerProperties(uid),
          getUserRentalContracts(uid),
          getRentalPaymentsForUser(uid),
        ]);

        const rentableProps = myProps.filter((p) => p.listingType === 'rent' || p.listingType === 'pg');

        root.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:24px;">
            <div class="panel">
              <h2 style="font-size:19px; color:var(--primary); margin-bottom:14px;">Create Rental Lease Agreement</h2>
              <form id="create-contract-form" class="form-grid">
                <div class="form-field">
                  <label class="form-label" for="rc-prop">Property</label>
                  <select class="form-select" id="rc-prop" required>
                    ${
                      rentableProps.length
                        ? rentableProps.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.title)} (${escapeHtml(p.city)})</option>`).join('')
                        : myProps.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.title)} (${escapeHtml(p.city)})</option>`).join('')
                    }
                  </select>
                </div>
                <div class="form-field">
                  <label class="form-label" for="rc-tenant-name">Tenant Name</label>
                  <input class="form-control" id="rc-tenant-name" required placeholder="Full name" />
                </div>
                <div class="form-field">
                  <label class="form-label" for="rc-tenant-uid">Tenant User UID (optional)</label>
                  <input class="form-control" id="rc-tenant-uid" placeholder="Firebase UID for tenant portal sync" />
                </div>
                <div class="form-field">
                  <label class="form-label" for="rc-tenant-phone">Tenant Phone</label>
                  <input class="form-control" id="rc-tenant-phone" required placeholder="+91 ..." />
                </div>
                <div class="form-field">
                  <label class="form-label" for="rc-rent">Monthly Rent (₹)</label>
                  <input type="number" class="form-control" id="rc-rent" required min="100" />
                </div>
                <div class="form-field">
                  <label class="form-label" for="rc-deposit">Security Deposit (₹)</label>
                  <input type="number" class="form-control" id="rc-deposit" required min="0" />
                </div>
                <div class="form-field">
                  <label class="form-label" for="rc-start">Lease Start Date</label>
                  <input type="date" class="form-control" id="rc-start" required />
                </div>
                <div class="form-field">
                  <label class="form-label" for="rc-end">Lease End Date</label>
                  <input type="date" class="form-control" id="rc-end" required />
                </div>
                <div class="form-field full">
                  <button type="submit" class="btn btn-primary" ${myProps.length ? '' : 'disabled'}>Save Rental Contract</button>
                  ${myProps.length ? '' : '<span class="form-hint">Add a property first to attach a rental contract.</span>'}
                </div>
              </form>
            </div>

            <div class="panel">
              <h2 style="font-size:19px; color:var(--primary); margin-bottom:12px;">Active &amp; Upcoming Rental Contracts (${contracts.length})</h2>
              ${
                contracts.length
                  ? `<div class="table-wrap">
                      <table class="data-table">
                        <thead>
                          <tr>
                            <th>Property &amp; Tenant</th>
                            <th class="num">Monthly Rent</th>
                            <th class="num">Deposit</th>
                            <th>Term</th>
                            <th>Status</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${contracts
                            .map(
                              (c) => `
                              <tr>
                                <td>
                                  <div style="font-weight:700;">${escapeHtml(c.propertyTitle)}</div>
                                  <div style="font-size:12px; color:var(--text-muted);">Tenant: ${escapeHtml(c.tenantName)} · ${escapeHtml(c.tenantPhone)}</div>
                                </td>
                                <td class="num">₹${Number(c.monthlyRent).toLocaleString('en-IN')}</td>
                                <td class="num">₹${Number(c.securityDeposit).toLocaleString('en-IN')}</td>
                                <td class="tabular-nums">${escapeHtml(c.startDate)} → ${escapeHtml(c.endDate)}</td>
                                <td><span class="status-label">${escapeHtml(c.status)}</span></td>
                                <td>
                                  <div style="display:flex; gap:6px; flex-wrap:wrap;">
                                    <button type="button" class="btn btn-outline btn-sm" data-renew-contract="${escapeHtml(c.id)}">Request Renewal</button>
                                    <button type="button" class="btn btn-secondary btn-sm" data-log-payment="${escapeHtml(c.id)}">Record Rent Due</button>
                                  </div>
                                </td>
                              </tr>
                            `
                            )
                            .join('')}
                        </tbody>
                      </table>
                    </div>`
                  : `<p style="color:var(--text-secondary); font-size:14px;">No rental contracts created yet.</p>`
              }
            </div>

            <div class="panel">
              <h2 style="font-size:19px; color:var(--primary); margin-bottom:6px;">Rent Payment Records (${payments.length})</h2>
              <p class="form-hint" style="margin-bottom:12px;">Payments remain marked "awaiting_verification" until confirmed by a verified payment gateway transaction reference through Cloud Functions.</p>
              ${
                payments.length
                  ? `<div class="table-wrap">
                      <table class="data-table">
                        <thead>
                          <tr>
                            <th>Period</th>
                            <th class="num">Amount</th>
                            <th>Gateway Ref</th>
                            <th>Status</th>
                            <th>Due Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${payments
                            .map(
                              (pay) => `
                              <tr>
                                <td>${escapeHtml(pay.periodMonth || 'Monthly Rent')}</td>
                                <td class="num">₹${Number(pay.amount).toLocaleString('en-IN')}</td>
                                <td class="tabular-nums">${escapeHtml(pay.gatewayTransactionId || 'Pending Gateway Confirmation')}</td>
                                <td><span class="status-label">${escapeHtml(pay.status)}</span></td>
                                <td class="tabular-nums">${escapeHtml(pay.dueDate)}</td>
                              </tr>
                            `
                            )
                            .join('')}
                        </tbody>
                      </table>
                    </div>`
                  : `<p style="color:var(--text-secondary); font-size:14px;">No rent payment records logged yet.</p>`
              }
            </div>
          </div>
        `;

        document.getElementById('create-contract-form')?.addEventListener('submit', async (e) => {
          e.preventDefault();
          const propId = document.getElementById('rc-prop').value;
          const propObj = myProps.find((p) => p.id === propId);
          try {
            await createRentalContract({
              propertyId: propId,
              propertyTitle: propObj?.title || 'Rental Property',
              ownerId: uid,
              ownerName: profile.name || state.user.email,
              tenantId: document.getElementById('rc-tenant-uid').value.trim(),
              tenantName: document.getElementById('rc-tenant-name').value,
              tenantPhone: document.getElementById('rc-tenant-phone').value,
              monthlyRent: document.getElementById('rc-rent').value,
              securityDeposit: document.getElementById('rc-deposit').value,
              startDate: document.getElementById('rc-start').value,
              endDate: document.getElementById('rc-end').value,
            });
            showToast('Rental contract saved and property marked rented.', 'success');
            renderRentalsTab();
          } catch (err) {
            showToast(err.message, 'error');
          }
        });

        root.querySelectorAll('[data-renew-contract]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            await updateRentalContract(btn.getAttribute('data-renew-contract'), {
              status: 'renewal_requested',
            });
            showToast('Rental renewal requested.', 'success');
            renderRentalsTab();
          });
        });

        root.querySelectorAll('[data-log-payment]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const cId = btn.getAttribute('data-log-payment');
            const c = contracts.find((item) => item.id === cId);
            if (!c) return;
            await createPendingRentPayment({
              contractId: c.id,
              ownerId: c.ownerId,
              tenantId: c.tenantId,
              amount: c.monthlyRent,
              dueDate: new Date().toISOString().slice(0, 10),
              periodMonth: new Date().toLocaleString('en-IN', { month: 'short', year: 'numeric' }),
            });
            showToast('Rent invoice logged as awaiting_verification until gateway confirmation.', 'info');
            renderRentalsTab();
          });
        });
      } catch (err) {
        root.innerHTML = `<div class="state-box"><h3>Error</h3><p>${escapeHtml(err.message)}</p></div>`;
      }
    }

    async function renderVerificationTab() {
      root.innerHTML = `<div class="panel"><p>Loading verification status...</p></div>`;
      try {
        const req = await getUserVerificationRequest(uid);
        root.innerHTML = `
          <div class="panel">
            <h2 style="font-size:20px; color:var(--primary); margin-bottom:6px;">Owner &amp; Property Document Verification</h2>
            <p class="form-hint" style="margin-bottom:18px;">
              Documents are uploaded to private Firebase Storage (<code>verification-documents/${escapeHtml(uid)}/</code>) and are never exposed in public property listings.
            </p>
            ${
              req
                ? `<div style="padding:14px; border:1px solid var(--border); border-radius:var(--radius-sm); margin-bottom:20px; background:var(--bg-page);">
                     <strong>Current Status:</strong> <span class="status-label status-${escapeHtml(req.status)}">${escapeHtml(req.status)}</span>
                     ${req.reviewNotes ? `<div style="font-size:13px; color:var(--text-secondary); margin-top:4px;">Reviewer Notes: ${escapeHtml(req.reviewNotes)}</div>` : ''}
                   </div>`
                : ''
            }
            <form id="verification-submit-form" class="form-grid">
              <div class="form-field">
                <label class="form-label" for="ver-name">Legal Full Name</label>
                <input class="form-control" id="ver-name" required value="${escapeHtml(profile.name || '')}" />
              </div>
              <div class="form-field">
                <label class="form-label" for="ver-id-type">Identity Document Type</label>
                <select class="form-select" id="ver-id-type">
                  <option value="Aadhaar Card">Aadhaar Card</option>
                  <option value="PAN Card">PAN Card</option>
                  <option value="Passport / Voter ID">Passport / Voter ID</option>
                </select>
              </div>
              <div class="form-field">
                <label class="form-label" for="ver-id-file">Identity Document (PDF/JPG/PNG, max 10MB)</label>
                <input type="file" class="form-control" id="ver-id-file" accept=".pdf,image/*" required />
              </div>
              <div class="form-field">
                <label class="form-label" for="ver-own-file">Property Ownership / Registry / Tax Receipt</label>
                <input type="file" class="form-control" id="ver-own-file" accept=".pdf,image/*" required />
              </div>
              <div class="form-field full">
                <label class="form-label" for="ver-notes">Additional Notes</label>
                <textarea class="form-textarea" id="ver-notes" rows="2" placeholder="Property address or RERA / registry reference..."></textarea>
              </div>
              <div class="form-field full">
                <button type="submit" class="btn btn-primary" id="ver-submit-btn">Submit Private Verification</button>
              </div>
            </form>
          </div>
        `;

        document.getElementById('verification-submit-form')?.addEventListener('submit', async (e) => {
          e.preventDefault();
          const btn = document.getElementById('ver-submit-btn');
          btn.disabled = true;
          try {
            const idFile = document.getElementById('ver-id-file').files[0];
            const ownFile = document.getElementById('ver-own-file').files[0];
            const [idUp, ownUp] = await Promise.all([
              uploadVerificationDocument(uid, 'identity', idFile),
              uploadVerificationDocument(uid, 'ownership', ownFile),
            ]);
            await submitVerificationRequest(uid, {
              fullName: document.getElementById('ver-name').value,
              idType: document.getElementById('ver-id-type').value,
              idDocPath: idUp.path,
              ownershipDocPath: ownUp.path,
              notes: document.getElementById('ver-notes').value,
            });
            showToast('Verification documents submitted securely for admin review.', 'success');
            renderVerificationTab();
          } catch (err) {
            showToast(err.message, 'error');
          } finally {
            btn.disabled = false;
          }
        });
      } catch (err) {
        root.innerHTML = `<div class="state-box"><h3>Error</h3><p>${escapeHtml(err.message)}</p></div>`;
      }
    }

    function renderNotificationsTab() {
      root.innerHTML = `<div class="panel"><h2 style="font-size:20px; color:var(--primary); margin-bottom:14px;">Notifications</h2><div id="dash-notif-list"></div></div>`;
      renderNotificationsList(document.getElementById('dash-notif-list'), uid, getCachedNotifications());
    }

    function renderSettingsTab() {
      root.innerHTML = `
        <div class="panel">
          <h2 style="font-size:20px; color:var(--primary); margin-bottom:14px;">Account Settings</h2>
          <div style="display:flex; flex-direction:column; gap:14px;">
            <div>
              <div class="form-hint">Account Email</div>
              <strong>${escapeHtml(state.user.email)}</strong>
              <span style="font-size:12.5px; color:var(--text-muted); margin-left:8px;">
                (${state.user.emailVerified ? 'Email Verified' : 'Email Not Verified'})
              </span>
            </div>
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
              <a href="./profile.html" class="btn btn-outline">Edit Profile &amp; Photo</a>
              <button type="button" class="btn btn-outline" id="dash-reset-pw-btn">Send Password Reset Email</button>
              <button type="button" class="btn btn-danger" onclick="window.sksarsLogout()">Sign Out</button>
            </div>
          </div>
        </div>
      `;

      document.getElementById('dash-reset-pw-btn')?.addEventListener('click', async () => {
        try {
          await resetPassword(state.user.email);
          showToast('Password reset link sent to your email.', 'success');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

    const initialHash = window.location.hash.replace('#', '');
    switchTab(initialHash || 'overview');
  });
}
