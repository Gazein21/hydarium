/* Server List Ping fait par le launcher lui-même (sans service tiers) : version, liste de mods Forge/NeoForge, description.
   Gère les enregistrements SRV (play.exemple.fr → vraie machine), ce que fait Minecraft ; le journal du jeu affiche d’ailleurs la machine résolue. */
const net = require('net'), dns = require('dns').promises;
const vi = n => { const b = []; n = n >>> 0; do { let t = n & 0x7f; n >>>= 7; if (n) t |= 0x80; b.push(t); } while (n); return Buffer.from(b); };
const readVi = (buf, off) => { let v = 0, s = 0, i = off; for (;;) { if (i >= buf.length) return null; const b = buf[i++]; v |= (b & 0x7f) << s; if (!(b & 0x80)) return { v, n: i - off }; s += 7; if (s > 35) throw new Error('VarInt invalide'); } };
const cache = new Map();
/* hôte[:port] → machine réelle (SRV) ; renvoie { host, port, srv } */
exports.resolve = async (host, port) => {
  const key = host + ':' + port; if (cache.has(key) && Date.now() - cache.get(key).t < 600e3) return cache.get(key).r;
  let r = { host, port: port || 25565, srv: false };
  if (!port && !net.isIP(host)) { try { const s = await dns.resolveSrv('_minecraft._tcp.' + host); if (s.length) r = { host: s.sort((a, b) => a.priority - b.priority)[0].name.replace(/\.$/, ''), port: s[0].port, srv: true }; } catch (e) { /* pas de SRV : adresse directe */ } }
  cache.set(key, { t: Date.now(), r }); return r;
};
exports.ping = async (addr, timeout = 6000, proto = -1) => {
  const [h, p] = String(addr).split(':'), t = await exports.resolve(h, p ? +p : 0);
  return new Promise((res, rej) => {
    const s = net.connect({ host: t.host, port: t.port }); let buf = Buffer.alloc(0), done = false; s.setNoDelay(true);
    const end = (e, v) => { if (done) return; done = true; clearTimeout(tm); s.destroy(); e ? rej(e) : res(v); }, tm = setTimeout(() => end(new Error('délai dépassé')), timeout);
    s.on('error', e => end(e)); s.on('close', () => end(new Error('connexion fermée')));
    s.on('connect', () => {
      const host = Buffer.from(h, 'utf8'), port = Buffer.alloc(2); port.writeUInt16BE(t.port);
      const hs = Buffer.concat([vi(0), vi(proto < 0 ? 0xFFFFFFFF : proto), vi(host.length), host, port, vi(1)]); // protocole -1 : « donne-moi ta propre version » ; sinon on se présente avec le protocole d’une version précise (un proxy multi-versions répond alors avec CE protocole s’il l’accepte)
      s.write(Buffer.concat([vi(hs.length), hs, Buffer.from([1, 0])]));
    });
    s.on('data', d => {
      buf = Buffer.concat([buf, d]); if (buf.length > 4e6) return end(new Error('réponse trop grosse'));
      try {
        const len = readVi(buf, 0); if (!len || buf.length < len.n + len.v) return;
        let o = len.n; const id = readVi(buf, o); o += id.n; const sl = readVi(buf, o); if (!sl) return; o += sl.n; if (buf.length < o + sl.v) return;
        end(null, { json: JSON.parse(buf.slice(o, o + sl.v).toString('utf8')), host: t.host, port: t.port, srv: t.srv });
      } catch (e) { end(e); }
    });
  });
};
/* texte brut d’une description (chaîne ou composant de chat) */
exports.text = d => { if (!d) return ''; if (typeof d === 'string') return d.replace(/§./g, ''); return String(d.text || '').replace(/§./g, '') + (d.extra || []).map(exports.text).join('') + (d.translate ? ' ' + d.translate : ''); };

/* ===== mods annoncés par un serveur Forge / NeoForge =====
   Trois formats : « modinfo.modList » (Forge ≤ 1.12), « forgeData.mods » (1.13 – 1.18) et « forgeData.d » (1.18.1+ : octets compressés dans une chaîne UTF-16, 15 bits par caractère,
   format de ServerStatusPing de Forge ; c'est le cas de tous les gros modpacks, dont « All the Mods », dont la liste ne tient pas dans le format clair).
   Renvoie { found, loader, ids[], serverOnly[], truncated } : « serverOnly » = mods qui n'ont pas besoin d'être sur le client (à ne pas installer). */
function decodeD(str) {
  const u = i => str.charCodeAt(i) & 0xFFFF;
  if (str.length < 3) return null;
  const size = (u(0) & 0x7FFF) | ((u(1) & 0x7FFF) << 15); let pos = 2, value = 0, bits = 0; const out = [];
  if (size <= 0 || size > 4e6) return null;
  while (out.length < size) {
    if (bits < 8 && pos < str.length) { value += (u(pos++) & 0x7FFF) * Math.pow(2, bits); bits += 15; }
    else if (bits < 8) break;
    out.push(value % 256); value = Math.floor(value / 256); bits -= 8;
  }
  return Buffer.from(out);
}
function readBuf(b) {
  let o = 0; const need = n => { if (o + n > b.length) throw new RangeError('fin des données'); };
  return {
    bool() { need(1); return b[o++] !== 0; }, ushort() { need(2); const v = b.readUInt16BE(o); o += 2; return v; },
    varint() { let v = 0, s = 0; for (;;) { need(1); const x = b[o++]; v |= (x & 0x7f) << s; if (!(x & 0x80)) return v >>> 0; s += 7; if (s > 35) throw new RangeError('VarInt'); } },
    utf() { const n = this.varint(); need(n); const t = b.slice(o, o + n).toString('utf8'); o += n; return t; }
  };
}
exports.forgeMods = P => {
  const res = { found: false, loader: null, ids: [], serverOnly: [], truncated: false };
  if (!P || typeof P !== 'object') return res;
  if (P.modinfo && Array.isArray(P.modinfo.modList)) { res.found = true; res.loader = 'forge'; res.ids = P.modinfo.modList.map(m => m && (m.modid || m.modId)).filter(Boolean); }
  const key = Object.keys(P).find(k => /^(neo)?forgedata$/i.test(k)), fd = key ? P[key] : null;
  if (fd && typeof fd === 'object') {
    res.found = true; res.loader = /^neo/i.test(key) ? 'neoforge' : (res.loader || 'forge');
    const list = fd.mods || fd.modList;
    if (Array.isArray(list)) res.ids = res.ids.concat(list.map(m => m && (m.modId || m.modid)).filter(Boolean));
    if (typeof fd.d === 'string' && fd.d) {
      try {
        const buf = decodeD(fd.d); if (buf) {
          const r = readBuf(buf); res.truncated = r.bool(); const n = r.ushort();
          try {
            for (let k = 0; k < n; k++) { const fl = r.varint(), ch = fl >>> 1, srv = !!(fl & 1), id = r.utf(); if (!srv) r.utf(); for (let c = 0; c < ch; c++) { r.utf(); r.utf(); r.bool(); } (srv ? res.serverOnly : res.ids).push(id); }
          } catch (e) { if (!res.truncated) throw e; }
        }
      } catch (e) { res.decodeError = e.message; }
    }
  }
  res.ids = [...new Set(res.ids)];
  return res;
};
