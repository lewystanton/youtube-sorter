(function (root) {
  const ns = (root.__ytPlaylistSorter ??= {});

  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

  // dir labels: [ascending, descending]. needsDetails → exact dates/views fetched per video.
  const SORTS = {
    original: { label: 'Playlist order', dirs: ['As-is', 'Reversed'], cmp: (a, b) => a.index - b.index },
    published: { label: 'Date published', dirs: ['Oldest first', 'Newest first'], needsDetails: true, value: (v) => v.published },
    duration: { label: 'Duration', dirs: ['Shortest first', 'Longest first'], value: (v) => v.durationSec },
    views: { label: 'Views', dirs: ['Fewest first', 'Most first'], needsDetails: true, value: (v) => v.views },
    title: { label: 'Title', dirs: ['A → Z', 'Z → A'], cmp: (a, b) => collator.compare(a.title, b.title) },
    channel: {
      label: 'Channel',
      dirs: ['A → Z', 'Z → A'],
      cmp: (a, b) => collator.compare(a.channel, b.channel),
      tiebreak: (a, b) => (a.published ?? 0) - (b.published ?? 0) || a.index - b.index,
    },
    shuffle: { label: 'Shuffle', dirs: null },
  };

  function shuffle(list) {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  // Items missing the sort value always go last, whichever direction is chosen.
  function sortItems(items, key, descending = false) {
    const s = SORTS[key];
    if (!s) throw new Error(`Unknown sort: ${key}`);
    if (key === 'shuffle') return shuffle(items);
    const sign = descending ? -1 : 1;
    const has = s.value ? (v) => s.value(v) != null : () => true;
    const primary = s.cmp ?? ((a, b) => s.value(a) - s.value(b));
    const withVal = items.filter(has);
    const without = items.filter((v) => !has(v));
    withVal.sort((a, b) => sign * primary(a, b) || (s.tiebreak ?? ((x, y) => x.index - y.index))(a, b));
    return [...withVal, ...without];
  }

  // "trailer, livestream" → hide any video whose title or channel contains either word (case-insensitive).
  function parseTerms(text) {
    return (text || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
  }
  function filterItems(items, excludeText) {
    const terms = parseTerms(excludeText);
    if (!terms.length) return { kept: items, excluded: [] };
    const kept = [], excluded = [];
    for (const v of items) {
      const hay = `${v.title} ${v.channel}`.toLowerCase();
      (terms.some((t) => hay.includes(t)) ? excluded : kept).push(v);
    }
    return { kept, excluded };
  }

  // Works out the cheapest way to turn the copy's current contents into `desired`.
  // - appendOnly (shuffle): keep the existing order, drop what's gone, add new videos at the end.
  // - otherwise: if what survives is already the start of `desired`, just append the rest;
  //   if not, clear the playlist and re-add everything in order.
  function planUpdate(current, desired, { appendOnly = false } = {}) {
    const want = new Set(desired);
    const remove = [...new Set(current.filter((id) => !want.has(id)))];
    const kept = current.filter((id) => want.has(id));
    const keptSet = new Set(kept);
    if (appendOnly && kept.length === keptSet.size) {
      return { rebuild: false, remove, add: desired.filter((id) => !keptSet.has(id)) };
    }
    if (kept.every((id, i) => id === desired[i])) {
      return { rebuild: false, remove, add: desired.slice(kept.length) };
    }
    return { rebuild: true, remove: [...new Set(current)], add: desired };
  }

  Object.assign(ns, { SORTS, sortItems, parseTerms, filterItems, planUpdate });
})(globalThis);
