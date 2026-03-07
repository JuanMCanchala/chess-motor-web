/**
 * main.js — KallpaModulo Web Client
 * Comunicación: WebSocket → backend Node.js → motor C++ (JSON por línea)
 */
import { Chessground } from '/chessground/dist/chessground.js';

// ─────────────────────────────────────────────────────────────────────────────
// WebSocket
// ─────────────────────────────────────────────────────────────────────────────

const WS_URL = `ws://${location.host}`;
let ws = null;
let pendingResolve = null;   // un comando a la vez

function wsConnect() {
  setStatus('connecting');
  ws = new WebSocket(WS_URL);

  ws.onopen  = () => setStatus('connected');
  ws.onclose = () => { setStatus('disconnected'); setTimeout(wsConnect, 2500); };
  ws.onerror = () => setStatus('disconnected');

  ws.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    onMessage(msg);
  };
}

function wsSend(cmd, payload = {}) {
  return new Promise((resolve) => {
    pendingResolve = resolve;
    ws.send(JSON.stringify({ cmd, payload }));
  });
}

function onMessage(msg) {
  const { event, result } = msg;

  if (event === 'ready') {
    console.log('[engine] ready:', msg.enginePath);
    return;
  }

  // Análisis streaming
  if (event === 'analyze_info')   { handleAnalyzeInfo(msg);   return; }
  if (event === 'analyze_result') { handleAnalyzeResult(msg); return; }

  // Respuesta a comando estándar
  if (pendingResolve) {
    const r = pendingResolve;
    pendingResolve = null;
    r(result);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Estado del juego (Play tab)
// ─────────────────────────────────────────────────────────────────────────────

let cgPlay = null;             // instancia Chessground (play)
let cgAnalysis = null;         // instancia Chessground (analysis)
let playerColor  = 'white';    // color del jugador humano
let engineThinking = false;    // el motor está calculando
let moveHistorySan = [];       // ['e4', 'e5', 'Nf3', ...]
let moveHistoryUci = [];
let gameActive = false;
let pendingPromo = null;       // { orig, dest, resolve } para modal de promoción

// ─────────────────────────────────────────────────────────────────────────────
// Coordenadas del tablero
// ─────────────────────────────────────────────────────────────────────────────

function renderCoords(orientation) {
  const files = orientation === 'white'
    ? ['a','b','c','d','e','f','g','h']
    : ['h','g','f','e','d','c','b','a'];
  const ranks = orientation === 'white'
    ? ['8','7','6','5','4','3','2','1']
    : ['1','2','3','4','5','6','7','8'];

  const topEl   = document.getElementById('play-coords-top');
  const leftEl  = document.getElementById('play-coords-left');
  const botEl   = document.getElementById('play-coords-bottom');
  topEl.innerHTML  = files.map(f => `<span>${f}</span>`).join('');
  botEl.innerHTML  = files.map(f => `<span>${f}</span>`).join('');
  leftEl.innerHTML = ranks.map(r => `<span>${r}</span>`).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// Chessground — inicializar tableros
// ─────────────────────────────────────────────────────────────────────────────

function initBoards() {
  cgPlay = Chessground(document.getElementById('play-board'), {
    animation: { enabled: true, duration: 200 },
    highlight:  { lastMove: true, check: true },
    movable: {
      free: false,
      color: 'white',
      dests: new Map(),
      events: { after: onPlayMove },
    },
    premovable: { enabled: false },
  });

  cgAnalysis = Chessground(document.getElementById('analysis-board'), {
    animation: { enabled: true, duration: 200 },
    highlight:  { lastMove: true },
    movable: { free: false, color: 'none' },
    drawable: { enabled: true, visible: true },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Play Tab — flujo principal
// ─────────────────────────────────────────────────────────────────────────────

async function startGame() {
  const colorSel = document.getElementById('sel-color').value;
  const timeSel  = Number(document.getElementById('sel-time').value);

  playerColor = colorSel === 'random'
    ? (Math.random() < 0.5 ? 'white' : 'black')
    : colorSel;

  const result = await wsSend('new_game', {
    player_color: playerColor,
    time_limit:   timeSel,
  });

  if (!result?.ok) { alert('Error al iniciar la partida'); return; }

  moveHistorySan = [];
  moveHistoryUci = [];
  gameActive     = true;

  renderCoords(playerColor);
  updateBoard(result.fen, null, null);
  cgPlay.set({ orientation: playerColor });

  showGameUI();
  updateMoveHistory();
  clearEval();
  clearEngineInfo();

  // Si el jugador es negras, el motor mueve primero
  if (playerColor === 'black') {
    await engineMove();
  } else {
    await refreshDests();
  }
}

/** El jugador hizo un movimiento en el tablero. */
async function onPlayMove(orig, dest) {
  if (!gameActive || engineThinking) return;

  // Detectar promoción de peón
  const pieces = cgPlay.state.pieces;
  const piece  = pieces.get(dest);  // ya está en destino después de animación
  const destRank = dest[1];
  let moveUci = orig + dest;

  if (piece && piece.role === 'pawn' &&
      ((piece.color === 'white' && destRank === '8') ||
       (piece.color === 'black' && destRank === '1'))) {
    const promo = await showPromoModal(piece.color);
    moveUci += promo;
  }

  const result = await wsSend('make_move', { move_uci: moveUci });
  if (!result?.ok) {
    // movimiento rechazado — restaurar posición
    await refreshDests();
    return;
  }

  moveHistorySan.push(result.san);
  moveHistoryUci.push(result.move_uci);
  updateBoard(result.fen, orig, dest);
  updateMoveHistory();

  if (result.game_over) {
    endGame(result.game_result);
    return;
  }

  // El motor responde
  await engineMove();
}

/** Pide al motor su jugada. */
async function engineMove() {
  engineThinking = true;
  cgPlay.set({ movable: { color: 'none' } });
  showThinking(true);

  const result = await wsSend('engine_move');
  engineThinking = false;
  showThinking(false);

  if (!result?.ok) return;

  const from = result.move_uci.slice(0, 2);
  const to   = result.move_uci.slice(2, 4);
  moveHistorySan.push(result.san);
  moveHistoryUci.push(result.move_uci);
  updateBoard(result.fen, from, to);
  updateMoveHistory();
  updateEval(result.eval_cp);
  updateEngineInfo(result.eval_info);

  if (result.game_over) {
    endGame(result.game_result);
    return;
  }

  await refreshDests();
}

/** Actualiza el tablero con un nuevo FEN y resalta último movimiento. */
function updateBoard(fen, fromSq, toSq) {
  cgPlay.set({
    fen: fen,
    lastMove: fromSq ? [fromSq, toSq] : undefined,
  });
}

/** Obtiene y aplica los movimientos legales del motor. */
async function refreshDests() {
  const result = await wsSend('get_all_legal_moves');
  if (!result?.ok) return;
  cgPlay.set({
    movable: {
      color: playerColor,
      dests: new Map(Object.entries(result.dests)),
    },
  });
}

/** Deshacer último par de movimientos. */
async function undoMove() {
  if (!gameActive || engineThinking) return;
  const result = await wsSend('undo');
  if (!result?.ok) return;

  moveHistorySan = result.move_history_san;
  moveHistoryUci = result.move_history_uci;

  cgPlay.set({ fen: result.fen, lastMove: undefined });
  updateMoveHistory();
  clearEval();
  await refreshDests();
}

function endGame(gameResult) {
  gameActive = false;
  cgPlay.set({ movable: { color: 'none' } });

  const MESSAGES = {
    checkmate_white_wins: '♔ Jaque mate — Blancas ganan',
    checkmate_black_wins: '♚ Jaque mate — Negras ganan',
    stalemate:            '½-½ Ahogado',
    draw_insufficient:    '½-½ Material insuficiente',
    draw_fifty:           '½-½ Regla de 50 movimientos',
    draw_repetition:      '½-½ Triple repetición',
  };

  const banner = document.getElementById('result-banner');
  banner.textContent = MESSAGES[gameResult] ?? 'Partida terminada';
  banner.style.display = 'block';
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal de Promoción
// ─────────────────────────────────────────────────────────────────────────────

function showPromoModal(color) {
  return new Promise((resolve) => {
    const modal  = document.getElementById('promo-modal');
    const pieces = document.getElementById('promo-pieces');

    const UNICODE = {
      white: { q: '♕', r: '♖', b: '♗', n: '♘' },
      black: { q: '♛', r: '♜', b: '♝', n: '♞' },
    };

    pieces.innerHTML = '';
    for (const [key, sym] of Object.entries(UNICODE[color])) {
      const btn = document.createElement('button');
      btn.className = 'promo-btn';
      btn.textContent = sym;
      btn.onclick = () => {
        modal.style.display = 'none';
        resolve(key);
      };
      pieces.appendChild(btn);
    }

    modal.style.display = 'flex';
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Analysis Tab
// ─────────────────────────────────────────────────────────────────────────────

let analyzing = false;
const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function loadFen() {
  let fen = document.getElementById('fen-input').value.trim();
  if (!fen) fen = STARTING_FEN;

  try {
    cgAnalysis.set({ fen, lastMove: undefined, drawable: { autoShapes: [] } });
    document.getElementById('fen-input').value = fen;
  } catch {
    alert('FEN inválido');
  }
}

async function startAnalysis() {
  if (analyzing) return;
  analyzing = true;

  let fen = document.getElementById('fen-input').value.trim() || STARTING_FEN;
  const timeLimit = Number(document.getElementById('sel-analysis-time').value);

  document.getElementById('btn-analyze').style.display = 'none';
  document.getElementById('btn-stop-analysis').style.display = 'inline-flex';
  document.getElementById('best-move-box').style.display = 'flex';
  document.getElementById('depth-table-wrap').style.display = 'block';
  document.getElementById('depth-table-body').innerHTML = '';

  cgAnalysis.set({ fen, drawable: { autoShapes: [] } });

  ws.send(JSON.stringify({ cmd: 'analyze', payload: { fen, time_limit: timeLimit } }));
}

function stopAnalysis() {
  ws.send(JSON.stringify({ cmd: 'stop_analysis' }));
  analyzing = false;
  document.getElementById('btn-analyze').style.display = 'inline-flex';
  document.getElementById('btn-stop-analysis').style.display = 'none';
}

function handleAnalyzeInfo(msg) {
  const { depth, score_cp, nodes, nps, pv } = msg;

  // Actualizar panel principal con la info más reciente
  document.getElementById('bm-depth').textContent = depth;
  document.getElementById('bm-score').textContent = formatScore(score_cp);

  if (pv) {
    const moves = pv.trim().split(' ');
    document.getElementById('bm-move').textContent  = formatUciMove(moves[0]);
    document.getElementById('bm-pv').textContent    = pv;

    // Flecha de mejor jugada en el tablero
    const shapes = [];
    if (moves[0]) shapes.push({ orig: moves[0].slice(0,2), dest: moves[0].slice(2,4), brush: 'green' });
    if (moves[1]) shapes.push({ orig: moves[1].slice(0,2), dest: moves[1].slice(2,4), brush: 'paleBlue' });
    cgAnalysis.set({ drawable: { autoShapes: shapes } });
  }

  // Añadir fila a la tabla
  const tbody = document.getElementById('depth-table-body');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${depth}</td>
    <td>${formatScore(score_cp)}</td>
    <td>${fmtNum(nodes)}</td>
    <td style="max-width:200px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${pv ?? '—'}</td>
  `;
  tbody.appendChild(tr);
  tbody.parentElement.scrollTop = tbody.parentElement.scrollHeight;
}

function handleAnalyzeResult(msg) {
  analyzing = false;
  document.getElementById('btn-analyze').style.display = 'inline-flex';
  document.getElementById('btn-stop-analysis').style.display = 'none';

  if (msg.best_move) {
    document.getElementById('bm-move').textContent = formatUciMove(msg.best_move);
  }
  if (msg.score_cp !== undefined) {
    document.getElementById('bm-score').textContent = formatScore(msg.score_cp);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────────────────────────────────────

function setStatus(state) {
  const dot   = document.getElementById('status-dot');
  const label = document.getElementById('status-label');
  dot.className = 'dot ' + state;
  label.textContent = { connected: 'Conectado', disconnected: 'Desconectado', connecting: 'Conectando…' }[state] ?? state;
}

function showGameUI() {
  document.getElementById('play-settings').style.display   = 'none';
  document.getElementById('move-history-wrap').style.display = 'flex';
  document.getElementById('game-controls').style.display   = 'flex';
  document.getElementById('result-banner').style.display   = 'none';
  document.getElementById('engine-info').style.display     = 'block';
}

function showStartUI() {
  document.getElementById('play-settings').style.display   = 'block';
  document.getElementById('move-history-wrap').style.display = 'none';
  document.getElementById('game-controls').style.display   = 'none';
  document.getElementById('engine-info').style.display     = 'none';
}

function showThinking(active) {
  // Pequeño indicador en la lista de movimientos
  let el = document.getElementById('thinking-indicator');
  if (active) {
    if (!el) {
      el = document.createElement('div');
      el.id = 'thinking-indicator';
      el.className = 'thinking';
      el.textContent = 'Motor pensando…';
      document.getElementById('move-history').appendChild(el);
    }
  } else {
    el?.remove();
  }
}

function updateMoveHistory() {
  const container = document.getElementById('move-history');
  container.innerHTML = '';

  for (let i = 0; i < moveHistorySan.length; i += 2) {
    const moveNum = Math.floor(i / 2) + 1;
    const white   = moveHistorySan[i]   ?? '';
    const black   = moveHistorySan[i+1] ?? '';

    const div = document.createElement('div');
    div.className = 'move-pair';
    div.innerHTML = `
      <span class="move-num">${moveNum}.</span>
      <span class="move-san" data-idx="${i}">${white}</span>
      <span class="move-san ${black ? '' : 'empty'}" data-idx="${i+1}">${black}</span>
    `;
    container.appendChild(div);
  }

  // Resaltar último movimiento
  const lastIdx = moveHistorySan.length - 1;
  const lastEl  = container.querySelector(`[data-idx="${lastIdx}"]`);
  lastEl?.classList.add('active');

  container.scrollTop = container.scrollHeight;
}

function updateEval(evalCp) {
  if (evalCp === undefined || evalCp === null) return;

  // Ajustar: si el jugador es negras, invertir (el motor da eval desde su perspectiva)
  const cp = playerColor === 'white' ? evalCp : -evalCp;

  // Sigmoid: 50 + 50*tanh(cp/400)
  const pct = 50 + 50 * Math.tanh(cp / 400);

  document.getElementById('eval-fill').style.height = `${pct}%`;

  const absVal = Math.abs(cp / 100).toFixed(2);
  document.getElementById('eval-label').textContent =
    cp > 0 ? `+${absVal}` : (cp < 0 ? `-${Math.abs(cp/100).toFixed(2)}` : '0.00');
}

function clearEval() {
  document.getElementById('eval-fill').style.height = '50%';
  document.getElementById('eval-label').textContent = '0.0';
}

function updateEngineInfo(evalInfo) {
  if (!evalInfo) return;
  document.getElementById('info-depth').textContent = evalInfo.phase_value ?? '—';
  document.getElementById('info-nodes').textContent = fmtNum(evalInfo.nodes) ?? '—';
  document.getElementById('info-nps').textContent   = '—';
}

function clearEngineInfo() {
  ['info-depth','info-nodes','info-nps'].forEach(id => {
    document.getElementById(id).textContent = '—';
  });
}

function formatScore(cp) {
  if (cp === undefined || cp === null) return '—';
  if (Math.abs(cp) > 29000) {
    const mateIn = Math.ceil((30000 - Math.abs(cp)) / 2);
    return (cp > 0 ? '+' : '-') + `M${mateIn}`;
  }
  const val = (cp / 100).toFixed(2);
  return cp >= 0 ? `+${val}` : val;
}

function formatUciMove(uci) {
  if (!uci || uci.length < 4) return uci ?? '—';
  return `${uci.slice(0,2)}→${uci.slice(2,4)}${uci.length > 4 ? '='+uci[4].toUpperCase() : ''}`;
}

function fmtNum(n) {
  if (!n) return '—';
  if (n >= 1_000_000) return (n/1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n/1_000).toFixed(0) + 'K';
  return String(n);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab switching
// ─────────────────────────────────────────────────────────────────────────────

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${tabName}`));
}

// ─────────────────────────────────────────────────────────────────────────────
// Eventos DOM
// ─────────────────────────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

document.getElementById('btn-new').addEventListener('click', startGame);

document.getElementById('btn-new-again').addEventListener('click', () => {
  gameActive = false;
  cgPlay.set({ movable: { color: 'none' } });
  showStartUI();
});

document.getElementById('btn-undo').addEventListener('click', undoMove);

document.getElementById('btn-resign').addEventListener('click', async () => {
  if (!gameActive) return;
  endGame(playerColor === 'white' ? 'checkmate_black_wins' : 'checkmate_white_wins');
});

document.getElementById('btn-load-fen').addEventListener('click', loadFen);
document.getElementById('fen-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loadFen();
});

document.getElementById('btn-analyze').addEventListener('click', startAnalysis);
document.getElementById('btn-stop-analysis').addEventListener('click', stopAnalysis);

// ─────────────────────────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────────────────────────

initBoards();
wsConnect();

// FEN por defecto en análisis
document.getElementById('fen-input').value = STARTING_FEN;
cgAnalysis.set({ fen: STARTING_FEN });
