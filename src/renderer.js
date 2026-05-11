/* renderer.js — AutoClicker UI Logic */
(async () => {
  // ── Load initial state ────────────────────────────────────────────────────
  const settings = await window.api.getSettings();
  const status   = await window.api.getStatus();

  // ── Helpers ───────────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const qr = name => document.querySelector(`input[name="${name}"]:checked`)?.value;
  const setRadio = (name, val) => {
    const el = document.querySelector(`input[name="${name}"][value="${val}"]`);
    if (el) el.checked = true;
  };

  // ── Tab switching ─────────────────────────────────────────────────────────
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      $(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });

  // ── Titlebar ──────────────────────────────────────────────────────────────
  $('btn-minimize').addEventListener('click', () => window.api.minimize());
  $('btn-close').addEventListener('click', () => window.api.close());

  // ── Interval input + slider + CPS ─────────────────────────────────────────
  const inpInterval  = $('inp-interval');
  const sliderEl     = $('slider-interval');
  const cpsValue     = $('cps-value');

  function updateCPS(ms) {
    cpsValue.textContent = ms > 0 ? (1000 / ms).toFixed(1) : '∞';
  }

  function syncSlider(ms) {
    const pct = Math.min(100, ((Math.log10(Math.max(10, ms)) - 1) / (Math.log10(2000) - 1)) * 100);
    sliderEl.style.setProperty('--pct', pct.toFixed(1) + '%');
    sliderEl.value = Math.min(2000, ms);
  }

  inpInterval.addEventListener('input', () => {
    const ms = Math.max(10, parseInt(inpInterval.value) || 10);
    updateCPS(ms); syncSlider(ms);
    saveSettings();
  });
  sliderEl.addEventListener('input', () => {
    const ms = parseInt(sliderEl.value);
    inpInterval.value = ms;
    updateCPS(ms); syncSlider(ms);
    saveSettings();
  });

  // ── Fixed location toggle ─────────────────────────────────────────────────
  const fixedCoords = $('fixed-coords');
  document.querySelectorAll('input[name="clickMode"]').forEach(r => {
    r.addEventListener('change', () => {
      fixedCoords.classList.toggle('visible', r.value === 'fixed' && r.checked);
      saveSettings();
    });
  });

  // ── Pick location button ──────────────────────────────────────────────────
  $('btn-pick').addEventListener('click', startPick);
  window.api.onTriggerPick(() => startPick());

  async function startPick() {
    const hint = $('pick-hint');
    let count = 3;
    hint.textContent = `Minimizing… position cursor in ${count}s`;
    const iv = setInterval(() => {
      count--;
      if (count > 0) hint.textContent = `Position your cursor… ${count}s`;
    }, 1000);
    const pos = await window.api.getCursorPos(); // minimizes, waits 3.2s, restores
    clearInterval(iv);
    $('inp-x').value = pos.x;
    $('inp-y').value = pos.y;
    hint.textContent = `Captured: (${pos.x}, ${pos.y})`;
    setTimeout(() => hint.textContent = '', 3000);
    saveSettings();
  }

  // ── All radio / input changes ─────────────────────────────────────────────
  document.querySelectorAll('input[name="clickType"], input[name="mouseBtn"], input[name="clickCount"]')
    .forEach(r => r.addEventListener('change', () => {
      $('inp-count').closest('.radio-opt').querySelectorAll('input[type=number]').forEach(i => {
        i.disabled = qr('clickCount') !== 'repeat';
      });
      saveSettings();
    }));
  $('inp-x').addEventListener('input', saveSettings);
  $('inp-y').addEventListener('input', saveSettings);
  $('inp-count').addEventListener('input', saveSettings);

  // ── Save settings ─────────────────────────────────────────────────────────
  function saveSettings() {
    const s = {
      interval:    Math.max(10, parseInt(inpInterval.value) || 100),
      clickType:   qr('clickType') || 'single',
      mouseButton: qr('mouseBtn') || 'left',
      clickMode:   qr('clickMode') || 'cursor',
      fixedX:      parseInt($('inp-x').value) || 0,
      fixedY:      parseInt($('inp-y').value) || 0,
      unlimited:   qr('clickCount') === 'unlimited',
      clickCount:  parseInt($('inp-count').value) || 100,
      startStopKey: currentKeys.startStopKey,
      pickLocKey:   currentKeys.pickLocKey
    };
    window.api.saveSettings(s);
  }

  // ── Load settings into UI ─────────────────────────────────────────────────
  inpInterval.value = settings.interval;
  updateCPS(settings.interval);
  syncSlider(settings.interval);

  setRadio('clickType', settings.clickType);
  setRadio('mouseBtn', settings.mouseButton);
  setRadio('clickMode', settings.clickMode);
  if (settings.clickMode === 'fixed') fixedCoords.classList.add('visible');
  $('inp-x').value = settings.fixedX;
  $('inp-y').value = settings.fixedY;
  setRadio('clickCount', settings.unlimited ? 'unlimited' : 'repeat');
  $('inp-count').value = settings.clickCount;
  $('inp-count').disabled = settings.unlimited;

  // ── Start / Stop button ───────────────────────────────────────────────────
  const btnStart  = $('btn-start');
  const startIcon = $('start-icon');
  const startLbl  = $('start-label');
  const statusDot = $('status-dot');
  const statusTxt = $('status-text');
  const clickCnt  = $('click-count');
  const hkBadge   = $('hotkey-badge');

  btnStart.addEventListener('click', () => window.api.toggle());

  function applyStatus({ running, clicks }) {
    btnStart.classList.toggle('running', running);
    startIcon.textContent = running ? '■' : '▶';
    startLbl.textContent  = running ? 'STOP'  : 'START';
    statusDot.classList.toggle('running', running);
    statusTxt.textContent = running ? 'Running' : 'Idle';
    if (clicks !== undefined) clickCnt.textContent = clicks;
  }

  applyStatus(status);

  window.api.onStatus(applyStatus);
  window.api.onTick(n  => { clickCnt.textContent = n; });

  // ── Hotkey recording ──────────────────────────────────────────────────────
  const currentKeys = { startStopKey: settings.startStopKey, pickLocKey: settings.pickLocKey };

  $('hk-startstop-display').textContent = settings.startStopKey;
  $('hk-pickloc-display').textContent   = settings.pickLocKey;
  hkBadge.textContent = settings.startStopKey;

  let recording = null; // null | 'startStopKey' | 'pickLocKey'

  function startRecording(target) {
    recording = target;
    const displayEl = target === 'startStopKey' ? $('hk-startstop-display') : $('hk-pickloc-display');
    const hintEl    = target === 'startStopKey' ? $('hint-ss') : $('hint-pl');
    const btnEl     = target === 'startStopKey' ? $('btn-record-ss') : $('btn-record-pl');
    displayEl.textContent = '...';
    displayEl.classList.add('recording');
    hintEl.textContent = 'Press a key (or Escape to cancel)';
    btnEl.textContent  = 'Cancel';
    btnEl.classList.add('recording');
  }

  function stopRecording(key) {
    const target    = recording;
    recording       = null;
    const displayEl = target === 'startStopKey' ? $('hk-startstop-display') : $('hk-pickloc-display');
    const hintEl    = target === 'startStopKey' ? $('hint-ss') : $('hint-pl');
    const btnEl     = target === 'startStopKey' ? $('btn-record-ss') : $('btn-record-pl');
    displayEl.classList.remove('recording');
    btnEl.classList.remove('recording');
    btnEl.textContent = 'Change';
    if (key) {
      currentKeys[target] = key;
      displayEl.textContent = key;
      if (target === 'startStopKey') hkBadge.textContent = key;
      hintEl.textContent = `Saved: ${key}`;
      setTimeout(() => hintEl.textContent = '', 2500);
      saveSettings();
    } else {
      displayEl.textContent = currentKeys[target];
      hintEl.textContent = '';
    }
  }

  document.addEventListener('keydown', e => {
    if (!recording) return;
    e.preventDefault(); e.stopPropagation();
    if (e.key === 'Escape') { stopRecording(null); return; }
    // Build Electron accelerator string
    const parts = [];
    if (e.ctrlKey)  parts.push('Ctrl');
    if (e.altKey)   parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    const mainKey = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    if (!['Control','Alt','Shift','Meta'].includes(e.key)) parts.push(mainKey);
    if (parts.length) stopRecording(parts.join('+'));
  }, true);

  [$('btn-record-ss'), $('btn-record-pl')].forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      if (recording === target) stopRecording(null);
      else { if (recording) stopRecording(null); startRecording(target); }
    });
  });

})();
