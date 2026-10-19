/**
 * Pins the constants that make the site indexable.
 *
 * Every assertion here stands for a crawler behaviour that is invisible
 * locally and expensive to notice in production: a description that gets
 * truncated in the results page, an hreflang cluster that Google drops
 * because it is not reciprocal, a `Disallow` that hides the `noindex` it was
 * meant to reinforce. None of it is covered by the application tests, because
 * none of it is application code.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import { toArabic, AR_META, SITE } from '../scripts/build-ar-landing.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFileSync(resolve(root, relative), 'utf8');

const landing = read('public/landing.html');
const landingDom = new JSDOM(landing).window.document;

describe('robots.txt', () => {
  const robots = read('public/robots.txt');

  it('points crawlers at the sitemap', () => {
    expect(robots).toMatch(/^Sitemap: https:\/\/.+\/sitemap\.xml$/m);
  });

  it('allows crawling', () => {
    expect(robots).toMatch(/^Allow: \/$/m);
  });

  // The dashboard is kept out of the index by an X-Robots-Tag header, which a
  // crawler can only read if it is allowed to fetch the page. Disallowing the
  // path would hide that header and strand anything already indexed.
  it('does not disallow /app/, which would hide its noindex header', () => {
    expect(robots).not.toMatch(/^Disallow: \/app/m);
  });
});

describe('sitemap.xml', () => {
  const sitemap = read('public/sitemap.xml');
  const document = new JSDOM(sitemap, { contentType: 'text/xml' }).window.document;

  it('is well-formed XML', () => {
    expect(document.querySelector('parsererror')).toBeNull();
  });

  it('lists both indexable pages and nothing else', () => {
    const urls = [...document.querySelectorAll('loc')].map((node) => node.textContent);
    expect(urls).toEqual([`${SITE}/`, `${SITE}/ar/`]);
  });

  // A cluster Google will act on has to name every page in the set, including
  // the page it appears on, and say the same thing from both sides.
  it('gives every page a reciprocal hreflang cluster', () => {
    for (const url of document.querySelectorAll('url')) {
      const alternates = [...url.getElementsByTagName('xhtml:link')].map((node) => [
        node.getAttribute('hreflang'),
        node.getAttribute('href'),
      ]);
      expect(Object.fromEntries(alternates)).toEqual({
        en: `${SITE}/`,
        ar: `${SITE}/ar/`,
        'x-default': `${SITE}/`,
      });
    }
  });
});

describe('landing page head', () => {
  it('keeps the description inside the length search results show', () => {
    const description = landingDom
      .querySelector('meta[name="description"]')
      .getAttribute('content');
    expect(description.length).toBeLessThanOrEqual(160);
  });

  it('declares the full hreflang cluster', () => {
    const alternates = [...landingDom.querySelectorAll('link[rel="alternate"]')].map((node) => [
      node.getAttribute('hreflang'),
      node.getAttribute('href'),
    ]);
    expect(Object.fromEntries(alternates)).toEqual({
      en: `${SITE}/`,
      ar: `${SITE}/ar/`,
      'x-default': `${SITE}/`,
    });
  });

  it('is canonical for itself, with the trailing slash the URL actually has', () => {
    expect(landingDom.querySelector('link[rel="canonical"]').getAttribute('href')).toBe(`${SITE}/`);
    expect(landingDom.querySelector('meta[property="og:url"]').getAttribute('content')).toBe(
      `${SITE}/`,
    );
  });

  it('declares a share image with its dimensions', () => {
    expect(landingDom.querySelector('meta[property="og:image"]').getAttribute('content')).toBe(
      `${SITE}/og-image.png`,
    );
    expect(
      landingDom.querySelector('meta[property="og:image:width"]').getAttribute('content'),
    ).toBe('1200');
    expect(
      landingDom.querySelector('meta[property="og:image:height"]').getAttribute('content'),
    ).toBe('630');
  });

  // Ignored by Google since 2009, and it publishes the terms the page is
  // trying to rank for to anyone who views the source.
  it('carries no keywords meta', () => {
    expect(landingDom.querySelector('meta[name="keywords"]')).toBeNull();
  });
});

describe('the dashboard preview on the landing page', () => {
  const figure = landingDom.querySelector('.preview');
  const image = figure.querySelector('img');

  it('offers WebP with a PNG fallback', () => {
    expect(figure.querySelector('source').getAttribute('srcset')).toBe('/dashboard-screenshot.webp');
    expect(image.getAttribute('src')).toBe('/dashboard-screenshot.png');
  });

  // Without an intrinsic size the browser cannot reserve the box, and the
  // text below the image jumps once the file arrives.
  it('declares its intrinsic size', () => {
    expect(image.getAttribute('width')).toBe('1600');
    expect(image.getAttribute('height')).toBe('1000');
  });

  it('defers the download, being below the fold', () => {
    expect(image.getAttribute('loading')).toBe('lazy');
  });

  it('describes itself in both languages', () => {
    expect(image.getAttribute('alt').length).toBeGreaterThan(20);
    expect(image.dataset.arAlt).toMatch(/[\u0600-\u06FF]/);
  });

  // The page is served over a connection the visitor did not choose, and the
  // image is the heaviest thing on it.
  it.each([
    ['public/dashboard-screenshot.webp'],
    ['public/dashboard-screenshot.png'],
  ])('ships %s under 300KB', (file) => {
    expect(statSync(resolve(root, file)).size).toBeLessThan(300 * 1024);
  });
});

describe('language switch', () => {
  // The two languages used to be one page swapping its own text in the
  // browser, which left the Arabic unreachable to a crawler. The switch has to
  // stay a real link to a real address for the Arabic page to be indexable.
  it('is a link to /ar/, not a script that rewrites the page', () => {
    const toggle = landingDom.getElementById('langBtn');
    expect(toggle.tagName).toBe('A');
    expect(toggle.getAttribute('href')).toBe('/ar/');
    expect(landing).not.toMatch(/toggleLang|navigator\.language/);
  });
});

describe('toArabic', () => {
  const fixture = `<!DOCTYPE html>
<html lang="en">
<head>
  <title>English title</title>
  <meta name="description" content="English description">
  <link rel="canonical" href="${SITE}/">
  <meta property="og:url" content="${SITE}/">
  <meta property="og:locale" content="en_US">
  <meta property="og:locale:alternate" content="ar_SA">
</head>
<body>
  <h1 data-en="Compliance" data-ar="الامتثال">Compliance</h1>
  <p data-en="Only English">Only English</p>
  <img src="/shot.png" alt="English alt" data-ar-alt="نص بديل عربي">
  <a id="langBtn" href="/ar/" hreflang="ar" lang="ar">العربية</a>
</body>
</html>`;

  const document = new JSDOM(toArabic(fixture)).window.document;

  it('turns the page right to left', () => {
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
  });

  // Text in an attribute is not text a crawler indexes; the point of the
  // build step is to move it into the document body.
  it('writes the translation into the element, not an attribute', () => {
    const heading = document.querySelector('h1');
    expect(heading.textContent).toBe('الامتثال');
    expect(heading.hasAttribute('data-ar')).toBe(false);
    expect(heading.hasAttribute('data-en')).toBe(false);
  });

  it('ships no leftover translation attributes at all', () => {
    expect(document.querySelectorAll('[data-ar], [data-en]')).toHaveLength(0);
  });

  it('replaces the head with the Arabic one', () => {
    expect(document.title).toBe(AR_META.title);
    expect(document.querySelector('meta[name="description"]').getAttribute('content')).toBe(
      AR_META.description,
    );
    expect(document.querySelector('link[rel="canonical"]').getAttribute('href')).toBe(`${SITE}/ar/`);
    expect(document.querySelector('meta[property="og:url"]').getAttribute('content')).toBe(
      `${SITE}/ar/`,
    );
    expect(document.querySelector('meta[property="og:locale"]').getAttribute('content')).toBe(
      'ar_SA',
    );
    expect(
      document.querySelector('meta[property="og:locale:alternate"]').getAttribute('content'),
    ).toBe('en_US');
  });

  it('translates an image description', () => {
    const image = document.querySelector('img');
    expect(image.getAttribute('alt')).toBe('نص بديل عربي');
    expect(image.hasAttribute('data-ar-alt')).toBe(false);
  });

  it('points the language switch back at the English page', () => {
    const toggle = document.getElementById('langBtn');
    expect(toggle.textContent).toBe('English');
    expect(toggle.getAttribute('href')).toBe('/');
    expect(toggle.getAttribute('hreflang')).toBe('en');
  });

  it('leaves the real landing page translatable without throwing', () => {
    const output = new JSDOM(toArabic(landing)).window.document;
    expect(output.documentElement.dir).toBe('rtl');
    expect(output.querySelectorAll('[data-ar], [data-en]')).toHaveLength(0);
  });
});

describe('app shell', () => {
  // The dashboard is an empty shell until someone loads their own data into
  // it. The header in vercel.json covers the router-only paths; this tag
  // covers the document itself.
  it('is marked noindex', () => {
    const document = new JSDOM(read('app.html')).window.document;
    expect(document.querySelector('meta[name="robots"]').getAttribute('content')).toMatch(
      /noindex/,
    );
  });

  // Vercel checks the filesystem before it applies a rewrite, so an
  // `index.html` entry would answer `/` itself and the landing page would
  // never be served there.
  it('does not build to index.html', () => {
    const config = read('vite.config.js');
    expect(config).toMatch(/input: \{ app: resolve\(root, 'app\.html'\) \}/);
  });
});

describe('vercel.json', () => {
  const config = JSON.parse(read('vercel.json'));

  // `routes` is mutually exclusive with these keys: Vercel refuses the build
  // if both are present.
  it('uses modern routing keys, not the legacy routes array', () => {
    expect(config.routes).toBeUndefined();
    expect(config.rewrites).toBeDefined();
    expect(config.headers).toBeDefined();
  });

  // `/app/` needs its own rule. `:path*` is documented as matching zero or
  // more segments, but it does not match the empty segment a trailing slash
  // leaves behind, so `/app/` fell through to a 404 in production while both
  // `/app` and `/app/anything` were served.
  it('serves the landing page at / and the dashboard under /app', () => {
    expect(config.rewrites).toEqual([
      { source: '/', destination: '/landing.html' },
      { source: '/app', destination: '/app.html' },
      { source: '/app/', destination: '/app.html' },
      { source: '/app/:path*', destination: '/app.html' },
    ]);
  });

  // Two addresses for one page splits whatever authority it earns.
  it('redirects the duplicate /landing.html to /', () => {
    expect(config.redirects).toContainEqual({
      source: '/landing.html',
      destination: '/',
      permanent: true,
    });
  });

  it('sends noindex for every /app path', () => {
    const noindex = config.headers
      .filter((rule) =>
        rule.headers.some((header) => header.key === 'X-Robots-Tag' && header.value === 'noindex'),
      )
      .map((rule) => rule.source);
    expect(noindex).toEqual(['/app', '/app/(.*)']);
  });
});
