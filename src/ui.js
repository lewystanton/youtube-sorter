// Floating "Sort & copy" button + panel on youtube.com/playlist pages.
// YouTube enforces Trusted Types, so everything is built with createElement — no innerHTML.
(function (root) {
  const ns = root.__ytPlaylistSorter;
  if (!ns || ns.uiLoaded) return;
  ns.uiLoaded = true;

  const {
    SORTS, sortItems, filterItems, planUpdate,
    fetchPlaylist, fetchDetails, createPlaylist, addVideos, removeVideos, unsavePlaylist, deletePlaylist,
    myChannelId, isLoggedIn, sleep,
  } = ns;
  const MAX_PLAYLIST = 5000;
  const PREVIEW_ROWS = 400;

  function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c != null && c !== false) el.append(c);
    return el;
  }

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    .root {
      --bg: #ffffff; --fg: #0f0f0f; --muted: #606060; --line: rgba(0,0,0,.1);
      --field: #f2f2f2; --accent: #0f0f0f; --accent-fg: #fff; --row-hover: rgba(0,0,0,.05);
      --shadow: 0 12px 48px rgba(0,0,0,.18), 0 2px 8px rgba(0,0,0,.08);
      --ok: #0b8043; --err: #cc0000; --thumb: rgba(0,0,0,.2);
      color-scheme: light;
      font: 14px/1.4 "Roboto", "Arial", sans-serif; color: var(--fg);
    }
    .root.dark {
      --bg: #212121; --fg: #f1f1f1; --muted: #aaaaaa; --line: rgba(255,255,255,.1);
      --field: #303030; --accent: #f1f1f1; --accent-fg: #0f0f0f; --row-hover: rgba(255,255,255,.06);
      --shadow: 0 12px 48px rgba(0,0,0,.5), 0 2px 8px rgba(0,0,0,.3);
      --ok: #5fd38d; --err: #ff6b6b; --thumb: rgba(255,255,255,.2);
      color-scheme: dark;
    }
    .fab {
      position: fixed; right: 24px; bottom: 24px; z-index: 2147483000;
      display: flex; align-items: center; gap: 8px; height: 44px; padding: 0 18px 0 14px;
      border: 0; border-radius: 22px; cursor: pointer;
      background: var(--accent); color: var(--accent-fg); box-shadow: var(--shadow);
      font: 500 14px "Roboto", "Arial", sans-serif; letter-spacing: .01em;
      transition: transform .18s cubic-bezier(.2,.8,.2,1), opacity .18s;
    }
    .fab:hover { transform: translateY(-2px); }
    .fab:active { transform: translateY(0) scale(.98); }
    .fab svg { width: 20px; height: 20px; fill: currentColor; }
    .panel {
      position: fixed; right: 24px; bottom: 80px; z-index: 2147483000;
      width: 420px; max-width: calc(100vw - 32px); max-height: min(820px, calc(100vh - 136px));
      display: flex; flex-direction: column; overflow: hidden;
      background: var(--bg); border-radius: 16px; box-shadow: var(--shadow);
      transform-origin: bottom right; animation: pop .22s cubic-bezier(.2,.8,.2,1);
    }
    @keyframes pop { from { opacity: 0; transform: translateY(8px) scale(.97); } }
    .head { flex-shrink: 0; display: flex; align-items: flex-start; gap: 12px; padding: 18px 12px 14px 20px; }
    .body {
      flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden;
      scrollbar-width: thin; scrollbar-color: var(--thumb) transparent;
    }
    .head-text { flex: 1; min-width: 0; }
    .title { font: 500 18px "YouTube Sans", "Roboto", sans-serif; margin: 0; }
    .sub { color: var(--muted); font-size: 13px; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .icon-btn { border: 0; background: none; color: var(--muted); cursor: pointer; width: 32px; height: 32px; border-radius: 50%; font-size: 20px; line-height: 1; }
    .icon-btn:hover { background: var(--row-hover); color: var(--fg); }
    .controls { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 0 20px 16px; }
    label { display: flex; flex-direction: column; gap: 6px; min-width: 0; font-size: 12px; color: var(--muted); }
    label.wide { grid-column: 1 / -1; }
    .pair { grid-column: 1 / -1; display: grid; grid-template-columns: minmax(0, 1fr) 124px; gap: 12px; }
    select, input[type=text] {
      height: 36px; padding: 0 10px; border: 1px solid transparent; border-radius: 8px;
      background: var(--field); color: var(--fg); font: 14px "Roboto", sans-serif; outline: none;
    }
    select:focus, input[type=text]:focus { border-color: var(--muted); }
    select:disabled, input:disabled { opacity: .5; }
    .list { padding: 6px 0; border-top: 1px solid var(--line); }
    .row { display: grid; grid-template-columns: 32px minmax(0, 1fr); column-gap: 8px; padding: 7px 20px 7px 12px; }
    .row > div { min-width: 0; }
    .row:hover { background: var(--row-hover); }
    .idx { color: var(--muted); font-size: 12px; text-align: right; padding-top: 2px; font-variant-numeric: tabular-nums; }
    .v-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .v-meta { color: var(--muted); font-size: 12px; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .more, .empty { color: var(--muted); font-size: 13px; padding: 10px 20px; }
    .foot { flex-shrink: 0; padding: 16px 20px 20px; display: flex; flex-direction: column; gap: 10px; border-top: 1px solid var(--line); }
    .go {
      height: 40px; border: 0; border-radius: 20px; cursor: pointer;
      background: var(--accent); color: var(--accent-fg); font: 500 14px "Roboto", sans-serif;
    }
    .go:disabled { opacity: .4; cursor: default; }
    .bar { height: 4px; border-radius: 2px; background: var(--field); overflow: hidden; }
    .bar > div { height: 100%; width: 0; background: var(--accent); transition: width .25s ease; }
    .status { font-size: 13px; color: var(--muted); }
    .status:empty { display: none; }
    .status.ok { color: var(--ok); } .status.err { color: var(--err); }
    .status a { color: inherit; font-weight: 500; }
    .spin { display: inline-block; width: 12px; height: 12px; margin-right: 6px; vertical-align: -1px; border: 2px solid var(--muted); border-right-color: transparent; border-radius: 50%; animation: spin .7s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .linked {
      display: flex; align-items: center; gap: 8px; margin: 0 20px 14px; padding: 10px 12px;
      border-radius: 10px; background: var(--field); font-size: 13px;
    }
    .linked-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .linked-text span { color: var(--muted); }
    .linked a { color: var(--fg); font-weight: 500; text-decoration: none; }
    .linked a:hover { text-decoration: underline; }
    .text-btn { border: 0; background: none; padding: 0; color: var(--muted); font: 13px "Roboto", sans-serif; cursor: pointer; }
    .text-btn:hover { color: var(--fg); text-decoration: underline; }
    .text-btn:disabled { opacity: .4; cursor: default; text-decoration: none; }
    .check { flex-direction: row; align-items: center; gap: 8px; font-size: 13px; color: var(--fg); cursor: pointer; }
    .check input { margin: 0; width: 16px; height: 16px; accent-color: var(--accent); }
    .hint { color: var(--muted); font-size: 12px; padding: 0 20px 10px; }
    .actions { display: flex; flex-direction: column; align-items: center; gap: 10px; }
    .actions .go { width: 100%; }
  `;

  // ---------- formatting ----------
  const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
  function fmtDuration(s) {
    if (s == null) return null;
    const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
    return (hh ? `${hh}:${String(mm).padStart(2, '0')}` : `${mm}`) + `:${String(ss).padStart(2, '0')}`;
  }
  function fmtDate(v) {
    if (v.published == null) return null;
    const d = new Date(v.published);
    return v.exact ? d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : `~${d.getFullYear()}`;
  }
  const fmtViews = (v) => (v.views == null ? null : `${v.exact ? '' : '~'}${compact.format(v.views)} views`);

  // ---------- saved links (source playlist → your sorted copy) ----------
  // Kept in this browser's localStorage on youtube.com.
  const LINKS_KEY = 'ytPlaylistSorter.links.v1';
  const PREFS_KEY = 'ytPlaylistSorter.prefs.v1';
  function readJSON(key) {
    try { return JSON.parse(localStorage.getItem(key)) ?? {}; } catch { return {}; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ }
  }
  const links = {
    all: () => readJSON(LINKS_KEY),
    forSource: (id) => links.all()[id] ?? null,
    forCopy: (id) => Object.values(links.all()).find((l) => l.copyId === id) ?? null,
    save(rec) { const all = links.all(); all[rec.sourceId] = rec; writeJSON(LINKS_KEY, all); },
    remove(sourceId) { const all = links.all(); delete all[sourceId]; writeJSON(LINKS_KEY, all); },
  };
  const prefs = {
    get: (k, d) => readJSON(PREFS_KEY)[k] ?? d,
    set(k, v) { const p = readJSON(PREFS_KEY); p[k] = v; writeJSON(PREFS_KEY, p); },
  };

  // ---------- state ----------
  const state = {
    listId: null, // playlist in the URL
    sourceId: null, // playlist we read from (differs from listId on a copy's page)
    link: null, // saved link for sourceId, if any
    onCopyPage: false,
    owned: false, // the source playlist belongs to the signed-in user
    data: null, // { title, items }
    loading: null, // promise
    sortKey: 'published',
    desc: false,
    busy: false,
    sorted: [], // after filtering
    renderSeq: 0,
  };

  // ---------- DOM ----------
  const host = h('div', { id: 'yt-playlist-sorter-host' });
  const shadow = host.attachShadow({ mode: 'open' });
  const rootEl = h('div', { class: 'root' });
  shadow.append(h('style', {}, CSS), rootEl);
  // Keep YouTube's keyboard shortcuts from firing while typing in the panel.
  for (const t of ['keydown', 'keyup', 'keypress']) {
    host.addEventListener(t, (e) => {
      e.stopPropagation();
      if (t === 'keydown' && e.key === 'Escape' && !state.busy) togglePanel(false);
    });
  }

  const svgNS = 'http://www.w3.org/2000/svg';
  const icon = document.createElementNS(svgNS, 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('d', 'M3 6h11v2H3V6zm0 5h8v2H3v-2zm0 5h5v2H3v-2zm14-9h2v10.17l2.59-2.58L23 15l-5 5-5-5 1.41-1.41L17 16.17V7z');
  icon.append(path);
  const fabLabel = document.createTextNode('Sort & copy');
  const fab = h('button', { class: 'fab', onclick: () => togglePanel() }, icon, fabLabel);

  const sortSel = h('select', { onchange: () => { state.sortKey = sortSel.value; state.desc = false; syncDirOptions(); renderPreview(); } },
    Object.entries(SORTS).map(([k, s]) => h('option', { value: k }, s.label)));
  const dirSel = h('select', { onchange: () => { state.desc = dirSel.value === '1'; renderPreview(); } });
  let excludeTimer = null;
  const excludeInput = h('input', {
    type: 'text', spellcheck: false, placeholder: 'e.g. trailer, livestream',
    oninput: () => { clearTimeout(excludeTimer); excludeTimer = setTimeout(renderPreview, 250); },
  });
  const nameInput = h('input', { type: 'text', maxlength: '150', spellcheck: false });
  const privacySel = h('select', {},
    h('option', { value: 'PRIVATE' }, 'Private'),
    h('option', { value: 'UNLISTED' }, 'Unlisted'),
    h('option', { value: 'PUBLIC' }, 'Public'));
  // Only the "remove from Library" choice is remembered; deleting your own playlist is always opt-in.
  const unfollowBox = h('input', { type: 'checkbox', onchange: () => { if (!state.owned) prefs.set('unfollow', unfollowBox.checked); } });
  unfollowBox.checked = prefs.get('unfollow', false);

  const subEl = h('div', { class: 'sub' });
  const linkedEl = h('div', { class: 'linked', hidden: true });
  const pairEl = h('div', { class: 'pair' },
    h('label', {}, 'New playlist name', nameInput),
    h('label', {}, 'Visibility', privacySel));
  const unfollowText = document.createTextNode('');
  const unfollowLabel = h('label', { class: 'wide check' }, unfollowBox, unfollowText);
  const hintEl = h('div', { class: 'hint', hidden: true });
  const listEl = h('div', { class: 'list' });
  const barFill = h('div');
  const bar = h('div', { class: 'bar', hidden: true }, barFill);
  const statusEl = h('div', { class: 'status' });
  const goBtn = h('button', { class: 'go', onclick: () => (state.link ? runUpdate() : runCreate()) });
  const altBtn = h('button', { class: 'text-btn', hidden: true, onclick: () => runCreate() }, 'Make a separate new copy instead');
  const linkExistingBtn = h('button', { class: 'text-btn', hidden: true, onclick: () => linkExisting() }, 'Already made a copy? Link it');

  const panel = h('div', { class: 'panel', hidden: true },
    h('div', { class: 'head' },
      h('div', { class: 'head-text' }, h('h2', { class: 'title' }, 'Sort & copy'), subEl),
      h('button', { class: 'icon-btn', title: 'Close', onclick: () => togglePanel(false) }, '×')),
    h('div', { class: 'body' },
      linkedEl,
      h('div', { class: 'controls' },
        h('label', {}, 'Sort by', sortSel),
        h('label', {}, 'Order', dirSel),
        h('label', { class: 'wide' }, 'Hide videos whose title contains', excludeInput),
        pairEl,
        unfollowLabel),
      hintEl,
      listEl),
    h('div', { class: 'foot' }, bar, statusEl, h('div', { class: 'actions' }, goBtn, altBtn, linkExistingBtn)));

  rootEl.append(fab, panel);
  sortSel.value = state.sortKey;

  function syncDirOptions() {
    const dirs = SORTS[state.sortKey].dirs;
    dirSel.replaceChildren(...(dirs ?? ['—']).map((label, i) => h('option', { value: String(i) }, label)));
    dirSel.disabled = !dirs || state.busy;
    dirSel.value = state.desc && dirs ? '1' : '0';
  }
  syncDirOptions();

  const ago = (t) => {
    if (!t) return 'never updated';
    const d = Math.round((Date.now() - t) / 864e5);
    return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
  };

  // Reflects create vs. update mode in the panel.
  function syncMode() {
    const l = state.link;
    linkedEl.hidden = !l;
    if (l) {
      const target = state.onCopyPage
        ? [h('span', {}, 'Updates from '), h('a', { href: `/playlist?list=${l.sourceId}` }, l.sourceTitle || 'the original')]
        : [h('span', {}, 'Your copy: '), h('a', { href: `/playlist?list=${l.copyId}` }, l.copyTitle || 'sorted copy')];
      linkedEl.replaceChildren(
        h('div', { class: 'linked-text', title: `Last updated ${ago(l.updatedAt)}` }, ...target),
        h('button', { class: 'text-btn', title: 'Forget the link (both playlists stay as they are)', onclick: unlink }, 'Unlink'));
    }
    goBtn.textContent = l ? 'Update copy' : 'Create sorted playlist';
    altBtn.hidden = !l || state.onCopyPage;
    linkExistingBtn.hidden = !!l || state.onCopyPage;
    pairEl.hidden = !!l; // name + visibility only matter when creating
    unfollowLabel.hidden = state.onCopyPage || !!l?.unfollowed;
    unfollowText.textContent = state.owned
      ? "Delete the original playlist afterwards (it's yours)"
      : 'Remove the original from my Library afterwards';
    linkExistingBtn.textContent = state.owned ? 'Is this a copy? Link it to its original' : 'Already made a copy? Link it';
    fabLabel.textContent = state.onCopyPage ? 'Update copy' : 'Sort & copy';
    fab.title = state.onCopyPage ? 'Re-sync this playlist from its original' : 'Copy this playlist into a new, sorted playlist';
  }

  function unlink() {
    if (!state.link || state.busy) return;
    links.remove(state.link.sourceId);
    if (state.onCopyPage) { state.listId = null; sync(); return; } // this page is now just a normal playlist
    state.link = null;
    syncMode();
    setStatus('Unlinked. Both playlists are unchanged.');
  }

  const parseListId = (input) =>
    /[?&]list=([\w-]+)/.exec(input)?.[1] ?? (/^[\w-]{10,}$/.test(input.trim()) ? input.trim() : null);

  async function linkExisting() {
    if (!state.data) return;
    if (state.owned) return linkToOriginal();
    const input = prompt('Paste the link to your sorted copy of this playlist:');
    if (!input) return;
    const copyId = parseListId(input);
    if (!copyId || copyId === state.sourceId) {
      setStatus("That's this playlist's own link. Paste the link to your sorted copy instead.", 'err');
      return;
    }
    setBusy(true);
    try {
      setStatus('Checking that playlist…', '', true);
      const copy = await fetchPlaylist(copyId);
      saveLink(copyId, copy.title ?? 'sorted copy');
      state.link.updatedAt = 0;
      links.save(state.link);
      setStatus('Linked. Press Update copy to bring it in line with the settings above.', 'ok');
    } catch (e) {
      setStatus(`Couldn't open that playlist: ${e.message}`, 'err');
    } finally {
      setBusy(false);
      syncMode();
    }
  }

  // You're on your own playlist: treat it as the copy and link it to the playlist it came from.
  async function linkToOriginal() {
    const input = prompt("Paste the link to the original playlist this was copied from (the one that isn't yours):");
    if (!input) return;
    const sourceId = parseListId(input);
    if (!sourceId || sourceId === state.listId) {
      setStatus("That's this playlist's own link. Paste the original playlist's link instead.", 'err');
      return;
    }
    setBusy(true);
    try {
      setStatus('Checking that playlist…', '', true);
      const source = await fetchPlaylist(sourceId);
      links.save({
        sourceId, sourceTitle: source.title, copyId: state.listId, copyTitle: state.data.title,
        sortKey: state.sortKey, desc: state.desc, exclude: excludeInput.value.trim(), unfollowed: false, updatedAt: 0,
      });
    } catch (e) {
      setStatus(`Couldn't open that playlist: ${e.message}`, 'err');
      setBusy(false);
      return;
    }
    setBusy(false);
    state.listId = null; // re-enter this page as a linked copy
    sync();
    togglePanel(true);
    setStatus('Linked. Check the settings, then press Update copy.', 'ok');
  }

  function setStatus(msg, kind = '', spinning = false) {
    statusEl.className = 'status ' + kind;
    statusEl.replaceChildren(...(spinning ? [h('span', { class: 'spin' })] : []), ...[msg].flat());
  }
  function setProgress(done, total) {
    bar.hidden = total == null;
    barFill.style.width = total ? `${Math.round((done / total) * 100)}%` : '0';
  }
  function setBusy(b) {
    state.busy = b;
    for (const el of [sortSel, excludeInput, nameInput, privacySel, unfollowBox, altBtn, linkExistingBtn]) el.disabled = b;
    dirSel.disabled = b || !SORTS[state.sortKey].dirs;
    updateGo();
  }
  function updateGo() {
    goBtn.disabled = state.busy || !state.sorted.length || !isLoggedIn();
  }

  function applyTheme() {
    rootEl.classList.toggle('dark', document.documentElement.hasAttribute('dark'));
  }

  // ---------- data ----------
  function ensureLoaded() {
    if (state.data) return Promise.resolve(state.data);
    if (state.loading) return state.loading;
    const id = state.sourceId;
    setStatus(state.onCopyPage ? 'Loading the original playlist…' : 'Loading playlist…', '', true);
    state.loading = Promise.all([fetchPlaylist(id, (n) => setStatus(`Loading playlist… ${n} videos`, '', true)), myChannelId()])
      .then(([data, me]) => {
        if (state.sourceId !== id) return null;
        state.data = data;
        state.owned = !!me && data.ownerId === me;
        if (state.owned) unfollowBox.checked = false;
        syncMode();
        subEl.textContent = `${state.onCopyPage ? 'Original: ' : ''}${data.title ?? id} · ${data.items.length} videos`;
        if (!nameInput.value) nameInput.value = defaultName();
        setStatus(isLoggedIn() ? '' : 'Sign in to YouTube to create playlists.', isLoggedIn() ? '' : 'err');
        return data;
      })
      .catch((e) => {
        setStatus(`Couldn't load ${state.onCopyPage ? 'the original' : 'this'} playlist: ${e.message}`, 'err');
        throw e;
      })
      .finally(() => { if (state.sourceId === id) state.loading = null; });
    return state.loading;
  }

  async function renderPreview() {
    const seq = ++state.renderSeq;
    state.sorted = [];
    updateGo();
    const data = await ensureLoaded().catch(() => null);
    if (!data || seq !== state.renderSeq) return;

    const s = SORTS[state.sortKey];
    if (s.needsDetails && data.items.some((v) => !v.exact)) {
      setBusy(true);
      await fetchDetails(data.items, (d, t) => {
        if (seq === state.renderSeq) { setStatus(`Fetching exact dates & views… ${d}/${t}`, '', true); setProgress(d, t); }
      });
      setBusy(false);
      setProgress();
      setStatus('');
      if (seq !== state.renderSeq) return;
    }

    const { kept, excluded } = filterItems(data.items, excludeInput.value);
    state.sorted = sortItems(kept, state.sortKey, state.desc);
    hintEl.hidden = !excluded.length;
    hintEl.textContent = `${excluded.length} video${excluded.length === 1 ? '' : 's'} hidden by your keywords · ${kept.length} left`;

    const rows = state.sorted.slice(0, PREVIEW_ROWS).map((v, i) => {
      const meta = [v.channel, fmtDuration(v.durationSec),
        state.sortKey === 'views' ? fmtViews(v) : fmtDate(v)].filter(Boolean).join(' · ');
      return h('div', { class: 'row' },
        h('div', { class: 'idx' }, String(i + 1)),
        h('div', {}, h('div', { class: 'v-title', title: v.title }, v.title || v.videoId), h('div', { class: 'v-meta' }, meta)));
    });
    const extra = state.sorted.length - PREVIEW_ROWS;
    const empty = data.items.length ? 'Every video is hidden by your keywords.' : 'No playable videos found in this playlist.';
    listEl.replaceChildren(...(rows.length ? rows : [h('div', { class: 'empty' }, empty)]),
      ...(extra > 0 ? [h('div', { class: 'more' }, `+ ${extra} more`)] : []));
    listEl.scrollTop = 0;
    updateGo();
  }

  // ---------- create / update ----------
  const defaultName = () => {
    const t = state.data?.title ?? 'Playlist';
    return /\(sorted\)\s*$/i.test(t) ? t : `${t} (sorted)`;
  };
  function saveLink(copyId, copyTitle) {
    state.link = {
      sourceId: state.sourceId,
      sourceTitle: state.data.title,
      copyId,
      copyTitle,
      sortKey: state.sortKey,
      desc: state.desc,
      exclude: excludeInput.value.trim(),
      unfollowed: state.link?.sourceId === state.sourceId && !!state.link.unfollowed,
      updatedAt: Date.now(),
    };
    links.save(state.link);
  }

  // YouTube takes a few seconds to show newly added videos, so re-read until they all appear.
  async function verify(playlistId, expected) {
    setStatus('Checking the order…', '', true);
    let got = null, missing = 0;
    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt) await sleep(2500);
      const check = await fetchPlaylist(playlistId).catch(() => null);
      if (!check) continue;
      got = check.items.map((v) => v.videoId);
      const have = new Set(got);
      missing = expected.filter((id) => !have.has(id)).length;
      if (!missing) break;
    }
    if (!got) return { checked: false };
    const want = new Set(expected), present = new Set(got);
    const a = got.filter((id) => want.has(id));
    const b = expected.filter((id) => present.has(id));
    return { checked: true, missing, misordered: a.filter((id, i) => id !== b[i]).length };
  }

  function report(verb, count, playlistId, v, extra = []) {
    const link = h('a', { href: `/playlist?list=${playlistId}` }, 'Open playlist →');
    if (!v.checked) setStatus([`${verb}: ${count} videos. `, ...extra, link], 'ok');
    else if (!v.missing && !v.misordered) setStatus([`${verb}: ${count} videos, in order. `, ...extra, link], 'ok');
    else if (!v.misordered) setStatus([`${verb}. ${v.missing} of ${count} videos aren't showing yet (YouTube can lag), so refresh in a minute. `, ...extra, link], 'ok');
    else setStatus([`${verb}, but ${v.misordered} videos are out of order. Try Update again. `, ...extra, link], 'err');
  }

  async function maybeUnfollow() {
    if (!unfollowBox.checked || state.onCopyPage || state.link?.unfollowed) return [];
    if (state.owned) {
      const name = state.data?.title ?? 'the original playlist';
      const ok = confirm(`Delete "${name}" from your YouTube account?\n\nThis can't be undone. Your sorted copy stays, but it can no longer be updated from this playlist.`);
      if (!ok) return ['Original kept. '];
      try {
        await deletePlaylist(state.sourceId);
        links.remove(state.sourceId);
        state.link = null;
        unfollowBox.checked = false;
        return ['Original deleted. '];
      } catch {
        return ["(Couldn't delete the original.) "];
      }
    }
    try {
      await unsavePlaylist(state.sourceId);
      if (state.link) { state.link.unfollowed = true; links.save(state.link); }
      return ['Original removed from your Library. '];
    } catch {
      return ["(Couldn't remove the original from your Library.) "];
    }
  }

  async function runCreate() {
    const ids = state.sorted.map((v) => v.videoId).slice(0, MAX_PLAYLIST);
    if (!ids.length || state.busy) return;
    const title = (!pairEl.hidden && nameInput.value.trim()) || defaultName();
    setBusy(true);
    let newId = null;
    try {
      setStatus('Creating playlist…', '', true);
      newId = await createPlaylist(title, privacySel.value, ids[0]);
      saveLink(newId, title);
      setProgress(1, ids.length);
      await addVideos(newId, ids.slice(1), (d, t) => {
        setStatus(`Adding videos… ${d + 1}/${t + 1}`, '', true);
        setProgress(d + 1, t + 1);
      });
      const v = await verify(newId, ids);
      report('Done', ids.length, newId, v, await maybeUnfollow());
      if (state.sorted.length > MAX_PLAYLIST) statusEl.append(` Only the first ${MAX_PLAYLIST} were added (YouTube's limit).`);
    } catch (e) {
      const where = newId ? [' Partial playlist: ', h('a', { href: `/playlist?list=${newId}` }, 'open'), '. Press Update copy to finish it.'] : [];
      setStatus([`Failed: ${e.message}.`, ...where], 'err');
    } finally {
      setBusy(false);
      setProgress();
      syncMode();
    }
  }

  async function runUpdate() {
    const l = state.link;
    const desired = state.sorted.map((v) => v.videoId).slice(0, MAX_PLAYLIST);
    if (!l || !desired.length || state.busy) return;
    setBusy(true);
    try {
      setStatus('Reading your copy…', '', true);
      let current;
      try {
        current = (await fetchPlaylist(l.copyId)).items.map((v) => v.videoId);
      } catch {
        throw new Error("couldn't open your copy. If you deleted it, press Unlink and create a new one");
      }
      const plan = planUpdate(current, desired, { appendOnly: state.sortKey === 'shuffle' });
      const steps = plan.remove.length + plan.add.length;
      if (!steps) {
        saveLink(l.copyId, l.copyTitle);
        setStatus([`Already up to date: ${desired.length} videos. `, ...(await maybeUnfollow()),
          h('a', { href: `/playlist?list=${l.copyId}` }, 'Open playlist →')], 'ok');
        return;
      }
      let done = 0;
      const tick = (label) => (d) => { setStatus(`${label}… ${done + d}/${steps}`, '', true); setProgress(done + d, steps); };
      if (plan.remove.length) {
        await removeVideos(l.copyId, plan.remove, tick(plan.rebuild ? 'Clearing to re-sort' : 'Removing videos'));
        done += plan.remove.length;
      }
      if (plan.add.length) {
        await addVideos(l.copyId, plan.add, tick(plan.rebuild ? 'Re-adding in order' : 'Adding new videos'));
      }
      saveLink(l.copyId, l.copyTitle);
      const v = await verify(l.copyId, desired);
      const what = plan.rebuild
        ? 'Re-sorted'
        : `Updated (+${plan.add.length}${plan.remove.length ? ` / −${plan.remove.length}` : ''})`;
      report(what, desired.length, l.copyId, v, await maybeUnfollow());
    } catch (e) {
      setStatus(`Update failed: ${e.message}. Running Update again is safe.`, 'err');
    } finally {
      setBusy(false);
      setProgress();
      syncMode();
    }
  }

  // ---------- page lifecycle ----------
  function togglePanel(open = panel.hidden) {
    panel.hidden = !open;
    if (open) { applyTheme(); renderPreview(); }
  }

  function sync() {
    const params = new URLSearchParams(location.search);
    const listId = location.pathname === '/playlist' ? params.get('list') : null;
    if (!host.isConnected) document.body.append(host);
    applyTheme();
    if (listId !== state.listId) {
      if (state.busy) return; // don't reset mid-copy; the panel keeps working after navigation
      const copyLink = listId ? links.forCopy(listId) : null;
      state.listId = listId;
      state.onCopyPage = !!copyLink;
      state.owned = false;
      state.sourceId = copyLink ? copyLink.sourceId : listId;
      state.link = copyLink ?? (listId ? links.forSource(listId) : null);
      state.data = null;
      state.loading = null;
      state.sorted = [];
      // A linked copy remembers how it was sorted and filtered.
      state.sortKey = state.link?.sortKey ?? 'published';
      state.desc = state.link?.desc ?? false;
      sortSel.value = state.sortKey;
      syncDirOptions();
      excludeInput.value = state.link?.exclude ?? '';
      nameInput.value = '';
      subEl.textContent = '';
      hintEl.hidden = true;
      listEl.replaceChildren();
      setStatus('');
      syncMode();
      panel.hidden = true;
    }
    fab.hidden = !listId && !state.busy;
    if (!listId && !state.busy) panel.hidden = true;
  }

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden && !state.busy) togglePanel(false); });
  document.addEventListener('yt-navigate-finish', sync);
  window.addEventListener('popstate', sync);
  sync();
})(globalThis);
