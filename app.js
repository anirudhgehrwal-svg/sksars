import { observeAuth, logoutUser } from './js/auth.js';
import { isFirebaseConfigured } from './firebase.js';
import { escapeHtml } from './js/database.js';
import { startNotificationsListener } from './js/notifications.js';

export const APP_STATE = {
  user: null,
  profile: null,
  isAdmin: false,
  configured: isFirebaseConfigured(),
  authResolved: false,
  listeners: [],
};

const RECENT_KEY = 'sksars_recently_viewed_v1';

/* Global Google Maps Quota Defense Listeners (Case A) */
if (typeof window !== 'undefined' && !window.__SKSARS_GMP_GUARD__) {
  window.__SKSARS_GMP_GUARD__ = true;
  window.gm_authFailure = () => {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  };
  const origConsoleError = console.error;
  console.error = (...args) => {
    origConsoleError.apply(console, args);
    const msg = args.map((a) => String(a)).join(' ');
    if (msg.includes('OverQuotaMapError') || msg.includes('QuotaExceededError')) {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    }
  };
}

export function showQuotaBanner() {
  if (document.getElementById('gmp-quota-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'gmp-quota-banner';
  banner.className = 'gmp-quota-banner';
  banner.innerHTML = `
    <span>
      Google Maps Platform quota reached. If you are the app owner, visit
      <a href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors" target="_blank" rel="noopener noreferrer">maps developer site</a>
      for instructions to update your account.
    </span>
  `;
  document.body.prepend(banner);
}

window.addEventListener('gmp-quota-exceeded', showQuotaBanner);

export function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 4200);
}

export function openModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.add('open');
}

export function closeModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.remove('open');
}

export function recordRecentlyViewed(property) {
  if (!property || !property.id) return;
  try {
    const existing = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    const filtered = existing.filter((item) => item.id !== property.id);
    filtered.unshift({
      id: property.id,
      title: property.title,
      city: property.city,
      locality: property.locality,
      price: property.price,
      listingType: property.listingType,
      category: property.category,
      bhk: property.bhk,
      bathrooms: property.bathrooms,
      carpetArea: property.carpetArea,
      furnishing: property.furnishing,
      verified: property.verified,
      postedByRole: property.postedByRole,
      images: property.images || [],
      viewedAt: Date.now(),
    });
    localStorage.setItem(RECENT_KEY, JSON.stringify(filtered.slice(0, 8)));
  } catch {
    // Ignore storage quota issues
  }
}

export function getRecentlyViewed() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    return [];
  }
}

function getBasePath() {
  return window.location.pathname.includes('/pages/') ? '..' : '.';
}

export function renderHeader(activeKey = 'home') {
  const host = document.getElementById('site-header-mount');
  if (!host) return;
  const base = getBasePath();

  const ctaHtml = APP_STATE.user
    ? `<a href="${base}/pages/dashboard.html" class="btn btn-primary btn-sm">Dashboard</a>`
    : `<a href="${base}/pages/login.html" class="btn btn-primary btn-sm">Sign In</a>`;

  host.innerHTML = `
    ${
      !isFirebaseConfigured()
        ? `<div class="config-banner">
             Firebase configuration pending: paste your Firebase project keys into <code>firebase.js</code> to connect live Authentication, Realtime Database, and Storage.
           </div>`
        : ''
    }
    <header class="site-header">
      <div class="container header-inner">
        <a href="${base}/index.html" class="brand-wordmark">SKSARS <span>Housing</span></a>
        <nav class="main-nav" aria-label="Primary Navigation">
          <a href="${base}/pages/search.html?listingType=buy" class="nav-link ${activeKey === 'buy' ? 'active' : ''}">Buy</a>
          <a href="${base}/pages/search.html?listingType=rent" class="nav-link ${activeKey === 'rent' ? 'active' : ''}">Rent</a>
          <a href="${base}/pages/search.html?listingType=pg" class="nav-link ${activeKey === 'pg' ? 'active' : ''}">PG & Commercial</a>
          <a href="${base}/pages/add-property.html" class="nav-link ${activeKey === 'add' ? 'active' : ''}">Post Property</a>
          <a href="${base}/pages/contact.html" class="nav-link ${activeKey === 'contact' ? 'active' : ''}">Contact</a>
        </nav>
        <div class="header-cta-zone">
          ${ctaHtml}
        </div>
      </div>
    </header>
  `;
}

export function renderMobileBottomNav(activeKey = 'home') {
  const mount = document.getElementById('mobile-nav-mount');
  if (!mount) return;
  const base = getBasePath();
  const accountHref = APP_STATE.user ? `${base}/pages/dashboard.html` : `${base}/pages/login.html`;
  const accountLabel = APP_STATE.user ? 'Dashboard' : 'Sign In';

  mount.innerHTML = `
    <nav class="mobile-bottom-nav" aria-label="Mobile Navigation">
      <a href="${base}/index.html" class="mobile-bottom-link ${activeKey === 'home' ? 'active' : ''}">Home</a>
      <a href="${base}/pages/search.html" class="mobile-bottom-link ${activeKey === 'search' ? 'active' : ''}">Search</a>
      <a href="${base}/pages/add-property.html" class="mobile-bottom-link ${activeKey === 'add' ? 'active' : ''}">Post</a>
      <a href="${base}/pages/favorites.html" class="mobile-bottom-link ${activeKey === 'favorites' ? 'active' : ''}">Saved</a>
      <a href="${accountHref}" class="mobile-bottom-link ${activeKey === 'dashboard' ? 'active' : ''}">${escapeHtml(accountLabel)}</a>
    </nav>
  `;
}

export function renderFooter() {
  const host = document.getElementById('site-footer-mount');
  if (!host) return;
  const base = getBasePath();

  host.innerHTML = `
    <footer class="site-footer">
      <div class="container">
        <div class="footer-grid">
          <div>
            <div class="footer-title">SKSARS Housing</div>
            <p style="font-size:13.5px; color:#CBD5E1; margin:0 0 12px; max-width:34ch;">
              Madhya Pradesh real estate marketplace for verified homes, rentals, PG accommodations, plots, and commercial properties.
            </p>
            <p style="font-size:12px; color:#94A3B8; margin:0;">
              Bhopal · Indore · Jabalpur · Gwalior · Ujjain · All 16 MP Hubs
            </p>
          </div>
          <div>
            <div class="footer-title">Explore</div>
            <ul class="footer-links">
              <li><a href="${base}/pages/search.html?listingType=buy">Buy Residential</a></li>
              <li><a href="${base}/pages/search.html?listingType=rent">Rent Homes</a></li>
              <li><a href="${base}/pages/search.html?listingType=pg">PG &amp; Hostels</a></li>
              <li><a href="${base}/pages/search.html?listingType=commercial">Commercial Spaces</a></li>
            </ul>
          </div>
          <div>
            <div class="footer-title">Owners &amp; Members</div>
            <ul class="footer-links">
              <li><a href="${base}/pages/add-property.html">List Your Property</a></li>
              <li><a href="${base}/pages/dashboard.html">User Dashboard</a></li>
              <li><a href="${base}/pages/favorites.html">Saved Favourites</a></li>
              <li><a href="${base}/pages/profile.html">My Profile</a></li>
              <li><a href="${base}/pages/admin.html">Admin Console</a></li>
            </ul>
          </div>
          <div>
            <div class="footer-title">Company &amp; Legal</div>
            <ul class="footer-links">
              <li><a href="${base}/pages/contact.html#about">About SKSARS Housing</a></li>
              <li><a href="${base}/pages/contact.html">Contact Support</a></li>
              <li><a href="${base}/pages/contact.html#privacy">Privacy Policy</a></li>
              <li><a href="${base}/pages/contact.html#terms">Terms of Service</a></li>
            </ul>
          </div>
        </div>
        <div class="footer-bottom">
          <span>&copy; ${new Date().getFullYear()} SKSARS Housing. Built for Madhya Pradesh Real Estate.</span>
          <span>Maps powered by Google Maps Platform (subject to Google Maps End User Terms).</span>
        </div>
      </div>
    </footer>
  `;
}

export function onAuthReady(listener) {
  APP_STATE.listeners.push(listener);
  if (APP_STATE.authResolved) {
    listener(APP_STATE);
  }
}

export function initAppShell(activeNav = 'home') {
  renderHeader(activeNav);
  renderMobileBottomNav(activeNav);
  renderFooter();

  document.addEventListener('click', (e) => {
    const closeTarget = e.target.closest('[data-close-modal]');
    if (closeTarget) {
      closeModal(closeTarget.getAttribute('data-close-modal'));
    }
    if (e.target.classList.contains('modal-backdrop')) {
      e.target.classList.remove('open');
    }
  });

  observeAuth((ctx) => {
    APP_STATE.user = ctx.user;
    APP_STATE.profile = ctx.profile;
    APP_STATE.isAdmin = ctx.isAdmin;
    APP_STATE.configured = ctx.configured;
    APP_STATE.authResolved = true;

    renderHeader(activeNav);
    renderMobileBottomNav(activeNav);

    if (ctx.user) {
      startNotificationsListener(ctx.user.uid);
    }

    APP_STATE.listeners.forEach((fn) => {
      try {
        fn(APP_STATE);
      } catch (err) {
        console.error('Auth listener callback error:', err);
      }
    });
  });

  window.sksarsLogout = async () => {
    await logoutUser();
    showToast('Signed out successfully.', 'success');
    window.location.href = `${getBasePath()}/index.html`;
  };
}
