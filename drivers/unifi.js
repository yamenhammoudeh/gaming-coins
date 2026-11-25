/* Ubiquiti UniFi – UniFi OS (Dream Machine, Cloud Gateway, UDR) og egen UniFi Network-kontroller.
 * Blokkerer/åpner enheten i klientlisten (block-sta / unblock-sta). Bruk en LOKAL admin-konto. */
const { request, baseUrl } = require('../net');

class UniFi {
  constructor(cfg) {
    const raw = String(cfg.url || '').trim();
    this.url = baseUrl(raw && !/^https?:\/\//.test(raw) ? 'https://' + raw : raw, 'https://192.168.1.1');
    this.user = cfg.user || ''; this.pass = cfg.pass || ''; this.site = cfg.site || 'default';
    this.cookie = null; this.csrf = null; this.os = true;
  }
  async login() {
    const body = { username: this.user, password: this.pass, remember: true };
    let r = await request(this.url + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    if (r.status === 200) { this.os = true; this.cookie = r.cookie; this.csrf = r.headers['x-csrf-token'] || r.headers['x-updated-csrf-token'] || null; return; }
    const osStatus = r.status;
    r = await request(this.url + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    if (r.status === 200) { this.os = false; this.cookie = r.cookie; this.csrf = null; return; }
    if ([400, 401, 403].includes(osStatus) || [400, 401].includes(r.status)) throw new Error('Feil brukernavn eller passord (bruk en lokal UniFi-konto, ikke skykonto)');
    throw new Error('Fant ikke UniFi-innlogging på ' + this.url);
  }
  async api(method, path, body, retry = true) {
    if (!this.cookie) await this.login();
    const headers = { 'Content-Type': 'application/json', Cookie: this.cookie };
    if (this.csrf) headers['X-CSRF-Token'] = this.csrf;
    const r = await request(this.url + (this.os ? '/proxy/network' : '') + path, { method, headers, body });
    if ((r.status === 401 || r.status === 403) && retry) { this.cookie = null; return this.api(method, path, body, false); }
    if (r.headers['x-updated-csrf-token']) this.csrf = r.headers['x-updated-csrf-token'];
    const j = r.json();
    if (r.status >= 400 || (j && j.meta && j.meta.rc === 'error')) throw new Error('UniFi: ' + ((j && j.meta && j.meta.msg) || r.status));
    return (j && j.data) || [];
  }
  async test() {
    const devs = await this.api('GET', `/api/s/${this.site}/stat/device`);
    const gw = devs.find((d) => ['ugw', 'udm', 'uxg', 'ucg'].includes(d.type)) || devs[0];
    return { model: 'UniFi ' + (gw ? (gw.model_name || gw.name || gw.model) + (gw.model && gw.name ? ` (${gw.model})` : '') : 'Network'),
      info: gw && gw.version ? 'versjon ' + gw.version : '' };
  }
  async clients() {
    const sta = await this.api('GET', `/api/s/${this.site}/stat/sta`);
    const out = sta.map((s) => ({ mac: s.mac, name: s.name || s.hostname, ip: s.ip || '', online: true }));
    // alle kjente klienter, også de som er avlogget
    try { const all = await this.api('GET', `/api/s/${this.site}/rest/user`);
      for (const u of all) out.push({ mac: u.mac, name: u.name || u.hostname, ip: u.fixed_ip || u.last_ip || '', lastSeen: u.last_seen ? u.last_seen * 1000 : 0 }); } catch {}
    return out;
  }
  async apply(devices) {
    const users = await this.api('GET', `/api/s/${this.site}/rest/user`);
    let changed = false;
    for (const d of devices) {
      const mac = d.mac.toLowerCase();
      const u = users.find((x) => x.mac === mac);
      if (!!(u && u.blocked) !== d.block) {
        await this.api('POST', `/api/s/${this.site}/cmd/stamgr`, { cmd: d.block ? 'block-sta' : 'unblock-sta', mac });
        changed = true;
      }
    }
    return { changed };
  }
}
module.exports = UniFi;
