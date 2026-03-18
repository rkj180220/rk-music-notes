/**
 * chords.js — Chord parsing & transposition engine
 *
 * Handles:
 *  - Simple chords:        C, Am, G, F
 *  - Extended chords:      Cmaj7, Am7, G7, Dm9, Gsus4, Cadd9
 *  - Altered chords:       G7b9, G7#11, Db7#9
 *  - Slash chords:         G/B, C/E, Am/G
 *  - Repeat / rest:        %, -
 */

/* ── Chromatic scales ──────────────────────────────────────────────────── */
const CHROMATIC_SHARPS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const CHROMATIC_FLATS  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];

/**
 * Indices (0-11) whose enharmonic spelling prefers flats.
 * F=5, Bb=10(A#), Eb=3(D#), Ab=8(G#), Db=1(C#), Gb=6(F#)
 */
const FLAT_INDICES = new Set([1, 3, 5, 6, 8, 10]);

/** Keys that explicitly prefer flat notation (for song-level preference). */
const FLAT_KEY_ROOTS = new Set(['F','Bb','Eb','Ab','Db','Gb']);

/* ── Note helpers ──────────────────────────────────────────────────────── */

/** Returns chromatic index 0-11 for a note name (sharp or flat). -1 if unknown. */
function getNoteIndex(note) {
  let i = CHROMATIC_SHARPS.indexOf(note);
  if (i === -1) i = CHROMATIC_FLATS.indexOf(note);
  return i;
}

/** Transpose a single note name by `semitones`, returning sharp or flat spelling. */
function transposeNote(note, semitones, useFlats) {
  const scale = useFlats ? CHROMATIC_FLATS : CHROMATIC_SHARPS;
  const idx = getNoteIndex(note);
  if (idx === -1) return note;               // unknown note → return as-is
  const newIdx = ((idx + semitones) % 12 + 12) % 12;
  return scale[newIdx];
}

/* ── Chord parsing ─────────────────────────────────────────────────────── */

/**
 * Parses a chord string into { root, quality }.
 * root    = note name (e.g. "C", "F#", "Bb")
 * quality = everything after the root (e.g. "maj7", "m7b5", "sus4", "")
 *
 * Returns null for non-chord tokens (%, -, empty).
 */
function parseChord(chord) {
  if (!chord || chord === '%' || chord === '-') return null;
  const m = chord.match(/^([A-G][#b]?)(.*)/s);
  if (!m) return null;
  return { root: m[1], quality: m[2] };
}

/* ── Main transposition ────────────────────────────────────────────────── */

/**
 * Transposes a single chord symbol (may include slash bass).
 * Handles: C, Am7, Gsus4, G/B, C#m9, Bbmaj7, %  −
 */
export function transposeChord(chord, semitones, useFlats) {
  if (!chord) return chord;
  const trimmed = chord.trim();
  if (trimmed === '' || trimmed === '%' || trimmed === '-') return trimmed;

  // Slash chord: "G/B" → transpose numerator and bass independently
  const slashPos = trimmed.lastIndexOf('/');
  if (slashPos > 0) {
    const upper = trimmed.slice(0, slashPos);
    const bass  = trimmed.slice(slashPos + 1);
    const transposedUpper = transposeRootChord(upper, semitones, useFlats);
    const transposedBass  = transposeNote(bass, semitones, useFlats);
    return `${transposedUpper}/${transposedBass}`;
  }

  return transposeRootChord(trimmed, semitones, useFlats);
}

/** Transposes a chord that has no slash (e.g. "Cmaj7" → "Dmaj7"). */
function transposeRootChord(chord, semitones, useFlats) {
  const parsed = parseChord(chord);
  if (!parsed) return chord;
  const newRoot = transposeNote(parsed.root, semitones, useFlats);
  return newRoot + parsed.quality;
}

/* ── Key transposition ─────────────────────────────────────────────────── */

/**
 * Transposes a key name (e.g. "G" → "A" for +2 semitones).
 * Handles minor keys: "Am" → strips 'm', transposes root, reattaches.
 */
function transposeKey(key, semitones, useFlats) {
  if (!key) return key;
  const m = key.match(/^([A-G][#b]?)(m.*)?$/);
  if (!m) return key;
  const newRoot = transposeNote(m[1], semitones, useFlats);
  return newRoot + (m[2] || '');
}

/* ── Flat/sharp preference ─────────────────────────────────────────────── */

/**
 * Given an original key and semitone shift, determines whether the
 * resulting key should use flat accidentals.
 * Returns { displayKey, useFlats }.
 */
export function getTranspositionContext(originalKey, semitones) {
  if (!originalKey) return { displayKey: 'C', useFlats: false };

  // Extract root of original key
  const m = originalKey.match(/^([A-G][#b]?)/);
  if (!m) return { displayKey: originalKey, useFlats: false };

  const rootIdx = getNoteIndex(m[1]);
  if (rootIdx === -1) return { displayKey: originalKey, useFlats: false };

  const newIdx = ((rootIdx + semitones) % 12 + 12) % 12;

  // Determine flat preference based on the new root index
  const useFlats = FLAT_INDICES.has(newIdx);

  const scale = useFlats ? CHROMATIC_FLATS : CHROMATIC_SHARPS;
  const newRoot = scale[newIdx];

  // Re-attach minor suffix if present
  const suffix = originalKey.slice(m[1].length); // e.g. "m" for "Am"
  const displayKey = newRoot + suffix;

  return { displayKey, useFlats };
}

/**
 * Returns the semitone delta to go from originalKey → targetKey
 * in the shortest direction (−6 to +6).
 */
export function semitonesBetweenKeys(fromKey, toKey) {
  const fromM = fromKey.match(/^([A-G][#b]?)/);
  const toM   = toKey.match(/^([A-G][#b]?)/);
  if (!fromM || !toM) return 0;

  const fromIdx = getNoteIndex(fromM[1]);
  const toIdx   = getNoteIndex(toM[1]);
  if (fromIdx === -1 || toIdx === -1) return 0;

  let delta = ((toIdx - fromIdx) + 12) % 12;
  if (delta > 6) delta -= 12;  // prefer shorter path
  return delta;
}

/** All display keys for the transpose key selector. */
export const ALL_DISPLAY_KEYS = ['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
