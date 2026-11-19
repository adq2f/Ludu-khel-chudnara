// ============ GAME STATE ============
const state = {
  players: ['Player 1', 'Player 2', 'Player 3', 'Player 4'],
  colors: ['red', 'green', 'yellow', 'blue'],
  currentTurn: 0,
  dice: 0,
  sixStreak: 0,
  mustMove: false,
  gameStarted: false,
  tokens: {
    red: [-1, -1, -1, -1],
    green: [-1, -1, -1, -1],
    yellow: [-1, -1, -1, -1],
    blue: [-1, -1, -1, -1]
  },
  legalMoves: [],
  renderPos: {}
};

// ============ DOM ============
const CANVAS = document.getElementById('board');
const CTX = CANVAS.getContext('2d');
const landing = document.getElementById('landing');
const gameScreen = document.getElementById('game');
const turnBanner = document.getElementById('turnBanner');
const diceBox = document.getElementById('diceBox');
const playersInfo = document.getElementById('playersInfo');
const matchRunning = document.getElementById('matchRunning');
const matchRunningBtn = document.getElementById('matchRunningBtn');
const controllerPanel = document.getElementById('controller');
const ctrlTurn = document.getElementById('ctrlTurn');
const ctrlDice = document.getElementById('ctrlDice');
const ctrlRollBtn = document.getElementById('ctrlRollBtn');
const ctrlCloseBtn = document.getElementById('ctrlCloseBtn');

// ============ START GAME ============
document.getElementById('playBtn').addEventListener('click', startGame);

function startGame() {
  Sound.unlock(); // সাউন্ড ইঞ্জিন চালু
  landing.classList.remove('show');
  gameScreen.classList.add('show');
  state.gameStarted = true;
  state.currentTurn = 0;
  state.sixStreak = 0;
  state.mustMove = false;
  state.dice = 0;
  state.legalMoves = [];
  // রিসেট টোকেন
  state.tokens = {
    red: [-1, -1, -1, -1],
    green: [-1, -1, -1, -1],
    yellow: [-1, -1, -1, -1],
    blue: [-1, -1, -1, -1]
  };
  // রেন্ডার পজিশন ইনিশিয়ালাইজ
  LudoBoard.COLORS.forEach(c => {
    state.renderPos[c] = [];
    for (let i = 0; i < 4; i++) {
      state.renderPos[c][i] = LudoBoard.posToXY(c, -1, i);
    }
  });
  updateTurnUI();
  requestAnimationFrame(gameLoop);
}

// ============ RENDER LOOP ============
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

// ============ TURN UI ============
function updateTurnUI() {
  const name = state.players[state.currentTurn];
  const color = state.colors[state.currentTurn];
  turnBanner.textContent = `${name} er turn (${color})`;
  turnBanner.style.background = LudoBoard.HEX[color];
  ctrlTurn.textContent = `${name} er turn`;
  diceBox.textContent = state.dice || '–';
  ctrlDice.textContent = state.dice || '–';
}

function nextTurn() {
  state.currentTurn = (state.currentTurn + 1) % 4;
  state.sixStreak = 0;
  state.mustMove = false;
  state.dice = 0;
  state.legalMoves = [];
  updateTurnUI();
}

// ============ DICE ROLL ============
function rollDice() {
  if (!state.gameStarted) return;
  if (state.mustMove) {
    flashMessage('আগে টোকেন মুভ/প্লেস করুন!');
    return;
  }

  const value = 1 + Math.floor(Math.random() * 6);
  state.dice = value;
  diceBox.textContent = value;
  ctrlDice.textContent = value;
  Sound.dice();

  // ---- 6 এর নিয়ম ----
  if (value === 6) {
    state.sixStreak++;
    if (state.sixStreak === 3) {
      flashMessage('৩ বার ৬! টার্ন চলে গেল');
      Sound.error();
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

  // ---- Non-6 ----
  state.sixStreak = 0;
  state.mustMove = true;
  computeLegalMoves(value);
  if (state.legalMoves.length === 0) {
    flashMessage('কোনো বৈধ মুভ নেই');
    state.mustMove = false;
    setTimeout(nextTurn, 800);
  }
}

function computeLegalMoves(dice) {
  const color = state.colors[state.currentTurn];
  const tokens = state.tokens[color];
  const moves = [];
  for (let i = 0; i < 4; i++) {
    const p = tokens[i];
    if (p === 56) continue; // ফিনিশ
    if (p === -1) {
      if (dice === 6) moves.push(i); // বেস থেকে বেরোতে ৬ লাগবে
    } else if (p + dice <= 56) {
      moves.push(i);
    }
  }
  state.legalMoves = moves;
}

// ============ TOKEN CLICK / MOVE ============
CANVAS.addEventListener('click', (e) => {
  handleTap(); // 7-ট্যাপ ডিটেকশন

  if (!state.mustMove || state.legalMoves.length === 0) return;

  const rect = CANVAS.getBoundingClientRect();
  const scaleX = CANVAS.width / rect.width;
  const scaleY = CANVAS.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;

  const color = state.colors[state.currentTurn];
  let best = -1;
  let bestDist = 40;

  state.legalMoves.forEach(i => {
    const pos = LudoBoard.posToXY(color, state.tokens[color][i], i);
    const d = Math.hypot(pos.x - x, pos.y - y);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });

  if (best >= 0) {
    moveToken(color, best, state.dice);
  }
});

function moveToken(color, idx, dice) {
  const tokens = state.tokens[color];
  const from = tokens[idx];
  const to = from === -1 ? 0 : from + dice;
  tokens[idx] = to;
  state.renderPos[color][idx] = LudoBoard.posToXY(color, to, idx);
  state.mustMove = false;
  state.legalMoves = [];
  Sound.land();

  // ক্যাপচার লজিক
  if (to >= 0 && to <= 50) {
    const abs = (LudoBoard.START[color] + to) % 52;
    if (!LudoBoard.SAFE.includes(abs)) {
      state.colors.forEach(oc => {
        if (oc === color) return;
        const ot = state.tokens[oc];
        for (let j = 0; j < 4; j++) {
          if (ot[j] >= 0 && ot[j] <= 50) {
            const oAbs = (LudoBoard.START[oc] + ot[j]) % 52;
            if (oAbs === abs) {
              ot[j] = -1;
              state.renderPos[oc][j] = LudoBoard.posToXY(oc, -1, j);
              Sound.capture();
            }
          }
        }
      });
    }
  }

  // জয় পরীক্ষা
  if (state.tokens[color].every(p => p === 56)) {
    flashMessage(`${state.players[state.currentTurn]} জিতেছে!`);
    Sound.win();
    state.gameStarted = false;
    return;
  }

  // ৬ হলে একই প্লেয়ার আবার রোল করবে (৩-বার স্ট্রিক নিয়মের অধীনে)
  if (dice === 6 && state.sixStreak < 3) {
    state.mustMove = false;
    state.dice = 0;
    updateTurnUI();
  } else {
    nextTurn();
  }
}

// ============ 7-TAP CONTROLLER ============
let tapCount = 0;
let tapTimer = null;

function handleTap() {
  tapCount++;
  clearTimeout(tapTimer);
  tapTimer = setTimeout(() => { tapCount = 0; }, 1200);
  if (tapCount >= 7) {
    tapCount = 0;
    matchRunning.classList.remove('hidden');
  }
}

matchRunningBtn.addEventListener('click', () => {
  matchRunning.classList.add('hidden');
  controllerPanel.classList.remove('hidden');
});

ctrlCloseBtn.addEventListener('click', () => {
  controllerPanel.classList.add('hidden');
});

ctrlRollBtn.addEventListener('click', () => {
  rollDice();
});

// ============ HELPERS ============
function flashMessage(msg) {
  const el = document.createElement('div');
  el.className = 'flash';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}
