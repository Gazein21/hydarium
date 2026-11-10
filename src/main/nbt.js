/* Lecture / écriture NBT (level.dat des mondes). Les types sont conservés pour réécrire le fichier sans rien casser. */
const zlib = require('zlib');
exports.parse = (gz, raw) => {
  const b = raw ? gz : zlib.gunzipSync(gz); let o = 0;
  const str = () => { const n = b.readUInt16BE(o); o += 2; const s = b.toString('utf8', o, o + n); o += n; return s; };
  const pay = t => {
    switch (t) {
      case 1: return b.readInt8(o++);
      case 2: { const v = b.readInt16BE(o); o += 2; return v; }
      case 3: { const v = b.readInt32BE(o); o += 4; return v; }
      case 4: { const v = b.readBigInt64BE(o); o += 8; return v; }
      case 5: { const v = b.readFloatBE(o); o += 4; return v; }
      case 6: { const v = b.readDoubleBE(o); o += 8; return v; }
      case 7: { const n = b.readInt32BE(o); o += 4; const v = Buffer.from(b.subarray(o, o + n)); o += n; return v; }
      case 8: return str();
      case 9: { const et = b[o++], n = b.readInt32BE(o); o += 4; const a = []; for (let i = 0; i < n; i++) a.push(pay(et)); return { et, a }; }
      case 10: { const m = new Map(); for (;;) { const t2 = b[o++]; if (!t2) break; const k = str(); m.set(k, { t: t2, v: pay(t2) }); } return m; }
      case 11: { const n = b.readInt32BE(o); o += 4; const a = []; for (let i = 0; i < n; i++) { a.push(b.readInt32BE(o)); o += 4; } return a; }
      case 12: { const n = b.readInt32BE(o); o += 4; const a = []; for (let i = 0; i < n; i++) { a.push(b.readBigInt64BE(o)); o += 8; } return a; }
      default: throw new Error('NBT : type inconnu ' + t);
    }
  };
  const t = b[o++]; const name = str(); return { t, name, v: pay(t) };
};
exports.write = root => {
  const c = [], w = (n, f) => { const x = Buffer.alloc(n); f(x); c.push(x); };
  const str = s => { const x = Buffer.from(s, 'utf8'); w(2, y => y.writeUInt16BE(x.length)); c.push(x); };
  const pay = (t, v) => {
    switch (t) {
      case 1: w(1, x => x.writeInt8(v)); break; case 2: w(2, x => x.writeInt16BE(v)); break; case 3: w(4, x => x.writeInt32BE(v)); break;
      case 4: w(8, x => x.writeBigInt64BE(BigInt(v))); break; case 5: w(4, x => x.writeFloatBE(v)); break; case 6: w(8, x => x.writeDoubleBE(v)); break;
      case 7: w(4, x => x.writeInt32BE(v.length)); c.push(v); break; case 8: str(v); break;
      case 9: w(1, x => x.writeUInt8(v.et)); w(4, x => x.writeInt32BE(v.a.length)); v.a.forEach(i => pay(v.et, i)); break;
      case 10: for (const [k, n] of v) { w(1, x => x.writeUInt8(n.t)); str(k); pay(n.t, n.v); } w(1, x => x.writeUInt8(0)); break;
      case 11: w(4, x => x.writeInt32BE(v.length)); v.forEach(i => w(4, x => x.writeInt32BE(i))); break;
      case 12: w(4, x => x.writeInt32BE(v.length)); v.forEach(i => w(8, x => x.writeBigInt64BE(BigInt(i)))); break;
    }
  };
  w(1, x => x.writeUInt8(root.t)); str(root.name); pay(root.t, root.v);
  return zlib.gzipSync(Buffer.concat(c));
};
