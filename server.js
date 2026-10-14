// Servidor local do MicroGame (rede do escritório): serve o index.html e guarda as pontuações em SQLite.
// Em produção o jogo roda na Vercel (api/*.js + Neon); este arquivo é só pra rodar sem internet.
// Uso: node server.js   (porta padrão 3000, mude com PORT=xxxx)
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { checkSubmission, groupByGame } = require('./lib/rules');

const PORT = Number(process.env.PORT) || 3000;

const db = new DatabaseSync(path.join(__dirname, 'microgame.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS scores (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    game       TEXT    NOT NULL,
    player     TEXT    NOT NULL,
    score      REAL    NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_scores_game ON scores (game);
`);

const insertScore = db.prepare('INSERT INTO scores (game, player, score, created_at) VALUES (?, ?, ?, ?)');
const allScores = db.prepare('SELECT game, player AS name, score, created_at AS date FROM scores');

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 1e4) { reject(new Error('body too large')); req.destroy(); }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    // A página compara essa versão pra se recarregar sozinha quando o index.html muda.
    if (url.pathname === '/api/version' && req.method === 'GET') {
      return send(res, 200, { version: fs.statSync(path.join(__dirname, 'index.html')).mtimeMs });
    }
    if (url.pathname === '/api/scores' && req.method === 'GET') {
      return send(res, 200, groupByGame(allScores.all()));
    }
    if (url.pathname === '/api/scores' && req.method === 'POST') {
      const { status, error, entry } = checkSubmission(JSON.parse(await readBody(req)));
      if (error) return send(res, status, { error });
      insertScore.run(entry.game, entry.player, entry.score, Date.now());
      return send(res, 201, { ok: true });
    }
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return send(res, 200, fs.readFileSync(path.join(__dirname, 'index.html')), 'text/html; charset=utf-8');
    }
    send(res, 404, { error: 'não encontrado' });
  } catch (err) {
    send(res, 400, { error: err.message });
  }
});

server.on('error', err => {
  if (err.code !== 'EADDRINUSE') throw err;
  console.error(`Porta ${PORT} já está em uso (o MicroGame já está rodando?).`);
  console.error(`Feche o outro processo ou use outra porta: $env:PORT=3001; node server.js`);
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`MicroGame rodando em http://localhost:${PORT}`);
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const n of nets) if (n.family === 'IPv4' && !n.internal) console.log(`  Na rede: http://${n.address}:${PORT}`);
  }
});
