'use strict';

require('dotenv').config();

const { createServer } = require('http');
const { parse }        = require('url');
const next             = require('next');
const { WebSocketServer } = require('ws');
const path             = require('path');
const EngineBridge     = require('./server/engine-bridge');
const StockfishBridge  = require('./server/stockfish-bridge');
const mega             = require('./server/mega');
const match            = require('./server/match');
const engines          = require('./server/engines');

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

// Crea un bridge a partir de un id del registro (stockfish, lc0, ethereal, kallpa, …)
// o de una ruta UCI suelta (motores añadidos por el usuario).
function makeBridge(idOrOpts = {}) {
  const opts = typeof idOrOpts === 'string' ? { id: idOrOpts } : idOrOpts;
  const reg = opts.id ? engines.get(opts.id) : null;

  if (reg && reg.kind === 'kallpa') return new EngineBridge(reg.cmd);
  if (opts.kind === 'kallpa' && !reg) return new EngineBridge(KALLPA_PATH);

  // UCI: por registro, o por ruta suelta (opts.path), o Stockfish por defecto
  const cmd  = reg ? reg.cmd  : (opts.path || STOCKFISH_PATH);
  const args = reg ? reg.args : (opts.args || []);
  const uciOptions = reg ? reg.options : (opts.options || {});
  return new StockfishBridge(cmd, {
    args, options: uciOptions,
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

    // Módulos disponibles para el Match
    if (parsed.pathname === '/api/match/modules') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ modules: match.listModules() }));
      return;
    }

    // Match en vivo vía Server-Sent Events
    if (parsed.pathname === '/api/match/run') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      const send = (obj) => { try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch { /* noop */ } };
      const handle = match.runMatch({
        a: parsed.query.a, b: parsed.query.b,
        games: parsed.query.games, st: parsed.query.st, concurrency: parsed.query.concurrency,
      }, (ev) => {
        send(ev);
        if (ev.type === 'done' || ev.type === 'error') { try { res.end(); } catch { /* noop */ } }
      });
      req.on('close', () => handle.kill());
      return;
    }

    // Estado de la Mega (¿libro disponible?)
    if (parsed.pathname === '/api/mega-status') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ available: mega.available() }));
      return;
    }

    // Opening Explorer
    if (parsed.pathname === '/api/explorer') {
      const fen = String(parsed.query.fen || '');

      // Fuente local: Mega Database 2026
      if (parsed.query.source === 'mega') {
        const data = mega.query(fen);
        if (!data) {
          res.writeHead(503, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'mega-unavailable' }));
        } else {
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(data));
        }
        return;
      }

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

    let bridge = makeBridge({ id: ENGINE_KIND });
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

      // Cambio de motor en caliente (por id del registro o ruta UCI suelta)
      if (cmd === 'set_engine') {
        try { bridge.kill(); } catch { /* noop */ }
        try {
          bridge = makeBridge(payload);
          bridge.start();
          safeSend(ws, { event: 'set_engine', result: { ok: true, id: payload.id || payload.kind } });
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
