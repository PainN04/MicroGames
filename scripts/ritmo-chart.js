// Adiciona uma música ao Ritmo: converte o áudio (corta, fade no fim, MP3 128k) pra public/audio/ritmo/<id>.mp3 e gera o
// mapa de notas em public/data/ritmo/<id>.json a partir da batida da própria música. Roda uma vez por música (precisa
// do ffmpeg); o resultado vai pro repositório e o jogo só lê os arquivos prontos.
//
//   node scripts/ritmo-chart.js musica.mp3 --id rock1 --title "Nome" --artist "Artista" \
//        --license "CC BY 4.0" --source https://... [--start 0] [--length 150] [--density 1]
//
// Como o mapa sai:
//  1. espectro a cada ~11,6 ms; "ataque" = quanto cada faixa de frequência subiu de um quadro pro outro (spectral flux)
//     em 4 faixas: grave (bumbo, baixo), médio-grave, médio (guitarra, voz) e agudo (caixa, prato);
//  2. andamento (BPM) pela autocorrelação dos ataques e depois afinado procurando a grade de tempos que mais cai em cima
//     deles; o deslocamento da grade (fase) idem;
//  3. candidatas nas colcheias da grade (tempo e contratempo), com a força do ataque perto de cada uma; ficam as mais
//     fortes até a densidade alvo (cerca de uma nota por tempo, mais no refrão, nada no silêncio);
//  4. a faixa da nota (D F J K) é a faixa de frequência que mais subiu ali (grave à esquerda, agudo à direita), sem
//     repetir a mesma faixa colada; ataque muito forte no tempo vira acorde (duas faixas);
//  5. nota comprida quando depois dela vem um trecho sem ataque, mas com som (nota sustentada).
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SR = 22050, WIN = 1024, HOP = 256, FPS = SR / HOP; // ~86 quadros por segundo
const BANDS = [[30, 150], [150, 600], [600, 2500], [2500, 8000]];
const LEAD_OUT = 3; // segundos sem nota no fim (fade)
// o quadro t cobre as amostras t·HOP até t·HOP+WIN: o ataque aparece antes do instante real (medido com cliques)
const OFFSET_MS = 36;

function args() {
  const a = process.argv.slice(2), o = { file: a[0], start: 0, length: 150, density: 1 };
  for (let i = 1; i < a.length; i += 2) o[a[i].replace(/^--/, '')] = a[i + 1];
  for (const k of ['start', 'length', 'density']) o[k] = Number(o[k]);
  if (!o.file || !o.id || !o.title || !o.artist || !o.license || !o.source) {
    console.error('uso: node scripts/ritmo-chart.js musica.mp3 --id x --title T --artist A --license L --source URL [--start s] [--length s] [--density 1]');
    process.exit(1);
  }
  if (!/^[a-z0-9-]{2,32}$/.test(o.id) || o.id === 'treino') throw new Error('id inválido: ' + o.id);
  return o;
}

/* ---------- FFT ---------- */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
}

function decode(file) {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  return new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
}

/** Ataque por faixa (flux[b][t]), ataque total normalizado (env[t]) e volume (rms[t]). */
function analyze(pcm) {
  const frames = Math.floor((pcm.length - WIN) / HOP);
  const hann = Float64Array.from({ length: WIN }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / WIN));
  const binOf = f => Math.round(f * WIN / SR);
  const flux = BANDS.map(() => new Float64Array(frames)), rms = new Float64Array(frames);
  let prev = new Float64Array(WIN / 2);
  for (let t = 0; t < frames; t++) {
    const re = new Float64Array(WIN), im = new Float64Array(WIN);
    let e = 0;
    for (let i = 0; i < WIN; i++) { const v = pcm[t * HOP + i]; re[i] = v * hann[i]; e += v * v; }
    rms[t] = Math.sqrt(e / WIN);
    fft(re, im);
    const mag = new Float64Array(WIN / 2);
    for (let k = 0; k < WIN / 2; k++) mag[k] = Math.log1p(100 * Math.hypot(re[k], im[k]));
    BANDS.forEach(([lo, hi], b) => {
      let s = 0;
      for (let k = binOf(lo); k <= binOf(hi); k++) s += Math.max(0, mag[k] - prev[k]);
      flux[b][t] = s / (binOf(hi) - binOf(lo) + 1);
    });
    prev = mag;
  }
  // cada faixa no mesmo peso (o grave tem muito mais energia), menos a média local (fica só o pico do ataque)
  const norm = flux.map(f => {
    const sorted = [...f].sort((a, b) => a - b), p95 = sorted[Math.floor(sorted.length * 0.95)] || 1;
    return f.map(v => v / p95);
  });
  const raw = Float64Array.from({ length: frames }, (_, t) => norm.reduce((s, f) => s + f[t], 0));
  const env = new Float64Array(frames), W = Math.round(FPS * 0.25);
  let acc = 0;
  for (let t = 0; t < frames; t++) {
    acc += raw[t] - (t - 2 * W - 1 >= 0 ? raw[t - 2 * W - 1] : 0);
    const n = Math.min(t + 1, 2 * W + 1);
    env[Math.max(0, t - W)] = Math.max(0, raw[Math.max(0, t - W)] - acc / n);
  }
  const sorted = [...env].sort((a, b) => a - b), p99 = sorted[Math.floor(sorted.length * 0.99)] || 1;
  for (let t = 0; t < frames; t++) env[t] = Math.min(1.5, env[t] / p99);
  return { frames, flux: norm, env, rms };
}

const at = (arr, x) => { const i = Math.floor(x), f = x - i; return i < 0 || i + 1 >= arr.length ? 0 : arr[i] * (1 - f) + arr[i + 1] * f; };
const peakNear = (env, x, r = 1.5) => { let m = 0; for (let i = Math.ceil(x - r); i <= Math.floor(x + r); i++) if (env[i] > m) m = env[i]; return m; };

/** BPM e fase: { period (quadros por tempo), phase (quadro do 1º tempo) }. */
function tempo(env) {
  const score = (period, phase) => { let s = 0; for (let x = phase; x < env.length; x += period) s += peakNear(env, x, 1); return s / (env.length / period); };
  const bestPhase = period => { let best = [0, -1]; for (let p = 0; p < period; p += 0.5) { const s = score(period, p); if (s > best[1]) best = [p, s]; } return best; };
  // autocorrelação nos andamentos de 70 a 190 BPM, puxando pros 90–150 (onde dá pra tocar)
  let cand = [];
  for (let bpm = 70; bpm <= 190; bpm += 0.5) {
    const lag = FPS * 60 / bpm;
    let s = 0; for (let t = 0; t + lag < env.length; t++) s += env[t] * at(env, t + lag);
    const w = Math.exp(-0.5 * (Math.log2(bpm / 120) / 0.6) ** 2);
    cand.push([bpm, s * w]);
  }
  cand.sort((a, b) => b[1] - a[1]);
  // afina em volta dos 3 melhores: a grade que mais cai em cima dos ataques
  let best = null;
  for (const [bpm] of cand.slice(0, 3)) {
    for (let b = bpm - 1; b <= bpm + 1; b += 0.02) {
      const period = FPS * 60 / b, [phase, s] = bestPhase(period);
      const w = Math.exp(-0.5 * (Math.log2(b / 120) / 0.6) ** 2);
      if (!best || s * w > best.s) best = { bpm: b, period, phase, s: s * w };
    }
  }
  return best;
}

function chart({ frames, flux, env, rms }, { density }) {
  const { bpm, period, phase } = tempo(env);
  const half = period / 2, lastFrame = frames - LEAD_OUT * FPS;
  const quiet = (() => { const s = [...rms].sort((a, b) => a - b); return s[Math.floor(s.length * 0.5)] * 0.25; })();
  // candidatas nas colcheias
  const cands = [];
  for (let k = 0, x = phase % half; x < lastFrame; k++, x += half) {
    if (x < FPS * 1.0) continue; // 1s de folga no começo
    const onBeat = Math.round((x - phase) / half) % 2 === 0;
    const s = peakNear(env, x);
    if (s < 0.12 || at(rms, x) < quiet) continue;
    cands.push({ x, onBeat, s, w: s * (onBeat ? 1 : 0.55) });
  }
  // densidade alvo: ~1 nota por tempo de música tocando (ajustável com --density)
  const beatsPlaying = cands.filter(c => c.onBeat).length;
  const target = Math.round(beatsPlaying * 1.05 * density);
  const picked = [...cands].sort((a, b) => b.w - a.w).slice(0, target).sort((a, b) => a.x - b.x);
  const strongCut = [...picked].sort((a, b) => b.s - a.s)[Math.floor(picked.length * 0.06)]?.s ?? Infinity;

  // faixa: a banda que mais subiu perto da nota (cada banda já normalizada)
  const bandOrder = x => {
    const r = Math.round(x), val = flux.map(f => Math.max(f[r - 1] || 0, f[r] || 0, f[r + 1] || 0));
    return [0, 1, 2, 3].sort((a, b) => val[b] - val[a]);
  };
  const notes = [];
  let last = -1, lastX = -Infinity, run = 0;
  for (let i = 0; i < picked.length; i++) {
    const c = picked[i], order = bandOrder(c.x);
    let lane = order[0];
    // nada de martelar a mesma faixa: colada na anterior ou pela 3ª vez seguida vai pra 2ª banda mais forte
    if (lane === last && (c.x - lastX < period * 1.25 || run >= 2)) lane = order[1];
    run = lane === last ? run + 1 : 1;
    const ms = Math.round(c.x / FPS * 1000 + OFFSET_MS);
    const note = [ms, lane];
    // comprida: até a próxima nota sem ataque no meio, se o som continua (≥ 1,5 tempo)
    const next = picked[i + 1], gap = (next ? next.x : lastFrame) - c.x;
    if (gap >= period * 1.5) {
      let sustained = true;
      for (let x = c.x + half; x < c.x + gap - half; x += half / 2) if (at(rms, x) < at(rms, c.x) * 0.45) { sustained = false; break; }
      if (sustained) note.push(Math.round((gap - half) / FPS * 1000));
    }
    notes.push(note);
    if (c.onBeat && c.s >= strongCut && !note[2]) notes.push([ms, lane === order[0] ? order[1] : order[0]]);
    last = lane; lastX = c.x;
  }
  // 1º tempo da grade (as linhas do compasso no jogo descem nele)
  const beat0 = Math.round(((phase % period) / FPS) * 1000 + OFFSET_MS);
  return { bpm: Math.round(bpm * 100) / 100, beat0, notes };
}

function main() {
  const o = args();
  const audioOut = path.join(ROOT, 'public/audio/ritmo', o.id + '.mp3');
  fs.mkdirSync(path.dirname(audioOut), { recursive: true });
  const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', o.file]).toString());
  const len = Math.min(o.length, dur - o.start);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(o.start), '-t', String(len), '-i', o.file,
    '-af', `afade=t=out:st=${Math.max(0, len - LEAD_OUT)}:d=${LEAD_OUT}`, '-ac', '2', '-ar', '44100', '-b:a', '128k', '-map_metadata', '-1', audioOut]);
  const res = chart(analyze(decode(audioOut)), o);
  const data = { id: o.id, title: o.title, artist: o.artist, license: o.license, source: o.source, audio: `audio/ritmo/${o.id}.mp3`,
    bpm: res.bpm, beat0: res.beat0, durationMs: Math.round(len * 1000), notes: res.notes };
  fs.writeFileSync(path.join(ROOT, 'public/data/ritmo', o.id + '.json'), JSON.stringify(data));
  const listFile = path.join(ROOT, 'public/data/ritmo/songs.json');
  const list = JSON.parse(fs.readFileSync(listFile, 'utf8')).filter(s => s.id !== o.id);
  list.push({ id: o.id, title: o.title, artist: o.artist, license: o.license, source: o.source, bpm: data.bpm, durationMs: data.durationMs });
  fs.writeFileSync(listFile, JSON.stringify(list, null, 2) + '\n');
  const holds = res.notes.filter(n => n[2]).length;
  console.log(`${o.id}: ${res.bpm} BPM, ${res.notes.length} notas (${holds} compridas), ${(res.notes.length / len).toFixed(2)} notas/s, ${(fs.statSync(audioOut).size / 1e6).toFixed(2)} MB`);
}

if (require.main === module) main();
module.exports = { analyze, chart, tempo, decode, FPS };
