/** @type {import('vite').UserConfig} */
export default {
  esbuild: {
    supported: { 'top-level-await': true },
  },
  build: {
    rollupOptions: {
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
