/* Gaming Coins – hjemmeserver
 * Start:  node server.js          (Node 18 eller nyere, ingen pakker trengs)
 * Åpne:   http://<denne-maskinens-ip>:8080 på iPad / veggskjerm
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const L = require('./public/logic.js');
const drivers = require('./drivers');
const net = require('./net');
const { sendMail } = require('./mailer');

const PORT = Number(process.env.PORT) || 8080;
const DATA = process.env.GC_DATA || path.join(__dirname, 'data', 'data.json');
const crypto = require('crypto');
fs.mkdirSync(path.dirname(DATA), { recursive: true });
// flytt gammel data.json (fra eldre versjon) inn i data-mappen
const OLD = path.join(__dirname, 'data.json');
if (!process.env.GC_DATA && !fs.existsSync(DATA) && fs.existsSync(OLD)) fs.renameSync(OLD, DATA);
const PUB = path.join(__dirname, 'public');

const IMGDIR = path.join(path.dirname(DATA), 'img');
let state;
try { state = L.migrate(JSON.parse(fs.readFileSync(DATA, 'utf8'))); console.log('Lastet', DATA); }
catch { state = L.defaultState(); console.log('Ny database opprettet. Standard foreldre-PIN: 1234'); }

function save() {
  fs.writeFileSync(DATA + '.tmp', JSON.stringify(state, null, 1));
  fs.renameSync(DATA + '.tmp', DATA);
}
save();

/* ---------- ruter-synk ---------- */
let router = null, routerKey = '', lastApplied = '', lastApplyAt = 0, syncing = false, syncAgain = false;

function getRouter() {
  const r = state.settings.router;
  const key = [r.driver, r.url, r.user, r.pass].join('|');
  if (!router || key !== routerKey) { router = drivers.create(r); routerKey = key; lastApplied = ''; }
  return router;
}

function setStatus(ok, msg) {
  const prev = state.routerStatus || {};
  if (prev.ok !== ok || prev.msg !== msg) { state.routerStatus = { ok, msg, at: Date.now() }; state.rev++; save(); }
}

async function syncRouter(force = false) {
  if (syncing) { syncAgain = true; return; }
  const r = state.settings.router;
  const devices = L.desiredDevices(state, Date.now());
  if (!r.enabled || !r.driver) { lastApplied = ''; return; }
  if (!devices.length) { setStatus(true, 'Ingen enheter lagt inn ennå'); return; }
  const key = JSON.stringify(devices);
  if (!force && key === lastApplied && Date.now() - lastApplyAt < 10 * 60e3) return;
  syncing = true;
  try {
    const res = await getRouter().apply(devices);
    lastApplied = key; lastApplyAt = Date.now();
    const open = devices.filter((d) => !d.block).length;
    setStatus(!res.warning, `${res.warning ? res.warning + ' · ' : 'OK – '}${open} åpne, ${devices.length - open} stengte enheter`);
    if (res.changed) console.log(new Date().toLocaleTimeString(), 'Ruter oppdatert:', devices.map((d) => d.name + (d.block ? ' ⛔' : ' ✅')).join(', '));
  } catch (e) {
    console.error('Ruterfeil:', e.message);
    setStatus(false, e.message);
  } finally {
    syncing = false;
    if (syncAgain) { syncAgain = false; setTimeout(syncRouter, 500); }
  }
}

/* ---------- AI-bilder (gratis via Pollinations, ingen konto nødvendig) ---------- */
const AI_BASE = process.env.GC_AI_URL || 'https://image.pollinations.ai';
const AI = { queue: [], busy: false, last: 0, done: 0, error: '' };
const AI_STYLES = {
  flat: 'cute flat vector illustration for children, bright friendly colors, simple rounded shapes',
  '3d': 'cute soft 3D cartoon render for kids, studio lighting, pastel colors',
  akvarell: 'soft watercolor children book illustration, gentle colors',
  leire: 'cute claymation style miniature scene for kids, soft light',
};
function aiStatus() {
  state.aiStatus = { pending: AI.queue.length + (AI.busy ? 1 : 0), done: AI.done, error: AI.error, at: Date.now() };
  state.rev++; save();
}
function saveImageBuffer(buf, ext) {
  const name = crypto.createHash('sha1').update(buf).digest('hex') + '.' + ext;
  fs.mkdirSync(IMGDIR, { recursive: true });
  fs.writeFileSync(path.join(IMGDIR, name), buf);
  return 'img/' + name;
}
async function aiFetch(prompt, w = 768, h = 576) {
  const cfg = state.settings.ai || {};
  let url = `${AI_BASE}/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&nologo=true&model=flux&seed=${Math.floor(Math.random() * 1e6)}`;
  const headers = cfg.key ? { Authorization: 'Bearer ' + cfg.key } : {};
  for (let hop = 0; hop < 4; hop++) {
    const r = await net.request(url, { headers, timeout: 120000, binary: true });
    if (r.status >= 300 && r.status < 400 && r.headers.location) { url = new URL(r.headers.location, url).href; continue; }
    if (r.status === 429) throw new Error('AI-tjenesten er opptatt – prøver igjen senere');
    if (r.status >= 400) throw new Error('AI-tjenesten svarte ' + r.status);
    const ct = String(r.headers['content-type'] || '');
    if (!/^image\//.test(ct) || r.buffer.length < 1000) throw new Error('AI-tjenesten sendte ikke et bilde');
    if (r.buffer.length > 6e6) throw new Error('Bildet fra AI-tjenesten var for stort');
    return saveImageBuffer(r.buffer, /png/.test(ct) ? 'png' : /webp/.test(ct) ? 'webp' : 'jpg');
  }
  throw new Error('For mange omdirigeringer fra AI-tjenesten');
}
const listFor = (kind) => kind === 'shop' ? state.shop : kind === 'fshop' ? (state.familyShop || []) : state.tasks;
async function aiWork() {
  if (AI.busy) return;
  AI.busy = true;
  try {
    while (AI.queue.length) {
      const job = AI.queue.shift();
      const list = listFor(job.kind);
      const item = job.kind === 'game' ? { title: job.name, desc: job.desc, image: (state.gameIcons || {})[job.id] } : list.find((x) => x.id === job.id);
      if (!item || (item.image && !job.force)) continue;
      // gratis-nivået tåler omtrent én forespørsel per 15 sekunder
      const gap = (state.settings.ai || {}).key ? 3000 : 16000;
      const wait = AI.last + gap - Date.now();
      aiStatus();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      AI.last = Date.now();
      const style = AI_STYLES[(state.settings.ai || {}).style] || AI_STYLES.flat;
      const prompt = job.kind === 'game'
        ? `Glossy mobile app icon for a children's learning game, ${style}, square composition with one big centered symbol for: ${item.title} – ${item.desc}. Vibrant gradient background, no text, no letters, no words, no border.`
        : `${style}. Subject: ${item.title}${item.desc ? ' – ' + item.desc : ''}. One clear centered subject, plain light background, no text, no letters, no words.`;
      try {
        const img = job.kind === 'game' ? await aiFetch(prompt, 512, 512) : await aiFetch(prompt);
        if (job.kind === 'game') { state.gameIcons = state.gameIcons || {}; state.gameIcons[job.id] = img; AI.done++; AI.error = ''; }
        else { const cur = (listFor(job.kind)).find((x) => x.id === job.id); if (cur) { cur.image = img; AI.done++; AI.error = ''; } }
      } catch (e) {
        AI.error = `${item.title}: ${e.message}`; console.error('AI-bilde:', AI.error);
        if (/opptatt/.test(e.message) && !job.retried) { AI.queue.push({ ...job, retried: true }); AI.last = Date.now() + 30000; }
      }
      aiStatus();
    }
  } finally { AI.busy = false; aiStatus(); }
}

/* ---------- e-postvarsel til foreldre ---------- */
const notified = new Set(L.pendingItems(state).map((p) => p.id)); // det som venter ved oppstart, varsles ikke på nytt
let notifyQueue = [], notifyTimer = null;
function appUrl() {
  const u = state.settings.notify.appUrl;
  if (u) return u;
  const ip = net.localIps()[0];
  return ip ? `http://${ip}:${PORT}` : '';
}
function notifyStatus(ok, msg) { state.notifyStatus = { ok, msg, at: Date.now() }; state.rev++; save(); }
function checkNotify() {
  const items = L.pendingItems(state);
  const fresh = items.filter((i) => !notified.has(i.id));
  for (const i of items) notified.add(i.id);
  if (!state.settings.notify.enabled || !fresh.length) return;
  notifyQueue.push(...fresh);
  clearTimeout(notifyTimer);
  notifyTimer = setTimeout(flushNotify, 45000); // samler flere hendelser i én e-post
}
async function flushNotify() {
  const still = new Set(L.pendingItems(state).map((p) => p.id));
  const items = notifyQueue.splice(0).filter((i) => still.has(i.id)); // allerede godkjent? da droppes den
  if (!items.length) return;
  const n = state.settings.notify, url = appUrl();
  const text = `Hei!\n\nDette venter på godkjenning i Gaming Coins:\n\n${items.map((i) => '• ' + i.text).join('\n')}\n\n` +
    (url ? `Åpne Gaming Coins: ${url}\nTrykk på «Foreldre» og skriv inn PIN-koden.\n` : 'Åpne Gaming Coins og trykk på «Foreldre».\n') +
    `\n– Gaming Coins`;
  try {
    await sendMail(n, { to: n.to, subject: items.length === 1 ? 'Gaming Coins: ' + items[0].text : `Gaming Coins: ${items.length} ting venter på godkjenning`, text });
    notifyStatus(true, `Sendte varsel om ${items.length} ${items.length === 1 ? 'ting' : 'ting'}`);
  } catch (e) { console.error('E-postfeil:', e.message); notifyStatus(false, e.message); }
}

/* ---------- enhetsliste (også enheter som er av) ---------- */
async function collectClients(wake) {
  const r = state.settings.router;
  let rt = null; try { rt = r.driver ? getRouter() : null; } catch {}
  let fromRouter = [];
  if (rt && rt.clients && (r.pass || r.driver === 'webhook')) {
    try { fromRouter = await rt.clients(); } catch (e) { if (wake) throw e; }
  }
  const lan = wake ? await net.lanClients().catch(() => []) : net.arpTable().map((a) => ({ ...a, online: true }));
  const known = Object.entries(state.knownDevices || {}).map(([mac, k]) => ({ mac, name: k.name, ip: k.ip, lastSeen: k.lastSeen }));
  const now = Date.now();
  const merged = net.mergeClients(fromRouter, lan, known);
  state.knownDevices = state.knownDevices || {};
  for (const c of merged) {
    const k = state.knownDevices[c.mac] || {};
    const goodName = c.name && c.name !== c.mac && c.name !== c.ip;
    state.knownDevices[c.mac] = { name: goodName ? c.name : (k.name || ''), ip: c.ip || k.ip || '', lastSeen: c.online ? now : (c.lastSeen || k.lastSeen || 0) };
    c.lastSeen = state.knownDevices[c.mac].lastSeen;
  }
  const macs = Object.keys(state.knownDevices);
  if (macs.length > 500) for (const m of macs.sort((a, b) => state.knownDevices[a].lastSeen - state.knownDevices[b].lastSeen).slice(0, macs.length - 500)) delete state.knownDevices[m];
  save();
  const gw = net.gateway();
  return merged.filter((c) => !gw || c.ip !== gw).sort((x, y) => (y.online - x.online) || (y.lastSeen - x.lastSeen) || String(x.name).localeCompare(String(y.name)));
}
/* Hvem er på nett? Oppdateres hvert 2. minutt for barnas enheter (brukes i status og statistikk) */
let onlineKnown = false;
async function refreshOnline() {
  const managed = new Set(L.allDevices(state).map((d) => d.mac));
  let list = [];
  try { list = await collectClients(false); onlineKnown = true; } catch { return; }
  const map = {}; let changed = false;
  for (const c of list) if (managed.has(c.mac)) map[c.mac] = { online: !!c.online, lastSeen: c.lastSeen || 0, ip: c.ip || '' };
  for (const mac of managed) {
    if (!map[mac]) map[mac] = { online: false, lastSeen: (state.knownDevices || {})[mac]?.lastSeen || 0, ip: '' };
    const old = (state.deviceOnline || {})[mac];
    if (!old || old.online !== map[mac].online) changed = true;
  }
  state.deviceOnline = map;
  if (changed) { state.rev++; save(); }
}
setInterval(() => { refreshOnline(); }, 2 * 60e3);
setTimeout(() => { refreshOnline(); }, 15e3);
// statistikk: hvert minutt
setInterval(() => {
  const set = onlineKnown ? new Set(Object.entries(state.deviceOnline || {}).filter(([, v]) => v.online).map(([m]) => m)) : null;
  L.recordUsage(state, Date.now(), set); save();
}, 60e3);

setInterval(() => {
  if (L.tick(state, Date.now())) save();
  syncRouter();
}, 5000);

/* ---------- HTTP ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((ok, bad) => {
    let b = ''; req.on('data', (c) => { b += c; if (b.length > 4e6) req.destroy(); });
    req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { bad(e); } });
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/api/state') {
      // klienten sender sin versjon – er ingenting endret, sendes bare et lite svar
      if (url.searchParams.get('rev') && Number(url.searchParams.get('rev')) === state.rev) return send(res, 200, { now: Date.now(), mode: 'server', same: true });
      return send(res, 200, { now: Date.now(), mode: 'server', state: L.publicState(state) });
    }
    // produktbilder (filnavn = innholdets hash, så de kan caches for alltid)
    const im = /^\/img\/([a-f0-9]{40}\.(webp|png|jpg))$/.exec(url.pathname);
    if (im) {
      return fs.readFile(path.join(IMGDIR, im[1]), (err, data) => {
        if (err) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg' }[im[2]], 'Cache-Control': 'public, max-age=31536000, immutable' });
        res.end(data);
      });
    }

    if (url.pathname === '/api/action' && req.method === 'POST') {
      const a = await readBody(req);
      let result = null;
      if (a.type === 'aiImage' || a.type === 'aiImagesAll' || a.type === 'aiCancel') {
        if (String(a.pin) !== String(state.settings.pin)) return send(res, 403, { error: 'Feil PIN-kode' });
        let n = 0;
        if (a.type === 'aiCancel') { AI.queue = []; aiStatus(); }
        else if (a.type === 'aiImage') { AI.queue = AI.queue.filter((q) => !(q.kind === a.kind && q.id === a.id)); AI.queue.unshift({ kind: a.kind, id: a.id, force: true }); n = 1; }
        else if (a.kind === 'game') {
          for (const gm of (Array.isArray(a.games) ? a.games : [])) {
            if (!L.GAME_IDS.includes(gm.id) || AI.queue.some((q) => q.id === gm.id)) continue;
            AI.queue.push({ kind: 'game', id: gm.id, force: true, name: String(gm.name || gm.id).slice(0, 60), desc: String(gm.desc || '').slice(0, 120) }); n++;
          }
        } else { const list = listFor(a.kind);
          for (const x of list) if (!x.image && !AI.queue.some((q) => q.id === x.id)) { AI.queue.push({ kind: a.kind, id: x.id }); n++; } }
        aiStatus(); aiWork();
        return send(res, 200, { now: Date.now(), mode: 'server', state: L.publicState(state), result: n });
      }
      if (a.type === 'notifyTest') {
        if (String(a.pin) !== String(state.settings.pin)) return send(res, 403, { error: 'Feil PIN-kode' });
        const n = state.settings.notify;
        try {
          await sendMail(n, { to: n.to, subject: 'Gaming Coins: testvarsel', text: `Hei!\n\nDette er en test fra Gaming Coins. Når barna er ferdige med oppgaver, kjøper belønninger eller vil låne coins, får du en slik e-post.\n\n${appUrl() ? 'Åpne Gaming Coins: ' + appUrl() + '\n' : ''}\n– Gaming Coins` });
          notifyStatus(true, 'Testvarsel sendt til ' + n.to);
          return send(res, 200, { now: Date.now(), mode: 'server', state: L.publicState(state), result: 'Testvarsel sendt til ' + n.to });
        } catch (e) { notifyStatus(false, e.message); return send(res, 502, { error: e.message }); }
      }
      if (a.type === 'routerTest' || a.type === 'routerClients' || a.type === 'routerScan') {
        if (String(a.pin) !== String(state.settings.pin)) return send(res, 403, { error: 'Feil PIN-kode' });
        try {
          const r = state.settings.router;
          if (a.type === 'routerScan') {
            result = await net.scan(a.url);
            state.routerScan = { ...result, at: Date.now() }; state.rev++; save();
          } else if (a.type === 'routerTest') {
            if (!r.driver) throw new Error('Velg rutertype først');
            if (!r.pass && r.driver !== 'webhook') throw new Error('Legg inn passordet først');
            const t = await getRouter().test();
            const sc = state.routerScan;
            r.model = /ruter$|Network$/.test(t.model) && sc && sc.driver === r.driver && sc.model ? `${sc.brand} ${sc.model}` : t.model;
            t.model = r.model; state.rev++; save();
            result = 'Tilkoblet: ' + t.model + (t.info ? ' · ' + t.info : '');
            setStatus(true, result);
          } else {
            const merged = await collectClients(true);
            result = merged;
          }
        } catch (e) { if (a.type === 'routerTest') setStatus(false, e.message); return send(res, 502, { error: e.message }); }
      } else {
        // produktbilde lagres som egen fil, ikke i databasen
        const imgObj = a.type === 'upsertShop' || a.type === 'upsertFamilyShop' ? a.item : a.type === 'upsertTask' ? a.task : null;
        if (imgObj && typeof imgObj.image === 'string' && imgObj.image.startsWith('data:')) {
          if (String(a.pin) !== String(state.settings.pin)) return send(res, 403, { error: 'Feil PIN-kode' });
          const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(imgObj.image);
          if (!m) return send(res, 400, { error: 'Ugyldig bilde' });
          const buf = Buffer.from(m[2], 'base64');
          if (buf.length > 1.5e6) return send(res, 400, { error: 'Bildet er for stort' });
          const name = crypto.createHash('sha1').update(buf).digest('hex') + '.' + { png: 'png', jpeg: 'jpg', webp: 'webp' }[m[1]];
          fs.mkdirSync(IMGDIR, { recursive: true });
          fs.writeFileSync(path.join(IMGDIR, name), buf);
          imgObj.image = 'img/' + name;
        }
        try { result = L.apply(state, a, Date.now()); }
        catch (e) { return send(res, e instanceof L.GameError ? 400 : 500, { error: e.message }); }
        save();
        syncRouter(a.type === 'setSettings');
        checkNotify();
      }
      return send(res, 200, { now: Date.now(), mode: 'server', state: L.publicState(state), result });
    }

    // statiske filer
    let p = decodeURIComponent(url.pathname);
    if (p === '/') p = '/index.html';
    const file = path.normalize(path.join(PUB, p));
    if (!file.startsWith(PUB)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('Ikke funnet'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  } catch (e) {
    send(res, 500, { error: e.message });
  }
}).listen(PORT, () => {
  const ips = Object.values(require('os').networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log('\n🎮 Gaming Coins kjører!');
  for (const ip of ips) console.log('   Åpne på iPad/veggskjerm:  http://' + ip + ':' + PORT);
  console.log('');
});
