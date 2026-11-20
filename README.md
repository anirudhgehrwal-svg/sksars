# SKSARS Housing — Complete Madhya Pradesh Real Estate Platform

SKSARS Housing is a production-oriented real estate web platform focused on Madhya Pradesh (Bhopal, Indore, Jabalpur, Gwalior, Ujjain, Sagar, Rewa, Satna, Ratlam, Dewas, Chhindwara, Vidisha, Sehore, Narmadapuram, Khandwa, and Burhanpur).

Built with **HTML5, CSS3, Vanilla JavaScript (ES Modules)**, **Firebase Authentication**, **Firebase Realtime Database**, **Firebase Storage**, **Firebase Cloud Functions (Node.js 20)**, **Firebase Hosting**, **Chart.js**, and **Google Maps Platform**.

---

## Project Architecture

```text
/
├── index.html                  # Homepage (Hero search, 16 MP cities, featured listings, analytics, testimonials)
├── style.css                   # Deep Blue & Purple design system, responsive grid, mobile bottom nav
├── app.js                      # Shared header/footer, auth state coordinator, modals, toasts, quota banner
├── firebase.js                 # Firebase Modular SDK setup (paste your project credentials here)
├── js/
│   ├── auth.js                 # Email/password auth, verification, password reset, custom-claim checks
│   ├── database.js             # Realtime Database CRUD, MP cities/localities, rentals, reports, inquiries
│   ├── storage.js              # Multi-image property upload, avatar upload, private verification documents
│   ├── search.js               # Multi-criteria filtering, sorting, pagination, real-data Chart.js analytics
│   ├── properties.js           # Property cards, gallery slider, nearby search, property submission/edit
│   ├── favorites.js            # Realtime Database wishlist sync
│   ├── inquiries.js            # Owner-buyer messaging & WhatsApp deep links
│   ├── dashboard.js            # User dashboard (listings, rentals, payments, verification, notifications)
│   ├── notifications.js        # Realtime Database notification feed & unread badges
│   ├── maps.js                 # Google Maps JS API (@googlemaps/js-api-loader, AdvancedMarkerElement, Places New)
│   └── admin.js                # Admin moderation console gated by auth.token.admin === true
├── pages/
│   ├── login.html
│   ├── register.html
│   ├── search.html
│   ├── property-details.html
│   ├── add-property.html
│   ├── dashboard.html
│   ├── favorites.html
│   ├── profile.html
│   ├── contact.html
│   └── admin.html
├── functions/
│   ├── package.json
│   └── index.js                # Cloud Functions (admin claims, moderation, verification, rental cron)
├── database.rules.json         # Realtime Database security rules & .indexOn indexes
├── storage.rules               # Storage rules protecting verification-documents/{uid}/
├── firebase.json
└── .firebaserc.example
```

---

## 1. Configure Firebase Credentials

1. Create a Firebase project in the [Firebase Console](https://console.firebase.google.com/).
2. Enable **Authentication** -> **Email/Password** provider.
3. Create a **Realtime Database** instance.
4. Enable **Firebase Storage**.
5. Copy your Web App configuration object into `firebase.js`:

```js
const firebaseConfig = {
  apiKey: "PASTE_API_KEY",
  authDomain: "PASTE_AUTH_DOMAIN",
  databaseURL: "PASTE_DATABASE_URL",
  projectId: "PASTE_PROJECT_ID",
  storageBucket: "PASTE_STORAGE_BUCKET",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID"
};
```

6. Copy `.firebaserc.example` to `.firebaserc` and replace `your-firebase-project-id` with your Project ID.

---

## 2. Assign Trusted Admin Custom Claims (Never in Frontend)

Admin privileges are strictly enforced in `database.rules.json`, `storage.rules`, and `functions/index.js` via `request.auth.token.admin === true`. There is no public admin signup.

To promote your first administrator from a trusted local machine or Cloud Shell using the Firebase Admin SDK:

1. Download a **Service Account JSON** key from Firebase Console -> Project Settings -> Service Accounts (never commit or place this inside frontend files).
2. Run a one-off Node.js script with `GOOGLE_APPLICATION_CREDENTIALS` set:

```js
// bootstrap-admin.js (Run locally in a trusted environment only)
const admin = require('firebase-admin');
admin.initializeApp();

const TARGET_UID = 'PASTE_ADMIN_USER_UID';

admin.auth().setCustomUserClaims(TARGET_UID, { admin: true }).then(() => {
  console.log('Custom claim admin:true assigned to', TARGET_UID);
  process.exit(0);
});
```

3. Have the admin user sign out and sign back in so their ID token refreshes with `admin: true`. Subsequent admins can be promoted by an existing admin via the `assignAdminClaim` Cloud Function.

---

## 3. Configure Google Maps Platform

1. Set `VITE_GOOGLE_MAPS_API_KEY` (or `GOOGLE_MAPS_API_KEY`) in your environment before running `npm run build` or `npm run dev`.
2. In Google Cloud Console, enable:
   - **Maps JavaScript API**
   - **Places API (New)**
3. Restrict the API key by **HTTP Referrer** (your domain + localhost) and restrict it strictly to the Maps JavaScript API and Places API (New).

---

## 4. Local Development & Firebase Deployment

```bash
# Install root dependencies
npm install

# Run local development server on port 3000
npm run dev

# Build production bundle into dist/
npm run build

# Install Cloud Functions dependencies
cd functions && npm install && cd ..

# Deploy Security Rules, Cloud Functions, and Hosting
firebase deploy --only database,storage,functions,hosting
```

Once signed into `/pages/admin.html` as an Admin, click **Sync 16 MP Cities & Localities** in the Overview tab to populate `cities/` and `localities/` in Realtime Database.
