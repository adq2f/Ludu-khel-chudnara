// ============ STATE ============
const state = {
  players: ['Player 1', 'Player 2', 'Player 3', 'Player 4'],
  colors: ['red', 'green', 'yellow', 'blue'],
  currentTurn: 0,
  dice: 0,
  sixStreak: 0,
  mustMove: false,
  gameStarted: false,
  tokens: {
    red:    [-1, -1, -1, -1],
    green:  [-1, -1, -1, -1],
    yellow: [-1, -1, -1, -1],
    blue:   [-1, -1, -1, -1]
  },
  renderPos: {},
  legalMoves: []
};

// ============ DOM ============
const CANVAS = document.getElementById('board');
const CTX = CANVAS.getContext('2d');
const landing = document.getElementById('landing');
const gameScreen = document.getElementById('game');
const turnBanner = document.getElementById('turnBanner');
const diceBox = document.getElementById('diceBox');
const rollBtn = document.getElementById('rollBtn');
const timerText = document.getElementById('timerText');
const matchRunning = document.getElementById('matchRunning');
const matchRunningBtn = document.getElementById('matchRunningBtn');
const controllerPanel = document.getElementById('controller');
const ctrlTurn = document.getElementById('ctrlTurn');
const ctrlDice = document.getElementById('ctrlDice');
const ctrlRollBtn = document.getElementById('ctrlRollBtn');
const ctrlForceBtns = document.querySelectorAll('.force-dice');
const ctrlCloseBtn = document.getElementById('ctrlCloseBtn');
const ctrlSkipBtn = document.getElementById('ctrlSkipBtn');

// ============ TIMER ============
const ROLL_TIME = 20000;
let rollTimerId = null;
let rollTimeLeft = 0;

function startRollTimer() {
  stopRollTimer();
  rollTimeLeft = ROLL_TIME;
  updateTimerUI();
  rollTimerId = setInterval(() => {
    rollTimeLeft -= 100;
    updateTimerUI();
    if (rollTimeLeft <= 0) {
      stopRollTimer();
      flashMessage('⏰ সময় শেষ! অটো-রোল');
      autoRollDice();
    }
  }, 100);
}
function stopRollTimer() {
  if (rollTimerId) clearInterval(rollTimerId);
  rollTimerId = null;
  if (timerText) timerText.textContent = '';
}
function updateTimerUI() {
  if (!timerText) return;
  const s = Math.max(0, Math.ceil(rollTimeLeft / 1000));
  timerText.textContent = s + 's';
}

// ============ SVG DICE ============
function diceSVG(v) {
  const dotMap = {
    1: [[50,50]],
    2: [[28,28],[72,72]],
    3: [[28,28],[50,50],[72,72]],
    4: [[28,28],[72,28],[28,72],[72,72]],
    5: [[28,28],[72,28],[50,50],[28,72],[72,72]],
    6: [[28,25],[72,25],[28,50],[72,50],[28,75],[72,75]]
  };
  const dots = (dotMap[v] || []).map(([cx,cy]) =>
    `<circle cx="${cx}" cy="${cy}" r="9" fill="#1a1a1a"/>`).join('');
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="2" width="96" height="96" rx="18" fill="#ffffff" stroke="#d0d5e0" stroke-width="3"/>
    ${dots}
  </svg>`;
}
function setDice(v) {
  diceBox.innerHTML = v ? diceSVG(v) : '–';
  ctrlDice.innerHTML = v ? diceSVG(v) : '–';
}

// ============ START GAME ============
document.getElementById('playBtn').addEventListener('click', startGame);

function startGame() {
  if (typeof Sound !== 'undefined' && Sound.unlock) Sound.unlock();
  landing.classList.remove('show');
  gameScreen.classList.add('show');
  state.gameStarted = true;
  state.currentTurn = 0;
  state.sixStreak = 0;
  state.mustMove = false;
  state.dice = 0;
  state.legalMoves = [];
  state.tokens = {
    red:    [-1, -1, -1, -1],
    green:  [-1, -1, -1, -1],
    yellow: [-1, -1, -1, -1],
    blue:   [-1, -1, -1, -1]
  };
  state.renderPos = {};
  LudoBoard.COLORS.forEach(c => {
    state.renderPos[c] = [];
    for (let i = 0; i < 4; i++) {
      state.renderPos[c][i] = LudoBoard.posToXY(c, -1, i);
    }
  });
  updateTurnUI();
  startRollTimer();           // ⏱️ timer শুরু
  requestAnimationFrame(gameLoop);
}

// ============ LOOP ============
function gameLoop() {
  render();
  requestAnimationFrame(gameLoop);
}
function render() {
  const bg = LudoBoard.getBG();
  CTX.clearRect(0, 0, CANVAS.width, CANVAS.height);
  CTX.drawImage(bg, 0, 0);

  const turnColor = state.colors[state.currentTurn];
  LudoBoard.COLORS.forEach(color => {
    for (let i = 0; i < 4; i++) {
      const pos = state.renderPos[color] && state.renderPos[color][i];
      if (!pos) continue;
      const movable = state.mustMove && color === turnColor && state.legalMoves.includes(i);
      LudoBoard.drawToken(CTX, pos.x, pos.y, color, { movable, r: 14 });
    }
  });
}

// ============ TURN ============
function updateTurnUI() {
  const name = state.players[state.currentTurn];
  const color = state.colors[state.currentTurn];
  turnBanner.textContent = `${name} এর পালা`;
  turnBanner.style.background = LudoBoard.HEX[color];
  ctrlTurn.textContent = `${name} এর পালা`;
  rollBtn.disabled = false;
  rollBtn.classList.add('active');
  setDice(state.dice);
}
function nextTurn() {
  stopRollTimer();
  state.currentTurn = (state.currentTurn + 1) % 4;
  state.sixStreak = 0;
  state.mustMove = false;
  state.dice = 0;
  state.legalMoves = [];
  updateTurnUI();
  startRollTimer();
}

// ============ ROLL ============
function rollDice(forcedValue) {
  if (!state.gameStarted) return;
  if (state.mustMove) {
    flashMessage('আগে টোকেন মুভ/প্লেস করুন!');
    return;
  }
  stopRollTimer();

  const value = forcedValue != null ? forcedValue : 1 + Math.floor(Math.random() * 6);
  state.dice = value;
  setDice(value);
  if (typeof Sound !== 'undefined' && Sound.dice) Sound.dice();

  rollBtn.disabled = true;
  rollBtn.classList.remove('active');

  // --- 6 এর নিয়ম ---
  if (value === 6) {
    state.sixStreak++;
    if (state.sixStreak === 3) {
      flashMessage('৩ বার ছয়! পালা চলে গেল');
      if (typeof Sound !== 'undefined' && Sound.error) Sound.error();
      state.sixStreak = 0;
      state.mustMove = false;
      setTimeout(nextTurn, 900);
      return;
    }
    state.mustMove = true;
    computeLegalMoves(value);
    if (state.legalMoves.length === 0) {
      flashMessage('কোনো বৈধ মুভ নেই');
      state.mustMove = false;
      setTimeout(nextTurn, 800);
    }
    return;
  }

  // --- non-6 ---
  state.sixStreak = 0;
  state.mustMove = true;
  computeLegalMoves(value);
  if (state.legalMoves.length === 0) {
    flashMessage('কোনো বৈধ মুভ নেই');
    state.mustMove = false;
    setTimeout(nextTurn, 800);
  }
}

function autoRollDice() {
  if (!state.mustMove && state.gameStarted) {
    rollDice();
  }
}

function computeLegalMoves(dice) {
  const color = state.colors[state.currentTurn];
  const tokens = state.tokens[color];
  const moves = [];
  for (let i = 0; i < 4; i++) {
    const p = tokens[i];
    if (p === 56) continue;
    if (p === -1) {
      if (dice === 6) moves.push(i);
    } else if (p + dice <= 56) {
      moves.push(i);
    }
  }
  state.legalMoves = moves;
}

// ============ CLICK TOKEN ============
CANVAS.addEventListener('click', (e) => {
  if (!state.mustMove || state.legalMoves.length === 0) return;

  const rect = CANVAS.getBoundingClientRect();
  const scaleX = CANVAS.width / rect.width;
  const scaleY = CANVAS.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;

  const color = state.colors[state.currentTurn];
  let best = -1, bestDist = 46;

  state.legalMoves.forEach(i => {
    const pos = LudoBoard.posToXY(color, state.tokens[color][i], i);
    const d = Math.hypot(pos.x - x, pos.y - y);
    if (d < bestDist) { bestDist = d; best = i; }
  });

  if (best >= 0) moveToken(color, best, state.dice);
});

function moveToken(color, idx, dice) {
  const tokens = state.tokens[color];
  const from = tokens[idx];
  const to = from === -1 ? 0 : from + dice;
  tokens[idx] = to;
  state.renderPos[color][idx] = LudoBoard.posToXY(color, to, idx);
  state.mustMove = false;
  state.legalMoves = [];
  if (typeof Sound !== 'undefined' && Sound.land) Sound.land();

  // capture
  if (to >= 0 && to <= 50) {
    const abs = (LudoBoard.STARTS[color] + to) % 52;
    if (!LudoBoard.SAFE.includes(abs)) {
      state.colors.forEach(oc => {
        if (oc === color) return;
        const ot = state.tokens[oc];
        for (let j = 0; j < 4; j++) {
          if (ot[j] >= 0 && ot[j] <= 50) {
            const oAbs = (LudoBoard.STARTS[oc] + ot[j]) % 52;
            if (oAbs === abs) {
              ot[j] = -1;
              state.renderPos[oc][j] = LudoBoard.posToXY(oc, -1, j);
              if (typeof Sound !== 'undefined' && Sound.capture) Sound.capture();
            }
          }
        }
      });
    }
  }

  // win
  if (state.tokens[color].every(p => p === 56)) {
    flashMessage(`${state.players[state.currentTurn]} জিতেছে!`);
    if (typeof Sound !== 'undefined' && Sound.win) Sound.win();
    state.gameStarted = false;
    stopRollTimer();
    return;
  }

  // 6 → same player rolls again
  if (dice === 6 && state.sixStreak < 3) {
    state.mustMove = false;
    state.dice = 0;
    updateTurnUI();
    startRollTimer();
  } else {
    setTimeout(nextTurn, 350);
  }
}

// ============ MAIN ROLL BUTTON ============
rollBtn.addEventListener('click', () => rollDice());

// ============ 7-TAP ANYWHERE (except Play Game button) ============
let tapCount = 0;
let tapTimer = null;

document.addEventListener('click', (e) => {
  // Play Game বাটন এবং এর ভিতরে হলে গোনা হবে না
  if (e.target.closest('#playBtn')) return;
  // Controller নিজেই খোলা থাকলে গোনা হবে না
  if (e.target.closest('#controller')) return;
  // 1 Match Running / overlay নিজেও গোনা হবে না
  if (e.target.closest('#matchRunning')) return;

  tapCount++;
  clearTimeout(tapTimer);
  tapTimer = setTimeout(() => { tapCount = 0; }, 1200);

  if (tapCount >= 7) {
    tapCount = 0;
    openController();
  }
}, true);

function openController() {
  controllerPanel.classList.remove('hidden');
  ctrlTurn.textContent = state.players[state.currentTurn] + ' এর পালা';
}

matchRunningBtn.addEventListener('click', () => {
  matchRunning.classList.add('hidden');
  openController();
});

ctrlCloseBtn.addEventListener('click', () => {
  controllerPanel.classList.add('hidden');
});

ctrlRollBtn.addEventListener('click', () => {
  rollDice();
});

ctrlForceBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const v = parseInt(btn.dataset.value, 10);
    rollDice(v);
  });
});

if (ctrlSkipBtn) {
  ctrlSkipBtn.addEventListener('click', () => {
    controllerPanel.classList.add('hidden');
    nextTurn();
  });
}

// ============ HELPERS ============
function flashMessage(msg) {
  const el = document.createElement('div');
  el.className = 'flash';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1400);
}
