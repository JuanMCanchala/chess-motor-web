'use strict';

const { spawn }   = require('child_process');
const readline    = require('readline');
const fs          = require('fs');
const os          = require('os');
const { Chess }   = require('chess.js');

/**
 * StockfishBridge — reemplazo drop-in de EngineBridge que usa Stockfish (UCI).
 *
 * Stockfish solo habla UCI (texto) y no conoce reglas de alto nivel (SAN,
 * jugadas legales agrupadas, fin de partida, undo). Esa lógica la aporta
 * chess.js; Stockfish aporta búsqueda y evaluación.
 *
 * Expone la MISMA interfaz que EngineBridge:
 *   start(), send(cmd,payload), startAnalyze(payload,onInfo,onDone),
 *   stopAnalyze(), kill()
 *
 * Protocolo JSON (idéntico al motor KallpaModulo) consumido por el frontend:
 *   new_game {player_color,time_limit}     → {ok, fen}
 *   make_move {move_uci}                    → {ok, fen, san, move_uci, game_over, game_result}
 *   engine_move {}                          → {ok, fen, san, move_uci, game_over, game_result, eval_cp, eval_info}
 *   get_all_legal_moves {}                  → {ok, dests:{e2:['e3','e4'],…}}
 *   undo {}                                 → {ok, fen, move_history_san[], move_history_uci[]}
 *   analyze {fen,time_limit,multipv}       → stream {multipv,depth,score_cp,nodes,pv,pv_san}
 *                                            + {best_move,score_cp,depth,pv}
 *   stop_analysis {}
 *
 * Convención de evaluación: score_cp / eval_cp son SIEMPRE relativos a las
 * blancas (positivo = ventaja blanca), igual que el EvalBar del frontend.
 */
class StockfishBridge {
  constructor(enginePath, opts = {}) {
    this._path    = enginePath;
    this._threads = opts.threads || Math.max(1, (os.cpus().length || 2) - 1);
    this._hash    = opts.hash    || 256;          // MB de tabla de transposición
    this._multipv = opts.multipv || 3;            // líneas por defecto en análisis

    this._proc    = null;
    this._rl      = null;

    this._chess        = new Chess();
    this._sanHistory   = [];
    this._uciHistory   = [];
    this._timeLimit    = 3;                        // s para engine_move (lo fija new_game)

    // Estado de la búsqueda en curso (a lo más una a la vez)
    this._searchResolve = null;
    this._searchOnInfo  = null;
    this._searchFen     = null;
    this._lines         = {};                      // {multipv → info} de la búsqueda actual
    this._lastInfo      = null;                    // mejor línea (multipv 1)
  }

  // ── Ciclo de vida del proceso ─────────────────────────────────────────────

  start() {
    if (!fs.existsSync(this._path)) {
      throw new Error(`Stockfish no encontrado en "${this._path}"`);
    }

    this._proc = spawn(this._path, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    this._rl   = readline.createInterface({ input: this._proc.stdout });
    this._rl.on('line', (line) => this._onEngineLine(line.trim()));

    this._proc.on('error', (err) => console.error('[stockfish] error:', err.message));
    this._proc.on('exit',  (code, sig) => console.log(`[stockfish] exit code=${code} signal=${sig}`));
    this._proc.stderr.on('data', () => { /* ignorar */ });

    // Inicialización UCI (Stockfish procesa la entrada en orden, no hace falta await)
    this._uci('uci');
    this._uci(`setoption name Threads value ${this._threads}`);
    this._uci(`setoption name Hash value ${this._hash}`);
    this._uci('ucinewgame');
    this._uci('isready');
  }

  kill() {
    this._searchResolve = null;
    this._searchOnInfo  = null;
    this._rl?.close();
    this._rl = null;
    if (this._proc) {
      try { this._uci('quit'); } catch { /* noop */ }
      this._proc.kill();
      this._proc = null;
    }
  }

  // ── Entrada/salida UCI cruda ──────────────────────────────────────────────

  _uci(line) {
    if (this._proc?.stdin?.writable) this._proc.stdin.write(line + '\n');
  }

  _onEngineLine(line) {
    if (!line) return;

    if (line.startsWith('bestmove')) {
      const bestmove = line.split(/\s+/)[1] || '(none)';
      const resolve  = this._searchResolve;
      this._searchResolve = null;
      this._searchOnInfo  = null;
      resolve?.({ bestmove, info: this._lastInfo });
      return;
    }

    if (line.startsWith('info') && line.includes(' pv ')) {
      const info = this._parseInfo(line);
      if (info) {
        this._lines[info.multipv] = info;
        this._lastInfo = this._lines[1] || info;
        this._searchOnInfo?.(info);
      }
    }
  }

  /** Parsea `info … multipv N … score cp/mate … pv …` a un objeto de línea. */
  _parseInfo(line) {
    const tok = line.split(/\s+/);
    let depth = null, nodes = 0, multipv = 1, scoreType = null, scoreVal = 0, pv = '';

    for (let i = 0; i < tok.length; i++) {
      const t = tok[i];
      if (t === 'depth')        depth = Number(tok[i + 1]);
      else if (t === 'nodes')   nodes = Number(tok[i + 1]);
      else if (t === 'multipv') multipv = Number(tok[i + 1]);
      else if (t === 'score')   { scoreType = tok[i + 1]; scoreVal = Number(tok[i + 2]); }
      else if (t === 'pv')      { pv = tok.slice(i + 1).join(' '); break; }
    }

    if (depth === null || scoreType === null || !pv) return null;

    const stm = this._stm(this._searchFen);
    return {
      multipv,
      depth,
      nodes,
      pv,
      pv_san:   this._pvToSan(this._searchFen, pv),
      score_cp: this._toWhiteCp(scoreType, scoreVal, stm),
    };
  }

  _stm(fen) { return (fen && fen.split(' ')[1]) || 'w'; }

  /**
   * Convierte el score UCI (relativo al lado a mover) a centipawns relativos a
   * las blancas. Los mates se codifican como ±(30000 − 2·N) para que el
   * frontend los muestre como «M N».
   */
  _toWhiteCp(type, val, stm) {
    if (type === 'mate') {
      const whiteMate = stm === 'w' ? val : -val;
      const mag = 30000 - 2 * Math.abs(whiteMate);
      return whiteMate >= 0 ? mag : -mag;
    }
    return stm === 'w' ? val : -val;
  }

  /** Convierte una PV en UCI a SAN numerado: "12.Nf3 d5 13.exd5 …". */
  _pvToSan(fen, uciPv) {
    if (!fen) return uciPv;
    const c = new Chess(fen);
    const out = [];
    let first = true;
    for (const u of uciPv.split(/\s+/).filter(Boolean)) {
      const turn = c.turn();
      const num  = Number(c.fen().split(' ')[5]);
      let mv;
      try {
        mv = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.length > 4 ? u[4] : undefined });
      } catch { break; }
      if (!mv) break;
      if (turn === 'w')      out.push(`${num}.${mv.san}`);
      else if (first)        out.push(`${num}...${mv.san}`);
      else                   out.push(mv.san);
      first = false;
    }
    return out.length ? out.join(' ') : uciPv;
  }

  /** Lanza la búsqueda sobre `fen` y resuelve al recibir `bestmove`.
   *  Modo: infinite > depth > movetime. */
  _search(fen, movetimeMs, { onInfo = null, multipv = 1, depth = null, infinite = false } = {}) {
    this._searchFen    = fen;
    this._searchOnInfo = onInfo;
    this._lines        = {};
    this._lastInfo     = null;
    return new Promise((resolve) => {
      this._searchResolve = resolve;
      this._uci(`setoption name MultiPV value ${multipv}`);
      this._uci('position fen ' + fen);
      if (infinite)   this._uci('go infinite');
      else if (depth) this._uci('go depth ' + depth);
      else            this._uci('go movetime ' + Math.max(1, Math.round(movetimeMs)));
    });
  }

  // ── Reglas de alto nivel (chess.js) ───────────────────────────────────────

  _gameResult(chess) {
    if (chess.isCheckmate())            return chess.turn() === 'w' ? 'checkmate_black_wins' : 'checkmate_white_wins';
    if (chess.isStalemate())            return 'stalemate';
    if (chess.isInsufficientMaterial()) return 'draw_insufficient';
    if (chess.isThreefoldRepetition())  return 'draw_repetition';
    if (chess.isDraw())                 return 'draw_fifty';   // resto de tablas: regla de 50
    return null;
  }

  _dests(chess) {
    const dests = {};
    for (const m of chess.moves({ verbose: true })) {
      (dests[m.from] ||= []);
      if (!dests[m.from].includes(m.to)) dests[m.from].push(m.to);
    }
    return dests;
  }

  _applyUci(uci) {
    const move = {
      from: uci.slice(0, 2),
      to:   uci.slice(2, 4),
    };
    if (uci.length > 4) move.promotion = uci[4];
    return this._chess.move(move);   // lanza si es ilegal
  }

  // ── API pública (protocolo JSON) ──────────────────────────────────────────

  async send(cmd, payload = {}) {
    try {
      switch (cmd) {
        case 'new_game':           return this._newGame(payload);
        case 'make_move':          return this._makeMove(payload);
        case 'engine_move':        return await this._engineMove();
        case 'eval_position':      return await this._evalPosition(payload);
        case 'set_strength':       return this._setStrength(payload);
        case 'get_all_legal_moves':return { ok: true, dests: this._dests(this._chess) };
        case 'undo':               return this._undo();
        default:                   return { ok: false, error: `Comando desconocido: ${cmd}` };
      }
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  _newGame({ player_color = 'white', time_limit = 3, elo = 0, fen = null } = {}) {
    try { this._chess = fen ? new Chess(fen) : new Chess(); }
    catch { this._chess = new Chess(); }
    this._sanHistory = [];
    this._uciHistory = [];
    this._timeLimit  = Number(time_limit) || 3;
    this._playerColor = player_color;
    this._setStrength({ elo });
    this._uci('ucinewgame');
    this._uci('isready');
    return { ok: true, fen: this._chess.fen() };
  }

  /** Ajusta la fuerza del motor (sparring). elo=0/null → fuerza máxima. */
  _setStrength({ elo } = {}) {
    const e = Number(elo) || 0;
    if (e > 0) {
      this._uci('setoption name UCI_LimitStrength value true');
      this._uci(`setoption name UCI_Elo value ${Math.max(1320, Math.min(3190, e))}`);
    } else {
      this._uci('setoption name UCI_LimitStrength value false');
    }
    return { ok: true };
  }

  _makeMove({ move_uci }) {
    const mv = this._applyUci(move_uci);
    this._sanHistory.push(mv.san);
    this._uciHistory.push(mv.lan);
    const game_result = this._gameResult(this._chess);
    return {
      ok: true,
      fen: this._chess.fen(),
      san: mv.san,
      move_uci: mv.lan,
      game_over: game_result !== null,
      game_result,
    };
  }

  async _engineMove() {
    const fenBefore = this._chess.fen();
    // MultiPV 1 para jugar a plena fuerza (la búsqueda multilínea poda menos)
    const { bestmove, info } = await this._search(fenBefore, this._timeLimit * 1000, { multipv: 1 });

    if (!bestmove || bestmove === '(none)') {
      const game_result = this._gameResult(this._chess);
      return { ok: false, error: 'sin jugada', game_over: true, game_result };
    }

    const mv = this._applyUci(bestmove);
    this._sanHistory.push(mv.san);
    this._uciHistory.push(mv.lan);
    const game_result = this._gameResult(this._chess);

    return {
      ok: true,
      fen: this._chess.fen(),
      san: mv.san,
      move_uci: mv.lan,
      game_over: game_result !== null,
      game_result,
      eval_cp: info ? info.score_cp : 0,
      eval_info: {},
    };
  }

  /** Evalúa una posición con una búsqueda corta (para análisis de partida). */
  async _evalPosition({ fen, movetime = 400 } = {}) {
    const r = await this._search(fen || this._chess.fen(), movetime, { multipv: 1 });
    return {
      ok: true,
      score_cp: r.info ? r.info.score_cp : 0,
      best_move: r.bestmove && r.bestmove !== '(none)' ? r.bestmove : '',
      pv_san: r.info ? r.info.pv_san : '',
    };
  }

  _undo() {
    // Deshace la jugada del jugador y la respuesta del motor (un ply cada uno)
    this._chess.undo();
    this._sanHistory.pop();
    this._uciHistory.pop();
    if (this._sanHistory.length > 0) {
      this._chess.undo();
      this._sanHistory.pop();
      this._uciHistory.pop();
    }
    return {
      ok: true,
      fen: this._chess.fen(),
      move_history_san: [...this._sanHistory],
      move_history_uci: [...this._uciHistory],
    };
  }

  // ── Análisis con streaming (MultiPV) ──────────────────────────────────────

  startAnalyze(payload, onInfo, onDone) {
    const fen      = payload.fen || this._chess.fen();
    const secs     = Number(payload.time_limit) || 10;
    const multipv  = Number(payload.multipv) || this._multipv;
    const infinite = !!payload.infinite;
    const depth    = payload.depth ? Number(payload.depth) : null;

    this._search(fen, secs * 1000, {
      multipv, infinite, depth,
      onInfo: (info) => onInfo?.({
        multipv:  info.multipv,
        depth:    info.depth,
        score_cp: info.score_cp,
        nodes:    info.nodes,
        pv:       info.pv,
        pv_san:   info.pv_san,
      }),
    }).then(({ bestmove, info }) => {
      onDone?.({
        best_move: bestmove && bestmove !== '(none)' ? bestmove : (info?.pv?.split(' ')[0] ?? ''),
        score_cp:  info ? info.score_cp : 0,
        depth:     info ? info.depth    : 0,
        pv:        info ? info.pv       : '',
      });
    });
  }

  stopAnalyze() {
    // Stockfish responde con `bestmove`, lo que resuelve la búsqueda en curso
    if (this._searchResolve) this._uci('stop');
  }
}

module.exports = StockfishBridge;
