/* OpenWrt (og rutere basert på OpenWrt: GL.iNet, Turris m.fl.)
 * Bruker ubus JSON-RPC på /ubus (følger med LuCI). Lager én brannmurregel per enhet
 * (lan -> wan, src_mac, REJECT) og slår den av/på. */
const { request, baseUrl } = require('../net');
const NOSESSION = '00000000000000000000000000000000';

class OpenWrt {
  constructor(cfg) {
    this.url = baseUrl(cfg.url, 'http://192.168.1.1');
    this.user = cfg.user || 'root';
    this.pass = cfg.pass || '';
    this.sid = null;
  }
  async rpc(sid, obj, method, params) {
    const r = await request(this.url + '/ubus', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: { jsonrpc: '2.0', id: 1, method: 'call', params: [sid, obj, method, params || {}] } });
    const j = r.json();
    if (!j) throw new Error('Ruteren svarte ikke på /ubus. Er dette OpenWrt med LuCI?');
    return j;
  }
  async login() {
    const j = await this.rpc(NOSESSION, 'session', 'login', { username: this.user, password: this.pass });
    const res = j.result || [];
    if (res[0] !== 0 || !res[1]) throw new Error('Feil brukernavn eller passord til OpenWrt');
    this.sid = res[1].ubus_rpc_session;
  }
  async call(obj, method, params, retry = true) {
    if (!this.sid) await this.login();
    const j = await this.rpc(this.sid, obj, method, params);
    const code = j.error ? j.error.code : (j.result || [])[0];
    if ((code === -32002 || code === 6) && retry) { this.sid = null; return this.call(obj, method, params, false); }
    if (j.error) throw new Error(`OpenWrt: ${obj}.${method} – ${j.error.message}`);
    if (code !== 0) throw new Error(`OpenWrt: ${obj}.${method} feilet (kode ${code})`);
    return (j.result || [])[1] || {};
  }
  async test() {
    const b = await this.call('system', 'board');
    return { model: b.model || 'OpenWrt-ruter', info: (b.release && b.release.description) || '' };
  }
  async clients() {
    const out = [];
    let leases = [];
    try { const l = await this.call('luci-rpc', 'getDHCPLeases'); leases = l.dhcp_leases || []; } catch {}
    const active = new Set(leases.map((l) => String(l.macaddr || '').toUpperCase()));
    for (const l of leases) out.push({ mac: l.macaddr, name: l.hostname, ip: l.ipaddr, online: true });
    try {
      const h = await this.call('luci-rpc', 'getHostHints');
      for (const [mac, v] of Object.entries(h)) out.push({ mac, name: v.name, ip: (v.ipaddrs || v.ipv4 || [])[0] || '', online: active.size ? active.has(mac.toUpperCase()) : true });
    } catch (e) { if (!leases.length) throw e; }
    // faste DHCP-tildelinger (kjente enheter, også når de er av)
    try {
      const d = (await this.call('uci', 'get', { config: 'dhcp' })).values || {};
      for (const s of Object.values(d)) if (s['.type'] === 'host' && s.mac) for (const mac of [].concat(s.mac).join(' ').split(/\s+/)) out.push({ mac, name: s.name, ip: s.ip });
    } catch {}
    return out;
  }
  async apply(devices) {
    const cur = (await this.call('uci', 'get', { config: 'firewall' })).values || {};
    let changed = false;
    for (const d of devices) {
      const sec = 'gc_' + d.mac.replace(/:/g, '').toLowerCase();
      const want = d.block ? '1' : '0';
      if (!cur[sec]) {
        await this.call('uci', 'add', { config: 'firewall', type: 'rule', name: sec,
          values: { name: 'GamingCoins ' + d.name, src: 'lan', src_mac: d.mac, dest: 'wan', proto: 'all', target: 'REJECT', enabled: want } });
        changed = true;
      } else if (cur[sec].enabled !== want) {
        await this.call('uci', 'set', { config: 'firewall', section: sec, values: { enabled: want } });
        changed = true;
      }
    }
    if (changed) await this.call('uci', 'commit', { config: 'firewall' });
    return { changed };
  }
}
module.exports = OpenWrt;
