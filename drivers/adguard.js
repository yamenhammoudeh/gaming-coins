/* AdGuard Home – virker med ALLE rutere.
 * Blokkerte enheter settes i AdGuards «Disallowed clients», og får ikke slått opp nettadresser.
 * Forutsetter at ruteren deler ut AdGuard Home som DNS-server (DHCP-innstillinger i ruteren). */
const { request, baseUrl, arpTable, arpWake } = require('../net');

class AdGuard {
  constructor(cfg) {
    this.url = baseUrl(cfg.url, 'http://127.0.0.1:3000');
    this.auth = 'Basic ' + Buffer.from((cfg.user || 'admin') + ':' + (cfg.pass || '')).toString('base64');
    this.memory = new Map(); // mac -> ip-er vi har blokkert
  }
  async api(method, path, body) {
    const r = await request(this.url + path, { method, headers: { Authorization: this.auth, 'Content-Type': 'application/json' }, body });
    if (r.status === 401 || r.status === 403) throw new Error('Feil brukernavn eller passord til AdGuard Home');
    if (r.status >= 400) throw new Error('AdGuard Home svarte ' + r.status + ' på ' + path);
    return r.json();
  }
  async test() {
    const s = await this.api('GET', '/control/status');
    return { model: 'AdGuard Home ' + (s.version || ''), info: s.dns_port ? 'DNS på port ' + s.dns_port : '' };
  }
  async ipMap() {
    const map = new Map();
    const add = (mac, ip) => { if (!mac || !ip) return; mac = mac.toUpperCase(); if (!map.has(mac)) map.set(mac, new Set()); map.get(mac).add(ip); };
    try { const d = await this.api('GET', '/control/dhcp/status'); for (const l of [...(d.leases || []), ...(d.static_leases || [])]) add(l.mac, l.ip); } catch {}
    for (const a of arpTable()) add(a.mac, a.ip);
    return map;
  }
  async clients() {
    await arpWake();
    const map = await this.ipMap(); const names = new Map();
    try { const c = await this.api('GET', '/control/clients'); for (const a of c.auto_clients || []) names.set(a.ip, a.name); } catch {}
    const online = new Set(arpTable().map((a) => a.mac));
    const out = [...map].map(([mac, ips]) => { const ip = [...ips][0]; return { mac, ip, name: names.get(ip) || '', online: online.has(mac) }; });
    try { const c = await this.api('GET', '/control/clients');
      for (const p of c.clients || []) for (const id of p.ids || []) if (/^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(id)) out.push({ mac: id, name: p.name }); } catch {}
    return out;
  }
  async apply(devices) {
    const list = await this.api('GET', '/control/access/list');
    const dis = new Set(list.disallowed_clients || []);
    const before = [...dis].sort().join(',');
    let map = await this.ipMap();
    if (devices.some((d) => !map.has(d.mac))) { await arpWake(); map = await this.ipMap(); }
    const missing = [];
    for (const d of devices) {
      const ips = new Set([...(map.get(d.mac) || []), ...(this.memory.get(d.mac) || [])]);
      if (!ips.size) { missing.push(d.name); continue; }
      for (const ip of ips) d.block ? dis.add(ip) : dis.delete(ip);
      this.memory.set(d.mac, d.block ? new Set(map.get(d.mac) || []) : new Set());
    }
    const after = [...dis].sort().join(',');
    if (after !== before) await this.api('POST', '/control/access/set', { ...list, disallowed_clients: [...dis] });
    return { changed: after !== before, warning: missing.length ? 'Fant ikke IP for: ' + missing.join(', ') + ' (er enheten på?)' : '' };
  }
}
module.exports = AdGuard;
