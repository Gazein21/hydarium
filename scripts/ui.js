/* Interface de console « sympa » : une barre d'avancement globale, la liste des étapes (faite / en cours / à venir) et, pour l'étape en cours,
   ce qui se passe précisément (téléchargement de Java 45 %, compilation…). Les lignes techniques ne sont jamais affichées : elles vont dans le fichier journal.
   Écrit pour cmd, PowerShell et Windows Terminal (caractères CP437 : █ ░ √ ·), et retombe sur de simples lignes quand la sortie n'est pas un terminal (CI, redirection). */
const fs = require('fs');
const out = process.stdout, TTY = !!out.isTTY && process.env.TERM !== 'dumb', COLOR = TTY && !process.env.NO_COLOR;
const sg = (code, s) => COLOR ? `\x1b[${code}m${s}\x1b[0m` : s;
const B = s => sg('1', s), DIM = s => sg('90', s), GREEN = s => sg('32', s), YEL = s => sg('33', s), RED = s => sg('31;1', s), CYAN = s => sg('36', s);
const ANSI = /^\x1b\[[0-9;?]*[A-Za-z]/;
const fit = (s, w) => { let n = 0, o = '', i = 0; while (i < s.length) { const m = ANSI.exec(s.slice(i)); if (m) { o += m[0]; i += m[0].length; continue; } if (n >= w) { o += COLOR ? '\x1b[0m' : ''; break; } o += s[i++]; n++; } return o; };
const mmss = ms => { const s = Math.floor(ms / 1000); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
const bar = (f, w) => { f = Math.max(0, Math.min(1, f || 0)); const n = Math.round(f * w); return GREEN('█'.repeat(n)) + DIM('░'.repeat(w - n)); };
const SPIN = ['|', '/', '-', '\\'];

function createUI({ title, subtitle, steps, logFile, tip }) {
  const S = steps.map(s => ({ weight: 10, est: 60, ...s, status: 'wait', note: '' }));
  const t0 = Date.now(); let cur = null, curT = 0, frac = null, heading = '', detail = '', prev = 0, timer = null, lastPlain = 0, lastPlainText = '', done = false;
  const ws = logFile ? fs.createWriteStream(logFile, { flags: 'w' }) : null;
  const log = l => { if (ws) ws.write(String(l).replace(/\r/g, '') + '\n'); };
  const total = S.reduce((a, s) => a + s.weight, 0);
  const overall = () => {
    let acc = 0; for (const s of S) { if (s.status === 'wait') continue; if (s.status !== 'run') acc += s.weight; else acc += s.weight * (frac != null ? frac : Math.min(.9, 1 - Math.exp(-(Date.now() - curT) / 1000 / s.est))); }
    return Math.max(0, Math.min(1, acc / total));
  };
  const glyph = s => s.status === 'ok' ? GREEN('√') : s.status === 'warn' ? YEL('!') : s.status === 'fail' ? RED('×') : s.status === 'skip' ? DIM('-') : s.status === 'run' ? CYAN(SPIN[Math.floor(Date.now() / 120) % 4]) : DIM('·');
  function frame() {
    const cols = Math.min((out.columns || 80) - 2, 78), L = [''];
    L.push('  ' + B('HYDARIUM') + DIM('  ·  ') + B(title)); if (subtitle) L.push('  ' + DIM(subtitle)); L.push('');
    const p = overall(); L.push(`  Avancement  ${bar(p, Math.max(10, Math.min(36, cols - 36)))}  ${B(String(Math.round(p * 100)).padStart(3) + ' %')}   ${DIM('temps : ' + mmss(Date.now() - t0))}`); L.push('');
    S.forEach((s, i) => {
      const lab = `${i + 1}/${S.length}  ${s.label}`;
      L.push(`   ${glyph(s)}  ${s.status === 'run' ? B(lab) : s.status === 'wait' ? DIM(lab) : lab}${s.note ? '   ' + (s.status === 'warn' ? YEL(s.note) : s.status === 'fail' ? RED(s.note) : DIM(s.note)) : ''}`);
      if (s.status === 'run') {
        if (heading) L.push('        ' + CYAN(heading));
        if (detail) L.push('        ' + detail + (frac != null && frac > 0 ? '   ' + bar(frac, 14) + ' ' + Math.round(frac * 100) + ' %' : ''));
      }
    });
    if (tip && !done) { L.push(''); L.push('  ' + DIM(tip)); }
    return L.map(l => fit(l, cols));
  }
  function render() {
    if (!TTY) return;
    const L = frame(); let s = '';
    if (prev) s += `\x1b[${prev}A`;
    for (const l of L) s += '\r\x1b[2K' + l + '\n';
    s += '\x1b[J'; out.write(s); prev = L.length;
  }
  function plain(text, force) { if (TTY) return; const now = Date.now(); if (!force && (text === lastPlainText || now - lastPlain < 4000)) return; lastPlain = now; lastPlainText = text; console.log(`[${String(Math.round(overall() * 100)).padStart(3)} %] ${text}`); }
  const hide = () => TTY && out.write('\x1b[?25l'), show = () => TTY && out.write('\x1b[?25h');
  if (TTY) { hide(); process.on('exit', show); process.on('SIGINT', () => { show(); process.exit(130); }); timer = setInterval(render, 100); if (timer.unref) timer.unref(); render(); }
  const find = id => S.find(s => s.id === id);
  const api = {
    log,
    begin(id, text) { const s = find(id); s.status = 'run'; cur = s; curT = Date.now(); frac = null; heading = ''; detail = text || ''; plain(`${S.indexOf(s) + 1}/${S.length} ${s.label}`, true); render(); },
    heading(t) { heading = t || ''; if (heading) plain(heading, true); render(); },
    detail(t) { detail = t || ''; plain((heading ? heading + ' : ' : '') + detail); },
    sub(f) { frac = f == null ? null : Math.max(0, Math.min(1, f)); },
    end(id, status, note) { const s = find(id); s.status = status; s.note = note || ''; if (cur === s) { cur = null; frac = null; heading = ''; detail = ''; } plain(`${s.label} : ${status === 'ok' ? 'fait' : status === 'skip' ? 'déjà fait' : status === 'warn' ? 'avertissement' : 'échec'}${note && status !== 'skip' && status !== 'fail' ? ' (' + note + ')' : ''}`, true); render(); },
    ok(id, note) { api.end(id, 'ok', note); }, skip(id, note) { api.end(id, 'skip', note || 'déjà fait'); }, warn(id, note) { api.end(id, 'warn', note); }, fail(id, note) { api.end(id, 'fail', note); },
    finish(good, lines) {
      done = true; if (timer) clearInterval(timer); render(); show();
      const o = ['']; for (const l of lines || []) o.push('  ' + l); o.push(''); out.write(o.join('\n') + '\n');
      if (ws) ws.end();
    },
    get elapsed() { return mmss(Date.now() - t0); }
  };
  return Object.assign(api, { GREEN, YEL, RED, B, DIM, CYAN });
}
module.exports = { createUI, mmss };
