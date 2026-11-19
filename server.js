const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingTimeout: 20000 });
app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();
const COLORS = ['red', 'green', 'yellow', 'blue'];
const START = { red: 0, green: 13, yellow: 26, blue: 39 };
const SAFE = [0, 8, 13, 21, 26, 34, 39, 47];
const FINISH = 56;
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

const genCode = () => {
  let c;
  do { c = Math.random().toString(36).slice(2, 8).toUpperCase(); } while (rooms.has(c));
  return c;
};

const newTokens = () => ({
  red: [-1,-1,-1,-1], green: [-1,-1,-1,-1],
  yellow: [-1,-1,-1,-1], blue: [-1,-1,-1,-1]
});

function publicRoom(r) {
  return {
    code: r.code,
    hasController: !!r.controllerId,
    hasDisplay: !!r.displayId,
    players: r.players,
    state: r.state,
    phase: r.phase,
    turnColor: r.order ? r.order[r.turnIndex] : null,
    turnName: r.order && r.players[r.turnIndex] ? r.players[r.turnIndex].name : null,
    dice: r.dice,
    legalMoves: r.legalMoves,
    sixStreak: r.sixStreak,
    tokens: r.tokens,
    winner: r.winner,
    message: r.message,
    pendingThree: r.pendingThree || false,
    forcedDice: r.forcedDice || null
  };
}

function legalMoves(r, color, dice) {
  const t = r.tokens[color];
  const out = [];
  for (let i = 0; i < 4; i++) {
    const p = t[i];
    if (p === FINISH) continue;
    if (p === -1) { if (dice === 6) out.push(i); continue; }
    if (p + dice <= FINISH) out.push(i);
  }
  return out;
}

function applyMove(r, color, tokenIdx, dice) {
  const t = r.tokens[color];
  const from = t[tokenIdx];
  const to = from === -1 ? 0 : from + dice;
  t[tokenIdx] = to;
  const captured = [];
  if (to >= 0 && to <= 50) {
    const abs = (START[color] + to) % 52;
    if (!SAFE.includes(abs)) {
      for (const oc of r.order) {
        if (oc === color) continue;
        const ot = r.tokens[oc];
        for (let j = 0; j < 4; j++) {
          if (ot[j] >= 0 && ot[j] <= 50 && (START[oc] + ot[j]) % 52 === abs) {
            ot[j] = -1;
            captured.push({ color: oc, token: j });
          }
        }
      }
    }
  }
  return { from, to, captured };
}

function advanceTurn(room) {
  const n = room.order.length;
  for (let i = 1; i <= n; i++) {
    const idx = (room.turnIndex + i) % n;
    if (room.players[idx]) { room.turnIndex = idx; return; }
  }
  room.turnIndex = (room.turnIndex + 1) % n;
}

/* ---------- AUTO-ROLL bonus 3 ---------- */
function scheduleBonusThree(code) {
  setTimeout(() => {
    const r = rooms.get(code);
    if (!r || r.phase !== 'roll' || !r.pendingThree || r.winner) return;
    r.dice = 3;
    r.pendingThree = false;
    const color = r.order[r.turnIndex];
    const moves3 = legalMoves(r, color, 3);
    r.legalMoves = moves3;
    io.to(code).emit('room', publicRoom(r));

    if (moves3.length === 0) {
      io.to(code).emit('diceRolled', { value: 3, isBonus: true, noMoves: true });
      setTimeout(() => {
        r.dice = null;
        r.legalMoves = [];
        advanceTurn(r);
        r.phase = 'roll';
        r.message = `${cap(r.order[r.turnIndex])}'s turn`;
        io.to(code).emit('room', publicRoom(r));
      }, 1500);
    } else {
      r.phase = 'move';
      io.to(code).emit('diceRolled', { value: 3, isBonus: true });
    }
  }, 2200);
}

io.on('connection', socket => {

  /* ============ CREATE ROOM ============ */
  socket.on('createRoom', ({ role }, cb) => {
    if (role !== 'controller' && role !== 'display') return cb({ ok: false });
    const code = genCode();
    const room = {
      code,
      controllerId: role === 'controller' ? socket.id : null,
      displayId: role === 'display' ? socket.id : null,
      players: [],
      state: 'lobby',
      phase: 'roll',
      tokens: null, order: null, turnIndex: 0,
      dice: null, legalMoves: [], sixStreak: 0,
      winner: null, message: '',
      pendingThree: false, forcedDice: null
    };
    rooms.set(code, room);
    socket.join(code);
    socket.data.code = code;
    socket.data.role = role;
    cb({ ok: true, code });
    io.to(code).emit('room', publicRoom(room));
  });

  /* ============ JOIN ROOM ============ */
  socket.on('joinRoom', ({ role, code }, cb) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!room) return cb({ ok: false, error: 'Room not found' });
    if (role === 'display') {
      if (room.displayId) return cb({ ok: false, error: 'Display already connected' });
      room.displayId = socket.id;
    } else if (role === 'controller') {
      if (room.controllerId) return cb({ ok: false, error: 'Controller already connected' });
      room.controllerId = socket.id;
    } else return cb({ ok: false });
    socket.join(room.code);
    socket.data.code = room.code;
    socket.data.role = role;
    cb({ ok: true });
    io.to(room.code).emit('room', publicRoom(room));
  });

  /* ============ SETUP PLAYERS (controller) ============ */
  socket.on('setupPlayers', ({ names }) => {
    const room = rooms.get(socket.data.code);
    if (!room || room.controllerId !== socket.id) return;
    if (room.state !== 'lobby') return;
    const arr = (names || []).slice(0, 4);
    while (arr.length < 2) arr.push('Player ' + (arr.length + 1));
    room.players = arr.map((n, i) => ({
      name: (n || 'Player ' + (i + 1)).slice(0, 12),
      color: COLORS[i]
    }));
    io.to(room.code).emit('room', publicRoom(room));
  });

  /* ============ START (controller) ============ */
  socket.on('start', () => {
    const room = rooms.get(socket.data.code);
    if (!room || room.controllerId !== socket.id) return;
    if (room.players.length < 2) return socket.emit('toast', 'Need at least 2 players');

    room.state = 'playing';
    room.tokens = newTokens();
    room.order = COLORS.slice(0, room.players.length);
    room.turnIndex = 0;
    room.dice = null;
    room.legalMoves = [];
    room.sixStreak = 0;
    room.winner = null;
    room.phase = 'roll';
    room.pendingThree = false;
    room.forcedDice = null;
    room.message = `${room.players[0].name}'s turn`;
    io.to(room.code).emit('started');
    io.to(room.code).emit('room', publicRoom(room));
  });

  /* ============ FORCE DICE ============ */
  socket.on('forceDice', ({ value }) => {
    const room = rooms.get(socket.data.code);
    if (!room || room.controllerId !== socket.id) return;
    room.forcedDice = (value >= 1 && value <= 6) ? value : null;
    io.to(room.code).emit('room', publicRoom(room));
  });

  /* ============ ROLL ============ */
  socket.on('roll', () => {
    const room = rooms.get(socket.data.code);
    if (!room || room.controllerId !== socket.id) return;
    if (room.state !== 'playing' || room.phase !== 'roll' || room.winner) return;

    let value, isBonus = false;

    if (room.forcedDice) {
      value = room.forcedDice;
      room.forcedDice = null;
    } else if (room.pendingThree) {
      value = 3;
      room.pendingThree = false;
      isBonus = true;
    } else {
      value = 1 + Math.floor(Math.random() * 6);
      if (value === 6) room.pendingThree = true;
    }

    room.dice = value;
    if (value === 6 && !isBonus) room.sixStreak++;
    else if (!isBonus) room.sixStreak = 0;

    if (room.sixStreak >= 3) {
      room.phase = 'anim';
      io.to(room.code).emit('room', publicRoom(room));
      io.to(room.code).emit('diceRolled', { value, forfeit: true, isBonus });
      setTimeout(() => {
        room.sixStreak = 0;
        room.dice = null;
        room.legalMoves = [];
        room.pendingThree = false;
        advanceTurn(room);
        room.phase = 'roll';
        room.message = `3 sixes! Turn passed`;
        io.to(room.code).emit('room', publicRoom(room));
      }, 1500);
      return;
    }

    const color = room.order[room.turnIndex];
    const moves = legalMoves(room, color, value);
    room.legalMoves = moves;

    if (moves.length === 0) {
      room.phase = 'anim';
      io.to(room.code).emit('room', publicRoom(room));
      io.to(room.code).emit('diceRolled', { value, noMoves: true, isBonus });
      setTimeout(() => {
        room.dice = null;
        room.legalMoves = [];
        if (value === 6 && !isBonus) {
          room.phase = 'roll';
          room.message = `Rolled 6, no move. Roll again!`;
        } else {
          if (value !== 6) room.sixStreak = 0;
          advanceTurn(room);
          room.phase = 'roll';
          room.message = `${room.players[room.turnIndex].name}'s turn`;
        }
        io.to(room.code).emit('room', publicRoom(room));
        if (room.pendingThree && room.phase === 'roll') scheduleBonusThree(room.code);
      }, 1500);
      return;
    }

    room.phase = 'move';
    io.to(room.code).emit('room', publicRoom(room));
    io.to(room.code).emit('diceRolled', { value, isBonus });
  });

  /* ============ MOVE (controller or display tap) ============ */
  socket.on('move', ({ token }) => {
    const room = rooms.get(socket.data.code);
    if (!room) return;
    if (room.controllerId !== socket.id && room.displayId !== socket.id) return;
    if (room.state !== 'playing' || room.phase !== 'move') return;
    if (!room.legalMoves.includes(token)) return;

    const color = room.order[room.turnIndex];
    const dice = room.dice;
    const res = applyMove(room, color, token, dice);

    room.dice = null;
    room.legalMoves = [];
    room.phase = 'anim';

    const won = room.tokens[color].every(p => p === FINISH);

    io.to(room.code).emit('room', publicRoom(room));
    io.to(room.code).emit('moved', { color, token, dice, ...res });

    setTimeout(() => {
      if (won) {
        room.winner = color;
        room.state = 'finished';
        room.phase = 'end';
        room.pendingThree = false;
        room.message = `${room.players.find(p => p.color === color).name} wins!`;
        io.to(room.code).emit('room', publicRoom(room));
        io.to(room.code).emit('gameOver', { color });
        return;
      }
      if (dice === 6) {
        room.phase = 'roll';
        room.message = `Rolled 6, bonus 3 coming`;
      } else {
        room.sixStreak = 0;
        advanceTurn(room);
        room.phase = 'roll';
        room.message = `${room.players[room.turnIndex].name}'s turn`;
      }
      io.to(room.code).emit('room', publicRoom(room));
      if (room.pendingThree && room.phase === 'roll') scheduleBonusThree(room.code);
    }, Math.max(700, 140 * dice));
  });

  /* ============ SKIP ============ */
  socket.on('skip', () => {
    const room = rooms.get(socket.data.code);
    if (!room || room.controllerId !== socket.id) return;
    if (room.state !== 'playing') return;
    room.dice = null;
    room.legalMoves = [];
    room.pendingThree = false;
    advanceTurn(room);
    room.phase = 'roll';
    room.message = `${room.players[room.turnIndex].name}'s turn`;
    io.to(room.code).emit('room', publicRoom(room));
  });

  /* ============ RESTART ============ */
  socket.on('restart', () => {
    const room = rooms.get(socket.data.code);
    if (!room || room.controllerId !== socket.id) return;
    room.state = 'lobby';
    room.phase = 'roll';
    room.tokens = null;
    room.order = null;
    room.turnIndex = 0;
    room.dice = null;
    room.legalMoves = [];
    room.sixStreak = 0;
    room.winner = null;
    room.message = '';
    room.pendingThree = false;
    room.forcedDice = null;
    io.to(room.code).emit('room', publicRoom(room));
  });

  /* ============ DISCONNECT ============ */
  socket.on('disconnect', () => {
    const room = rooms.get(socket.data.code);
    if (!room) return;
    if (room.controllerId === socket.id) {
      setTimeout(() => {
        const r = rooms.get(room.code);
        if (r && r.controllerId === socket.id) rooms.delete(room.code);
      }, 60000);
    }
    if (room.displayId === socket.id) {
      room.displayId = null;
      io.to(room.code).emit('room', publicRoom(room));
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🎲 Ludo on ${PORT}`));
