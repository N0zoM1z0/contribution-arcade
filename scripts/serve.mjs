import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.gif': 'image/gif' };

export function serve(port = 4173) {
  return new Promise((ready, reject) => {
    const server = createServer(async (request, response) => {
      try {
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        const path = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
        // Serve only preview assets; never expose local input, source, or credentials.
        const relative = path.slice(root.length);
        const permitted = path === resolve(root, 'index.html') || ['public', 'generated', 'previews'].some(directory => relative.startsWith(`${directory}${sep}`));
        if (!path.startsWith(root) || !permitted || !(await stat(path)).isFile()) { response.writeHead(404); response.end('Not found'); return; }
        response.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        response.end(await readFile(path));
      } catch { response.writeHead(404); response.end('Not found'); }
    });
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => ready(server));
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4173);
  await serve(port);
  console.log(`Contribution Arcade → http://localhost:${port}`);
}
