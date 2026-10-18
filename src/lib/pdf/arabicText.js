import bidiFactory from 'bidi-js';

/**
 * Arabic text preparation for jsPDF.
 *
 * jsPDF draws the code points it is given, left to right, with no OpenType
 * shaping and no bidirectional reordering. Arabic needs both:
 *
 * 1. Shaping — every letter has up to four contextual forms (isolated, final,
 *    initial, medial). They live in the Arabic Presentation Forms-B block
 *    (U+FE70–U+FEFC), so the shaping step rewrites each letter to the form its
 *    neighbours call for.
 * 2. Reordering — the shaped line still has to be flipped into visual order,
 *    while Latin runs, digits, and course codes inside it stay left to right.
 *    That is the Unicode Bidirectional Algorithm, which `bidi-js` implements.
 *
 * The result is a plain string that jsPDF renders correctly, and that stays
 * selectable and searchable in the exported PDF.
 */

const bidi = bidiFactory();

/**
 * Letters that join on both sides, mapped to the isolated form of their
 * presentation-form run. The run is always [isolated, final, initial, medial].
 */
const DUAL_JOINING = {
  'ئ': 0xFE89, 'ب': 0xFE8F, 'ت': 0xFE95, 'ث': 0xFE99, 'ج': 0xFE9D,
  'ح': 0xFEA1, 'خ': 0xFEA5, 'س': 0xFEB1, 'ش': 0xFEB5, 'ص': 0xFEB9,
  'ض': 0xFEBD, 'ط': 0xFEC1, 'ظ': 0xFEC5, 'ع': 0xFEC9, 'غ': 0xFECD,
  'ف': 0xFED1, 'ق': 0xFED5, 'ك': 0xFED9, 'ل': 0xFEDD, 'م': 0xFEE1,
  'ن': 0xFEE5, 'ه': 0xFEE9, 'ي': 0xFEF1,
};

/**
 * Letters that join only to the letter before them. Their run is
 * [isolated, final], so they never take an initial or medial form and they
 * always break the join for whatever follows.
 */
const RIGHT_JOINING = {
  'آ': 0xFE81, 'أ': 0xFE83, 'ؤ': 0xFE85, 'إ': 0xFE87, 'ا': 0xFE8D,
  'ة': 0xFE93, 'د': 0xFEA9, 'ذ': 0xFEAB, 'ر': 0xFEAD, 'ز': 0xFEAF,
  'و': 0xFEED, 'ى': 0xFEEF,
};

/** Lam followed by one of these forms a mandatory ligature. */
const LAM_ALEF = {
  'آ': [0xFEF5, 0xFEF6],
  'أ': [0xFEF7, 0xFEF8],
  'إ': [0xFEF9, 0xFEFA],
  'ا': [0xFEFB, 0xFEFC],
};

/**
 * Marks that sit on a letter without taking part in joining: the short vowels,
 * shadda, sukun, superscript alef, and the Arabic-Indic tatweel decision marks.
 */
const TRANSPARENT = /[ؐ-ًؚ-ٰٟۖ-ۜ۟-۪ۨ-ۭ]/;

const ARABIC_LETTER = /[ء-يٮ-ۓ]/;

/** True when the value contains at least one Arabic letter. */
export function containsArabic(value) {
  return typeof value === 'string' && ARABIC_LETTER.test(value);
}

function isJoiner(ch) {
  // Tatweel joins on both sides and is already a presentation form.
  return ch === 'ـ' || ch in DUAL_JOINING;
}

/** True when `ch` can connect to the letter that follows it. */
function joinsForward(ch) {
  return isJoiner(ch);
}

/** True when `ch` can connect to the letter that precedes it. */
function joinsBackward(ch) {
  return isJoiner(ch) || ch in RIGHT_JOINING;
}

/**
 * Rewrites Arabic letters to their contextual presentation forms, leaving every
 * other character alone. The output is still in logical order.
 */
function shape(text) {
  const out = [];
  const chars = Array.from(text);

  // Neighbour lookups skip transparent marks, so a fatha between two letters
  // does not break their join.
  function prevLetter(i) {
    for (let j = i - 1; j >= 0; j--) {
      if (!TRANSPARENT.test(chars[j])) return chars[j];
    }
    return '';
  }
  function nextLetterIndex(i) {
    for (let j = i + 1; j < chars.length; j++) {
      if (!TRANSPARENT.test(chars[j])) return j;
    }
    return -1;
  }

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const nextIdx = nextLetterIndex(i);
    const next = nextIdx === -1 ? '' : chars[nextIdx];

    // Lam-alef is a required ligature: one glyph replaces the two letters.
    if (ch === 'ل' && next in LAM_ALEF) {
      const connectsBack = joinsForward(prevLetter(i));
      out.push(String.fromCharCode(LAM_ALEF[next][connectsBack ? 1 : 0]));
      // Any transparent marks between the lam and the alef are dropped with the
      // alef itself, which is what the ligature glyph already renders.
      i = nextIdx;
      continue;
    }

    const base = DUAL_JOINING[ch] ?? RIGHT_JOINING[ch];
    if (base === undefined) {
      out.push(ch);
      continue;
    }

    const connectsBack = joinsForward(prevLetter(i));
    const connectsForward = ch in DUAL_JOINING && joinsBackward(next);

    let offset;
    if (connectsBack && connectsForward) offset = 3; // medial
    else if (connectsBack) offset = 1; // final
    else if (connectsForward) offset = 2; // initial
    else offset = 0; // isolated

    out.push(String.fromCharCode(base + offset));
  }

  return out.join('');
}

/**
 * Prepares one line of mixed Arabic and Latin text for jsPDF: shapes the Arabic
 * letters, then reorders the line into visual order with an RTL paragraph
 * direction. Lines with no Arabic are returned unchanged.
 */
export function shapeArabicLine(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (!text || !containsArabic(text)) return text;

  const shaped = shape(text);
  const levels = bidi.getEmbeddingLevels(shaped, 'rtl');
  return bidi.getReorderedString(shaped, levels);
}
