import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  root: 'src',
  envDir: '../',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/index.html'),
        note: resolve(__dirname, 'src/note.html'),
      },
    },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'Markdown Notes',
        short_name: 'MD Notes',
        description: 'Multi-window WYSIWYG Markdown Editor',
        theme_color: '#2e3440',
        background_color: '#2e3440',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  server: {
    port: 1420,
    strictPort: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
  },
  test: {
    include: ['**/*.test.ts', '**/*.spec.ts'],
    globals: true,
  },
});

