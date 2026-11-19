/* ============ identity ============ */
let myId = localStorage.getItem('ludoPlayerId');
if (!myId) {
  myId = 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  localStorage.setItem('ludoPlayerId', myId);
}

const socket = io();
const $ = id => document.getElementById(id);
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

/* ============ state ============ */
let room = null;
let maxPlayers = 4;
let renderPos = {}, anims = {};
let diceBusy = false;
let diceSpin = 0;
let soundOn = true;

let isController = false;
let controllerRoom = null;

LudoBoard.COLORS.forEach(c => {
  renderPos[c] = []; anims[c] = [];
  for (let i = 0; i < 4; i++) {
    renderPos[c][i] = LudoBoard.posToXY(c, -1, i);
    anims[c][i] = null;
  }
});

/* ============ screens ============ */
const screens = {
  entry: $('screenEntry'),
  lobby: $('screenLobby'),
  game:  $('screenGame')
};
function show(name) {
  Object.values(screens).forEach(s => s.classList.remove('show'));
  screens[name].classList.add('show');
}

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ============ dice faces ============ */
const PIPS = {
  1:[[2,2]], 2:[[1,1],[3,3]], 3:[[1,1],[2,2],[3,3]],
  4:[[1,1],[3,1],[1,3],[3,3]], 5:[[1,1],[3,1],[2,2],[1,3],[3,3]],
  6:[[1,1],[3,1],[1,2],[3,2],[1,3],[3,3]]
};
document.querySelectorAll('.dice .face').forEach((face, idx) => {
  face.innerHTML = PIPS[idx+1].map(([c,r]) =>
    `<div class="pip" style="grid-column:${c};grid-row:${r}"></div>`).join('');
});

/* ============ ENTRY ============ */
$('maxSeg').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  document.querySelectorAll('#maxSeg button').forEach(x => x.classList.remove('on'));
  b.classList.add('on');
  maxPlayers = +b.dataset.v;
  Sound.click();
});

$('nameInput').value = localStorage.getItem('ludoName') || '';

$('createBtn').onclick = () => {
  const name = $('nameInput').value.trim() || 'Player';
  localStorage.setItem('ludoName', name);
  Sound.unlock();
  socket.emit('createRoom', { name, maxPlayers, playerId: myId }, res => {
    if (!res.ok) return toast(res.error || 'Failed');
    show('lobby');
  });
};

$('joinBtn').onclick = () => {
  const name = $('nameInput').value.trim() || 'Player';
  const code = $('codeInput').value.trim().toUpperCase();
  if (code.length < 4) return toast('Enter a valid code');
  localStorage.setItem('ludoName', name);
  Sound.unlock();
  socket.emit('joinRoom', { code, name, playerId: myId }, res => {
    if (!res.ok) return toast(res.error || 'Failed');
    show('lobby');
  });
};

$('codeInput').addEventListener('input', e => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});

/* auto-join via URL */
(function() {
  const code = new URLSearchParams(location.search).get('room');
  if (code) $('codeInput').value = code.toUpperCase();
})();

/* ============ SECRET EMOJI ============ */
let emojiClicks = 0;
let emojiTimer;
$('secretEmoji').onclick = () => {
  emojiClicks++;
  clearTimeout(emojiTimer);
  emojiTimer = setTimeout(() => { emojiClicks = 0; }, 3000);
  if (emojiClicks >= 7) {
    emojiClicks = 0;
    $('ctrlModal').classList.add('show');
    Sound.click();
  }
};

$('ctrlClose').onclick = () => $('ctrlModal').classList.remove('show');

$('ctrlCodeIn').addEventListener('input', e => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});

$('ctrlJoinBtn').onclick = () => {
  const code = $('ctrlCodeIn').value.trim().toUpperCase();
  if (code.length < 4) return toast('Invalid code');
  socket.emit('joinAsController', { code }, res => {
    if (!res.ok) return toast(res.error || 'Failed');
    isController = true;
    controllerRoom = res.room;
    $('ctrlJoinForm').style.display = 'none';
    $('ctrlDash').style.display = '';
    renderController();
    toast('Controller connected ✅');
  });
};

/* ============ SOCKET: room (for players) ============ */
socket.on('room', r => {
  room = r;
  if (r.state === 'lobby') {
    renderLobby();
    if (!screens.lobby.classList.contains('show') && !screens.game.classList.contains('show')) {
      show('lobby');
    }
    if (screens.game.classList.contains('show')) show('lobby');
  } else {
    renderGame();
    if (!screens.game.classList.contains('show')) show('game');
  }
});

socket.on('started', () => {
  show('game');
  syncPositionsInstant();
  Sound.six();
  resizeCanvas();
});

/* ============ SOCKET: controllerState ============ */
socket.on('controllerState', r => {
  if (!isController) return;
  controllerRoom = r;
  renderController();
});

/* ============ DICE ============ */
socket.on('diceRolled', ({ value, forfeit, noMoves, isBonus }) => {
  diceBusy = true;
  Sound.dice();
  spinTo(value);
  setTimeout(() => {
    if (forfeit) { Sound.error(); toast('3 sixes — turn passed'); }
    else if (noMoves) { Sound.error(); toast('No move'); }
    else if (value === 6 && !isBonus) { Sound.six(); toast('SIX! Bonus 3 coming…'); }
    else if (isBonus) { Sound.six(); toast('🎁 Bonus 3!'); }
    else Sound.land();
  }, 900);
  setTimeout(() => { diceBusy = false; updateControls(); }, 1250);
});

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
  $('winOverlay').classList.add('show');
});

socket.on('toast', m => { toast(m); Sound.error(); });

/* ============ LOBBY RENDER ============ */
function renderLobby() {
  $('lobbyCode').textContent = room.code;
  const list = $('lobbyPlayers');
  list.innerHTML = '';

  room.players.forEach(p => {
    const row = document.createElement('div');
    row.className = 'pRow' + (p.id === myId ? ' me' : '');

    const dot = document.createElement('div');
    dot.className = 'pDot';
    dot.style.background = LudoBoard.HEX[p.color];
    dot.style.color = LudoBoard.HEX[p.color];

    const nm = document.createElement('div');
    nm.className = 'pName';
    nm.textContent = p.name;

    const tag = document.createElement('div');
    tag.className = 'pTag';
    tag.textContent = p.id === room.hostId ? 'HOST' : cap(p.color);

    row.append(dot, nm, tag);

    if (p.id === myId && room.state === 'lobby') {
      const pick = document.createElement('div');
      pick.className = 'colorPick';
      LudoBoard.COLORS.forEach(c => {
        const i = document.createElement('i');
        i.style.background = LudoBoard.HEX[c];
        const taken = room.players.some(x => x.color === c && x.id !== myId);
        if (taken) i.classList.add('dis');
        if (p.color === c) i.classList.add('on');
        i.onclick = () => { Sound.click(); socket.emit('pickColor', { color: c }); };
        pick.appendChild(i);
      });
      row.appendChild(pick);
    }
    list.appendChild(row);
  });

  for (let i = room.players.length; i < room.maxPlayers; i++) {
    const row = document.createElement('div');
    row.className = 'pRow';
    row.style.opacity = '.4';
    row.innerHTML = `<div class="pDot" style="background:#334155;color:#334155"></div>
                     <div class="pName">Waiting…</div>`;
    list.appendChild(row);
  }

  const isHost = room.hostId === myId;
  $('startBtn').style.display = isHost ? '' : 'none';
  $('startBtn').disabled = room.players.length < 2;
}

$('startBtn').onclick = () => { Sound.click(); socket.emit('start'); };
$('leaveBtn').onclick = () => location.reload();

/* ============ GAME RENDER ============ */
function renderGame() {
  $('gameCode').textContent = room.code;

  if (room.tokens) {
    LudoBoard.COLORS.forEach(c => {
      for (let i = 0; i < 4; i++) {
        if (!anims[c][i]) {
          renderPos[c][i] = LudoBoard.posToXY(c, room.tokens[c][i], i);
        }
      }
    });
  }

  const myColor = myPlayerColor();
  const isMyTurn = room.turnColor === myColor && room.state === 'playing';

  banner.textContent = room.message || (isMyTurn ? 'Your turn!' : '');
  banner.classList.toggle('my', isMyTurn);

  const chip = $('streakChip');
  if (room.sixStreak > 0) {
    chip.style.display = '';
    chip.textContent = `6 × ${room.sixStreak}`;
  } else chip.style.display = 'none';

  updateControls();

  if (room.winner) {
    $('winText').textContent = `${cap(room.winner)} Wins!`;
    $('winOverlay').classList.add('show');
  }
}

function updateControls() {
  if (!room) return;
  const myColor = myPlayerColor();
  const canRoll =
    room.state === 'playing' &&
    room.phase === 'roll' &&
    room.turnColor === myColor &&
    !diceBusy &&
    !room.winner &&
    !room.pendingThree;

  rollBtn.disabled = !canRoll;
  rollBtn.textContent = room.pendingThree
    ? '🎁 BONUS…'
    : (canRoll ? 'ROLL' : (room.turnColor === myColor ? '…' : 'WAIT'));

  if (room.state === 'finished' && room.hostId === myId) {
    $('againBtn').style.display = '';
  }
}

function myPlayerColor() {
  if (!room) return null;
  const me = room.players.find(p => p.id === myId);
  return me ? me.color : null;
}

/* ============ ROLL ============ */
rollBtn.onclick = () => {
  if (rollBtn.disabled) return;
  Sound.click();
  socket.emit('roll');
};

/* ============ BOARD TAP ============ */
canvas.addEventListener('pointerdown', e => {
  if (!room || room.phase !== 'move') return;
  if (room.turnColor !== myPlayerColor()) return;

  const rect = canvas.getBoundingClientRect();
  const scale = LudoBoard.SIZE / rect.width;
  const x = (e.clientX - rect.left) * scale;
  const y = (e.clientY - rect.top) * scale;

  const my = myPlayerColor();
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

/* ============ DICE SPIN ============ */
const BASE_ROT = {
  1: [0, 0], 6: [0, 180], 2: [0, -90],
  5: [0, 90], 3: [-90, 0], 4: [90, 0]
};

function spinTo(value) {
  const [bx, by] = BASE_ROT[value];
  diceSpin += 720;
  diceEl.style.transform = `rotateX(${diceSpin + bx}deg) rotateY(${diceSpin + by}deg)`;
}

/* ============ ANIM ============ */
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

/* ============ RENDER LOOP ============ */
function draw() {
  ctx.clearRect(0, 0, LudoBoard.SIZE, LudoBoard.SIZE);
  ctx.drawImage(LudoBoard.getBG(), 0, 0);

  const my = myPlayerColor();
  const movable = (room && room.phase === 'move' && room.turnColor === my)
    ? room.legalMoves : [];

  LudoBoard.COLORS.forEach(color => {
    for (let i = 0; i < 4; i++) {
      const p = renderPos[color][i];
      const isMovable = color === my && movable.includes(i);
      const small = room && room.tokens && room.tokens[color][i] === 56;
      LudoBoard.drawToken(ctx, p.x, p.y, color, {
        movable: isMovable, r: small ? 10 : 15
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

/* ============ MISC ============ */
function syncPositionsInstant() {
  if (!room || !room.tokens) return;
  LudoBoard.COLORS.forEach(c => {
    for (let i = 0; i < 4; i++) {
      renderPos[c][i] = LudoBoard.posToXY(c, room.tokens[c][i], i);
      anims[c][i] = null;
    }
  });
}

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = LudoBoard.SIZE * dpr;
  canvas.height = LudoBoard.SIZE * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

$('soundBtn').onclick = () => {
  soundOn = !soundOn;
  Sound.setMuted(!soundOn);
  $('soundBtn').textContent = soundOn ? '🔊' : '🔇';
  if (soundOn) Sound.click();
};

$('againBtn').onclick = () => {
  $('winOverlay').classList.remove('show');
  socket.emit('restart');
};

document.addEventListener('keydown', e => {
  if (e.code === 'Space' && !rollBtn.disabled) { e.preventDefault(); rollBtn.click(); }
});

['pointerdown', 'touchstart', 'keydown'].forEach(ev =>
  document.addEventListener(ev, () => Sound.unlock(), { once: true })
);

/* ============ CONTROLLER PANEL RENDER ============ */
function renderController() {
  if (!controllerRoom) return;

  $('ctrlMatchId').textContent = controllerRoom.code || '—';
  const cur = controllerRoom.players.find(p => p.id === controllerRoom.turnPlayerId);
  $('ctrlCurrent').textContent = cur
    ? `${cur.name} (${cap(cur.color)})`
    : '—';
  $('ctrlCurrent').style.color = cur ? LudoBoard.HEX[cur.color] : '#fff';

  const list = $('ctrlPlayersList');
  list.innerHTML = '';
  const fd = controllerRoom.forcedDice || {};

  controllerRoom.players.forEach(p => {
    const row = document.createElement('div');
    row.className = 'ctrlPRow';

    const info = document.createElement('div');
    info.className = 'ctrlPInfo';
    info.innerHTML = `
      <span class="ctrlDot" style="background:${LudoBoard.HEX[p.color]};color:${LudoBoard.HEX[p.color]}"></span>
      <span class="ctrlName">${p.name}</span>
      <span class="ctrlQueued">${fd[p.id] ? '→ ' + fd[p.id] : ''}</span>`;
    row.appendChild(info);

    const btns = document.createElement('div');
    btns.className = 'ctrlDiceBtns';
    for (let v = 1; v <= 6; v++) {
      const b = document.createElement('button');
      b.textContent = v;
      if (fd[p.id] === v) b.classList.add('on');
      b.onclick = () => {
        Sound.click();
        socket.emit('setPlayerDice', { playerId: p.id, value: v });
      };
      btns.appendChild(b);
    }
    row.appendChild(btns);
    list.appendChild(row);
  });
}

$('ctrlClearAll').onclick = () => {
  Sound.click();
  socket.emit('clearAllDice');
};
