import {
  getAdminOverviewData,
  adminUpdateProperty,
  deletePropertyRecord,
  adminUpdateVerification,
  adminUpdateReport,
  adminSaveSettings,
  seedMpCitiesToDb,
  addCity,
  addLocality,
  getCities,
  MP_CITIES_DATA,
  PROPERTY_CATEGORIES,
  escapeHtml,
  formatPriceINR,
  formatDate,
} from './database.js';
import { getAuthorizedDocUrl } from './storage.js';
import { onAuthReady, showToast } from '../app.js';

export function initAdminPage() {
  const root = document.getElementById('admin-main-view');
  if (!root) return;

  onAuthReady(async (state) => {
    if (!state.user) {
      root.innerHTML = `
        <div class="state-box">
          <h3>Admin Authentication Required</h3>
          <p>Sign in with an authorized administrator account carrying the Firebase custom claim <code>admin: true</code>.</p>
          <a href="./login.html" class="btn btn-primary">Admin Sign In</a>
        </div>
      `;
      return;
    }

    if (!state.isAdmin) {
      root.innerHTML = `
        <div class="state-box">
          <h3>Access Restricted</h3>
          <p>Your account does not hold the trusted Firebase Auth custom claim <code>admin: true</code>. Frontend role values are never trusted for admin privileges.</p>
          <a href="./dashboard.html" class="btn btn-outline">Return to User Dashboard</a>
        </div>
      `;
      return;
    }

    let adminData = null;
    const navButtons = document.querySelectorAll('[data-admin-tab]');

    async function loadAndRender(tabKey = 'stats') {
      root.innerHTML = `<div class="panel"><p>Loading admin console data...</p></div>`;
      try {
        adminData = await getAdminOverviewData();
        renderTab(tabKey);
      } catch (err) {
        root.innerHTML = `<div class="state-box"><h3>Failed to load admin data</h3><p>${escapeHtml(err.message)}</p></div>`;
      }
    }

    function renderTab(tabKey) {
      navButtons.forEach((b) => b.classList.toggle('active', b.getAttribute('data-admin-tab') === tabKey));
      if (!adminData) return;

      const { users, properties, inquiries, reports, verificationRequests, settings } = adminData;

      if (tabKey === 'stats') {
        const pendingCount = properties.filter((p) => p.status === 'pending').length;
        const approvedCount = properties.filter((p) => p.status === 'approved').length;
        const rejectedCount = properties.filter((p) => p.status === 'rejected').length;

        root.innerHTML = `
          <h1 style="font-size:24px; color:var(--primary); margin-bottom:18px;">Admin Dashboard Overview</h1>
          <div class="kpi-grid">
            <div class="kpi-box"><div class="kpi-label">Total Users</div><div class="kpi-value tabular-nums">${users.length}</div></div>
            <div class="kpi-box"><div class="kpi-label">Total Properties</div><div class="kpi-value tabular-nums">${properties.length}</div></div>
            <div class="kpi-box"><div class="kpi-label">Pending Approval</div><div class="kpi-value tabular-nums">${pendingCount}</div></div>
            <div class="kpi-box"><div class="kpi-label">Approved Listings</div><div class="kpi-value tabular-nums">${approvedCount}</div></div>
            <div class="kpi-box"><div class="kpi-label">Rejected Listings</div><div class="kpi-value tabular-nums">${rejectedCount}</div></div>
            <div class="kpi-box"><div class="kpi-label">Open Reports</div><div class="kpi-value tabular-nums">${reports.filter((r) => r.status === 'open').length}</div></div>
            <div class="kpi-box"><div class="kpi-label">Pending Verifications</div><div class="kpi-value tabular-nums">${verificationRequests.filter((v) => v.status === 'pending').length}</div></div>
            <div class="kpi-box"><div class="kpi-label">Total Inquiries</div><div class="kpi-value tabular-nums">${inquiries.length}</div></div>
          </div>
          <div class="panel">
            <h2 style="font-size:18px; color:var(--primary); margin-bottom:8px;">Madhya Pradesh Location Sync</h2>
            <p style="font-size:13.5px; color:var(--text-secondary); margin-bottom:14px;">Sync all 16 Madhya Pradesh cities and curated localities into Realtime Database.</p>
            <button type="button" class="btn btn-primary btn-sm" id="seed-mp-btn">Sync 16 MP Cities &amp; Localities</button>
          </div>
        `;
        document.getElementById('seed-mp-btn')?.addEventListener('click', async () => {
          await seedMpCitiesToDb();
          showToast('16 Madhya Pradesh cities and localities synced to Firebase.', 'success');
        });
      } else if (tabKey === 'properties') {
        root.innerHTML = `
          <h2 style="font-size:20px; color:var(--primary); margin-bottom:14px;">Moderate &amp; Feature Properties (${properties.length})</h2>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Listing</th>
                  <th>City / Locality</th>
                  <th class="num">Price</th>
                  <th>Status</th>
                  <th>Moderation Actions</th>
                </tr>
              </thead>
              <tbody>
                ${properties
                  .map(
                    (p) => `
                    <tr>
                      <td>
                        <div style="font-weight:700;">${escapeHtml(p.title)}</div>
                        <div style="font-size:12px; color:var(--text-muted);">${escapeHtml(p.ownerName || p.ownerId)} · ${p.verified ? 'Verified' : 'Unverified'} · ${p.featured ? 'Featured' : 'Standard'}</div>
                      </td>
                      <td>${escapeHtml(p.city)}<br><span style="font-size:12px; color:var(--text-muted);">${escapeHtml(p.locality)}</span></td>
                      <td class="num">${escapeHtml(formatPriceINR(p.price, p.listingType))}</td>
                      <td><span class="status-label status-${escapeHtml(p.status)}">${escapeHtml(p.status)}</span></td>
                      <td>
                        <div style="display:flex; gap:6px; flex-wrap:wrap;">
                          <button type="button" class="btn btn-primary btn-sm" data-mod-approve="${escapeHtml(p.id)}">Approve</button>
                          <button type="button" class="btn btn-outline btn-sm" data-mod-reject="${escapeHtml(p.id)}">Reject</button>
                          <button type="button" class="btn btn-outline btn-sm" data-mod-verify="${escapeHtml(p.id)}">${p.verified ? 'Unverify' : 'Verify'}</button>
                          <button type="button" class="btn btn-secondary btn-sm" data-mod-feature="${escapeHtml(p.id)}">${p.featured ? 'Unfeature' : 'Feature'}</button>
                          <button type="button" class="btn btn-danger btn-sm" data-mod-delete="${escapeHtml(p.id)}">Delete</button>
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

        root.querySelectorAll('[data-mod-approve]').forEach((b) =>
          b.addEventListener('click', async () => {
            await adminUpdateProperty(b.getAttribute('data-mod-approve'), { status: 'approved', rejectionReason: null });
            showToast('Listing approved.', 'success');
            loadAndRender('properties');
          })
        );
        root.querySelectorAll('[data-mod-reject]').forEach((b) =>
          b.addEventListener('click', async () => {
            await adminUpdateProperty(b.getAttribute('data-mod-reject'), {
              status: 'rejected',
              rejectionReason: 'Incomplete details or verification required.',
            });
            showToast('Listing rejected.', 'warning');
            loadAndRender('properties');
          })
        );
        root.querySelectorAll('[data-mod-verify]').forEach((b) =>
          b.addEventListener('click', async () => {
            const id = b.getAttribute('data-mod-verify');
            const p = properties.find((x) => x.id === id);
            await adminUpdateProperty(id, { verified: !p?.verified });
            showToast('Verification badge updated.', 'success');
            loadAndRender('properties');
          })
        );
        root.querySelectorAll('[data-mod-feature]').forEach((b) =>
          b.addEventListener('click', async () => {
            const id = b.getAttribute('data-mod-feature');
            const p = properties.find((x) => x.id === id);
            await adminUpdateProperty(id, { featured: !p?.featured });
            showToast('Featured status updated.', 'success');
            loadAndRender('properties');
          })
        );
        root.querySelectorAll('[data-mod-delete]').forEach((b) =>
          b.addEventListener('click', async () => {
            await deletePropertyRecord(b.getAttribute('data-mod-delete'));
            showToast('Listing permanently deleted.', 'success');
            loadAndRender('properties');
          })
        );
      } else if (tabKey === 'verifications') {
        root.innerHTML = `
          <h2 style="font-size:20px; color:var(--primary); margin-bottom:14px;">Owner &amp; Property Verification Queue (${verificationRequests.length})</h2>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Applicant</th>
                  <th>Document Type</th>
                  <th>Private Documents</th>
                  <th>Status</th>
                  <th>Decision</th>
                </tr>
              </thead>
              <tbody>
                ${verificationRequests
                  .map(
                    (v) => `
                    <tr>
                      <td><strong>${escapeHtml(v.fullName)}</strong><br><span style="font-size:12px; color:var(--text-muted);">${escapeHtml(v.uid)}</span></td>
                      <td>${escapeHtml(v.idType)}</td>
                      <td>
                        <div style="display:flex; gap:6px;">
                          <button type="button" class="btn btn-outline btn-sm" data-view-doc="${escapeHtml(v.idDocPath)}">ID Doc</button>
                          <button type="button" class="btn btn-outline btn-sm" data-view-doc="${escapeHtml(v.ownershipDocPath)}">Ownership Doc</button>
                        </div>
                      </td>
                      <td><span class="status-label status-${escapeHtml(v.status)}">${escapeHtml(v.status)}</span></td>
                      <td>
                        <div style="display:flex; gap:6px;">
                          <button type="button" class="btn btn-primary btn-sm" data-ver-approve="${escapeHtml(v.uid)}">Approve</button>
                          <button type="button" class="btn btn-danger btn-sm" data-ver-reject="${escapeHtml(v.uid)}">Reject</button>
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

        root.querySelectorAll('[data-view-doc]').forEach((b) =>
          b.addEventListener('click', async () => {
            try {
              const url = await getAuthorizedDocUrl(b.getAttribute('data-view-doc'));
              const modal = document.getElementById('doc-preview-modal');
              const body = document.getElementById('doc-preview-body');
              body.innerHTML = `<p style="font-size:13px;">Authorized download link ready:</p><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">Open Private Document</a>`;
              modal.classList.add('open');
            } catch (err) {
              showToast(err.message, 'error');
            }
          })
        );
        root.querySelectorAll('[data-ver-approve]').forEach((b) =>
          b.addEventListener('click', async () => {
            await adminUpdateVerification(b.getAttribute('data-ver-approve'), 'approved', 'Verified by Admin');
            showToast('Owner verified.', 'success');
            loadAndRender('verifications');
          })
        );
        root.querySelectorAll('[data-ver-reject]').forEach((b) =>
          b.addEventListener('click', async () => {
            await adminUpdateVerification(b.getAttribute('data-ver-reject'), 'rejected', 'Documents unclear; please re-upload.');
            showToast('Verification rejected.', 'warning');
            loadAndRender('verifications');
          })
        );
      } else if (tabKey === 'users') {
        root.innerHTML = `
          <h2 style="font-size:20px; color:var(--primary); margin-bottom:14px;">Manage Users, Owners &amp; Agents (${users.length})</h2>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Verified</th><th>Joined</th></tr>
              </thead>
              <tbody>
                ${users
                  .map(
                    (u) => `
                    <tr>
                      <td><strong>${escapeHtml(u.name)}</strong></td>
                      <td>${escapeHtml(u.email)}</td>
                      <td>${escapeHtml(u.phone || '—')}</td>
                      <td>${escapeHtml(u.role)}</td>
                      <td>${u.verified ? 'Verified' : 'Standard'}</td>
                      <td class="tabular-nums">${formatDate(u.createdAt)}</td>
                    </tr>
                  `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        `;
      } else if (tabKey === 'reports') {
        root.innerHTML = `
          <h2 style="font-size:20px; color:var(--primary); margin-bottom:14px;">Reported Listings (${reports.length})</h2>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Property</th><th>Reason &amp; Details</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                ${reports
                  .map(
                    (r) => `
                    <tr>
                      <td>${escapeHtml(r.propertyTitle || r.propertyId)}</td>
                      <td><strong>${escapeHtml(r.reason)}</strong><div style="font-size:12.5px; color:var(--text-secondary);">${escapeHtml(r.details)}</div></td>
                      <td>${escapeHtml(r.status)}</td>
                      <td>
                        <div style="display:flex; gap:6px;">
                          <button type="button" class="btn btn-outline btn-sm" data-rep-dismiss="${escapeHtml(r.id)}">Dismiss</button>
                          <button type="button" class="btn btn-danger btn-sm" data-rep-del-prop="${escapeHtml(r.propertyId)}" data-rep-id="${escapeHtml(r.id)}">Delete Listing</button>
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
        root.querySelectorAll('[data-rep-dismiss]').forEach((b) =>
          b.addEventListener('click', async () => {
            await adminUpdateReport(b.getAttribute('data-rep-dismiss'), 'dismissed');
            showToast('Report dismissed.', 'info');
            loadAndRender('reports');
          })
        );
        root.querySelectorAll('[data-rep-del-prop]').forEach((b) =>
          b.addEventListener('click', async () => {
            await deletePropertyRecord(b.getAttribute('data-rep-del-prop'));
            await adminUpdateReport(b.getAttribute('data-rep-id'), 'action_taken');
            showToast('Fraudulent listing deleted.', 'success');
            loadAndRender('reports');
          })
        );
      } else if (tabKey === 'locations') {
        getCities().then((cities) => {
          root.innerHTML = `
            <div class="grid-2">
              <div class="panel">
                <h3 style="font-size:18px; color:var(--primary); margin-bottom:12px;">Add New City</h3>
                <form id="admin-add-city-form" style="display:flex; flex-direction:column; gap:10px;">
                  <input class="form-control" id="new-city-name" placeholder="City Name (e.g. Morena)" required />
                  <input type="number" step="0.0001" class="form-control" id="new-city-lat" placeholder="Latitude (e.g. 26.4980)" />
                  <input type="number" step="0.0001" class="form-control" id="new-city-lng" placeholder="Longitude (e.g. 77.9910)" />
                  <button type="submit" class="btn btn-primary btn-sm">Add City</button>
                </form>
              </div>
              <div class="panel">
                <h3 style="font-size:18px; color:var(--primary); margin-bottom:12px;">Add New Locality</h3>
                <form id="admin-add-loc-form" style="display:flex; flex-direction:column; gap:10px;">
                  <select class="form-select" id="loc-city-select">
                    ${cities.map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('')}
                  </select>
                  <input class="form-control" id="new-loc-name" placeholder="Locality Name (e.g. Chunabhatti)" required />
                  <button type="submit" class="btn btn-secondary btn-sm">Add Locality</button>
                </form>
              </div>
            </div>
            <div class="panel" style="margin-top:20px;">
              <h3 style="font-size:18px; color:var(--primary); margin-bottom:10px;">Active Cities (${cities.length}) &amp; Categories (${PROPERTY_CATEGORIES.length})</h3>
              <p style="font-size:13.5px; color:var(--text-secondary);">${cities.map((c) => escapeHtml(c.name)).join(' · ')}</p>
            </div>
          `;
          document.getElementById('admin-add-city-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await addCity({
              name: document.getElementById('new-city-name').value,
              lat: document.getElementById('new-city-lat').value,
              lng: document.getElementById('new-city-lng').value,
            });
            showToast('City added.', 'success');
            renderTab('locations');
          });
          document.getElementById('admin-add-loc-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            await addLocality({
              cityName: document.getElementById('loc-city-select').value,
              name: document.getElementById('new-loc-name').value,
            });
            showToast('Locality added.', 'success');
            renderTab('locations');
          });
        });
      } else if (tabKey === 'inquiries') {
        root.innerHTML = `
          <h2 style="font-size:20px; color:var(--primary); margin-bottom:14px;">All Platform Inquiries (${inquiries.length})</h2>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Property</th><th>Sender</th><th>Message</th><th>Status</th><th>Date</th></tr></thead>
              <tbody>
                ${inquiries
                  .map(
                    (i) => `
                    <tr>
                      <td>${escapeHtml(i.propertyTitle || i.propertyId)}</td>
                      <td>${escapeHtml(i.senderName)}<br><span style="font-size:12px; color:var(--text-muted);">${escapeHtml(i.senderPhone)}</span></td>
                      <td>${escapeHtml(i.message)}</td>
                      <td>${escapeHtml(i.status)}</td>
                      <td class="tabular-nums">${formatDate(i.createdAt)}</td>
                    </tr>
                  `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        `;
      } else if (tabKey === 'settings') {
        const site = settings.site || {};
        root.innerHTML = `
          <div class="panel">
            <h2 style="font-size:20px; color:var(--primary); margin-bottom:14px;">Website Settings</h2>
            <form id="admin-settings-form" class="form-grid">
              <div class="form-field">
                <label class="form-label" for="set-support-email">Support Email</label>
                <input class="form-control" id="set-support-email" value="${escapeHtml(site.supportEmail || 'support@sksarshousing.in')}" />
              </div>
              <div class="form-field">
                <label class="form-label" for="set-support-phone">Support Phone</label>
                <input class="form-control" id="set-support-phone" value="${escapeHtml(site.supportPhone || '+91 755 000 0000')}" />
              </div>
              <div class="form-field full">
                <label class="form-label" for="set-announcement">Homepage Notice (Optional)</label>
                <input class="form-control" id="set-announcement" value="${escapeHtml(site.announcement || '')}" />
              </div>
              <div class="form-field full">
                <button type="submit" class="btn btn-primary">Save Settings</button>
              </div>
            </form>
          </div>
        `;
        document.getElementById('admin-settings-form')?.addEventListener('submit', async (e) => {
          e.preventDefault();
          await adminSaveSettings({
            supportEmail: document.getElementById('set-support-email').value,
            supportPhone: document.getElementById('set-support-phone').value,
            announcement: document.getElementById('set-announcement').value,
          });
          showToast('Website settings updated.', 'success');
        });
      }
    }

    navButtons.forEach((b) => {
      b.addEventListener('click', () => renderTab(b.getAttribute('data-admin-tab')));
    });

    await loadAndRender('stats');
  });
}
