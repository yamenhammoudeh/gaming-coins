/* MikroTik RouterOS 7 – REST-API (/rest). Lager en drop-regel per enhet øverst i forward-kjeden
 * og slår den av/på. Krever at tjenesten www-ssl (eller www) er på under IP → Services. */
const { request, baseUrl } = require('../net');

class MikroTik {
  constructor(cfg) {
    this.url = baseUrl(cfg.url, 'https://192.168.88.1');
    this.auth = 'Basic ' + Buffer.from((cfg.user || 'admin') + ':' + (cfg.pass || '')).toString('base64');
  }
  async rest(method, path, body) {
    const r = await request(this.url + '/rest' + path, { method, headers: { Authorization: this.auth, 'Content-Type': 'application/json' }, body });
    if (r.status === 401) throw new Error('Feil brukernavn eller passord til MikroTik');
    if (r.status === 404 && path === '/system/resource') throw new Error('Fant ikke REST-API. Krever RouterOS 7 og www/www-ssl påslått.');
    const j = r.json();
    if (r.status >= 400) throw new Error('RouterOS: ' + ((j && (j.detail || j.message)) || r.status));
    return j;
  }
  async test() {
    const res = await this.rest('GET', '/system/resource');
    const rb = await this.rest('GET', '/system/routerboard').catch(() => ({}));
    return { model: 'MikroTik ' + (rb.model || res['board-name'] || ''), info: 'RouterOS ' + (res.version || '') };
  }
  async clients() {
    const leases = await this.rest('GET', '/ip/dhcp-server/lease');
    return leases.filter((l) => l['mac-address']).map((l) => ({ mac: l['mac-address'].toUpperCase(), ip: l.address || '',
      name: l.comment || l['host-name'] || l['mac-address'], online: l.status === 'bound' }));
  }
  async apply(devices) {
    const rules = await this.rest('GET', '/ip/firewall/filter');
    const first = rules[0] && rules[0]['.id'];
    let changed = false;
    for (const d of devices) {
      const comment = 'gaming-coins:' + d.mac;
      const r = rules.find((x) => x.comment === comment);
      if (!r) {
        const made = await this.rest('PUT', '/ip/firewall/filter', { chain: 'forward', 'src-mac-address': d.mac, action: 'drop',
          comment, disabled: d.block ? 'false' : 'true' });
        if (first && made && made['.id']) await this.rest('POST', '/ip/firewall/filter/move', { numbers: made['.id'], destination: first }).catch(() => {});
        changed = true;
      } else {
        const blocking = !(r.disabled === 'true' || r.disabled === true);
        if (blocking !== d.block) { await this.rest('PATCH', '/ip/firewall/filter/' + encodeURIComponent(r['.id']), { disabled: d.block ? 'false' : 'true' }); changed = true; }
      }
    }
    return { changed };
  }
}
module.exports = MikroTik;
