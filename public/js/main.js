// ---------- web-vitals ----------
// Mede LCP/INP/CLS/FCP/TTFB de verdade em quem joga e manda pro servidor quando a aba é escondida.
// Local: aparece no terminal do server.js (e no console do navegador). Vercel: em Logs do projeto.
const vitalsQueue = [];
function reportVitals() {
  if (localMode || !window.webVitals) return;
  const dev = location.hostname === 'localhost';
  const record = m => {
    const a = m.attribution || {};
    vitalsQueue.push({ name: m.name, value: m.value, rating: m.rating, view: currentView,
      target: a.target || a.interactionTarget || a.largestShiftTarget || '' });
    if (dev) console.log(`[web-vitals] ${m.name}`, m.name === 'CLS' ? m.value.toFixed(3) : Math.round(m.value) + 'ms', m.rating, a);
  };
  for (const fn of ['onLCP', 'onINP', 'onCLS', 'onFCP', 'onTTFB']) webVitals[fn](record);
}
addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && vitalsQueue.length) {
    navigator.sendBeacon('api/vitals', JSON.stringify(vitalsQueue.splice(0)));
  }
});

// Recarrega sozinho quando o index.html muda no servidor — só no menu, nunca no meio de uma partida.
let pageVersion = null;
async function checkVersion() {
  if (localMode) return;
  try {
    const { version } = await (await fetch('api/version')).json();
    if (pageVersion === null) pageVersion = version;
    else if (version !== pageVersion && $('.hero') && !$('.modal')) location.reload();
  } catch {}
}
checkVersion();
setInterval(checkVersion, 30000);

$('#home').onclick = showMenu;
$('#acctBtn').onclick = () => toggleAcct();
$('#mProfile').onclick = () => { toggleAcct(false); showProfile(player); };
$('#mPass').onclick = () => { toggleAcct(false); passwordModal(false); };
$('#mLogout').onclick = () => { toggleAcct(false); logout(); };
$('#mAdmin').onclick = () => { toggleAcct(false); showAdmin(); };
$('#mRecords').onclick = () => { toggleAcct(false); showRecords(); };
$('#mReport').onclick = () => { toggleAcct(false); showReport(); };
addEventListener('hashchange', () => { if (location.hash === '#recordes' && me?.canEditRecords) showRecords(); });
$('#mute').onclick = () => { muted = !muted; localStorage.setItem('mg_mute', muted ? '1' : '0'); renderMute(); if (!muted) sfx.good(); };
renderMute();
// atualiza o bloqueio a cada minuto enquanto estiver no menu
setInterval(() => { if (currentView === 'menu' && !document.hidden) refreshGate(); }, 60_000);

// Primeiro descobre quem está logado (e o bloqueio), DEPOIS desenha os cards: se o aviso de fila aparecesse
// acima dos cards já desenhados, empurraria tudo pra baixo (CLS). O título "Hora do intervalo" já vem no HTML.
(async function boot() {
  if (localMode) return showMenu(); // aberto direto do arquivo: sem servidor, sem login
  let me0 = null;
  try { me0 = await api('api/auth/me'); } catch {}
  const { user = null, gate: g = null, reason } = me0 || {};
  if (user) { setMe(user); if (!user.mustChange) gate = g; }
  if (user && !user.mustChange && location.hash === '#recordes' && user.canEditRecords) return showRecords();
  showMenu();
  if (!me0) return loginModal('Não consegui falar com o servidor. Tente de novo.');
  if (!user) return loginModal(reason === 'other-device' ? 'Sua conta entrou em outro dispositivo — só dá pra usar em um por vez.' : '');
  if (user.mustChange) return passwordModal(true);
})();
