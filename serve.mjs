import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../docs/', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
export function serve(port, intercept = async () => false) {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (await intercept(request, response, url)) return;
      const path = decodeURIComponent(url.pathname).replace(/^\/asma-quiz(?=\/)/, '');
      const file = resolve(root, '.' + (path.endsWith('/') ? path + 'index.html' : path));
      if (!file.startsWith(resolve(root) + sep) || !types[extname(file)]) {
        response.writeHead(404).end('Not found');
        return;
      }
      const body = await readFile(file);
      response.writeHead(200, { 'Content-Type': types[extname(file)] + '; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(body);
    } catch {
      response.writeHead(404).end('Not found');
    }
  }).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/asma-quiz/`));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  serve(Number(process.argv[2] || process.env.ASMA_PORT || 4173));
}
