/* =========================================================
   Client — socket, UI, animation loop
   ========================================================= */

/* ---------- identity ---------- */
let myId = localStorage.getItem('ludoPlayerId');
if (!myId) {
  myId = 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  localStorage.setItem('ludoPlayerId', myId);
}

const socket = io();

/* ---------- dom ---------- */
const $ = id => document.getElementById(id);

const screens = {
  entry: $('screenEntry'),
  lobby: $('screenLobby'),
  game:  $('screenGame')
};

const canvas   = $('board');
const ctx      = canvas.getContext('2d');
const diceEl   = $('dice');
const rollBtn  = $('rollBtn');
const banner   = $('turnBanner');
const winOv    = $('winOverlay');

/* ---------- state ---------- */
let room = null;
let maxPlayers = 4;
let renderPos = {};          // renderPos[color][i] = {x,y}
let anims = {};              // anims[color][i] = {pts, from, seg, t, dur, onDone}
let diceBusy = false;
let spinAccum = 0;
let soundOn = true;

/* ---------- init render positions ---------- */
function initPositions() {
  renderPos = {};
  anims = {};
  LudoBoard.COLORS.forEach(c => {
    renderPos[c] = [];
    anims[c] = [];
    for (let i = 0; i < 4; i++) {
      renderPos[c][i] = LudoBoard.posToXY(c, -1, i);
      anims[c][i] = null;
    }
  });
}
initPositions();

/* ---------- pip builder for dice faces ---------- */
const PIPS = {
  1: [[2,2]],
  2: [[1,1],[3,3]],
  3: [[1,1],[2,2],[3,3]],
  4: [[1,1],[3,1],[1,3],[3,3]],
  5: [[1,1],[3,1],[2,2],[1,3],[3,3]],
  6: [[1,1],[3,1],[1,2],[3,2],[1,3],[3,3]]
};

document.querySelectorAll('.dice .face').forEach((face, idx) => {
  const v = idx + 1;
  face.innerHTML = '';
  PIPS[v].forEach(([c, r]) => {
    const d = document.createElement('div');
    d.className = 'pip';
    d.style.gridColumn = c;
    d.style.gridRow = r;
    face.appendChild(d);
  });
});

/* ---------- screen switch ---------- */
function show(name) {
  Object.values(screens).forEach(s => s.classList.remove('show'));
  screens[name].classList.add('show');
}

/* ---------- toast ---------- */
let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* =========================================================
   ENTRY SCREEN
   ========================================================= */
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

/* auto-join if URL has ?room=CODE */
(function autoJoin() {
  const p = new URLSearchParams(location.search);
  const code = p.get('room');
  if (code) {
    $('codeInput').value = code.toUpperCase();
    show('entry');
  }
})();

/* =========================================================
   SOCKET
   ========================================================= */
socket.on('room', r => {
  const prev = room;
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

  if (!prev && r.state === 'playing') syncPositionsInstant();
});

socket.on('started', () => {
  show('game');
  syncPositionsInstant();
  Sound.six();
  resizeCanvas();
});

socket.on('diceRolled', ({ color, value, forfeit, noMoves }) => {
  diceBusy = true;
  Sound.dice();
  spinTo(value);
  setTimeout(() => {
    if (forfeit) { Sound.error(); toast('3 sixes in a row — turn passed'); }
    else if (noMoves) { Sound.error(); toast('No legal move'); }
    else if (value === 6) Sound.six();
    else Sound.land();
  }, 900);
  setTimeout(() => { diceBusy = false; updateControls(); }, 1250);
});

socket.on('moved', ({ color, token, from, to, captured }) => {
  /* build waypoint list */
  const pts = [];
  if (from === -1) {
    pts.push(LudoBoard.posToXY(color, 0, token));
  } else {
    for (let p = from + 1; p <= to; p++) pts.push(LudoBoard.posToXY(color, p, token));
  }

  startAnim(color, token, pts, 118, () => {
    if (to === 56) Sound.home();
    else Sound.land();
  });

  (captured || []).forEach(c => {
    setTimeout(() => {
      const xy = LudoBoard.posToXY(c.color, -1, c.token);
      startAnim(c.color, c.token, [xy], 200, null);
      Sound.capture();
    }, 420);
  });
});

socket.on('gameOver', ({ color }) => {
  Sound.win();
  $('winText').textContent = `${cap(color)} Wins!`;
  winOv.classList.add('show');
});

socket.on('toast', m => { toast(m); Sound.error(); });

/* =========================================================
   LOBBY RENDER
   ========================================================= */
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

  /* empty slots */
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

/* =========================================================
   GAME RENDER
   ========================================================= */
function renderGame() {
  $('gameCode').textContent = room.code;

  /* sync tokens (in case of reconnect) */
  if (room.tokens) {
    LudoBoard.COLORS.forEach(c => {
      for (let i = 0; i < 4; i++) {
        if (!anims[c][i]) {
          const target = LudoBoard.posToXY(c, room.tokens[c][i], i);
          renderPos[c][i] = target;
        }
      }
    });
  }

  /* banner */
  const myColor = myPlayerColor();
  const isMyTurn = room.turnColor === myColor && room.state === 'playing';

  banner.textContent = room.message || (isMyTurn ? 'Your turn!' : '');
  banner.classList.toggle('my', isMyTurn);

  /* streak chip */
  const chip = $('streakChip');
  if (room.sixStreak > 0) {
    chip.style.display = '';
    chip.textContent = `6 × ${room.sixStreak}`;
  } else {
    chip.style.display = 'none';
  }

  updateControls();

  if (room.winner) {
    $('winText').textContent = `${cap(room.winner)} Wins!`;
    winOv.classList.add('show');
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
    !room.winner;

  rollBtn.disabled = !canRoll;
  rollBtn.textContent = canRoll ? 'ROLL' : (room.turnColor === myColor ? '…' : 'WAIT');

  if (room.state === 'finished' && room.hostId === myId) {
    $('againBtn').style.display = '';
  }
}

function myPlayerColor() {
  if (!room) return null;
  const me = room.players.find(p => p.id === myId);
  return me ? me.color : null;
}

/* ---------- roll ---------- */
rollBtn.onclick = () => {
  if (rollBtn.disabled) return;
  Sound.click();
  socket.emit('roll');
};

/* ---------- board tap → select token ---------- */
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

/* ---------- dice animation ---------- */
const BASE_ROT = {
  1: [0, 0],
  6: [0, 180],
  2: [0, -90],
  5: [0, 90],
  3: [-90, 0],
  4: [90, 0]
};

function spinTo(value) {
  const [bx, by] = BASE_ROT[value];
  spinAccum += 720;
  diceEl.style.transform =
    `rotateX(${spinAccum + bx}deg) rotateY(${spinAccum + by}deg)`;
}

/* =========================================================
   ANIMATION
   ========================================================= */
function startAnim(color, idx, pts, dur, onDone) {
  if (!pts.length) { if (onDone) onDone(); return; }
  anims[color][idx] = {
    pts,
    from: { ...renderPos[color][idx] },
    seg: 0,
    t: 0,
    dur,
    onDone
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
function draw() {
  ctx.clearRect(0, 0, LudoBoard.SIZE, LudoBoard.SIZE);
  ctx.drawImage(LudoBoard.getBG(), 0, 0);

  const my = myPlayerColor();
  const movable =
    room && room.phase === 'move' && room.turnColor === my
      ? room.legalMoves
      : [];

  LudoBoard.COLORS.forEach(color => {
    for (let i = 0; i < 4; i++) {
      const p = renderPos[color][i];
      const isMovable = color === my && movable.includes(i);
      const small = room && room.tokens && room.tokens[color][i] === 56;
      LudoBoard.drawToken(ctx, p.x, p.y, color, {
        movable: isMovable,
        r: small ? 10 : 15
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

/* =========================================================
   MISC
   ========================================================= */
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

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

/* sound toggle */
$('soundBtn').onclick = () => {
  soundOn = !soundOn;
  Sound.setMuted(!soundOn);
  $('soundBtn').textContent = soundOn ? '🔊' : '🔇';
  if (soundOn) Sound.click();
};

/* play again */
$('againBtn').onclick = () => {
  winOv.classList.remove('show');
  socket.emit('restart');
};

/* keyboard */
document.addEventListener('keydown', e => {
  if (e.code === 'Space' && !rollBtn.disabled) { e.preventDefault(); rollBtn.click(); }
});

/* unlock audio on first interaction */
['pointerdown', 'touchstart', 'keydown'].forEach(ev =>
  document.addEventListener(ev, () => Sound.unlock(), { once: true })
);
