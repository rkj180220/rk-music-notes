/**
 * app.js — ChordBook main application
 *
 * Views:  library  →  song  ←→  editor
 * State is kept in a plain object; UI is re-rendered on change.
 */
import { transposeChord, getTranspositionContext, semitonesBetweenKeys, ALL_DISPLAY_KEYS } from './chords.js';
import { Storage, SetListStorage } from './storage.js';

/* ════════════════════════════════════════════════════════════
   STATE
════════════════════════════════════════════════════════════ */
const state = {
  view:            'library',   // 'library' | 'song' | 'editor'
  songs:           [],
  currentSongId:   null,
  editingSongId:   null,        // null = new song
  transpose:       0,           // semitones, range −11..+11
  chordSize:       1.6,         // rem
  theme:           'dark',
  searchQuery:     '',
  pendingDeleteId: null,
  // Filtering
  activeBands:     new Set(),   // selected band filter pills
  activeGigs:      new Set(),   // selected gig filter pills
  // Editor gig tag staging
  editorGigTags:   [],
  // Set list
  activeSetListId:  null,   // id of set list currently being performed
  setListPosition:  0,      // current song index within the set list
  editingSetListId: null,   // null = new set list
  editorSetListSongs: [],   // staging array of song ids (ordered)
};

/* ════════════════════════════════════════════════════════════
   BOOTSTRAP
════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  // Theme
  state.theme = localStorage.getItem('cb_theme') || 'dark';
  applyTheme();

  // Data
  Storage.seedIfEmpty();
  state.songs = Storage.getAll();

  // UI wiring
  setupEventListeners();
  populateKeySelector();

  // Initial view
  renderLibrary();
});

/* ════════════════════════════════════════════════════════════
   THEME
════════════════════════════════════════════════════════════ */
function applyTheme() {
  document.body.className = state.theme;
  document.getElementById('btn-theme').textContent = state.theme === 'dark' ? '☀️' : '🌙';
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('cb_theme', state.theme);
  applyTheme();
}

/* ════════════════════════════════════════════════════════════
   VIEW NAVIGATION
════════════════════════════════════════════════════════════ */
function showView(viewName) {
  document.querySelectorAll('.view').forEach(el => {
    el.classList.toggle('hidden', true);
    el.classList.toggle('active', false);
  });
  const target = document.getElementById(`view-${viewName}`);
  target.classList.remove('hidden');
  target.classList.add('active');
  state.view = viewName;
  window.scrollTo({ top: 0, behavior: 'instant' });
}

/* ════════════════════════════════════════════════════════════
   LIBRARY VIEW
════════════════════════════════════════════════════════════ */
function renderLibrary() {
  showView('library');

  // Build filter pills from all available tags
  renderFilterBar();

  const query = state.searchQuery.toLowerCase().trim();
  let filtered = state.songs.slice();

  // Text search
  if (query) {
    filtered = filtered.filter(s =>
      s.title.toLowerCase().includes(query) ||
      (s.artist || '').toLowerCase().includes(query) ||
      (s.bands || []).some(b => b.toLowerCase().includes(query)) ||
      (s.gigTags || []).some(g => g.toLowerCase().includes(query))
    );
  }

  // Band filter
  if (state.activeBands.size > 0) {
    filtered = filtered.filter(s =>
      (s.bands || []).some(b => state.activeBands.has(b))
    );
  }

  // Gig filter
  if (state.activeGigs.size > 0) {
    filtered = filtered.filter(s =>
      (s.gigTags || []).some(g => state.activeGigs.has(g))
    );
  }

  filtered.sort((a, b) => a.title.localeCompare(b.title));

  const listEl  = document.getElementById('song-list');
  const emptyEl = document.getElementById('empty-state');

  if (filtered.length === 0) {
    listEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }

  emptyEl.classList.add('hidden');
  listEl.innerHTML = filtered.map(song => {
    const bpmChip = song.tempo
      ? `<span class="chip chip-bpm">${song.tempo} BPM</span>` : '';

    const bandChips = (song.bands || []).map(b =>
      `<span class="chip chip-band" data-filter-band="${esc(b)}" title="Filter by band">${esc(b)}</span>`
    ).join('');

    const gigChips = (song.gigTags || []).map(g =>
      `<span class="chip chip-gig" data-filter-gig="${esc(g)}" title="Filter by gig">${esc(g)}</span>`
    ).join('');

    const tagRow = (bandChips || gigChips)
      ? `<div class="song-card-tags">${bandChips}${gigChips}</div>` : '';

    return `
      <div class="song-card">
        <div class="song-card-body" data-action="open" data-id="${song.id}">
          <div class="song-card-main">
            <div class="song-card-title">${esc(song.title)}</div>
            <span class="song-card-artist">${esc(song.artist || '')}</span>
            ${tagRow}
          </div>
          <div class="song-card-chips">
            <span class="chip chip-key">${esc(song.key || 'C')}</span>
            <span class="chip chip-time">${esc(song.timeSignature || '4/4')}</span>
            ${bpmChip}
          </div>
        </div>
        <div class="song-card-btns">
          <button class="card-btn" data-action="edit"   data-id="${song.id}" title="Edit">✏️</button>
          <button class="card-btn del" data-action="delete" data-id="${song.id}" title="Delete">🗑️</button>
        </div>
      </div>`;
  }).join('');
}

/* ── Filter bar ──────────────────────────────────────────────────────────── */
function renderFilterBar() {
  const allBands   = Storage.getAllBands();
  const allGigs    = Storage.getAllGigTags();
  const filterBar  = document.getElementById('filter-bar');
  const bandsEl    = document.getElementById('filter-bands');
  const gigsEl     = document.getElementById('filter-gigs');
  const clearBtn   = document.getElementById('btn-clear-filters');
  const bandsSec   = document.getElementById('filter-bands-section');
  const gigsSec    = document.getElementById('filter-gigs-section');

  const hasAny = allBands.length > 0 || allGigs.length > 0;
  filterBar.classList.toggle('hidden', !hasAny);

  bandsSec.style.display = allBands.length ? '' : 'none';
  gigsSec.style.display  = allGigs.length  ? '' : 'none';

  bandsEl.innerHTML = allBands.map(b => {
    const active = state.activeBands.has(b);
    return `<button class="filter-pill${active ? ' active' : ''}" data-band="${esc(b)}">${esc(b)}</button>`;
  }).join('');

  gigsEl.innerHTML = allGigs.map(g => {
    const active = state.activeGigs.has(g);
    return `<button class="filter-pill${active ? ' active' : ''}" data-gig="${esc(g)}">${esc(g)}</button>`;
  }).join('');

  const anyActive = state.activeBands.size > 0 || state.activeGigs.size > 0;
  clearBtn.classList.toggle('hidden', !anyActive);
}

/* ════════════════════════════════════════════════════════════
   SONG VIEW
════════════════════════════════════════════════════════════ */
function openSong(id) {
  // Clear any active set list context
  if (state.activeSetListId) {
    state.activeSetListId = null;
    state.setListPosition = 0;
    document.getElementById('setlist-nav-bar').classList.add('hidden');
  }
  const song = Storage.get(id);
  if (!song) return;
  state.currentSongId = id;
  state.transpose     = 0;
  state.chordSize     = 1.6;
  renderSongView(song);
  showView('song');
}

function renderSongView(song) {
  const { displayKey, useFlats } = getTranspositionContext(song.key, state.transpose);

  // Header
  document.getElementById('song-view-title').textContent  = song.title;
  document.getElementById('song-view-artist').textContent = song.artist || '';

  // Meta bar
  document.getElementById('display-key').textContent   = displayKey;
  document.getElementById('display-time').textContent  = song.timeSignature || '4/4';
  document.getElementById('display-tempo').textContent = song.tempo || '—';

  const notesWrap = document.getElementById('meta-notes-wrap');
  const notesEl   = document.getElementById('display-notes');
  if (song.notes) {
    notesEl.textContent = song.notes;
    notesWrap.classList.remove('hidden');
  } else {
    notesWrap.classList.add('hidden');
  }

  // Tags bar (bands + gigs)
  const tagsBar   = document.getElementById('song-tags-bar');
  const tagsInner = document.getElementById('song-tags-inner');
  const bands     = song.bands   || [];
  const gigs      = song.gigTags || [];
  if (bands.length > 0 || gigs.length > 0) {
    tagsInner.innerHTML =
      bands.map(b => `<span class="chip chip-band">${esc(b)}</span>`).join('') +
      gigs.map(g  => `<span class="chip chip-gig">${esc(g)}</span>`).join('');
    tagsBar.classList.remove('hidden');
  } else {
    tagsBar.classList.add('hidden');
  }

  // Transpose display
  const stepsEl = document.getElementById('transpose-steps');
  stepsEl.textContent = state.transpose >= 0
    ? `+${state.transpose}` : `${state.transpose}`;

  // Key selector
  const selectKey = document.getElementById('select-key');
  // Find best match in selector for the current displayKey
  const matchOpt = [...selectKey.options].find(o => o.value === displayKey);
  if (matchOpt) selectKey.value = displayKey;

  // Chord sheet
  const sheetEl = document.getElementById('chord-sheet');
  sheetEl.style.setProperty('--chord-size', `${state.chordSize}rem`);

  const sections = parseChordSheet(song.chordSheet || '');
  sheetEl.innerHTML = buildChordSheetHTML(sections, state.transpose, song.key, useFlats);
}

/* ════════════════════════════════════════════════════════════
   CHORD SHEET PARSER

   Format:
     [Section Name]         ← section header
     [V - Song Title]       ← section with mash-up subtitle
     [BREAK] / [BUILD] …    ← annotation strip (not a new section)
     C | Am | F | G         ← one row of bars, '|' = bar line
     C | Am | F | G x4      ← row with ×4 repeat badge
     spaces in a bar        ← multiple chords within that bar

   Section abbreviations (case-insensitive):
     in / i → INTRO   v → VERSE   c → CHORUS   b → BRIDGE
     o → OUTRO        d → D       pc → PRE-CHORUS
════════════════════════════════════════════════════════════ */
const SECTION_ABBREVS = {
  'in': 'INTRO', 'i': 'INTRO',
  'v':  'VERSE', 'c': 'CHORUS',
  'b':  'BRIDGE', 'o': 'OUTRO',
  'd':  'D', 'pc': 'PRE-CHORUS',
};

const ANNOTATION_MARKERS = new Set([
  'BREAK', 'CHOKE', 'BUILD', 'STAB', 'SUSTAIN', 'FILL', 'STOP',
]);

function parseChordSheet(text) {
  /** @type {Array<{name:string, displayName:string, subtitle:string, rows:Array}>} */
  const sections = [];
  let   section  = null;

  for (const rawLine of (text || '').split('\n')) {
    const line    = rawLine.trimEnd();
    const trimmed = line.trim();

    // Lines starting with '[' — section header OR annotation marker
    if (trimmed.startsWith('[') && trimmed.includes(']')) {
      const inner = trimmed.slice(1, trimmed.indexOf(']')).trim();

      // Annotation markers: [BREAK], [BUILD], [STAB], [CHOKE], [SUSTAIN] …
      if (ANNOTATION_MARKERS.has(inner.toUpperCase())) {
        if (!section) {
          section = { name: '', displayName: '', subtitle: '', rows: [] };
          sections.push(section);
        }
        section.rows.push({ type: 'annotation', marker: inner.toUpperCase() });
        continue;
      }

      // Section header — parse optional " - Song Title" subtitle
      let rawName  = inner;
      let subtitle = '';
      const dashIdx = inner.indexOf(' - ');
      if (dashIdx !== -1) {
        rawName  = inner.slice(0, dashIdx).trim();
        subtitle = inner.slice(dashIdx + 3).trim();
      }
      const displayName = SECTION_ABBREVS[rawName.toLowerCase()] || rawName;
      section = { name: rawName, displayName, subtitle, rows: [] };
      sections.push(section);
      continue;
    }

    // Skip blank lines
    if (!trimmed) continue;

    // Chord row — create a default section if none exists yet
    if (!section) {
      section = { name: '', displayName: '', subtitle: '', rows: [] };
      sections.push(section);
    }

    // Detect trailing repeat count: "x4" or "(x4)"
    let repeat  = null;
    let barText = trimmed;
    const repeatMatch = trimmed.match(/\s+\(?x(\d+)\)?$/i);
    if (repeatMatch) {
      repeat  = parseInt(repeatMatch[1], 10);
      barText = trimmed.slice(0, trimmed.length - repeatMatch[0].length).trimEnd();
    }

    // Split into bars by '|'
    const rawBars = barText.split('|').map(s => s.trim()).filter(s => s.length > 0);

    // If last segment is a lone annotation keyword → row-end badge (not a new strip line)
    let rowAnnotation = null;
    if (rawBars.length > 0 && ANNOTATION_MARKERS.has(rawBars[rawBars.length - 1].toUpperCase())) {
      rowAnnotation = rawBars.pop().toUpperCase();
    }

    const bars = rawBars.map(barStr => {
      const tokens = barStr.split(/\s+/).filter(Boolean);
      if (tokens.length === 0) return [{ chord: '-', tag: null }];
      return tokens.map(parseChordToken);
    });

    if (bars.length > 0) {
      section.rows.push({ type: 'bars', bars, repeat, rowAnnotation });
    }
  }

  return sections;
}

/** Parse a chord token that may carry an inline annotation: C(stab) → {chord:'C', tag:'stab'} */
function parseChordToken(token) {
  const m = token.match(/^(.+?)\(([a-zA-Z]+)\)$/);
  return m ? { chord: m[1], tag: m[2].toLowerCase() } : { chord: token, tag: null };
}

/* ════════════════════════════════════════════════════════════
   CHORD SHEET HTML BUILDER
════════════════════════════════════════════════════════════ */
function buildChordSheetHTML(sections, semitones, originalKey, useFlats) {
  if (!sections || sections.length === 0) {
    return '<p class="empty-sheet">No chord sheet yet — tap ✏️ to add chords.</p>';
  }

  let barCounter = 1;

  return sections.map(section => {
    const label = (section.displayName || section.name || '').toUpperCase();
    const titleHTML = label
      ? `<div class="section-title">
           <span>${esc(label)}</span>
           ${section.subtitle ? `<span class="section-subtitle">${esc(section.subtitle)}</span>` : ''}
         </div>`
      : '';

    const rowsHTML = section.rows.map(row => {
      // Annotation strip: [BREAK], [BUILD], [STAB] etc.
      if (row.type === 'annotation') {
        return `<div class="annotation-strip annotation-${row.marker.toLowerCase()}">${row.marker}</div>`;
      }

      // Bar row (support both new {type,bars,repeat} shape and legacy plain array)
      const bars = row.bars ?? row;
      const barsHTML = bars.map(bar => {
        const barNum    = barCounter++;
        const slotsHTML = bar.map(item => {
          // Support {chord, tag} objects (new) and plain strings (legacy)
          const chord = typeof item === 'string' ? item : item.chord;
          const tag   = typeof item === 'string' ? null  : item.tag;
          const transposed = transposeChord(chord, semitones, useFlats);
          const isRest   = chord === '-';
          const isRepeat = chord === '%';
          const cls = isRest   ? 'chord-slot chord-rest'
                    : isRepeat ? 'chord-slot chord-repeat'
                    : 'chord-slot';
          const tagHTML = tag ? `<span class="chord-tag chord-tag-${esc(tag)}">${esc(tag)}</span>` : '';
          return `<span class="${cls}">${esc(transposed)}${tagHTML}</span>`;
        }).join('');
        return `<div class="bar"><span class="bar-num">${barNum}</span>${slotsHTML}</div>`;
      }).join('');

      const repeatBadge = row.repeat
        ? `<span class="repeat-badge">×${row.repeat}</span>`
        : '';
      const rowAnnotBadge = row.rowAnnotation
        ? `<span class="row-annot row-annot-${row.rowAnnotation.toLowerCase()}">${row.rowAnnotation}</span>`
        : '';
      return `<div class="bars-row">${barsHTML}${repeatBadge}${rowAnnotBadge}</div>`;
    }).join('');

    return `<div class="section-block">${titleHTML}${rowsHTML}</div>`;
  }).join('');
}

/* ════════════════════════════════════════════════════════════
   TRANSPOSE CONTROLS
════════════════════════════════════════════════════════════ */
function shiftTranspose(delta) {
  state.transpose = Math.max(-11, Math.min(11, state.transpose + delta));
  refreshSongView();
}

function resetTranspose() {
  state.transpose = 0;
  refreshSongView();
}

function jumpToKey(targetKey) {
  const song = Storage.get(state.currentSongId);
  if (!song) return;
  state.transpose = semitonesBetweenKeys(song.key, targetKey);
  refreshSongView();
}

function refreshSongView() {
  const song = Storage.get(state.currentSongId);
  if (song) renderSongView(song);
}

/* ════════════════════════════════════════════════════════════
   KEY SELECTOR (populate once)
════════════════════════════════════════════════════════════ */
function populateKeySelector() {
  const select = document.getElementById('select-key');
  ALL_DISPLAY_KEYS.forEach(k => {
    const opt = document.createElement('option');
    opt.value = k;
    opt.textContent = k;
    select.appendChild(opt);
  });
}

/* ════════════════════════════════════════════════════════════
   FONT SIZE
════════════════════════════════════════════════════════════ */
function adjustFontSize(delta) {
  state.chordSize = Math.max(0.85, Math.min(3.8, state.chordSize + delta));
  document.getElementById('chord-sheet')
    .style.setProperty('--chord-size', `${state.chordSize}rem`);
}

/* ════════════════════════════════════════════════════════════
   EDITOR VIEW
════════════════════════════════════════════════════════════ */
function openEditor(id = null) {
  state.editingSongId = id;

  if (id) {
    const song = Storage.get(id);
    if (!song) return;
    document.getElementById('editor-title').textContent      = 'Edit Song';
    document.getElementById('input-title').value             = song.title || '';
    document.getElementById('input-artist').value            = song.artist || '';
    document.getElementById('input-key').value               = song.key || 'G';
    document.getElementById('input-time').value              = song.timeSignature || '4/4';
    document.getElementById('input-tempo').value             = song.tempo || '';
    document.getElementById('input-notes').value             = song.notes || '';
    document.getElementById('input-band').value              = (song.bands || []).join(', ');
    state.editorGigTags                                      = [...(song.gigTags || [])];
    document.getElementById('input-chord-sheet').value       = song.chordSheet || '';
  } else {
    document.getElementById('editor-title').textContent      = 'New Song';
    document.getElementById('input-title').value             = '';
    document.getElementById('input-artist').value            = '';
    document.getElementById('input-key').value               = 'G';
    document.getElementById('input-time').value              = '4/4';
    document.getElementById('input-tempo').value             = '';
    document.getElementById('input-notes').value             = '';
    document.getElementById('input-band').value              = '';
    state.editorGigTags                                      = [];
    document.getElementById('input-chord-sheet').value       = '';
  }

  renderEditorGigTags();
  // Close help panel whenever we enter the editor
  document.getElementById('format-help').classList.add('hidden');
  showView('editor');
  document.getElementById('input-title').focus();
}

function saveSong() {
  const title = document.getElementById('input-title').value.trim();
  if (!title) {
    document.getElementById('input-title').focus();
    document.getElementById('input-title').classList.add('shake');
    setTimeout(() => document.getElementById('input-title').classList.remove('shake'), 500);
    return;
  }

  const tempo = parseInt(document.getElementById('input-tempo').value, 10);

  // Parse comma-separated band names
  const bands = document.getElementById('input-band').value
    .split(',').map(b => b.trim()).filter(Boolean);

  const song = {
    id:            state.editingSongId || Storage.generateId(),
    title,
    artist:        document.getElementById('input-artist').value.trim(),
    key:           document.getElementById('input-key').value,
    timeSignature: document.getElementById('input-time').value,
    tempo:         Number.isFinite(tempo) ? tempo : null,
    notes:         document.getElementById('input-notes').value.trim(),
    bands,
    gigTags:       [...state.editorGigTags],
    chordSheet:    document.getElementById('input-chord-sheet').value,
    updatedAt:     new Date().toISOString(),
    createdAt:     state.editingSongId
                     ? (Storage.get(state.editingSongId)?.createdAt || new Date().toISOString())
                     : new Date().toISOString(),
  };

  Storage.save(song);
  state.songs = Storage.getAll();

  // Navigate: go to song view after save
  state.currentSongId = song.id;
  state.transpose     = 0;
  state.chordSize     = 1.6;
  renderSongView(song);
  showView('song');
}

/* ════════════════════════════════════════════════════════════
   EDITOR — GIG TAG HELPERS
════════════════════════════════════════════════════════════ */
function renderEditorGigTags() {
  const container = document.getElementById('gig-tags-pills');
  container.innerHTML = state.editorGigTags.map((tag, i) =>
    `<span class="editor-tag-pill">
      ${esc(tag)}
      <button type="button" class="editor-tag-remove" data-idx="${i}" title="Remove">×</button>
    </span>`
  ).join('');
}

function addEditorGigTag() {
  const input = document.getElementById('input-gig-tag');
  const val   = input.value.trim();
  if (!val) return;
  if (!state.editorGigTags.includes(val)) {
    state.editorGigTags.push(val);
    renderEditorGigTags();
  }
  input.value = '';
  input.focus();
}

function removeEditorGigTag(idx) {
  state.editorGigTags.splice(idx, 1);
  renderEditorGigTags();
}

/* ════════════════════════════════════════════════════════════
   EXPORT / IMPORT
════════════════════════════════════════════════════════════ */
function exportSongs() {
  const songs   = Storage.getAll();
  const payload = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), songs }, null, 2);
  const blob    = new Blob([payload], { type: 'application/json' });
  const url     = URL.createObjectURL(blob);
  const a       = document.createElement('a');
  a.href        = url;
  a.download    = `ChordBook-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Exported ${songs.length} song${songs.length !== 1 ? 's' : ''}`);
}

function importSongsFromFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const raw      = JSON.parse(e.target.result);
      const incoming = Array.isArray(raw) ? raw : (raw.songs || []);
      if (!incoming.length) { showToast('No songs found in file', 'error'); return; }

      const existingIds = new Set(Storage.getAll().map(s => s.id));
      let added = 0, skipped = 0;

      incoming.forEach(song => {
        if (!song.id || !song.title) return;
        if (existingIds.has(song.id)) { skipped++; return; }
        song.bands     = song.bands    || [];
        song.gigTags   = song.gigTags  || [];
        song.createdAt = song.createdAt || new Date().toISOString();
        song.updatedAt = song.updatedAt || new Date().toISOString();
        Storage.save(song);
        added++;
      });

      state.songs = Storage.getAll();
      renderLibrary();
      showToast(
        `Imported ${added} song${added !== 1 ? 's' : ''}` +
        (skipped ? ` · ${skipped} already existed` : '')
      );
    } catch {
      showToast('Invalid file — could not read JSON', 'error');
    }
  };
  reader.readAsText(file);
}

let _toastTimer = null;
function showToast(msg, type = 'success') {
  const el    = document.getElementById('toast');
  el.textContent = msg;
  el.className   = `toast toast-${type}`;
  el.classList.remove('hidden');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.add('hidden'), 3500);
}

/* ════════════════════════════════════════════════════════════
   SET LISTS — MANAGER VIEW
════════════════════════════════════════════════════════════ */
function renderSetLists() {
  showView('setlists');
  const setLists = SetListStorage.getAll();
  const listEl   = document.getElementById('setlist-list');
  const emptyEl  = document.getElementById('setlist-empty');

  if (!setLists.length) {
    listEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');
  listEl.innerHTML = setLists.map(sl => {
    const count   = (sl.songIds || []).filter(id => Storage.get(id)).length;
    const gigChip = sl.gigTag
      ? `<span class="chip chip-gig">${esc(sl.gigTag)}</span>` : '';
    return `
      <div class="setlist-card">
        <div class="setlist-card-body" data-action="play-setlist" data-id="${sl.id}">
          <div class="setlist-card-main">
            <div class="setlist-card-name">${esc(sl.name)}</div>
            <div class="setlist-card-meta">${count} song${count !== 1 ? 's' : ''}${sl.gigTag ? ' · ' + esc(sl.gigTag) : ''}</div>
          </div>
          ${gigChip}
        </div>
        <div class="song-card-btns">
          <button class="card-btn" data-action="edit-setlist"   data-id="${sl.id}" title="Edit">✏️</button>
          <button class="card-btn del" data-action="delete-setlist" data-id="${sl.id}" title="Delete">🗑️</button>
        </div>
      </div>`;
  }).join('');
}

/* ── Set list performance mode ───────────────────────────────────────────── */
function openSetListPlay(id) {
  const sl = SetListStorage.get(id);
  if (!sl || !sl.songIds.length) { showToast('Set list has no songs', 'error'); return; }
  state.activeSetListId = id;
  state.setListPosition = 0;
  _showSetListSong();
}

function navigateSetList(delta) {
  const sl    = SetListStorage.get(state.activeSetListId);
  if (!sl) return;
  const valid = (sl.songIds || []).filter(id => Storage.get(id));
  state.setListPosition = Math.max(0, Math.min(valid.length - 1, state.setListPosition + delta));
  _showSetListSong();
}

function _showSetListSong() {
  const sl    = SetListStorage.get(state.activeSetListId);
  if (!sl) return;
  const valid = (sl.songIds || []).filter(id => Storage.get(id));
  const song  = Storage.get(valid[state.setListPosition]);
  if (!song) return;

  state.currentSongId = song.id;
  state.transpose     = 0;
  state.chordSize     = 1.6;
  renderSongView(song);
  showView('song');

  // Update nav bar
  const navBar = document.getElementById('setlist-nav-bar');
  navBar.classList.remove('hidden');
  document.getElementById('setlist-nav-label').textContent =
    `${state.setListPosition + 1} / ${valid.length}`;
  document.getElementById('btn-setlist-prev').disabled = state.setListPosition === 0;
  document.getElementById('btn-setlist-next').disabled = state.setListPosition === valid.length - 1;
}

function exitSetList() {
  state.activeSetListId = null;
  state.setListPosition = 0;
  document.getElementById('setlist-nav-bar').classList.add('hidden');
  renderSetLists();
}

/* ── Set list editor ─────────────────────────────────────────────────────── */
function openSetListEditor(id = null) {
  state.editingSetListId = id;
  if (id) {
    const sl = SetListStorage.get(id);
    if (!sl) return;
    document.getElementById('setlist-editor-title').textContent = 'Edit Set List';
    document.getElementById('input-setlist-name').value         = sl.name    || '';
    document.getElementById('input-setlist-gig').value          = sl.gigTag  || '';
    state.editorSetListSongs = [...(sl.songIds || [])];
  } else {
    document.getElementById('setlist-editor-title').textContent = 'New Set List';
    document.getElementById('input-setlist-name').value         = '';
    document.getElementById('input-setlist-gig').value          = '';
    state.editorSetListSongs = [];
  }
  document.getElementById('setlist-song-search').value = '';
  document.getElementById('setlist-song-results').classList.add('hidden');
  renderSetListEditorSongs();
  showView('setlist-editor');
  document.getElementById('input-setlist-name').focus();
}

function renderSetListEditorSongs() {
  const container = document.getElementById('setlist-editor-songs');
  if (!state.editorSetListSongs.length) {
    container.innerHTML = '<p class="setlist-editor-empty-hint">No songs yet — search above to add.</p>';
    return;
  }
  container.innerHTML = state.editorSetListSongs.map((id, i) => {
    const song    = Storage.get(id);
    if (!song) return '';
    const isFirst = i === 0;
    const isLast  = i === state.editorSetListSongs.length - 1;
    return `
      <div class="setlist-song-item">
        <span class="setlist-song-num">${i + 1}</span>
        <div class="setlist-song-info">
          <span class="setlist-song-title">${esc(song.title)}</span>
          <span class="setlist-song-artist">${esc(song.artist || '')}</span>
        </div>
        <div class="setlist-song-controls">
          <button class="setlist-song-btn" data-move="-1" data-idx="${i}" title="Move up"   ${isFirst ? 'disabled' : ''}>↑</button>
          <button class="setlist-song-btn" data-move="1"  data-idx="${i}" title="Move down" ${isLast  ? 'disabled' : ''}>↓</button>
          <button class="setlist-song-btn remove" data-remove="${i}" title="Remove">✕</button>
        </div>
      </div>`;
  }).join('');
}

function searchSetListSongs(query) {
  const q         = query.trim().toLowerCase();
  const resultsEl = document.getElementById('setlist-song-results');
  if (!q) { resultsEl.classList.add('hidden'); return; }

  const matches = state.songs
    .filter(s => s.title.toLowerCase().includes(q) || (s.artist || '').toLowerCase().includes(q))
    .slice(0, 8);

  if (!matches.length) {
    resultsEl.innerHTML = '<p class="setlist-no-results">No songs found</p>';
    resultsEl.classList.remove('hidden');
    return;
  }
  resultsEl.innerHTML = matches.map(s => {
    const already = state.editorSetListSongs.includes(s.id);
    return `<button class="setlist-result-item${already ? ' already-added' : ''}"
                    data-add-song="${s.id}"${already ? ' disabled' : ''}>
              <span class="setlist-result-title">${esc(s.title)}</span>
              <span class="setlist-result-artist">${esc(s.artist || '')}</span>
              ${already ? '<span class="setlist-result-badge">✓</span>' : ''}
            </button>`;
  }).join('');
  resultsEl.classList.remove('hidden');
}

function saveSetList() {
  const name = document.getElementById('input-setlist-name').value.trim();
  if (!name) {
    const inp = document.getElementById('input-setlist-name');
    inp.focus();
    inp.classList.add('shake');
    setTimeout(() => inp.classList.remove('shake'), 500);
    return;
  }
  const existing = state.editingSetListId ? SetListStorage.get(state.editingSetListId) : null;
  const setlist  = {
    id:        state.editingSetListId || SetListStorage.generateId(),
    name,
    gigTag:    document.getElementById('input-setlist-gig').value.trim() || null,
    songIds:   [...state.editorSetListSongs],
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  SetListStorage.save(setlist);
  showToast(`"${name}" saved`);
  renderSetLists();
}

/* ════════════════════════════════════════════════════════════
   DELETE
════════════════════════════════════════════════════════════ */
function confirmDelete(id) {
  if (id.startsWith('setlist:')) {
    const sl = SetListStorage.get(id.slice(8));
    if (!sl) return;
    state.pendingDeleteId = id;
    document.getElementById('modal-message').textContent = `Delete set list "${sl.name}"? This cannot be undone.`;
    document.getElementById('modal-backdrop').classList.remove('hidden');
    return;
  }
  const song = Storage.get(id);
  if (!song) return;
  state.pendingDeleteId = id;
  document.getElementById('modal-message').textContent =
    `Delete "${song.title}"? This cannot be undone.`;
  document.getElementById('modal-backdrop').classList.remove('hidden');
}

function executeDelete() {
  if (!state.pendingDeleteId) return;
  if (state.pendingDeleteId.startsWith('setlist:')) {
    SetListStorage.delete(state.pendingDeleteId.slice(8));
    state.pendingDeleteId = null;
    closeModal();
    renderSetLists();
  } else {
    Storage.delete(state.pendingDeleteId);
    state.songs         = Storage.getAll();
    state.pendingDeleteId = null;
    state.currentSongId   = null;
    closeModal();
    renderLibrary();
  }
}

function closeModal() {
  document.getElementById('modal-backdrop').classList.add('hidden');
  state.pendingDeleteId = null;
}

/* ════════════════════════════════════════════════════════════
   EVENT LISTENERS
════════════════════════════════════════════════════════════ */
function setupEventListeners() {

  /* ── Library ─────────────────────────────────────────────── */
  document.getElementById('btn-theme')
    .addEventListener('click', toggleTheme);

  document.getElementById('search-input')
    .addEventListener('input', e => {
      state.searchQuery = e.target.value;
      renderLibrary();
    });

  document.getElementById('btn-add-song')
    .addEventListener('click', () => openEditor());

  // Filter bar — band pills
  document.getElementById('filter-bands')
    .addEventListener('click', e => {
      const btn = e.target.closest('.filter-pill[data-band]');
      if (!btn) return;
      const band = btn.dataset.band;
      if (state.activeBands.has(band)) state.activeBands.delete(band);
      else state.activeBands.add(band);
      renderLibrary();
    });

  // Filter bar — gig pills
  document.getElementById('filter-gigs')
    .addEventListener('click', e => {
      const btn = e.target.closest('.filter-pill[data-gig]');
      if (!btn) return;
      const gig = btn.dataset.gig;
      if (state.activeGigs.has(gig)) state.activeGigs.delete(gig);
      else state.activeGigs.add(gig);
      renderLibrary();
    });

  // Clear all filters
  document.getElementById('btn-clear-filters')
    .addEventListener('click', () => {
      state.activeBands.clear();
      state.activeGigs.clear();
      renderLibrary();
    });

  // Song list — event delegation (open / edit / delete / tag-filter from card)
  document.getElementById('song-list')
    .addEventListener('click', e => {
      // Clicking a band chip on a card → activate that band filter
      const bandChip = e.target.closest('[data-filter-band]');
      if (bandChip) {
        e.stopPropagation();
        const band = bandChip.dataset.filterBand;
        if (state.activeBands.has(band)) state.activeBands.delete(band);
        else state.activeBands.add(band);
        renderLibrary();
        return;
      }
      // Clicking a gig chip on a card → activate that gig filter
      const gigChip = e.target.closest('[data-filter-gig]');
      if (gigChip) {
        e.stopPropagation();
        const gig = gigChip.dataset.filterGig;
        if (state.activeGigs.has(gig)) state.activeGigs.delete(gig);
        else state.activeGigs.add(gig);
        renderLibrary();
        return;
      }
      const el     = e.target.closest('[data-action]');
      if (!el) return;
      const action = el.dataset.action;
      const id     = el.dataset.id;
      if (action === 'open')        openSong(id);
      else if (action === 'edit')   openEditor(id);
      else if (action === 'delete') confirmDelete(id);
    });

  /* ── Song view ────────────────────────────────────────────── */
  document.getElementById('btn-back-song')
    .addEventListener('click', () => {
      state.searchQuery = '';
      if (state.activeSetListId) {
        state.activeSetListId = null;
        state.setListPosition = 0;
        document.getElementById('setlist-nav-bar').classList.add('hidden');
        renderSetLists();
      } else {
        renderLibrary();
      }
    });

  document.getElementById('btn-edit-song')
    .addEventListener('click', () => {
      if (state.currentSongId) openEditor(state.currentSongId);
    });

  document.getElementById('btn-print-song')
    .addEventListener('click', () => window.print());

  document.getElementById('btn-transpose-down')
    .addEventListener('click', () => shiftTranspose(-1));

  document.getElementById('btn-transpose-up')
    .addEventListener('click', () => shiftTranspose(+1));

  document.getElementById('btn-transpose-reset')
    .addEventListener('click', resetTranspose);

  document.getElementById('select-key')
    .addEventListener('change', e => jumpToKey(e.target.value));

  document.getElementById('btn-font-down')
    .addEventListener('click', () => adjustFontSize(-0.2));

  document.getElementById('btn-font-up')
    .addEventListener('click', () => adjustFontSize(+0.2));

  /* ── Editor ──────────────────────────────────────────────── */
  document.getElementById('btn-back-editor')
    .addEventListener('click', () => {
      if (state.editingSongId && state.currentSongId === state.editingSongId) {
        // Was editing existing — go back to song view
        const song = Storage.get(state.editingSongId);
        if (song) { renderSongView(song); showView('song'); return; }
      }
      renderLibrary();
    });

  document.getElementById('btn-save-song')
    .addEventListener('click', saveSong);

  document.getElementById('btn-help-toggle')
    .addEventListener('click', () => {
      document.getElementById('format-help').classList.toggle('hidden');
    });

  // Gig tag add button
  document.getElementById('btn-add-gig-tag')
    .addEventListener('click', addEditorGigTag);

  // Gig tag add on Enter key in the input
  document.getElementById('input-gig-tag')
    .addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); addEditorGigTag(); }
    });

  // Gig tag remove pills (delegated)
  document.getElementById('gig-tags-pills')
    .addEventListener('click', e => {
      const btn = e.target.closest('.editor-tag-remove');
      if (!btn) return;
      removeEditorGigTag(parseInt(btn.dataset.idx, 10));
    });

  /* ── Modal ───────────────────────────────────────────────── */
  document.getElementById('btn-modal-cancel')
    .addEventListener('click', closeModal);

  document.getElementById('btn-modal-confirm')
    .addEventListener('click', executeDelete);

  document.getElementById('modal-backdrop')
    .addEventListener('click', e => {
      if (e.target.id === 'modal-backdrop') closeModal();
    });

  /* ── Keyboard shortcuts ──────────────────────────────────── */
  document.addEventListener('keydown', e => {
    if (state.view === 'song') {
      if (e.key === 'Escape') {
        state.searchQuery = '';
        if (state.activeSetListId) {
          state.activeSetListId = null;
          state.setListPosition = 0;
          document.getElementById('setlist-nav-bar').classList.add('hidden');
          renderSetLists();
        } else {
          renderLibrary();
        }
      }
      if (e.key === 'ArrowLeft'  && state.activeSetListId) { e.preventDefault(); navigateSetList(-1); }
      if (e.key === 'ArrowRight' && state.activeSetListId) { e.preventDefault(); navigateSetList(+1); }
      if (e.key === 'ArrowUp'   && e.altKey)       { e.preventDefault(); shiftTranspose(+1); }
      if (e.key === 'ArrowDown' && e.altKey)       { e.preventDefault(); shiftTranspose(-1); }
      if (e.key === 'r'         && e.altKey)       { e.preventDefault(); resetTranspose(); }
      if (e.key === 'e'         && e.altKey)       { e.preventDefault(); openEditor(state.currentSongId); }
    }
    if (state.view === 'library') {
      if (e.key === 'n' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); openEditor(); }
    }
    if (state.view === 'editor') {
      if (e.key === 'Escape')                         { document.getElementById('btn-back-editor').click(); }
      if (e.key === 's' && (e.metaKey || e.ctrlKey))  { e.preventDefault(); saveSong(); }
    }
    if (state.view === 'setlists') {
      if (e.key === 'Escape') renderLibrary();
    }
    if (state.view === 'setlist-editor') {
      if (e.key === 'Escape')                         renderSetLists();
      if (e.key === 's' && (e.metaKey || e.ctrlKey))  { e.preventDefault(); saveSetList(); }
    }
    if (e.key === 'Escape' && !document.getElementById('modal-backdrop').classList.contains('hidden')) {
      closeModal();
    }
  });

  /* ── Export / Import ─────────────────────────────────────── */
  document.getElementById('btn-export')
    .addEventListener('click', exportSongs);
  document.getElementById('btn-import-trigger')
    .addEventListener('click', () => document.getElementById('input-import-file').click());
  document.getElementById('input-import-file')
    .addEventListener('change', e => {
      const file = e.target.files[0];
      if (file) { importSongsFromFile(file); e.target.value = ''; }
    });

  /* ── Set Lists — manager ─────────────────────────────────── */
  document.getElementById('btn-setlists')
    .addEventListener('click', renderSetLists);

  document.getElementById('btn-back-setlists')
    .addEventListener('click', renderLibrary);

  document.getElementById('btn-add-setlist')
    .addEventListener('click', () => openSetListEditor());

  document.getElementById('setlist-list')
    .addEventListener('click', e => {
      const playEl = e.target.closest('[data-action="play-setlist"]');
      if (playEl)   { openSetListPlay(playEl.dataset.id); return; }
      const editEl = e.target.closest('[data-action="edit-setlist"]');
      if (editEl)   { openSetListEditor(editEl.dataset.id); return; }
      const delEl  = e.target.closest('[data-action="delete-setlist"]');
      if (delEl)    { confirmDelete(`setlist:${delEl.dataset.id}`); }
    });

  /* ── Set Lists — editor ──────────────────────────────────── */
  document.getElementById('btn-back-setlist-editor')
    .addEventListener('click', renderSetLists);

  document.getElementById('btn-save-setlist')
    .addEventListener('click', saveSetList);

  document.getElementById('setlist-song-search')
    .addEventListener('input', e => searchSetListSongs(e.target.value));

  document.getElementById('setlist-song-results')
    .addEventListener('click', e => {
      const btn = e.target.closest('[data-add-song]');
      if (!btn || btn.disabled) return;
      state.editorSetListSongs.push(btn.dataset.addSong);
      renderSetListEditorSongs();
      searchSetListSongs(document.getElementById('setlist-song-search').value);
    });

  document.getElementById('setlist-editor-songs')
    .addEventListener('click', e => {
      const moveBtn = e.target.closest('[data-move]');
      if (moveBtn) {
        const idx    = parseInt(moveBtn.dataset.idx, 10);
        const newIdx = idx + parseInt(moveBtn.dataset.move, 10);
        if (newIdx >= 0 && newIdx < state.editorSetListSongs.length) {
          [state.editorSetListSongs[idx], state.editorSetListSongs[newIdx]] =
          [state.editorSetListSongs[newIdx], state.editorSetListSongs[idx]];
          renderSetListEditorSongs();
        }
        return;
      }
      const removeBtn = e.target.closest('[data-remove]');
      if (removeBtn) {
        state.editorSetListSongs.splice(parseInt(removeBtn.dataset.remove, 10), 1);
        renderSetListEditorSongs();
        searchSetListSongs(document.getElementById('setlist-song-search').value);
      }
    });

  /* ── Set list nav bar (inside song view) ─────────────────── */
  document.getElementById('btn-setlist-prev')
    .addEventListener('click', () => navigateSetList(-1));
  document.getElementById('btn-setlist-next')
    .addEventListener('click', () => navigateSetList(+1));
  document.getElementById('btn-setlist-exit')
    .addEventListener('click', exitSetList);
}

/* ════════════════════════════════════════════════════════════
   UTILITIES
════════════════════════════════════════════════════════════ */

/** HTML-escape a string. */
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
