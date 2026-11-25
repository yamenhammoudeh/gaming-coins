/* Gaming Coins – felles spillogikk (brukes av både serveren og nettleseren i demo-modus) */
(function (root, factory) {
  const L = factory();
  if (typeof module === 'object' && module.exports) module.exports = L;
  else root.GCLogic = L;
})(typeof self !== 'undefined' ? self : this, function () {
  const uid = () => Math.random().toString(36).slice(2, 10);
  const pad = (n) => String(n).padStart(2, '0');
  const DAYS = ['Søndag', 'Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag'];
  const CATS = { daglig: 'Hver dag', skole: 'Skole og læring', hjemme: 'Hjelp hjemme', ute: 'Ute og aktivitet', stort: 'Store oppdrag', familie: 'Familieoppdrag 💎' };
  const REPEATS = { daily: 'Én gang per dag', weekly: 'Én gang per uke', unlimited: 'Så ofte du vil' };
  const PARENT = new Set(['verifyPin', 'approve', 'reject', 'adjust', 'upsertKid', 'deleteKid',
    'upsertTask', 'deleteTask', 'upsertShop', 'deleteShop', 'setSchedule', 'setSettings', 'resetAll',
    'stopPlay', 'routerTest', 'routerClients', 'routerScan', 'fulfillReward', 'refundReward',
    'loanParentApprove', 'loanCancel', 'notifyTest', 'gameAccess', 'gameAccessAll', 'gameAccessSet', 'setDeviceRule', 'upsertGroup', 'deleteGroup', 'aiImage', 'aiImagesAll', 'aiCancel', 'gameIconsClear', 'addTasks', 'upsertFamilyShop', 'deleteFamilyShop', 'familyAdjust', 'autoReview', 'autoCheat']);
  // handlinger et barn gjør selv – krever barnets PIN hvis barnet har en
  const KID_ACTS = new Set(['take', 'done', 'cancel', 'buy', 'play', 'gameReward', 'familyDonate', 'familyBuy', 'loanRequest', 'loanAnswer', 'loanRepay', 'verifyKidPin']);

  /* Ikon: emoji/tekst (maks 16 tegn) eller et opplastet bilde som data-URL */
  const ICON_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
  function cleanIcon(v) {
    v = String(v || '');
    if (v.startsWith('data:')) { if (!ICON_RE.test(v) || v.length > 300000) throw new GameError('Bildet er for stort eller ugyldig'); return v; }
    return v.slice(0, 16);
  }
  /* Produktbilde: sti til fil på serveren (img/…) eller data-URL (demo) */
  const IMG_PATH = /^img\/[a-f0-9]{16,64}\.(webp|png|jpg)$/;
  function cleanImage(v) {
    v = String(v || '');
    if (!v || IMG_PATH.test(v)) return v;
    if (ICON_RE.test(v) && v.length < 1600000) return v;
    throw new GameError('Bildet er for stort eller ugyldig');
  }
  const GAME_IDS = ['count', 'abc', 'words', 'rhyme', 'letter', 'math', 'clock', 'times', 'english', 'capitals',
    'monster', 'storst', 'tiervenner', 'parodde', 'dobbel', 'tallrekke', 'penger', 'tid', 'former', 'maal', 'avrund', 'romer', 'brok', 'likning', 'negativ', 'prosent',
    'forste', 'motsatt', 'flertall', 'alfaord', 'ordklasse', 'kalender', 'engno', 'engfarger', 'dyreunger', 'farger', 'trafikk', 'natur', 'rommet', 'flagg'];
  class GameError extends Error {}
  const fail = (m) => { throw new GameError(m); };

  function dayKey(t) { const d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function weekKey(t) { const d = new Date(t); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return dayKey(d.getTime()); }
  function mins(hhmm) { const [h, m] = String(hhmm || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); }

  function newKid(name, avatar, color) {
    return { id: uid(), name, avatar, color, coins: 30, lifetime: 0, bankSec: 0, playing: null,
      streak: 0, lastDoneDay: null, devices: [] };
  }

  function defaultFamilyShop() {
    const F = (emoji, title, cost, desc) => ({ id: uid(), emoji, title, cost, desc });
    return [
      F('🍿', 'Filmkveld med snacks', 60, 'Hele familien ser film sammen – barna velger filmen.'),
      F('🏊', 'Tur i svømmehallen', 150, 'Bading og sklie for hele familien.'),
      F('🎳', 'Bowling', 180, 'Bowling og pizza etterpå.'),
      F('🎪', 'Leos Lekeland', 200, 'En hel ettermiddag på Leos Lekeland.'),
      F('🏡', 'Helg på hytta', 400, 'Fredag til søndag på hytta – bål, tur og kos.'),
      F('🇸🇪', 'Tur til Sverige', 600, 'Dagstur til Sverige med handletur og godteri.'),
    ];
  }
  /* legg diamanter i familiepotten */
  function addGems(s, kidId, gems, text, now) {
    if (!gems) return;
    s.family.gems = Math.max(0, s.family.gems + gems);
    if (kidId && gems > 0) s.family.by[kidId] = (s.family.by[kidId] || 0) + gems;
    s.family.log.unshift({ t: now, kidId: kidId || '', text, gems });
    if (s.family.log.length > 80) s.family.log.length = 80;
  }

  // oppdrag som gir diamanter til familiepotten i stedet for coins
  function defaultFamilyTasks() {
    const T = (emoji, title, gems, deadlineMin, repeat) => ({ id: uid(), emoji, title, coins: gems, deadlineMin, category: 'familie', repeat, kidIds: [] });
    return [
      T('🛋️', 'Rydd stua for hele familien', 8, 30, 'daily'),
      T('🍳', 'Lag middag sammen med en voksen', 15, 90, 'daily'),
      T('🚗', 'Vask bilen', 20, 60, 'weekly'),
      T('🤝', 'Hjelp søsken med lekser', 10, 45, 'daily'),
      T('🧺', 'Brett klesvasken til alle', 10, 30, 'unlimited'),
      T('🌳', 'Rake løv eller måke snø', 20, 60, 'weekly'),
    ];
  }

  function defaultState() {
    const T = (emoji, title, coins, deadlineMin, category, repeat) =>
      ({ id: uid(), emoji, title, coins, deadlineMin, category, repeat, kidIds: [] });
    const day = (from, to) => ({ on: true, from, to });
    return {
      rev: 1,
      kids: [newKid('Adam', '🦖', '#19c3e6'), newKid('Sara', '🦄', '#ff6fae')],
      tasks: [
        T('🪥', 'Puss tennene – morgen', 5, 10, 'daglig', 'daily'),
        T('🪥', 'Puss tennene – kveld', 5, 10, 'daglig', 'daily'),
        T('🛏️', 'Re opp sengen', 5, 10, 'daglig', 'daily'),
        T('📚', 'Gjør leksene', 20, 60, 'daglig', 'daily'),
        T('📖', 'Les i 20 minutter', 15, 30, 'daglig', 'daily'),
        T('🧸', 'Rydd rommet', 15, 30, 'hjemme', 'daily'),
        T('🍽️', 'Dekk eller rydd bordet', 8, 15, 'hjemme', 'daily'),
        T('🗑️', 'Ta ut søpla', 10, 15, 'hjemme', 'daily'),
        T('🧽', 'Vask ute / på terrassen', 30, 60, 'hjemme', 'weekly'),
        T('👨‍🍳', 'Hjelp til med middagen', 25, 60, 'hjemme', 'daily'),
        T('🥾', 'Bli med mamma eller pappa på tur', 50, 180, 'stort', 'unlimited'),
        T('🔨', 'Hjelp til med et prosjekt', 60, 180, 'stort', 'unlimited'),
      ].concat(defaultFamilyTasks()),
      famTasksAdded: true,
      shop: [
        { id: uid(), emoji: '🎮', title: 'Kort runde', minutes: 15, cost: 20 },
        { id: uid(), emoji: '🕹️', title: 'Halvtime', minutes: 30, cost: 35 },
        { id: uid(), emoji: '🚀', title: 'En hel time', minutes: 60, cost: 60 },
        { id: uid(), emoji: '🏆', title: 'Mega-økt', minutes: 120, cost: 110 },
        { id: uid(), kind: 'reward', emoji: '🍕', title: 'Velge middag', minutes: 0, cost: 80 },
        { id: uid(), kind: 'reward', emoji: '🍔', title: 'Tur på McDonald\'s', minutes: 0, cost: 150 },
        { id: uid(), kind: 'reward', emoji: '🎬', title: 'Kinotur', minutes: 0, cost: 200 },
        { id: uid(), kind: 'reward', emoji: '🛏️', title: 'Overnatte hos fetteren', minutes: 0, cost: 250 },
      ].map((it) => ({ kind: 'time', ...it })),
      settings: {
        pin: '1234', latePct: 50, override: 'auto',
        // indeks 0 = søndag
        schedule: [day('10:00', '20:00'), day('16:00', '20:00'), day('16:00', '20:00'), day('16:00', '20:00'),
          day('16:00', '20:00'), day('15:00', '21:00'), day('09:00', '21:00')],
        router: { enabled: false, driver: '', url: '', user: '', pass: '', model: '' },
        games: { enabled: true, coinsPerCorrect: 1, perfectBonus: 3, dailyCap: 30, off: [] },
        loans: { enabled: true, needParent: false, maxAmount: 100 },
        ai: { style: 'flat', key: '' },
        notify: { enabled: false, to: '', host: '', port: 587, user: '', pass: '', from: '', appUrl: '' },
        // familiepotten: diamanter alle barna samler sammen
        family: { enabled: true, gamesGems: 1, taskPct: 10, coinsPerGem: 10, dailyCap: 10 },
        // automatisk godkjenning: mode off | all | some
        auto: { mode: 'off', kidIds: [], minPct: 25, penaltyCoins: 20, penaltyBlockMin: 15 },
      },
      family: { gems: 40, by: {}, log: [] },
      familyShop: defaultFamilyShop(),
      gameIcons: {}, devRules: {}, groups: [], stats: { days: {} }, deviceOnline: {},
      jobs: [], rewards: [], loans: [], log: [], routerStatus: null,
    };
  }

  function migrate(s) {
    const needFamTasks = !s.famTasksAdded;
    const d = defaultState();
    for (const k of Object.keys(d)) if (s[k] === undefined) s[k] = d[k];
    for (const k of Object.keys(d.settings)) if (s.settings[k] === undefined) s.settings[k] = d.settings[k];
    // eldre versjoner støttet bare ASUS
    if (s.settings.router.driver === undefined) s.settings.router.driver = s.settings.router.pass ? 'asus' : '';
    for (const k of Object.keys(d.settings.router)) if (s.settings.router[k] === undefined) s.settings.router[k] = d.settings.router[k];
    for (const it of s.shop) if (!it.kind) it.kind = 'time';
    for (const k of ['games', 'loans', 'notify', 'ai', 'family', 'auto']) s.settings[k] = { ...d.settings[k], ...(s.settings[k] || {}) };
    if (!Array.isArray(s.loans)) s.loans = [];
    if (!s.devRules || typeof s.devRules !== 'object') s.devRules = {};
    if (!Array.isArray(s.groups)) s.groups = [];
    if (!s.stats || !s.stats.days) s.stats = { days: {} };
    if (!s.deviceOnline) s.deviceOnline = {};
    if (!s.gameIcons || typeof s.gameIcons !== 'object') s.gameIcons = {};
    if (!s.family || typeof s.family !== 'object') s.family = { gems: 0, by: {}, log: [] };
    if (!s.family.by) s.family.by = {}; if (!Array.isArray(s.family.log)) s.family.log = [];
    if (!Array.isArray(s.familyShop)) s.familyShop = defaultFamilyShop();
    if (needFamTasks) { s.tasks.push(...defaultFamilyTasks()); s.famTasksAdded = true; }
    return s;
  }

  /* ---------- spilletid / tidsvindu ---------- */
  function windowInfo(s, now) {
    const o = s.settings.override;
    if (o === 'allOpen') return { open: true, label: 'Åpent (overstyrt av foreldre)' };
    if (o === 'allLocked') return { open: false, label: 'Stengt (overstyrt av foreldre)' };
    const d = new Date(now), sch = s.settings.schedule[d.getDay()];
    const m = d.getHours() * 60 + d.getMinutes();
    if (sch && sch.on && m >= mins(sch.from) && m < mins(sch.to)) {
      const end = new Date(now); end.setHours(0, mins(sch.to), 0, 0);
      return { open: true, endsAt: end.getTime(), label: 'Spilletid åpen til ' + sch.to };
    }
    // finn neste åpning
    for (let i = 0; i < 8; i++) {
      const dd = new Date(now); dd.setDate(dd.getDate() + i);
      const sc = s.settings.schedule[dd.getDay()];
      if (!sc || !sc.on) continue;
      dd.setHours(0, mins(sc.from), 0, 0);
      if (dd.getTime() > now) return { open: false, opensAt: dd.getTime(),
        label: 'Stengt – åpner ' + (i === 0 ? 'kl. ' : i === 1 ? 'i morgen ' : DAYS[dd.getDay()].toLowerCase() + ' ') + sc.from };
    }
    return { open: false, label: 'Stengt' };
  }

  function bankLeft(kid, now) {
    if (!kid.playing) return kid.bankSec;
    return Math.max(0, kid.bankSec - (now - kid.playing.since) / 1000);
  }

  function log(s, kidId, text, coins, now) {
    s.log.unshift({ t: now, kidId, text, coins: coins || 0 });
    if (s.log.length > 300) s.log.length = 300;
  }

  /* ---------- tick: utløpte frister, forbruk av spilletid ---------- */
  function tick(s, now) {
    let changed = false;
    for (const j of s.jobs) {
      if (j.status === 'active' && now > j.deadline) {
        j.status = 'expired'; changed = true;
        log(s, j.kidId, 'Tiden gikk ut: ' + j.title, 0, now);
      }
    }
    const win = windowInfo(s, now);
    for (const k of s.kids) {
      if (k.blockedUntil && k.blockedUntil <= now) { delete k.blockedUntil; changed = true; }
      if (k.playing && k.blockedUntil > now) { k.bankSec = bankLeft(k, now); k.playing = null; changed = true; }
      if (!k.playing) continue;
      k.bankSec = bankLeft(k, now); k.playing.since = now;
      if (k.bankSec <= 0 || !win.open) {
        k.playing = null; changed = true;
        log(s, k.id, k.bankSec <= 0 ? 'Spilletiden er brukt opp' : 'Spilletid satt på pause (stengt nå)', 0, now);
      }
    }
    const cutoff = now - 14 * 864e5;
    const before = s.jobs.length;
    s.jobs = s.jobs.filter((j) => j.status === 'active' || j.status === 'pending' || j.takenAt > cutoff);
    if (s.jobs.length !== before) changed = true;
    if (s.loans) { const lb = s.loans.length; s.loans = s.loans.filter((l) => ['requested', 'parent', 'active'].includes(l.status) || (l.doneAt || l.at) > now - 60 * 864e5); if (s.loans.length !== lb) changed = true; }
    if (s.rewards) { const rb = s.rewards.length; s.rewards = s.rewards.filter((r) => r.status === 'pending' || r.at > now - 60 * 864e5); if (s.rewards.length !== rb) changed = true; }
    if (changed) s.rev++;
    return changed;
  }

  function taskAvailable(s, task, kid, now) {
    if (task.kidIds && task.kidIds.length && !task.kidIds.includes(kid.id)) return false;
    const mine = s.jobs.filter((j) => j.taskId === task.id && j.kidId === kid.id);
    if (mine.some((j) => j.status === 'active' || j.status === 'pending')) return false;
    if (task.repeat === 'daily') return !mine.some((j) => j.status === 'approved' && dayKey(j.takenAt) === dayKey(now));
    if (task.repeat === 'weekly') return !mine.some((j) => j.status === 'approved' && weekKey(j.takenAt) === weekKey(now));
    return true;
  }

  function transferLoan(s, l, lender, borrower, now) {
    lender.coins -= l.amount; borrower.coins += l.amount;
    l.status = 'active'; l.startedAt = now; l.history.push({ t: now, amount: l.amount, type: 'loan' });
    log(s, borrower.id, `Lånte ${l.amount} coins av ${lender.name}`, l.amount, now);
    log(s, lender.id, `Lånte bort ${l.amount} coins til ${borrower.name}`, -l.amount, now);
  }
  /* Alt som venter på en voksen (brukes til varsler) */
  function pendingItems(s) {
    const name = (id) => (s.kids.find((k) => k.id === id) || {}).name || '?';
    return [
      ...s.jobs.filter((j) => j.status === 'pending').map((j) => ({ id: 'job:' + j.id, text: `${name(j.kidId)} er ferdig med «${j.title}» (+${j.coins} ${j.family ? 'diamanter til familien' : 'coins'})` })),
      ...(s.rewards || []).filter((r) => r.status === 'pending').map((r) => ({ id: 'rew:' + r.id, text: r.family ? `Familien har kjøpt «${r.title}» for ${r.cost} diamanter${r.kidId ? ' (valgt av ' + name(r.kidId) + ')' : ''}` : `${name(r.kidId)} har kjøpt belønningen «${r.title}»` })),
      ...s.jobs.filter((j) => j.auto && !j.reviewed && j.status === 'approved').map((j) => ({ id: 'auto:' + j.id, text: `${name(j.kidId)}: «${j.title}» ble godkjent automatisk (+${j.awarded} ${j.family ? 'diamanter' : 'coins'}) – sjekk at det stemmer`, info: true })),
      ...(s.loans || []).filter((l) => l.status === 'parent').map((l) => ({ id: 'loan:' + l.id, text: `${name(l.borrowerId)} vil låne ${l.amount} coins av ${name(l.lenderId)}` })),
    ];
  }
  function level(lifetime) { return { lvl: Math.floor(lifetime / 100) + 1, pct: lifetime % 100 }; }

  /* ---------- handlinger ---------- */
  function apply(s, a, now) {
    if (PARENT.has(a.type) && String(a.pin) !== String(s.settings.pin)) fail('Feil PIN-kode');
    tick(s, now);
    const kid = (id) => s.kids.find((k) => k.id === id) || fail('Fant ikke barnet');
    const job = (id) => s.jobs.find((j) => j.id === id) || fail('Fant ikke oppgaven');
    let result = null;
    // barnets egen PIN (foreldre-PIN går også)
    if (KID_ACTS.has(a.type)) {
      let kidId = a.kidId;
      if (a.type === 'done' || a.type === 'cancel') kidId = (s.jobs.find((x) => x.id === a.jobId) || {}).kidId;
      if (a.type === 'loanAnswer') kidId = ((s.loans || []).find((x) => x.id === a.loanId) || {}).lenderId;
      if (a.type === 'loanRepay') kidId = ((s.loans || []).find((x) => x.id === a.loanId) || {}).borrowerId;
      const kk = s.kids.find((x) => x.id === kidId);
      if (kk && kk.pin && String((a.kidPins || {})[kk.id]) !== kk.pin && String(a.pin) !== String(s.settings.pin)) fail(`Feil PIN for ${kk.name}`);
    }
    const approveJob = (j, pct, auto) => {
      const amount = Math.round(j.coins * pct / 100), k = kid(j.kidId);
      j.status = 'approved'; j.awarded = amount; if (auto) { j.auto = true; j.reviewed = false; }
      if (j.family) {
        // familieoppdrag: hele belønningen går som diamanter til potten
        const today = dayKey(now), yest = dayKey(now - 864e5);
        if (k.lastDoneDay !== today) { k.streak = k.lastDoneDay === yest ? k.streak + 1 : 1; k.lastDoneDay = today; }
        addGems(s, k.id, amount, `${k.name}: ${j.title}`, now); j.gems = amount;
        log(s, k.id, `${auto ? 'Godkjent automatisk' : 'Godkjent'}: ${j.title} (+${amount} 💎 til familien)`, 0, now);
        return amount;
      }
      k.coins += amount; k.lifetime += amount;
      const today = dayKey(now), yest = dayKey(now - 864e5);
      if (k.lastDoneDay !== today) { k.streak = k.lastDoneDay === yest ? k.streak + 1 : 1; k.lastDoneDay = today; }
      log(s, k.id, (auto ? 'Godkjent automatisk: ' : 'Godkjent: ') + j.title, amount, now);
      const fc = s.settings.family, gm = fc.enabled ? Math.round(amount * fc.taskPct / 100) : 0;
      if (gm) { addGems(s, k.id, gm, `${k.name}: ${j.title}`, now); j.gems = gm; }
      return amount;
    };

    switch (a.type) {
      case 'take': {
        const k = kid(a.kidId), t = s.tasks.find((x) => x.id === a.taskId) || fail('Oppgaven finnes ikke');
        if (!taskAvailable(s, t, k, now)) fail('Denne oppgaven er allerede tatt');
        if (s.jobs.filter((j) => j.kidId === k.id && j.status === 'active').length >= 3) fail('Du har allerede 3 oppgaver i gang – fullfør én først!');
        const j = { id: uid(), taskId: t.id, kidId: k.id, title: t.title, emoji: t.emoji, coins: t.coins, family: t.category === 'familie' || undefined,
          takenAt: now, deadline: now + t.deadlineMin * 60000, doneAt: null, status: 'active' };
        s.jobs.push(j); log(s, k.id, 'Tok oppgaven: ' + t.title, 0, now); result = j.id; break;
      }
      case 'done': {
        const j = job(a.jobId);
        if (j.status !== 'active') fail('Oppgaven er ikke aktiv');
        j.status = 'pending'; j.doneAt = now;
        const ac = s.settings.auto, t = s.tasks.find((x) => x.id === j.taskId);
        const on = ac.mode === 'all' || (ac.mode === 'some' && (ac.kidIds || []).includes(j.kidId));
        // «smart»: må ha brukt en rimelig del av tiden, og være innenfor fristen
        const need = Math.max(60000, (t ? t.deadlineMin : (j.deadline - j.takenAt) / 60000) * 60000 * ac.minPct / 100);
        if (on && now <= j.deadline && now - j.takenAt >= need) { result = { auto: true, amount: approveJob(j, 100, true) }; break; }
        if (on && now - j.takenAt < need) j.flag = 'fast';
        log(s, j.kidId, 'Ferdig – venter på godkjenning: ' + j.title, 0, now); break;
      }
      case 'cancel': {
        const j = job(a.jobId);
        if (j.status !== 'active') fail('Kan ikke avbryte');
        s.jobs = s.jobs.filter((x) => x !== j); break;
      }
      case 'buy': {
        const k = kid(a.kidId), it = s.shop.find((x) => x.id === a.itemId) || fail('Finnes ikke i butikken');
        if (k.coins < it.cost) fail('Du trenger ' + (it.cost - k.coins) + ' coins til');
        k.coins -= it.cost;
        if (it.kind === 'reward') {
          s.rewards.push({ id: uid(), kidId: k.id, itemId: it.id, emoji: it.emoji, title: it.title, cost: it.cost, at: now, status: 'pending' });
          log(s, k.id, 'Kjøpte belønning: ' + it.title, -it.cost, now);
        } else {
          k.bankSec += it.minutes * 60;
          log(s, k.id, 'Kjøpte ' + it.minutes + ' min spilletid', -it.cost, now);
        }
        break;
      }
      case 'play': {
        const k = kid(a.kidId);
        if (a.on) {
          if (k.blockedUntil > now) fail('Internett er stengt en stund – prøv igjen kl. ' + pad(new Date(k.blockedUntil).getHours()) + ':' + pad(new Date(k.blockedUntil).getMinutes()));
          if (k.bankSec < 1) fail('Du har ingen spilletid – kjøp i butikken!');
          const w = windowInfo(s, now);
          if (!w.open) fail(w.label);
          if (!k.playing) { k.playing = { since: now }; log(s, k.id, 'Startet spilling', 0, now); }
        } else if (k.playing) {
          k.bankSec = bankLeft(k, now); k.playing = null; log(s, k.id, 'Satte spilling på pause', 0, now);
        }
        break;
      }
      /* ----- familiepotten ----- */
      case 'familyDonate': {
        const k = kid(a.kidId), fc = s.settings.family;
        if (!fc.enabled) fail('Familiepotten er slått av');
        const gems = Math.floor(Number(a.gems) || 0);
        if (gems < 1 || gems > 100) fail('Ugyldig antall');
        const cost = gems * fc.coinsPerGem;
        if (k.coins < cost) fail(`Du trenger ${cost} coins for ${gems} 💎`);
        k.coins -= cost; log(s, k.id, `Ga ${gems} 💎 til familien`, -cost, now);
        addGems(s, k.id, gems, `${k.name} ga ${cost} coins`, now); result = gems; break;
      }
      case 'familyBuy': {
        if (!s.settings.family.enabled) fail('Familiepotten er slått av');
        const it = s.familyShop.find((x) => x.id === a.itemId) || fail('Finnes ikke i familiebutikken');
        if (s.family.gems < it.cost) fail(`Familien mangler ${it.cost - s.family.gems} 💎`);
        const by = a.kidId && s.kids.some((x) => x.id === a.kidId) ? a.kidId : '';
        s.family.gems -= it.cost;
        s.rewards.push({ id: uid(), family: true, kidId: by, itemId: it.id, emoji: it.emoji, image: it.image || '', title: it.title, cost: it.cost, at: now, status: 'pending' });
        s.family.log.unshift({ t: now, kidId: by, text: 'Kjøpte: ' + it.title, gems: -it.cost }); break;
      }
      case 'familyAdjust': {
        const gm = Math.round(Number(a.gems) || 0);
        addGems(s, '', gm, gm > 0 ? 'Bonus fra mamma og pappa' : 'Trekk fra mamma og pappa', now); break;
      }
      case 'upsertFamilyShop': {
        const src = a.item || {};
        let it = s.familyShop.find((x) => x.id === src.id);
        if (!it) { it = { id: uid(), emoji: '🎉', title: 'Ny familietur', cost: 200, desc: '' }; s.familyShop.push(it); }
        if (src.title !== undefined) it.title = String(src.title).slice(0, 40);
        if (src.emoji !== undefined) it.emoji = cleanIcon(src.emoji);
        if (src.image !== undefined) it.image = cleanImage(src.image);
        if (src.desc !== undefined) it.desc = String(src.desc).slice(0, 300);
        if (src.cost !== undefined) it.cost = Math.max(1, Math.round(Number(src.cost) || 1));
        s.familyShop.sort((x, y) => x.cost - y.cost); result = it.id; break;
      }
      case 'deleteFamilyShop': s.familyShop = s.familyShop.filter((x) => x.id !== a.itemId); break;
      /* ----- foreldre ----- */
      case 'verifyPin': break;
      case 'verifyKidPin': kid(a.kidId); break;
      case 'approve': {
        const j = job(a.jobId);
        if (j.status !== 'pending') fail('Allerede behandlet');
        approveJob(j, Math.max(0, Math.min(200, Number(a.pct ?? 100)))); break;
      }
      case 'autoReview': {
        const j = job(a.jobId); j.reviewed = true; break;
      }
      case 'autoCheat': {
        const j = job(a.jobId), k = kid(j.kidId), ac = s.settings.auto;
        if (j.status !== 'approved') fail('Oppgaven er ikke godkjent');
        const got = j.family ? 0 : (j.awarded || 0), back = got + ac.penaltyCoins;
        k.coins = Math.max(0, k.coins - back); k.lifetime = Math.max(0, k.lifetime - got);
        if (j.gems) s.family.gems = Math.max(0, s.family.gems - j.gems);
        j.status = 'rejected'; j.cheat = true; j.reviewed = true;
        log(s, k.id, `Ikke gjort likevel: ${j.title}${ac.penaltyCoins ? ` (straff ${ac.penaltyCoins} coins)` : ''}`, -back, now);
        if (ac.penaltyBlockMin > 0) {
          k.blockedUntil = Math.max(k.blockedUntil || 0, now) + ac.penaltyBlockMin * 60000;
          if (k.playing) { k.bankSec = bankLeft(k, now); k.playing = null; }
          log(s, k.id, `Internett stengt i ${ac.penaltyBlockMin} min`, 0, now);
        }
        break;
      }
      case 'reject': {
        const j = job(a.jobId);
        if (j.status !== 'pending') fail('Allerede behandlet');
        j.status = 'rejected'; log(s, j.kidId, 'Ikke godkjent: ' + j.title, 0, now); break;
      }
      case 'adjust': {
        const k = kid(a.kidId);
        if (a.coins) { k.coins = Math.max(0, k.coins + Number(a.coins)); if (a.coins > 0) k.lifetime += Number(a.coins);
          log(s, k.id, a.coins > 0 ? 'Bonus fra foreldre' : 'Trekk fra foreldre', Number(a.coins), now); }
        if (a.minutes) { k.bankSec = Math.max(0, bankLeft(k, now) + Number(a.minutes) * 60); if (k.playing) k.playing.since = now; }
        break;
      }
      case 'fulfillReward': case 'refundReward': {
        const r = s.rewards.find((x) => x.id === a.rewardId) || fail('Fant ikke belønningen');
        if (r.status !== 'pending') fail('Allerede behandlet');
        r.doneAt = now;
        if (a.type === 'fulfillReward') { r.status = 'done'; if (!r.family) log(s, r.kidId, 'Belønning innfridd: ' + r.title, 0, now); }
        else if (r.family) { r.status = 'refunded'; s.family.gems += r.cost; s.family.log.unshift({ t: now, kidId: '', text: 'Avlyst, diamantene er tilbake: ' + r.title, gems: r.cost }); }
        else { r.status = 'refunded'; const k = s.kids.find((x) => x.id === r.kidId); if (k) k.coins += r.cost;
          log(s, r.kidId, 'Belønning avlyst, coins tilbake: ' + r.title, r.cost, now); }
        break;
      }
      /* ----- læringsspill ----- */
      case 'gameReward': {
        const k = kid(a.kidId), g = s.settings.games;
        if (!g.enabled) fail('Læringsspill er slått av');
        const off = g.off || [], gm = String(a.game || ''), lv = String(a.level || '');
        if (gm && (off.includes(k.id + '|' + gm) || (lv && off.includes(`${k.id}|${gm}:${lv}`)))) fail('Dette spillet er ikke åpnet for deg');
        const total = Math.round(Number(a.total)), correct = Math.round(Number(a.correct));
        if (!(total >= 5 && total <= 20) || !(correct >= 0 && correct <= total)) fail('Ugyldig runde');
        const started = Number(a.startedAt);
        if (!started || now - started < total * 800 || now - started > 3600e3) fail('Runden gikk for fort – prøv igjen');
        const today = dayKey(now);
        if (k.gameDay !== today) { k.gameDay = today; k.gameCoins = 0; }
        const want = correct * g.coinsPerCorrect + (correct === total ? g.perfectBonus : 0);
        const amount = Math.max(0, Math.min(want, g.dailyCap - k.gameCoins));
        k.gameCoins += amount; k.coins += amount; k.lifetime += amount;
        log(s, k.id, `${String(a.name || 'Læringsspill').slice(0, 30)}: ${correct} av ${total} riktige`, amount, now);
        let gems = 0; const fc = s.settings.family;
        if (fc.enabled && fc.gamesGems > 0 && correct >= Math.ceil(total * 0.8)) {
          if (k.gemDay !== today) { k.gemDay = today; k.gemsToday = 0; }
          gems = Math.max(0, Math.min(fc.gamesGems * (correct === total ? 2 : 1), fc.dailyCap - k.gemsToday));
          if (gems) { k.gemsToday += gems; addGems(s, k.id, gems, `${k.name}: ${String(a.name || 'Læringsspill').slice(0, 30)} – ${correct} av ${total}`, now); }
        }
        result = { amount, capped: amount < want, left: g.dailyCap - k.gameCoins, gems }; break;
      }
      /* ----- lån mellom barn ----- */
      case 'loanRequest': {
        const cfg = s.settings.loans; if (!cfg.enabled) fail('Lån er slått av');
        const from = kid(a.lenderId), to = kid(a.kidId), amount = Math.round(Number(a.amount));
        if (from.id === to.id) fail('Du kan ikke låne av deg selv');
        if (!(amount >= 1 && amount <= cfg.maxAmount)) fail('Beløpet må være mellom 1 og ' + cfg.maxAmount);
        if (s.loans.some((l) => l.borrowerId === to.id && l.lenderId === from.id && ['requested', 'parent'].includes(l.status))) fail('Du har allerede en forespørsel til ' + from.name);
        const l = { id: uid(), borrowerId: to.id, lenderId: from.id, amount, paid: 0, note: String(a.note || '').slice(0, 80), status: 'requested', at: now, history: [] };
        s.loans.push(l); log(s, to.id, `Spurte ${from.name} om å låne ${amount} coins`, 0, now); result = l.id; break;
      }
      case 'loanAnswer': {
        const l = s.loans.find((x) => x.id === a.loanId) || fail('Fant ikke lånet');
        if (l.status !== 'requested') fail('Forespørselen er allerede besvart');
        const lender = kid(l.lenderId), borrower = kid(l.borrowerId);
        if (!a.yes) { l.status = 'declined'; l.doneAt = now; log(s, borrower.id, `${lender.name} sa nei til lånet`, 0, now); break; }
        if (lender.coins < l.amount) fail(`${lender.name} har bare ${lender.coins} coins`);
        if (s.settings.loans.needParent) { l.status = 'parent'; log(s, borrower.id, `${lender.name} sa ja – venter på foreldre`, 0, now); break; }
        transferLoan(s, l, lender, borrower, now); break;
      }
      case 'loanParentApprove': {
        const l = s.loans.find((x) => x.id === a.loanId) || fail('Fant ikke lånet');
        if (l.status !== 'parent') fail('Lånet venter ikke på godkjenning');
        if (!a.yes) { l.status = 'declined'; l.doneAt = now; log(s, l.borrowerId, 'Foreldre sa nei til lånet', 0, now); break; }
        const lender = kid(l.lenderId), borrower = kid(l.borrowerId);
        if (lender.coins < l.amount) fail(`${lender.name} har ikke nok coins lenger`);
        transferLoan(s, l, lender, borrower, now); break;
      }
      case 'loanRepay': {
        const l = s.loans.find((x) => x.id === a.loanId) || fail('Fant ikke lånet');
        if (l.status !== 'active') fail('Lånet er ikke aktivt');
        const borrower = kid(l.borrowerId), lender = kid(l.lenderId);
        const left = l.amount - l.paid;
        const amount = Math.min(left, Math.round(Number(a.amount) || left));
        if (amount < 1) fail('Ugyldig beløp');
        if (borrower.coins < amount) fail(`Du har bare ${borrower.coins} coins`);
        borrower.coins -= amount; lender.coins += amount; l.paid += amount;
        l.history.push({ t: now, amount, type: 'repay' });
        log(s, borrower.id, `Betalte tilbake ${amount} coins til ${lender.name}`, -amount, now);
        log(s, lender.id, `${borrower.name} betalte tilbake ${amount} coins`, amount, now);
        if (l.paid >= l.amount) { l.status = 'repaid'; l.doneAt = now; }
        break;
      }
      case 'loanCancel': {
        const l = s.loans.find((x) => x.id === a.loanId) || fail('Fant ikke lånet');
        if (['requested', 'parent'].includes(l.status)) { l.status = 'cancelled'; l.doneAt = now; }
        else if (l.status === 'active') { l.status = 'forgiven'; l.doneAt = now; log(s, l.borrowerId, `Foreldre slettet resten av lånet (${l.amount - l.paid} coins)`, 0, now); }
        else fail('Lånet er allerede avsluttet');
        break;
      }
      case 'gameAccessSet': {
        const k = kid(a.kidId), g = s.settings.games; g.off = (Array.isArray(g.off) ? g.off : []).filter((x) => !x.startsWith(k.id + '|'));
        for (const id of (a.offGames || [])) if (GAME_IDS.includes(id)) g.off.push(k.id + '|' + id);
        break;
      }
      case 'gameAccess': case 'gameAccessAll': {
        const k = kid(a.kidId), g = s.settings.games; g.off = Array.isArray(g.off) ? g.off : [];
        if (a.type === 'gameAccessAll') { g.off = g.off.filter((x) => !x.startsWith(k.id + '|')); if (!a.on) for (const id of GAME_IDS) g.off.push(k.id + '|' + id); break; }
        const gm = String(a.game || ''); if (!GAME_IDS.includes(gm)) fail('Ukjent spill');
        const key = a.level ? `${k.id}|${gm}:${String(a.level).slice(0, 12)}` : `${k.id}|${gm}`;
        g.off = g.off.filter((x) => x !== key);
        if (a.level && a.on) g.off = g.off.filter((x) => x !== `${k.id}|${gm}`); // åpner et nivå = åpner spillet
        if (!a.on) g.off.push(key);
        break;
      }
      case 'setDeviceRule': {
        const mac = String(a.mac || '').toUpperCase();
        if (!allDevices(s).some((d) => d.mac === mac)) fail('Fant ikke enheten');
        const r = (s.devRules[mac] = s.devRules[mac] || {}), p = a.patch || {};
        if (p.mode !== undefined) { if (p.mode && p.mode !== 'inherit' && !MODES[p.mode]) fail('Ukjent modus'); r.mode = p.mode === 'inherit' ? '' : p.mode; }
        if (p.groupId !== undefined) { if (p.groupId && !s.groups.some((g) => g.id === p.groupId)) fail('Fant ikke gruppen'); r.groupId = p.groupId || ''; }
        if (p.schedule !== undefined) r.schedule = p.schedule ? validSched(p.schedule) : null;
        break;
      }
      case 'upsertGroup': {
        const src = a.group || {};
        let g = s.groups.find((x) => x.id === src.id);
        if (!g) { g = { id: uid(), name: 'Ny gruppe', mode: 'auto', schedule: null }; s.groups.push(g); }
        if (src.name !== undefined) g.name = String(src.name).slice(0, 30) || 'Gruppe';
        if (src.mode !== undefined) { if (!MODES[src.mode]) fail('Ukjent modus'); g.mode = src.mode; }
        if (src.schedule !== undefined) g.schedule = src.schedule ? validSched(src.schedule) : null;
        result = g.id; break;
      }
      case 'deleteGroup': s.groups = s.groups.filter((g) => g.id !== a.groupId); for (const r of Object.values(s.devRules)) if (r.groupId === a.groupId) r.groupId = ''; break;
      case 'gameIconsClear': if (a.id) delete s.gameIcons[a.id]; else s.gameIcons = {}; break;
      case 'notifyTest': break; // håndteres av serveren
      case 'stopPlay': { const k = kid(a.kidId); if (k.playing) { k.bankSec = bankLeft(k, now); k.playing = null; } break; }
      case 'upsertKid': {
        const src = a.kid || {};
        let k = s.kids.find((x) => x.id === src.id);
        if (!k) { k = newKid(src.name || 'Nytt barn', src.avatar || '🐼', src.color || '#ffb020'); s.kids.push(k); }
        for (const f of ['name', 'color']) if (src[f] !== undefined) k[f] = String(src[f]).slice(0, 40);
        if (src.avatar !== undefined) k.avatar = cleanIcon(src.avatar);
        if (src.pin !== undefined) { const p = String(src.pin || ''); if (p && !/^\d{4}$/.test(p)) fail('Barnets PIN må være 4 siffer'); k.pin = p; }
        if (Array.isArray(src.devices)) k.devices = src.devices.map((d) => ({ name: String(d.name || '').slice(0, 40),
          mac: String(d.mac || '').toUpperCase().replace(/-/g, ':').trim() }));
        result = k.id; break;
      }
      case 'deleteKid': delete s.family.by[a.kidId]; s.loans = (s.loans || []).filter((l) => l.borrowerId !== a.kidId && l.lenderId !== a.kidId); s.kids = s.kids.filter((k) => k.id !== a.kidId); s.jobs = s.jobs.filter((j) => j.kidId !== a.kidId); break;
      case 'upsertTask': {
        const src = a.task || {};
        let t = s.tasks.find((x) => x.id === src.id);
        if (!t) { t = { id: uid(), emoji: '⭐', title: 'Ny oppgave', coins: 10, deadlineMin: 30, category: 'hjemme', repeat: 'daily', kidIds: [] }; s.tasks.push(t); }
        for (const f of ['title', 'category', 'repeat', 'age']) if (src[f] !== undefined) t[f] = String(src[f]).slice(0, 60);
        if (src.emoji !== undefined) t.emoji = cleanIcon(src.emoji);
        if (src.image !== undefined) t.image = cleanImage(src.image);
        for (const f of ['coins', 'deadlineMin']) if (src[f] !== undefined) t[f] = Math.max(1, Math.round(Number(src[f]) || 1));
        if (Array.isArray(src.kidIds)) t.kidIds = src.kidIds;
        result = t.id; break;
      }
      case 'addTasks': {
        const added = [];
        for (const src of (Array.isArray(a.tasks) ? a.tasks : []).slice(0, 100)) {
          const t = { id: uid(), emoji: cleanIcon(src.emoji || '⭐'), title: String(src.title || 'Ny oppgave').slice(0, 60),
            coins: Math.max(1, Math.round(Number(src.coins) || 5)), deadlineMin: Math.max(1, Math.round(Number(src.deadlineMin) || 30)),
            category: CATS[src.category] ? src.category : 'hjemme', repeat: REPEATS[src.repeat] ? src.repeat : 'daily',
            kidIds: Array.isArray(src.kidIds) ? src.kidIds.filter((id) => s.kids.some((k) => k.id === id)) : [], age: String(src.age || '').slice(0, 12) };
          s.tasks.push(t); added.push(t.id);
        }
        result = added.length; break;
      }
      case 'deleteTask': s.tasks = s.tasks.filter((t) => t.id !== a.taskId); break;
      case 'upsertShop': {
        const src = a.item || {};
        let it = s.shop.find((x) => x.id === src.id);
        if (!it) { it = src.kind === 'reward' ? { id: uid(), kind: 'reward', emoji: '🎁', title: 'Ny belønning', minutes: 0, cost: 100 }
          : { id: uid(), kind: 'time', emoji: '🎮', title: 'Ny pakke', minutes: 30, cost: 30 }; s.shop.push(it); }
        if (src.kind === 'time' || src.kind === 'reward') it.kind = src.kind;
        if (src.title !== undefined) it.title = String(src.title).slice(0, 40);
        if (src.emoji !== undefined) it.emoji = cleanIcon(src.emoji);
        if (src.image !== undefined) it.image = cleanImage(src.image);
        if (src.desc !== undefined) it.desc = String(src.desc).slice(0, 300);
        for (const f of ['minutes', 'cost']) if (src[f] !== undefined) it[f] = Math.max(1, Math.round(Number(src[f]) || 1));
        s.shop.sort((x, y) => (x.kind === y.kind ? 0 : x.kind === 'time' ? -1 : 1) || (x.kind === 'time' ? x.minutes - y.minutes : x.cost - y.cost)); result = it.id; break;
      }
      case 'deleteShop': s.shop = s.shop.filter((x) => x.id !== a.itemId); break;
      case 'setSchedule': Object.assign(s.settings.schedule[a.day], a.patch || {}); break;
      case 'setSettings': {
        const p = a.patch || {};
        if (p.pin !== undefined) { if (!/^\d{4,8}$/.test(p.pin)) fail('PIN må være 4–8 siffer'); s.settings.pin = p.pin; }
        if (p.latePct !== undefined) s.settings.latePct = Math.max(0, Math.min(100, Number(p.latePct) || 0));
        if (p.override !== undefined) s.settings.override = p.override;
        const num = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
        if (p.games) { const g = s.settings.games; if (!Array.isArray(g.off)) g.off = [];
          if (p.games.enabled !== undefined) g.enabled = !!p.games.enabled;
          if (p.games.coinsPerCorrect !== undefined) g.coinsPerCorrect = num(p.games.coinsPerCorrect, 0, 20);
          if (p.games.perfectBonus !== undefined) g.perfectBonus = num(p.games.perfectBonus, 0, 100);
          if (p.games.dailyCap !== undefined) g.dailyCap = num(p.games.dailyCap, 0, 1000); }
        if (p.loans) { const lc = s.settings.loans;
          if (p.loans.enabled !== undefined) lc.enabled = !!p.loans.enabled;
          if (p.loans.needParent !== undefined) lc.needParent = !!p.loans.needParent;
          if (p.loans.maxAmount !== undefined) lc.maxAmount = num(p.loans.maxAmount, 1, 10000); }
        if (p.ai) { const ai = s.settings.ai;
          if (p.ai.style !== undefined && ['flat', '3d', 'akvarell', 'leire'].includes(p.ai.style)) ai.style = p.ai.style;
          if (p.ai.key) ai.key = String(p.ai.key).trim().slice(0, 200);
          if (p.ai.clearKey) ai.key = ''; }
        if (p.auto) { const ac = s.settings.auto;
          if (p.auto.mode !== undefined && ['off', 'all', 'some'].includes(p.auto.mode)) ac.mode = p.auto.mode;
          if (Array.isArray(p.auto.kidIds)) ac.kidIds = p.auto.kidIds.filter((id) => s.kids.some((k) => k.id === id));
          if (p.auto.minPct !== undefined) ac.minPct = num(p.auto.minPct, 0, 100);
          if (p.auto.penaltyCoins !== undefined) ac.penaltyCoins = num(p.auto.penaltyCoins, 0, 10000);
          if (p.auto.penaltyBlockMin !== undefined) ac.penaltyBlockMin = num(p.auto.penaltyBlockMin, 0, 1440); }
        if (p.family) { const fc = s.settings.family;
          if (p.family.enabled !== undefined) fc.enabled = !!p.family.enabled;
          if (p.family.gamesGems !== undefined) fc.gamesGems = num(p.family.gamesGems, 0, 20);
          if (p.family.taskPct !== undefined) fc.taskPct = num(p.family.taskPct, 0, 100);
          if (p.family.coinsPerGem !== undefined) fc.coinsPerGem = num(p.family.coinsPerGem, 1, 1000);
          if (p.family.dailyCap !== undefined) fc.dailyCap = num(p.family.dailyCap, 0, 500); }
        if (p.notify) { const n = s.settings.notify;
          for (const f of ['to', 'host', 'user', 'from', 'appUrl']) if (p.notify[f] !== undefined) n[f] = String(p.notify[f]).trim().slice(0, 300);
          if (p.notify.port !== undefined) n.port = num(p.notify.port, 1, 65535);
          if (p.notify.enabled !== undefined) n.enabled = !!p.notify.enabled;
          if (p.notify.pass) n.pass = String(p.notify.pass); }
        if (p.router) {
          const r = s.settings.router;
          if (p.router.driver !== undefined && p.router.driver !== r.driver) { r.driver = p.router.driver; r.model = ''; if (!p.router.pass) r.pass = ''; }
          for (const f of ['enabled', 'url', 'user']) if (p.router[f] !== undefined) r[f] = typeof p.router[f] === 'string' ? p.router[f].trim() : p.router[f];
          if (p.router.pass) r.pass = p.router.pass;
        }
        break;
      }
      case 'resetAll': { const d = defaultState(); d.settings.pin = s.settings.pin; d.rev = s.rev; Object.assign(s, d); break; }
      default: fail('Ukjent handling: ' + a.type);
    }
    tick(s, now);
    s.rev++;
    return result;
  }

  /* Hvilke enheter skal ha internett nå? */
  /* ---------- enheter: regler, grupper og tidsplaner ---------- */
  const MODES = { auto: 'Coins (spilletid)', schedule: 'Fast åpningstid', open: 'Alltid åpen', block: 'Alltid stengt' };
  function inSchedule(sched, now) {
    const d = new Date(now), sc = sched && sched[d.getDay()];
    if (!sc || !sc.on) return false;
    const m = d.getHours() * 60 + d.getMinutes();
    return m >= mins(sc.from) && m < mins(sc.to);
  }
  const validSched = (x) => Array.isArray(x) && x.length === 7 ? x.map((d) => ({ on: !!(d && d.on), from: /^\d\d:\d\d$/.test(d && d.from) ? d.from : '16:00', to: /^\d\d:\d\d$/.test(d && d.to) ? d.to : '20:00' })) : null;
  /* Hvorfor er en enhet åpen eller stengt akkurat nå? */
  function deviceStatus(s, now, kid, mac) {
    const o = s.settings.override;
    if (o === 'allOpen') return { open: true, reason: 'Alt åpent (overstyrt)' };
    if (o === 'allLocked') return { open: false, reason: 'Alt stengt (overstyrt)' };
    if (kid && kid.blockedUntil > now) { const d = new Date(kid.blockedUntil); return { open: false, mode: 'penalty', reason: `Stengt som straff til ${pad(d.getHours())}:${pad(d.getMinutes())}` }; }
    const rule = (s.devRules || {})[mac] || {};
    const group = rule.groupId ? (s.groups || []).find((g) => g.id === rule.groupId) : null;
    let mode = rule.mode || 'inherit';
    if (mode === 'inherit') mode = (group && group.mode) || 'auto';
    const sched = rule.schedule || (group && group.schedule) || null;
    const src = rule.schedule ? 'enhetens' : group && group.schedule ? `gruppens (${group.name})` : 'felles';
    if (mode === 'block') return { open: false, mode, reason: 'Alltid stengt' + (group && !rule.mode ? ` (gruppe ${group.name})` : '') };
    if (mode === 'open') return { open: true, mode, reason: 'Alltid åpen' + (group && !rule.mode ? ` (gruppe ${group.name})` : '') };
    if (mode === 'schedule') {
      const inside = inSchedule(sched || s.settings.schedule, now);
      return { open: inside, mode, reason: inside ? `Innenfor ${src} åpningstid` : `Utenfor ${src} åpningstid` };
    }
    // auto: barnet må spille, innenfor felles spilletid OG enhetens/gruppens åpningstid (hvis satt)
    const w = windowInfo(s, now);
    if (sched && !inSchedule(sched, now)) return { open: false, mode, reason: `Utenfor ${src} åpningstid` };
    if (!w.open) return { open: false, mode, reason: 'Utenfor felles spilletid' };
    if (!kid || !kid.playing) return { open: false, mode, reason: 'Ingen spilletid startet' };
    return { open: true, mode, reason: `${kid.name} spiller nå` };
  }
  function allDevices(s) {
    const out = [];
    for (const k of s.kids) for (const d of k.devices || []) if (/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(d.mac)) out.push({ kid: k, mac: d.mac, name: d.name || 'Enhet' });
    return out;
  }
  function desiredDevices(s, now) {
    return allDevices(s).map(({ kid, mac, name }) => ({ mac, name: (kid.name + '-' + name).replace(/[<>]/g, '').slice(0, 30), block: !deviceStatus(s, now, kid, mac).open }));
  }
  /* ---------- statistikk: kalles hvert minutt ---------- */
  function recordUsage(s, now, onlineMacs) {
    const day = dayKey(now), h = new Date(now).getHours();
    const D = (s.stats.days[day] = s.stats.days[day] || { dev: {}, play: {} });
    for (const { kid, mac } of allDevices(s)) {
      const st = deviceStatus(s, now, kid, mac);
      const online = onlineMacs ? onlineMacs.has(mac) : null;
      const r = (D.dev[mac] = D.dev[mac] || { open: 0, online: 0, used: 0, hours: Array(24).fill(0), kid: kid.id });
      if (st.open) r.open++;
      if (online) r.online++;
      if (st.open && (online === null || online)) { r.used++; r.hours[h]++; }
    }
    for (const k of s.kids) if (k.playing) D.play[k.id] = (D.play[k.id] || 0) + 1;
    const keys = Object.keys(s.stats.days).sort();
    while (keys.length > 35) delete s.stats.days[keys.shift()];
    s.rev++;
  }

  function publicState(s) {
    const c = JSON.parse(JSON.stringify(s));
    delete c.settings.pin;
    delete c.knownDevices;
    for (const k of c.kids) { k.hasPin = !!k.pin; delete k.pin; }
    c.settings.notify.hasPass = !!(s.settings.notify && s.settings.notify.pass);
    c.settings.notify.pass = '';
    c.settings.ai.hasKey = !!(s.settings.ai && s.settings.ai.key);
    c.settings.ai.key = '';
    c.settings.router.hasPass = !!s.settings.router.pass;
    c.settings.router.pass = '';
    return c;
  }

  return { GAME_IDS, MODES, deviceStatus, allDevices, recordUsage, inSchedule, pendingItems, defaultState, migrate, apply, tick, windowInfo, bankLeft, taskAvailable, desiredDevices,
    publicState, level, dayKey, DAYS, CATS, REPEATS, PARENT, GameError };
});
