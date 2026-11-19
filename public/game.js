// ============ GAME STATE ============
const state = {
  players: ['Player 1', 'Player 2', 'Player 3', 'Player 4'],
  colors: ['red', 'green', 'yellow', 'blue'],
  currentTurn: 0,          // 0–3
  dice: 0,
  sixStreak: 0,            // পরপর ৬ এর count
  mustMove: false,         // 6 বা non-6 এর পর move বাধ্যতামূলক
  gameStarted: false,
  tokens: {},              // board.js অনুযায়ী ব্যবহার করবেন
};

// ============ DOM ============
const landing      = document.getElementById('landing');
const gameScreen   = document.getElementById('game');
const boardCanvas  = document.getElementById('board');
const turnBanner   = document.getElementById('turnBanner');
const diceValueEl  = document.getElementById('diceValue');
const playersInfo  = document.getElementById('playersInfo');

const matchRunning    = document.getElementById('matchRunning');
const matchRunningBtn = document.getElementById('matchRunningBtn');
const controllerPanel = document.getElementById('controller');
const ctrlTurn  = document.getElementById('ctrlTurn');
const ctrlDice  = document.getElementById('ctrlDice');

// ============ PLAY GAME ============
document.getElementById('playBtn').addEventListener('click', startGame);

function startGame() {
  landing.classList.add('hidden');
  gameScreen.classList.remove('hidden');
  state.gameStarted = true;
  state.currentTurn = 0;
  state.sixStreak = 0;
  state.mustMove = false;
  state.dice = 0;
  initTokens();          // board.js-এর token init (নিচে দেখুন)
  drawBoard();           // board.js-এর render
  updateTurnUI();
}

// ============ TURN UI ============
function updateTurnUI() {
  const name = state.players[state.currentTurn];
  const color = state.colors[state.currentTurn];
  turnBanner.textContent = `${name} er turn (${color})`;
  turnBanner.style.background = color;
  ctrlTurn.textContent = `${name} er turn`;
  diceValueEl.textContent = '–';
  ctrlDice.textContent = '–';
}

function nextTurn() {
  state.currentTurn = (state.currentTurn + 1) % 4;
  state.sixStreak = 0;
  state.mustMove = false;
  state.dice = 0;
  updateTurnUI();
  drawBoard();
}

// ============ DICE ROLL (মূল পরিবর্তন এখানে) ============
function rollDice() {
  if (!state.gameStarted) return;

  // ⚠️ আগের roll-এর move না হলে আবার roll করা যাবে না
  if (state.mustMove) {
    flashMessage('আগে token move/place করুন!');
    return;
  }

  // Random dice (চাইলে crypto.randomInt ব্যবহার করতে পারেন)
  const value = 1 + Math.floor(Math.random() * 6);
  state.dice = value;

  diceValueEl.textContent = value;
  ctrlDice.textContent   = value;

  if (value === 6) {
    state.sixStreak++;

    // 🎯 Rule: পরপর ৩ বার ৬ → turn পরের player-এ যাবে
    if (state.sixStreak === 3) {
      flashMessage('৩ বার ৬! Turn চলে গেল');
      state.mustMove = false;
      setTimeout(nextTurn, 900);
      return;
    }

    // 🎯 Rule: ৬ উঠলেই কিছু বসাতে/মুভ করতে হবে (skip নেই)
    state.mustMove = true;
    highlightLegalMoves(value);   // board.js ফাংশন
    return;
  }

  // Non-6
  state.sixStreak = 0;
  state.mustMove = true;
  highlightLegalMoves(value);

  // যদি কোনো legal move না থাকে → auto next turn
  if (!hasLegalMoves(value)) {
    flashMessage('কোনো move নেই');
    setTimeout(nextTurn, 800);
  }
}

// ============ 7-TAP CONTROLLER DETECTION ============
let tapCount = 0;
let tapTimer = null;

boardCanvas.addEventListener('click', () => {
  tapCount++;
  clearTimeout(tapTimer);
  tapTimer = setTimeout(() => { tapCount = 0; }, 1200);

  if (tapCount >= 7) {
    tapCount = 0;
    matchRunning.classList.remove('hidden');
  }
});

matchRunningBtn.addEventListener('click', () => {
  matchRunning.classList.add('hidden');
  controllerPanel.classList.remove('hidden');
});

document.getElementById('ctrlCloseBtn').addEventListener('click', () => {
  controllerPanel.classList.add('hidden');
});

// Controller থেকে roll
document.getElementById('ctrlRollBtn').addEventListener('click', rollDice);

// ============ HELPERS ============
function flashMessage(msg) {
  const el = document.createElement('div');
  el.className = 'flash';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

// board.js থেকে আসবে — নিচে minimal stub
function initTokens() {
  if (typeof window.__initBoardTokens === 'function') {
    window.__initBoardTokens();
  }
}
function drawBoard() {
  if (typeof window.__drawBoard === 'function') {
    window.__drawBoard(state);
  }
}
function highlightLegalMoves(v) {
  if (typeof window.__highlightLegalMoves === 'function') {
    window.__highlightLegalMoves(state, v);
  }
}
function hasLegalMoves(v) {
  if (typeof window.__hasLegalMoves === 'function') {
    return window.__hasLegalMoves(state, v);
  }
  return true;
}
