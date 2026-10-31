const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const { Room } = require('./src/room');

const PORT = process.env.PORT || 3000;
const ROOM_TTL_MS = 3 * 60 * 60 * 1000;
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const pub = path.join(__dirname, 'public');
app.use(express.static(pub));
app.get('/host', (req, res) => res.sendFile(path.join(pub, 'host.html')));
app.get('/play', (req, res) => res.sendFile(path.join(pub, 'play.html')));

const rooms = new Map();

function newCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function broadcast(room) {
  const hv = room.hostView();
  for (const sid of room.hostSockets) io.to(sid).emit('host:state', hv);
  for (const p of room.players.values()) {
    if (p.socketId) io.to(p.socketId).emit('player:state', room.playerView(p.id));
  }
}

function createRoom() {
  const code = newCode();
  const room = new Room(code, () => broadcast(room));
  rooms.set(code, room);
  return room;
}

const reply = (cb, data) => typeof cb === 'function' && cb(data);

io.on('connection', (socket) => {
  const room = () => rooms.get(socket.data.code);
  const leaveHostRoom = () => {
    const old = room();
    if (old && socket.data.role === 'host') old.hostSockets.delete(socket.id);
  };
  const asHost = (r) => {
    leaveHostRoom();
    socket.data = { role: 'host', code: r.code };
    r.hostSockets.add(socket.id);
  };

  // ---------- TV ----------

  socket.on('host:create', (_, cb) => {
    const r = createRoom();
    asHost(r);
    reply(cb, { code: r.code });
    broadcast(r);
  });

  socket.on('host:resume', ({ code } = {}, cb) => {
    const r = rooms.get(String(code || '').toUpperCase());
    if (!r) return reply(cb, { error: 'Room not found' });
    asHost(r);
    reply(cb, { code: r.code });
    broadcast(r);
  });

  socket.on('host:qr', ({ url } = {}, cb) => {
    QRCode.toDataURL(String(url), { margin: 1, width: 400 })
      .then((dataUrl) => reply(cb, { dataUrl }))
      .catch(() => reply(cb, { error: 'QR failed' }));
  });

  const hostOnly = (fn) => (msg = {}, cb) => {
    const r = room();
    if (!r || socket.data.role !== 'host') return reply(cb, { error: 'No room' });
    r.touch();
    const error = fn(r, msg);
    reply(cb, { error: error || null });
    broadcast(r);
  };

  socket.on('host:action', hostOnly((r, { action }) => r.control(action)));
  // The TV runs the mini-games and reports how each kid did.
  socket.on('host:result', hostOnly((r, { game, scores }) => r.hostResult(game, scores)));
  socket.on('host:found', hostOnly((r, { finder }) => r.hostFound(finder)));

  // ---------- phones ----------

  socket.on('player:join', ({ code, name, age, playerId } = {}, cb) => {
    const r = rooms.get(String(code || '').trim().toUpperCase());
    if (!r) return reply(cb, { error: 'No game with that code. Check the TV!' });
    const { player, error } = r.join(name, age, playerId);
    if (error) return reply(cb, { error });
    if (player.socketId && player.socketId !== socket.id) io.to(player.socketId).emit('player:replaced');
    player.socketId = socket.id;
    player.connected = true;
    socket.data = { role: 'player', code: r.code, playerId: player.id };
    r.touch();
    reply(cb, { code: r.code, playerId: player.id });
    broadcast(r);
  });

  socket.on('player:action', (msg = {}, cb) => {
    const r = room();
    if (!r || socket.data.role !== 'player') return reply(cb, { error: 'Not in a game' });
    const p = r.players.get(socket.data.playerId);
    if (!p) return reply(cb, { error: 'Not in a game' });
    r.touch();
    let error;
    if (msg.type === 'drawing') error = r.submitDrawing(p, msg.drawing);
    else if (msg.type === 'hide') error = r.hide(p, msg.spot);
    else if (p.id === r.vipId) error = r.control(msg.type);
    else error = 'Only the first player can do that';
    reply(cb, { error: error || null });
    broadcast(r);
  });

  // Live controls (mic level, flashlight position), relayed straight to the TV.
  // Volatile: if a packet is late it's useless anyway.
  socket.on('player:input', (msg = {}) => {
    const r = room();
    if (!r || socket.data.role !== 'player' || r.phase !== 'play') return;
    const p = r.players.get(socket.data.playerId);
    if (!p) return;
    let data;
    if (msg.kind === 'mic' && Number.isFinite(msg.e)) {
      data = { key: p.key, kind: 'mic', e: Math.max(0, Math.min(1, msg.e)) };
    } else if (msg.kind === 'light' && Number.isFinite(msg.x) && Number.isFinite(msg.y)) {
      data = { key: p.key, kind: 'light', x: Math.max(0, Math.min(1, msg.x)), y: Math.max(0, Math.min(1, msg.y)), on: !!msg.on };
    } else return;
    for (const sid of r.hostSockets) io.to(sid).volatile.emit('input', data);
  });

  socket.on('disconnect', () => {
    const r = room();
    if (!r) return;
    if (socket.data.role === 'host') r.hostSockets.delete(socket.id);
    else if (socket.data.role === 'player') {
      const p = r.players.get(socket.data.playerId);
      if (p && p.socketId === socket.id) {
        p.connected = false;
        p.socketId = null;
      }
    }
    broadcast(r);
  });
});

setInterval(() => {
  const cutoff = Date.now() - ROOM_TTL_MS;
  for (const [code, r] of rooms) {
    if (r.lastActive < cutoff && r.hostSockets.size === 0) {
      r.clearTimer();
      rooms.delete(code);
    }
  }
}, 10 * 60 * 1000).unref();

if (require.main === module) {
  server.listen(PORT, () => console.log(`Doodle Critters running on http://localhost:${PORT}`));
}

module.exports = { server, rooms };
