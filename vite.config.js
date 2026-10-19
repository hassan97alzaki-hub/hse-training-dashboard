import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

/**
 * Reproduces the production routing in the dev server. Vercel rewrites `/` to
 * the landing page and every `/app` path to the dashboard shell; without this
 * the dev server would look for an `index.html` that the build no longer has.
 */
function devRouting() {
  return {
    name: 'dev-routing',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const path = req.url.split('?')[0];
        if (path === '/') req.url = '/landing.html';
        else if (path === '/app' || path.startsWith('/app/')) req.url = '/app.html';
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devRouting()],
  build: {
    // The dashboard builds to `app.html`, not `index.html`. Vercel checks the
    // filesystem before it applies a rewrite, so a `dist/index.html` would
    // answer `/` itself and the landing page would never be served there.
    rollupOptions: { input: { app: resolve(root, 'app.html') } },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.js'],
  },
});
