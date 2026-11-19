const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingTimeout: 20000 });

app.use(express.static(path.join(__dirname, 'public')));

/* ---------------- CONSTANTS ---------------- */
const rooms = new Map();
const COLORS = ['red', 'green', 'yellow', 'blue'];
const START  = { red: 0, green: 13, yellow: 26, blue: 39 };
const SAFE   = [0, 8, 13, 21, 26, 34, 39, 47];
const FINISH = 56;
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------------- HELPERS ---------------- */
const genCode = () => {
  let c;
  do { c = Math.random().toString(36).slice(2, 8).toUpperCase(); } while (rooms.has(c));
  return c;
};

const newTokens = () => ({
  red: [-1, -1, -1, -1],
  green: [-1, -1, -1, -1],
  yellow: [-1, -1, -1, -1],
  blue: [-1, -1, -1, -1]
});

function publicRoom(r) {
  return {
    code: r.code,
    hostId: r.hostId,
    maxPlayers: r.maxPlayers,
    players: r.players.map(p => ({
      id: p.id, name: p.name, color: p.color, connected: p.connected
    })),
    state: r.state,
    phase: r.phase,
    turnColor: r.order ? r.order[r.turnIndex] : null,
    dice: r.dice,
    legalMoves: r.legalMoves,
    sixStreak: r.sixStreak,
    tokens: r.tokens,
    winner: r.winner,
    message: r.message
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
          if (ot[j] >= 0 && ot[j] <= 50) {
            if ((START[oc] + ot[j]) % 52 === abs) {
              ot[j] = -1;
              captured.push({ color: oc, token: j });
            }
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
    const color = room.order[idx];
    const pl = room.players.find(p => p.color === color);
    if (pl && pl.connected) { room.turnIndex = idx; return; }
  }
  room.turnIndex = (room.turnIndex + 1) % n;
}

/* ---------------- SOCKET ---------------- */
io.on('connection', socket => {

  /* --- CREATE --- */
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
      state: 'lobby',
      phase: 'roll',
      tokens: null,
      order: null,
      turnIndex: 0,
      dice: null,
      legalMoves: [],
      sixStreak: 0,
      winner: null,
      message: ''
    };
    rooms.set(code, room);
    socket.join(code);
    socket.data.code = code;
    socket.data.playerId = playerId;
    cb({ ok: true, code });
    io.to(code).emit('room', publicRoom(room));
  });

  /* --- JOIN --- */
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
        id: playerId,
        name: (name || 'Player').slice(0, 12),
        color: free,
        connected: true
      });
    }
    socket.join(room.code);
    socket.data.code = room.code;
    socket.data.playerId = playerId;
    cb({ ok: true, code: room.code });
    io.to(room.code).emit('room', publicRoom(room));
  });

  /* --- PICK COLOR --- */
  socket.on('pickColor', ({ color }) => {
    const room = rooms.get(socket.data.code);
    if (!room || room.state !== 'lobby') return;
    if (!COLORS.includes(color)) return;
    if (room.players.some(p => p.color === color && p.id !== socket.data.playerId)) return;
    const me = room.players.find(p => p.id === socket.data.playerId);
    if (!me) return;
    me.color = color;
    io.to(room.code).emit('room', publicRoom(room));
  });

  /* --- START --- */
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
    room.message = `${cap(room.order[0])} starts`;
    io.to(room.code).emit('started');
    io.to(room.code).emit('room', publicRoom(room));
  });

  /* --- ROLL DICE --- */
  socket.on('roll', () => {
    const room = rooms.get(socket.data.code);
    if (!room || room.state !== 'playing' || room.phase !== 'roll' || room.winner) return;

    const me = room.players.find(p => p.id === socket.data.playerId);
    if (!me || me.color !== room.order[room.turnIndex]) return;

    const value = 1 + Math.floor(Math.random() * 6);
    room.dice = value;
    if (value === 6) room.sixStreak++; else room.sixStreak = 0;

    /* --- 3 sixes in a row => turn forfeited --- */
    if (room.sixStreak >= 3) {
      room.phase = 'anim';
      io.to(room.code).emit('room', publicRoom(room));
      io.to(room.code).emit('diceRolled', { color: me.color, value, forfeit: true });
      setTimeout(() => {
        room.sixStreak = 0;
        room.dice = null;
        room.legalMoves = [];
        advanceTurn(room);
        room.phase = 'roll';
        room.message = `${cap(me.color)} — 3 sixes! Turn passed 😅`;
        io.to(room.code).emit('room', publicRoom(room));
      }, 1500);
      return;
    }

    const moves = legalMoves(room, me.color, value);
    room.legalMoves = moves;

    /* --- no legal move --- */
    if (moves.length === 0) {
      room.phase = 'anim';
      io.to(room.code).emit('room', publicRoom(room));
      io.to(room.code).emit('diceRolled', { color: me.color, value, noMoves: true });
      setTimeout(() => {
        room.dice = null;
        room.legalMoves = [];
        if (value !== 6) { room.sixStreak = 0; advanceTurn(room); }
        room.phase = 'roll';
        room.message = `${cap(me.color)} — no move available`;
        io.to(room.code).emit('room', publicRoom(room));
      }, 1500);
      return;
    }

    room.phase = 'move';
    io.to(room.code).emit('room', publicRoom(room));
    io.to(room.code).emit('diceRolled', { color: me.color, value });
  });

  /* --- MOVE TOKEN --- */
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

    io.to(room.code).emit('room', publicRoom(room));
    io.to(room.code).emit('moved', { color: me.color, token, dice, ...res });

    setTimeout(() => {
      if (won) {
        room.winner = me.color;
        room.state = 'finished';
        room.phase = 'end';
        room.message = `${cap(me.color)} wins! 🏆`;
        io.to(room.code).emit('room', publicRoom(room));
        io.to(room.code).emit('gameOver', { color: me.color });
        return;
      }
      if (dice === 6) {
        room.phase = 'roll';
        room.message = `${cap(me.color)} rolled 6 — roll again! 🎯`;
      } else {
        room.sixStreak = 0;
        advanceTurn(room);
        room.phase = 'roll';
        room.message = `${cap(room.order[room.turnIndex])}'s turn`;
      }
      io.to(room.code).emit('room', publicRoom(room));
    }, Math.max(900, 220 * dice));
  });

  /* --- RESTART --- */
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
    io.to(room.code).emit('room', publicRoom(room));
  });

  /* --- DISCONNECT --- */
  socket.on('disconnect', () => {
    const room = rooms.get(socket.data.code);
    if (!room) return;
    const p = room.players.find(x => x.id === socket.data.playerId);
    if (p) p.connected = false;

    if (room.state === 'lobby') {
      room.players = room.players.filter(x => x.id !== socket.data.playerId);
      if (room.players.length === 0) { rooms.delete(room.code); return; }
      if (room.hostId === socket.data.playerId) room.hostId = room.players[0].id;
    }
    io.to(room.code).emit('room', publicRoom(room));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🎲 Ludo server running on port ${PORT}`));
