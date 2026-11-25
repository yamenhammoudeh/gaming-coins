/* Gaming Coins – liten SMTP-klient uten ekstra pakker.
 * Port 465 = kryptert fra start (SSL/TLS), port 587 = STARTTLS. Innlogging med AUTH LOGIN.
 * Gmail: bruk et «app-passord» (Google-konto → Sikkerhet → App-passord), ikke vanlig passord. */
const net = require('net');
const tls = require('tls');
const crypto = require('crypto');

const b64 = (s) => Buffer.from(String(s), 'utf8').toString('base64');
const addr = (s) => { const m = /<([^>]+)>/.exec(s || ''); return (m ? m[1] : String(s || '')).trim(); };
const encWord = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
const wrap = (s) => s.replace(/.{1,76}/g, '$&\r\n');

function sendMail(cfg, { to, subject, text }) {
  const host = cfg.host, port = Number(cfg.port) || 587, secure = port === 465;
  const recipients = String(to || '').split(/[,;\s]+/).map(addr).filter((x) => /@/.test(x));
  const from = cfg.from || cfg.user;
  if (!host) return Promise.reject(new Error('Mangler e-postserver (SMTP)'));
  if (!recipients.length) return Promise.reject(new Error('Mangler mottaker-adresse'));
  if (!/@/.test(addr(from))) return Promise.reject(new Error('Mangler avsender-adresse'));

  return new Promise((resolve, reject) => {
    let sock, buf = '', replies = [], waiting = null, done = false;
    const fail = (e) => { if (done) return; done = true; try { sock.destroy(); } catch {} reject(e); };
    const onData = (d) => {
      buf += d.toString('utf8');
      let m;
      while ((m = /^(?:\d{3}-[^\r\n]*\r\n)*\d{3}(?: [^\r\n]*)?\r\n/.exec(buf))) {
        replies.push(m[0]); buf = buf.slice(m[0].length);
      }
      if (waiting && replies.length) { const w = waiting; waiting = null; w(replies.shift()); }
    };
    const read = () => new Promise((r) => { if (replies.length) r(replies.shift()); else waiting = r; });
    const cmd = async (line, expect) => {
      if (line != null) sock.write(line + '\r\n');
      const r = await read();
      const code = Number(r.slice(0, 3));
      if (expect && !expect.includes(code)) {
        const msg = r.trim().split('\r\n').pop();
        if (code === 535 || code === 534) throw new Error('E-postserveren godtok ikke brukernavn/passord (' + msg + ')');
        throw new Error('E-postserveren svarte: ' + msg);
      }
      return r;
    };
    const attach = (s) => {
      s.on('data', onData);
      s.on('error', (e) => fail(new Error('Kunne ikke koble til ' + host + ':' + port + ' – ' + e.message)));
      s.setTimeout(20000, () => fail(new Error('Tidsavbrudd mot e-postserveren')));
    };
    sock = secure ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
    attach(sock);

    (async () => {
      await cmd(null, [220]);
      let ehlo = await cmd('EHLO gaming-coins.local', [250]);
      if (!secure && /STARTTLS/i.test(ehlo)) {
        await cmd('STARTTLS', [220]);
        sock.removeAllListeners('data');
        sock = tls.connect({ socket: sock, servername: host });
        attach(sock);
        await new Promise((ok) => sock.once('secureConnect', ok));
        ehlo = await cmd('EHLO gaming-coins.local', [250]);
      }
      if (cfg.user) {
        await cmd('AUTH LOGIN', [334]);
        await cmd(b64(cfg.user), [334]);
        await cmd(b64(cfg.pass || ''), [235]);
      }
      await cmd(`MAIL FROM:<${addr(from)}>`, [250]);
      for (const r of recipients) await cmd(`RCPT TO:<${r}>`, [250, 251]);
      await cmd('DATA', [354]);
      const domain = addr(from).split('@')[1] || 'gaming-coins.local';
      const headers = [
        `From: ${/</.test(from) ? from.replace(/^([^<]*)</, (m, n) => encWord(n.trim()) + ' <') : `${encWord('Gaming Coins')} <${addr(from)}>`}`,
        `To: ${recipients.join(', ')}`,
        `Subject: ${encWord(subject)}`,
        `Date: ${new Date().toUTCString()}`,
        `Message-ID: <${crypto.randomBytes(12).toString('hex')}@${domain}>`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=utf-8',
        'Content-Transfer-Encoding: base64',
      ].join('\r\n');
      sock.write(headers + '\r\n\r\n' + wrap(b64(text)) + '.\r\n');
      await cmd(null, [250]);
      await cmd('QUIT').catch(() => {});
      done = true; try { sock.end(); } catch {}
      resolve();
    })().catch(fail);
  });
}

module.exports = { sendMail };
