import Chart from 'chart.js/auto';
import {
  getApprovedProperties,
  getLocalitiesByCity,
  saveUserSearchAlert,
  MP_CITIES_DATA,
  PROPERTY_CATEGORIES,
  escapeHtml,
  formatPriceINR,
} from './database.js';
import { createPropertyCardHtml, bindPropertyCardActions, renderSkeletonCards } from './properties.js';
import { renderSearchMap } from './maps.js';
import { APP_STATE, showToast } from '../app.js';

let allProperties = [];
let filteredProperties = [];
let visibleLimit = 9;
let cityChartInstance = null;
let trendChartInstance = null;

export function filterAndSortProperties(list, criteria) {
  const qText = String(criteria.query || '').trim().toLowerCase();

  let res = list.filter((p) => {
    if (criteria.city && p.city !== criteria.city) return false;
    if (criteria.locality && p.locality !== criteria.locality) return false;
    if (criteria.listingType && p.listingType !== criteria.listingType) return false;
    if (criteria.category && p.category !== criteria.category) return false;
    if (criteria.minPrice && Number(p.price) < Number(criteria.minPrice)) return false;
    if (criteria.maxPrice && Number(p.price) > Number(criteria.maxPrice)) return false;
    if (criteria.bhk) {
      const bhkNum = Number(criteria.bhk);
      if (bhkNum === 4 ? Number(p.bhk) < 4 : Number(p.bhk) !== bhkNum) return false;
    }
    if (criteria.bathrooms && Number(p.bathrooms) < Number(criteria.bathrooms)) return false;
    const area = Number(p.carpetArea || p.builtUpArea || 0);
    if (criteria.minArea && area < Number(criteria.minArea)) return false;
    if (criteria.maxArea && area > Number(criteria.maxArea)) return false;
    if (criteria.furnishing && p.furnishing !== criteria.furnishing) return false;
    if (criteria.possessionStatus && p.possessionStatus !== criteria.possessionStatus) return false;
    if (criteria.verifiedOnly && !p.verified) return false;
    if (criteria.postedByRole && p.postedByRole !== criteria.postedByRole) return false;
    if (qText) {
      const haystack = `${p.title} ${p.locality} ${p.city} ${p.address} ${p.category}`.toLowerCase();
      if (!haystack.includes(qText)) return false;
    }
    return true;
  });

  const sort = criteria.sort || 'newest';
  if (sort === 'price_asc') {
    res = res.sort((a, b) => Number(a.price) - Number(b.price));
  } else if (sort === 'price_desc') {
    res = res.sort((a, b) => Number(b.price) - Number(a.price));
  } else {
    res = res.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  return res;
}

export function renderPriceAnalytics(properties, cityCanvas, trendCanvas, summaryEl) {
  if (!cityCanvas || !trendCanvas) return;

  if (!properties.length) {
    if (summaryEl) {
      summaryEl.innerHTML = `
        <div class="state-box">
          <h3>Live Market Estimates</h3>
          <p>Price analytics will render automatically once approved listings exist in Firebase Realtime Database.</p>
        </div>
      `;
    }
    return;
  }

  // Compute actual averages strictly from Firebase approved listings
  const cityBuckets = {};
  const buyPrices = [];
  const rentPrices = [];

  properties.forEach((p) => {
    const city = p.city || 'Other';
    if (!cityBuckets[city]) cityBuckets[city] = { sum: 0, count: 0, sqftSum: 0, sqftCount: 0 };
    const price = Number(p.price) || 0;
    const area = Number(p.carpetArea || p.builtUpArea || 0);

    if (p.listingType === 'rent' || p.listingType === 'pg') {
      rentPrices.push(price);
    } else {
      buyPrices.push(price);
      cityBuckets[city].sum += price;
      cityBuckets[city].count += 1;
      if (area > 0) {
        cityBuckets[city].sqftSum += price / area;
        cityBuckets[city].sqftCount += 1;
      }
    }
  });

  const cityLabels = Object.keys(cityBuckets).filter((k) => cityBuckets[k].count > 0);
  const avgCityLakhs = cityLabels.map((k) =>
    Number((cityBuckets[k].sum / cityBuckets[k].count / 100000).toFixed(2))
  );
  const avgSqft = cityLabels.map((k) =>
    cityBuckets[k].sqftCount ? Math.round(cityBuckets[k].sqftSum / cityBuckets[k].sqftCount) : 0
  );

  if (cityChartInstance) cityChartInstance.destroy();
  cityChartInstance = new Chart(cityCanvas, {
    type: 'bar',
    data: {
      labels: cityLabels,
      datasets: [
        {
          label: 'Avg Listing Price (₹ Lakhs)',
          data: avgCityLakhs,
          backgroundColor: '#0F2C59',
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: true } },
    },
  });

  if (trendChartInstance) trendChartInstance.destroy();
  trendChartInstance = new Chart(trendCanvas, {
    type: 'line',
    data: {
      labels: cityLabels,
      datasets: [
        {
          label: 'Avg Price / sq.ft. (₹)',
          data: avgSqft,
          borderColor: '#5B21B6',
          backgroundColor: 'rgba(91, 33, 182, 0.12)',
          fill: true,
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: true } },
    },
  });

  if (summaryEl) {
    const avgBuy = buyPrices.length ? buyPrices.reduce((a, b) => a + b, 0) / buyPrices.length : 0;
    const avgRent = rentPrices.length ? rentPrices.reduce((a, b) => a + b, 0) / rentPrices.length : 0;
    summaryEl.innerHTML = `
      <div class="kpi-grid" style="margin-bottom:0;">
        <div class="kpi-box">
          <div class="kpi-label">Active Approved Listings</div>
          <div class="kpi-value tabular-nums">${properties.length}</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-label">Avg Buy Price (Est.)</div>
          <div class="kpi-value tabular-nums">${avgBuy ? escapeHtml(formatPriceINR(avgBuy, 'buy')) : '—'}</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-label">Avg Monthly Rent (Est.)</div>
          <div class="kpi-value tabular-nums">${avgRent ? escapeHtml(formatPriceINR(avgRent, 'rent')) : '—'}</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-label">MP Cities Covered</div>
          <div class="kpi-value tabular-nums">${cityLabels.length || MP_CITIES_DATA.length}</div>
        </div>
      </div>
    `;
  }
}

export async function initSearchPage() {
  const resultsGrid = document.getElementById('search-results-grid');
  if (!resultsGrid) return;

  const citySelect = document.getElementById('filter-city');
  const localitySelect = document.getElementById('filter-locality');
  const categorySelect = document.getElementById('filter-category');
  const resultsCountEl = document.getElementById('search-results-count');
  const loadMoreBtn = document.getElementById('load-more-btn');
  const mapContainer = document.getElementById('search-map-container');
  const toggleMapBtn = document.getElementById('toggle-map-view-btn');

  // Populate MP Cities & Categories
  citySelect.innerHTML =
    `<option value="">All MP Cities</option>` +
    MP_CITIES_DATA.map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('');

  categorySelect.innerHTML =
    `<option value="">All Categories</option>` +
    PROPERTY_CATEGORIES.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');

  async function syncLocalities(city) {
    if (!city) {
      localitySelect.innerHTML = `<option value="">All Localities</option>`;
      return;
    }
    const locs = await getLocalitiesByCity(city);
    localitySelect.innerHTML =
      `<option value="">All Localities</option>` +
      locs.map((l) => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');
  }

  // Hydrate initial filters from URL query string
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('city')) {
    citySelect.value = urlParams.get('city');
    await syncLocalities(citySelect.value);
  }
  if (urlParams.get('locality')) localitySelect.value = urlParams.get('locality');
  if (urlParams.get('listingType')) document.getElementById('filter-listing-type').value = urlParams.get('listingType');
  if (urlParams.get('category')) categorySelect.value = urlParams.get('category');
  if (urlParams.get('q')) document.getElementById('filter-query').value = urlParams.get('q');

  citySelect.addEventListener('change', async () => {
    await syncLocalities(citySelect.value);
    applyFilters();
  });

  function readCriteria() {
    return {
      query: document.getElementById('filter-query').value,
      city: citySelect.value,
      locality: localitySelect.value,
      listingType: document.getElementById('filter-listing-type').value,
      category: categorySelect.value,
      minPrice: document.getElementById('filter-min-price').value,
      maxPrice: document.getElementById('filter-max-price').value,
      bhk: document.getElementById('filter-bhk').value,
      bathrooms: document.getElementById('filter-bathrooms').value,
      minArea: document.getElementById('filter-min-area').value,
      maxArea: document.getElementById('filter-max-area').value,
      furnishing: document.getElementById('filter-furnishing').value,
      possessionStatus: document.getElementById('filter-possession').value,
      verifiedOnly: document.getElementById('filter-verified').checked,
      postedByRole: document.getElementById('filter-role').value,
      sort: document.getElementById('filter-sort').value,
    };
  }

  function renderResults() {
    const slice = filteredProperties.slice(0, visibleLimit);
    if (resultsCountEl) {
      resultsCountEl.textContent = `${filteredProperties.length} properties found`;
    }

    if (!slice.length) {
      resultsGrid.innerHTML = `
        <div class="state-box" style="grid-column:1/-1;">
          <h3>No matching properties found</h3>
          <p>Try widening your price budget, clearing a locality filter, or switching Buy / Rent tabs.</p>
          <button type="button" class="btn btn-outline" id="reset-empty-filters">Clear All Filters</button>
        </div>
      `;
      document.getElementById('reset-empty-filters')?.addEventListener('click', resetFilters);
      if (loadMoreBtn) loadMoreBtn.style.display = 'none';
      return;
    }

    resultsGrid.innerHTML = slice.map(createPropertyCardHtml).join('');
    bindPropertyCardActions(resultsGrid);
    if (loadMoreBtn) {
      loadMoreBtn.style.display = filteredProperties.length > visibleLimit ? 'inline-flex' : 'none';
    }
    if (mapContainer && mapContainer.style.display !== 'none') {
      renderSearchMap(mapContainer, filteredProperties);
    }
  }

  function applyFilters() {
    visibleLimit = 9;
    filteredProperties = filterAndSortProperties(allProperties, readCriteria());
    renderResults();
  }

  function resetFilters() {
    document.getElementById('search-filters-form').reset();
    localitySelect.innerHTML = `<option value="">All Localities</option>`;
    applyFilters();
  }

  document.getElementById('search-filters-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    applyFilters();
  });
  document.getElementById('filter-sort')?.addEventListener('change', applyFilters);
  document.getElementById('reset-filters-btn')?.addEventListener('click', resetFilters);
  loadMoreBtn?.addEventListener('click', () => {
    visibleLimit += 9;
    renderResults();
  });

  document.getElementById('mobile-filter-toggle')?.addEventListener('click', () => {
    document.getElementById('search-sidebar-panel')?.classList.toggle('open');
  });

  toggleMapBtn?.addEventListener('click', () => {
    const showing = mapContainer.style.display !== 'none';
    mapContainer.style.display = showing ? 'none' : 'block';
    toggleMapBtn.textContent = showing ? 'Show Map View' : 'Hide Map View';
    if (!showing) {
      renderSearchMap(mapContainer, filteredProperties);
    }
  });

  document.getElementById('save-search-alert-btn')?.addEventListener('click', async () => {
    if (!APP_STATE.user) {
      showToast('Sign in to save search alerts and receive matching property notifications.', 'warning');
      return;
    }
    try {
      await saveUserSearchAlert(APP_STATE.user.uid, readCriteria());
      showToast('Search alert saved! You will be notified when matching MP listings are approved.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Fetch approved properties from Firebase
  renderSkeletonCards(resultsGrid, 6);
  try {
    allProperties = await getApprovedProperties();
    applyFilters();
  } catch (err) {
    resultsGrid.innerHTML = `<div class="state-box" style="grid-column:1/-1;"><h3>Unable to load listings</h3><p>${escapeHtml(err.message)}</p></div>`;
  }
}
