// Acesso ao banco com a mesma API nos dois ambientes:
//  - produção (Vercel): Neon Postgres, via DATABASE_URL
//  - teste local (server.js): SQLite em microgame.db, quando MICROGAME_SQLITE aponta pro arquivo
//
// Uso: const rows = await sql`SELECT * FROM users WHERE id = ${id}`  → sempre um array de linhas.
// As consultas do projeto são escritas no SQL comum aos dois (sem ILIKE, SERIAL, now(), ::cast...).
const path = require('node:path');

let impl = null;

function sqliteImpl(file) {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;');
  const run = (strings, values) => {
    const text = strings.join('?');
    // node:sqlite não aceita boolean/undefined como parâmetro
    const params = values.map(v => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));
    return db.prepare(text).all(...params);
  };
  return { dialect: 'sqlite', sql: async (strings, ...values) => run(strings, values), raw: db };
}

function neonImpl(url) {
  const { neon } = require('@neondatabase/serverless');
  const q = neon(url);
  return { dialect: 'postgres', sql: (strings, ...values) => q(strings, ...values) };
}

function getStore() {
  if (impl) return impl;
  if (process.env.MICROGAME_SQLITE) impl = sqliteImpl(path.resolve(process.env.MICROGAME_SQLITE));
  else {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!url) throw new Error('DATABASE_URL não configurada — adicione a integração Neon no projeto da Vercel');
    impl = neonImpl(url);
  }
  return impl;
}

const sql = (strings, ...values) => getStore().sql(strings, ...values);
const dialect = () => getStore().dialect;

// Normaliza valores que cada banco devolve de um jeito (SQLite: 0/1; Postgres BIGINT: string).
const bool = v => v === true || v === 1 || v === '1' || v === 't';
const num = v => (v === null || v === undefined ? v : Number(v));

module.exports = { sql, dialect, getStore, bool, num };
