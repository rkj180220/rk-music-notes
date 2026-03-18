# 🎼 ChordBook

A lightweight, mobile-first chord sheet manager built for working musicians.  
Organise chord sheets by **band**, **gig date**, and **key** — with live **transposition** built in.  
Works completely offline. No backend, no account, no app store. Just open a file.

---

## ✨ Features

| | |
|---|---|
| 📖 **Song Library** | Store unlimited chord sheets, search by title / artist / band / gig |
| 🎵 **Bar-by-bar display** | Chords laid out bar-by-bar with section labels (Verse, Chorus, Bridge…) |
| 🎹 **Live transposition** | Shift ±11 semitones or jump directly to any target key — flat/sharp spelling auto-corrects |
| 🎸 **Band tagging** | Tag songs to multiple bands / projects — filter the library by band instantly |
| 📅 **Gig tagging** | Tag songs to gig dates (e.g. `Summer Gig 2026-06-14`) — filter & sort chronologically |
| ✏️ **Built-in editor** | Write chord sheets in a plain-text format with a guided help panel |
| 🖨️ **Print / PDF** | Clean black & white print layout — perfect for paper charts |
| 🌙 **Dark / Light mode** | Toggle and persisted across sessions |
| 📱 **Responsive** | Works on phone, tablet, and desktop |
| 📦 **Single-file export** | One `ChordBook.html` to share via WhatsApp, AirDrop, or email |

---

## 🚀 Getting started

### For playing at a gig (no setup needed)

Grab the latest `ChordBook.html` from [Releases](../../releases), open it in any browser on any device. Done.  
All data is saved in `localStorage` — it stays on your device.

### For development

```bash
git clone https://github.com/rkj180220/rk-music-notes.git
cd rk-music-notes
npm install
npm run dev        # local dev server with hot reload → http://localhost:5173
```

### To build the shareable single file

```bash
npm run export     # → dist/ChordBook.html  (~47 KB, fully self-contained)
```

Send `dist/ChordBook.html` to your phone via WhatsApp, AirDrop, email — open in Chrome or Safari and you're good to go.

---

## 📁 Project structure

```
rk-music-notes/
├── index.html          ← app shell (single page)
├── css/
│   └── style.css       ← all styles, dark + light themes
├── js/
│   ├── chords.js       ← transposition engine (ES module)
│   ├── storage.js      ← localStorage persistence layer (ES module)
│   └── app.js          ← all UI logic (ES module)
├── vite.config.js      ← Vite + vite-plugin-singlefile config
├── package.json
└── README.md
```

> `dist/` is git-ignored — regenerate anytime with `npm run export`.

---

## 🎵 Chord sheet format

```
[Verse]
G  | D  | Em | C
G  | D  | C  | C

[Chorus]
C  | D  | G   | Em
C  | D  | G   | G

[Bridge]
Em | Am | Em  | Am
F  | C  | G   | G
```

| Syntax | Meaning |
|---|---|
| `[Section Name]` | New section heading (Verse, Chorus, Bridge, Intro…) |
| `\|` | Bar line — separates bars on a row |
| `G Am` | Two chords in one bar (space-separated) |
| `G/B` | Slash chord |
| `Cmaj7`, `Am7b5`, `Dsus4` | Any extension or alteration |
| `%` | Repeat previous bar |
| `-` | Rest / empty bar |

---

## 🔁 Transposition

- **−1 / +1** buttons shift all chords up or down by one semitone
- **Reset** returns to the original key
- **Jump to key** dropdown calculates the exact shift automatically
- Flat keys (F, Bb, Eb, Ab, Db, Gb) automatically use flat spellings; sharp keys use sharps

---

## 🎸 Band & Gig organisation

Each song can be tagged with:

- **Bands** — comma-separated in the editor (e.g. `The Groove Band, Solo Project`)
- **Gig Tags** — added one at a time as pills (e.g. `Summer Gig 2026-06-14`)

In the library, filter pills appear automatically. Click any band or gig pill to filter. Multi-select is supported. Gig tags with `YYYY-MM-DD` dates sort chronologically.

---

## ⌨️ Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Alt + ↑` | Transpose up 1 semitone |
| `Alt + ↓` | Transpose down 1 semitone |
| `Alt + R` | Reset transpose |
| `Alt + E` | Open editor for current song |
| `⌘ / Ctrl + N` | New song (from library) |
| `⌘ / Ctrl + S` | Save (in editor) |
| `Esc` | Back / close |

---

## 🛠 Tech stack

- **Vanilla JS (ES modules)** — no framework, no runtime dependencies
- **CSS custom properties** — theming and responsive layout
- **Vite** — dev server + build tool
- **vite-plugin-singlefile** — inlines JS + CSS into one portable `.html`
- **localStorage** — all data stored locally on device

---

## 📄 License

MIT — use it, fork it, gig with it.
