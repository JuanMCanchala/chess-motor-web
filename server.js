'use strict';

require('dotenv').config();

const { createServer } = require('http');
const { parse }        = require('url');
const next             = require('next');
const { WebSocketServer } = require('ws');
const path             = require('path');
const EngineBridge     = require('./server/engine-bridge');
const StockfishBridge  = require('./server/stockfish-bridge');

const dev  = process.env.NODE_ENV !== 'production';
const port = Number(process.env.PORT) || 3000;

// ── Selección de motor ─────────────────────────────────────────────────────
// ENGINE_KIND=stockfish (por defecto)  → Stockfish vía adaptador UCI
// ENGINE_KIND=kallpa                   → motor propio KallpaModulo (engine_server.exe)
const ENGINE_KIND = (process.env.ENGINE_KIND || 'stockfish').toLowerCase();

const STOCKFISH_PATH = process.env.STOCKFISH_PATH
  || 'C:\\stockfish-windows-x86-64-avx2\\stockfish\\tauri-appsrc-tauribinariesstockfish-x86_64-pc-windows-gnu.exe';

const KALLPA_PATH = process.env.ENGINE_PATH
  ? path.resolve(__dirname, process.env.ENGINE_PATH)
  : path.resolve(__dirname, '../chess-motor/Chess_motor/cpp_engine/build/engine_server.exe');

function makeBridge(kind, opts = {}) {
  if (kind === 'kallpa') return new EngineBridge(KALLPA_PATH);
  // 'uci' = cualquier motor UCI externo (otros módulos): StockfishBridge es UCI genérico
  const enginePath = (kind === 'uci' && opts.path) ? opts.path : STOCKFISH_PATH;
  return new StockfishBridge(enginePath, {
    threads: opts.threads || Number(process.env.STOCKFISH_THREADS) || undefined,
    hash:    opts.hash    || Number(process.env.STOCKFISH_HASH)    || undefined,
    multipv: opts.multipv || undefined,
  });
}

const ENGINE_DESC = ENGINE_KIND === 'kallpa' ? KALLPA_PATH : `Stockfish (${STOCKFISH_PATH})`;

const app    = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    const parsed = parse(req.url, true);

    // Proxy del Opening Explorer de Lichess (evita problemas de red/CORS en el navegador)
    if (parsed.pathname === '/api/explorer') {
      const fen = String(parsed.query.fen || '');
      const source = parsed.query.source === 'lichess' ? 'lichess' : 'masters';
      const url = source === 'lichess'
        ? `https://explorer.lichess.ovh/lichess?fen=${encodeURIComponent(fen)}` +
          `&moves=15&topGames=0&recentGames=0&speeds=blitz,rapid,classical&ratings=2000,2200,2500`
        : `https://explorer.lichess.ovh/masters?fen=${encodeURIComponent(fen)}&moves=15&topGames=0`;
      try {
        const up = await fetch(url);
        const body = await up.text();
        res.writeHead(up.status, { 'content-type': 'application/json; charset=utf-8' });
        res.end(body);
      } catch (err) {
        res.writeHead(502, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'upstream', message: err.message }));
      }
      return;
    }

    handle(req, res, parsed);
  });

  // WebSocket en /ws — una instancia del motor por cliente
  const wss = new WebSocketServer({ server, path: '/ws' });

  function safeSend(ws, data) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(data));
  }

  wss.on('connection', (ws, req) => {
    console.log('[ws] connect', req.socket.remoteAddress);

    let bridge = makeBridge(ENGINE_KIND);
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

      // Cambio de motor en caliente (Stockfish ↔ KallpaModulo)
      if (cmd === 'set_engine') {
        try { bridge.kill(); } catch { /* noop */ }
        const kind = ['kallpa', 'uci'].includes(payload.kind) ? payload.kind : 'stockfish';
        try {
          bridge = makeBridge(kind, payload);
          bridge.start();
          safeSend(ws, { event: 'set_engine', result: { ok: true, kind } });
        } catch (err) {
          safeSend(ws, { event: 'set_engine', result: { ok: false, error: err.message } });
        }
        return;
      }

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
    console.log(`  Motor: ${ENGINE_DESC}\n`);
  });
});
