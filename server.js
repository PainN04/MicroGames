// Servidor de TESTE local do MicroGame: serve o index.html e as mesmas rotas /api/* da Vercel (lib/router.js),
// mas com o banco SQLite local (microgame.db) — nunca encosta no banco de produção.
// Uso: npm run local   (porta padrão 8080, mude com $env:PORT=xxxx)
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Do .env.local só pega o que o teste precisa (chave do Geiko e segredo de sessão).
// DATABASE_URL de lá é o banco de PRODUÇÃO e fica de fora de propósito.
const envFile = path.join(__dirname, '.env.local');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^(GEIKO_API_KEY|GEIKO_API_URL|GEIKO_URL|SESSION_SECRET|SESSION_TTL_HOURS)="?([^"]*)"?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
process.env.MICROGAME_SQLITE ||= path.join(__dirname, 'microgame.db');

const { handle } = require('./lib/router');
const { ensureSchema } = require('./lib/schema');

const PORT = Number(process.env.PORT) || 8080;
const INDEX = path.join(__dirname, 'index.html');
// A página compara essa versão pra se recarregar sozinha quando o index.html muda.
const version = () => String(fs.statSync(INDEX).mtimeMs);

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  if (pathname.startsWith('/api/')) return handle(req, res, { version });
  if (pathname === '/' || pathname === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(fs.readFileSync(INDEX));
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end('{"error":"não encontrado"}');
});

server.on('error', err => {
  if (err.code !== 'EADDRINUSE') throw err;
  console.error(`Porta ${PORT} já está em uso (o MicroGame já está rodando?).`);
  console.error(`Feche o outro processo ou use outra porta: $env:PORT=8081; npm run local`);
  process.exit(1);
});

ensureSchema().then(() => {
  if (!process.env.SESSION_SECRET) console.warn('⚠️  SESSION_SECRET não está no .env.local — o login não vai funcionar.');
  if (!process.env.GEIKO_API_KEY) console.warn('⚠️  GEIKO_API_KEY não está no .env.local — o bloqueio por tickets fica desligado (libera todo mundo).');
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`MicroGame (teste, banco local) em http://localhost:${PORT}`);
    for (const nets of Object.values(os.networkInterfaces())) {
      for (const n of nets) if (n.family === 'IPv4' && !n.internal) console.log(`  Na rede: http://${n.address}:${PORT}`);
    }
  });
});
