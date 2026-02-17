---
name: vite-pwa-query-params
description:
  Best practice for configuring Vite PWA (Workbox) to correctly handle URL query
  parameters in precached assets, preventing unexpected fallback to index.html
  (App Shell).
---

# Vite PWA: Handling Query Parameters in Service Worker Routing

## Symptom

When using `vite-plugin-pwa` with the default strategy, requests for precached
assets that include query parameters (e.g., `note.html?id=123`) may fail to
match the cache. This often causes the Service Worker's **Navigation Fallback**
to trigger, serving the App Shell (`index.html`) instead of the specific HTML
file (`note.html`).

**Example Scenario:**

- App has `index.html` (main app) and `note.html` (sub-window/iframe).
- Accessing `note.html` works fine.
- Accessing `note.html?id=123` loads `index.html` inside the iframe, causing
  "inception" or duplicated UI.

## Root Cause

Workbox's precache matching logic, by default, expects an exact URL match. If
query parameters are present and not explicitly ignored, the cache lookup fails.
Consequently, the request is treated as a navigation to an unknown route,
triggering the `navigateFallback` (usually `index.html`).

## Solution

Configure `workbox.ignoreURLParametersMatching` in `vite.config.ts` to tell the
Service Worker to ignore specific (or all) query parameters when matching
against the precache.

### Code Example (`vite.config.ts`)

```typescript
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    VitePWA({
      // ... other config ...
      workbox: {
        // Option 1: Ignore ALL query parameters (Recommended for most static apps)
        ignoreURLParametersMatching: [/.*/],

        // Option 2: Ignore specific parameters only
        // ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^id$/, /^sidebar$/],
      },
    }),
  ],
});
```

## Verification

1. Build the application (`vite build`).
2. Preview locally (`vite preview`) to serve the Service Worker.
3. Access a specific URL with query parameters (e.g.,
   `http://localhost:4173/note.html?foo=bar`).
4. Verify that the correct HTML file is loaded, not the main `index.html`.
