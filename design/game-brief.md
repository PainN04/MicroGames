# MicroGame: resumo do projeto

> Registro de design no nível `minimal` do Claude Code Game Studios. É o que o
> framework lê para saber que o projeto já existe (sem ele, os hooks pedem `/start`).

## O que é
Site de minigames rápidos no navegador, com ranking compartilhado entre as pessoas
da empresa. São 28 minigames de arcade e de raciocínio e 13 jogos diários
(Termo, Dueto, Quarteto, Contexto, Conexões…), mais desafio do dia, torneio,
duplas e duelos.

## Tecnologia (não usa engine)
- Front: HTML, CSS e JavaScript puro em `public/` (código dos jogos em `public/js/games/`).
  Jogos de ação usam Phaser 3 (`public/vendor/phaser.min.js`); a arte 3D dos cards usa Zdog.
- Visual: só o Recreio (`public/recreio.css` por cima de `public/style.css`), com tema claro e escuro.
- API: Node em `api/index.js` e `lib/` (roteador em `lib/router.js`), banco Neon (Postgres) em
  produção e SQLite no teste local (`npm run local`).
- Testes: `npm test` (verificação do front + `node --test test/*.test.js`).
- Build: `npm run build` monta `dist/` (um bundle ofuscado). Deploy na Vercel.

## Fluxo
Toda mudança vai para a branch `dev` (PR contra a `dev`, merge quando os testes passam).
A `main` é produção e só muda quando o Paulo pedir.

## Regras de visual
- Nada de emoji como ícone ou avatar: imagens desenhadas de verdade, hospedadas no site.
- Acabamento no nível dos cards 3D do menu.
- Mudança de layout: mostrar prints antes de aplicar.
