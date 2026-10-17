GAMES.digitacao = {
  name: 'Digitação', icon: 'keyboard', hue: 245, desc: 'Digite o máximo de palavras certas em 30s.',
  better: 'high', unit: 'palavras',
  start(el, done) {
    const pool = 'casa café reunião planilha email chefe projeto prazo cliente sistema relatório banana janela teclado monitor cadeira trabalho sexta feira almoço tarefa pessoa código servidor rede mouse papel caneta agenda equipe meta ideia gato cachorro sol chuva verde azul rápido lento grande pequeno feliz carro mesa porta livro música filme jogo'.split(' ');
    const words = Array.from({ length: 120 }, () => pool[rand(0, pool.length - 1)]);
    let i = 0, ok = 0, t0 = 0, iv; const res = [];
    el.innerHTML = '<div class="hud"><span class="stat">Certas<b id="ok">0</b></span><span class="stat">Tempo<b id="t">30s</b></span></div><div class="words" id="w"></div><input class="txt" id="in" placeholder="comece a digitar..." autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Digite as palavras">';
    const w = el.querySelector('#w'), inp = el.querySelector('#in');
    function render() {
      const from = Math.max(0, i - 4);
      w.innerHTML = words.slice(from, i + 12).map((x, k) => {
        const idx = from + k;
        const cls = idx === i ? 'cur' : idx < i ? (res[idx] ? 'ok' : 'bad') : '';
        return `<span class="${cls}">${x}</span>`;
      }).join(' ');
    }
    inp.oninput = () => {
      if (!t0) {
        t0 = performance.now();
        iv = setInterval(() => {
          const left = 30 - (performance.now() - t0) / 1000;
          el.querySelector('#t').textContent = Math.max(0, Math.ceil(left)) + 's';
          if (left <= 0) { clearInterval(iv); inp.disabled = true; done(ok); }
        }, 100);
      }
      if (inp.value.endsWith(' ')) {
        res[i] = inp.value.trim() === words[i];
        if (res[i]) el.querySelector('#ok').textContent = ++ok;
        i++; inp.value = ''; render();
      }
    };
    render(); inp.focus();
    return () => clearInterval(iv);
  }
};
