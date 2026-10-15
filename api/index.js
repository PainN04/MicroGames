// Única função da Vercel: o vercel.json manda todo /api/* pra cá e o lib/router.js decide a rota.
const { handle } = require('../lib/router');

const version = () => process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || 'dev';

module.exports = (req, res) => handle(req, res, { version });
