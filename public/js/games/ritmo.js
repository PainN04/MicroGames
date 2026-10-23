GAMES.ritmo = {
  name: 'Ritmo', icon: 'music', hue: 320, desc: 'Escolha uma música e aperte D F J K (ou toque na faixa) quando a nota cruzar a linha. Bom 50, Ótimo 100 e Perfeito 200 (só no instante exato do centro). Nota comprida: segure até o fim. Combo multiplica os pontos.',
  better: 'high', unit: 'pontos', phaser: true,
  boardNote: 'Pontuação geral: a soma do seu melhor em cada música.',
  start(el, done, pass) {
    let stopGame = null, ctx = null, source = null, dead = false;
    const nf = n => Math.round(n).toLocaleString('pt-BR');
    const mmss = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
    const hueOf = id => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

    /* ---------- escolha da música ---------- */
    const picker = async () => {
      el.innerHTML = '<p class="hint">Carregando músicas...</p>';
      let info;
      try {
        if (localMode) {
          const songs = await (await fetch('data/ritmo/songs.json')).json();
          info = { songs: [{ id: 'treino', title: 'Treino', artist: 'Música gerada na hora', durationMs: 45000 }, ...songs], boards: {}, mine: {} };
        } else info = await api('api/ritmo');
      } catch (e) { if (!dead) el.innerHTML = `<p class="hint">${icon('triangle-alert')} Não deu pra carregar as músicas: ${esc(e.message)}</p>`; return; }
      if (dead) return;
      const meta = await fetch('data/ritmo/songs.json').then(r => r.json()).catch(() => []);
      const byId = Object.fromEntries(meta.map(m => [m.id, m]));
      // músicas de verdade primeiro, o Treino (música gerada) no fim
      const songs = [...info.songs.filter(s => s.id !== 'treino'), ...info.songs.filter(s => s.id === 'treino')];
      const total = Object.values(info.mine).reduce((a, b) => a + b, 0);
      const card = s => {
        const m = byId[s.id], top = (info.boards[s.id] || []).slice(0, 3), mine = info.mine[s.id];
        return `<button class="rt-song" data-id="${esc(s.id)}" style="--sh:${hueOf(s.id)}">
          <span class="rt-cover">${icon(s.id === 'treino' ? 'sparkles' : 'music')}</span>
          <span class="rt-info"><b>${esc(s.title)}</b><small>${esc(s.artist)}${m ? ` · ${Math.round(m.bpm)} BPM` : ''} · ${mmss(s.durationMs)}</small>
            ${top.length ? `<ol class="rt-top">${top.map((r, k) => `<li class="${r.name === player ? 'me' : ''}"><span>${k + 1}º</span>${esc(r.name)}<em>${nf(r.score)}</em></li>`).join('')}</ol>` : '<span class="rt-top empty">Ninguém jogou ainda</span>'}
          </span>
          <span class="rt-best"><small>Seu recorde</small><b>${mine ? nf(mine) : '—'}</b></span>
          <span class="rt-play">${icon('play')}</span>
        </button>`;
      };
      const credits = meta.length ? `<p class="hint rt-credits">Músicas: ${meta.map(m => `<a href="${esc(m.source)}" target="_blank" rel="noopener">${esc(m.title)}</a> (${esc(m.artist)}, ${esc(m.license)})`).join(' · ')}</p>` : '';
      el.innerHTML = `<div class="rt-pick">
        <div class="rt-head"><h3>${icon('music')} Escolha a música</h3>${localMode ? '' : `<span class="rt-total">Sua pontuação geral<b>${nf(total)}</b></span>`}</div>
        <div class="rt-list">${songs.map(card).join('')}</div>${credits}</div>`;
      el.querySelectorAll('.rt-song').forEach(b => b.onclick = () => begin(songs.find(s => s.id === b.dataset.id)));
      el.querySelector('.rt-song')?.focus();
    };

    /* ---------- carrega a música e começa ---------- */
    const begin = async song => {
      if (song.id === 'treino') return run(song, generated(), null);
      // o AudioContext nasce no clique (o navegador só deixa tocar som depois de um gesto da pessoa)
      ctx = new AudioContext();
      el.innerHTML = `<p class="hint">${icon('music')} Carregando "${esc(song.title)}"...</p>`;
      try {
        const chart = await (await fetch(`data/ritmo/${song.id}.json`)).json();
        const buf = await ctx.decodeAudioData(await (await fetch(chart.audio)).arrayBuffer());
        if (dead) return;
        run(song, chart, buf);
      } catch (e) { if (!dead) el.innerHTML = `<p class="hint">${icon('triangle-alert')} Não deu pra carregar a música: ${esc(e.message)}</p>`; }
    };

    // Treino: a música gerada de antes (BPM sobe de 100 a 150, contratempo, acordes e notas compridas depois de 12s)
    const generated = () => {
      const DUR = 45000, LANES = 4, notes = [], busy = [0, 0, 0, 0];
      for (let t = 2000, lastLane = -1; t < DUR; ) {
        const bpm = 100 + (t / DUR) * 50, beat = 60000 / bpm;
        const halfStep = t > 8000 && Math.random() < 0.3;
        let lane, tries = 0;
        do lane = rand(0, LANES - 1); while ((busy[lane] > t || (lane === lastLane && Math.random() < 0.6)) && ++tries < 20);
        if (busy[lane] > t) { t += beat; continue; }
        const n = [t, lane];
        if (t > 6000 && !halfStep && Math.random() < 0.14) { n.push(Math.round(beat * (1 + Math.random()))); busy[lane] = t + n[2] + 120; }
        notes.push(n);
        if (t > 12000 && Math.random() < 0.12) {
          const other = (lane + rand(1, 3)) % LANES;
          if (busy[other] <= t) notes.push([t, other]);
        }
        lastLane = lane;
        t += beat * (halfStep ? 0.5 : 1);
      }
      const beats = [];
      for (let t = 2000, k = 0; t < notes.at(-1)[0] + 600; k++) { beats.push({ t, k }); t += 60000 / (100 + (t / DUR) * 50); }
      return { notes, beats, synth: true, durationMs: DUR };
    };

    /* ---------- a partida ---------- */
    const run = (song, chart, buffer) => {
      const W = 400, H = 560, LANES = 4, LW = W / LANES, HIT_Y = H - 80, TRAVEL = 1500, TOP = 0.42, LEAD = 2000;
      // janelas de acerto em ms a partir do centro da nota: Perfeito é praticamente o instante exato
      const JUDGES = [
        { ms: 18, pts: 200, text: 'Perfeito', color: '#ffd34d' },
        { ms: 55, pts: 100, text: 'Ótimo', color: '#5ce1ff' },
        { ms: 120, pts: 50, text: 'Bom', color: '#7cffb0' },
      ];
      const GOOD = JUDGES.at(-1).ms;
      // atraso do fone/caixa de som: a pessoa ajusta e fica salvo (soma no instante de cada aperto)
      let lat = 0; try { lat = +localStorage.getItem('mg_ritmo_lat') || 0; } catch {}
      el.innerHTML = `<div class="hud"><span class="stat">Pontos<b id="p">0</b></span><span class="stat">Combo<b id="c">0</b></span><span class="stat">Tempo<b id="t">-</b></span></div>
        <p class="rt-now">${icon('music')} <b>${esc(song.title)}</b> · ${esc(song.artist)}</p><div class="phaser-wrap" id="pw"></div>
        <div class="row-btns lat"><span class="hint">Atraso do som</span><button class="btn ghost" id="lm" aria-label="Menos atraso">−</button><b id="lv">${lat} ms</b><button class="btn ghost" id="lp" aria-label="Mais atraso">+</button></div>`;
      const hud = { p: el.querySelector('#p'), c: el.querySelector('#c'), t: el.querySelector('#t') };
      const setLat = v => { lat = Phaser.Math.Clamp(v, -150, 150); el.querySelector('#lv').textContent = lat + ' ms'; try { localStorage.setItem('mg_ritmo_lat', lat); } catch {} };
      el.querySelector('#lm').onclick = e => { e.currentTarget.blur(); setLat(lat - 10); };
      el.querySelector('#lp').onclick = e => { e.currentTarget.blur(); setLat(lat + 10); };
      const laneColor = ['--green', '--red', '--yellow', '--blue'].map(hex);
      const TONES = [392, 440, 523, 587];
      const BASS = [110, 87.31, 130.81, 98]; // treino: lá, fá, dó, sol, muda a cada 4 tempos
      const notes = chart.notes.map(([t, lane, len = 0]) => ({ t, lane, len, done: false }));
      // linhas do compasso: a grade da música (BPM + 1º tempo) ou as batidas do treino
      const beats = chart.beats || (() => {
        const out = [], step = 60000 / chart.bpm;
        for (let t = chart.beat0 % step, k = 0; t < chart.durationMs; t += step, k++) out.push({ t, k });
        return out;
      })();
      const lastEnd = Math.max(...notes.map(n => n.t + n.len));
      const end = chart.synth ? lastEnd + 900 : Math.max(lastEnd + 900, chart.durationMs);

      // perspectiva: a pista afina lá em cima (fator de largura por altura)
      const fz = y => TOP + (1 - TOP) * (y / HIT_Y);
      const lx = (edge, y) => W / 2 + (edge * LW - W / 2) * fz(y);

      // Relógio: na música de verdade é o do áudio (o mesmo que toca o som, então nota e música não se desencontram
      // nem quando o jogo engasga); no treino, a soma dos quadros como antes. Começa em -LEAD: a música entra em 0.
      let startAt = 0;
      if (buffer) {
        const gain = ctx.createGain();
        gain.gain.value = muted ? 0 : 0.9;
        source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(gain).connect(ctx.destination);
        startAt = ctx.currentTime + LEAD / 1000;
        source.start(startAt);
      }
      const songClock = () => (ctx.currentTime - startAt - (ctx.outputLatency || ctx.baseLatency || 0)) * 1000;

      stopGame = mountPhaser(el.querySelector('#pw'), W, H, {
        create() {
          let now = buffer ? songClock() : 0, score = 0, combo = 0, best = 0, over = false, frameAt = performance.now(), nextBeat = 0;
          const pressed = [0, 0, 0, 0], flash = [0, 0, 0, 0], down = [false, false, false, false];
          const count = { Perfeito: 0, 'Ótimo': 0, Bom: 0, Perdeu: 0, Segurou: 0 };
          const bg = this.add.graphics(), g = this.add.graphics();
          const font = { fontFamily: 'Space Grotesk, system-ui, sans-serif', fontSize: '18px', color: '#9aa0b4' };
          ['D', 'F', 'J', 'K'].forEach((k, i) => this.add.text(lx(i + 0.5, HIT_Y + 40), HIT_Y + 40, k, font).setOrigin(0.5));
          const judge = (text, color, lane) => floatText(this, lx(lane + 0.5, HIT_Y), HIT_Y - 30, text, color);
          const mult = () => Math.min(4, 1 + Math.floor(combo / 10) * 0.5);
          const addPts = p => { score += Math.round(p * mult()); hud.p.textContent = nf(score); };
          const breakCombo = () => { combo = 0; hud.c.textContent = 0; };
          // pausa (trocou de aba): a música para junto, e o relógio dela também
          this.events.on('pause', () => ctx?.suspend());
          this.events.on('resume', () => ctx?.resume());
          const press = lane => {
            if (over) return;
            pressed[lane] = 120; down[lane] = true;
            // tempo exato do aperto, não o do último frame (senão a precisão ficava presa em ~16ms), menos o atraso do som
            const at = now + Math.min(performance.now() - frameAt, 50) - lat;
            let hit = null;
            for (const n of notes) if (!n.done && n.lane === lane && Math.abs(n.t - at) <= GOOD && (!hit || Math.abs(n.t - at) < Math.abs(hit.t - at))) hit = n;
            if (!hit) {
              // apertar sem nota quebra o combo (senão compensava metralhar as teclas)
              if (combo) judge('Errou', '#ff6b8a', lane);
              breakCombo();
              return;
            }
            hit.done = true;
            const off = at - hit.t, j = JUDGES.find(j => Math.abs(off) <= j.ms);
            count[j.text]++;
            combo++; best = Math.max(best, combo);
            addPts(j.pts);
            hud.c.textContent = combo;
            judge(j.text, j.color, lane);
            if (j !== JUDGES[0]) floatText(this, lx(lane + 0.5, HIT_Y), HIT_Y - 62, (off < 0 ? 'cedo ' : 'tarde ') + Math.round(Math.abs(off)) + 'ms', '#9aa0b4');
            else flash[lane] = 260;
            // nota comprida: pinga 5 a cada 100 ms segurando (no máximo len/100 + 1 vezes, o mesmo teto do servidor)
            if (hit.len) { hit.holding = true; hit.from = at; hit.ticks = 0; }
            if (chart.synth || j === JUDGES[0]) beep(TONES[lane] * (j === JUDGES[0] ? 2 : 1), 90, 'triangle', chart.synth ? 0.05 : 0.025);
          };
          const release = lane => { down[lane] = false; };
          const KEY_LANE = { d: 0, f: 1, j: 2, k: 3, ArrowLeft: 0, ArrowDown: 1, ArrowUp: 2, ArrowRight: 3 };
          const keyLane = e => KEY_LANE[e.key.length === 1 ? e.key.toLowerCase() : e.key];
          this.input.keyboard.addCapture('LEFT,RIGHT,UP,DOWN');
          this.input.keyboard.on('keydown', e => { const l = keyLane(e); if (l !== undefined && !e.repeat) press(l); });
          this.input.keyboard.on('keyup', e => { const l = keyLane(e); if (l !== undefined) release(l); });
          const laneAt = p => Phaser.Math.Clamp(Math.floor((W / 2 + (p.x - W / 2) / fz(Math.min(p.y, H))) / LW), 0, LANES - 1);
          this.input.on('pointerdown', p => { p.lane = laneAt(p); press(p.lane); });
          this.input.on('pointerup', p => { if (p.lane !== undefined) release(p.lane); });

          // treino: acompanhamento gerado (bumbo no tempo, chimbal no contratempo, caixa no 2 e 4 depois de 12s, baixo)
          const playBeat = b => {
            if (!chart.synth) return;
            beep(58, 140, 'sine', 0.11); noise(50, 0.05, 400);
            beep(BASS[Math.floor(b.k / 4) % 4] * (b.k % 2 ? 2 : 1), 180, 'triangle', 0.045);
            if (b.t > 12000 && b.k % 2) noise(110, 0.05, 2600);
            const nb = beats[b.k + 1];
            if (nb) setTimeout(() => !over && noise(25, 0.025, 7000), (nb.t - b.t) / 2);
          };

          const finish = () => {
            over = true;
            summarize([['Perfeito', count.Perfeito], ['Ótimo', count['Ótimo']], ['Bom', count.Bom], ['Perdeu', count.Perdeu], ['Compridas até o fim', count.Segurou], ['Maior combo', best]]);
            this.time.delayedCall(400, () => save(song, score));
          };

          this.events.on('update', (time, delta) => {
            frameAt = performance.now();
            if (!over) {
              now = buffer ? songClock() : now + Math.min(delta, 50);
              hud.t.textContent = mmss(Math.max(0, end - Math.max(0, now)));
              while (nextBeat < beats.length && beats[nextBeat].t <= now) playBeat(beats[nextBeat++]);
              for (const n of notes) {
                if (!n.done && now - lat - n.t > GOOD) {
                  n.done = true; count.Perdeu++;
                  if (combo) judge('Perdeu', '#ff6b8a', n.lane);
                  breakCombo();
                }
                // nota comprida: enquanto segura, pinga pontos; soltou antes, perde o resto; chegou ao fim, bônus
                if (n.holding) {
                  if (!down[n.lane]) { n.holding = false; n.cut = now; continue; }
                  const due = Math.min(Math.floor((Math.min(now - lat, n.t + n.len) - n.from) / 100), Math.floor(n.len / 100) + 1);
                  for (; n.ticks < due; n.ticks++) addPts(5);
                  if (now - lat >= n.t + n.len) {
                    n.holding = false; n.cut = n.t + n.len; count.Segurou++;
                    addPts(50); judge('Segurou!', '#ff9ee5', n.lane); flash[n.lane] = 260;
                    beep(TONES[n.lane] * 2, 120, 'triangle', 0.04);
                  }
                }
              }
              if (now > end) finish();
            }
            for (let i = 0; i < LANES; i++) { pressed[i] = Math.max(0, pressed[i] - delta); flash[i] = Math.max(0, flash[i] - delta); }

            // pista em perspectiva
            bg.clear();
            bg.fillGradientStyle(0x0d0e1a, 0x0d0e1a, 0x1d1f2e, 0x1d1f2e).fillRect(0, 0, W, H);
            const pulse = nextBeat ? Math.max(0, 1 - (now - beats[nextBeat - 1].t) / 220) : 0; // pisca no tempo da música
            for (let i = 0; i < LANES; i++) {
              const quad = [{ x: lx(i, 0), y: 0 }, { x: lx(i + 1, 0), y: 0 }, { x: lx(i + 1, H), y: H }, { x: lx(i, H), y: H }];
              bg.fillStyle(i % 2 ? 0x1d1f2e : 0x23263d).fillPoints(quad, true);
              if (pressed[i]) bg.fillStyle(laneColor[i], 0.2 * (pressed[i] / 120)).fillPoints(quad, true);
            }
            bg.lineStyle(1, 0xffffff, 0.08 + pulse * 0.12);
            for (let i = 0; i <= LANES; i++) bg.lineBetween(lx(i, 0), 0, lx(i, H), H);
            // linhas do compasso descendo junto com as notas
            for (let k = nextBeat - 1; k < beats.length && k < nextBeat + 8; k++) {
              if (k < 0) continue;
              const y = HIT_Y - ((beats[k].t - now) / TRAVEL) * (HIT_Y + 20);
              if (y < 0 || y > HIT_Y) continue;
              bg.lineStyle(beats[k].k % 4 ? 1 : 2, 0xffffff, beats[k].k % 4 ? 0.05 : 0.1).lineBetween(lx(0, y), y, lx(LANES, y), y);
            }

            g.clear();
            g.fillStyle(0xffffff, 0.45 + pulse * 0.3).fillRect(lx(0, HIT_Y), HIT_Y - 2, lx(LANES, HIT_Y) - lx(0, HIT_Y), 4);
            for (let i = 0; i < LANES; i++) {
              const x0 = lx(i, HIT_Y) + 10, w = LW - 20;
              g.lineStyle(2, laneColor[i], 0.7).strokeRoundedRect(x0, HIT_Y - 12, w, 24, 8);
              if (down[i]) g.fillStyle(laneColor[i], 0.25).fillRoundedRect(x0, HIT_Y - 12, w, 24, 8);
              // brilho dourado no alvo quando sai um Perfeito
              if (flash[i]) g.fillStyle(0xffd34d, 0.55 * (flash[i] / 260)).fillRoundedRect(x0 - 4, HIT_Y - 16, w + 8, 32, 10);
            }
            const yOf = t => HIT_Y - ((t - now) / TRAVEL) * (HIT_Y + 20);
            for (const n of notes) {
              const tailEnd = n.t + n.len;
              if (n.done && !(n.holding && n.len)) continue;
              const y = n.holding ? HIT_Y : yOf(n.t);
              if (y < -30 || (y > H && !n.len)) continue;
              const c = laneColor[n.lane];
              if (n.len) { // rabo da nota comprida (afina com a perspectiva)
                const ty = Math.max(-10, yOf(tailEnd)), f0 = fz(y), f1 = fz(ty), cx0 = lx(n.lane + 0.5, y), cx1 = lx(n.lane + 0.5, ty), hw = LW * 0.16;
                g.fillStyle(c, n.holding ? 0.75 : 0.45).fillPoints([{ x: cx1 - hw * f1, y: ty }, { x: cx1 + hw * f1, y: ty }, { x: cx0 + hw * f0, y }, { x: cx0 - hw * f0, y }], true);
                g.fillStyle(c).fillCircle(cx1, ty, hw * f1);
              }
              const f = fz(y), w = (LW - 24) * f, h = 20 * (0.7 + 0.3 * f), x = lx(n.lane + 0.5, y);
              g.fillStyle(0x000000, 0.25).fillRoundedRect(x - w / 2, y - h / 2 + 3, w, h, 8 * f);
              g.fillStyle(c).fillRoundedRect(x - w / 2, y - h / 2, w, h, 8 * f);
              g.fillStyle(0xffffff, 0.35).fillRoundedRect(x - w / 2 + 4, y - h / 2 + 2, w - 8, h * 0.3, 4 * f);
            }
          });
        },
      });
    };

    /* ---------- fim: o servidor confere a música e devolve a pontuação geral ---------- */
    const save = async (song, score) => {
      if (localMode) return done(score);
      const shown = { label: song.title, score };
      try {
        const r = await api('api/ritmo/score', { method: 'POST', body: { track: song.id, score, play: (await pass)?.id } });
        const sum = partSummary || [];
        sum.unshift(['Recorde nesta música', nf(Math.max(r.prevBest ?? 0, score)) + (r.prevBest == null || score > r.prevBest ? ' (novo!)' : '')], ['Pontuação geral', nf(r.total)]);
        summarize(sum);
        done(r.total, { saved: 'ok', shown });
      } catch (e) {
        done(score, { saved: e.status === 401 ? 'login' : e.message, shown });
      }
    };
    picker();
    return () => {
      dead = true;
      stopGame?.();
      ctx?.close().catch(() => {});
    };
  }
};
