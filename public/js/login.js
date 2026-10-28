// ---------- tela de entrar ----------
// Tela cheia (não é mais a janelinha): à esquerda o formulário, à direita uma vitrine com as cenas 3D dos jogos
// (as mesmas dos cards do menu, js/cards3d.js) trocando sozinhas. Continua sendo um .modal travado: quem já
// conferia "tem janela aberta?" (recarregar com versão nova, trocar de janela) segue funcionando igual.

// vitrine: o desafio de hoje primeiro, depois alguns jogos que mostram bem a variedade
const LOGIN_SHOWCASE = [
  ['termo', 'Palavra nova todo dia, igual pra todo mundo.'],
  ['sinuca', 'Oito bolas contra a máquina. Ela melhora a cada mesa.'],
  ['snake', 'Coma, cresça e não bata no próprio rabo.'],
  ['g2048', 'Junte os números até chegar no 2048.'],
  ['invasores', 'Segure as ondas de naves o máximo que der.'],
  ['sudoku', 'Grade 9×9 sem repetir número. Menor tempo ganha.'],
];
const LOGIN_EXTRA = ['blocos', 'pong', 'quiz', 'comecome'];

function loginShowcase() {
  const today = dailyGame();
  const list = LOGIN_SHOWCASE.filter(([id]) => GAMES[id] && id !== today);
  if (GAMES[today]) list.unshift([today, 'Desafio de hoje: quem fizer melhor escolhe o jogo de amanhã.']);
  for (const id of LOGIN_EXTRA) if (list.length < 6 && GAMES[id] && !list.some(([g]) => g === id)) list.push([id, GAMES[id].desc]);
  return list.slice(0, 6).map(([id, line]) => ({ id, name: GAMES[id].name, line, daily: id === today }));
}

let loginStage = null; // cenas da vitrine (param quando a tela fecha)
function loginModal(msg = '') {
  closeLogin();
  $('.modal')?.remove();
  const show = loginShowcase();
  const minis = Object.keys(GAMES).filter(id => !DAILY_TAB.includes(id)).length;
  const dailies = DAILY_TAB.filter(id => GAMES[id]).length;
  const m = document.createElement('div');
  m.className = 'modal login-screen';
  m.innerHTML = `
    <div class="ls-wrap" role="dialog" aria-modal="true" aria-labelledby="lsTitle">
      <section class="ls-form">
        <div class="ls-brand"><img src="icons/icon.svg?v=8" alt="" width="40" height="40"><span class="wm">Micro<span>Game</span></span></div>
        <div class="ls-main">
          <h1 id="lsTitle">Bom te ver<br>de volta.</h1>
          <p class="ls-lead">Entre com o usuário e a senha que o admin te passou pra jogar e salvar seus recordes no ranking da galera.</p>
          <form id="lf" novalidate>
            <label class="ls-field"><span>Usuário</span>
              <span class="ls-input">${icon('user')}<input name="username" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="ex.: ana.souza" required></span>
            </label>
            <label class="ls-field"><span>Senha</span>
              <span class="ls-input">${icon('lock')}<input name="password" type="password" autocomplete="current-password" placeholder="Sua senha" required>
                <button type="button" class="ls-eye" id="lsEye" aria-label="Mostrar senha" aria-pressed="false">${icon('eye')}</button></span>
            </label>
            <p class="ls-err" id="lerr" role="alert"${msg ? '' : ' hidden'}>${icon('triangle-alert')}<span>${esc(msg)}</span></p>
            <button class="btn ls-go">${icon('log-in')}<span>Entrar</span></button>
          </form>
          <p class="ls-note">${icon('laptop')}<span>Cada conta funciona em um aparelho por vez: entrar aqui desconecta os outros.</span></p>
        </div>
        <p class="ls-foot">${icon('key-round')}<span>Esqueceu a senha? Fale com quem administra o MicroGame.</span></p>
      </section>
      <aside class="ls-show" style="--h:${GAMES[show[0].id].hue}" aria-label="Jogos do MicroGame">
        <div class="ls-top">
          <span class="ls-tag">${icon('calendar')}Desafio de hoje: ${esc(GAMES[dailyGame()]?.name || '')}</span>
          <span class="ls-count">${minis} minigames e ${dailies} diários</span>
        </div>
        <div class="ls-stage" aria-hidden="true">${show.map((g, i) => `<div class="ls-scene${i ? '' : ' on'}" data-id="${g.id}" style="--h:${GAMES[g.id].hue}"><span class="ls-fallback">${icon(GAMES[g.id].icon || 'gamepad-2')}</span></div>`).join('')}</div>
        <div class="ls-caption" aria-live="polite"><b id="lsName">${esc(show[0].name)}</b><span id="lsLine">${esc(show[0].line)}</span></div>
        <div class="ls-thumbs" role="tablist" aria-label="Jogos em destaque">${show.map((g, i) => `<button type="button" role="tab" class="ls-thumb" data-i="${i}" style="--h:${GAMES[g.id].hue}" aria-selected="${!i}" aria-label="${esc(g.name)}"><span class="ls-fallback">${icon(GAMES[g.id].icon || 'gamepad-2')}</span></button>`).join('')}</div>
      </aside>
    </div>`;
  document.body.appendChild(m);
  document.documentElement.classList.add('login-open');

  const form = m.querySelector('#lf'), err = m.querySelector('#lerr'), pass = form.elements.password;
  const showErr = text => { err.querySelector('span').textContent = text; err.hidden = !text; };
  m.querySelector('#lsEye').onclick = e => {
    const b = e.currentTarget, on = pass.type === 'password';
    pass.type = on ? 'text' : 'password';
    b.innerHTML = icon(on ? 'eye-off' : 'eye');
    b.setAttribute('aria-pressed', on);
    b.setAttribute('aria-label', on ? 'Esconder senha' : 'Mostrar senha');
  };
  form.addEventListener('input', () => showErr(''));
  form.onsubmit = async e => {
    e.preventDefault();
    const username = form.elements.username.value.trim(), password = pass.value;
    if (!username) { showErr('Digite seu usuário.'); return form.elements.username.focus(); }
    if (!password) { showErr('Digite sua senha.'); return pass.focus(); }
    const btn = form.querySelector('.ls-go');
    btn.disabled = true; btn.querySelector('span').textContent = 'Entrando...'; showErr('');
    try {
      const { user } = await api('api/auth/login', { method: 'POST', body: { username, password } });
      closeLogin();
      await afterLogin(user);
    } catch (err) {
      showErr(err.message);
      btn.disabled = false; btn.querySelector('span').textContent = 'Entrar';
      pass.select();
    }
  };
  if (matchMedia('(hover: hover)').matches) form.elements.username.focus(); // no celular, o teclado só abre quando a pessoa toca
  loginStage = startLoginStage(m, show);
}

function closeLogin() {
  loginStage?.stop(); loginStage = null;
  $('.login-screen')?.remove();
  document.documentElement.classList.remove('login-open');
}
// outra janela abrindo por cima (modal() remove o .modal anterior) também desliga a vitrine
new MutationObserver(() => { if (loginStage && !document.querySelector('.login-screen')) closeLogin(); }).observe(document.body, { childList: true });

/** Vitrine: troca de jogo a cada 4,5 s (para quando a pessoa escolhe um). A cena da vez e as miniaturas se mexem sempre,
 *  como os cards do menu; só ficam os ícones se a pessoa desligou as Animações 3D no menu da conta. */
function startLoginStage(m, show) {
  const scenes = [...m.querySelectorAll('.ls-scene')], thumbs = [...m.querySelectorAll('.ls-thumb')];
  let cur = 0, timer = null, raf = 0, alive = true;
  const live = []; // { i, illo, update }
  const pick = (i, byHand) => {
    if (i === cur) return;
    scenes[cur].classList.remove('on'); thumbs[cur].setAttribute('aria-selected', 'false');
    cur = i;
    scenes[cur].classList.add('on'); thumbs[cur].setAttribute('aria-selected', 'true');
    m.querySelector('#lsName').textContent = show[i].name;
    m.querySelector('#lsLine').textContent = show[i].line;
    m.querySelector('.ls-show').style.setProperty('--h', GAMES[show[i].id].hue); // o brilho da vitrine acompanha a cor do jogo
    if (byHand) clearInterval(timer);
  };
  thumbs.forEach((t, i) => { t.onclick = () => pick(i, true); });
  // setas trocam de jogo quando o foco está nas miniaturas (padrão de abas)
  m.querySelector('.ls-thumbs').addEventListener('keydown', e => {
    const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    const i = (cur + d + show.length) % show.length;
    pick(i, true); thumbs[i].focus();
  });
  timer = setInterval(() => { if (!document.hidden) pick((cur + 1) % show.length); }, 4500);

  (async () => {
    // aqui não segue o modo leve automático: é uma cena só e nada mais roda na tela (o Windows com "efeitos de
    // animação" desligados ou um PC medido como lento deixava tudo parado)
    if (fx3dPref() === 'off') return;
    try { await loadLib(ZDOG_URL); } catch { return; }
    if (!alive) return;
    const big = matchMedia('(max-width: 860px)').matches ? 190 : matchMedia('(min-width: 1200px) and (min-height: 820px)').matches ? 360 : 300;
    const mount = (host, size, i, thumb) => {
      const build = SCENES_3D[show[i].id];
      if (!build) return null;
      const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
      canvas.setAttribute('aria-hidden', 'true');
      host.replaceChildren(canvas);
      const illo = new Zdog.Illustration({ element: canvas, zoom: size / 150 });
      const update = build(Zdog, illo);
      update(1.2); illo.updateRenderGraph();
      return { i, illo, update, thumb };
    };
    scenes.forEach((s, i) => { const sc = mount(s, big, i); if (sc) live.push(sc); });
    thumbs.forEach((t, i) => { const sc = mount(t, 56, i, true); if (sc) live.push(sc); });
    let last = 0;
    const tick = now => {
      if (!alive) return;
      raf = requestAnimationFrame(tick);
      if (document.hidden || now - last < 32) return; // 30 quadros por segundo, como os cards
      last = now;
      // a cena grande da vez (a que está saindo congela durante o esmaecer) e todas as miniaturas
      for (const s of live) if (s.thumb || s.i === cur) { s.update(now / 1000); s.illo.updateRenderGraph(); }
    };
    raf = requestAnimationFrame(tick);
  })();

  return { stop() { alive = false; clearInterval(timer); cancelAnimationFrame(raf); } };
}
