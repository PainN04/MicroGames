// GET /api/scores — todas as pontuações agrupadas por jogo.
// POST /api/scores — { game, player, score, proof? } salva uma pontuação.
const { sql, ensureSchema } = require('../lib/db');
const { checkSubmission, groupByGame } = require('../lib/rules');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    await ensureSchema();
    if (req.method === 'GET') {
      const rows = await sql`SELECT game, player AS name, score, created_at AS date FROM scores`;
      return res.status(200).json(groupByGame(rows));
    }
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { status, error, entry } = checkSubmission(body);
      if (error) return res.status(status).json({ error });
      await sql`INSERT INTO scores (game, player, score, created_at) VALUES (${entry.game}, ${entry.player}, ${entry.score}, ${Date.now()})`;
      return res.status(201).json({ ok: true });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'método não permitido' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'erro no servidor' });
  }
};
