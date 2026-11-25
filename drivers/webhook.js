/* Webhook / Home Assistant – virker med alt du kan automatisere.
 * Sender POST med JSON: { event: "gaming-coins", devices: [{mac, name, block}], changed: [...] }
 * Passordfeltet sendes som header X-GamingCoins-Secret.
 * Inneholder adressen {mac} eller {action}, sendes i stedet ett GET-kall per endret enhet:
 *   https://eksempel/api?mac={mac}&do={action}   ({action} = block / unblock, {name} = enhetsnavn) */
const { request, lanClients } = require('../net');

class Webhook {
  constructor(cfg) { this.url = String(cfg.url || '').trim(); this.secret = cfg.pass || ''; this.last = new Map(); }
  headers() { return { 'Content-Type': 'application/json', ...(this.secret ? { 'X-GamingCoins-Secret': this.secret } : {}) }; }
  async send(url, method, body) {
    if (!/^https?:\/\//.test(url)) throw new Error('Webhook-adressen må starte med http:// eller https://');
    const r = await request(url, { method, headers: this.headers(), body });
    if (r.status >= 400) throw new Error('Webhook svarte ' + r.status);
  }
  async test() {
    if (/\{(mac|action|name)\}/.test(this.url)) return { model: 'Webhook (GET per enhet)', info: 'Ikke sendt – blir sendt ved neste endring' };
    await this.send(this.url, 'POST', { event: 'gaming-coins-test', devices: [] });
    return { model: 'Webhook', info: 'Testmelding sendt' };
  }
  clients() { return lanClients(); }
  async apply(devices) {
    const changed = devices.filter((d) => this.last.get(d.mac) !== d.block);
    if (!changed.length) return { changed: false };
    if (/\{(mac|action|name)\}/.test(this.url)) {
      for (const d of changed) {
        const u = this.url.replace(/\{mac\}/g, encodeURIComponent(d.mac)).replace(/\{action\}/g, d.block ? 'block' : 'unblock').replace(/\{name\}/g, encodeURIComponent(d.name));
        await this.send(u, 'GET');
      }
    } else {
      await this.send(this.url, 'POST', { event: 'gaming-coins', devices, changed });
    }
    for (const d of devices) this.last.set(d.mac, d.block);
    return { changed: true };
  }
}
module.exports = Webhook;
