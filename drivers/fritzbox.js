/* AVM FRITZ!Box – TR-064 (port 49000). Sperrer internett per enhet med X_AVM-DE_HostFilter.
 * Slå på «Tilgang for applikasjoner» (Hjemmenett → Nettverk → Nettverksinnstillinger). */
const { request, digestRequest, xmlTag, baseUrl } = require('../net');

const SVC = {
  info: ['urn:dslforum-org:service:DeviceInfo:1', '/upnp/control/deviceinfo'],
  hosts: ['urn:dslforum-org:service:Hosts:1', '/upnp/control/hosts'],
  filter: ['urn:dslforum-org:service:X_AVM-DE_HostFilter:1', '/upnp/control/x_hostfilter'],
};

class FritzBox {
  constructor(cfg) {
    const u = new URL(baseUrl(cfg.url, 'http://192.168.178.1'));
    this.host = u.hostname;
    this.base = `http://${u.hostname}:49000`;
    this.user = cfg.user || ''; this.pass = cfg.pass || '';
  }
  async soap([service, control], action, args = {}) {
    const inner = Object.entries(args).map(([k, v]) => `<${k}>${v}</${k}>`).join('');
    const body = `<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:${action} xmlns:u="${service}">${inner}</u:${action}></s:Body></s:Envelope>`;
    const r = await digestRequest(this.base + control, { method: 'POST', body,
      headers: { 'Content-Type': 'text/xml; charset="utf-8"', SOAPAction: `${service}#${action}` } }, this.user, this.pass);
    if (r.status === 401) throw new Error('Feil brukernavn eller passord til FRITZ!Box');
    if (r.status >= 400) throw new Error('FRITZ!Box: ' + (xmlTag(r.text, 'errorDescription') || r.status));
    const out = {}; for (const m of r.text.matchAll(/<(New[\w-]+)>([^<]*)<\/\1>/g)) out[m[1]] = m[2];
    return out;
  }
  async test() {
    const i = await this.soap(SVC.info, 'GetInfo');
    return { model: i.NewModelName || 'FRITZ!Box', info: i.NewSoftwareVersion ? 'FRITZ!OS ' + i.NewSoftwareVersion : '' };
  }
  async clients() {
    const p = await this.soap(SVC.hosts, 'X_AVM-DE_GetHostListPath');
    const r = await request(this.base + p['NewX_AVM-DE_HostListPath']);
    return [...r.text.matchAll(/<Item>([\s\S]*?)<\/Item>/g)].map((m) => ({ mac: xmlTag(m[1], 'MACAddress').toUpperCase(),
      ip: xmlTag(m[1], 'IPAddress'), name: xmlTag(m[1], 'HostName'), online: xmlTag(m[1], 'Active') === '1' })).filter((c) => c.mac);
  }
  async apply(devices) {
    let changed = false; const missing = [];
    for (const d of devices) {
      let ip = '';
      try { ip = (await this.soap(SVC.hosts, 'GetSpecificHostEntry', { NewMACAddress: d.mac })).NewIPAddress; } catch {}
      if (!ip) { missing.push(d.name); continue; }
      const cur = await this.soap(SVC.filter, 'GetWANAccessByIP', { NewIPv4Address: ip });
      const blocked = cur.NewDisallow === '1';
      if (blocked !== d.block) { await this.soap(SVC.filter, 'DisallowWANAccessByIP', { NewIPv4Address: ip, NewDisallow: d.block ? 1 : 0 }); changed = true; }
    }
    if (missing.length && missing.length === devices.length) throw new Error('FRITZ!Box kjenner ikke enhetene: ' + missing.join(', '));
    return { changed, warning: missing.length ? 'Fant ikke IP for: ' + missing.join(', ') : '' };
  }
}
module.exports = FritzBox;
