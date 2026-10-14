# MicroGame

Minigames de navegador pra jogar com o pessoal do trabalho, com ranking compartilhado.

Reflexo · Clique Maluco · Digitação · Memória · Mira · Cobrinha · Conta Rápida

## Como roda

- **Vercel (produção):** `index.html` estático + funções em `api/` + banco Neon Postgres (`DATABASE_URL`). Cada push na `main` publica sozinho.
- **Rede local (sem internet):** `npm run local` sobe `server.js` com SQLite (`microgame.db`) na porta 3000.

## Migrar pontuações do SQLite local pro Neon

Coloque `DATABASE_URL=...` em `.env.local` (não vai pro Git) e rode `npm run migrate`. O script se recusa a rodar se o Neon já tiver pontuações.
