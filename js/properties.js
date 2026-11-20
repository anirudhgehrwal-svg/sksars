import {
  escapeHtml,
  formatPriceINR,
  getFallbackImageByCategory,
  getPropertyById,
  getApprovedProperties,
  saveProperty,
  createPropertyReport,
  getLocalitiesByCity,
  MP_CITIES_DATA,
  PROPERTY_CATEGORIES,
} from './database.js';
import { uploadPropertyImages } from './storage.js';
import { handleFavoriteToggle, isFavorited } from './favorites.js';
import { submitPropertyInquiry, buildWhatsAppInquiryLink } from './inquiries.js';
import { renderPropertyDetailMap, initCoordinatePicker } from './maps.js';
import { APP_STATE, showToast, openModal, closeModal, recordRecentlyViewed } from '../app.js';

function getDetailsHref(propertyId) {
  const prefix = window.location.pathname.includes('/pages/') ? './' : './pages/';
  return `${prefix}property-details.html?id=${encodeURIComponent(propertyId)}`;
}

export function renderSkeletonCards(container, count = 3) {
  if (!container) return;
  container.innerHTML = Array.from({ length: count })
    .map(
      () => `
      <div class="property-card" aria-hidden="true">
        <div class="property-thumb skeleton"></div>
        <div class="property-body">
          <div class="skeleton" style="height:14px; width:55%;"></div>
          <div class="skeleton" style="height:20px; width:85%;"></div>
          <div class="skeleton" style="height:14px; width:65%;"></div>
          <div class="skeleton" style="height:24px; width:40%;"></div>
        </div>
      </div>
    `
    )
    .join('');
}

export function createPropertyCardHtml(prop) {
  const imageSrc =
    (Array.isArray(prop.images) && prop.images[0]?.url) ||
    (Array.isArray(prop.images) && typeof prop.images[0] === 'string' && prop.images[0]) ||
    getFallbackImageByCategory(prop.category);
  const faved = isFavorited(prop.id);
  const priceLabel = formatPriceINR(prop.price, prop.listingType);
  const roleLabel = prop.postedByRole === 'agent' ? 'Agent' : 'Owner';
  const area = Number(prop.carpetArea || prop.builtUpArea || 0);

  return `
    <article class="property-card" data-property-id="${escapeHtml(prop.id)}">
      <div class="property-thumb">
        <img
          src="${escapeHtml(imageSrc)}"
          alt="${escapeHtml(prop.title)}"
          loading="lazy"
          referrerpolicy="no-referrer"
          onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
        />
        <div class="img-fallback" style="display:none;">
          <span>${escapeHtml(prop.category || 'Property')}</span>
          <span style="font-size:12px; color:var(--text-muted);">${escapeHtml(prop.city || '')}</span>
        </div>
        <button
          type="button"
          class="fav-btn ${faved ? 'active' : ''}"
          data-fav-toggle="${escapeHtml(prop.id)}"
          aria-label="Toggle favourite"
          aria-pressed="${faved ? 'true' : 'false'}"
        >${faved ? '♥' : '♡'}</button>
      </div>
      <div class="property-body">
        <div class="property-meta-line">
          <span>${escapeHtml(prop.category || 'Residential')}</span>
          <span aria-hidden="true">·</span>
          <span>${escapeHtml(roleLabel)}</span>
          ${
            prop.verified
              ? `<span aria-hidden="true">·</span><span class="verified-text">Verified</span>`
              : ''
          }
        </div>
        <h3 class="property-title">
          <a href="${getDetailsHref(prop.id)}">${escapeHtml(prop.title)}</a>
        </h3>
        <div class="property-location">${escapeHtml(prop.locality || '')}, ${escapeHtml(prop.city || '')}</div>
        <div class="property-price-row">
          <div class="property-price tabular-nums">${escapeHtml(priceLabel)}</div>
          <span style="font-size:12px; color:var(--text-muted);">${escapeHtml(prop.furnishing || '')}</span>
        </div>
        <div class="property-specs">
          ${prop.bhk ? `<span>${escapeHtml(prop.bhk)} BHK</span><span aria-hidden="true">·</span>` : ''}
          ${prop.bathrooms ? `<span>${escapeHtml(prop.bathrooms)} Bath</span><span aria-hidden="true">·</span>` : ''}
          <span class="tabular-nums">${area ? `${area.toLocaleString('en-IN')} sq.ft.` : 'Area on request'}</span>
        </div>
        <div class="property-footer">
          <span style="font-size:12px; color:var(--text-muted);">${escapeHtml(prop.possessionStatus || 'Ready to Move')}</span>
          <a href="${getDetailsHref(prop.id)}" class="btn btn-primary btn-sm">View Details</a>
        </div>
      </div>
    </article>
  `;
}

export function bindPropertyCardActions(root = document) {
  root.querySelectorAll('[data-fav-toggle]').forEach((btn) => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = 'true';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.getAttribute('data-fav-toggle');
      handleFavoriteToggle(id, btn);
    });
  });
}

/* ==================== PROPERTY DETAILS PAGE ==================== */

export async function initPropertyDetailsPage() {
  const container = document.getElementById('property-details-root');
  if (!container) return;

  const params = new URLSearchParams(window.location.search);
  const propertyId = params.get('id');
  if (!propertyId) {
    container.innerHTML = `<div class="state-box"><h3>Property not specified</h3><p>Select a property from Search to view full specifications.</p><a href="./search.html" class="btn btn-primary">Browse Properties</a></div>`;
    return;
  }

  try {
    const property = await getPropertyById(propertyId);
    if (!property) {
      container.innerHTML = `<div class="state-box"><h3>Listing unavailable</h3><p>This property may have been removed or is awaiting approval.</p><a href="./search.html" class="btn btn-primary">Browse Properties</a></div>`;
      return;
    }

    recordRecentlyViewed(property);

    const images =
      Array.isArray(property.images) && property.images.length > 0
        ? property.images.map((img) => (typeof img === 'string' ? img : img.url)).filter(Boolean)
        : [getFallbackImageByCategory(property.category)];

    const area = Number(property.carpetArea || property.builtUpArea || 0);
    const pricePerSqft = area > 0 && property.price > 0 ? Math.round(property.price / area) : 0;
    const whatsappHref = buildWhatsAppInquiryLink(property);
    const faved = isFavorited(property.id);

    container.innerHTML = `
      <div style="margin-bottom:20px; font-size:13px; color:var(--text-muted);">
        <a href="../index.html">Home</a> / <a href="./search.html?city=${encodeURIComponent(property.city || '')}">${escapeHtml(property.city || 'MP')}</a> / <span>${escapeHtml(property.locality || '')}</span>
      </div>

      <div class="grid-2" style="grid-template-columns: 1.4fr 0.9fr; align-items:start;">
        <div>
          <div class="gallery-main" id="gallery-main-box">
            <img id="gallery-active-img" src="${escapeHtml(images[0])}" alt="${escapeHtml(property.title)}" referrerpolicy="no-referrer" />
            ${
              images.length > 1
                ? `<button type="button" class="gallery-nav-btn gallery-prev" id="gal-prev" aria-label="Previous image">&lsaquo;</button>
                   <button type="button" class="gallery-nav-btn gallery-next" id="gal-next" aria-label="Next image">&rsaquo;</button>`
                : ''
            }
          </div>
          ${
            images.length > 1
              ? `<div class="gallery-thumbs">
                  ${images
                    .map(
                      (src, idx) => `
                      <button type="button" class="gallery-thumb ${idx === 0 ? 'active' : ''}" data-gal-idx="${idx}">
                        <img src="${escapeHtml(src)}" alt="Photo ${idx + 1}" referrerpolicy="no-referrer" />
                      </button>
                    `
                    )
                    .join('')}
                </div>`
              : ''
          }

          <div class="panel" style="margin-top:24px;">
            <div class="property-meta-line" style="margin-bottom:8px;">
              <span>${escapeHtml(property.category)}</span>
              <span>·</span>
              <span>${escapeHtml(String(property.listingType || '').toUpperCase())}</span>
              <span>·</span>
              <span>${escapeHtml(property.possessionStatus || 'Ready to Move')}</span>
              ${property.verified ? `<span>·</span><span class="verified-text">Verified Property</span>` : ''}
            </div>
            <h1 style="font-size:28px; color:var(--primary); margin-bottom:8px;">${escapeHtml(property.title)}</h1>
            <p style="color:var(--text-secondary); margin:0 0 18px;">${escapeHtml(property.address || `${property.locality}, ${property.city}, Madhya Pradesh`)}</p>

            <h2 style="font-size:18px; margin-bottom:10px;">Overview &amp; Description</h2>
            <p style="color:var(--text-secondary); white-space:pre-line;">${escapeHtml(property.description || 'Well-maintained property in a prime Madhya Pradesh neighbourhood.')}</p>

            <h2 style="font-size:18px; margin:24px 0 12px;">Specifications</h2>
            <div class="grid-3" style="gap:14px;">
              <div><div class="form-hint">Bedrooms</div><strong class="tabular-nums">${escapeHtml(property.bhk || '—')} BHK</strong></div>
              <div><div class="form-hint">Bathrooms</div><strong class="tabular-nums">${escapeHtml(property.bathrooms || '—')}</strong></div>
              <div><div class="form-hint">Balconies</div><strong class="tabular-nums">${escapeHtml(property.balconies ?? '—')}</strong></div>
              <div><div class="form-hint">Carpet Area</div><strong class="tabular-nums">${property.carpetArea ? `${Number(property.carpetArea).toLocaleString('en-IN')} sq.ft.` : '—'}</strong></div>
              <div><div class="form-hint">Built-up Area</div><strong class="tabular-nums">${property.builtUpArea ? `${Number(property.builtUpArea).toLocaleString('en-IN')} sq.ft.` : '—'}</strong></div>
              <div><div class="form-hint">Furnishing</div><strong>${escapeHtml(property.furnishing || '—')}</strong></div>
              <div><div class="form-hint">Floor / Total Floors</div><strong class="tabular-nums">${escapeHtml(property.floorNumber ?? 0)} / ${escapeHtml(property.totalFloors ?? 1)}</strong></div>
              <div><div class="form-hint">Property Age</div><strong>${escapeHtml(property.propertyAge || '—')}</strong></div>
              <div><div class="form-hint">Facing Direction</div><strong>${escapeHtml(property.facing || '—')}</strong></div>
              <div><div class="form-hint">Parking</div><strong>${escapeHtml(property.parking || '—')}</strong></div>
              <div><div class="form-hint">Security Deposit</div><strong class="tabular-nums">${property.securityDeposit ? formatPriceINR(property.securityDeposit, 'buy') : '—'}</strong></div>
              <div><div class="form-hint">Maintenance</div><strong class="tabular-nums">${property.maintenanceCharges ? `₹${Number(property.maintenanceCharges).toLocaleString('en-IN')}/mo` : '—'}</strong></div>
            </div>

            <h2 style="font-size:18px; margin:24px 0 12px;">Amenities</h2>
            <div style="display:flex; flex-wrap:wrap; gap:10px; font-size:13.5px; color:var(--text-secondary);">
              ${
                Array.isArray(property.amenities) && property.amenities.length
                  ? property.amenities.map((a) => `<span>&bull; ${escapeHtml(a)}</span>`).join('')
                  : '<span>Standard residential utilities included</span>'
              }
            </div>
          </div>

          <div class="panel" style="margin-top:24px;">
            <h2 style="font-size:18px; margin-bottom:12px;">Location &amp; Nearby Facilities</h2>
            <div id="detail-map-box" class="map-box"></div>
            <div id="detail-nearby-list" style="margin-top:16px;">
              <p style="font-size:13px; color:var(--text-muted);">Loading nearby schools, hospitals, markets, and transit...</p>
            </div>
          </div>
        </div>

        <aside style="position:sticky; top:88px; display:flex; flex-direction:column; gap:20px;">
          <div class="panel">
            <div style="font-size:13px; color:var(--text-muted);">${property.listingType === 'rent' || property.listingType === 'pg' ? 'Monthly Rent' : 'Expected Price'}</div>
            <div style="font-size:30px; font-weight:800; color:var(--primary);" class="tabular-nums">
              ${escapeHtml(formatPriceINR(property.price, property.listingType))}
            </div>
            ${
              pricePerSqft > 0 && property.listingType !== 'rent'
                ? `<div style="font-size:13px; color:var(--text-secondary); margin-bottom:16px;" class="tabular-nums">₹${pricePerSqft.toLocaleString('en-IN')} / sq.ft.</div>`
                : '<div style="margin-bottom:16px;"></div>'
            }

            <div style="border-top:1px solid var(--border); padding-top:14px; margin-bottom:16px;">
              <div style="font-size:12px; color:var(--text-muted);">Listed by ${escapeHtml(property.postedByRole === 'agent' ? 'Authorized Agent' : 'Property Owner')}</div>
              <div style="font-size:16px; font-weight:700; color:var(--text-main); margin-top:2px;">${escapeHtml(property.ownerName || 'SKSARS Member')}</div>
              <div style="font-size:13px; color:var(--text-secondary);" class="tabular-nums">${escapeHtml(property.contactNumber || 'Contact via Inquiry Form')}</div>
            </div>

            <form id="property-inquiry-form" style="display:flex; flex-direction:column; gap:10px;">
              <input type="text" class="form-control" id="inq-name" placeholder="Your full name" required />
              <input type="tel" class="form-control" id="inq-phone" placeholder="Phone number" required />
              <textarea class="form-textarea" id="inq-message" rows="3" placeholder="I am interested in this property. Please share visit timings." required></textarea>
              <button type="submit" class="btn btn-primary">Send Inquiry to Owner</button>
            </form>

            <div style="display:flex; gap:10px; margin-top:10px;">
              ${
                whatsappHref
                  ? `<a href="${escapeHtml(whatsappHref)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="flex:1;">WhatsApp</a>`
                  : ''
              }
              <button type="button" class="btn btn-outline" id="detail-fav-btn" style="flex:1;">
                ${faved ? 'Saved in Favourites' : 'Save Property'}
              </button>
            </div>
            <button type="button" class="btn btn-outline btn-sm" id="open-report-btn" style="width:100%; margin-top:12px; color:var(--danger);">
              Report Listing
            </button>
          </div>
        </aside>
      </div>

      <section style="margin-top:44px;">
        <h2 style="font-size:22px; color:var(--primary); margin-bottom:18px;">Similar Properties in ${escapeHtml(property.city || 'Madhya Pradesh')}</h2>
        <div id="similar-properties-grid" class="grid-3"></div>
      </section>

      <div class="modal-backdrop" id="report-modal">
        <div class="modal-card">
          <div class="modal-head">
            <h3>Report Suspicious or Incorrect Listing</h3>
            <button type="button" class="btn btn-outline btn-sm" data-close-modal="report-modal">Close</button>
          </div>
          <form id="report-listing-form" style="display:flex; flex-direction:column; gap:12px;">
            <div class="form-field">
              <label class="form-label" for="report-reason">Reason</label>
              <select class="form-select" id="report-reason" required>
                <option value="Fake or misleading photos">Fake or misleading photos</option>
                <option value="Incorrect price or sold out">Incorrect price or already sold/rented</option>
                <option value="Suspected fraud or duplicate">Suspected fraud or duplicate</option>
                <option value="Unresponsive or abusive contact">Unresponsive or abusive contact</option>
              </select>
            </div>
            <div class="form-field">
              <label class="form-label" for="report-details">Additional Details</label>
              <textarea class="form-textarea" id="report-details" rows="3" placeholder="Provide details for our moderation team..." required></textarea>
            </div>
            <button type="submit" class="btn btn-danger">Submit Report</button>
          </form>
        </div>
      </div>
    `;

    // Slider wiring
    let activeIdx = 0;
    const activeImgEl = document.getElementById('gallery-active-img');
    const thumbBtns = container.querySelectorAll('[data-gal-idx]');
    const updateGallery = (nextIdx) => {
      activeIdx = (nextIdx + images.length) % images.length;
      if (activeImgEl) activeImgEl.src = images[activeIdx];
      thumbBtns.forEach((b, i) => b.classList.toggle('active', i === activeIdx));
    };
    document.getElementById('gal-prev')?.addEventListener('click', () => updateGallery(activeIdx - 1));
    document.getElementById('gal-next')?.addEventListener('click', () => updateGallery(activeIdx + 1));
    thumbBtns.forEach((b) =>
      b.addEventListener('click', () => updateGallery(Number(b.getAttribute('data-gal-idx'))))
    );

    // Pre-fill user details if signed in
    if (APP_STATE.user) {
      document.getElementById('inq-name').value = APP_STATE.profile?.name || APP_STATE.user.displayName || '';
      document.getElementById('inq-phone').value = APP_STATE.profile?.phone || '';
    }

    document.getElementById('detail-fav-btn')?.addEventListener('click', async (e) => {
      const saved = await handleFavoriteToggle(property.id);
      e.currentTarget.textContent = saved ? 'Saved in Favourites' : 'Save Property';
    });

    document.getElementById('property-inquiry-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await submitPropertyInquiry({
          property,
          senderName: document.getElementById('inq-name').value,
          senderPhone: document.getElementById('inq-phone').value,
          message: document.getElementById('inq-message').value,
        });
        showToast('Inquiry sent to the property owner.', 'success');
        e.target.reset();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    document.getElementById('open-report-btn')?.addEventListener('click', () => {
      if (!APP_STATE.user) {
        showToast('Please sign in to report a listing.', 'warning');
        return;
      }
      openModal('report-modal');
    });

    document.getElementById('report-listing-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await createPropertyReport({
          propertyId: property.id,
          propertyTitle: property.title,
          reporterId: APP_STATE.user.uid,
          reason: document.getElementById('report-reason').value,
          details: document.getElementById('report-details').value,
        });
        closeModal('report-modal');
        showToast('Report submitted for admin review.', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    // Map + Nearby Places
    const mapBox = document.getElementById('detail-map-box');
    const nearbyBox = document.getElementById('detail-nearby-list');
    renderPropertyDetailMap(mapBox, property, nearbyBox);

    // Similar Properties
    const allApproved = await getApprovedProperties();
    const similar = allApproved
      .filter((p) => p.id !== property.id && (p.city === property.city || p.category === property.category))
      .slice(0, 3);
    const simGrid = document.getElementById('similar-properties-grid');
    if (simGrid) {
      if (similar.length) {
        simGrid.innerHTML = similar.map(createPropertyCardHtml).join('');
        bindPropertyCardActions(simGrid);
      } else {
        simGrid.innerHTML = `<div class="state-box" style="grid-column:1/-1;"><p>No other similar listings approved in ${escapeHtml(property.city)} yet.</p></div>`;
      }
    }
  } catch (err) {
    container.innerHTML = `<div class="state-box"><h3>Unable to load property</h3><p>${escapeHtml(err.message)}</p></div>`;
  }
}

/* ==================== ADD / EDIT PROPERTY PAGE ==================== */

const AMENITY_OPTIONS = [
  '24x7 Water Supply',
  'Power Backup',
  'Lift / Elevator',
  'CCTV & Security',
  'Covered Parking',
  'Garden / Park',
  'Clubhouse & Gym',
  'Modular Kitchen',
  'Rainwater Harvesting',
  'Vaastu Compliant',
  'Wi-Fi / Fiber Ready',
  'Near Main Road',
];

export async function initAddPropertyPage() {
  const form = document.getElementById('add-property-form');
  if (!form) return;

  const citySelect = document.getElementById('prop-city');
  const localitySelect = document.getElementById('prop-locality');
  const categorySelect = document.getElementById('prop-category');
  const amenitiesBox = document.getElementById('amenities-checkboxes');
  const imageInput = document.getElementById('prop-images');
  const previewGrid = document.getElementById('image-preview-grid');
  const progressBar = document.getElementById('upload-progress-fill');
  const progressLabel = document.getElementById('upload-progress-label');

  // Populate 12 categories and 16 MP cities
  categorySelect.innerHTML = PROPERTY_CATEGORIES.map(
    (c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`
  ).join('');
  citySelect.innerHTML = MP_CITIES_DATA.map(
    (c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`
  ).join('');
  amenitiesBox.innerHTML = AMENITY_OPTIONS.map(
    (a) => `
      <label style="display:flex; align-items:center; gap:8px; font-size:13.5px; cursor:pointer;">
        <input type="checkbox" name="amenities" value="${escapeHtml(a)}" />
        <span>${escapeHtml(a)}</span>
      </label>
    `
  ).join('');

  async function refreshLocalities(cityName, selectedLoc = '') {
    const locs = await getLocalitiesByCity(cityName);
    localitySelect.innerHTML = locs
      .map((l) => `<option value="${escapeHtml(l)}" ${l === selectedLoc ? 'selected' : ''}>${escapeHtml(l)}</option>`)
      .join('');
  }

  await refreshLocalities(citySelect.value);

  // Coordinate picker
  const picker = await initCoordinatePicker(document.getElementById('picker-map-box'), {
    lat: 23.2599,
    lng: 77.4126,
    onPick: ({ lat, lng }) => {
      document.getElementById('prop-lat').value = lat.toFixed(6);
      document.getElementById('prop-lng').value = lng.toFixed(6);
    },
  });

  citySelect.addEventListener('change', async () => {
    await refreshLocalities(citySelect.value);
    const cityObj = MP_CITIES_DATA.find((c) => c.name === citySelect.value);
    if (cityObj) {
      document.getElementById('prop-lat').value = cityObj.lat;
      document.getElementById('prop-lng').value = cityObj.lng;
      picker.setCenter(cityObj.lat, cityObj.lng);
    }
  });

  // Preview local images
  let existingImages = [];
  imageInput.addEventListener('change', () => {
    const files = Array.from(imageInput.files || []);
    previewGrid.innerHTML = '';
    files.forEach((file) => {
      const url = URL.createObjectURL(file);
      const item = document.createElement('div');
      item.className = 'upload-preview-item';
      item.innerHTML = `<img src="${url}" alt="Selected photo preview" />`;
      previewGrid.appendChild(item);
    });
  });

  // Check if editing existing listing
  const editId = new URLSearchParams(window.location.search).get('edit');
  if (editId) {
    document.getElementById('add-prop-heading').textContent = 'Edit Property Listing';
    const existing = await getPropertyById(editId);
    if (existing) {
      document.getElementById('prop-title').value = existing.title || '';
      categorySelect.value = existing.category || PROPERTY_CATEGORIES[0];
      document.getElementById('prop-listing-type').value = existing.listingType || 'buy';
      document.getElementById('prop-description').value = existing.description || '';
      citySelect.value = existing.city || 'Bhopal';
      await refreshLocalities(citySelect.value, existing.locality);
      document.getElementById('prop-address').value = existing.address || '';
      document.getElementById('prop-price').value = existing.price || '';
      document.getElementById('prop-deposit').value = existing.securityDeposit || '';
      document.getElementById('prop-rent').value = existing.monthlyRent || '';
      document.getElementById('prop-maintenance').value = existing.maintenanceCharges || '';
      document.getElementById('prop-bhk').value = existing.bhk || '';
      document.getElementById('prop-bathrooms').value = existing.bathrooms || '';
      document.getElementById('prop-balconies').value = existing.balconies || '';
      document.getElementById('prop-carpet').value = existing.carpetArea || '';
      document.getElementById('prop-builtup').value = existing.builtUpArea || '';
      document.getElementById('prop-furnishing').value = existing.furnishing || 'Semi-Furnished';
      document.getElementById('prop-possession').value = existing.possessionStatus || 'Ready to Move';
      document.getElementById('prop-age').value = existing.propertyAge || '0-1 Years';
      document.getElementById('prop-floor').value = existing.floorNumber ?? 0;
      document.getElementById('prop-total-floors').value = existing.totalFloors ?? 1;
      document.getElementById('prop-parking').value = existing.parking || '1 Covered';
      document.getElementById('prop-facing').value = existing.facing || 'East';
      document.getElementById('prop-owner-name').value = existing.ownerName || '';
      document.getElementById('prop-contact').value = existing.contactNumber || '';
      document.getElementById('prop-lat').value = existing.lat || 23.2599;
      document.getElementById('prop-lng').value = existing.lng || 77.4126;
      picker.setCenter(existing.lat || 23.2599, existing.lng || 77.4126);

      if (Array.isArray(existing.amenities)) {
        form.querySelectorAll('input[name="amenities"]').forEach((cb) => {
          cb.checked = existing.amenities.includes(cb.value);
        });
      }
      if (Array.isArray(existing.images)) {
        existingImages = existing.images;
        previewGrid.innerHTML = existingImages
          .map(
            (img) => `<div class="upload-preview-item"><img src="${escapeHtml(img.url || img)}" alt="Existing photo" /></div>`
          )
          .join('');
      }
    }
  }

  let submitMode = 'pending';
  document.getElementById('save-draft-btn')?.addEventListener('click', () => {
    submitMode = 'draft';
  });
  document.getElementById('submit-verify-btn')?.addEventListener('click', () => {
    submitMode = 'pending';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!APP_STATE.user) {
      showToast('Please sign in to submit a property listing.', 'warning');
      window.location.href = './login.html';
      return;
    }

    const submitBtn = document.getElementById('submit-verify-btn');
    submitBtn.disabled = true;

    try {
      const selectedAmenities = Array.from(form.querySelectorAll('input[name="amenities"]:checked')).map(
        (c) => c.value
      );

      const payload = {
        title: document.getElementById('prop-title').value,
        category: categorySelect.value,
        listingType: document.getElementById('prop-listing-type').value,
        description: document.getElementById('prop-description').value,
        city: citySelect.value,
        locality: localitySelect.value,
        address: document.getElementById('prop-address').value,
        price: Number(document.getElementById('prop-price').value),
        securityDeposit: Number(document.getElementById('prop-deposit').value || 0),
        monthlyRent: Number(document.getElementById('prop-rent').value || 0),
        maintenanceCharges: Number(document.getElementById('prop-maintenance').value || 0),
        bhk: Number(document.getElementById('prop-bhk').value || 0),
        bathrooms: Number(document.getElementById('prop-bathrooms').value || 0),
        balconies: Number(document.getElementById('prop-balconies').value || 0),
        carpetArea: Number(document.getElementById('prop-carpet').value || 0),
        builtUpArea: Number(document.getElementById('prop-builtup').value || 0),
        furnishing: document.getElementById('prop-furnishing').value,
        possessionStatus: document.getElementById('prop-possession').value,
        propertyAge: document.getElementById('prop-age').value,
        floorNumber: Number(document.getElementById('prop-floor').value || 0),
        totalFloors: Number(document.getElementById('prop-total-floors').value || 1),
        parking: document.getElementById('prop-parking').value,
        facing: document.getElementById('prop-facing').value,
        amenities: selectedAmenities,
        ownerName: document.getElementById('prop-owner-name').value || APP_STATE.profile?.name || '',
        contactNumber: document.getElementById('prop-contact').value,
        postedByRole: APP_STATE.profile?.role === 'agent' ? 'agent' : 'owner',
        ownerId: APP_STATE.user.uid,
        lat: Number(document.getElementById('prop-lat').value || 23.2599),
        lng: Number(document.getElementById('prop-lng').value || 77.4126),
        images: existingImages,
        status: submitMode,
      };

      const propertyId = await saveProperty(payload, editId);

      const files = imageInput.files;
      if (files && files.length > 0) {
        progressLabel.textContent = 'Uploading property photos...';
        const uploaded = await uploadPropertyImages(APP_STATE.user.uid, propertyId, files, (pct, cur, tot) => {
          progressBar.style.width = `${pct}%`;
          progressLabel.textContent = `Uploading image ${cur} of ${tot} (${pct}%)`;
        });
        await saveProperty({ ...payload, images: [...existingImages, ...uploaded] }, propertyId);
      }

      showToast(
        submitMode === 'draft'
          ? 'Property saved as draft in your Dashboard.'
          : 'Property submitted! It remains pending until approved by an admin.',
        'success'
      );
      setTimeout(() => {
        window.location.href = './dashboard.html';
      }, 1000);
    } catch (err) {
      showToast(err.message || 'Could not save property.', 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });
}
