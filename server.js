'use strict';

require('dotenv').config();

const { createServer } = require('http');
const { parse }        = require('url');
const next             = require('next');
const { WebSocketServer } = require('ws');
const path             = require('path');
const EngineBridge     = require('./server/engine-bridge');

const dev  = process.env.NODE_ENV !== 'production';
const port = Number(process.env.PORT) || 3000;

const ENGINE_PATH = process.env.ENGINE_PATH
  ? path.resolve(__dirname, process.env.ENGINE_PATH)
  : path.resolve(__dirname, '../chess-motor/Chess_motor/cpp_engine/build/engine_server.exe');

const app    = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res, parse(req.url, true));
  });

  // WebSocket en /ws — una instancia del motor por cliente
  const wss = new WebSocketServer({ server, path: '/ws' });

  function safeSend(ws, data) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(data));
  }

  wss.on('connection', (ws, req) => {
    console.log('[ws] connect', req.socket.remoteAddress);

    const bridge = new EngineBridge(ENGINE_PATH);
    try {
      bridge.start();
      safeSend(ws, { event: 'ready' });
    } catch (err) {
      safeSend(ws, { event: 'error', message: err.message });
      ws.close();
      return;
    }

    ws.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      const { cmd, payload = {} } = msg;

      if (cmd === 'analyze') {
        bridge.startAnalyze(
          payload,
          (info)   => safeSend(ws, { event: 'analyze_info',   ...info }),
          (result) => safeSend(ws, { event: 'analyze_result', ...result }),
        );
        return;
      }
      if (cmd === 'stop_analysis') { bridge.stopAnalyze(); return; }

      try {
        const result = await bridge.send(cmd, payload);
        safeSend(ws, { event: cmd, result });
      } catch (err) {
        safeSend(ws, { event: cmd, result: { ok: false, error: err.message } });
      }
    });

    ws.on('close', () => { console.log('[ws] disconnect'); bridge.kill(); });
    ws.on('error', () => bridge.kill());
  });

  server.listen(port, () => {
    console.log(`\n  KallpaModulo Web  →  http://localhost:${port}\n`);
    console.log(`  Motor: ${ENGINE_PATH}\n`);
  });
});
