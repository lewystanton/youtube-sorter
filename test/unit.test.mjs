// Offline tests for filtering and update planning. Usage: node test/unit.test.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const g = { Intl, Math, console };
g.globalThis = g;
vm.createContext(g);
for (const f of ['parse.js', 'sort.js']) vm.runInContext(fs.readFileSync(`src/${f}`, 'utf8'), g, { filename: f });
const { filterItems, planUpdate, parseTerms } = g.__ytPlaylistSorter;
const plain = (x) => JSON.parse(JSON.stringify(x));

// keyword filter
assert.deepEqual(plain(parseTerms(' Trailer,  livestream ,,')), ['trailer', 'livestream']);
const vids = [
  { title: 'Episode 12: The Finale', channel: 'Example Channel' },
  { title: 'Official Trailer for Season 2', channel: 'Example Channel' },
  { title: 'LIVESTREAM replay', channel: 'Example Channel' },
];
let r = filterItems(vids, 'trailer, livestream');
assert.equal(r.kept.length, 1);
assert.equal(r.excluded.length, 2);
assert.equal(filterItems(vids, '').kept.length, 3);
assert.equal(filterItems(vids, 'example channel').kept.length, 0, 'channel names match too');

// update planning
const P = (c, d, o) => plain(planUpdate(c, d, o));
assert.deepEqual(P(['a', 'b'], ['a', 'b']), { rebuild: false, remove: [], add: [] }, 'nothing to do');
assert.deepEqual(P(['a', 'b'], ['a', 'b', 'c', 'd']), { rebuild: false, remove: [], add: ['c', 'd'] }, 'new videos at the end → append');
assert.deepEqual(P(['a', 'x', 'b'], ['a', 'b', 'c']), { rebuild: false, remove: ['x'], add: ['c'] }, 'removed from source → remove');
assert.deepEqual(P(['a', 'c'], ['a', 'b', 'c']), { rebuild: true, remove: ['a', 'c'], add: ['a', 'b', 'c'] }, 'new video in the middle → rebuild');
assert.deepEqual(P(['b', 'a'], ['a', 'b']), { rebuild: true, remove: ['b', 'a'], add: ['a', 'b'] }, 'sort changed → rebuild');
assert.deepEqual(P([], ['a', 'b']), { rebuild: false, remove: [], add: ['a', 'b'] }, 'empty copy → fill');
assert.deepEqual(P(['a', 'a', 'b'], ['a', 'b']).rebuild, true, 'duplicates → rebuild');
assert.deepEqual(P(['c', 'a'], ['b', 'a', 'c', 'd'], { appendOnly: true }), { rebuild: false, remove: [], add: ['b', 'd'] }, 'shuffle keeps order, appends new');

console.log('ALL UNIT TESTS PASSED');
