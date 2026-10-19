# MicroGame

Minigames de navegador pra jogar com o pessoal do trabalho, com ranking compartilhado, desafio do dia, torneio semanal e um bloqueio que tira os jogos de quem está com a fila de tickets do Geiko cheia.

Tudo roda no navegador, sem build: HTML, CSS e um arquivo JavaScript por jogo. O servidor é uma única função Node na Vercel com banco Neon Postgres; pra testar no PC, o mesmo código roda com SQLite.

## Jogos

São 27 jogos. Cada um é um arquivo em `public/js/games/`.

| Jogo | Como joga |
| --- | --- |
| Reflexo | Clique (ou Espaço) quando ficar verde. Média de 3 rodadas. |
| Clique Maluco | Quantos cliques em 10 segundos (com trava anti-autoclicker). |
| Digitação | Máximo de palavras certas em 30s. |
| Memória | Repita a sequência de cores, estilo Genius. |
| Mira | Acerte 20 alvos o mais rápido possível. |
| Cobrinha | Snake que acelera a cada fruta; a dourada vale 5 e a azul encolhe o rabo. |
| Conta Rápida | Contas em 30s, com combo multiplicador. |
| Voa Voa | Passe entre os canos; estrela, escudo e relógio de câmera lenta. |
| Chuva de Bugs | Desvie dos bugs que caem cada vez mais rápido. |
| Cor Certa | Clique na cor da tinta, não na palavra. Combo até x4. |
| Caça Números | Clique de 1 a 25 em ordem. |
| Toupeira | Acerte as toupeiras; estrela, toupeira dourada e bomba. Combo até x4. |
| Blocos | Estilo Tetris. |
| Quebra-Tijolos | Rebata a bola e quebre os tijolos. |
| 2048 | Junte números iguais em 3 minutos. |
| Torre | Empilhe blocos; o que passa da borda é cortado. |
| Invasores | Desvie dos tiros e destrua as naves. |
| Campo Minado | Abra todas as casas sem mina. |
| Ritmo | Aperte D F J K no tempo da nota, com música gerada. |
| Anagrama | Desembaralhe palavras em 60s. |
| Pong | Rebata a bola contra a máquina, que acelera a cada ponto. |
| Corredor | Pule cactos e abaixe dos pássaros, cada vez mais rápido. |
| Come-Come | Coma as bolinhas e fuja dos fantasmas. |
| Forca | Palavras de TI e do escritório; errou 6 letras, acabou. |
| Ligue 4 | Contra a máquina, que fica mais esperta a cada vitória. |
| Sudoku | Menor tempo ganha; dica custa +20s. |
| Termo | A palavra do dia, igual pra todo mundo. Só vale a primeira partida de cada dia. |

Todos funcionam no celular (toque, deslize ou botões na tela).

## O que tem além dos jogos

- **Ranking** por jogo, do mês e geral, com campeões dos meses que já acabaram e a janela **Rankings** com os destaques.
- **Desafio do dia:** um jogo sorteado por dia, igual pra todo mundo (`public/js/daily.js`, usado pela página e pelo servidor). Quem ganha leva a coroa ao lado do nome no dia seguinte e escolhe o jogo de amanhã. Vitórias acumuladas liberam molduras de avatar (bronze, prata, ouro, diamante).
- **Perfil e conquistas**, calculados na página a partir das partidas.
- **Social e competição** (`lib/social.js`): reações nos recordes, duelos de 24h, torneio semanal (3 jogos sorteados por semana, de segunda a domingo no horário de Brasília) e duplas.
- **Avisos**: recorde tomado, reação, duelo e torneio aparecem no balão da conta.
- **Cards 3D no menu** com Zdog e Vanilla-Tilt; dá pra desligar no botão do topo se ficar pesado.
- **Painel admin**: contas, regra de bloqueio do Geiko, relatório de partidas (por pessoa, jogo, dia e hora), relatório jogo × trabalho da semana, editor de recordes, backups, erros de JavaScript dos jogadores e quem está online.

## Como roda

- **Produção (Vercel):** `public/` é servido estático e todo `/api/*` cai na função `api/index.js`, que entrega pra `lib/router.js`. Banco Neon Postgres (`DATABASE_URL`). Cada push na `main` publica sozinho.
- **Versão de teste (Vercel, branch `dev`):** os previews usam o banco de teste em `Homolog_DB_DATABASE_URL` e nunca o de produção. Com o banco de teste vazio, `GET /api/homolog/bootstrap` cria o admin dono e mostra a senha temporária uma vez.
- **Teste local:** `npm run local` sobe `server.js` na porta 8080 com as mesmas rotas, mas com banco SQLite (`microgame.db`). Do `.env.local` ele só lê a chave do Geiko e o segredo de sessão; o `DATABASE_URL` de produção fica de fora de propósito.

O código das rotas é o mesmo nos três lugares; só muda o banco (`lib/store.js` dá a mesma API pra Neon e SQLite).

### Rodando no PC

Precisa de Node 22 ou mais novo (usa `node:sqlite`).

```bash
npm install
npm run admin -- <usuario> "<Nome>"   # cria o primeiro admin no banco local e mostra a senha temporária
npm run local                         # http://localhost:8080
```

Pra usar outra porta, defina `PORT` antes (no PowerShell: `$env:PORT=3000`).

### Testes

```bash
npm test
```

Confere a sintaxe de todos os scripts da página (`scripts/check-front.js`) e roda os testes da API (`test/api.test.js`, com `node --test`).

## Login e bloqueio por fila do Geiko

- Cada pessoa tem conta própria (senha com scrypt, sessão em cookie httpOnly com JWT assinado com `SESSION_SECRET`). O nome no ranking é o da conta. No primeiro login a pessoa troca a senha temporária.
- Uma conta = um aparelho: cada login grava um `session_id` novo e derruba a sessão anterior; a página confere a cada 20s (`/api/auth/ping`) e mostra o aviso.
- Contas com **ID do Geiko** vinculado têm os jogos bloqueados quando a fila de tickets abertos passa do limite. A regra (pesos por prioridade, multiplicador sem interação, multiplicador de status de espera, limite) fica no **Painel admin** e é guardada na tabela `settings`. Quem não tem ID do Geiko nunca é bloqueado.
- A consulta é a mesma do GeikoDashboard: `POST /attendance/search` com `attendantIds` + `openAttendance` (cache de 60s por atendente). Se o Geiko cair, libera em vez de travar todo mundo.
- O selo no topo mostra o estado da fila; bloqueado, ele diz quantos tickets faltam resolver pra liberar.

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run local` | Servidor de teste local com SQLite. |
| `npm test` | Checagem do front + testes da API. |
| `npm run admin -- <usuario> "<Nome>" [idGeiko]` | Cria ou promove um admin e mostra uma senha temporária. Banco local por padrão; `--producao` usa o da Vercel e `--homolog` o de teste. |
| `npm run importar -- "<.env do GeikoDashboard>" [--producao]` | Cria uma conta por atendente do GeikoDashboard (só leitura lá), já com o ID do Geiko. As senhas temporárias vão pra um `contas-*.csv` fora do Git. Pula quem já tem conta. |
| `npm run migrate` | Copia as pontuações do `microgame.db` pro Neon. Roda uma vez só e se recusa se o Neon já tiver pontuações. |

## Variáveis de ambiente

Ficam no `.env.local` (teste, fora do Git) e no projeto da Vercel (produção).

| Variável | Pra quê |
| --- | --- |
| `DATABASE_URL` | Banco Neon de produção. |
| `Homolog_DB_DATABASE_URL` | Banco Neon das versões de teste (branch `dev`). |
| `SESSION_SECRET` | Assina a sessão. Mínimo de 32 caracteres. |
| `SESSION_TTL_HOURS` | Duração da sessão em horas (padrão 12). |
| `GEIKO_API_KEY`, `GEIKO_API_URL` | Acesso à API do Geiko pro bloqueio por fila. |
| `RECORDS_OWNER` | Usuário da conta dona, a única que edita recordes (padrão `paulo`). |
| `CRON_SECRET` | Protege o cron diário de backup da Vercel. |
| `PORT` | Porta do servidor local (padrão 8080). |

## Backups

Os recordes e as contas têm cópia numa tabela do próprio banco (`backups`): uma por dia pelo cron da Vercel (`/api/cron/backup`, 9h UTC) e uma antes de cada edição de recordes. No painel admin dá pra baixar o JSON, importar ou restaurar as partidas de qualquer cópia. Restaurar não traz de volta sessões ativas.

## Estrutura

```
api/index.js          única função da Vercel; repassa pro router
lib/router.js         todas as rotas /api/*
lib/store.js          banco: Neon (Vercel) ou SQLite (local), mesma API
lib/schema.js         cria e atualiza as tabelas (idempotente)
lib/auth.js           senhas, sessão e contas
lib/geiko.js          bloqueio por fila do Geiko
lib/rules.js          faixas de pontuação válidas e anti-autoclicker
lib/social.js         reações, duelos, torneio e duplas
lib/flair.js          prêmios do desafio do dia
lib/backup.js         cópias de segurança no banco
lib/vitals.js         recebe as métricas do web-vitals
public/index.html     a página
public/style.css      estilos
public/js/            menu, conta, perfil, social, admin, cards 3D
public/js/games/      um arquivo por jogo
scripts/              admin, importação, migração e checagem do front
server.js             servidor de teste local
test/api.test.js      testes da API
```

## Bibliotecas (via CDN, sem build)

- **Phaser 3.90:** Cobrinha, Mira, Voa Voa, Chuva de Bugs, Blocos, Quebra-Tijolos, Torre, Invasores, Ritmo, Pong, Corredor e Come-Come. Só baixa quando alguém abre um desses jogos (no menu fica pré-buscado em segundo plano).
- **Zdog 1.1 e Vanilla-Tilt 1.8:** ilustrações 3D e inclinação dos cards do menu. Carregam depois que o menu aparece.
- **web-vitals 6:** mede LCP, INP, CLS, FCP e TTFB de quem joga e manda pra `/api/vitals`. Local: aparece no terminal do `server.js`. Vercel: em Logs do projeto (linhas `[web-vitals]`).
- **Lucide:** os ícones usados estão embutidos em `public/js/icons.js`, sem biblioteca nem requisição.

No servidor, as únicas dependências são `@neondatabase/serverless` e `jose`.
