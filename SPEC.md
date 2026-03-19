# ChordBook — Application Specification

> **Purpose:** Living reference for the app's architecture, data model, notation format,
> and feature inventory. Update this file whenever a new feature is added or a
> design decision is changed.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Tech Stack](#2-tech-stack)
3. [File Structure](#3-file-structure)
4. [Data Model](#4-data-model)
5. [Storage Layer](#5-storage-layer)
6. [Application State](#6-application-state)
7. [Views & Navigation](#7-views--navigation)
8. [Chord Sheet Format](#8-chord-sheet-format)
   - [Section Headers](#81-section-headers)
   - [Bar Rows](#82-bar-rows)
   - [Chord Tokens](#83-chord-tokens)
   - [Repeat Badge](#84-repeat-badge)
   - [Row-End Annotation Badge](#85-row-end-annotation-badge)
   - [Standalone Annotation Strip](#86-standalone-annotation-strip)
9. [Transposition Engine](#9-transposition-engine)
10. [Organisation — Bands & Gig Tags](#10-organisation--bands--gig-tags)
11. [Build & Export](#11-build--export)
12. [Keyboard Shortcuts](#12-keyboard-shortcuts)
13. [Theming](#13-theming)
14. [Print Layout](#14-print-layout)
15. [Known Limitations & Future Ideas](#15-known-limitations--future-ideas)

---

## 1. Overview

ChordBook is a **single-page, offline-capable chord sheet manager** built for
performing musicians. It is written in vanilla JS (ES modules) with no runtime
framework. The entire app ships as one self-contained HTML file (~53 KB gzipped
~14 KB) that can be opened on any device without a server.

**Core capabilities:**
- Store, search, and browse multiple songs
- Write chord sheets bar-by-bar with rich notation (stabs, breaks, builds, repeats)
- Transpose any song in real time, semitone by semitone or direct key jump
- Tag songs by band and gig date for fast filtered browsing
- Export to a single portable HTML file (`npm run export`)

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Language | Vanilla JavaScript (ES Modules) |
| Build tool | [Vite 5.4.x](https://vitejs.dev) |
| Single-file bundle | [vite-plugin-singlefile 2.0.0](https://github.com/richardtallent/vite-plugin-singlefile) |
| Persistence | `localStorage` (key `chordbook_v1`) |
| Styling | Hand-written CSS, custom properties for theming |
| Fonts | Inter (system fallback), JetBrains Mono (system fallback) |
| No runtime deps | zero npm packages at runtime |

---

## 3. File Structure

```
music-notes/
├── index.html            # App shell — all three view templates live here
├── css/
│   └── style.css         # All styles; dark/light theme; print layout
├── js/
│   ├── chords.js         # Transposition engine (pure functions)
│   ├── storage.js        # localStorage layer + seed data
│   └── app.js            # All UI logic, parser, renderer, event wiring
├── vite.config.js        # vite-plugin-singlefile config
├── package.json
├── .gitignore
├── README.md             # User-facing getting-started guide
└── SPEC.md               # ← this file
```

---

## 4. Data Model

Every song is a plain JSON object stored in a `localStorage` array.

```ts
interface Song {
  id:            string;      // generated: Date.now().toString(36) + random
  title:         string;
  artist:        string;
  key:           string;      // e.g. "C", "Bb", "F#"
  timeSignature: string;      // e.g. "4/4", "3/4", "6/8"
  tempo:         number|null; // BPM, optional
  notes:         string;      // free-text performance notes
  bands:         string[];    // band / project names
  gigTags:       string[];    // e.g. ["Summer Gig 2026-06-14", "Jazz Club 2026-04-12"]
  chordSheet:    string;      // raw text in the notation format (§8)
  createdAt:     string;      // ISO 8601
  updatedAt:     string;      // ISO 8601
}
```

**Gig tag convention:** Any free-text string. If it contains a `YYYY-MM-DD`
substring the tag is sorted chronologically; otherwise alphabetically.

---

## 5. Storage Layer

`js/storage.js` exports a single `Storage` object.

| Method | Signature | Description |
|---|---|---|
| `getAll()` | `→ Song[]` | Returns all songs from localStorage (or `[]`) |
| `get(id)` | `→ Song\|undefined` | Single song lookup by id |
| `save(song)` | `→ Song` | Insert or update (matched by `id`) |
| `delete(id)` | `→ void` | Remove by id |
| `getAllBands()` | `→ string[]` | Sorted unique list of all band names |
| `getAllGigTags()` | `→ string[]` | Sorted (chrono then alpha) unique gig tags |
| `generateId()` | `→ string` | Collision-resistant id |
| `seedIfEmpty()` | `→ void` | Seeds demo songs **only if storage is empty** |

**localStorage key:** `chordbook_v1`

> ⚠️ If the schema ever needs a breaking change, bump the key to `chordbook_v2`
> and add a one-time migration in `seedIfEmpty()` (or a dedicated `migrate()`
> function called at boot).

**Seed songs (shipped with the app):**
1. ARR Medley — AR Rahman / Aarohana band — showcases all notation features
2. Pop Ballad Demo — G major, 4/4
3. 12-Bar Blues in A — A major, 4/4
4. Jazz Waltz Demo — F major, 3/4
5. R&B Groove Demo — Eb major, 4/4

---

## 6. Application State

All mutable state lives in one plain object in `app.js`:

```js
const state = {
  view:            'library',  // 'library' | 'song' | 'editor'
  songs:           [],         // in-memory cache from Storage.getAll()
  currentSongId:   null,       // id of the song currently displayed
  editingSongId:   null,       // id being edited (null = new song)
  transpose:       0,          // semitones offset, −11 … +11
  chordSize:       1.6,        // rem, range 0.85 … 3.8
  theme:           'dark',     // 'dark' | 'light'
  searchQuery:     '',
  pendingDeleteId: null,       // id awaiting delete-confirm modal
  activeBands:     new Set(),  // active band filter pills
  activeGigs:      new Set(),  // active gig filter pills
  editorGigTags:   [],         // staging array for the editor's gig tag input
};
```

State is **not reactive** — functions call explicit render helpers after
mutating state. There is no virtual DOM.

---

## 7. Views & Navigation

```
library ──(tap song)──► song ──(tap ✏️)──► editor
                          ▲                    │
                          └────────────────────┘ (save / cancel)
```

| View id | HTML element | Description |
|---|---|---|
| `view-library` | `#view-library` | Song list, search bar, filter pills, FAB (＋) |
| `view-song` | `#view-song` | Meta bar, tags bar, transpose bar, chord sheet, font controls |
| `view-editor` | `#view-editor` | Form: title, artist, key, time sig, tempo, notes, bands, gig tags, chord sheet textarea |

Views are toggled by adding/removing `.hidden` and `.active` CSS classes via `showView(name)`.

---

## 8. Chord Sheet Format

The chord sheet is stored as plain text and parsed at render time.
Lines are processed top-to-bottom.

---

### 8.1 Section Headers

```
[SectionName]
[SectionName - Song Subtitle]
```

Wrapped in `[…]`. Everything before ` - ` is the **section name**;
everything after is an optional **subtitle** (displayed in italic, useful for
mash-up song names).

**Built-in abbreviations** (case-insensitive):

| Written | Displayed |
|---|---|
| `[in]` or `[i]` | INTRO |
| `[v]` | VERSE |
| `[c]` | CHORUS |
| `[b]` | BRIDGE |
| `[o]` | OUTRO |
| `[d]` | D |
| `[pc]` | PRE-CHORUS |

Any other text is displayed as-is (uppercased).

---

### 8.2 Bar Rows

```
C | Am | F | G
```

Bars are separated by `|`. Each bar can contain **one or more chord tokens**
separated by spaces (multiple chords played within the same bar).

A chord row may optionally end with a **repeat badge** (§8.4) or a
**row-end annotation badge** (§8.5) — see those sections.

**Special single-chord values:**

| Token | Meaning |
|---|---|
| `-` | Rest / empty bar |
| `%` | Repeat previous bar |

---

### 8.3 Chord Tokens

Plain chord: `Am`, `G7`, `Bbmaj7`, `C/E`, `Em7b5`

**Inline annotation tag** — append `(tagname)` directly to any chord to show a
coloured pill under that specific note:

```
C(stab) G(stab) | F(stab) Bb(stab) | G
```

Supported tag names and their colours:

| Tag | Colour |
|---|---|
| `stab` | Purple |
| `break` | Red |
| `build` | Orange |
| `choke` | Yellow |
| `sustain` | Teal |
| `fill` | Indigo |

Any other tag name will render with a default style.

---

### 8.4 Repeat Badge

Append `x<N>` (or `(x<N>)`) after the last bar on a row to render an
**`×N` badge** at the right edge of that row:

```
C | Am | F | G x4
C Bb F x2
```

The badge is styled in the accent colour (yellow/blue depending on theme).

---

### 8.5 Row-End Annotation Badge

Append `| keyword` as the **last segment** of a bar row to attach a compact
coloured badge at the right edge of that row (no new strip line is created):

```
C F | Dm G | C Dm | C G/E | break
C(stab) G(stab) | C(stab) F(stab) | G | sustain
```

Same keyword set and colours as §8.3 inline tags.
This is preferred over a standalone strip when the annotation applies to the
**end of a specific row** rather than a full structural pause.

---

### 8.6 Standalone Annotation Strip

Put the annotation keyword alone on its own line wrapped in `[…]` to render
a **full-width coloured strip** between rows:

```
G | C/E F G x4
[BUILD]

[C]
C | G x2
```

Use this for **large structural breaks** between sections. Recognised keywords:
`BREAK`, `BUILD`, `STAB`, `CHOKE`, `SUSTAIN`, `FILL`, `STOP`.

---

### Full Example

```
[in]
C F | Dm G x2

[V - Anjali]
Am | F G | Am | F C/E | Am | E | Am | Fm | G
G | C(stab)/E F(stab) G(stab) x4
[BUILD]

[C]
C(stab) G(stab) | F(stab) Bb(stab) | G | sustain
```

---

## 9. Transposition Engine

`js/chords.js` — all pure functions, no side effects.

| Export | Signature | Description |
|---|---|---|
| `transposeChord` | `(chord, semitones, useFlats) → string` | Transposes one chord string (handles slash chords, extensions, slash bass) |
| `getTranspositionContext` | `(originalKey, semitones) → {newKey, useFlats}` | Determines target key and whether to spell with flats |
| `semitonesBetweenKeys` | `(fromKey, toKey) → number` | Interval for direct key-jump |
| `ALL_DISPLAY_KEYS` | `string[]` | All 17 enharmonically distinct keys for the selector |

**Flat/sharp spelling:** Automatically follows the target key's convention
(e.g. transposing to Bb spells flats; transposing to A spells sharps).
Override via `useFlats` parameter.

**Transpose range:** −11 to +11 semitones from the original key.
The ±½ step buttons increment by 1 semitone. The key dropdown performs a
direct jump via `semitonesBetweenKeys`.

---

## 10. Organisation — Bands & Gig Tags

### Bands
- Stored as `string[]` on the song.
- Entered in the editor as a comma-separated string, split on save.
- Rendered as **indigo/purple pills** on song cards and the song view.
- Filter bar shows all unique band names; tapping a pill filters the library.
- Multiple band filters are **OR** combined.

### Gig Tags
- Stored as `string[]` on the song.
- Entered one at a time with an ＋ button in the editor; removed with ✕.
- Recommended format: `"Event Name YYYY-MM-DD"` — the date portion enables
  chronological sorting in the filter bar.
- Rendered as **emerald/green pills**.
- Filter bar shows all unique gig tags sorted chronologically.
- Multiple gig filters are **OR** combined.

### Combining Filters
Band and gig filters are combined with **AND** between groups, **OR** within
a group. Search query additionally filters by `title + artist` substring.

---

## 11. Build & Export

```bash
npm run dev      # Vite dev server at http://localhost:5173 (HMR)
npm run build    # Production build → dist/index.html
npm run export   # Build + copy to dist/ChordBook.html (sharable single file)
```

`vite-plugin-singlefile` inlines all JS and CSS into a single HTML file.
No CDN calls, no external assets — works fully offline after download.

Output size: ~53 KB raw / ~14 KB gzip.

---

## 12. Keyboard Shortcuts

| Key | Action |
|---|---|
| `←` / `→` | Transpose −1 / +1 semitone (song view) |
| `0` | Reset transpose to original key |
| `+` / `-` | Increase / decrease chord font size |
| `e` | Open editor for current song |
| `Backspace` | Back to library |
| `Escape` | Close modal / cancel delete |

---

## 13. Theming

Two themes: **dark** (default) and **light**, toggled via the ☀️/🌙 button.
Theme preference is persisted in `localStorage` under key `cb_theme`.

Both themes are defined as CSS custom property blocks on `.dark` and `.light`
classes applied to `<body>`. All colours reference `var(--*)` tokens — no
hard-coded colour values in component styles.

Key tokens: `--bg`, `--surface`, `--surface-2`, `--border`, `--border-2`,
`--text`, `--text-2`, `--text-3`, `--accent`, `--accent-dim`, `--chord`,
`--bar-line`, `--sec-title`, `--danger`.

---

## 14. Print Layout

`@media print` rules in `style.css`:
- Hides all controls (top bar, transpose bar, font controls, FAB, library/editor views)
- Forces `#view-song` visible even if it has `.hidden`
- Overrides all colours to black-on-white
- Annotation strips → light grey background with dark border
- Repeat badges → plain black border, no fill
- `bars-row` switches to `flex-wrap: wrap` so bars don't overflow the page
- `section-block` has `page-break-inside: avoid`

---

## 15. Known Limitations & Future Ideas

### Limitations
- **No sync / cloud backup** — data lives only in the device's `localStorage`
- **New seed songs don't appear for existing users** — `seedIfEmpty()` only
  runs when storage is empty. Workaround: bump storage key to `chordbook_v2`
  with a migration, or add an explicit "Reset to demos" button.
- **No image-based PDF import** — chord sheets must be typed manually.
- **Single localStorage bucket** — all songs share one browser profile;
  no multi-profile or export-per-song yet.
- **No undo in editor** — browser native undo only.

### Future Ideas
- [ ] Export / import songs as JSON (backup & restore, share between devices)
- [ ] Per-song PDF/image export (html2canvas or print-to-PDF)
- [ ] Set list builder — order songs for a specific gig and display them in sequence
- [ ] Auto-scroll during performance (configurable BPM-linked speed)
- [ ] Audio metronome tied to song tempo
- [ ] Chord diagram overlays (guitar / piano voicing popups on tap)
- [ ] Section repeat markers `||: … :||` with visual bracket
- [ ] Global search across chord content (not just title/artist)
- [ ] Version bump / migration helper for schema changes
- [ ] PWA manifest + service worker for home-screen install & offline guarantee
