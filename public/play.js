/* Gaming Coins – Lekeland: ekte, barnevennlige spill for de minste (3+).
   Ingen lesing trengs: store knapper, bilder, lyder og en stemme som snakker.
   PLAY.start(id, { onEnd({stars, ms}), onClose(), soundOn() }) */
(function (root) {
  'use strict';
  const META = {
    bil: { name: 'Bilspill', emoji: '🏎️', color: '#ff5a5f', desc: 'Kjør bilen, unngå kjeglene og samle stjerner', age: '3+ år' },
    ballong: { name: 'Ballonger', emoji: '🎈', color: '#ff7ac0', desc: 'Trykk på ballongene så de smeller', age: '2+ år' },
    tegne: { name: 'Tegne', emoji: '🖍️', color: '#8b7bff', desc: 'Mal med fingeren og stempler', age: '2+ år' },
    fiske: { name: 'Fiske', emoji: '🐟', color: '#2fa4ff', desc: 'Fang fiskene som svømmer forbi', age: '3+ år' },
    formsort: { name: 'Former', emoji: '🔺', color: '#ffb020', desc: 'Dra formen til riktig hull', age: '3+ år' },
    xylofon: { name: 'Xylofon', emoji: '🎹', color: '#16c28f', desc: 'Spill musikk på de fargerike tangentene', age: '2+ år' },
    memory: { name: 'Memory', emoji: '🃏', color: '#00b3a4', desc: 'Finn to like kort', age: '3+ år' },
    frukt: { name: 'Fang frukt', emoji: '🧺', color: '#ff8a3d', desc: 'Flytt kurven og fang frukten', age: '3+ år' },
    dyr: { name: 'Dyrene', emoji: '🐮', color: '#a0703c', desc: 'Trykk på dyrene og hør hva de sier', age: '2+ år' },
    tog: { name: 'Togbane', emoji: '🚂', color: '#e0457b', desc: 'Kjør toget og hent dyr på stasjonene', age: '3+ år' },
  };
  const IDS = Object.keys(META);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  /* ---------- lyd ---------- */
  let AC = null, soundOn = () => true;
  function ac() { try { if (!AC) AC = new (root.AudioContext || root.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); } catch { AC = null; } return AC; }
  function tone(freq, dur = 0.25, type = 'sine', vol = 0.18, slide = 0) {
    if (!soundOn()) return; const c = ac(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur = 0.15, vol = 0.2, hp = 800) {
    if (!soundOn()) return; const c = ac(); if (!c) return;
    const b = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = b; f.type = 'highpass'; f.frequency.value = hp; g.gain.value = vol; s.connect(f).connect(g).connect(c.destination); s.start();
  }
  const SFX = {
    pop: () => { noise(0.12, 0.35, 1200); tone(900, 0.08, 'triangle', 0.12, 600); },
    star: () => { tone(988, 0.1, 'triangle', 0.14); setTimeout(() => tone(1319, 0.18, 'triangle', 0.14), 80); },
    bump: () => { tone(160, 0.25, 'sawtooth', 0.12, -90); noise(0.1, 0.1, 300); },
    snap: () => { tone(523, 0.08, 'square', 0.08); setTimeout(() => tone(784, 0.15, 'triangle', 0.14), 70); },
    flip: () => tone(600, 0.06, 'triangle', 0.1, 200),
    no: () => tone(220, 0.18, 'triangle', 0.1, -40),
    splash: () => { noise(0.3, 0.25, 500); tone(400, 0.2, 'sine', 0.08, 300); },
    win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.15), i * 110)),
    toot: () => { tone(440, 0.35, 'square', 0.07); tone(554, 0.35, 'square', 0.05); },
    vroom: () => tone(90, 0.5, 'sawtooth', 0.06, 120),
  };
  // stemme som sier ting på norsk (for barn som ikke kan lese)
  function say(text) {
    if (!soundOn() || !root.speechSynthesis) return;
    try {
      root.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text); u.lang = 'nb-NO'; u.rate = 0.95; u.pitch = 1.25;
      const v = root.speechSynthesis.getVoices().find((x) => /^(nb|no|nn)/i.test(x.lang)); if (v) u.voice = v;
      root.speechSynthesis.speak(u);
    } catch {}
  }

  /* ---------- stil ---------- */
  const CSS = `
  .pl{position:fixed;inset:0;z-index:9000;overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none;font-family:"Baloo 2",system-ui,sans-serif;background:var(--bg,#7fd3ff);-webkit-tap-highlight-color:transparent}
  .pl *{box-sizing:border-box}
  .pl-top{position:absolute;left:0;right:0;top:0;z-index:20;display:flex;align-items:center;gap:12px;padding:max(12px,env(safe-area-inset-top)) 16px 0;pointer-events:none}
  .pl-btn{pointer-events:auto;width:68px;height:68px;border-radius:50%;border:0;background:#fff;box-shadow:0 6px 0 rgba(0,0,0,.18);display:grid;place-items:center;font-size:34px;cursor:pointer;flex:none;transition:transform .1s}
  .pl-btn:active{transform:translateY(4px);box-shadow:0 2px 0 rgba(0,0,0,.18)}
  .pl-btn.ok{background:#16c28f;color:#fff}
  .pl-stars{pointer-events:none;margin:0 auto;display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.9);border-radius:999px;padding:6px 18px;font-size:30px;font-weight:800;color:#5a3a00;box-shadow:0 6px 0 rgba(0,0,0,.12);min-width:110px;justify-content:center}
  .pl-stars.bump{animation:plbump .35s}
  @keyframes plbump{40%{transform:scale(1.25)}}
  .pl-time{position:absolute;left:96px;right:96px;top:calc(max(12px,env(safe-area-inset-top)) + 76px);height:12px;border-radius:9px;background:rgba(255,255,255,.45);z-index:20;overflow:hidden}
  .pl-time i{display:block;height:100%;background:#fff;border-radius:9px;transition:width .3s linear}
  .pl-stage{position:absolute;inset:0}
  .pl-fx{position:absolute;pointer-events:none;font-size:44px;z-index:15;animation:plfx .8s ease-out forwards}
  @keyframes plfx{from{opacity:1;transform:translate(-50%,-50%) scale(.6)}to{opacity:0;transform:translate(-50%,-160%) scale(1.5)}}
  .pl-end{position:absolute;inset:0;z-index:30;display:grid;place-items:center;background:rgba(20,10,60,.55);animation:plin .3s}
  @keyframes plin{from{opacity:0}}
  .pl-endbox{background:#fff;border-radius:40px;padding:30px 36px;text-align:center;box-shadow:0 14px 0 rgba(0,0,0,.2);animation:plpop .5s cubic-bezier(.3,1.6,.5,1)}
  @keyframes plpop{from{transform:scale(.3)}}
  .pl-big{font-size:110px;line-height:1}
  .pl-endstars{font-size:52px;letter-spacing:4px;margin:6px 0 4px}
  .pl-endstars span{display:inline-block;animation:plpop .5s both}
  .pl-coins{font-size:30px;font-weight:800;color:#b07400;min-height:40px}
  .pl-endbtns{display:flex;gap:18px;justify-content:center;margin-top:16px}
  .pl-endbtns .pl-btn{width:96px;height:96px;font-size:46px}
  .pl-conf{position:absolute;top:-30px;font-size:30px;z-index:31;pointer-events:none;animation:plfall linear forwards}
  @keyframes plfall{to{transform:translateY(110vh) rotate(720deg)}}
  .pl-hand{position:absolute;font-size:64px;z-index:16;pointer-events:none;animation:plhand 1.2s ease-in-out infinite}
  @keyframes plhand{50%{transform:translate(10px,14px) scale(.9)}}
  /* ballonger */
  .pl-bal{position:absolute;width:110px;height:136px;margin-left:-55px;cursor:pointer;will-change:transform}
  .pl-bal b{position:absolute;left:0;top:0;width:110px;height:124px;border-radius:50% 50% 48% 48%/55% 55% 45% 45%;background:radial-gradient(circle at 32% 28%,rgba(255,255,255,.75),rgba(255,255,255,0) 26%),var(--c);box-shadow:inset -10px -12px 0 rgba(0,0,0,.12)}
  .pl-bal b::after{content:"";position:absolute;left:50%;bottom:-10px;margin-left:-9px;border:9px solid transparent;border-bottom:12px solid var(--c);transform:rotate(180deg)}
  .pl-bal i{position:absolute;left:54px;top:132px;width:2px;height:70px;background:rgba(0,0,0,.25)}
  .pl-bal span{position:absolute;inset:0 0 12px;display:grid;place-items:center;font-size:46px}
  /* tegne */
  .pl-pal{position:absolute;left:0;right:0;bottom:0;z-index:20;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;padding:12px 12px max(14px,env(safe-area-inset-bottom));background:rgba(255,255,255,.92);box-shadow:0 -4px 20px rgba(0,0,0,.1)}
  .pl-sw{width:60px;height:60px;border-radius:50%;border:5px solid #fff;box-shadow:0 0 0 3px rgba(0,0,0,.12);cursor:pointer;display:grid;place-items:center;font-size:32px;background:#fff}
  .pl-sw.on{box-shadow:0 0 0 5px #333;transform:scale(1.1)}
  /* former */
  .pl-hole,.pl-piece{position:absolute;width:150px;height:150px;margin:-75px 0 0 -75px;display:grid;place-items:center}
  .pl-piece{cursor:grab;z-index:5;filter:drop-shadow(0 8px 0 rgba(0,0,0,.2));transition:transform .15s}
  .pl-piece.drag{transform:scale(1.12);z-index:9;transition:none}
  .pl-piece.done{filter:none;transition:left .25s,top .25s}
  .pl-piece svg,.pl-hole svg{width:100%;height:100%;overflow:visible}
  /* xylofon */
  .pl-xy{position:absolute;left:4%;right:4%;top:120px;bottom:40px;display:flex;gap:2%;align-items:center}
  .pl-key{flex:1;border-radius:22px;border:0;cursor:pointer;box-shadow:inset 0 -14px 0 rgba(0,0,0,.18),0 8px 0 rgba(0,0,0,.18);position:relative;transition:transform .08s}
  .pl-key::before,.pl-key::after{content:"";position:absolute;left:50%;width:18px;height:18px;margin-left:-9px;border-radius:50%;background:rgba(255,255,255,.7)}
  .pl-key::before{top:16px}.pl-key::after{bottom:26px}
  .pl-key.hit{transform:scaleY(.95) translateY(6px)}
  /* memory */
  .pl-mem{position:absolute;left:50%;top:54%;transform:translate(-50%,-50%);display:grid;gap:16px}
  .pl-card{width:var(--cs);height:calc(var(--cs) * 1.2);perspective:800px;cursor:pointer}
  .pl-card div{position:relative;width:100%;height:100%;transition:transform .35s;transform-style:preserve-3d}
  .pl-card.open div,.pl-card.ok div{transform:rotateY(180deg)}
  .pl-card b,.pl-card i{position:absolute;inset:0;border-radius:22px;display:grid;place-items:center;backface-visibility:hidden;-webkit-backface-visibility:hidden;box-shadow:0 7px 0 rgba(0,0,0,.18)}
  .pl-card b{background:repeating-linear-gradient(45deg,#fff3 0 12px,transparent 12px 24px),linear-gradient(135deg,#00b3a4,#2fa4ff);font-size:calc(var(--cs) * .35)}
  .pl-card i{background:#fff;transform:rotateY(180deg);font-size:calc(var(--cs) * .58);font-style:normal}
  .pl-card.ok i{background:#e6fff5;animation:plbump .4s}
  /* dyr */
  .pl-zoo{position:absolute;left:50%;top:55%;transform:translate(-50%,-50%);display:grid;grid-template-columns:repeat(3,1fr);gap:18px;width:min(92vw,720px)}
  .pl-ani{aspect-ratio:1;border:0;border-radius:32px;background:#fff;box-shadow:0 8px 0 rgba(0,0,0,.15);font-size:min(17vw,110px);cursor:pointer;display:grid;place-items:center;transition:transform .1s}
  .pl-ani.hop{animation:plhop .6s}
  @keyframes plhop{30%{transform:translateY(-30px) rotate(-8deg) scale(1.1)}60%{transform:translateY(0) rotate(6deg)}}
  `;
  function css() { if (document.getElementById('pl-css')) return; const st = document.createElement('style'); st.id = 'pl-css'; st.textContent = CSS; document.head.appendChild(st); }

  /* ---------- rammeverk ---------- */
  let current = null;
  function start(id, opts = {}) {
    if (!META[id]) return; stop(); css(); soundOn = opts.soundOn || (() => true); ac();
    const m = META[id];
    const el = document.createElement('div'); el.className = 'pl'; el.setAttribute('data-game', id);
    el.innerHTML = `<div class="pl-stage"></div><div class="pl-top"><button class="pl-btn" data-pl="close" aria-label="Lukk">✖️</button>
      <div class="pl-stars"><span>⭐</span><span class="pl-n">0</span></div><span style="width:68px;flex:none" class="pl-right"></span></div>`;
    document.body.appendChild(el);
    const stage = el.querySelector('.pl-stage'), nEl = el.querySelector('.pl-n'), starsEl = el.querySelector('.pl-stars');
    const t0 = Date.now(); let stars = 0, ended = false, timers = [], raf = 0;
    const api = {
      el, stage, id,
      get W() { return el.clientWidth; }, get H() { return el.clientHeight; },
      sfx: (n) => { try { SFX[n] && SFX[n](); } catch {} }, tone, say,
      star(x, y, n = 1) {
        stars += n; nEl.textContent = stars; starsEl.classList.remove('bump'); void starsEl.offsetWidth; starsEl.classList.add('bump');
        api.sfx('star'); if (x != null) api.fx(x, y, '⭐');
      },
      fx(x, y, ch) { const f = document.createElement('div'); f.className = 'pl-fx'; f.textContent = ch; f.style.left = x + 'px'; f.style.top = y + 'px'; el.appendChild(f); setTimeout(() => f.remove(), 850); },
      later(fn, ms) { const t = setTimeout(fn, ms); timers.push(t); return t; },
      every(fn, ms) { const t = setInterval(fn, ms); timers.push(t); return t; },
      loop(fn) { let last = performance.now(); const step = (now) => { const dt = Math.min(0.05, (now - last) / 1000); last = now; if (!ended) fn(dt, now); raf = requestAnimationFrame(step); }; raf = requestAnimationFrame(step); },
      timer(sec) { // tidslinje øverst – spillet slutter når den er tom
        const bar = document.createElement('div'); bar.className = 'pl-time'; bar.innerHTML = '<i style="width:100%"></i>'; el.appendChild(bar);
        const i = bar.firstChild, endAt = Date.now() + sec * 1000;
        api.every(() => { const left = Math.max(0, endAt - Date.now()); i.style.width = (left / (sec * 1000) * 100) + '%'; if (!left) api.end(); }, 250);
      },
      doneButton() { // frie spill: grønn hake for å avslutte
        const r = el.querySelector('.pl-right'); r.outerHTML = '<button class="pl-btn ok" data-pl="done" aria-label="Ferdig">✔️</button>';
      },
      hand(x, y) { const h = document.createElement('div'); h.className = 'pl-hand'; h.textContent = '👆'; h.style.left = x + 'px'; h.style.top = y + 'px'; el.appendChild(h); api.later(() => h.remove(), 3500); return h; },
      end() {
        if (ended) return; ended = true; cancelAnimationFrame(raf); timers.forEach((t) => { clearTimeout(t); clearInterval(t); }); timers = [];
        const ms = Date.now() - t0, shown = Math.max(1, Math.min(3, stars >= 15 ? 3 : stars >= 6 ? 2 : 1));
        api.sfx('win'); say(pick(['Kjempebra!', 'Så flink du er!', 'Hurra!', 'Supert!']));
        const box = document.createElement('div'); box.className = 'pl-end';
        box.innerHTML = `<div class="pl-endbox"><div class="pl-big">${pick(['🏆', '🥳', '🌟', '🎉'])}</div>
          <div class="pl-endstars">${[0, 1, 2].map((i) => `<span style="animation-delay:${0.2 + i * 0.25}s;${i < shown ? '' : 'filter:grayscale(1);opacity:.3'}">⭐</span>`).join('')}</div>
          <div class="pl-coins"></div>
          <div class="pl-endbtns"><button class="pl-btn" data-pl="again" aria-label="Spill igjen">🔄</button><button class="pl-btn ok" data-pl="close" aria-label="Ferdig">✔️</button></div></div>`;
        el.appendChild(box);
        for (let i = 0; i < 26; i++) { const c = document.createElement('div'); c.className = 'pl-conf'; c.textContent = pick(['🎉', '⭐', '🎈', '✨', '🌟', '💛']); c.style.left = rnd(0, 100) + 'vw'; c.style.animationDuration = rnd(1.6, 3.2) + 's'; c.style.animationDelay = rnd(0, .8) + 's'; el.appendChild(c); setTimeout(() => c.remove(), 4200); }
        Promise.resolve(opts.onEnd && opts.onEnd({ stars, ms, game: id })).then((r) => {
          const ce = box.querySelector('.pl-coins'); if (r && r.amount > 0) { ce.innerHTML = `🪙 +${r.amount}` + (r.gems ? ` &nbsp; 💎 +${r.gems}` : ''); api.sfx('star'); }
        }).catch(() => {});
      },
    };
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pl]'); if (!b) return;
      const v = b.dataset.pl;
      if (v === 'close') { stop(); opts.onClose && opts.onClose(); }
      else if (v === 'done') api.end();
      else if (v === 'again') start(id, opts);
    });
    let cleanup = null;
    try { cleanup = GAMES[id](api); } catch (e) { console.warn('Lekeland', e); }
    current = { el, stop: () => { ended = true; cancelAnimationFrame(raf); timers.forEach((t) => { clearTimeout(t); clearInterval(t); }); try { cleanup && cleanup(); } catch {} try { root.speechSynthesis && root.speechSynthesis.cancel(); } catch {} el.remove(); } };
  }
  function stop() { if (current) { const c = current; current = null; c.stop(); } }

  /* ---------- spillene ---------- */
  const GAMES = {
    /* 🏎️ Bilspill: tre filer, trykk venstre/høyre (eller dra) for å bytte fil */
    bil(api) {
      api.el.style.setProperty('--bg', '#5fc65a');
      const cv = document.createElement('canvas'); api.stage.appendChild(cv); const cx = cv.getContext('2d');
      let W, H, dpr; const fit = () => { dpr = Math.min(2, root.devicePixelRatio || 1); W = api.W; H = api.H; cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px'; cx.setTransform(dpr, 0, 0, dpr, 0, 0); };
      fit(); root.addEventListener('resize', fit);
      // egen bil sett ovenfra (ser lik ut på alle enheter)
      const carCol = pick(['#ff3b30', '#0a84ff', '#ffcc00', '#34c759', '#ff2d92', '#ff9500']);
      const rr = (x, y, w, h, r) => { cx.beginPath(); cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r); cx.arcTo(x + w, y + h, x, y + h, r); cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath(); };
      const drawCar = () => {
        cx.fillStyle = 'rgba(0,0,0,.25)'; rr(-38, -54, 80, 120, 26); cx.fill();
        cx.fillStyle = '#222'; for (const [x, y] of [[-44, -40], [30, -40], [-44, 22], [30, 22]]) { rr(x, y, 14, 30, 5); cx.fill(); }
        cx.fillStyle = carCol; rr(-36, -60, 72, 120, 26); cx.fill();
        cx.fillStyle = 'rgba(255,255,255,.35)'; rr(-28, -54, 20, 100, 10); cx.fill();
        cx.fillStyle = '#bfe8ff'; rr(-26, -30, 52, 26, 8); cx.fill(); rr(-24, 22, 48, 18, 6); cx.fill();
        cx.fillStyle = '#fff59d'; cx.beginPath(); cx.arc(-22, -54, 6, 0, 7); cx.arc(22, -54, 6, 0, 7); cx.fill();
        cx.font = '30px serif'; cx.fillText(pick.cache || (pick.cache = pick(['🐶', '🐱', '🐻', '🐰', '🦊'])), 0, 8);
      };
      let lane = 1, carX = 0, off = 0, speed = 260, items = [], spawn = 0, wob = 0, trees = [];
      const road = () => { const rw = Math.min(W * 0.78, 520); return { x: (W - rw) / 2, w: rw, lw: rw / 3 }; };
      const laneX = (l) => { const r = road(); return r.x + r.lw * (l + 0.5); };
      carX = laneX(1);
      for (let i = 0; i < 14; i++) trees.push({ side: i % 2, y: rnd(0, 1), e: pick(['🌳', '🌲', '🌷', '🏠', '🌻', '🐄']) });
      const move = (d) => { const n = Math.max(0, Math.min(2, lane + d)); if (n !== lane) { lane = n; api.tone(300 + lane * 80, 0.08, 'triangle', 0.08); } };
      let sx = null;
      const down = (e) => { sx = e.clientX; };
      const up = (e) => { if (sx == null) return; const dx = e.clientX - sx; sx = null; if (Math.abs(dx) > 30) move(dx > 0 ? 1 : -1); else move(e.clientX < carX ? -1 : 1); };
      cv.addEventListener('pointerdown', down); cv.addEventListener('pointerup', up);
      const key = (e) => { if (e.key === 'ArrowLeft') move(-1); if (e.key === 'ArrowRight') move(1); }; root.addEventListener('keydown', key);
      api.say('Trykk der du vil kjøre. Samle stjernene!'); api.sfx('vroom');
      api.hand(W * 0.22, H * 0.7); api.timer(45);
      api.loop((dt) => {
        speed = Math.min(420, speed + dt * 4); off = (off + speed * dt) % 80;
        carX += (laneX(lane) - carX) * Math.min(1, dt * 12); if (wob > 0) wob -= dt;
        spawn -= dt; if (spawn <= 0) { spawn = rnd(0.7, 1.3) * 300 / speed * 1.4; const star = Math.random() < 0.55; items.push({ l: Math.floor(rnd(0, 3)), y: -60, star, e: star ? '⭐' : pick(['🚧', '🪨', '🛢️']) }); }
        const r = road(), cy = H - 140;
        cx.fillStyle = '#5fc65a'; cx.fillRect(0, 0, W, H);
        cx.font = '42px serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
        for (const t of trees) { t.y += speed * dt / H; if (t.y > 1.1) { t.y = -0.1; t.e = pick(['🌳', '🌲', '🌷', '🏠', '🌻', '🐄']); } cx.fillText(t.e, t.side ? r.x + r.w + (W - r.x - r.w) / 2 : r.x / 2, t.y * H); }
        cx.fillStyle = '#555c66'; cx.fillRect(r.x, 0, r.w, H);
        cx.fillStyle = '#fff'; cx.fillRect(r.x - 8, 0, 8, H); cx.fillRect(r.x + r.w, 0, 8, H);
        cx.fillStyle = '#ffd23f'; for (let k = 1; k < 3; k++) for (let y = -80 + off; y < H; y += 80) cx.fillRect(r.x + r.lw * k - 4, y, 8, 44);
        cx.font = '60px serif';
        for (const it of items) {
          it.y += speed * dt; const ix = laneX(it.l); cx.fillText(it.e, ix, it.y);
          if (!it.hit && it.l === lane && Math.abs(it.y - cy) < 60 && Math.abs(carX - ix) < 50) {
            it.hit = true; if (it.star) { it.gone = true; api.star(ix, cy - 40); } else { wob = 0.5; api.sfx('bump'); speed = Math.max(220, speed - 60); }
          }
        }
        items = items.filter((it) => it.y < H + 80 && !it.gone);
        cx.save(); cx.translate(carX, cy); cx.rotate((wob > 0 ? Math.sin(wob * 40) * 0.25 : 0) + (laneX(lane) - carX) * 0.004);
        drawCar(); cx.restore();
      });
      return () => { root.removeEventListener('resize', fit); root.removeEventListener('keydown', key); };
    },

    /* 🎈 Ballonger */
    ballong(api) {
      api.el.style.setProperty('--bg', 'linear-gradient(#8fd8ff,#d9f3ff)');
      api.el.style.background = 'linear-gradient(#8fd8ff,#e6f7ff)';
      const cols = ['#ff5a5f', '#ffb020', '#16c28f', '#2fa4ff', '#8b7bff', '#ff7ac0', '#ffd23f'];
      const faces = ['', '', '😊', '⭐', '🐶', '🐱', '❤️'];
      let bs = [], popped = 0;
      api.say('Trykk på ballongene!'); api.timer(45);
      const add = (start) => {
        const d = document.createElement('div'); d.className = 'pl-bal';
        d.style.setProperty('--c', pick(cols)); d.innerHTML = `<b></b><i></i><span>${pick(faces)}</span>`;
        const b = { d, x: rnd(70, api.W - 70), y: start ? rnd(api.H * 0.35, api.H * 0.8) : api.H + 40, v: rnd(70, 130), ph: rnd(0, 6) };
        d.addEventListener('pointerdown', (e) => {
          e.preventDefault(); if (b.dead) return; b.dead = true; popped++;
          api.sfx('pop'); api.fx(b.x, b.y + 50, '💥'); api.star(b.x, b.y);
          d.style.transition = 'transform .15s,opacity .15s'; d.style.opacity = '0'; d.style.transform += ' scale(1.5)';
          setTimeout(() => d.remove(), 160); if (popped === 1) api.say('Pang!');
        });
        api.stage.appendChild(d); bs.push(b);
      };
      for (let i = 0; i < 4; i++) add(true); api.every(() => add(), 900);
      api.hand(api.W / 2, api.H * 0.55);
      api.loop((dt, now) => {
        for (const b of bs) { if (b.dead) continue; b.y -= b.v * dt; const x = b.x + Math.sin(now / 600 + b.ph) * 20; b.d.style.transform = `translate(${x}px,${b.y}px)`; if (b.y < -220) { b.dead = true; b.d.remove(); } }
        bs = bs.filter((b) => !b.dead || b.d.isConnected);
      });
    },

    /* 🖍️ Tegne – fingermaling og stempler */
    tegne(api) {
      api.el.style.background = '#fff'; api.doneButton();
      const cv = document.createElement('canvas'); api.stage.appendChild(cv); const cx = cv.getContext('2d');
      const dpr = Math.min(2, root.devicePixelRatio || 1);
      cv.width = api.W * dpr; cv.height = api.H * dpr; cv.style.width = api.W + 'px'; cv.style.height = api.H + 'px'; cx.scale(dpr, dpr);
      cx.fillStyle = '#fff'; cx.fillRect(0, 0, api.W, api.H); cx.lineCap = cx.lineJoin = 'round';
      const COLS = ['#ff3b30', '#ff9500', '#ffd60a', '#34c759', '#0a84ff', '#5e5ce6', '#ff2d92', '#8e5a2b', '#111'];
      let col = COLS[4], mode = 'pen', stamp = '⭐', hue = 0, strokes = 0;
      const pal = document.createElement('div'); pal.className = 'pl-pal';
      const draw = () => {
        pal.innerHTML = COLS.map((c) => `<button class="pl-sw ${mode === 'pen' && col === c ? 'on' : ''}" data-c="${c}" style="background:${c}"></button>`).join('')
          + `<button class="pl-sw ${mode === 'rainbow' ? 'on' : ''}" data-m="rainbow">🌈</button>`
          + ['⭐', '🌸', '🐶', '🚗', '❤️'].map((s) => `<button class="pl-sw ${mode === 'stamp' && stamp === s ? 'on' : ''}" data-s="${s}">${s}</button>`).join('')
          + '<button class="pl-sw" data-m="clear">🗑️</button>';
      };
      draw(); api.el.appendChild(pal);
      pal.addEventListener('pointerdown', (e) => {
        const b = e.target.closest('button'); if (!b) return; e.preventDefault();
        if (b.dataset.c) { col = b.dataset.c; mode = 'pen'; api.tone(500 + COLS.indexOf(col) * 60, 0.08, 'triangle', 0.08); }
        else if (b.dataset.s) { stamp = b.dataset.s; mode = 'stamp'; api.sfx('flip'); }
        else if (b.dataset.m === 'rainbow') { mode = 'rainbow'; api.sfx('star'); }
        else if (b.dataset.m === 'clear') { cx.fillStyle = '#fff'; cx.fillRect(0, 0, api.W, api.H); api.sfx('splash'); }
        draw();
      });
      let last = null;
      const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
      cv.addEventListener('pointerdown', (e) => {
        cv.setPointerCapture(e.pointerId); const p = pos(e);
        if (mode === 'stamp') { cx.font = '80px serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(stamp, p.x, p.y); api.sfx('pop'); strokes++; if (strokes % 6 === 0) api.star(p.x, p.y); return; }
        last = p; cx.beginPath(); cx.fillStyle = mode === 'rainbow' ? `hsl(${hue},90%,55%)` : col; cx.arc(p.x, p.y, 11, 0, 7); cx.fill();
      });
      cv.addEventListener('pointermove', (e) => {
        if (!last) return; const p = pos(e); hue = (hue + 4) % 360;
        cx.strokeStyle = mode === 'rainbow' ? `hsl(${hue},90%,55%)` : col; cx.lineWidth = 22; cx.beginPath(); cx.moveTo(last.x, last.y); cx.lineTo(p.x, p.y); cx.stroke(); last = p;
      });
      const upH = () => { if (last) { strokes++; if (strokes % 6 === 0) api.star(); } last = null; };
      cv.addEventListener('pointerup', upH); cv.addEventListener('pointercancel', upH);
      api.say('Tegn med fingeren!');
    },

    /* 🐟 Fiske */
    fiske(api) {
      api.el.style.background = 'linear-gradient(#bde9ff 0 22%,#3fb6ff 22%,#0b6fd0)';
      const FISH = ['🐟', '🐠', '🐡', '🦀', '🐙', '🦈', '🐬', '🐳'];
      let fish = [], caught = 0;
      const bucket = document.createElement('div'); bucket.style.cssText = 'position:absolute;right:20px;top:calc(22% - 86px);font-size:90px;z-index:4'; bucket.textContent = '🪣'; api.stage.appendChild(bucket);
      const boat = document.createElement('div'); boat.style.cssText = 'position:absolute;left:24px;top:calc(22% - 92px);font-size:96px'; boat.textContent = '🛶'; api.stage.appendChild(boat);
      for (let i = 0; i < 6; i++) { const w = document.createElement('div'); w.style.cssText = `position:absolute;bottom:${rnd(2, 60)}%;left:${rnd(0, 95)}%;font-size:${rnd(20, 34)}px;opacity:.6`; w.textContent = pick(['🫧', '🌿', '🪸', '🐚']); api.stage.appendChild(w); }
      const add = (start) => {
        if (fish.filter((f) => !f.dead).length >= 6) return;
        const d = document.createElement('div'); const dir = Math.random() < 0.5 ? 1 : -1;
        d.style.cssText = 'position:absolute;left:0;top:0;font-size:84px;cursor:pointer;will-change:transform;padding:10px'; d.textContent = pick(FISH);
        const f = { d, dir, x: start ? rnd(api.W * 0.1, api.W * 0.8) : dir > 0 ? -100 : api.W + 20, y: rnd(api.H * 0.3, api.H - 130), v: rnd(70, 140), ph: rnd(0, 6) };
        d.addEventListener('pointerdown', (e) => {
          e.preventDefault(); if (f.dead) return; f.dead = true; caught++;
          api.sfx('splash'); api.star(f.x + 50, f.y);
          const br = bucket.getBoundingClientRect(); d.style.transition = 'transform .6s cubic-bezier(.5,-0.4,.6,1),opacity .6s';
          d.style.transform = `translate(${br.left + 10}px,${br.top}px) scale(.4)`; d.style.opacity = '.3'; setTimeout(() => d.remove(), 620);
          bucket.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 300, delay: 550 });
          if (caught === 1) api.say('Du fikk en fisk!'); if (caught >= 12) api.later(() => api.end(), 700);
        });
        api.stage.appendChild(d); fish.push(f);
      };
      api.say('Trykk på fiskene for å fange dem!');
      for (let i = 0; i < 4; i++) add(true); api.every(() => add(), 1100); api.timer(60);
      api.loop((dt, now) => {
        for (const f of fish) { if (f.dead) continue; f.x += f.dir * f.v * dt; const y = f.y + Math.sin(now / 500 + f.ph) * 14;
          f.d.style.transform = `translate(${f.x}px,${y}px) scaleX(${f.dir > 0 ? -1 : 1})`;
          if (f.x > api.W + 120 || f.x < -160) { f.dead = true; f.d.remove(); } }
        fish = fish.filter((f) => !f.dead || f.d.isConnected);
      });
    },

    /* 🔺 Former – dra formen til hullet som passer */
    formsort(api) {
      api.el.style.background = 'linear-gradient(#fff4d6,#ffe1a8)';
      const SH = {
        sirkel: '<circle cx="50" cy="50" r="44"/>',
        firkant: '<rect x="8" y="8" width="84" height="84" rx="10"/>',
        trekant: '<path d="M50 6 94 90H6z" stroke-linejoin="round"/>',
        stjerne: '<path d="M50 4l13 29 31 3-23 21 7 31-28-16-28 16 7-31L6 36l31-3z" stroke-linejoin="round"/>',
        hjerte: '<path d="M50 90S8 62 8 34C8 18 20 8 33 8c8 0 14 4 17 11 3-7 9-11 17-11 13 0 25 10 25 26 0 28-42 56-42 56z"/>',
        sekskant: '<path d="M27 8h46l23 42-23 42H27L4 50z" stroke-linejoin="round"/>',
      };
      const SAY = { sirkel: 'Sirkel!', firkant: 'Firkant!', trekant: 'Trekant!', stjerne: 'Stjerne!', hjerte: 'Hjerte!', sekskant: 'Sekskant!' };
      const COLS = ['#ff5a5f', '#2fa4ff', '#16c28f', '#ffb020', '#8b7bff', '#ff7ac0'];
      let round = 0;
      const next = () => {
        api.stage.innerHTML = ''; round++;
        const n = round === 1 ? 2 : round === 2 ? 3 : 4, keys = shuffle(Object.keys(SH)).slice(0, n), W = api.W, H = api.H;
        const holeX = (i) => W * (i + 1) / (n + 1), pieceOrder = shuffle(keys.map((_, i) => i));
        let left = n;
        keys.forEach((k, i) => {
          const h = document.createElement('div'); h.className = 'pl-hole'; h.style.left = holeX(i) + 'px'; h.style.top = H * 0.36 + 'px';
          h.innerHTML = `<svg viewBox="0 0 100 100" fill="rgba(60,40,0,.18)" stroke="rgba(60,40,0,.35)" stroke-width="4" stroke-dasharray="8 6">${SH[k]}</svg>`; api.stage.appendChild(h);
          const p = document.createElement('div'); p.className = 'pl-piece'; const px = holeX(pieceOrder[i]), py = H * 0.76;
          p.style.left = px + 'px'; p.style.top = py + 'px';
          p.innerHTML = `<svg viewBox="0 0 100 100" fill="${COLS[i % COLS.length]}" stroke="rgba(0,0,0,.15)" stroke-width="3">${SH[k]}</svg>`; api.stage.appendChild(p);
          let drag = null;
          p.addEventListener('pointerdown', (e) => { if (p.classList.contains('done')) return; e.preventDefault(); p.setPointerCapture(e.pointerId); drag = { dx: e.clientX - parseFloat(p.style.left), dy: e.clientY - parseFloat(p.style.top) }; p.classList.add('drag'); api.sfx('flip'); });
          p.addEventListener('pointermove', (e) => { if (!drag) return; p.style.left = (e.clientX - drag.dx) + 'px'; p.style.top = (e.clientY - drag.dy) + 'px'; });
          const drop = () => {
            if (!drag) return; drag = null; p.classList.remove('drag');
            const x = parseFloat(p.style.left), y = parseFloat(p.style.top);
            if (Math.hypot(x - holeX(i), y - H * 0.36) < 85) {
              p.classList.add('done'); p.style.left = holeX(i) + 'px'; p.style.top = H * 0.36 + 'px'; api.sfx('snap'); api.star(holeX(i), H * 0.36 - 60); api.say(SAY[k]);
              if (--left === 0) api.later(() => { if (round >= 4) api.end(); else next(); }, 1100);
            } else {
              // finnes det et annet hull i nærheten? da var det feil form
              const near = keys.some((_, j) => j !== i && Math.hypot(x - holeX(j), y - H * 0.36) < 85);
              if (near) api.sfx('no');
              p.classList.add('done'); p.style.left = px + 'px'; p.style.top = py + 'px'; setTimeout(() => p.classList.remove('done'), 260);
            }
          };
          p.addEventListener('pointerup', drop); p.addEventListener('pointercancel', drop);
        });
        if (round === 1) { api.say('Dra formen til hullet som passer!'); api.hand(holeX(pieceOrder[0]) + 20, H * 0.76 + 20); }
      };
      next();
    },

    /* 🎹 Xylofon */
    xylofon(api) {
      api.el.style.background = 'linear-gradient(#fff6e5,#ffe2f0)'; api.doneButton();
      const NOTES = [523.25, 587.33, 659.25, 698.46, 783.99, 880, 987.77, 1046.5];
      const COLS = ['#ff3b30', '#ff9500', '#ffd60a', '#34c759', '#00c7be', '#0a84ff', '#5e5ce6', '#ff2d92'];
      const ANI = ['🐸', '🐥', '🐰', '🐻', '🐱', '🐶', '🦄', '🐼'];
      const box = document.createElement('div'); box.className = 'pl-xy';
      box.innerHTML = NOTES.map((_, i) => `<button class="pl-key" data-i="${i}" style="background:${COLS[i]};height:${92 - i * 6}%"></button>`).join('');
      api.stage.appendChild(box); let taps = 0;
      box.addEventListener('pointerdown', (e) => {
        const b = e.target.closest('.pl-key'); if (!b) return; e.preventDefault(); const i = +b.dataset.i;
        api.tone(NOTES[i], 0.6, 'sine', 0.22); api.tone(NOTES[i] * 2, 0.25, 'triangle', 0.05);
        b.classList.add('hit'); setTimeout(() => b.classList.remove('hit'), 110);
        const r = b.getBoundingClientRect(); api.fx(r.left + r.width / 2, r.top + 30, pick(['🎵', '🎶', ANI[i]]));
        taps++; if (taps % 15 === 0) api.star(r.left + r.width / 2, r.top);
      });
      api.say('Trykk på fargene og lag musikk!');
      // liten melodi som viser hvordan
      [0, 2, 4, 7].forEach((i, n) => api.later(() => { const b = box.children[i]; b.classList.add('hit'); api.tone(NOTES[i], 0.4, 'sine', 0.15); setTimeout(() => b.classList.remove('hit'), 120); }, 1600 + n * 300));
    },

    /* 🃏 Memory */
    memory(api) {
      api.el.style.background = 'linear-gradient(#d6fff6,#c3e8ff)';
      const SETS = ['🐶', '🐱', '🐰', '🦊', '🐻', '🐼', '🐸', '🦁', '🐷', '🐵', '🦄', '🐮'];
      let level = 0;
      const deal = () => {
        api.stage.innerHTML = ''; level++;
        const pairs = level === 1 ? 2 : level === 2 ? 3 : 4, cols = pairs === 2 ? 2 : pairs === 3 ? 3 : 4;
        const em = shuffle(SETS).slice(0, pairs), cards = shuffle([...em, ...em]);
        const rows = Math.ceil(cards.length / cols), cs = Math.min((api.W - 60) / cols - 16, (api.H - 160) / rows / 1.2 - 16, 170);
        const g = document.createElement('div'); g.className = 'pl-mem'; g.style.gridTemplateColumns = `repeat(${cols},auto)`; g.style.setProperty('--cs', cs + 'px');
        g.innerHTML = cards.map((c, i) => `<div class="pl-card" data-i="${i}"><div><b>❓</b><i>${c}</i></div></div>`).join('');
        api.stage.appendChild(g);
        let open = [], lock = false, found = 0;
        g.addEventListener('pointerdown', (e) => {
          const c = e.target.closest('.pl-card'); if (!c || lock || c.classList.contains('open') || c.classList.contains('ok')) return;
          e.preventDefault(); c.classList.add('open'); api.sfx('flip'); open.push(c);
          if (open.length === 2) {
            lock = true; const [a, b] = open;
            if (cards[a.dataset.i] === cards[b.dataset.i]) {
              api.later(() => { a.classList.add('ok'); b.classList.add('ok'); const r = b.getBoundingClientRect(); api.star(r.left + r.width / 2, r.top); open = []; lock = false;
                if (++found === pairs) api.later(() => (level >= 3 ? api.end() : deal()), 900); }, 380);
            } else api.later(() => { a.classList.remove('open'); b.classList.remove('open'); open = []; lock = false; }, 950);
          }
        });
        if (level === 1) api.say('Finn to like!');
      };
      deal();
    },

    /* 🧺 Fang frukt */
    frukt(api) {
      api.el.style.background = 'linear-gradient(#9ee3ff,#d9f6ff 70%,#7ccf6a 70%)';
      const FR = ['🍎', '🍌', '🍓', '🍇', '🍊', '🍐', '🍒', '🍉', '🥕'];
      const bk = document.createElement('div'); bk.style.cssText = 'position:absolute;bottom:40px;left:0;font-size:120px;transform:translateX(-50%);will-change:left;z-index:3'; bk.textContent = '🧺'; api.stage.appendChild(bk);
      const tree = document.createElement('div'); tree.style.cssText = 'position:absolute;top:70px;left:0;right:0;display:flex;justify-content:space-around;font-size:96px;opacity:.95'; tree.textContent = '🌳🌳🌳'; api.stage.appendChild(tree);
      let bx = api.W / 2, tx = bx, fr = [];
      const mv = (e) => { tx = e.clientX; };
      api.el.addEventListener('pointerdown', mv); api.el.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType !== 'mouse') mv(e); });
      const add = () => { const d = document.createElement('div'); d.style.cssText = 'position:absolute;left:0;top:0;font-size:70px;will-change:transform'; d.textContent = pick(FR); api.stage.appendChild(d); fr.push({ d, x: rnd(60, api.W - 60), y: 140, v: rnd(110, 170), r: rnd(-2, 2) }); };
      api.say('Flytt kurven og fang frukten!'); api.hand(api.W / 2 + 30, api.H - 120);
      add(); api.every(add, 1000); api.timer(45);
      api.loop((dt) => {
        bx += (tx - bx) * Math.min(1, dt * 10); bk.style.left = bx + 'px';
        const by = api.H - 110;
        for (const f of fr) {
          if (f.dead) continue; f.y += f.v * dt; f.d.style.transform = `translate(${f.x - 35}px,${f.y - 35}px) rotate(${f.y * f.r / 100}rad)`;
          if (f.y > by - 30 && f.y < by + 20 && Math.abs(f.x - bx) < 75) { f.dead = true; f.d.remove(); api.star(bx, by - 60); api.tone(rnd(600, 900), 0.1, 'triangle', 0.1); }
          else if (f.y > api.H) { f.dead = true; f.d.remove(); }
        }
        fr = fr.filter((f) => !f.dead);
      });
    },

    /* 🐮 Dyrene – trykk og hør */
    dyr(api) {
      api.el.style.background = 'linear-gradient(#bfe9ff,#e9ffd6 60%,#9bdc6f 60%)'; api.doneButton();
      const A = [['🐮', 'Kua sier mø!', 140], ['🐶', 'Hunden sier voff voff!', 420], ['🐱', 'Katten sier mjau!', 700], ['🐷', 'Grisen sier nøff nøff!', 200], ['🐑', 'Sauen sier bæ!', 520], ['🐔', 'Høna sier klukk klukk!', 900],
        ['🐴', 'Hesten sier ihaha!', 330], ['🦆', 'Anda sier kvakk kvakk!', 600], ['🐸', 'Frosken sier kvekk!', 250], ['🦁', 'Løven sier ROAR!', 110], ['🐘', 'Elefanten sier tøøt!', 180], ['🐝', 'Bia sier bzzz!', 760]];
      const set = shuffle(A).slice(0, 6), z = document.createElement('div'); z.className = 'pl-zoo';
      z.innerHTML = set.map((a, i) => `<button class="pl-ani" data-i="${i}">${a[0]}</button>`).join(''); api.stage.appendChild(z);
      const heard = new Set();
      z.addEventListener('pointerdown', (e) => {
        const b = e.target.closest('.pl-ani'); if (!b) return; e.preventDefault(); const a = set[+b.dataset.i];
        b.classList.remove('hop'); void b.offsetWidth; b.classList.add('hop');
        api.tone(a[2], 0.35, 'sawtooth', 0.06, a[2] * 0.3); api.say(a[1]);
        const r = b.getBoundingClientRect(); api.fx(r.left + r.width / 2, r.top + 20, pick(['💬', '🎵', '❤️']));
        if (!heard.has(b.dataset.i)) { heard.add(b.dataset.i); api.star(r.left + r.width / 2, r.top); if (heard.size === set.length) api.later(() => api.end(), 2200); }
      });
      api.say('Trykk på dyrene!');
    },

    /* 🚂 Togbane – trykk på toget for å kjøre, hent dyr på stasjonene */
    tog(api) {
      api.el.style.background = 'linear-gradient(#bde9ff 0 45%,#8bd46b 45%)';
      const cv = document.createElement('canvas'); api.stage.appendChild(cv); const cx = cv.getContext('2d');
      const dpr = Math.min(2, root.devicePixelRatio || 1); let W = api.W, H = api.H;
      cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px'; cx.scale(dpr, dpr);
      const PAS = ['🐶', '🐱', '🐰', '🐻', '🐼', '🦊', '🐸', '🐵'];
      let dist = 0, v = 0, target = 0, cars = [], station = 500, waiting = null, smoke = [], picked = 0;
      const ty = H * 0.62, trainX = W * 0.62;
      const go = () => { if (waiting && !waiting.done) return; target = 260; api.sfx('toot'); };
      cv.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (waiting && !waiting.done) { // trykk på dyret for å la det gå på
          const sx = trainX + (waiting.at - dist); if (Math.hypot(e.clientX - (sx - 10), e.clientY - (ty - 120)) < 90 || true) {
            waiting.done = true; cars.push(waiting.e); picked++; api.star(sx, ty - 130); api.say(pick(['Velkommen om bord!', 'Tsjuu tsjuu!', 'Alle om bord!']));
            if (picked >= 8) api.later(() => api.end(), 1400); else api.later(go, 600);
          }
          return;
        }
        go();
      });
      api.say('Trykk for å kjøre toget!'); api.hand(trainX - 40, ty - 30);
      api.loop((dt, now) => {
        v += (target - v) * Math.min(1, dt * 2); dist += v * dt;
        if (!waiting && dist > station - 320) waiting = { at: station, e: pick(PAS), done: false };
        if (waiting && !waiting.done && dist > waiting.at - 40) { target = 0; v *= 0.9; if (v < 5) { v = 0; dist = Math.min(dist, waiting.at - 30); } }
        if (waiting && waiting.done && dist > waiting.at + 300) { station = waiting.at + rnd(700, 1000); waiting = null; }
        if (v > 20 && Math.random() < dt * 10) smoke.push({ x: trainX + 60, y: ty - 110, a: 1, r: 14 });
        cx.clearRect(0, 0, W, H);
        cx.font = '64px serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
        for (let i = 0; i < 6; i++) { const x = ((i * 260 - dist * 0.3) % (W + 300) + W + 300) % (W + 300) - 150; cx.fillText(i % 2 ? '⛰️' : '☁️', x, i % 2 ? H * 0.38 : H * 0.14); }
        for (let i = 0; i < 8; i++) { const x = ((i * 190 - dist * 0.7) % (W + 200) + W + 200) % (W + 200) - 100; cx.fillText(['🌳', '🌲', '🌻', '🏡'][i % 4], x, ty - 160); }
        // skinner
        cx.fillStyle = '#8a5a2b'; for (let x = -((dist) % 40); x < W; x += 40) cx.fillRect(x, ty + 30, 18, 22);
        cx.fillStyle = '#666'; cx.fillRect(0, ty + 30, W, 6); cx.fillRect(0, ty + 46, W, 6);
        // stasjon
        if (waiting) { const sx = trainX + (waiting.at - dist); cx.font = '90px serif'; cx.fillText('🏠', sx + 120, ty - 70);
          if (!waiting.done) { cx.font = '80px serif'; cx.fillText(waiting.e, sx - 10, ty - 120 + Math.sin(now / 200) * 6); if (v < 5) { cx.font = '56px serif'; cx.fillText('👆', sx + 30, ty - 60 + Math.sin(now / 250) * 8); } } }
        // røyk
        for (const s of smoke) { s.x -= 40 * dt; s.y -= 50 * dt; s.r += 20 * dt; s.a -= dt * 0.8; cx.fillStyle = `rgba(255,255,255,${Math.max(0, s.a)})`; cx.beginPath(); cx.arc(s.x, s.y, s.r, 0, 7); cx.fill(); }
        smoke = smoke.filter((s) => s.a > 0);
        // toget
        const bob = v > 5 ? Math.sin(now / 60) * 2 : 0;
        cx.font = '140px serif'; cx.save(); cx.translate(trainX, ty - 40 + bob); cx.scale(-1, 1); cx.fillText('🚂', 0, 0); cx.restore();
        cars.slice(-6).forEach((e, i) => { const x = trainX - 120 - i * 105; cx.font = '96px serif'; cx.save(); cx.translate(x, ty - 22 + bob); cx.scale(-1, 1); cx.fillText('🚃', 0, 0); cx.restore(); cx.font = '50px serif'; cx.fillText(e, x, ty - 72 + bob); });
      });
    },
  };

  root.PLAY = { META, IDS, start, stop };
})(typeof window !== 'undefined' ? window : globalThis);
