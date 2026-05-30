#!/usr/bin/env node
//
// minecraft_web_testing — ローカルサーバー + スマホ操作リレー
// =========================================================
// 静的ファイル配信 (index.html / controller.html / textures など) と、
// スマホをコントローラーにするための WebSocket リレーを 1 本で提供する。
// 外部パッケージは一切不要 (Node.js 標準モジュールのみ)。
//
// 使い方:
//   node server.js            # ポート 8000 で起動
//   PORT=3000 node server.js  # ポート変更
//
// PC で表示された "Network:" の URL を開き、画面の「📱 スマホで操作」から
// QR を読み取ると、同じ Wi-Fi のスマホがコントローラーになる。
//
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORT = process.env.PORT || 8000;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.mp3':  'audio/mpeg',
  '.ogg':  'audio/ogg',
  '.wav':  'audio/wav',
  '.glb':  'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.ico':  'image/x-icon',
};

// ===== 静的ファイル配信 =====
const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(ROOT, path.normalize(urlPath));
  // ルート外へのパストラバーサル防止
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

// ===== WebSocket リレー (RFC 6455 を最小実装) =====
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
// room コード -> そのルームに参加中のソケット集合
const rooms = new Map();

server.on('upgrade', (req, socket) => {
  if ((req.headers['upgrade'] || '').toLowerCase() !== 'websocket') {
    socket.destroy(); return;
  }
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
  );
  handleWs(socket);
});

function handleWs(socket) {
  socket.meta = { room: null, role: null };
  let buf = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    let frame;
    while ((frame = decodeFrame(buf))) {
      buf = frame.rest;
      if (frame.opcode === 0x8) {            // close
        try { socket.end(); } catch {}
        return;
      } else if (frame.opcode === 0x9) {     // ping -> pong
        try { socket.write(encodeFrame(frame.payload, 0xA)); } catch {}
      } else if (frame.opcode === 0x1) {     // text
        onMessage(socket, frame.payload.toString('utf8'));
      }
      // continuation(0x0) / binary(0x2) / pong(0xA) は使わないので無視
    }
  });
  socket.on('close', () => cleanup(socket));
  socket.on('error', () => cleanup(socket));
}

// バッファから 1 フレーム取り出す。未完なら null。
function decodeFrame(buf) {
  if (buf.length < 2) return null;
  const opcode = buf[0] & 0x0f;
  const masked = (buf[1] & 0x80) !== 0;
  let len = buf[1] & 0x7f;
  let offset = 2;
  if (len === 126) {
    if (buf.length < 4) return null;
    len = buf.readUInt16BE(2); offset = 4;
  } else if (len === 127) {
    if (buf.length < 10) return null;
    len = Number(buf.readBigUInt64BE(2)); offset = 10;
  }
  let mask;
  if (masked) {
    if (buf.length < offset + 4) return null;
    mask = buf.slice(offset, offset + 4); offset += 4;
  }
  if (buf.length < offset + len) return null;
  let payload = buf.slice(offset, offset + len);
  if (masked) {
    const out = Buffer.alloc(len);
    for (let i = 0; i < len; i++) out[i] = payload[i] ^ mask[i & 3];
    payload = out;
  }
  return { opcode, payload, rest: buf.slice(offset + len) };
}

// サーバー -> クライアントのフレーム (マスクなし)
function encodeFrame(data, opcode = 0x1) {
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x80 | opcode, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode; header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode; header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function onMessage(socket, text) {
  let msg;
  try { msg = JSON.parse(text); } catch { return; }
  if (msg.t === 'join') {
    const room = String(msg.room || '').slice(0, 16);
    if (!room) return;
    socket.meta.room = room;
    socket.meta.role = msg.role === 'host' ? 'host' : 'controller';
    if (!rooms.has(room)) rooms.set(room, new Set());
    rooms.get(room).add(socket);
    // 既存のピアに参加を通知
    broadcast(room, socket, JSON.stringify({ t: 'peer', role: socket.meta.role, event: 'join' }));
    return;
  }
  // それ以外は同じルームの相手にそのまま転送
  if (socket.meta.room) broadcast(socket.meta.room, socket, text);
}

function broadcast(room, except, text) {
  const set = rooms.get(room);
  if (!set) return;
  const frame = encodeFrame(text);
  for (const s of set) {
    if (s !== except && s.writable) {
      try { s.write(frame); } catch {}
    }
  }
}

function cleanup(socket) {
  const room = socket.meta && socket.meta.room;
  if (!room || !rooms.has(room)) return;
  const set = rooms.get(room);
  set.delete(socket);
  broadcast(room, socket, JSON.stringify({ t: 'peer', role: socket.meta.role, event: 'leave' }));
  if (set.size === 0) rooms.delete(room);
}

// ===== 起動 =====
server.listen(PORT, () => {
  const ips = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
    }
  }
  console.log('=== Minecraft Web (スマホ操作対応) サーバー起動 ===');
  console.log(`  ローカル: http://localhost:${PORT}/`);
  if (ips.length === 0) {
    console.log('  ※ ネットワークIPが見つかりませんでした (Wi-Fi未接続?)');
  }
  for (const ip of ips) {
    console.log(`  ★ PCで開く: http://${ip}:${PORT}/   ← この URL ならスマホ操作OK`);
  }
  console.log('スマホは同じ Wi-Fi に接続し、ゲーム画面の「📱 スマホで操作」のQRを読み取ってください。');
  console.log('停止: Ctrl+C');
});
