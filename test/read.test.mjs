// Runs the real parse/sort/innertube code against live YouTube (anonymous, read-only).
// Usage: node test/read.test.mjs <playlistId>   (any public playlist with 100+ videos)
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const home = await (await fetch('https://www.youtube.com/?hl=en')).text();
const version = home.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)[1];
const data = {
  INNERTUBE_CLIENT_VERSION: version,
  INNERTUBE_CONTEXT_CLIENT_NAME: 1,
  INNERTUBE_CONTEXT: { client: { clientName: 'WEB', clientVersion: version, hl: 'en', gl: 'GB' } },
};
const g = {
  ytcfg: { get: (k) => data[k] },
  document: { cookie: '' },
  location: { origin: 'https://www.youtube.com' },
  fetch: (url, init) => fetch(new URL(url, 'https://www.youtube.com'), init),
  crypto, TextEncoder, URL, setTimeout, Intl, Date, Math, console,
};
g.globalThis = g;
vm.createContext(g);
for (const f of ['parse.js', 'sort.js', 'innertube.js']) vm.runInContext(fs.readFileSync(`src/${f}`, 'utf8'), g, { filename: f });
const ns = g.__ytPlaylistSorter;

// parser unit checks
assert.equal(ns.parseDuration('6:17'), 377);
assert.equal(ns.parseDuration('1:02:03'), 3723);
assert.equal(ns.parseDuration('LIVE'), null);
assert.equal(ns.parseViews('28M views'), 28e6);
assert.equal(ns.parseViews('1,234 views'), 1234);
assert.equal(ns.parseViews('No views'), 0);
assert.ok(Math.abs(ns.parseAgo('12 years ago', 0) + 12 * 31536e6) < 1);

const id = process.argv[2];
if (!id) {
  console.error('Usage: node test/read.test.mjs <playlistId>   (any public playlist with 100+ videos)');
  process.exit(1);
}
const { title, items } = await ns.fetchPlaylist(id, (n) => process.stdout.write(`\rloaded ${n}`));
console.log(`\n"${title}" – ${items.length} videos`);
assert.ok(items.length > 100, 'expected pagination past the first page');
assert.equal(new Set(items.map((v) => v.videoId)).size, items.length);
for (const v of items) assert.ok(v.videoId && v.title, 'every item has id + title');
console.log('with duration:', items.filter((v) => v.durationSec != null).length, ' with channel:', items.filter((v) => v.channel).length);

const sample = items.slice(0, 30);
await ns.fetchDetails(sample);
console.log('exact details:', sample.filter((v) => v.exact).length, '/', sample.length);
assert.ok(sample.every((v) => v.exact && v.published > 0 && v.views >= 0));

const byDate = ns.sortItems(sample, 'published');
for (let i = 1; i < byDate.length; i++) assert.ok(byDate[i - 1].published <= byDate[i].published);
const byDur = ns.sortItems(items, 'duration', true);
assert.ok(byDur[0].durationSec >= byDur[1].durationSec);
const byTitle = ns.sortItems([{ title: 'Part 10', index: 0 }, { title: 'Part 2', index: 1 }], 'title');
assert.equal(byTitle[0].title, 'Part 2', 'natural number sort');
const rev = ns.sortItems(items, 'original', true);
assert.equal(rev[0].videoId, items.at(-1).videoId);
assert.equal(ns.sortItems(items, 'shuffle').length, items.length);
const missing = ns.sortItems([{ index: 0, durationSec: null }, { index: 1, durationSec: 5 }], 'duration', true);
assert.equal(missing[1].durationSec, null, 'missing values sort last');

console.log('oldest 3:', byDate.slice(0, 3).map((v) => `${new Date(v.published).toISOString().slice(0, 10)} ${v.title}`));
console.log('ALL READ TESTS PASSED');
