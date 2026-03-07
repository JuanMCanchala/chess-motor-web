'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const express = require('express');
const http    = require('http');
const { WebSocketServer } = require('ws');
const path    = require('path');
const EngineBridge = require('./engine-bridge');

// ─── Configuración ────────────────────────────────────────────────────────────

const ENGINE_PATH = process.env.ENGINE_PATH
  ? path.resolve(__dirname, '..', process.env.ENGINE_PATH)
  : path.resolve(__dirname, '../../../chess-motor/Chess_motor/cpp_engine/build/engine_server.exe');

const PORT = Number(process.env.PORT) || 3000;

// ─── Express ──────────────────────────────────────────────────────────────────

const app = express();

// Archivos estáticos del cliente
app.use(express.static(path.join(__dirname, '../client')));

// Servir chessground desde node_modules para que el cliente lo importe sin bundler
app.use('/chessground', express.static(path.join(__dirname, 'node_modules/chessground')));

// ─── HTTP + WebSocket ─────────────────────────────────────────────────────────

const server = http.createServer(app);
const wss    = new WebSocketServer({ server });

function safeSend(ws, data) {
  if (ws.readyState === ws.OPEN)
    ws.send(JSON.stringify(data));
}

wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`[ws] connect  ${ip}`);

  // Una instancia del motor por cliente WebSocket
  const bridge = new EngineBridge(ENGINE_PATH);

  try {
    bridge.start();
    safeSend(ws, { event: 'ready', enginePath: ENGINE_PATH });
  } catch (err) {
    safeSend(ws, { event: 'error', message: `No se pudo iniciar el motor: ${err.message}` });
    ws.close();
    return;
  }

  ws.on('message', async (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    const { cmd, payload = {} } = msg;

    // Comandos con streaming especial
    if (cmd === 'analyze') {
      bridge.startAnalyze(
        payload,
        (info)   => safeSend(ws, { event: 'analyze_info',   ...info }),
        (result) => safeSend(ws, { event: 'analyze_result', ...result }),
      );
      return;
    }

    if (cmd === 'stop_analysis') {
      bridge.stopAnalyze();
      return;
    }

    // Comandos estándar (request → response)
    try {
      const result = await bridge.send(cmd, payload);
      safeSend(ws, { event: cmd, result });
    } catch (err) {
      safeSend(ws, { event: cmd, result: { ok: false, error: err.message } });
    }
  });

  ws.on('close', () => {
    console.log(`[ws] disconnect ${ip}`);
    bridge.kill();
  });

  ws.on('error', (err) => {
    console.error(`[ws] error ${ip}:`, err.message);
    bridge.kill();
  });
});

// ─── Inicio ───────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`\n  KallpaModulo Web  →  http://localhost:${PORT}\n`);
  console.log(`  Motor: ${ENGINE_PATH}\n`);
});
