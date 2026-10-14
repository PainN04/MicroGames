# MicroGame

Minigames de navegador pra jogar com o pessoal do trabalho, com ranking compartilhado.

Reflexo · Clique Maluco · Digitação · Memória · Mira · Cobrinha · Conta Rápida

## Como roda

- **Vercel (produção):** `index.html` estático + funções em `api/` + banco Neon Postgres (`DATABASE_URL`). Cada push na `main` publica sozinho.
- **Rede local (sem internet):** `npm run local` sobe `server.js` com SQLite (`microgame.db`) na porta 3000.

## Bibliotecas (via CDN, sem build)

- **Phaser 3.90** — Cobrinha e Mira. Só baixa quando alguém abre um desses jogos (no menu fica pré-buscado em segundo plano).
- **web-vitals 6** — mede LCP, INP, CLS, FCP e TTFB de quem joga e manda pra `/api/vitals`. Local: aparece no terminal do `server.js`. Vercel: em Logs do projeto (linhas `[web-vitals]`).

## Migrar pontuações do SQLite local pro Neon

Coloque `DATABASE_URL=...` em `.env.local` (não vai pro Git) e rode `npm run migrate`. O script se recusa a rodar se o Neon já tiver pontuações.
