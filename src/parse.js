// Turns YouTube's internal ("InnerTube") browse responses into plain video records.
// Handles both the newer lockupViewModel layout and the older playlistVideoRenderer one.
(function (root) {
  const ns = (root.__ytPlaylistSorter ??= {});

  function collect(obj, key, out = []) {
    if (obj && typeof obj === 'object') {
      if (Array.isArray(obj)) {
        for (const v of obj) collect(v, key, out);
      } else {
        for (const [k, v] of Object.entries(obj)) {
          if (k === key) out.push(v);
          collect(v, key, out);
        }
      }
    }
    return out;
  }

  const text = (t) => t?.content ?? t?.simpleText ?? t?.runs?.map((r) => r.text).join('') ?? '';

  function parseDuration(s) {
    if (!s || !/^\d+(:\d{1,2}){1,2}$/.test(s.trim())) return null;
    return s.trim().split(':').reduce((acc, n) => acc * 60 + Number(n), 0);
  }

  const MULT = { k: 1e3, m: 1e6, b: 1e9 };
  function parseViews(s) {
    const m = /([\d.,]+)\s*([KMB])?\s*views?/i.exec(s || '');
    if (!m) return /no views/i.test(s || '') ? 0 : null;
    const n = parseFloat(m[1].replace(/,/g, ''));
    return Math.round(n * (m[2] ? MULT[m[2].toLowerCase()] : 1));
  }

  const UNIT_MS = { second: 1e3, minute: 6e4, hour: 36e5, day: 864e5, week: 6048e5, month: 2592e6, year: 31536e6 };
  function parseAgo(s, now = Date.now()) {
    const m = /(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i.exec(s || '');
    return m ? now - Number(m[1]) * UNIT_MS[m[2].toLowerCase()] : null;
  }

  function fromLockup(l) {
    if (!l?.contentId || (l.contentType && l.contentType !== 'LOCKUP_CONTENT_TYPE_VIDEO')) return null;
    const meta = l.metadata?.lockupMetadataViewModel;
    const parts = collect(meta?.metadata, 'metadataParts').flat().map((p) => text(p.text)).filter(Boolean);
    let channel = null, views = null, published = null;
    for (const p of parts) {
      if (views == null && parseViews(p) != null) views = parseViews(p);
      else if (published == null && parseAgo(p) != null) published = parseAgo(p);
      else if (channel == null) channel = p;
    }
    const badge = collect(l.contentImage, 'thumbnailBadgeViewModel').map((b) => b.text).find((t) => parseDuration(t) != null);
    return {
      videoId: l.contentId,
      title: text(meta?.title),
      channel: channel ?? '',
      durationSec: parseDuration(badge),
      views, // approximate ("28M views") until details are fetched
      published, // approximate ("12 years ago") until details are fetched
      exact: false,
    };
  }

  function fromLegacy(r) {
    if (!r?.videoId || r.isPlayable === false) return null;
    const info = (r.videoInfo?.runs ?? []).map((x) => x.text);
    return {
      videoId: r.videoId,
      title: text(r.title),
      channel: text(r.shortBylineText),
      durationSec: r.lengthSeconds != null ? Number(r.lengthSeconds) : parseDuration(text(r.lengthText)),
      views: info.map(parseViews).find((v) => v != null) ?? null,
      published: info.map((s) => parseAgo(s)).find((v) => v != null) ?? null,
      exact: false,
    };
  }

  // Returns { title, items, continuation } for either a first page or a continuation response.
  function parsePage(resp) {
    const items = [
      ...collect(resp, 'lockupViewModel').map(fromLockup),
      ...collect(resp, 'playlistVideoRenderer').map(fromLegacy),
    ].filter(Boolean);
    const conts = [...collect(resp, 'continuationItemViewModel'), ...collect(resp, 'continuationItemRenderer')];
    const continuation = conts.map((c) => collect(c, 'token')[0]).find(Boolean) ?? null;
    const title =
      resp?.metadata?.playlistMetadataRenderer?.title ??
      text(collect(resp, 'playlistHeaderRenderer')[0]?.title) ??
      null;
    return { title: title || null, items, continuation };
  }

  Object.assign(ns, { collect, parseDuration, parseViews, parseAgo, parsePage });
})(globalThis);
