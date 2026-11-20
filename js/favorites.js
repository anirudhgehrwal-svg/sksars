import { getUserFavoriteIds, setFavorite, getPropertyById } from './database.js';
import { isFirebaseConfigured } from '../firebase.js';
import { APP_STATE, showToast } from '../app.js';

let cachedFavSet = new Set();

export async function loadFavoritesSet(uid) {
  if (!uid || !isFirebaseConfigured()) {
    cachedFavSet = new Set();
    return cachedFavSet;
  }
  const ids = await getUserFavoriteIds(uid);
  cachedFavSet = new Set(ids);
  return cachedFavSet;
}

export function isFavorited(propertyId) {
  return cachedFavSet.has(propertyId);
}

export async function handleFavoriteToggle(propertyId, buttonEl = null) {
  if (!isFirebaseConfigured()) {
    showToast('Configure Firebase in firebase.js to save favourites.', 'warning');
    return false;
  }
  if (!APP_STATE.user) {
    showToast('Please sign in to save properties to favourites.', 'warning');
    const target = window.location.pathname.includes('/pages/') ? './login.html' : './pages/login.html';
    setTimeout(() => {
      window.location.href = target;
    }, 900);
    return false;
  }

  const nextState = !cachedFavSet.has(propertyId);
  try {
    await setFavorite(APP_STATE.user.uid, propertyId, nextState);
    if (nextState) {
      cachedFavSet.add(propertyId);
      showToast('Added to your favourites.', 'success');
    } else {
      cachedFavSet.delete(propertyId);
      showToast('Removed from favourites.', 'info');
    }
    if (buttonEl) {
      buttonEl.classList.toggle('active', nextState);
      buttonEl.setAttribute('aria-pressed', String(nextState));
      buttonEl.innerHTML = nextState ? '♥' : '♡';
    }
    return nextState;
  } catch (err) {
    showToast(err.message || 'Could not update favourite.', 'error');
    return !nextState;
  }
}

export async function loadFavoritePropertiesList(uid) {
  const ids = await getUserFavoriteIds(uid);
  const props = await Promise.all(ids.map((id) => getPropertyById(id)));
  return props.filter((p) => p && (p.status === 'approved' || p.ownerId === uid));
}
