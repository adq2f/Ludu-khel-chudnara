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

function publicRoom(r, isController) {
  const pub = {
    code: r.code,
    maxPlayers: r.maxPlayers,
    players: r.players.map(p => ({
      id: p.id, name: p.name, color: p.color, connected: p.connected
    })),
    state: r.state,
    phase: r.phase,
    turnColor: r.order ? r.order[r.turnIndex] : null,
    turnPlayerId: (r.order && r.players[r.turnIndex]) ? r.players[r.turnIndex].id : null,
    dice: r.dice,
    legalMoves: r.legalMoves,
    sixStreak: r.sixStreak,
    tokens: r.tokens,
    winner: r.winner,
    message: r.message,
    pendingThree: r.pendingThree || false
  };
  if (isController) {
    pub.forcedDice = r.forcedDice || {};
    pub.controllerActive = !!r.controllerId;
  }
  return pub;
}

function broadcast(room) {
  io.to(room.code).emit('room', publicRoom(room, false));
  if (room.controllerId) {
    io.to(room.controllerId).emit('controllerState', publicRoom(room, true));
  }
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
    const pl = room.players.find(p => p.color === room.order[idx]);
    if (pl && pl.connected) { room.turnIndex = idx; return; }
  }
  room.turnIndex = (room.turnIndex + 1) % n;
}

/* ============ AUTO bonus-3 roll ============ */
function scheduleBonusThree(code) {
  setTimeout(() => {
    const r = rooms.get(code);
    if (!r || r.phase !== 'roll' || !r.pendingThree || r.winner) return;
    const curPlayer = r.players[r.turnIndex];
    if (!curPlayer) return;
    if (r.forcedDice[curPlayer.id]) return; // controller intervened

    r.dice = 3;
    r.pendingThree = false;
    const color = r.order[r.turnIndex];
    const moves3 = legalMoves(r, color, 3);
    r.legalMoves = moves3;

    io.to(code).emit('diceRolled', { value: 3, isBonus: true });
    broadcast(r);

    if (moves3.length === 0) {
      setTimeout(() => {
        r.dice = null;
        r.legalMoves = [];
        advanceTurn(r);
        r.phase = 'roll';
        r.message = `${cap(r.order[r.turnIndex])}'s turn`;
        broadcast(r);
      }, 1200);
    } else {
      r.phase = 'move';
      broadcast(r);
    }
  }, 2200);
}

/* ============ SOCKET ============ */
io.on('connection', socket => {

  /* ---------- CREATE ---------- */
  socket.on('createRoom', ({ name, maxPlayers, playerId }, cb) => {
    const code = genCode();
    const room = {
      code,
      hostId: playerId,
      maxPlayers: Math.min(Math.max(maxPlayers || 4, 2), 4),
      players: [{
        id: playerId,
        name: (name || 'Player').slice(0, 12),
        color: COLORS[0],
        connected: true
      }],
      controllerId: null,
      forcedDice: {},
      state: 'lobby',
      phase: 'roll',
      tokens: null, order: null, turnIndex: 0,
      dice: null, legalMoves: [], sixStreak: 0,
      winner: null, message: '',
      pendingThree: false
    };
    rooms.set(code, room);
    socket.join(code);
    socket.data.code = code;
    socket.data.playerId = playerId;
    cb({ ok: true, code });
    broadcast(room);
  });

  /* ---------- JOIN AS PLAYER ---------- */
  socket.on('joinRoom', ({ code, name, playerId }, cb) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!room) return cb({ ok: false, error: 'Room not found' });

    let p = room.players.find(x => x.id === playerId);
    if (p) {
      p.connected = true;
      if (name) p.name = name.slice(0, 12);
    } else {
      if (room.state !== 'lobby') return cb({ ok: false, error: 'Game already started' });
      if (room.players.length >= room.maxPlayers) return cb({ ok: false, error: 'Room full' });
      const used = room.players.map(x => x.color);
      const free = COLORS.find(c => !used.includes(c));
      room.players.push({
        id: playerId, name: (name || 'Player').slice(0, 12),
        color: free, connected: true
      });
    }
    socket.join(room.code);
    socket.data.code = room.code;
    socket.data.playerId = playerId;
    cb({ ok: true, code: room.code });
    broadcast(room);
  });

  /* ---------- JOIN AS SECRET CONTROLLER ---------- */
  socket.on('joinAsController', ({ code }, cb) => {
    const room = rooms.get((code || '').toUpperCase());
    if (!room) return cb({ ok: false, error: 'Room not found' });
    if (room.controllerId && room.controllerId !== socket.id) {
      return cb({ ok: false, error: 'Another controller active' });
    }
    room.controllerId = socket.id;
    socket.join(room.code);
    socket.data.code = room.code;
    socket.data.isController = true;
    cb({ ok: true, room: publicRoom(room, true) });
    broadcast(room);
  });

  /* ---------- CONTROLLER: set dice for player ---------- */
  socket.on('setPlayerDice', ({ playerId, value }) => {
    const room = rooms.get(socket.data.code);
    if (!room || room.controllerId !== socket.id) return;
    if (value < 1 || value > 6) return;
    if (!room.players.find(p => p.id === playerId)) return;

    if (room.forcedDice[playerId] === value) {
      delete room.forcedDice[playerId]; // toggle off
    } else {
      room.forcedDice[playerId] = value;
    }
    broadcast(room);
  });

  socket.on('clearAllDice', () => {
    const room = rooms.get(socket.data.code);
    if (!room || room.controllerId !== socket.id) return;
    room.forcedDice = {};
    broadcast(room);
  });

  /* ---------- PICK COLOR ---------- */
  socket.on('pickColor', ({ color }) => {
    const room = rooms.get(socket.data.code);
    if (!room || room.state !== 'lobby') return;
    if (!COLORS.includes(color)) return;
    if (room.players.some(p => p.color === color && p.id !== socket.data.playerId)) return;
    const me = room.players.find(p => p.id === socket.data.playerId);
    if (!me) return;
    me.color = color;
    broadcast(room);
  });

  /* ---------- START ---------- */
  socket.on('start', () => {
    const room = rooms.get(socket.data.code);
    if (!room) return;
    if (room.hostId !== socket.data.playerId) return socket.emit('toast', 'Only host can start');
    if (room.players.length < 2) return socket.emit('toast', 'Need at least 2 players');

    room.state = 'playing';
    room.tokens = newTokens();
    room.order = COLORS.filter(c => room.players.some(p => p.color === c));
    room.turnIndex = 0;
    room.dice = null;
    room.legalMoves = [];
    room.sixStreak = 0;
    room.winner = null;
    room.phase = 'roll';
    room.pendingThree = false;
    room.message = `${cap(room.order[0])} starts`;
    io.to(room.code).emit('started');
    broadcast(room);
  });

  /* ---------- ROLL ---------- */
  socket.on('roll', () => {
    const room = rooms.get(socket.data.code);
    if (!room || room.state !== 'playing' || room.phase !== 'roll' || room.winner) return;

    const me = room.players.find(p => p.id === socket.data.playerId);
    if (!me || me.color !== room.order[room.turnIndex]) return;

    let value, isBonus = false;

    /* Priority 1: controller forced dice */
    if (room.forcedDice[me.id]) {
      value = room.forcedDice[me.id];
      delete room.forcedDice[me.id];
      room.pendingThree = (value === 6);
    }
    /* Priority 2: pending bonus 3 */
    else if (room.pendingThree) {
      value = 3;
      room.pendingThree = false;
      isBonus = true;
    }
    /* Priority 3: random */
    else {
      value = 1 + Math.floor(Math.random() * 6);
      room.pendingThree = (value === 6);
    }

    room.dice = value;

    if (value === 6 && !isBonus) room.sixStreak++;
    else if (!isBonus) room.sixStreak = 0;

    /* 3 sixes in a row */
    if (room.sixStreak >= 3) {
      room.phase = 'anim';
      broadcast(room);
      io.to(room.code).emit('diceRolled', { value, forfeit: true, isBonus });
      setTimeout(() => {
        room.sixStreak = 0;
        room.dice = null;
        room.legalMoves = [];
        room.pendingThree = false;
        advanceTurn(room);
        room.phase = 'roll';
        room.message = `${cap(me.color)} — 3 sixes! Turn passed`;
        broadcast(room);
      }, 1500);
      return;
    }

    const moves = legalMoves(room, me.color, value);
    room.legalMoves = moves;

    if (moves.length === 0) {
      room.phase = 'anim';
      broadcast(room);
      io.to(room.code).emit('diceRolled', { value, noMoves: true, isBonus });
      setTimeout(() => {
        room.dice = null;
        room.legalMoves = [];
        if (value === 6 && !isBonus) {
          room.phase = 'roll';
          room.message = `${cap(me.color)} rolled 6, no move — roll again`;
        } else {
          if (value !== 6) room.sixStreak = 0;
          room.pendingThree = false;
          advanceTurn(room);
          room.phase = 'roll';
          room.message = `${cap(room.order[room.turnIndex])}'s turn`;
        }
        broadcast(room);
      }, 1500);
      return;
    }

    room.phase = 'move';
    broadcast(room);
    io.to(room.code).emit('diceRolled', { value, isBonus });
  });

  /* ---------- MOVE ---------- */
  socket.on('move', ({ token }) => {
    const room = rooms.get(socket.data.code);
    if (!room || room.state !== 'playing' || room.phase !== 'move') return;

    const me = room.players.find(p => p.id === socket.data.playerId);
    if (!me || me.color !== room.order[room.turnIndex]) return;
    if (!room.legalMoves.includes(token)) return;

    const dice = room.dice;
    const res = applyMove(room, me.color, token, dice);

    room.dice = null;
    room.legalMoves = [];
    room.phase = 'anim';

    const won = room.tokens[me.color].every(p => p === FINISH);

    broadcast(room);
    io.to(room.code).emit('moved', { color: me.color, token, dice, ...res });

    setTimeout(() => {
      if (won) {
        room.winner = me.color;
        room.state = 'finished';
        room.phase = 'end';
        room.pendingThree = false;
        room.message = `${cap(me.color)} wins! 🏆`;
        broadcast(room);
        io.to(room.code).emit('gameOver', { color: me.color });
        return;
      }
      if (dice === 6) {
        room.phase = 'roll';
        room.message = `${cap(me.color)} — Bonus 3 coming…`;
        broadcast(room);
        scheduleBonusThree(room.code);
      } else {
        room.sixStreak = 0;
        room.pendingThree = false;
        advanceTurn(room);
        room.phase = 'roll';
        room.message = `${cap(room.order[room.turnIndex])}'s turn`;
        broadcast(room);
      }
    }, Math.max(600, 80 * dice));
  });

  /* ---------- RESTART ---------- */
  socket.on('restart', () => {
    const room = rooms.get(socket.data.code);
    if (!room) return;
    if (room.hostId !== socket.data.playerId) return;
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
    room.forcedDice = {};
    broadcast(room);
  });

  /* ---------- DISCONNECT ---------- */
  socket.on('disconnect', () => {
    const room = rooms.get(socket.data.code);
    if (!room) return;

    if (room.controllerId === socket.id) {
      room.controllerId = null;
      broadcast(room);
      return;
    }

    const p = room.players.find(x => x.id === socket.data.playerId);
    if (p) p.connected = false;

    if (room.state === 'lobby') {
      room.players = room.players.filter(x => x.id !== socket.data.playerId);
      if (room.players.length === 0) { rooms.delete(room.code); return; }
      if (room.hostId === socket.data.playerId) room.hostId = room.players[0].id;
    }
    broadcast(room);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🎲 Ludo on ${PORT}`));
