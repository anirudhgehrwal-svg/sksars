import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { escapeHtml, formatPriceINR } from './database.js';

let loaderInitialized = false;

function resolveMapsApiKey() {
  if (typeof __SKSARS_MAPS_API_KEY__ !== 'undefined' && __SKSARS_MAPS_API_KEY__) {
    return __SKSARS_MAPS_API_KEY__;
  }
  if (typeof window !== 'undefined' && window.__SKSARS_MAPS_KEY__) {
    return window.__SKSARS_MAPS_KEY__;
  }
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_MAPS_API_KEY) {
    return import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  }
  return '';
}

function checkQuotaError(err) {
  const msg = String(err?.message || err || '');
  if (
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('OVER_QUERY_LIMIT') ||
    msg.includes('429') ||
    msg.includes('Quota')
  ) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
}

async function ensureMapsLoaded() {
  const apiKey = resolveMapsApiKey();
  if (!apiKey) {
    throw new Error('MAPS_KEY_MISSING');
  }
  if (!loaderInitialized) {
    setOptions({
      key: apiKey,
      v: 'weekly',
      language: 'en',
      region: 'IN',
    });
    loaderInitialized = true;
  }
  const [{ Map, InfoWindow }, { AdvancedMarkerElement, PinElement }] = await Promise.all([
    importLibrary('maps'),
    importLibrary('marker'),
  ]);
  return { Map, InfoWindow, AdvancedMarkerElement, PinElement };
}

function renderMapUnavailable(container, title, subtitle) {
  if (!container) return;
  container.innerHTML = `
    <div class="img-fallback" style="height:100%;">
      <div style="font-size:15px; font-weight:700; color:var(--primary);">${escapeHtml(title)}</div>
      <div style="font-size:13px; color:var(--text-secondary); max-width:38ch;">${escapeHtml(subtitle)}</div>
    </div>
  `;
}

/**
 * Property Details Map + Nearby Facilities via Places API (New) Place.searchNearby()
 */
export async function renderPropertyDetailMap(mapContainer, property, nearbyContainer = null) {
  const lat = Number(property.lat) || 23.2599;
  const lng = Number(property.lng) || 77.4126;

  try {
    const { Map, InfoWindow, AdvancedMarkerElement } = await ensureMapsLoaded();
    const map = new Map(mapContainer, {
      center: { lat, lng },
      zoom: 14,
      mapId: 'DEMO_MAP_ID',
      gestureHandling: 'cooperative',
      internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
    });

    const mainMarker = new AdvancedMarkerElement({
      map,
      position: { lat, lng },
      title: property.title,
    });

    const infoWindow = new InfoWindow();
    mainMarker.addListener('click', () => {
      const content = document.createElement('div');
      content.innerHTML = `<strong>${escapeHtml(property.title)}</strong><br/><span>${escapeHtml(property.locality)}, ${escapeHtml(property.city)}</span>`;
      infoWindow.setContent(content);
      infoWindow.open({ map, anchor: mainMarker });
    });

    if (nearbyContainer) {
      await loadNearbyFacilities(map, { lat, lng }, nearbyContainer);
    }
  } catch (err) {
    checkQuotaError(err);
    renderMapUnavailable(
      mapContainer,
      `Location: ${property.locality}, ${property.city}`,
      `Coordinates ${lat.toFixed(4)}, ${lng.toFixed(4)}. Configure VITE_GOOGLE_MAPS_API_KEY to enable interactive map view.`
    );
    if (nearbyContainer) {
      nearbyContainer.innerHTML = `
        <p style="font-size:13.5px; color:var(--text-secondary);">
          Nearby schools, hospitals, markets, and transit hubs populate automatically when Google Maps API key is active.
        </p>
      `;
    }
  }
}

async function loadNearbyFacilities(map, center, container) {
  const groups = [
    { label: 'Schools', types: ['school'], color: '#0F2C59' },
    { label: 'Hospitals', types: ['hospital'], color: '#B91C1C' },
    { label: 'Markets', types: ['supermarket', 'shopping_mall'], color: '#5B21B6' },
    { label: 'Transit', types: ['transit_station', 'bus_station', 'train_station'], color: '#15803D' },
  ];

  try {
    const [{ Place, SearchNearbyRankPreference }, { AdvancedMarkerElement, PinElement }] = await Promise.all([
      importLibrary('places'),
      importLibrary('marker'),
    ]);

    const sections = [];
    for (const group of groups) {
      try {
        const { places } = await Place.searchNearby({
          fields: ['displayName', 'location', 'formattedAddress', 'googleMapsURI'],
          locationRestriction: { center, radius: 3500 },
          includedPrimaryTypes: group.types,
          maxResultCount: 3,
          rankPreference: SearchNearbyRankPreference.DISTANCE,
          language: 'en',
          region: 'IN',
          internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
        });

        places.forEach((p) => {
          if (!p.location) return;
          const pin = new PinElement({
            background: group.color,
            borderColor: '#FFFFFF',
            glyphColor: '#FFFFFF',
          });
          const marker = new AdvancedMarkerElement({
            map,
            position: p.location,
            title: p.displayName || group.label,
          });
          marker.append(pin);
        });

        sections.push({
          label: group.label,
          items: places.map((p) => ({
            name: p.displayName || 'Facility',
            address: p.formattedAddress || '',
            uri: p.googleMapsURI || '',
          })),
        });
      } catch (innerErr) {
        checkQuotaError(innerErr);
        sections.push({ label: group.label, items: [] });
      }
    }

    container.innerHTML = `
      <div class="grid-2" style="gap:14px;">
        ${sections
          .map(
            (sec) => `
            <div style="border:1px solid var(--border); border-radius:var(--radius-sm); padding:14px;">
              <div style="font-weight:700; font-size:14px; color:var(--primary); margin-bottom:8px;">${escapeHtml(sec.label)}</div>
              ${
                sec.items.length
                  ? `<ul style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:6px; font-size:13px;">
                      ${sec.items
                        .map(
                          (item) => `
                          <li>
                            <div style="font-weight:600; color:var(--text-main);">${escapeHtml(item.name)}</div>
                            <div style="font-size:12px; color:var(--text-muted);">${escapeHtml(item.address)}</div>
                          </li>
                        `
                        )
                        .join('')}
                    </ul>`
                  : `<div style="font-size:12.5px; color:var(--text-muted);">No results within 3.5 km</div>`
              }
            </div>
          `
          )
          .join('')}
      </div>
    `;
  } catch (err) {
    checkQuotaError(err);
    container.innerHTML = `<p style="font-size:13px; color:var(--text-secondary);">Unable to fetch nearby facilities right now.</p>`;
  }
}

/**
 * Search Results Interactive Map View
 */
export async function renderSearchMap(container, properties = [], onSelectProperty = null) {
  const defaultCenter = { lat: 23.2599, lng: 77.4126 }; // Bhopal, MP
  try {
    const { Map, InfoWindow, AdvancedMarkerElement, PinElement } = await ensureMapsLoaded();
    const [{ LatLngBounds }] = await Promise.all([importLibrary('core')]);

    const map = new Map(container, {
      center: defaultCenter,
      zoom: 7,
      mapId: 'DEMO_MAP_ID',
      gestureHandling: 'cooperative',
      internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
    });

    const bounds = new LatLngBounds();
    const infoWindow = new InfoWindow();
    let hasMarkers = false;

    properties.forEach((prop) => {
      const lat = Number(prop.lat);
      const lng = Number(prop.lng);
      if (!lat || !lng) return;

      hasMarkers = true;
      const pos = { lat, lng };
      bounds.extend(pos);

      const pin = new PinElement({
        background: '#0F2C59',
        borderColor: '#FFFFFF',
        glyphColor: '#FFFFFF',
      });
      const marker = new AdvancedMarkerElement({
        map,
        position: pos,
        title: prop.title,
      });
      marker.append(pin);

      marker.addListener('click', () => {
        const div = document.createElement('div');
        div.style.maxWidth = '240px';
        div.innerHTML = `
          <div style="font-weight:700; color:#0F2C59; margin-bottom:4px;">${escapeHtml(prop.title)}</div>
          <div style="font-size:12px; color:#475569; margin-bottom:4px;">${escapeHtml(prop.locality)}, ${escapeHtml(prop.city)}</div>
          <div style="font-weight:700; color:#5B21B6; margin-bottom:8px;">${escapeHtml(formatPriceINR(prop.price, prop.listingType))}</div>
          <a href="./property-details.html?id=${encodeURIComponent(prop.id)}" style="font-size:12.5px; font-weight:600; color:#0F2C59; text-decoration:underline;">View Property Details</a>
        `;
        infoWindow.setContent(div);
        infoWindow.open({ map, anchor: marker });
        if (onSelectProperty) onSelectProperty(prop);
      });
    });

    if (hasMarkers) {
      map.fitBounds(bounds, 60);
    }
  } catch (err) {
    checkQuotaError(err);
    renderMapUnavailable(
      container,
      'Interactive Map View',
      'Enable or check your Google Maps API key to explore Madhya Pradesh listings spatially.'
    );
  }
}

/**
 * Add-Property Interactive Coordinate Picker
 */
export async function initCoordinatePicker(container, { lat = 23.2599, lng = 77.4126, onPick }) {
  try {
    const { Map, AdvancedMarkerElement } = await ensureMapsLoaded();
    const map = new Map(container, {
      center: { lat: Number(lat), lng: Number(lng) },
      zoom: 13,
      mapId: 'DEMO_MAP_ID',
      gestureHandling: 'cooperative',
      internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
    });

    const marker = new AdvancedMarkerElement({
      map,
      position: { lat: Number(lat), lng: Number(lng) },
      title: 'Selected Property Location',
    });

    map.addListener('click', (event) => {
      if (!event.latLng) return;
      const picked = { lat: event.latLng.lat(), lng: event.latLng.lng() };
      marker.position = picked;
      if (onPick) onPick(picked);
    });

    return {
      setCenter(nextLat, nextLng) {
        const pos = { lat: Number(nextLat), lng: Number(nextLng) };
        map.setCenter(pos);
        marker.position = pos;
      },
    };
  } catch (err) {
    checkQuotaError(err);
    renderMapUnavailable(
      container,
      'Coordinate Picker',
      'Click-to-pin map activates when Google Maps API key is configured. You can still enter Latitude and Longitude manually.'
    );
    return { setCenter() {} };
  }
}
