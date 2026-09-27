# Playlist Sorter

YouTube won't let you sort playlists you didn't make. This extension copies any playlist into a **new playlist on your own account**, in whatever order you pick. Because it's a real playlist, it shows up on your TV, phone and everywhere else you're signed in.

## Install

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.

## Use

1. Sign in to YouTube and open any playlist page (`youtube.com/playlist?list=…`).
2. Click **Sort & copy** (bottom-right corner).
3. Pick a sort. The preview shows the exact order the new playlist will have.
4. Optionally hide videos by keyword, e.g. `trailer, livestream`. Titles and channel names are matched, case-insensitive.
5. Set a name and visibility (Private by default), then click **Create sorted playlist**.
   Tick **Remove the original from my Library afterwards** to unfollow the source once the copy is made.

Sorts: date published, duration, views, title (natural order: "Part 2" before "Part 10"), channel, reversed, shuffle.

### Keeping the copy up to date

The extension remembers which copy belongs to which original, along with its sort and keyword settings. The same playlist is always updated, so it stays wherever you have it (TV, phone, Library).

- Open either the original or **your copy** and click **Update copy**. The button appears on the copy's own page too, so you can update even after unfollowing the original.
- If the new videos belong at the end (the usual case with "oldest first"), they're appended. Videos removed from the original, or newly hidden by your keywords, are removed from the copy. If the order itself changed (a different sort, or a new video in the middle), the copy is cleared and re-filled in order.
- Shuffle keeps your existing order and adds new videos at the end.
- **Already made a copy? Link it** (on the original) or **Is this a copy? Link it to its original** (on your copy) connects a copy you made before this feature existed.
- If the original is your own playlist, the checkbox becomes **Delete the original playlist afterwards**. It is never ticked by default and asks for confirmation.
- **Unlink** forgets the connection. Both playlists are left as they are.

Links are stored in this browser (localStorage on youtube.com), so updating works from the PC you set it up on.

## How it works

It uses YouTube's own internal web API (the same requests youtube.com sends), authenticated with your existing session. That means there's no API key, no OAuth and no daily quota. There's also no server: nothing leaves your browser except requests to youtube.com.

- `src/parse.js`: turns YouTube's responses into video records. Supports both the current `lockupViewModel` layout and the older `playlistVideoRenderer` one.
- `src/sort.js`: sort modes, keyword filter, and the update planner (append vs. rebuild).
- `src/innertube.js`: signed requests to `/youtubei/v1/*` (browse, player, playlist/create, browse/edit_playlist, like/removelike).
- `src/ui.js`: the button and panel (shadow DOM, Trusted Types-safe).

Sorting by date or views fetches exact values for each video (a few requests at a time), so the first time takes a few seconds. Other sorts are instant.

## Caveats

- **Unofficial API.** When YouTube changes its internals this may break. If it does, check the browser console on youtube.com for errors.
- YouTube caps playlists at 5,000 videos. Unavailable (deleted or private) videos are skipped.
- Updates are manual: press **Update copy** when you want new videos pulled in.

## Tests

```bash
node test/unit.test.mjs            # keyword filter + update planner (offline)
node test/read.test.mjs <playlistId>   # read + sort against any public playlist with 100+ videos (read-only, no account)
node test/serve.mjs                # UI harness with a fake, stateful YouTube at http://localhost:5178/playlist (?dark for dark mode)
```
