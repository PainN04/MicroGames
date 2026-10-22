// Recebe as métricas do web-vitals mandadas pela página (sendBeacon) e escreve no log.
// Local: aparece no terminal do server.js. Vercel: aparece em Logs do projeto.
const METRICS = new Set(['LCP', 'INP', 'CLS', 'FCP', 'TTFB']);

// Tira quebras de linha e outros caracteres de controle: senão dá pra forjar linhas falsas no log.
const clean = (v, n) => String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, n);

function logVitals(list) {
  if (!Array.isArray(list)) return;
  for (const m of list.slice(0, 20)) {
    if (!m || !METRICS.has(m.name) || !Number.isFinite(m.value)) continue;
    const value = m.name === 'CLS' ? m.value.toFixed(3) : Math.round(m.value) + 'ms';
    const where = clean(m.view || '?', 20);
    const target = m.target ? ` alvo=${clean(m.target, 80)}` : '';
    const rating = ['good', 'needs-improvement', 'poor'].includes(m.rating) ? m.rating : '';
    console.log(`[web-vitals] ${m.name} ${value} ${rating} tela=${where}${target}`);
  }
}

module.exports = { logVitals };
