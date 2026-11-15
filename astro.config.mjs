import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// Die kanonische Basis-URL fuer Canonical-Tags, OpenGraph und sitemap.xml.
// Kann beim Deployment ueber PUBLIC_SITE_URL ueberschrieben werden.
const site = process.env.PUBLIC_SITE_URL ?? 'https://suite.andrexthe.dev';

export default defineConfig({
  site,
  output: 'static',
  // Nur HTML-Dokumente prefetchen (keine JS-Islands) — Landing-Bento wird fluessig.
  prefetch: {
    prefetchAll: false,
    defaultStrategy: 'hover',
  },
  trailingSlash: 'ignore',
  integrations: [
    react(),
    sitemap({
      changefreq: 'monthly',
      priority: 0.7,
      lastmod: new Date('2026-11-15'),
    }),
  ],
  server: {
    // Sandbox-/Preview-Umgebungen: externe Subdomains (z. B. *.e2b.app) zulassen.
    allowedHosts: ['.e2b.app'],
  },
  preview: {
    allowedHosts: ['.e2b.app'],
  },
  vite: {
    plugins: [tailwindcss()],
    server: {
      allowedHosts: ['.e2b.app'],
    },
    preview: {
      allowedHosts: ['.e2b.app'],
    },
    build: {
      // Route-Level-Code-Splitting: schwere Krypto-Module werden ausschliesslich
      // ueber dynamische Imports der jeweiligen Tool-Island geladen.
      target: 'es2022',
      rollupOptions: {
        output: {
          manualChunks(id) {
            // viem ist gross -> eigener Lazy-Chunk, nur von Tool-Seiten referenziert
            if (id.includes('node_modules/viem') || id.includes('node_modules/ox')) return 'lib-evm';
            if (id.includes('node_modules/bip322-js') || id.includes('node_modules/bitcoinjs-lib') || id.includes('node_modules/ecpair') || id.includes('node_modules/buffer')) return 'lib-btc-msg';
            if (id.includes('node_modules/@scure/btc-signer') || id.includes('node_modules/@scure/bip32') || id.includes('node_modules/@bitcoinerlab')) return 'lib-btc';
            if (id.includes('node_modules/@noble')) return 'lib-noble';
          },
        },
      },
    },
    worker: {
      format: 'es',
    },
  },
});
