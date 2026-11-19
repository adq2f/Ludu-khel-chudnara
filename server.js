const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public'), {
  dotfiles: 'deny',
  index: 'index.html'
}));

const COLORS = ['red', 'green', 'yellow', 'blue'];
const STARTS = { red: 0, green: 13, yellow: 26, blue: 39 };
const SAFE = [0, 8, 13, 21, 26, 34, 39, 47];

function makeState() {
  return {
    started: false,
    currentTurn: 0,
    dice: 0,
    sixStreak: 0,
    mustMove: false,
    legalMoves: [],
    tokens: {
      red:    [-1, -1, -1, -1],
      green:  [-1, -1, -1, -1],
      yellow: [-1, -1, -1, -1],
      blue:   [-1, -1, -1, -1]
    },
    winner: null
  };
}
let state = makeState();

const broadcast = () => io.emit('state', state);

function legalMovesFor(color, dice) {
  const moves = [];
  const tokens = state.tokens[color];
  for (let i = 0; i < 4; i++) {
    const p = tokens[i];
    if (p === 56) continue;
    if (p === -1) { if (dice === 6) moves.push(i); }
    else if (p + dice <= 56) moves.push(i);
  }
  return moves;
}

function nextTurn() {
  state.currentTurn = (state.currentTurn + 1) % 4;
  state.sixStreak = 0;
  state.mustMove = false;
  state.dice = 0;
  state.legalMoves = [];
}

function applyRoll(value) {
  if (!state.started || state.mustMove || state.winner) return;
  state.dice = value;

  if (value === 6) {
    state.sixStreak++;
    if (state.sixStreak === 3) {
      state.sixStreak = 0;
      nextTurn();
      return broadcast();
    }
    state.mustMove = true;
    state.legalMoves = legalMovesFor(COLORS[state.currentTurn], value);
    if (state.legalMoves.length === 0) nextTurn();
    return broadcast();
  }

  state.sixStreak = 0;
  state.mustMove = true;
  state.legalMoves = legalMovesFor(COLORS[state.currentTurn], value);
  if (state.legalMoves.length === 0) nextTurn();
  broadcast();
}

function applyMove(color, idx) {
  if (!state.started || !state.mustMove || state.winner) return;
  if (color !== COLORS[state.currentTurn]) return;
  if (!state.legalMoves.includes(idx)) return;

  const dice = state.dice;
  const from = state.tokens[color][idx];
  const to = from === -1 ? 0 : from + dice;
  state.tokens[color][idx] = to;
  state.mustMove = false;
  state.legalMoves = [];

  // capture
  if (to >= 0 && to <= 50) {
    const abs = (STARTS[color] + to) % 52;
    if (!SAFE.includes(abs)) {
      for (const oc of COLORS) {
        if (oc === color) continue;
        for (let j = 0; j < 4; j++) {
          const op = state.tokens[oc][j];
          if (op >= 0 && op <= 50) {
            if ((STARTS[oc] + op) % 52 === abs) state.tokens[oc][j] = -1;
          }
        }
      }
    }
  }

  if (state.tokens[color].every(p => p === 56)) {
    state.winner = color;
    return broadcast();
  }

  if (dice === 6 && state.sixStreak < 3) {
    state.dice = 0;
    broadcast();
  } else {
    nextTurn();
    broadcast();
  }
}

io.on('connection', (socket) => {
  socket.emit('state', state);

  socket.on('start', () => {
    if (state.started && !state.winner) return;
    state = makeState();
    state.started = true;
    broadcast();
  });

  socket.on('roll', () => applyRoll(crypto.randomInt(1, 7)));

  socket.on('forceDice', (v) => {
    if (Number.isInteger(v) && v >= 1 && v <= 6) applyRoll(v);
  });

  socket.on('move', (d) => {
    if (!d || typeof d.color !== 'string') return;
    applyMove(d.color, d.idx);
  });

  socket.on('skip', () => {
    if (!state.started) return;
    nextTurn();
    broadcast();
  });

  socket.on('reset', () => {
    state = makeState();
    broadcast();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`▶ http://localhost:${PORT}`));
