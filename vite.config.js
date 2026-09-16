import { fileURLToPath, URL } from 'node:url'

/** @type {import('vite').UserConfig} */
export default {
  esbuild: {
    supported: { 'top-level-await': true },
  },
  build: {
    rollupOptions: {
      // Second entry for the minimal admin/ops dashboard (src/admin.ts). Kept
      // as its own page + bundle rather than a route inside the main SPA so
      // admin-only code never ships in the bundle every regular visitor loads.
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        admin: fileURLToPath(new URL('./admin.html', import.meta.url)),
      },
      output: {
        manualChunks: {
          'firebase-auth': ['firebase/auth'],
          'firebase-firestore': ['firebase/firestore'],
          'firebase-storage': ['firebase/storage'],
          'firebase-messaging': ['firebase/messaging'],
          'firebase-functions': ['firebase/functions'],
          'firebase-app': ['firebase/app'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
}
