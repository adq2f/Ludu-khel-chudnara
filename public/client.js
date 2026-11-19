/* ===== identity ===== */
let myId = localStorage.getItem('ludoPid');
if (!myId) {
  myId = 'p_' + Math.random().toString(36).slice(2, 10);
  localStorage.setItem('ludoPid', myId);
}

const socket = io();
const $ = id => document.getElementById(id);
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

/* ===== state ===== */
let role = null;
let room = null;
let renderPos = {}, anims = {};
let diceBusy = false;
let diceSpin = 0;
let soundOn = true;

LudoBoard.COLORS.forEach(c => {
  renderPos[c] = []; anims[c] = [];
  for (let i = 0; i < 4; i++) {
    renderPos[c][i] = LudoBoard.posToXY(c, -1, i);
    anims[c][i] = null;
  }
});

/* ===== screen helpers ===== */
function show(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('show'));
  const el = $('screen' + name);
  if (el) el.classList.add('show');
}

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ============ ROLE CHOOSER ============ */
$('btnBeDisplay').onclick = () => {
  Sound.unlock(); Sound.click();
  socket.emit('createRoom', { role: 'display' }, res => {
    if (!res.ok) return toast('Failed');
    role = 'display';
    localStorage.setItem('ludoRole', 'display');
    show('Display');
    $('dBigCode').textContent = res.code;
    $('dCode').textContent = res.code;
  });
};

$('btnBeControl').onclick = () => {
  Sound.unlock(); Sound.click();
  role = 'control';
  localStorage.setItem('ludoRole', 'control');
  show('Control');
  $('ctrlJoin').style.display = '';
  $('ctrlSetup').style.display = 'none';
  $('ctrlGame').style.display = 'none';
};

/* ============ CONTROLLER: JOIN ============ */
$('ctrlJoinBtn').onclick = () => {
  const code = $('ctrlCodeInput').value.trim().toUpperCase();
  if (code.length < 4) return toast('Invalid code');
  Sound.click();
  socket.emit('joinRoom', { role: 'controller', code }, res => {
    if (!res.ok) return toast(res.error || 'Failed');
    $('ctrlJoin').style.display = 'none';
    $('ctrlSetup').style.display = '';
  });
};

$('ctrlCodeInput').addEventListener('input', e => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});

/* ============ CONTROLLER: START ============ */
$('ctrlStartBtn').onclick = () => {
  const names = [...document.querySelectorAll('.nameIn')].map((inp, i) =>
    inp.value.trim() || ('Player ' + (i + 1))
  );
  Sound.click();
  socket.emit('setupPlayers', { names });
  setTimeout(() => socket.emit('start'), 100);
};

/* ============ SOCKET: room updates ============ */
socket.on('room', r => {
  room = r;

  if (role === 'display') renderDisplay();
  if (role === 'control') renderControl();

  /* sync instant positions */
  if (r.tokens) {
    LudoBoard.COLORS.forEach(c => {
      for (let i = 0; i < 4; i++) {
        if (!anims[c][i]) {
          renderPos[c][i] = LudoBoard.posToXY(c, r.tokens[c][i], i);
        }
      }
    });
  }
});

socket.on('started', () => {
  if (role === 'display') {
    $('dWaitOv').classList.remove('show');
    resizeDisplay();
  }
  if (role === 'control') {
    $('ctrlSetup').style.display = 'none';
    $('ctrlGame').style.display = '';
  }
  Sound.six();
});

/* ============ DICE ROLLED ============ */
socket.on('diceRolled', ({ value, forfeit, noMoves, isBonus }) => {
  diceBusy = true;
  Sound.dice();
  spinDice(value);
  setTimeout(() => {
    if (forfeit) { Sound.error(); toast('3 sixes — turn passed'); }
    else if (noMoves) { Sound.error(); toast('No move'); }
    else if (value === 6) { Sound.six(); toast('SIX! Bonus 3 coming…'); }
    else if (isBonus) { Sound.six(); toast('🎁 Bonus 3!'); }
    else Sound.land();
  }, 900);
  setTimeout(() => { diceBusy = false; }, 1250);
});

/* ============ TOKEN MOVED ============ */
socket.on('moved', ({ color, token, from, to, captured }) => {
  const pts = [];
  if (from === -1) pts.push(LudoBoard.posToXY(color, 0, token));
  else for (let p = from + 1; p <= to; p++) pts.push(LudoBoard.posToXY(color, p, token));

  startAnim(color, token, pts, 80, () => {
    if (to === 56) Sound.home(); else Sound.land();
  });

  (captured || []).forEach(c => {
    setTimeout(() => {
      startAnim(c.color, c.token, [LudoBoard.posToXY(c.color, -1, c.token)], 200, null);
      Sound.capture();
    }, 420);
  });
});

socket.on('gameOver', ({ color }) => {
  Sound.win();
  $('winText').textContent = `${cap(color)} Wins!`;
  $('winOv').classList.add('show');
});

socket.on('toast', m => toast(m));

/* =========================================================
   DISPLAY RENDER
   ========================================================= */
function renderDisplay() {
  if (!room) return;
  $('dCode').textContent = room.code;
  $('dBigCode').textContent = room.code;

  if (room.state === 'lobby') {
    $('dWaitOv').classList.add('show');
    $('dTurnBanner').textContent = room.hasController
      ? `Controller connected · Setup in progress…`
      : `Waiting for controller…`;
    return;
  }
  $('dWaitOv').classList.remove('show');

  $('dTurnBanner').textContent = room.message || '';
  $('dTurnBanner').style.background = room.turnColor
    ? LudoBoard.HEX[room.turnColor] + '33' : '';
  $('dTurnBanner').style.borderColor = room.turnColor
    ? LudoBoard.HEX[room.turnColor] : '';

  if (room.dice) {
    $('dDice').style.display = '';
    $('dDice').textContent = '🎲 ' + room.dice;
  } else $('dDice').style.display = 'none';

  const pd = $('dPlayers');
  pd.innerHTML = '';
  room.players.forEach((p, i) => {
    const card = document.createElement('div');
    card.className = 'dpCard' + (room.turnColor === p.color ? ' active' : '');
    card.style.borderColor = LudoBoard.HEX[p.color];
    card.innerHTML = `
      <span class="dpDot" style="background:${LudoBoard.HEX[p.color]};color:${LudoBoard.HEX[p.color]}"></div>
      <span class="dpName">${p.name}</span>`;
    pd.appendChild(card);
  });
}

/* =========================================================
   CONTROLLER RENDER
   ========================================================= */
function renderControl() {
  if (!room) return;

  if (room.state === 'lobby') {
    if (!$('ctrlSetup').style.display || $('ctrlSetup').style.display === 'none') return;
    $('ctrlSetupHint').textContent = room.hasDisplay
      ? '✅ Display connected · Ready to start'
      : '⏳ Display connected: waiting…';
    $('ctrlStartBtn').disabled = !room.hasDisplay;
    return;
  }

  $('cCode').textContent = room.code;
  $('cTurnName').textContent = room.turnName || '—';
  $('cTurnName').style.color = room.turnColor
    ? LudoBoard.HEX[room.turnColor] : '#fff';

  const canRoll =
    room.state === 'playing' &&
    room.phase === 'roll' &&
    !diceBusy &&
    !room.winner &&
    !room.pendingThree;

  $('cRollBtn').disabled = !canRoll;
  $('cRollBtn').textContent = room.pendingThree
    ? '🎁 BONUS 3…'
    : (canRoll ? 'ROLL' : '…');

  $('cDiceVal').textContent = room.dice || (room.forcedDice ? `[${room.forcedDice}]` : '—');

  /* move buttons */
  const mv = $('cMoveBtns');
  mv.innerHTML = '';
  if (room.phase === 'move' && room.legalMoves) {
    room.legalMoves.forEach(i => {
      const b = document.createElement('button');
      b.className = 'moveBtn';
      b.textContent = 'Token ' + (i + 1);
      b.onclick = () => { Sound.click(); socket.emit('move', { token: i }); };
      mv.appendChild(b);
    });
    if (!room.legalMoves.length) mv.innerHTML = '<span style="color:#888;font-size:12px">No moves</span>';
  } else {
    mv.innerHTML = '<span style="color:#666;font-size:12px">Roll dice first</span>';
  }

  /* player list */
  const pl = $('cPlayerList');
  pl.innerHTML = '';
  room.players.forEach((p, i) => {
    const d = document.createElement('div');
    d.className = 'cPlRow' + (room.turnColor === p.color ? ' active' : '');
    d.style.borderColor = LudoBoard.HEX[p.color];
    d.innerHTML = `
      <span class="cPlDot" style="background:${LudoBoard.HEX[p.color]};color:${LudoBoard.HEX[p.color]}"></span>
      <span class="cPlName">${p.name}</span>
      <span class="cPlColor">${cap(p.color)}</span>`;
    pl.appendChild(d);
  });

  /* force dice highlight */
  document.querySelectorAll('.forceBtns button').forEach(b => {
    b.classList.toggle('on', +b.dataset.v === room.forcedDice);
  });
}

/* ============ CONTROLLER BUTTONS ============ */
$('cRollBtn').onclick = () => {
  if ($('cRollBtn').disabled) return;
  Sound.click();
  socket.emit('roll');
};

$('cSkipBtn').onclick = () => {
  if (!confirm('Skip current turn?')) return;
  socket.emit('skip');
};

$('cRestartBtn').onclick = () => {
  if (!confirm('Restart game?')) return;
  socket.emit('restart');
};

$('againBtn').onclick = () => {
  $('winOv').classList.remove('show');
  socket.emit('restart');
};

document.querySelectorAll('.forceBtns button').forEach(b => {
  b.onclick = () => {
    Sound.click();
    socket.emit('forceDice', { value: +b.dataset.v || 0 });
  };
});

/* ============ SOUND TOGGLE ============ */
$('dSoundBtn').onclick = $('cSoundBtn').onclick = e => {
  soundOn = !soundOn;
  Sound.setMuted(!soundOn);
  e.target.textContent = soundOn ? '🔊' : '🔇';
  if (soundOn) Sound.click();
};

/* =========================================================
   DICE VISUAL
   ========================================================= */
const DICE_ROT = {
  1:[0,0], 2:[0,-90], 3:[-90,0], 4:[90,0], 5:[0,90], 6:[0,180]
};

function spinDice(value) {
  const [bx, by] = DICE_ROT[value];
  diceSpin += 720;
  const dice = $('dDiceVisual') || document.querySelector('.dice');
  if (dice) dice.style.transform = `rotateX(${diceSpin+bx}deg) rotateY(${diceSpin+by}deg)`;
  /* also spin in display's dice box - just show emoji on display */
  const dv = $('dDice');
  if (dv) {
    dv.textContent = '🎲 …';
    setTimeout(() => { dv.textContent = '🎲 ' + value; }, 900);
  }
}

/* =========================================================
   ANIMATION
   ========================================================= */
function startAnim(color, idx, pts, dur, onDone) {
  if (!pts.length) { if (onDone) onDone(); return; }
  anims[color][idx] = {
    pts, from: { ...renderPos[color][idx] }, seg: 0, t: 0, dur, onDone
  };
}

function updateAnims(dt) {
  LudoBoard.COLORS.forEach(c => {
    for (let i = 0; i < 4; i++) {
      const a = anims[c][i];
      if (!a) continue;
      a.t += dt;
      while (a.t >= a.dur && a.seg < a.pts.length) {
        a.t -= a.dur;
        a.seg++;
        if (a.seg < a.pts.length) Sound.step();
      }
      if (a.seg >= a.pts.length) {
        const last = a.pts[a.pts.length - 1];
        renderPos[c][i] = { x: last.x, y: last.y };
        anims[c][i] = null;
        if (a.onDone) a.onDone();
        continue;
      }
      const p0 = a.seg === 0 ? a.from : a.pts[a.seg - 1];
      const p1 = a.pts[a.seg];
      const k = Math.min(1, a.t / a.dur);
      renderPos[c][i] = {
        x: p0.x + (p1.x - p0.x) * k,
        y: p0.y + (p1.y - p0.y) * k - Math.sin(k * Math.PI) * 13
      };
    }
  });
}

/* =========================================================
   RENDER LOOP
   ========================================================= */
const displayCanvas = $('dBoard');
const displayCtx = displayCanvas.getContext('2d');

function draw() {
  if (role !== 'display') return;
  displayCtx.clearRect(0, 0, LudoBoard.SIZE, LudoBoard.SIZE);
  displayCtx.drawImage(LudoBoard.getBG(), 0, 0);

  LudoBoard.COLORS.forEach(color => {
    for (let i = 0; i < 4; i++) {
      const p = renderPos[color][i];
      const small = room && room.tokens && room.tokens[color][i] === 56;
      LudoBoard.drawToken(displayCtx, p.x, p.y, color, {
        movable: false, r: small ? 10 : 15
      });
    }
  });
}

let lastT = performance.now();
function loop(t) {
  const dt = Math.min(60, t - lastT);
  lastT = t;
  updateAnims(dt);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* ============ DISPLAY TAP → MOVE ============ */
displayCanvas.addEventListener('pointerdown', e => {
  if (!room || room.phase !== 'move' || !room.legalMoves) return;
  const rect = displayCanvas.getBoundingClientRect();
  const scale = LudoBoard.SIZE / rect.width;
  const x = (e.clientX - rect.left) * scale;
  const y = (e.clientY - rect.top) * scale;
  const my = room.turnColor;
  let best = -1, bestD = 34;
  room.legalMoves.forEach(i => {
    const p = renderPos[my][i];
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bestD) { bestD = d; best = i; }
  });
  if (best >= 0) {
    Sound.click();
    socket.emit('move', { token: best });
  }
});

function resizeDisplay() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  displayCanvas.width = LudoBoard.SIZE * dpr;
  displayCanvas.height = LudoBoard.SIZE * dpr;
  displayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resizeDisplay();
window.addEventListener('resize', resizeDisplay);
