/* Fenêtre au premier plan (Windows) : titre + position. Sert à n’afficher le HUD que quand Minecraft est actif, et à le placer
   exactement sur la fenêtre du jeu (donc sur le bon écran). Ailleurs : toujours visible, sur l’écran du curseur. */
const { spawn } = require('child_process');
let p = null, last = '';
exports.lastRect = null;
const PS = `
Add-Type @'
using System;using System.Text;using System.Runtime.InteropServices;
public class FGW{
 [DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]public static extern int GetWindowText(IntPtr h,StringBuilder s,int n);
 [DllImport("user32.dll")]public static extern bool GetWindowRect(IntPtr h,out RECT r);
 [StructLayout(LayoutKind.Sequential)]public struct RECT{public int Left,Top,Right,Bottom;}
}
'@
while($true){$h=[FGW]::GetForegroundWindow();$s=New-Object Text.StringBuilder 256;[void][FGW]::GetWindowText($h,$s,256);$r=New-Object FGW+RECT;[void][FGW]::GetWindowRect($h,[ref]$r);[Console]::Out.WriteLine($s.ToString()+'|'+$r.Left+'|'+$r.Top+'|'+$r.Right+'|'+$r.Bottom);[Console]::Out.Flush();Start-Sleep -Milliseconds 400}`;
exports.start = cb => {
  exports.stop(); last = '';
  if (process.platform !== 'win32') return cb({ mc: true, rect: null });
  try {
    p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(PS, 'utf16le').toString('base64')], { windowsHide: true });
    let buf = ''; p.stdout.on('data', d => { buf += d; const L = buf.split(/\r?\n/); buf = L.pop(); for (const l of L) {
      const a = l.split('|'); if (a.length < 5) continue; const n = a.slice(-4).map(Number), t = a.slice(0, -4).join('|'), mc = /minecraft/i.test(t) && !/launcher/i.test(t), hy = /^hydarium overlay$/i.test(t.trim());
      const rect = n.every(Number.isFinite) && n[2] - n[0] > 300 && n[3] - n[1] > 200 ? { x: n[0], y: n[1], width: n[2] - n[0], height: n[3] - n[1] } : null;
      if (mc && rect) exports.lastRect = rect;
      const key = (mc || hy) + '|' + (mc && rect ? [rect.x, rect.y, rect.width, rect.height].join(',') : ''); if (key !== last) { last = key; cb({ mc: mc || hy, rect: mc ? rect : null }); }
    } });
    p.on('error', () => cb({ mc: true, rect: null })); p.stderr.on('data', () => {});
  } catch (e) { cb({ mc: true, rect: null }); }
};
exports.stop = () => { if (p) { try { p.kill(); } catch (e) {} p = null; } };

/* Plein écran : quand le menu Alt+H prend le focus, Windows / GLFW peuvent réduire la fenêtre du jeu (« mise de côté »).
   On la remet à l’écran SANS lui donner le focus pendant que le menu est ouvert (activate = false), puis AVEC le focus quand le menu se ferme (activate = true). */
const PS_RESTORE = act => `
Add-Type @'
using System;using System.Runtime.InteropServices;
public class MCW{[DllImport("user32.dll")]public static extern bool ShowWindowAsync(IntPtr h,int c);[DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);[DllImport("user32.dll")]public static extern bool IsIconic(IntPtr h);}
'@
Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -match 'minecraft' -and $_.MainWindowTitle -notmatch 'launcher|hydarium' } | ForEach-Object {
 $h=$_.MainWindowHandle; if([MCW]::IsIconic($h)){[void][MCW]::ShowWindowAsync($h,${act ? 9 : 4})}
 ${act ? '[void][MCW]::SetForegroundWindow($h)' : ''} }`;
exports.restoreMc = activate => {
  if (process.platform !== 'win32') return;
  try { const c = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(PS_RESTORE(!!activate), 'utf16le').toString('base64')], { windowsHide: true }); c.on('error', () => {}); c.stderr.on('data', () => {}); setTimeout(() => { try { c.kill(); } catch (e) {} }, 8000); } catch (e) { /* tant pis */ }
};
