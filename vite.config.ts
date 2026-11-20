import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  const mapsApiKey =
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    '';

  return {
    define: {
      __SKSARS_MAPS_API_KEY__: JSON.stringify(mapsApiKey),
    },
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          login: path.resolve(__dirname, 'pages/login.html'),
          register: path.resolve(__dirname, 'pages/register.html'),
          search: path.resolve(__dirname, 'pages/search.html'),
          propertyDetails: path.resolve(__dirname, 'pages/property-details.html'),
          addProperty: path.resolve(__dirname, 'pages/add-property.html'),
          dashboard: path.resolve(__dirname, 'pages/dashboard.html'),
          favorites: path.resolve(__dirname, 'pages/favorites.html'),
          profile: path.resolve(__dirname, 'pages/profile.html'),
          contact: path.resolve(__dirname, 'pages/contact.html'),
          admin: path.resolve(__dirname, 'pages/admin.html'),
        },
      },
    },
    plugins: [
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
