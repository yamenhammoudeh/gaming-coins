/* ASUS (Asuswrt / Asuswrt-Merlin)
 * Bruker ruterens interne web-API (samme som Asus Router-appen):
 *   login.cgi -> asus_token, appGet.cgi -> les, applyapp.cgi -> skriv.
 * Blokkering via Foreldrekontroll: MULTIFILTER_ENABLE 0 = av, 1 = tidsplan, 2 = blokker.
 * Enheter som ikke tilhører Gaming Coins røres ikke. */
const { request, baseUrl } = require('../net');

const UA = 'asusrouter-Android-DUTUtil-1.0.0.245';
const FILTER_KEYS = ['MULTIFILTER_ALL', 'MULTIFILTER_ENABLE', 'MULTIFILTER_MAC', 'MULTIFILTER_DEVICENAME',
  'MULTIFILTER_MACFILTER_DAYTIME_V2', 'MULTIFILTER_MACFILTER_DAYTIME'];
const DEFAULT_DAYTIME_V2 = 'W03E21000700<W04122000800';
const split = (v) => (v ? String(v).split('>') : []);

class Asus {
  constructor(cfg) {
    this.url = baseUrl(cfg.url, 'http://192.168.50.1');
    this.user = cfg.user || 'admin';
    this.pass = cfg.pass || '';
    this.token = null;
  }

  async login() {
    const auth = Buffer.from(this.user + ':' + this.pass).toString('base64');
    const r = await request(this.url + '/login.cgi', {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'login_authorization=' + encodeURIComponent(auth),
    });
    const j = r.json() || {};
    if (!j.asus_token) {
      const code = String(j.error_status || '');
      if (code === '7' || code === '10') throw new Error('Ruteren har sperret innlogging midlertidig (for mange forsøk). Vent noen minutter.');
      if (code === '3' || code === '2') throw new Error('Feil brukernavn eller passord til ruteren');
      throw new Error('Innlogging mot ASUS-ruteren feilet. Er dette en ASUS-ruter?');
    }
    this.token = j.asus_token;
  }

  async post(path, body, retry = true) {
    if (!this.token) await this.login();
    const r = await request(this.url + path, {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Cookie: 'asus_token=' + this.token, Referer: this.url + '/index.asp' },
      body,
    });
    const loggedOut = r.status === 401 || r.status === 403 || /error_status|Main_Login/.test(r.text);
    if (loggedOut && retry) { this.token = null; return this.post(path, body, false); }
    if (r.status >= 400 || loggedOut) throw new Error('Ruteren svarte ' + r.status + ' på ' + path);
    return r.text;
  }

  async appGet(hooks) {
    const text = await this.post('/appGet.cgi', 'hook=' + encodeURIComponent(hooks.join(';')));
    try { return JSON.parse(text); } catch {
      const out = {}; for (const m of text.matchAll(/"([A-Za-z0-9_]+)"\s*:\s*"([^"]*)"/g)) out[m[1]] = m[2];
      return out;
    }
  }

  async test() {
    const j = await this.appGet(['nvram_get(productid)', 'nvram_get(odmpid)', 'nvram_get(firmver)', 'nvram_get(buildno)', 'nvram_get(extendno)']);
    const model = 'ASUS ' + (j.odmpid || j.productid || 'ruter');
    const fw = [j.firmver, j.buildno, j.extendno].filter(Boolean).join('.');
    return { model, info: fw ? 'fastvare ' + fw : '' };
  }

  /* Henter både påloggede og kjente, avloggede enheter */
  async clients() {
    const out = [];
    const fromList = (cl, online) => {
      if (!cl || typeof cl !== 'object') return;
      const macs = cl.maclist || Object.keys(cl).filter((k) => /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/i.test(k));
      for (const mac of macs) { const c = cl[mac] || {};
        out.push({ mac, name: c.nickName || c.name || c.vendor || '', ip: c.ip || '', online: online === null ? c.isOnline === '1' : online }); }
    };
    const j = await this.appGet(['get_clientlist()']);
    fromList(j.get_clientlist, null);
    // historikk over alle enheter ruteren har sett (nyere fastvare)
    try { const db = await this.appGet(['get_clientlist_from_json_database()']); fromList(db.get_clientlist_from_json_database, false); } catch {}
    try {
      const n = await this.appGet(['nvram_get(custom_clientlist)', 'nvram_get(dhcp_staticlist)', 'nvram_get(MULTIFILTER_MAC)', 'nvram_get(MULTIFILTER_DEVICENAME)']);
      for (const e of String(n.custom_clientlist || '').split('<')) { const f = e.split('>'); if (f[1]) out.push({ mac: f[1], name: f[0] }); }
      for (const e of String(n.dhcp_staticlist || '').split('<')) { const f = e.split('>'); if (f[0]) out.push({ mac: f[0], ip: f[1] || '', name: f.slice(2).reverse().find((x) => x && !/^[\d.]+$/.test(x)) || '' }); }
      const pm = split(n.MULTIFILTER_MAC), pn = split(n.MULTIFILTER_DEVICENAME);
      pm.forEach((mac, i) => out.push({ mac, name: pn[i] || '' }));
    } catch {}
    return out;
  }

  async apply(devices) {
    const cur = await this.appGet(FILTER_KEYS.map((k) => `nvram_get(${k})`));
    const macs = split(cur.MULTIFILTER_MAC).map((m) => m.toUpperCase());
    const n = macs.length;
    const fit = (arr, fill) => { const a = arr.slice(0, n); while (a.length < n) a.push(fill); return a; };
    const enable = fit(split(cur.MULTIFILTER_ENABLE), '0');
    const names = fit(split(cur.MULTIFILTER_DEVICENAME), '');
    const v2raw = split(cur.MULTIFILTER_MACFILTER_DAYTIME_V2), v1raw = split(cur.MULTIFILTER_MACFILTER_DAYTIME);
    const useV1 = n > 0 && v1raw.length === n && v2raw.length !== n;
    const v2 = fit(v2raw, DEFAULT_DAYTIME_V2), v1 = fit(v1raw, '<');

    for (const d of devices) {
      let i = macs.indexOf(d.mac);
      if (i < 0) { macs.push(d.mac); enable.push('0'); names.push(d.name); v2.push(DEFAULT_DAYTIME_V2); v1.push('<'); i = macs.length - 1; }
      enable[i] = d.block ? '2' : '0';
      if (!names[i]) names[i] = d.name;
    }
    const next = { MULTIFILTER_ALL: '1', MULTIFILTER_ENABLE: enable.join('>'), MULTIFILTER_MAC: macs.join('>'), MULTIFILTER_DEVICENAME: names.join('>') };
    if (cur.MULTIFILTER_ALL === '1' && cur.MULTIFILTER_ENABLE === next.MULTIFILTER_ENABLE && (cur.MULTIFILTER_MAC || '').toUpperCase() === next.MULTIFILTER_MAC) return { changed: false };
    if (useV1) next.MULTIFILTER_MACFILTER_DAYTIME = v1.join('>'); else next.MULTIFILTER_MACFILTER_DAYTIME_V2 = v2.join('>');
    await this.post('/applyapp.cgi', new URLSearchParams({ action_mode: 'apply', rc_service: 'restart_firewall', ...next }).toString());
    return { changed: true };
  }
}
module.exports = Asus;
