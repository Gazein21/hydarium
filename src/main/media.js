/* Musique en cours (Spotify, YouTube Music…) : on lit la session multimédia du système, sans clé d’API ni compte.
   Windows : Global System Media Transport Controls (PowerShell) · Linux : playerctl (MPRIS) · macOS : Spotify / Music (osascript).
   EXPÉRIMENTAL : écrit sans pouvoir l’exécuter sur ces systèmes. */
const { execFile } = require('child_process');
const store = require('./store');
const run = (cmd, args, ms = 6000) => new Promise(res => execFile(cmd, args, { timeout: ms, windowsHide: true, maxBuffer: 1 << 20 }, (e, out) => res(e ? '' : String(out))));
const WIN = (action, want) => `
$ErrorActionPreference='Stop'
try{[Console]::OutputEncoding=[System.Text.Encoding]::UTF8}catch{}
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask=([System.WindowsRuntimeSystemExtensions].GetMethods()|Where-Object{$_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1'})[0]
function Await($op,$type){$t=$asTask.MakeGenericMethod($type).Invoke($null,@($op));$t.Wait(-1)|Out-Null;$t.Result}
[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime]
$mgr=Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$want='${want}'; $act='${action}'
$strong=@('youtubemusic','cinhimbnkkaeohfgghhklpknlkffjgod','music.youtube','youtube-music')
$brow=@('chrome','msedge','firefox','brave','opera','vivaldi','arc')
$ytWins=@(Get-Process -ErrorAction SilentlyContinue|Where-Object{$_.MainWindowTitle -like '*YouTube Music*'}|ForEach-Object{[string]$_.MainWindowTitle})
$spTabs=@(Get-Process -ErrorAction SilentlyContinue|Where-Object{$_.MainWindowTitle -like '*Spotify*' -and $_.ProcessName -match 'chrome|msedge|firefox|brave|opera|vivaldi'}).Count
$pick=$null;$info=$null;$certain=$false;$rank=-1
foreach($s in @($mgr.GetSessions())){
  $a=$s.SourceAppUserModelId.ToLower()
  $p=Await ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
  $ok=$false;$c=$false
  $isSp=($a -like '*spotify*'); $isYt=$false; $certainYt=$false
  foreach($t in $strong){if($a -like ('*'+$t+'*')){$isYt=$true;$certainYt=$true}}
  if(-not $isYt){$isb=$false;foreach($b in $brow){if($a -like ('*'+$b+'*')){$isb=$true}}
    # navigateur : Windows ne donne pas le site. On n'accepte que si le titre du média apparaît dans le titre d'une fenêtre « … - YouTube Music ». Une vidéo YouTube normale (même avec un onglet YouTube Music ouvert ailleurs, même d'une chaîne « - Topic ») est ignorée.
    $tt=[string]$p.Title
    if($isb -and $tt.Length -gt 0){foreach($w in $ytWins){if($w.IndexOf($tt,[StringComparison]::OrdinalIgnoreCase) -ge 0){$isYt=$true;break}}}}
  if($want -eq 'spotify'){$ok=$isSp;$c=$isSp}
  elseif($want -eq 'youtube'){$ok=$isYt;$c=$certainYt}
  else {$ok=($isSp -or $isYt);$c=($isSp -or $certainYt)}
  if($ok){
    $st=[string]$s.GetPlaybackInfo().PlaybackStatus
    $r=0; if($st -eq 'Playing'){$r=2}elseif($st -eq 'Paused'){$r=1}
    if($c){$r+=0.5}
    if($r -gt $rank){$rank=$r;$pick=$s;$info=$p;$certain=$c}
  }
}
if(-not $pick){'{}';exit}
if($act -eq 'playpause'){[void](Await ($pick.TryTogglePlayPauseAsync()) ([bool]))}
elseif($act -eq 'next'){[void](Await ($pick.TrySkipNextAsync()) ([bool]))}
elseif($act -eq 'prev'){[void](Await ($pick.TrySkipPreviousAsync()) ([bool]))}
$pb=$pick.GetPlaybackInfo()
$json=[pscustomobject]@{title=$info.Title;artist=$info.Artist;album=$info.AlbumTitle;app=$pick.SourceAppUserModelId;status=[string]$pb.PlaybackStatus;certain=$certain}|ConvertTo-Json -Compress
# la console Windows n'écrit pas en UTF-8 : le japonais devenait « ? ». On envoie du JSON 100 % ASCII (\\uXXXX) que JSON.parse relit tel quel.
[regex]::Replace($json,'[^\\x00-\\x7F]',{param($m) ('\\u{0:x4}' -f [int][char]$m.Value)})`;
const parse = t => { try { const j = JSON.parse(t.trim() || '{}'); if (!j.title) return null; return { title: String(j.title), artist: String(j.artist || ''), app: /spotify/i.test(j.app || '') ? 'Spotify' : (j.certain ? 'YouTube Music' : 'YouTube Music (navigateur)'), playing: /playing/i.test(j.status || '') }; } catch (e) { return null; } };
exports.act = async (action = '') => {
  const sp = require('./spotify'), pref = store.get().settings.music;
  if (pref !== 'youtube' && pref !== 'off' && sp.status().connected) { try { const t = await sp.act(action); if (t || pref === 'spotify') return t; } catch (e) { if (action) throw e; } }
  const want = ['spotify', 'youtube'].includes(store.get().settings.music) ? store.get().settings.music : 'auto';
  if (!['', 'playpause', 'next', 'prev'].includes(action)) throw new Error('Commande inconnue.');
  if (process.platform === 'win32') return parse(await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(WIN(action, want), 'utf16le').toString('base64')], 10000));
  if (process.platform === 'linux') { // seulement Spotify et YouTube Music (application ou onglet music.youtube.com) ; YouTube tout court est ignoré
    const names = (await run('playerctl', ['-l'])).split(/\r?\n/).map(x => x.trim()).filter(Boolean); let best = null;
    for (const pn of names) {
      const o = (await run('playerctl', ['-p', pn, 'metadata', '--format', '{{title}}\t{{artist}}\t{{playerName}}\t{{status}}\t{{xesam:url}}'])).trim().split('\t');
      const sp = /spotify/i.test(pn), yt = /youtube.?music|ytmd|th-ch/i.test(pn) || /music\.youtube\.com/i.test(o[4] || '');
      if (!o[0] || !(want === 'spotify' ? sp : want === 'youtube' ? yt : (sp || yt))) continue;
      const cur = { pn, t: { title: o[0], artist: o[1] || '', app: sp ? 'Spotify' : 'YouTube Music', playing: /playing/i.test(o[3] || '') } };
      if (!best || (cur.t.playing && !best.t.playing)) best = cur;
    }
    if (best && action) await run('playerctl', ['-p', best.pn, { playpause: 'play-pause', next: 'next', prev: 'previous' }[action]]);
    return best ? best.t : null;
  }
  if (process.platform === 'darwin') {
    const app = want === 'youtube' ? null : 'Spotify'; if (!app) return null;
    if (action) await run('osascript', ['-e', `tell application "${app}" to ${{ playpause: 'playpause', next: 'next track', prev: 'previous track' }[action]}`]);
    const o = (await run('osascript', ['-e', `if application "${app}" is running then tell application "${app}" to return (name of current track) & "\\t" & (artist of current track) & "\\t" & (player state as string)`])).trim().split('\t');
    return o[0] ? { title: o[0], artist: o[1] || '', app, playing: /playing/i.test(o[2] || '') } : null;
  }
  return null;
};
exports.get = () => exports.act('');
