/**
 * app.js — ChordBook main application
 *
 * Views:  library  →  song  ←→  editor
 * State is kept in a plain object; UI is re-rendered on change.
 */
import { transposeChord, getTranspositionContext, semitonesBetweenKeys, ALL_DISPLAY_KEYS } from './chords.js';
import { Storage } from './storage.js';

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
     [Section Name]     ← section header
     C | Am | F | G     ← one row of bars, '|' = bar line
     spaces in a bar    ← multiple chords within that bar
════════════════════════════════════════════════════════════ */
function parseChordSheet(text) {
  /** @type {Array<{name:string, rows:Array<Array<string[]>>}>} */
  const sections = [];
  let   section  = null;

  for (const rawLine of (text || '').split('\n')) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    // Section header: [Verse], [Chorus], etc.
    if (trimmed.startsWith('[') && trimmed.includes(']')) {
      const name = trimmed.slice(1, trimmed.indexOf(']')).trim();
      section = { name, rows: [] };
      sections.push(section);
      continue;
    }

    // Skip blank lines
    if (!trimmed) continue;

    // Chord row — create a default section if none exists yet
    if (!section) {
      section = { name: '', rows: [] };
      sections.push(section);
    }

    // Split into bars by '|'
    const bars = trimmed.split('|').map(barStr => {
      const chords = barStr.trim().split(/\s+/).filter(Boolean);
      return chords.length > 0 ? chords : ['-'];
    });

    if (bars.length > 0) {
      section.rows.push(bars);
    }
  }

  return sections;
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
    const titleHTML = section.name
      ? `<div class="section-title"><span>${esc(section.name.toUpperCase())}</span></div>`
      : '';

    const rowsHTML = section.rows.map(row => {
      const barsHTML = row.map(bar => {
        const barNum = barCounter++;
        const slotsHTML = bar.map(chord => {
          const transposed = transposeChord(chord, semitones, useFlats);
          const isRest   = chord === '-';
          const isRepeat = chord === '%';
          const cls = isRest   ? 'chord-slot chord-rest'
                    : isRepeat ? 'chord-slot chord-repeat'
                    : 'chord-slot';
          return `<span class="${cls}">${esc(transposed)}</span>`;
        }).join('');
        return `<div class="bar"><span class="bar-num">${barNum}</span>${slotsHTML}</div>`;
      }).join('');
      return `<div class="bars-row">${barsHTML}</div>`;
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
   DELETE
════════════════════════════════════════════════════════════ */
function confirmDelete(id) {
  const song = Storage.get(id);
  if (!song) return;
  state.pendingDeleteId = id;
  document.getElementById('modal-message').textContent =
    `Delete "${song.title}"? This cannot be undone.`;
  document.getElementById('modal-backdrop').classList.remove('hidden');
}

function executeDelete() {
  if (state.pendingDeleteId) {
    Storage.delete(state.pendingDeleteId);
    state.songs = Storage.getAll();
    state.pendingDeleteId = null;
    closeModal();
    state.currentSongId = null;
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
    .addEventListener('click', () => { state.searchQuery = ''; renderLibrary(); });

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
      if (e.key === 'Escape')                      { state.searchQuery = ''; renderLibrary(); }
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
    if (e.key === 'Escape' && !document.getElementById('modal-backdrop').classList.contains('hidden')) {
      closeModal();
    }
  });
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
