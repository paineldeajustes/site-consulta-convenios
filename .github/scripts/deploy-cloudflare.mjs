/**
 * GitHub Actions: publica somente os arquivos do Painel de Ajustes ou do Clareza.
 * Não modifica o Supabase, não acessa seus dados e não publica arquivos internos do repositório.
 * Requer CLOUDFLARE_API_TOKEN como GitHub Actions Secret.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const app = process.argv[2];
const definitions = {
  painel: {
    worker: 'painel-de-ajustes',
    files: { '/index.html': 'index.html' },
  },
  clareza: {
    worker: 'clareza-tarefas',
    files: Object.fromEntries([
      'index.html', 'manifest.webmanifest', 'sw.js', 'workflow.js',
      'settings.js', 'ideas.js', 'settings.css', 'ideas.css',
      'task-list.css', 'icon.svg',
    ].map(name => [`/${name}`, `tarefas/${name}`])),
  },
};

if (!Object.hasOwn(definitions, app)) {
  throw new Error('Informe a aplicação: painel ou clareza.');
}
const token = process.env.CLOUDFLARE_API_TOKEN;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!token || !accountId || !/^[a-f0-9]{32}$/.test(accountId)) {
  throw new Error('Configure CLOUDFLARE_API_TOKEN e CLOUDFLARE_ACCOUNT_ID no workflow.');
}
const definition = definitions[app];
const assets = Object.fromEntries(Object.entries(definition.files).map(([urlPath, filePath]) => [
  urlPath, readFileSync(resolve(filePath), 'utf8'),
]));
const code = `
const FILES = ${JSON.stringify(assets)};
const IS_CLAREZA = ${app === 'clareza'};
const MIME = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  svg: 'image/svg+xml',
  webmanifest: 'application/manifest+json; charset=utf-8',
};
export default {
  async fetch(request) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405 });
    }
    const url = new URL(request.url);
    let path = url.pathname;
    if (path === '/' || path === '/index.html' || (IS_CLAREZA && (path === '/tarefas/' || path === '/tarefas'))) {
      path = '/index.html';
    } else if (IS_CLAREZA && path.startsWith('/tarefas/')) {
      path = path.slice('/tarefas'.length);
    }
    if (!Object.hasOwn(FILES, path)) {
      return new Response('Not Found', { status: 404 });
    }
    const extension = path.split('.').pop();
    const headers = {
      'content-type': MIME[extension] || 'text/plain; charset=utf-8',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'cache-control': path === '/index.html' ? 'no-store' : 'no-cache',
    };
    if (path === '/sw.js') headers['service-worker-allowed'] = '/';
    return new Response(request.method === 'HEAD' ? null : FILES[path], { status: 200, headers });
  },
};
`;

const form = new FormData();
form.append('metadata', new Blob([JSON.stringify({
  main_module: 'worker.js',
  compatibility_date: '2026-11-08',
})], { type: 'application/json' }));
form.append('worker.js', new Blob([code], { type: 'application/javascript+module' }), 'worker.js');

const response = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${definition.worker}`,
  { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: form },
);
const result = await response.json();
if (!response.ok || !result.success) {
  const message = JSON.stringify(result.errors || []);
  throw new Error(`Falha ao publicar ${definition.worker}: HTTP ${response.status}: ${message}`);
}
console.log(`Worker ${definition.worker} publicado a partir do GitHub: ${Object.keys(assets).length} arquivos.`);
