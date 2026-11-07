// Tiny static server for the project (ES modules need http, not file://)
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav', '.css': 'text/css' };
export function serve(port = 0) {
  return new Promise((res) => {
    const srv = http.createServer((req, rq) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html';
      const f = path.join(root, p);
      if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rq.writeHead(404); rq.end('nf'); return; }
      rq.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      fs.createReadStream(f).pipe(rq);
    });
    srv.listen(port, '127.0.0.1', () => res({ server: srv, port: srv.address().port, url: `http://127.0.0.1:${srv.address().port}` }));
  });
}
if (process.argv[1] && process.argv[1].endsWith('serve.js')) serve(parseInt(process.argv[2] || '8787')).then((s) => console.log('serving', s.url));
