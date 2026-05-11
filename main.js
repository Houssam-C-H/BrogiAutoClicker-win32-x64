const { app, BrowserWindow, ipcMain, globalShortcut, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// ── Settings ──────────────────────────────────────────────────────────────────
const settingsPath = path.join(app.getPath('userData'), 'settings.json');
const DEFAULT = {
  interval: 100,
  clickType: 'single',
  mouseButton: 'left',
  clickMode: 'cursor',
  fixedX: 960,
  fixedY: 540,
  unlimited: true,
  clickCount: 100,
  startStopKey: 'F6',
  pickLocKey: 'F7'
};

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      return { ...DEFAULT, ...JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) };
    }
  } catch (_) {}
  return { ...DEFAULT };
}

function saveSettings(s) {
  try { fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2)); } catch (_) {}
}

let settings = loadSettings();

// ── State ─────────────────────────────────────────────────────────────────────
let mainWindow = null;
let psProcess  = null;
let clickTimer = null;
let isRunning  = false;
let totalClicks = 0;

// ── PowerShell worker (persistent) ────────────────────────────────────────────
const PS_WORKER = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MO {
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint f,uint dx,uint dy,uint b,UIntPtr e);
    const uint LD=2,LU=4,RD=8,RU=16,MD=32,MU=64;
    public static void Click(string b){
        uint d,u;
        if(b=="right"){d=RD;u=RU;}else if(b=="middle"){d=MD;u=MU;}else{d=LD;u=LU;}
        mouse_event(d,0,0,0,UIntPtr.Zero);mouse_event(u,0,0,0,UIntPtr.Zero);
    }
    public static void Move(int x,int y){SetCursorPos(x,y);}
}
"@ -ErrorAction SilentlyContinue
$r=[System.IO.StreamReader]::new([Console]::OpenStandardInput())
while($true){
    $l=$r.ReadLine()
    if($l -eq $null -or $l -eq "exit"){break}
    $p=$l.Trim().Split(" ")
    if($p[0] -eq "click"){[MO]::Click($p[1])}
    elseif($p[0] -eq "move"){[MO]::Move([int]$p[1],[int]$p[2])}
}`;

function startPS() {
  psProcess = spawn('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', PS_WORKER
  ], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  psProcess.stderr.on('data', d => console.error('[PS]', d.toString()));
  psProcess.on('close', () => { psProcess = null; });
}

function psClick(button) {
  if (psProcess && !psProcess.killed) psProcess.stdin.write(`click ${button}\n`);
}
function psMove(x, y) {
  if (psProcess && !psProcess.killed) psProcess.stdin.write(`move ${x} ${y}\n`);
}

function getCursorPos() {
  return new Promise(resolve => {
    const script = `
      Add-Type @"
using System;using System.Runtime.InteropServices;
public class CP{[DllImport("user32.dll")]public static extern bool GetCursorPos(out PT p);public struct PT{public int X,Y;}}
"@ -ErrorAction SilentlyContinue
      $p=New-Object CP+PT;[CP]::GetCursorPos([ref]$p)|Out-Null;Write-Output "$($p.X),$($p.Y)"`;
    const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
      { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let out = '';
    ps.stdout.on('data', d => out += d);
    ps.on('close', () => {
      const [x, y] = out.trim().split(',').map(Number);
      resolve({ x: isNaN(x) ? 0 : x, y: isNaN(y) ? 0 : y });
    });
  });
}

// ── Click loop ────────────────────────────────────────────────────────────────
function doTick() {
  if (settings.clickMode === 'fixed') psMove(settings.fixedX, settings.fixedY);
  const times = settings.clickType === 'triple' ? 3 : settings.clickType === 'double' ? 2 : 1;
  for (let i = 0; i < times; i++) psClick(settings.mouseButton);
  totalClicks++;
  mainWindow?.webContents.send('tick', totalClicks);
  if (!settings.unlimited && totalClicks >= settings.clickCount) stopClicking();
}

function startClicking() {
  if (isRunning) return;
  isRunning = true;
  totalClicks = 0;
  mainWindow?.webContents.send('status', { running: true, clicks: 0 });
  clickTimer = setInterval(doTick, Math.max(10, settings.interval));
}

function stopClicking() {
  if (!isRunning) return;
  isRunning = false;
  clearInterval(clickTimer);
  clickTimer = null;
  mainWindow?.webContents.send('status', { running: false, clicks: totalClicks });
}

function toggleClicking() {
  isRunning ? stopClicking() : startClicking();
}

// ── Shortcuts ─────────────────────────────────────────────────────────────────
function registerShortcuts() {
  globalShortcut.unregisterAll();
  try { globalShortcut.register(settings.startStopKey, toggleClicking); } catch (_) {}
  try {
    if (settings.pickLocKey) {
      globalShortcut.register(settings.pickLocKey, () => mainWindow?.webContents.send('trigger-pick'));
    }
  } catch (_) {}
}

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 460,
    height: 630,
    resizable: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'Brogi Auto Clicker',
    icon: path.join(__dirname, 'assets', 'logo.png')
  });
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.handle('get-settings', () => settings);
ipcMain.handle('get-status',   () => ({ running: isRunning, clicks: totalClicks }));

ipcMain.on('save-settings', (_, s) => {
  settings = { ...settings, ...s };
  saveSettings(settings);
  if (isRunning) {
    stopClicking();
    clearInterval(clickTimer);
    isRunning = false;
  }
  registerShortcuts();
});

ipcMain.on('toggle', () => toggleClicking());
ipcMain.on('minimize', () => mainWindow?.minimize());
ipcMain.on('close',    () => { stopClicking(); app.quit(); });

ipcMain.handle('get-cursor-pos', async () => {
  mainWindow?.minimize();
  await new Promise(r => setTimeout(r, 3200));
  const pos = await getCursorPos();
  mainWindow?.restore();
  return pos;
});

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  startPS();
  createWindow();
  registerShortcuts();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (psProcess) { try { psProcess.stdin.write('exit\n'); } catch (_) {} }
});

app.on('window-all-closed', () => app.quit());
