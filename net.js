/* Gaming Coins – nettverksverktøy: HTTP-klient, skanning og modellgjenkjenning */
const http = require('http');
const https = require('https');
const dgram = require('dgram');
const dns = require('dns');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

/* ---------- HTTP-klient (tåler selvsignerte sertifikater på hjemmenettet) ---------- */
function request(url, opts = {}) {
  const { method = 'GET', headers = {}, body, timeout = 8000 } = opts;
  return new Promise((ok, bad) => {
    let u;
    try { u = new URL(url); } catch { return bad(new Error('Ugyldig adresse: ' + url)); }
    const mod = u.protocol === 'https:' ? https : http;
    const data = body == null ? null : (typeof body === 'string' || Buffer.isBuffer(body)) ? body : JSON.stringify(body);
    const h = { 'User-Agent': 'GamingCoins/1.0', ...headers };
    if (data != null) h['Content-Length'] = Buffer.byteLength(data);
    const req = mod.request(u, { method, headers: h, rejectUnauthorized: false, timeout }, (res) => {
      const chunks = [];
      res.on('data', (c) => { chunks.push(c); });
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const text = opts.binary ? '' : buffer.toString('utf8');
        const setCookie = [].concat(res.headers['set-cookie'] || []);
        ok({
          status: res.statusCode, headers: res.headers, text, buffer, url: u.href,
          json() { try { return JSON.parse(text); } catch { return null; } },
          cookie: setCookie.map((c) => c.split(';')[0]).join('; '),
        });
      });
    });
    req.on('timeout', () => req.destroy(new Error('Tidsavbrudd mot ' + u.host)));
    req.on('error', (e) => {
      const m = { ECONNREFUSED: 'svarer ikke (tilkobling avvist)', EHOSTUNREACH: 'kan ikke nås', ENOTFOUND: 'finnes ikke', ETIMEDOUT: 'svarer ikke' }[e.code];
      if (/EPROTO|wrong version number|SSL/i.test(e.message)) return bad(new Error(`${u.host} snakker ikke ${u.protocol === 'https:' ? 'https – prøv http://' : 'http – prøv https://'}`));
      bad(new Error(m ? `${u.host} ${m}` : e.message));
    });
    if (data != null) req.write(data);
    req.end();
  });
}

/* HTTP Digest (brukes av FRITZ!Box TR-064) */
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
async function digestRequest(url, opts, user, pass) {
  const first = await request(url, opts);
  const hdr = first.headers['www-authenticate'];
  if (first.status !== 401 || !hdr || !/digest/i.test(hdr)) return first;
  const p = {}; for (const m of hdr.matchAll(/(\w+)="?([^",]+)"?/g)) p[m[1].toLowerCase()] = m[2];
  const u = new URL(url), uri = u.pathname + u.search, nc = '00000001', cnonce = crypto.randomBytes(8).toString('hex');
  const ha1 = md5(`${user}:${p.realm}:${pass}`), ha2 = md5(`${opts.method || 'GET'}:${uri}`);
  const qop = p.qop ? 'auth' : null;
  const response = qop ? md5(`${ha1}:${p.nonce}:${nc}:${cnonce}:${qop}:${ha2}`) : md5(`${ha1}:${p.nonce}:${ha2}`);
  let auth = `Digest username="${user}", realm="${p.realm}", nonce="${p.nonce}", uri="${uri}", response="${response}"`;
  if (qop) auth += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
  if (p.opaque) auth += `, opaque="${p.opaque}"`;
  return request(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: auth } });
}

const xmlTag = (xml, tag) => { const m = new RegExp(`<(?:\\w+:)?${tag}>([^<]*)</(?:\\w+:)?${tag}>`, 'i').exec(xml || ''); return m ? decode(m[1].trim()) : ''; };
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const baseUrl = (u, def) => { u = String(u || def || '').trim().replace(/\/+$/, ''); if (u && !/^https?:\/\//.test(u)) u = 'http://' + u; return u; };

/* ---------- lokalt nettverk ---------- */
function gateway() {
  try {
    for (const line of fs.readFileSync('/proc/net/route', 'utf8').split('\n').slice(1)) {
      const f = line.trim().split(/\s+/);
      if (f[1] === '00000000' && f[2] && f[2] !== '00000000') {
        const h = f[2]; return [6, 4, 2, 0].map((i) => parseInt(h.substr(i, 2), 16)).join('.');
      }
    }
  } catch {}
  const ip = localIps()[0];
  return ip ? ip.replace(/\.\d+$/, '.1') : null;
}
function localIps() {
  return Object.values(os.networkInterfaces()).flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal && !/^(172\.(1[7-9]|2\d|3[01])|169\.254)\./.test(i.address))
    .map((i) => i.address);
}
function arpTable() {
  try {
    return fs.readFileSync('/proc/net/arp', 'utf8').split('\n').slice(1).map((l) => l.trim().split(/\s+/))
      .filter((f) => f.length >= 4 && f[2] === '0x2' && f[3] !== '00:00:00:00:00:00')
      .map((f) => ({ ip: f[0], mac: f[3].toUpperCase() }));
  } catch { return []; }
}
/* Fyller ARP-tabellen ved å «prikke» hver adresse i /24-nettet (UDP til port 9 – ufarlig) */
function arpWake(ms = 1500) {
  return new Promise((done) => {
    const nets = [...new Set(localIps().map((ip) => ip.replace(/\.\d+$/, '.')))].slice(0, 2);
    const sock = dgram.createSocket('udp4'); sock.on('error', () => {});
    for (const n of nets) for (let i = 1; i < 255; i++) sock.send(Buffer.from([0]), 9, n + i, () => {});
    setTimeout(() => { try { sock.close(); } catch {} done(); }, ms);
  });
}
function reverseName(ip) {
  return new Promise((ok) => { const t = setTimeout(() => ok(''), 1200); dns.reverse(ip, (e, n) => { clearTimeout(t); ok(e || !n || !n[0] ? '' : n[0].replace(/\.(lan|local|home|localdomain)$/i, '')); }); });
}
/* Enheter på nettet uten hjelp fra ruteren (brukes når ruteren ikke kan liste klienter) */
async function lanClients() {
  await arpWake();
  const list = arpTable();
  const names = await Promise.all(list.map((c) => reverseName(c.ip)));
  return list.map((c, i) => ({ mac: c.mac, ip: c.ip, name: names[i] || c.ip, online: true }));
}

/* ---------- UPnP / SSDP ---------- */
function ssdp(timeout = 2500) {
  return new Promise((done) => {
    const found = new Map();
    let sock;
    try { sock = dgram.createSocket({ type: 'udp4', reuseAddr: true }); } catch { return done([]); }
    sock.on('error', () => {});
    sock.on('message', (msg, rinfo) => {
      const loc = /^location:\s*(\S+)/im.exec(msg.toString());
      if (loc && !found.has(loc[1])) found.set(loc[1], rinfo.address);
    });
    sock.bind(() => {
      for (const st of ['urn:schemas-upnp-org:device:InternetGatewayDevice:1', 'urn:schemas-upnp-org:device:InternetGatewayDevice:2', 'upnp:rootdevice']) {
        const m = `M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nMX: 2\r\nST: ${st}\r\n\r\n`;
        for (let i = 0; i < 2; i++) sock.send(m, 1900, '239.255.255.250', () => {});
      }
    });
    setTimeout(() => { try { sock.close(); } catch {} done([...found].map(([location, ip]) => ({ location, ip }))); }, timeout);
  });
}
async function ssdpDevices() {
  const hits = await ssdp();
  const out = [];
  await Promise.all(hits.slice(0, 25).map(async (h) => {
    try {
      const r = await request(h.location, { timeout: 3000 });
      out.push({ ip: h.ip, location: h.location, friendlyName: xmlTag(r.text, 'friendlyName'), manufacturer: xmlTag(r.text, 'manufacturer'),
        modelName: xmlTag(r.text, 'modelName'), modelNumber: xmlTag(r.text, 'modelNumber'), modelDescription: xmlTag(r.text, 'modelDescription'),
        deviceType: xmlTag(r.text, 'deviceType'), raw: r.text.slice(0, 4000) });
    } catch {}
  }));
  return out;
}

/* ---------- fingeravtrykk ---------- */
const BRANDS = [
  { driver: 'asus', brand: 'ASUS', re: /asus|asuswrt|main_login\.asp|\brt-ax|\brt-ac|\bgt-ax|zenwifi/i, model: /\b((?:RT|GT|TUF|RP|ZenWiFi|GS|DSL)[-_ ]?[A-Z]{0,3}\d{2,5}[A-Z0-9_]*(?:\s?(?:Pro|Plus|Mini|XT\d|XD\d))?)\b/i },
  { driver: 'openwrt', brand: 'OpenWrt', re: /openwrt|luci|lede|gl\.inet|gl-inet|turris/i },
  { driver: 'mikrotik', brand: 'MikroTik', re: /mikrotik|routeros|webfig/i, model: /\b((?:hAP|hEX|RB\d+|CCR\d+|CRS\d+|cAP|wAP|Chateau|L009|RB5009)[\w+-]*)/i },
  { driver: 'unifi', brand: 'Ubiquiti UniFi', re: /unifi|ubiquiti|\bubnt\b/i, model: /\b(UDM[\w-]*|UDR[\w-]*|UXG[\w-]*|UCG[\w-]*|USG[\w-]*|Dream Machine[\w ]*|Cloud Gateway[\w ]*)/i },
  { driver: 'fritzbox', brand: 'AVM FRITZ!Box', re: /fritz!?\s?box|\bavm\b/i, model: /(FRITZ!Box\s?\d{4}[\w ]*)/i },
  { brand: 'TP-Link', re: /tp-?link|\bdeco\b|archer|omada/i, model: /\b((?:Archer|Deco)\s?[A-Z]{0,3}\d{1,4}[\w-]*)/i, why: 'TP-Link har kryptert innlogging og ingen åpen styring' },
  { brand: 'Netgear', re: /netgear|orbi|nighthawk/i, model: /\b((?:R|RAX|RBR|RBK|RBS|C|CAX)\d{3,5}[\w-]*)/i },
  { brand: 'Linksys', re: /linksys|velop/i },
  { brand: 'Zyxel', re: /zyxel/i, model: /\b((?:EX|VMG|DX|AX|EMG|NBG|PMG)\d{3,5}[\w-]*)/i },
  { brand: 'Huawei', re: /huawei|hg8\d{3}/i, model: /\b((?:HG|EG|WS|AX|B)\d{3,5}[\w-]*)/i },
  { brand: 'Sagemcom', re: /sagemcom|f@st/i, model: /(F@ST\s?\d{4}[\w-]*)/i },
  { brand: 'Technicolor', re: /technicolor|thomson|vantiva/i, model: /\b((?:TG|CGA|DGA)\d{3,5}[\w-]*)/i },
  { brand: 'D-Link', re: /d-?link/i, model: /\b((?:DIR|DSL|COVR|M)-?\d{2,5}[\w-]*)/i },
  { brand: 'Tenda', re: /tenda/i }, { brand: 'Xiaomi', re: /xiaomi|miwifi/i }, { brand: 'Google Nest Wifi', re: /google wifi|nest wifi|onhub/i },
  { brand: 'eero', re: /\beero\b/i }, { brand: 'Synology', re: /synology|\bsrm\b/i, model: /\b(RT\d{4}\w*|WRX\d{3}\w*|MR\d{4}\w*)/i },
  { brand: 'Keenetic', re: /keenetic/i }, { brand: 'DrayTek', re: /draytek|vigor/i }, { brand: 'Cisco', re: /cisco|meraki/i },
  { brand: 'Telenor', re: /telenor/i }, { brand: 'Telia', re: /telia/i }, { brand: 'Altibox', re: /altibox/i }, { brand: 'Get / Telia', re: /\bget\s?box/i },
];

function fingerprint(text) {
  for (const b of BRANDS) if (b.re.test(text)) {
    let model = '';
    if (b.model) { const m = b.model.exec(text); if (m) model = m[1].trim(); }
    return { brand: b.brand, driver: b.driver || null, model, why: b.why || '' };
  }
  return null;
}

async function probeHttp(ip) {
  const out = [];
  for (const proto of ['http', 'https']) {
    let url = `${proto}://${ip}/`;
    for (let hop = 0; hop < 3; hop++) {
      try {
        const r = await request(url, { timeout: 3500 });
        const title = (/<title[^>]*>([^<]*)<\/title>/i.exec(r.text) || [])[1] || '';
        out.push({ url, status: r.status, server: r.headers.server || '', title: decode(title.trim()), body: r.text.slice(0, 20000) });
        const loc = r.headers.location || (/http-equiv=["']?refresh["']?[^>]*url=([^"'>\s]+)/i.exec(r.text) || [])[1];
        if (r.status >= 300 && r.status < 400 && loc) { url = new URL(loc, url).href; if (new URL(url).hostname !== ip) break; continue; }
        if (loc && r.status === 200 && hop === 0 && r.text.length < 2000) { url = new URL(loc, url).href; continue; }
        break;
      } catch { break; }
    }
  }
  return out;
}

/* Full skann: finner ruteren og prøver å fastslå merke og modell */
async function scan(hintUrl) {
  const gw = hintUrl ? new URL(baseUrl(hintUrl)).hostname : gateway();
  const result = { gateway: gw, brand: '', model: '', driver: null, url: '', confidence: 'lav', sources: [], others: [], why: '' };
  if (!gw) { result.why = 'Fant ikke ruterens adresse'; return result; }

  const [upnp, web, fritz, mtk] = await Promise.all([
    ssdpDevices(),
    probeHttp(gw),
    request(`http://${gw}:49000/tr64desc.xml`, { timeout: 2500 }).then((r) => (r.status === 200 ? r.text : '')).catch(() => ''),
    request(`http://${gw}/rest/system/resource`, { timeout: 2500 }).then((r) => (r.status === 401 && /realm/i.test(r.headers['www-authenticate'] || '') ? r.headers['www-authenticate'] : '')).catch(() => ''),
  ]);

  // 1) UPnP-beskrivelse fra selve ruteren – mest presis modell
  const atGw = (d) => { try { return d.ip === gw || new URL(d.location).hostname === gw; } catch { return d.ip === gw; } };
  const igd = upnp.find((d) => atGw(d) && /InternetGatewayDevice/i.test(d.raw)) || upnp.find(atGw);
  if (igd) {
    const fp = fingerprint([igd.manufacturer, igd.modelName, igd.modelDescription, igd.friendlyName].join(' ')) || {};
    result.brand = fp.brand || igd.manufacturer;
    result.model = [igd.modelName, igd.modelNumber && !/^[\d.]+$/.test(igd.modelNumber) && !String(igd.modelName).includes(igd.modelNumber) ? igd.modelNumber : ''].filter(Boolean).join(' ').trim() || fp.model;
    result.driver = fp.driver || null; result.why = fp.why || '';
    result.confidence = result.model ? 'høy' : 'middels';
    result.sources.push('UPnP');
  }
  // 2) FRITZ!Box TR-064
  if (fritz) {
    result.brand = 'AVM FRITZ!Box'; result.driver = 'fritzbox';
    result.model = xmlTag(fritz, 'modelName') || xmlTag(fritz, 'friendlyName') || result.model;
    result.confidence = 'høy'; result.sources.push('TR-064');
  }
  // 3) MikroTik REST
  if (mtk && !result.driver) { result.brand = 'MikroTik'; result.driver = 'mikrotik'; result.sources.push('RouterOS REST'); result.confidence = result.model ? 'høy' : 'middels'; }
  // 4) Nettsiden til ruteren
  const webText = web.map((w) => [w.title, w.server, w.body].join(' ')).join(' ');
  const fp = fingerprint(webText);
  if (fp) {
    if (!result.brand || (!result.driver && fp.driver)) { result.brand = fp.brand; result.driver = fp.driver; result.why = fp.why; }
    if (!result.model && fp.model) result.model = fp.model;
    if (result.confidence === 'lav') result.confidence = result.model ? 'middels' : 'lav';
    result.sources.push('nettside');
  } else if (!result.brand && web.length) {
    result.brand = web.find((w) => w.title)?.title || 'Ukjent ruter';
    result.sources.push('nettside');
  }
  // UniFi kjører ofte bare på https
  if (!result.driver && /unifi/i.test(webText)) result.driver = 'unifi';

  const pref = web.find((w) => w.url.startsWith('https')) && ['unifi', 'mikrotik'].includes(result.driver) ? 'https' : 'http';
  result.url = `${pref}://${gw}`;
  result.others = upnp.filter((d) => d !== igd).map((d) => ({ ip: d.ip, name: d.friendlyName || d.modelName, manufacturer: d.manufacturer, model: d.modelName }))
    .filter((d) => d.name || d.model).slice(0, 12);
  if (!result.driver && !result.why) result.why = 'Denne ruteren har ikke et åpent grensesnitt vi kan styre';
  return result;
}

/* Slår sammen enhetslister fra flere kilder (samme MAC = samme enhet) */
const isMac = (m) => /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(m);
const weakName = (n, c) => !n || n === c.mac || n === c.ip || /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(n) || n === '*';
function mergeClients(...lists) {
  const map = new Map();
  for (const c of lists.flat()) {
    if (!c || !c.mac) continue;
    const mac = String(c.mac).toUpperCase().replace(/-/g, ':');
    if (!isMac(mac) || mac === 'FF:FF:FF:FF:FF:FF' || mac === '00:00:00:00:00:00') continue;
    const cur = map.get(mac) || { mac, name: '', ip: '', online: false, lastSeen: 0 };
    if (weakName(cur.name, cur) && !weakName(c.name, { mac, ip: c.ip })) cur.name = String(c.name).trim();
    if (!cur.ip && c.ip) cur.ip = c.ip;
    if (c.online) { cur.online = true; if (c.ip) cur.ip = c.ip; }
    if (c.lastSeen && c.lastSeen > cur.lastSeen) cur.lastSeen = c.lastSeen;
    map.set(mac, cur);
  }
  return [...map.values()].map((c) => ({ ...c, name: c.name || c.ip || c.mac }));
}

module.exports = { mergeClients, request, digestRequest, xmlTag, baseUrl, gateway, localIps, arpTable, arpWake, lanClients, ssdpDevices, fingerprint, scan };
