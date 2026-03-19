/**
 * storage.js — LocalStorage persistence layer
 *
 * Song schema:
 * {
 *   id:            string   (unique, generated)
 *   title:         string
 *   artist:        string
 *   key:           string   ("C", "Bb", "F#", …)
 *   timeSignature: string   ("4/4", "3/4", "6/8", …)
 *   tempo:         number | null
 *   notes:         string   (performance notes)
 *   bands:         string[] (band / project names)
 *   gigTags:       string[] (gig date labels, e.g. "Summer Gig 2026-06-14")
 *   chordSheet:    string   (raw text in format guide format)
 *   createdAt:     ISO string
 *   updatedAt:     ISO string
 * }
 */

const STORAGE_KEY = 'chordbook_v1';

export const Storage = {

  /** Return all songs (sorted by title). */
  getAll() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  },

  /** Return a single song by id, or undefined. */
  get(id) {
    return this.getAll().find(s => s.id === id);
  },

  /** Insert or update a song (matched by id). */
  save(song) {
    const all = this.getAll();
    const idx = all.findIndex(s => s.id === song.id);
    if (idx >= 0) {
      all[idx] = song;
    } else {
      all.push(song);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    return song;
  },

  /** Remove a song by id. */
  delete(id) {
    const filtered = this.getAll().filter(s => s.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  },

  /** Return sorted unique list of all band names across all songs. */
  getAllBands() {
    const set = new Set();
    this.getAll().forEach(s => (s.bands || []).forEach(b => b && set.add(b.trim())));
    return [...set].sort((a, b) => a.localeCompare(b));
  },

  /** Return sorted unique list of all gig tags across all songs. */
  getAllGigTags() {
    const set = new Set();
    this.getAll().forEach(s => (s.gigTags || []).forEach(g => g && set.add(g.trim())));
    // Sort: tags that look like dates sort chronologically, others alphabetically
    return [...set].sort((a, b) => {
      const da = extractDate(a), db = extractDate(b);
      if (da && db) return da.localeCompare(db);
      if (da) return 1;   // dated tags after undated
      if (db) return -1;
      return a.localeCompare(b);
    });
  },
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  },

  /** Seed demo songs if storage is empty. */
  seedIfEmpty() {
    if (this.getAll().length > 0) return;

    const now = new Date().toISOString();
    const demos = [
      {
        id: this.generateId(),
        title: 'ARR Medley',
        artist: 'AR Rahman',
        key: 'C',
        timeSignature: '4/4',
        tempo: null,
        notes: 'Medley: Netru Illaadha Maatram · Anjali · Chinna Chinna Aasai\nPop feel · Band: Aarohana',
        bands: ['Aarohana'],
        gigTags: [],
        chordSheet:
`[in]
C F | Dm G x2

[V - netru illaadha maatram]
C F | Dm G | C F | Dm G | C Dm | C G/E | break

[C]
C F | C | C F | C
C(stab) G(stab) | C(stab) F(stab) | C(stab) Bb(stab) | G | sustain

[D]
C | Bb | C Bb | F G | C x2
C Bb F x2
C Cm G x4
Cm Fm | G | build

[D]
C | F G x2

[V - Anjali]
Am | F G | Am | F C/E | Am | E | Am | Fm | G
G | C(stab)/E F(stab) G(stab) x4
[BUILD]

[C]
C | G x2

[V - chinna chinna aasai]
C | Dm | C F | F G | C F G | C | G | break

[C - chinna chinna aasai]
C G | F | Gm x4
F G | C G | break
C(stab) G(stab) | C(stab) x3`,

        createdAt: now,
        updatedAt: now,
      },
      {
        id: this.generateId(),
        title: 'Pop Ballad Demo',
        artist: 'Demo Song',
        key: 'G',
        timeSignature: '4/4',
        tempo: 72,
        notes: 'Capo 0 · Slow, spacious feel',
        bands: ['The Groove Band', 'Solo Project'],
        gigTags: ['Summer Gig 2026-06-14', 'Rooftop Sessions 2026-07-04'],
        chordSheet:
`[Intro]
G | D | Em | C

[Verse 1]
G | D | Em | C
G | D | C  | C

[Pre-Chorus]
Am | Em | F | G
Am | Em | F | G

[Chorus]
C | D | G  | Em
C | D | G  | G
C | D | Em | Am
F | G | C  | C

[Verse 2]
G | D | Em | C
G | D | C  | C

[Pre-Chorus]
Am | Em | F | G
Am | Em | F | G

[Chorus]
C | D | G  | Em
C | D | G  | G
C | D | Em | Am
F | G | C  | C

[Bridge]
Em | Am | Em | Am
F  | C  | G  | G

[Chorus]
C | D | G  | Em
C | D | G  | G
C | D | Em | Am
F | G | C  | C

[Outro]
G | D | Em | C
G | D | C  | C
G`,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: this.generateId(),
        title: '12-Bar Blues in A',
        artist: 'Demo Song',
        key: 'A',
        timeSignature: '4/4',
        tempo: 104,
        notes: 'Shuffle feel (♩=♩♪) · Standard 12-bar form',
        bands: ['Blues Collective'],
        gigTags: ['Blues Night 2026-05-20', 'Summer Gig 2026-06-14'],
        chordSheet:
`[Head — 12-Bar Blues]
A7 | A7 | A7 | A7
D7 | D7 | A7 | A7
E7 | D7 | A7 | E7

[Head — 12-Bar Blues]
A7 | A7 | A7 | A7
D7 | D7 | A7 | A7
E7 | D7 | A7 | A7

[Solo Changes — 12-Bar Blues]
A7 | A7 | A7 | A7
D7 | D7 | A7 | A7
E7 | D7 | A7 | E7`,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: this.generateId(),
        title: 'Jazz Waltz Demo',
        artist: 'Demo Song',
        key: 'F',
        timeSignature: '3/4',
        tempo: 138,
        notes: 'Swung waltz · Play lightly on 2 & 3',
        bands: ['Jazz Quartet'],
        gigTags: ['Jazz Club 2026-04-12', 'Rooftop Sessions 2026-07-04'],
        chordSheet:
`[A Section]
Fmaj7 | Em7b5 A7 | Dm7   | Dm7
Gm7   | C7        | Fmaj7 | Fmaj7

[B Section]
Bb maj7 | Bbm7 Eb7 | Fmaj7  | Fmaj7
Dm7     | G7        | Cmaj7  | C7

[A Section]
Fmaj7 | Em7b5 A7 | Dm7   | Dm7
Gm7   | C7        | Fmaj7 | Fmaj7`,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: this.generateId(),
        title: 'R&B Groove Demo',
        artist: 'Demo Song',
        key: 'Eb',
        timeSignature: '4/4',
        tempo: 90,
        notes: 'Pocket groove · Lots of space',
        bands: ['The Groove Band', 'R&B Project'],
        gigTags: ['Corporate Event 2026-08-22'],
        chordSheet:
`[Intro]
Ebmaj7 | Abmaj7 | Fm7 | Bb7

[Verse]
Ebmaj7 | Abmaj7 | Fm7 | Bb7
Ebmaj7 | Abmaj7 | Fm7 | Bb7 Eb7

[Pre-Chorus]
Abmaj7 | Abm7 Db7 | Ebmaj7 | Cm7
Fm7    | Bb7       | Bb7    | Bb7

[Chorus]
Ebmaj7 | Cm7    | Fm7 | Bb7
Ebmaj7 | Cm7    | Fm7 | Bb7

[Bridge]
Gm7 | Cm7 | Fm7 | Bb7
Gm7 | Cm7 | Fm7 | Bb7 Eb7

[Chorus]
Ebmaj7 | Cm7 | Fm7 | Bb7
Ebmaj7 | Cm7 | Fm7 | Bb7`,
        createdAt: now,
        updatedAt: now,
      },
    ];

    demos.forEach(s => this.save(s));
  },
};

/* ════════════════════════════════════════════════════════════
   SET LIST STORAGE
   Schema: { id, name, gigTag, songIds: string[], createdAt, updatedAt }
════════════════════════════════════════════════════════════ */
const SETLIST_KEY = 'chordbook_setlists_v1';

export const SetListStorage = {
  getAll() {
    try { return JSON.parse(localStorage.getItem(SETLIST_KEY)) || []; }
    catch { return []; }
  },
  get(id)       { return this.getAll().find(sl => sl.id === id); },
  save(setlist) {
    const all = this.getAll();
    const idx = all.findIndex(sl => sl.id === setlist.id);
    if (idx >= 0) all[idx] = setlist; else all.push(setlist);
    localStorage.setItem(SETLIST_KEY, JSON.stringify(all));
    return setlist;
  },
  delete(id) {
    localStorage.setItem(SETLIST_KEY, JSON.stringify(this.getAll().filter(sl => sl.id !== id)));
  },
  generateId() {
    return 'sl' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  },
};

/**
 * Extracts a YYYY-MM-DD date string from a gig tag label, if present.
 * e.g. "Summer Gig 2026-06-14" → "2026-06-14"
 * Returns null if no date pattern found.
 */
function extractDate(tag) {
  const m = (tag || '').match(/\b(\d{4}-\d{2}-\d{2})\b/);
  return m ? m[1] : null;
}
