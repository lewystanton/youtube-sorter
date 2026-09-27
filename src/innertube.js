// Calls YouTube's internal API the same way youtube.com does, using the signed-in session.
// Runs in the page's MAIN world so it can read ytcfg and the page's cookies.
(function (root) {
  const ns = (root.__ytPlaylistSorter ??= {});
  const { parsePage } = ns;

  const cfg = (k) => root.ytcfg?.get?.(k) ?? root.ytcfg?.data_?.[k];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function cookie(name) {
    const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name.replace(/[$.]/g, '\\$&') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  async function sha1(s) {
    const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Same Authorization header youtube.com sends for signed-in requests.
  async function authHeader() {
    const ts = Math.floor(Date.now() / 1000);
    const parts = [];
    for (const [label, name] of [
      ['SAPISIDHASH', 'SAPISID'],
      ['SAPISID1PHASH', '__Secure-1PAPISID'],
      ['SAPISID3PHASH', '__Secure-3PAPISID'],
    ]) {
      const v = cookie(name);
      if (v) parts.push(`${label} ${ts}_${await sha1(`${ts} ${v} ${location.origin}`)}`);
    }
    return parts.join(' ');
  }

  const isLoggedIn = () => !!cfg('LOGGED_IN') && !!(cookie('SAPISID') || cookie('__Secure-3PAPISID'));

  async function call(endpoint, body, retries = 3) {
    const headers = {
      'Content-Type': 'application/json',
      'X-Origin': location.origin,
      'X-Goog-AuthUser': String(cfg('SESSION_INDEX') ?? 0),
      'X-Youtube-Client-Name': String(cfg('INNERTUBE_CONTEXT_CLIENT_NAME') ?? 1),
      'X-Youtube-Client-Version': cfg('INNERTUBE_CLIENT_VERSION') ?? '',
    };
    const auth = await authHeader();
    if (auth) headers.Authorization = auth;
    if (cfg('DELEGATED_SESSION_ID')) headers['X-Goog-PageId'] = cfg('DELEGATED_SESSION_ID'); // brand accounts
    if (cfg('VISITOR_DATA')) headers['X-Goog-Visitor-Id'] = cfg('VISITOR_DATA');

    const res = await fetch(`/youtubei/v1/${endpoint}?prettyPrint=false`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({ context: cfg('INNERTUBE_CONTEXT'), ...body }),
    });
    if (!res.ok) {
      if (retries > 0 && (res.status === 429 || res.status >= 500)) {
        await sleep(1500 * (4 - retries));
        return call(endpoint, body, retries - 1);
      }
      const err = new Error(`YouTube rejected ${endpoint} (HTTP ${res.status})`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  async function fetchPlaylist(playlistId, onProgress) {
    const raw = await call('browse', { browseId: 'VL' + playlistId });
    const first = parsePage(raw);
    const ownerId = ns.collect(raw.header, 'browseId').find((id) => /^UC/.test(id)) ?? null;
    const seen = new Set();
    const items = [];
    const add = (page) => {
      let added = 0;
      for (const v of page.items) {
        if (seen.has(v.videoId)) continue;
        seen.add(v.videoId);
        items.push({ ...v, index: items.length });
        added++;
      }
      return added;
    };
    add(first);
    onProgress?.(items.length);
    let token = first.continuation;
    while (token) {
      const page = parsePage(await call('browse', { continuation: token }));
      if (!add(page)) break;
      onProgress?.(items.length);
      token = page.continuation;
    }
    return { title: first.title, ownerId, items };
  }

  // The signed-in user's channel ID (from the avatar menu), cached for the page's lifetime.
  let myChannel;
  async function myChannelId() {
    if (myChannel === undefined) {
      try {
        myChannel = ns.collect(await call('account/account_menu', {}), 'browseId').find((id) => /^UC/.test(id)) ?? null;
      } catch {
        myChannel = null;
      }
    }
    return myChannel;
  }

  // Exact publish date + view count, one request per video, a few at a time.
  async function fetchDetails(items, onProgress, concurrency = 6) {
    let next = 0, done = 0;
    async function worker() {
      while (next < items.length) {
        const v = items[next++];
        if (!v.exact) {
          try {
            const p = await call('player', { videoId: v.videoId });
            const date = p.microformat?.playerMicroformatRenderer?.publishDate;
            if (date && !isNaN(Date.parse(date))) v.published = Date.parse(date);
            if (p.videoDetails?.viewCount != null) v.views = Number(p.videoDetails.viewCount);
            if (v.durationSec == null && p.videoDetails?.lengthSeconds) v.durationSec = Number(p.videoDetails.lengthSeconds);
            v.exact = true;
          } catch {
            // keep the approximate values from the playlist page
          }
        }
        onProgress?.(++done, items.length);
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  }

  const PRIVACY = ['PRIVATE', 'UNLISTED', 'PUBLIC'];

  async function createPlaylist(title, privacy, firstVideoId) {
    if (!PRIVACY.includes(privacy)) throw new Error(`Bad privacy: ${privacy}`);
    const res = await call('playlist/create', { title, privacyStatus: privacy, videoIds: [firstVideoId] });
    const id = res.playlistId ?? ns.collect(res, 'playlistId')[0];
    if (!id) throw new Error('YouTube did not return a playlist ID');
    return id;
  }

  const ADD = (id) => ({ action: 'ACTION_ADD_VIDEO', addedVideoId: id });
  const REMOVE = (id) => ({ action: 'ACTION_REMOVE_VIDEO_BY_VIDEO_ID', removedVideoId: id });

  async function editChunk(playlistId, actions) {
    const res = await call('browse/edit_playlist', { playlistId, actions });
    if (res.status && res.status !== 'STATUS_SUCCEEDED') throw new Error(`Editing the playlist failed (${res.status})`);
  }

  // Applies one action per video, in order. Starts with chunks of 50 and halves the chunk if YouTube refuses it.
  async function editInChunks(playlistId, ids, toAction, onProgress, delayMs = 500) {
    let size = 50, i = 0;
    while (i < ids.length) {
      const chunk = ids.slice(i, i + size);
      try {
        await editChunk(playlistId, chunk.map(toAction));
      } catch (e) {
        if (size > 1 && e.status !== 401 && e.status !== 403) {
          size = Math.max(1, Math.floor(size / 2));
          await sleep(delayMs * 2);
          continue;
        }
        e.addedSoFar = i;
        throw e;
      }
      i += chunk.length;
      onProgress?.(i, ids.length);
      if (i < ids.length) await sleep(delayMs);
    }
  }

  const addVideos = (playlistId, ids, onProgress) => editInChunks(playlistId, ids, ADD, onProgress);
  const removeVideos = (playlistId, ids, onProgress) => editInChunks(playlistId, ids, REMOVE, onProgress);

  // Saved playlists are "liked" playlists internally; this is the Library "Remove" button.
  async function unsavePlaylist(playlistId) {
    await call('like/removelike', { target: { playlistId } });
  }

  async function deletePlaylist(playlistId) {
    await call('playlist/delete', { playlistId });
  }

  Object.assign(ns, {
    isLoggedIn, myChannelId, fetchPlaylist, fetchDetails,
    createPlaylist, addVideos, removeVideos, unsavePlaylist, deletePlaylist, sleep,
  });
})(globalThis);
