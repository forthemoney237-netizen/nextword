import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import handler from '../api/predict.js';

const root = resolve('docs');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1:3000');
    if (url.pathname === '/api/predict') {
      const options = { method: req.method, headers: req.headers };
      if (req.method !== 'GET' && req.method !== 'HEAD') { options.body = req; options.duplex = 'half'; }
      const response = await handler.fetch(new Request(url, options));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    const filename = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!filename.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
    const file = await readFile(filename);
    res.writeHead(200, { 'Content-Type': types[extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(file);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(3000, '127.0.0.1', () => console.log('Local: http://127.0.0.1:3000'));
