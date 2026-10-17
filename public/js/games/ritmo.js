GAMES.ritmo = {
  name: 'Ritmo', icon: 'music', hue: 320, desc: 'Aperte D F J K (ou toque na faixa) quando a nota chegar na linha. Combo multiplica os pontos. 45s.',
  better: 'high', unit: 'pontos', phaser: true,
  start(el, done) {
    const W = 400, H = 560, LANES = 4, LW = W / LANES, HIT_Y = H - 80, TRAVEL = 1500, DUR = 45000;
    const PERFECT = 60, GOOD = 120;
    el.innerHTML = '<div class="hud"><span class="stat">Pontos<b id="p">0</b></span><span class="stat">Combo<b id="c">0</b></span><span class="stat">Tempo<b id="t">45s</b></span></div><div class="phaser-wrap" id="pw"></div>';
    const hud = { p: el.querySelector('#p'), c: el.querySelector('#c'), t: el.querySelector('#t') };
    const laneColor = ['--green', '--red', '--yellow', '--blue'].map(hex);
    const TONES = [392, 440, 523, 587];
    // música gerada: BPM sobe de 100 a 150; depois de 12s aparecem notas no contratempo e acordes
    const notes = [];
    for (let t = 2000, lastLane = -1; t < DUR; ) {
      const bpm = 100 + (t / DUR) * 50, beat = 60000 / bpm;
      let lane; do lane = rand(0, LANES - 1); while (lane === lastLane && Math.random() < 0.6);
      notes.push({ lane, t, done: false });
      if (t > 12000 && Math.random() < 0.12) notes.push({ lane: (lane + rand(1, 3)) % LANES, t, done: false });
      lastLane = lane;
      t += beat * (t > 8000 && Math.random() < 0.3 ? 0.5 : 1);
    }
    const end = notes.at(-1).t + 900;
    return mountPhaser(el.querySelector('#pw'), W, H, {
      create() {
        let now = 0, score = 0, combo = 0, over = false;
        const pressed = [0, 0, 0, 0];
        const g = this.add.graphics();
        const font = { fontFamily: 'Space Grotesk, system-ui, sans-serif', fontSize: '18px', color: '#9aa0b4' };
        ['D', 'F', 'J', 'K'].forEach((k, i) => this.add.text(i * LW + LW / 2, HIT_Y + 40, k, font).setOrigin(0.5));
        const judge = (text, color, lane) => floatText(this, lane * LW + LW / 2, HIT_Y - 30, text, color);
        const mult = () => Math.min(4, 1 + Math.floor(combo / 10) * 0.5);
        const press = lane => {
          if (over) return;
          pressed[lane] = 120;
          let best = null;
          for (const n of notes) if (!n.done && n.lane === lane && Math.abs(n.t - now) <= GOOD && (!best || Math.abs(n.t - now) < Math.abs(best.t - now))) best = n;
          if (!best) {
            // apertar sem nota quebra o combo (senão compensava metralhar as teclas)
            if (combo) judge('Errou', '#ff6b8a', lane);
            combo = 0; hud.c.textContent = 0;
            return;
          }
          best.done = true;
          const perfect = Math.abs(best.t - now) <= PERFECT;
          combo++;
          score += Math.round((perfect ? 100 : 50) * mult());
          hud.p.textContent = score; hud.c.textContent = combo;
          judge(perfect ? 'Perfeito' : 'Bom', perfect ? '#ffd34d' : '#7cffb0', lane);
          beep(TONES[lane] * (perfect ? 2 : 1), 90, 'triangle', 0.05);
        };
        const KEY_LANE = { d: 0, f: 1, j: 2, k: 3, ArrowLeft: 0, ArrowDown: 1, ArrowUp: 2, ArrowRight: 3 };
        this.input.keyboard.addCapture('LEFT,RIGHT,UP,DOWN');
        this.input.keyboard.on('keydown', e => {
          const lane = KEY_LANE[e.key.length === 1 ? e.key.toLowerCase() : e.key];
          if (lane !== undefined && !e.repeat) press(lane);
        });
        this.input.on('pointerdown', p => press(Phaser.Math.Clamp(Math.floor(p.x / LW), 0, LANES - 1)));
        this.events.on('update', (time, delta) => {
          if (!over) {
            now += Math.min(delta, 50);
            hud.t.textContent = Math.max(0, Math.ceil((DUR - now) / 1000)) + 's';
            for (const n of notes) if (!n.done && now - n.t > GOOD) {
              n.done = true;
              if (combo) judge('Perdeu', '#ff6b8a', n.lane);
              combo = 0; hud.c.textContent = 0;
            }
            if (now > end) { over = true; this.time.delayedCall(400, () => done(score)); }
          }
          for (let i = 0; i < LANES; i++) pressed[i] = Math.max(0, pressed[i] - delta);
          g.clear();
          for (let i = 0; i < LANES; i++) {
            g.fillStyle(i % 2 ? 0x1d1f2e : 0x22253a).fillRect(i * LW, 0, LW, H);
            if (pressed[i]) g.fillStyle(laneColor[i], 0.18 * (pressed[i] / 120)).fillRect(i * LW, 0, LW, H);
          }
          g.fillStyle(0xffffff, 0.55).fillRect(0, HIT_Y - 2, W, 4);
          for (let i = 0; i < LANES; i++) g.lineStyle(2, laneColor[i], 0.7).strokeRoundedRect(i * LW + 10, HIT_Y - 12, LW - 20, 24, 8);
          for (const n of notes) {
            if (n.done) continue;
            const y = HIT_Y - ((n.t - now) / TRAVEL) * (HIT_Y + 20);
            if (y < -30 || y > H) continue;
            g.fillStyle(laneColor[n.lane]).fillRoundedRect(n.lane * LW + 12, y - 10, LW - 24, 20, 8);
          }
        });
      },
    });
  }
};
