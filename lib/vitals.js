// Recebe as métricas do web-vitals mandadas pela página (sendBeacon) e escreve no log.
// Local: aparece no terminal do server.js. Vercel: aparece em Logs do projeto.
const METRICS = new Set(['LCP', 'INP', 'CLS', 'FCP', 'TTFB']);

function logVitals(list) {
  if (!Array.isArray(list)) return;
  for (const m of list.slice(0, 20)) {
    if (!m || !METRICS.has(m.name) || !Number.isFinite(m.value)) continue;
    const value = m.name === 'CLS' ? m.value.toFixed(3) : Math.round(m.value) + 'ms';
    const where = String(m.view || '?').slice(0, 20);
    const target = m.target ? ` alvo=${String(m.target).slice(0, 80)}` : '';
    console.log(`[web-vitals] ${m.name} ${value} ${m.rating || ''} tela=${where}${target}`);
  }
}

module.exports = { logVitals };
