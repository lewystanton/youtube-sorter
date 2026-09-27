// Tiny static server for test/ui-harness.html (any unknown path serves the harness, so /playlist works).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json' };
http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  const file = p.startsWith(root) && fs.existsSync(p) && fs.statSync(p).isFile() ? p : path.join(root, 'test/ui-harness.html');
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'text/plain', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}).listen(process.env.PORT || 5178, () => console.log('harness on http://localhost:' + (process.env.PORT || 5178) + '/playlist'));
