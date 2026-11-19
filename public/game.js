const socket = io();

const COLORS = ['red', 'green', 'yellow', 'blue'];
const NAMES = ['Player 1', 'Player 2', 'Player 3', 'Player 4'];
const HEX = LudoBoard.HEX;

const state = {
  started: false, currentTurn: 0, dice: 0, sixStreak: 0,
  mustMove: false, legalMoves: [], winner: null,
  tokens: {
    red: [-1,-1,-1,-1], green: [-1,-1,-1,-1],
    yellow: [-1,-1,-1,-1], blue: [-1,-1,-1,-1]
  }
};

// ---------- DOM ----------
const landing = document.getElementById('landing');
const gameScreen = document.getElementById('game');
const turnBanner = document.getElementById('turnBanner');
const diceBox = document.getElementById('diceBox');
const rollBtn = document.getElementById('rollBtn');
const scoreboard = document.getElementById('scoreboard');
const CANVAS = document.getElementById('board');
const CTX = CANVAS.getContext('2d');
const controllerPanel = document.getElementById('controller');
const ctrlTurn = document.getElementById('ctrlTurn');
const ctrlDice = document.getElementById('ctrlDice');

// ---------- animation state ----------
const anim = { red:[null,null,null,null], green:[null,null,null,null],
               yellow:[null,null,null,null], blue:[null,null,null,null] };
const renderPos = { red:[], green:[], yellow:[], blue:[] };
let lastDice = 0;
let wasStarted = false;

function resetRenderPos() {
  COLORS.forEach(c => {
    renderPos[c] = [];
    for (let i = 0; i < 4; i++) {
      renderPos[c][i] = LudoBoard.posToXY(c, state.tokens[c][i], i);
      anim[c][i] = null;
    }
  });
}
resetRenderPos();

// ---------- socket ----------
socket.on('state', (s) => {
  Object.assign(state, s);
  if (s.started && !wasStarted) { resetRenderPos(); wasStarted = true; }
  if (!s.started) wasStarted = false;
  updateUI();
});

function updateUI() {
  // banner + scoreboard
  const color = COLORS[state.currentTurn];
  if (state.winner) {
    turnBanner.textContent = `🏆 ${NAMES[COLORS.indexOf(state.winner)]} জিতেছে!`;
    turnBanner.style.background = 'linear-gradient(90deg, #ffd166, #ef476f)';
  } else {
    turnBanner.textContent = `${NAMES[state.currentTurn]} এর পালা`;
    turnBanner.style.background = HEX[color];
  }
  ctrlTurn.textContent = state.started
    ? `${NAMES[state.currentTurn]} এর পালা${state.mustMove ? ' (মুভ করুন)' : ''}`
    : 'গেম শুরু হয়নি';

  // dice + animation
  if (state.dice !== lastDice) {
    const v = state.dice;
    diceBox.innerHTML = v ? diceSVG(v) : '–';
    ctrlDice.innerHTML = v ? diceSVG(v) : '–';
    if (v !== 0) {
      [diceBox, ctrlDice].forEach(el => {
        el.classList.remove('rolling'); void el.offsetWidth;
        el.classList.add('rolling');
      });
    }
    lastDice = v;
  }

  // token animations (compare render position vs new target)
  COLORS.forEach(c => {
    for (let i = 0; i < 4; i++) {
      const target = LudoBoard.posToXY(c, state.tokens[c][i], i);
      const cur = renderPos[c][i];
      if (!cur) { renderPos[c][i] = target; continue; }
      const dx = Math.abs(cur.x - target.x), dy = Math.abs(cur.y - target.y);
      if (dx > 0.5 || dy > 0.5) {
        // only animate "short hops" (not base→path resets which snap)
        if (state.tokens[c][i] === -1 || dx + dy > 300) {
          renderPos[c][i] = target;
          anim[c][i] = null;
        } else {
          anim[c][i] = { from: {...cur}, to: target, start: performance.now(), dur: 280 };
        }
      }
    }
  });

  // scoreboard counters
  document.querySelectorAll('.player-chip').forEach((chip, i) => {
    const c = chip.dataset.color;
    const home = state.tokens[c].filter(p => p === 56).length;
    chip.querySelector('.home').textContent = `${home}/4`;
    chip.classList.toggle('active', state.currentTurn === i && state.started);
  });
}

// ---------- Play Game ----------
document.getElementById('playBtn').addEventListener('click', () => {
  if (typeof Sound !== 'undefined' && Sound.unlock) Sound.unlock();
  if (!state.started) socket.emit('start');
  landing.classList.remove('show');
  gameScreen.classList.add('show');
});

// ---------- 7-tap on LANDING (Play Game বাদে) ----------
let tapCount = 0, tapTimer = null;
landing.addEventListener('click', (e) => {
  if (e.target.closest('#playBtn')) return;
  tapCount++;
  clearTimeout(tapTimer);
  tapTimer = setTimeout(() => { tapCount = 0; }, 1200);
  if (tapCount >= 7) {
    tapCount = 0;
    controllerPanel.classList.remove('hidden');
  }
});

// ---------- roll buttons ----------
rollBtn.addEventListener('click', () => {
  if (typeof Sound !== 'undefined' && Sound.unlock) Sound.unlock();
  socket.emit('roll');
});
document.getElementById('ctrlRollBtn').addEventListener('click', () => socket.emit('roll'));

// ---------- force dice ----------
document.querySelectorAll('.force-dice').forEach(b => {
  b.addEventListener('click', () => {
    const v = parseInt(b.dataset.value, 10);
    socket.emit('forceDice', v);
  });
});

document.getElementById('ctrlSkipBtn').addEventListener('click', () => socket.emit('skip'));
document.getElementById('ctrlResetBtn').addEventListener('click', () => socket.emit('reset'));
document.getElementById('ctrlCloseBtn').addEventListener('click', () => {
  controllerPanel.classList.add('hidden');
});

// ---------- token click on board ----------
CANVAS.addEventListener('click', (e) => {
  if (!state.mustMove || state.legalMoves.length === 0) return;
  const rect = CANVAS.getBoundingClientRect();
  const sx = CANVAS.width / rect.width;
  const sy = CANVAS.height / rect.height;
  const x = (e.clientX - rect.left) * sx;
  const y = (e.clientY - rect.top) * sy;
  const color = COLORS[state.currentTurn];

  let best = -1, bestDist = 46;
  state.legalMoves.forEach(i => {
    const pos = LudoBoard.posToXY(color, state.tokens[color][i], i);
    const d = Math.hypot(pos.x - x, pos.y - y);
    if (d < bestDist) { bestDist = d; best = i; }
  });
  if (best >= 0) {
    if (typeof Sound !== 'undefined' && Sound.land) Sound.land();
    socket.emit('move', { color, idx: best });
  }
});

// ---------- SVG dice ----------
function diceSVG(v) {
  const dots = {
    1:[[50,50]], 2:[[28,28],[72,72]],
    3:[[28,28],[50,50],[72,72]],
    4:[[28,28],[72,28],[28,72],[72,72]],
    5:[[28,28],[72,28],[50,50],[28,72],[72,72]],
    6:[[28,25],[72,25],[28,50],[72,50],[28,75],[72,75]]
  };
  const d = (dots[v]||[]).map(([x,y]) =>
    `<circle cx="${x}" cy="${y}" r="9" fill="#111"/>`).join('');
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="2" width="96" height="96" rx="18" fill="#fff" stroke="#cfd6e4" stroke-width="3"/>
    ${d}</svg>`;
}

// ---------- render loop ----------
const lerp = (a,b,t) => a + (b-a)*t;
const easeOut = t => 1 - Math.pow(1-t, 3);

function loop() {
  CTX.clearRect(0, 0, 600, 600);
  CTX.drawImage(LudoBoard.getBG(), 0, 0);
  const now = performance.now();
  const turnColor = COLORS[state.currentTurn];

  COLORS.forEach(c => {
    for (let i = 0; i < 4; i++) {
      const a = anim[c][i];
      let pos;
      if (a) {
        const t = Math.min(1, (now - a.start) / a.dur);
        pos = { x: lerp(a.from.x, a.to.x, easeOut(t)),
                y: lerp(a.from.y, a.to.y, easeOut(t)) };
        if (t >= 1) { renderPos[c][i] = a.to; anim[c][i] = null; }
      } else {
        pos = renderPos[c][i];
      }
      if (!pos) continue;
      const movable = state.mustMove && !state.winner &&
                      c === turnColor && state.legalMoves.includes(i);
      LudoBoard.drawToken(CTX, pos.x, pos.y, c, { movable, r: 14 });
    }
  });
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
