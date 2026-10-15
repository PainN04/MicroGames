# MicroGame

Minigames de navegador pra jogar com o pessoal do trabalho, com ranking compartilhado.

Reflexo · Clique Maluco · Digitação · Memória · Mira · Cobrinha · Conta Rápida · Voa Voa · Chuva de Bugs · Cor Certa · Caça Números · Toupeira · Blocos

## Como roda

- **Vercel (produção):** `index.html` estático + uma função `api/index.js` (rotas em `lib/router.js`) + banco Neon Postgres (`DATABASE_URL`). Cada push na `main` publica sozinho.
- **Teste local:** `npm run local` sobe `server.js` na porta 8080 com as mesmas rotas, mas banco SQLite (`microgame.db`) — nunca o de produção.

## Login e bloqueio por fila do Geiko

- Cada pessoa tem conta própria (senha com scrypt, sessão em cookie httpOnly assinado com `SESSION_SECRET`). O nome no ranking é o da conta.
- Contas com **ID do Geiko** vinculado têm os jogos bloqueados quando a fila de tickets abertos passa do limite. A regra (pesos por prioridade, × sem interação, × status de espera, limite) fica no **Painel admin** e é guardada na tabela `settings`. Quem não tem ID do Geiko nunca é bloqueado.
- A consulta é a mesma do GeikoDashboard: `POST /attendance/search` com `attendantIds` + `openAttendance` (cache de 60s por atendente). Se o Geiko cair, libera em vez de travar todo mundo.
- Contas dos atendentes: `npm run importar -- "<.env do GeikoDashboard>" [--producao]` lê a tabela `attendants` do GeikoDashboard (só leitura), cria uma conta por atendente já com o ID do Geiko e grava as senhas temporárias num `contas-*.csv` (fora do Git). Pula quem já tem conta.
- Primeiro admin: `npm run admin -- <usuario> "<Nome>"` (teste local) ou com `--producao` (banco da Vercel). Ele mostra uma senha temporária uma vez; o resto das contas se cria no painel.
- Variáveis: `SESSION_SECRET` (mín. 32 caracteres), `GEIKO_API_KEY`, `GEIKO_API_URL` — no `.env.local` (teste) e no projeto da Vercel (produção).

## Bibliotecas (via CDN, sem build)

- **Phaser 3.90** — Cobrinha, Mira, Voa Voa, Chuva de Bugs e Blocos. Só baixa quando alguém abre um desses jogos (no menu fica pré-buscado em segundo plano).
- **web-vitals 6** — mede LCP, INP, CLS, FCP e TTFB de quem joga e manda pra `/api/vitals`. Local: aparece no terminal do `server.js`. Vercel: em Logs do projeto (linhas `[web-vitals]`).

## Migrar pontuações do SQLite local pro Neon

Coloque `DATABASE_URL=...` em `.env.local` (não vai pro Git) e rode `npm run migrate`. O script se recusa a rodar se o Neon já tiver pontuações.
