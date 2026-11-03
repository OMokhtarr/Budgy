/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      devOptions: { enabled: false },
      includeAssets: ['favicon-32.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Budgy — Budget & Spending Tracker',
        short_name: 'Budgy',
        description: 'Track your spending, income and budgets',
        theme_color: '#10b981',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          // The ring stays inside the maskable safe zone (it reaches 70% of the radius; 80% is safe), so the
          // same full-bleed icon works masked. Listed separately: "any maskable" in one entry is discouraged.
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5175 },
  // Threads, not child processes: PGlite (WASM Postgres, used by the Supabase schema test) crashes a forked worker on exit on Windows.
  test: { include: ['src/**/*.test.ts'], environment: 'node', pool: 'threads' },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-ui': ['react', 'react-dom', 'react-router-dom', '@ionic/react', '@ionic/react-router', 'ionicons'],
          'vendor-db': ['dexie', 'dexie-react-hooks'],
          'vendor-i18n': ['i18next', 'react-i18next'],
        },
      },
    },
  },
});
