// Login: senha com scrypt (mesmo formato do GeikoDashboard), sessão num cookie httpOnly com JWT (jose).
const { randomBytes, scrypt, timingSafeEqual } = require('node:crypto');
// jose é só ESM: na Vercel require() dele quebra (ERR_REQUIRE_ESM), então carrega com import() na 1ª vez.
let josePromise = null;
const jose = () => (josePromise ??= import('jose'));
const { sql, bool, num } = require('./store');

/* ---------- senha ---------- */

const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_LEN = 32;
const b64 = b => b.toString('base64url');
const derive = (plain, salt, opts = SCRYPT) =>
  new Promise((resolve, reject) => scrypt(plain, salt, KEY_LEN, opts, (err, key) => (err ? reject(err) : resolve(key))));

async function hashPassword(plain) {
  const salt = randomBytes(16);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${b64(salt)}$${b64(await derive(plain, salt))}`;
}

/** Nunca lança: hash malformado = false. */
async function verifyPassword(plain, stored) {
  try {
    const [tag, N, r, p, saltB64, keyB64] = String(stored).split('$');
    if (tag !== 'scrypt') return false;
    const expected = Buffer.from(keyB64, 'base64url');
    const actual = await derive(plain, Buffer.from(saltB64, 'base64url'), { N: +N, r: +r, p: +p, maxmem: SCRYPT.maxmem });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// Gasta o mesmo tempo de scrypt quando o usuário não existe (senão dá pra descobrir quais logins existem).
const DUMMY_HASH = 'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

/** Senha temporária legível (sem 0/O, 1/l/I). */
function generatePassword(len = 10) {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(randomBytes(len), b => alphabet[b % alphabet.length]).join('');
}

/* ---------- sessão ---------- */

const COOKIE = 'mg_session';
const TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || 12);

function secret() {
  const raw = process.env.SESSION_SECRET;
  if (!raw || raw.length < 32) throw new Error('SESSION_SECRET ausente ou curto demais (mínimo 32 caracteres).');
  return new TextEncoder().encode(raw);
}

/** Uma conta = um aparelho: cada login gera um id novo e grava na conta; tokens com id antigo deixam de valer. */
async function startSession(user) {
  const sid = randomBytes(16).toString('base64url');
  await sql`UPDATE users SET session_id = ${sid} WHERE id = ${user.id}`;
  return signSession({ ...user, sessionId: sid });
}
async function endSession(user) {
  await sql`UPDATE users SET session_id = ${null} WHERE id = ${user.id}`;
}

async function signSession(user) {
  const { SignJWT } = await jose();
  return new SignJWT({ tv: user.tokenVersion, sid: user.sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(`${TTL_HOURS}h`)
    .sign(secret());
}

// secure só na Vercel (https). Em http://localhost um cookie secure é descartado em silêncio.
const cookieAttrs = () => `Path=/; HttpOnly; SameSite=Lax${process.env.VERCEL ? '; Secure' : ''}`;
const sessionCookie = token => `${COOKIE}=${token}; Max-Age=${TTL_HOURS * 3600}; ${cookieAttrs()}`;
const clearCookie = () => `${COOKIE}=; Max-Age=0; ${cookieAttrs()}`;

function readCookie(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

/* ---------- usuários ---------- */

function mapUser(r) {
  return r && {
    id: num(r.id), username: r.username, name: r.name, role: r.role, geikoId: r.geiko_id || null,
    passwordHash: r.password_hash, mustChange: bool(r.must_change), active: bool(r.active),
    tokenVersion: num(r.token_version), createdAt: num(r.created_at), sessionId: r.session_id || null,
    blockUntil: num(r.block_until) || null, blockReason: r.block_reason || null, frame: r.frame || null, team: r.team || null,
  };
}
/** Bloqueio manual em vigor? (o admin bloqueia por um tempo ou até desbloquear) */
const manualBlock = u => (u && u.blockUntil && u.blockUntil > Date.now() ? { until: u.blockUntil, reason: u.blockReason } : null);
// Editor de recordes: só esta conta (mesmo sendo admin, os outros não mexem em recorde).
const RECORDS_OWNER = (process.env.RECORDS_OWNER || 'paulo').toLowerCase();
const canEditRecords = u => !!u && u.role === 'admin' && u.active && u.username.toLowerCase() === RECORDS_OWNER;
const publicUser = u => u && {
  id: u.id, username: u.username, name: u.name, role: u.role, geikoId: u.geikoId, mustChange: u.mustChange, active: u.active,
  block: manualBlock(u), canEditRecords: canEditRecords(u), frame: u.frame || null, team: u.team || null,
};

async function findUserByUsername(username) {
  const rows = await sql`SELECT * FROM users WHERE lower(username) = lower(${String(username).trim()}) AND active = ${true}`;
  return mapUser(rows[0]);
}
async function findUserById(id) {
  const rows = await sql`SELECT * FROM users WHERE id = ${Number(id)}`;
  return mapUser(rows[0]);
}

/** { user } da sessão atual, ou { user: null, reason }. Confere no banco a cada request: desativar, trocar a senha
 *  ou entrar em outro aparelho derruba na hora. reason 'other-device' = a conta logou em outro lugar depois. */
async function sessionStatus(req) {
  const token = readCookie(req, COOKIE);
  if (!token) return { user: null, reason: 'none' };
  try {
    const { jwtVerify } = await jose();
    const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] });
    const user = await findUserById(payload.sub);
    if (!user || !user.active || user.tokenVersion !== payload.tv) return { user: null, reason: 'expired' };
    if (!payload.sid || payload.sid !== user.sessionId) return { user: null, reason: 'other-device' };
    return { user };
  } catch {
    return { user: null, reason: 'expired' };
  }
}
const currentUser = async req => (await sessionStatus(req)).user;

/* ---------- freio de força bruta ---------- */
// Por username (o escritório inteiro sai pelo mesmo IP). Estado por instância: é um freio, não a defesa
// principal — o custo do scrypt (~100ms) já limita o chute.
const fails = new Map();
const LOCK_AFTER = 5, LOCK_MS = 60_000;
function throttleCheck(username) {
  const e = fails.get(String(username).toLowerCase());
  return e && e.until > Date.now() ? Math.ceil((e.until - Date.now()) / 1000) : 0;
}
function throttleFail(username) {
  const k = String(username).toLowerCase(), e = fails.get(k) || { n: 0, until: 0 };
  e.n++;
  if (e.n >= LOCK_AFTER) { e.until = Date.now() + LOCK_MS * 2 ** Math.min(4, e.n - LOCK_AFTER); }
  fails.set(k, e);
}
const throttleOk = username => fails.delete(String(username).toLowerCase());

module.exports = {
  hashPassword, verifyPassword, DUMMY_HASH, generatePassword,
  startSession, endSession, signSession, sessionCookie, clearCookie, currentUser, sessionStatus,
  findUserByUsername, findUserById, mapUser, publicUser, manualBlock, canEditRecords,
  throttleCheck, throttleFail, throttleOk,
};
