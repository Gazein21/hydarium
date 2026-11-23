/* Images dans le chat : reconnues par leur CONTENU, dimensions lues sans décoder (pas de « bombe »), carte image (miniature + image entière à la demande), branchements. */
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto'), zlib = require('zlib');
const createTestnet = require('hyperdht/testnet'), DHT = require('hyperdht');
const F = require('../src/main/friends'), C = require('../src/main/chat'), X = require('../src/main/xfer'), I = require('../src/main/imgsafe');
const until = async (f, ms = 9000, what = '') => { const t = Date.now(); while (Date.now() - t < ms) { if (await f()) return true; await new Promise(r => setTimeout(r, 40)); } throw new Error('délai dépassé : ' + what); };
const hex = b => Buffer.from(b).toString('hex');

const crc = b => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const png = (w, h) => { const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2; return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(Buffer.alloc(30))), chunk('IEND', Buffer.alloc(0))]); };
const jpg = (w, h, pad = 150) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xc0, 0, 17, 8, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0]), Buffer.alloc(pad, 7), Buffer.from([0xff, 0xd9])]);
const gif = (w, h) => { const b = Buffer.alloc(30); b.write('GIF89a'); b.writeUInt16LE(w, 6); b.writeUInt16LE(h, 8); return b; };
const webpL = (w, h) => { const b = Buffer.alloc(40); b.write('RIFF', 0); b.writeUInt32LE(32, 4); b.write('WEBPVP8L', 8); b[20] = 0x2f; b.writeUInt32LE(((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14), 21); return b; };
const webpX = (w, h) => { const b = Buffer.alloc(40); b.write('RIFF', 0); b.write('WEBPVP8X', 8); b[24] = (w - 1) & 255; b[25] = ((w - 1) >> 8) & 255; b[26] = ((w - 1) >> 16) & 255; b[27] = (h - 1) & 255; b[28] = ((h - 1) >> 8) & 255; b[29] = ((h - 1) >> 16) & 255; return b; };

test('reconnaissance par le contenu : le nom ne compte pas, les dimensions viennent de l’en-tête', () => {
  assert.deepStrictEqual(I.info(png(640, 480)), { type: 'png', w: 640, h: 480, mime: 'image/png', ext: 'png' }); assert.deepStrictEqual(I.info(jpg(1920, 1080)), { type: 'jpeg', w: 1920, h: 1080, mime: 'image/jpeg', ext: 'jpg' });
  assert.deepStrictEqual([I.info(gif(100, 50)).type, I.info(gif(100, 50)).w], ['gif', 100]); assert.deepStrictEqual([I.info(webpL(300, 200)).w, I.info(webpL(300, 200)).h, I.info(webpX(800, 600)).w, I.info(webpX(800, 600)).h], [300, 200, 800, 600]);
  for (const bad of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'.repeat(2)), Buffer.from('MZ' + 'x'.repeat(100)), Buffer.from('#!/bin/sh\n'.repeat(5)), Buffer.alloc(10), Buffer.alloc(100), null, 'texte', png(0, 10), png(10, 0)]) assert.strictEqual(I.info(bad), null);
});
test('« bombes » : une petite image qui annonce des milliards de pixels est refusée', () => {
  assert.strictEqual(I.info(png(100000, 100000)), null); assert.strictEqual(I.info(png(16385, 10)), null); assert.strictEqual(I.info(png(10000, 10000)), null, '100 millions de pixels'); assert.ok(I.info(png(8000, 8000)), '64 millions : limite'); assert.strictEqual(I.info(png(8001, 8000)), null);
  assert.strictEqual(I.info(jpg(60000, 60000)), null); assert.strictEqual(I.info(gif(65535, 65535)), null); assert.strictEqual(I.info(webpL(16384, 16384)), null); assert.strictEqual(I.info(webpX(30000, 30000)), null);
});

test('carte image : validation ; miniature et carte arrivent chez l’ami, image entière à la demande par le canal de fichiers', async () => {
  const g = { k: 'img', n: 'capture.png', tid: 'a'.repeat(24), size: 5000, w: 800, h: 600, th: '' };
  assert.deepStrictEqual(C.cleanCard({ ...g, x: 'y' }), g); for (const bad of [{ ...g, size: 0 }, { ...g, size: 16 * 2 ** 20 }, { ...g, w: 0 }, { ...g, h: 99999 }, { ...g, tid: 'zz' }, { ...g, w: 1.5 }, { ...g, n: '' }]) assert.strictEqual(C.cleanCard(bad), null);
  const tn = await createTestnet(5), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hyd-img-')), all = [];
  try {
    const mk = name => { const db = { friends: {} }, dir = path.join(tmp, name), ref = {}; const f = F.create({ store: { get: () => db, save() {} }, DHT, bootstrap: tn.bootstrap, profile: () => ({ name, st: 'online', what: '' }), seal: s => 'S:' + Buffer.from(s).reverse().toString('hex'), unseal: s => Buffer.from(s.slice(2), 'hex').reverse().toString(),
      onStream: (k, s, m) => ref.x.serve(k, s, m), onMessage: (k, m) => ref.c.onMessage(k, m), onOnline: k => ref.c.onOnline(k), timing: { hiMs: 300, deadMs: 1500, retryMs: 400, backoff: [100, 200, 300] } });
      ref.x = X.create({ dir, friends: f }); ref.c = C.create({ dir, friends: f, myName: () => name, saveMs: 10 }); const x = { f, dir, x: ref.x, c: ref.c, key: () => hex(DHT.keyPair(Buffer.from(Buffer.from(db.friends.seed.slice(2), 'hex').reverse().toString(), 'hex')).publicKey) }; all.push(x); return x; };
    const A = mk('Alice'), B = mk('Bob'); await A.f.enable(true); await B.f.enable(true); await A.f.request(B.f.status().code); await until(() => B.f.status().inbox.length, 6000); await B.f.accept(A.key()); await until(() => A.f.isOnline(B.key()), 8000);
    const file = path.join(tmp, 'capture.png'), data = png(800, 600); fs.writeFileSync(file, data); const th = jpg(200, 150, 300).toString('base64');
    const o = A.x.offer([B.key()], 'capture.png', [file]); A.c.sendCard(B.key(), { k: 'img', n: 'capture.png', tid: o.tid, size: data.length, w: 800, h: 600 }, th);
    await until(() => B.c.messages(A.key()).length === 1, 6000, 'carte reçue'); const m = B.c.messages(A.key())[0]; assert.deepStrictEqual([m.c.k, m.c.w, m.c.h, m.c.size, m.c.tid], ['img', 800, 600, data.length, o.tid]); assert.match(B.c.thumb(m.c.th), /^data:image\/jpeg;base64,/); assert.ok(!('code' in m.c));
    assert.strictEqual(B.c.list().convs[A.key()].last.text, '🖼 Image');
    const r = await B.x.fetch(A.key(), o.tid, { count: 1, size: data.length }); assert.strictEqual(r.items.length, 1); assert.ok(Buffer.compare(fs.readFileSync(path.join(r.dir, r.items[0])), data) === 0, 'image identique'); assert.ok(I.info(fs.readFileSync(path.join(r.dir, r.items[0]))));
    await assert.rejects(B.x.fetch(A.key(), o.tid, { count: 1, size: data.length + 1 }), /ne correspond pas/, 'taille mensongère');
  } finally { for (const x of all) try { x.c.flush(); await x.f.stop(); } catch (e) { /* fini */ } await tn.destroy(); fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('branchements : canaux, sécurité des chemins, interface', () => {
  const r = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), main = r('src/main/main.js'), pre = r('src/preload.js'), app = r('src/renderer/app.js'), shots = r('src/main/shots.js');
  for (const c of ['chat:imgsend', 'chat:imgget', 'chat:imgsave']) assert.ok(pre.includes("'" + c + "'") && main.includes("on('" + c + "'"), c);
  assert.ok(/exports\.pathOf = where/.test(shots), 'chemin de capture vérifié par shots.js'); assert.ok(!/imgsend[^\n]*(arg|how)\.path/.test(main), 'jamais de chemin venu de l’interface');
  assert.ok(/imgOk\(f, card\.size\)/.test(main), 'image reçue vérifiée avant d’être montrée'); assert.ok(app.includes('data-a="chShotSend"') && app.includes("document.addEventListener('paste'"), 'captures + collage');
});
