// POST /api/vitals — métricas do web-vitals mandadas pela página; só registra no log.
const { logVitals } = require('../lib/vitals');

module.exports = (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    logVitals(typeof req.body === 'string' ? JSON.parse(req.body) : req.body);
  } catch {}
  res.status(204).end();
};
