import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

// Some installs hoist a newer @firebase/app (pulled in by firebase-admin) next
// to firebase@9, leaving firebase/auth and firebase/firestore registering their
// components on a different instance than firebase/app. The browser bundle then
// dies with "Component auth has not been registered yet" and the whole app is
// blank. firebase@9 keeps a matching runtime inside its own node_modules: use it
// whenever it exists, and do nothing on installs where firebase has one copy.
const firebaseRuntime = (pkg: string) =>
  path.resolve(__dirname, 'node_modules/firebase/node_modules/@firebase', pkg);
const hasNestedFirebaseRuntime = fs.existsSync(
  path.resolve(__dirname, 'node_modules/firebase/node_modules/@firebase/app/package.json')
);

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        ...(hasNestedFirebaseRuntime
          ? {
              '@firebase/app': firebaseRuntime('app'),
              '@firebase/app-compat': firebaseRuntime('app-compat'),
              '@firebase/component': firebaseRuntime('component'),
              '@firebase/logger': firebaseRuntime('logger'),
              '@firebase/util': firebaseRuntime('util'),
            }
          : {}),
      },
    },
    build: {
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('firebase')) return 'firebase-vendor';
              if (id.includes('lucide-react') || id.includes('emoji-picker-react') || id.includes('date-fns')) return 'ui-vendor';
              return 'vendor';
            }
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
