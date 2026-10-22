// ---------- modo leve (PC fraco) ----------
// O que pesa num PC sem placa de vídeo boa não é o JS, é o desenho: o fundo com manchas desfocadas se mexendo
// por baixo dos painéis de vidro (backdrop-filter) obriga a refazer o desfoque da tela inteira a cada quadro,
// e o Phaser em WebGL vira WebGL "de mentira" (desenhado pelo processador). Num i3 antigo isso dava ~12 quadros
// por segundo — e como os jogos limitam o passo a 50 ms, abaixo de 20 quadros o jogo roda em câmera lenta.
// Modo leve (classe .lite no <html>, CSS no fim do style.css): fundo parado, sem vidro desfocado, sem animação
// infinita fora do jogo, cards sem 3D e Phaser desenhando em canvas 2D. A marcação inicial vem do <head>.
// mg_perf: 'lite' | 'full' (escolha da pessoa no botão) · sem valor = automático (mg_perf_auto guarda o que medimos).
const perf = (() => {
  const get = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const put = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  // WebGL desenhado por software (SwiftShader, llvmpipe, "Microsoft Basic Render Driver") = sem aceleração de vídeo
  const softGL = (() => {
    try {
      const gl = document.createElement('canvas').getContext('webgl');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const name = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /swiftshader|llvmpipe|softpipe|basic render|software/i.test(name);
    } catch { return false; }
  })();
  const weakHw = (navigator.hardwareConcurrency || 8) <= 2 || (navigator.deviceMemory || 8) <= 2;
  const state = { mode: get('mg_perf'), lite: false, softGL };

  function apply() {
    const lite = state.mode === 'lite' || (state.mode !== 'full' && (softGL || weakHw || get('mg_perf_auto') === 'lite'));
    const changed = lite !== state.lite;
    state.lite = lite;
    document.documentElement.classList.toggle('lite', lite);
    const b = document.querySelector('#lite');
    if (b) {
      b.setAttribute('aria-pressed', lite);
      b.title = lite ? 'Modo leve: ligado (efeitos simples pra PC mais fraco). Clique pra desligar' : 'Modo leve: desligado. Clique se o site estiver travando';
    }
    if (changed) dispatchEvent(new Event('mg:perf'));
  }
  // a pessoa escolheu no botão: vale mais que a medição
  function toggle() {
    state.mode = state.lite ? 'full' : 'lite';
    put('mg_perf', state.mode);
    apply();
  }
  // a medição achou o PC engasgando: liga sozinho (e fica ligado nas próximas visitas) e avisa como desfazer
  function autoLite() {
    if (state.mode || state.lite) return;
    put('mg_perf_auto', 'lite');
    apply();
    let box = document.querySelector('#toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    const t = document.createElement('button');
    t.className = 'toast glass';
    t.innerHTML = `<span class="ic">${icon('gauge')}</span><span>Liguei o <b>modo leve</b>: o site estava travando neste PC.<small>Clique aqui pra voltar aos efeitos completos.</small></span>`;
    t.onclick = () => { t.remove(); toggle(); };
    box.appendChild(t);
    setTimeout(() => t.remove(), 12_000);
  }
  // abaixo de ~25 quadros por segundo já parece travado (e abaixo de 20 os jogos ficam em câmera lenta)
  const SLOW_FPS = 25;
  /** Mede os quadros por segundo da página por `ms` (aba escondida não conta: o navegador para de desenhar). */
  const sample = ms => new Promise(resolve => {
    if (document.hidden) return resolve(null);
    let n = 0, t0 = 0;
    const f = t => {
      if (document.hidden) return resolve(null);
      if (!t0) t0 = t; else n++;
      if (t - t0 < ms) requestAnimationFrame(f); else resolve(n / ((t - t0) / 1000));
    };
    requestAnimationFrame(f);
  });
  // no automático, mede logo depois de abrir: duas janelas de 2 s lentas seguidas = PC fraco (um engasgo só não conta)
  async function probe() {
    if (state.mode || state.lite) return;
    let slow = 0;
    for (let i = 0; i < 4 && slow < 2; i++) {
      const fps = await sample(2000);
      if (fps === null) return; // aba escondida: tenta de novo na próxima visita
      slow = fps < SLOW_FPS ? slow + 1 : 0;
    }
    if (slow >= 2) autoLite();
  }

  apply();
  document.querySelector('#lite')?.addEventListener('click', toggle);
  addEventListener('load', () => setTimeout(probe, 2500));
  return Object.assign(state, {
    /** Jogos em Phaser: o loop deles mede o FPS de verdade; se ficar lento, liga o modo leve (vale no próximo jogo). */
    reportFps(fps) { if (!state.mode && !state.lite && !document.hidden && fps > 0 && fps < SLOW_FPS) autoLite(); },
  });
})();
