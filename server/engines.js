'use strict';

// Registro central de motores. Lo usan tanto el bridge (Análisis/Jugar) como
// el Match. Las rutas absolutas viven aquí (servidor), el cliente solo manda el id.
const path = require('path');
const fs   = require('fs');

const STOCKFISH = process.env.STOCKFISH_PATH
  || 'C:\\stockfish-windows-x86-64-avx2\\stockfish\\tauri-appsrc-tauribinariesstockfish-x86_64-pc-windows-gnu.exe';

const KALLPA = process.env.ENGINE_PATH
  ? path.resolve(__dirname, '..', process.env.ENGINE_PATH)
  : path.resolve(__dirname, '..', '..', 'chess-motor', 'Chess_motor', 'cpp_engine', 'build', 'engine_server.exe');

const ENGINES_DIR = path.join(__dirname, '..', 'engines');
const LC0    = path.join(ENGINES_DIR, 'lc0', 'lc0.exe');
const LC0_NET = path.join(ENGINES_DIR, 'lc0', '791556.pb.gz');
const ETHEREAL = path.join(ENGINES_DIR, 'ethereal.exe');

const TESIS = 'C:\\Programacion\\chess-motor-tabular';
const TESIS_ENG = `${TESIS}\\engine_ml\\build\\engine_server.exe`;

// kind 'uci' = UCI estándar (StockfishBridge sirve para todos); 'kallpa' = protocolo JSON propio
const REGISTRY = {
  stockfish: { name: 'Stockfish',          kind: 'uci',    cmd: STOCKFISH, args: [], options: {} },
  lc0:       { name: 'Leela (lc0)',        kind: 'uci',    cmd: LC0,       args: [`--weights=${LC0_NET}`], options: {} },
  ethereal:  { name: 'Ethereal',           kind: 'uci',    cmd: ETHEREAL,  args: [], options: {} },
  kallpa:    { name: 'KallpaModulo (tesis)', kind: 'kallpa', cmd: KALLPA,  args: [], options: {} },
  // Módulos A/B de la tesis (mismo binario UCI, distinto EvalMode)
  hce:       { name: 'KallpaModulo HCE',    kind: 'uci',    cmd: TESIS_ENG, args: ['--uci'], options: { EvalMode: 'HCE' } },
  ml:        { name: 'KallpaModulo ML',     kind: 'uci',    cmd: TESIS_ENG, args: ['--uci'], options: { EvalMode: 'ML', ModelFile: `${TESIS}\\models\\xgb_B.json` } },
};

function get(id) { return REGISTRY[id] || null; }

function list() {
  return Object.entries(REGISTRY).map(([id, e]) => ({
    id, name: e.name, kind: e.kind, available: fs.existsSync(e.cmd),
  }));
}

module.exports = { REGISTRY, get, list };
