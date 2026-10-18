/**
 * Arabic font embedding for jsPDF.
 *
 * jsPDF ships with the standard PDF base-14 fonts only, none of which carry
 * Arabic glyphs, so an Arabic report has to embed a font of its own. It is
 * fetched at export time rather than bundled, which keeps roughly half a
 * megabyte of font data out of the main JavaScript bundle for the users who
 * never export an Arabic PDF.
 *
 * The font is IBM Plex Sans Arabic (SIL Open Font License, see
 * public/fonts/OFL.txt). It has to cover Latin as well as Arabic: a report
 * carries course codes, employee IDs, dates, and percentages, and jsPDF stops
 * emitting glyphs at the first character the embedded font cannot map. An
 * Arabic-only face such as Noto Sans Arabic has no Latin letters and no `%`,
 * `(`, `)`, or `/`, which silently truncated whole lines.
 */

export const ARABIC_FONT_NAME = 'IBMPlexSansArabic';

const FONT_FILES = {
  normal: 'IBMPlexSansArabic-Regular.ttf',
  bold: 'IBMPlexSansArabic-Bold.ttf',
};

/** Fetched font data, keyed by style. Loaded once per page session. */
const cache = new Map();

/** Converts the raw font bytes to the base64 string jsPDF's VFS expects. */
function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  // Chunked so a quarter-megabyte font does not overflow the call stack.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function loadFont(style) {
  if (cache.has(style)) return cache.get(style);
  const file = FONT_FILES[style];
  const response = await fetch(`/fonts/${file}`);
  if (!response.ok) {
    throw new Error(`Failed to load ${file}: HTTP ${response.status}`);
  }
  const base64 = toBase64(await response.arrayBuffer());
  cache.set(style, base64);
  return base64;
}

/**
 * Registers the Arabic font with a jsPDF document under `ARABIC_FONT_NAME`, in
 * both the normal and bold styles. Rejects if either font file cannot be
 * fetched, which lets the caller fall back to the English report.
 */
export async function registerArabicFont(doc) {
  const [normal, bold] = await Promise.all([loadFont('normal'), loadFont('bold')]);

  doc.addFileToVFS(FONT_FILES.normal, normal);
  doc.addFont(FONT_FILES.normal, ARABIC_FONT_NAME, 'normal');
  doc.addFileToVFS(FONT_FILES.bold, bold);
  doc.addFont(FONT_FILES.bold, ARABIC_FONT_NAME, 'bold');
}
