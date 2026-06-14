'use strict';

// Match de módulos: enfrenta dos motores/módulos UCI vía cutechess-cli y
// transmite el progreso (resultado por partida + marcador) por callback.
const { spawn } = require('child_process');
const fs        = require('fs');
const engines   = require('./engines');

const CUTECHESS = process.env.CUTECHESS_PATH
  || 'C:\\cutechess-1.4.0-win64\\cutechess-1.4.0-win64\\cutechess-cli.exe';

const TESIS = 'C:\\Programacion\\chess-motor-tabular';
const BOOK = `${TESIS}\\engine_ml\\tests\\books\\balanced_openings.epd`;

// Los módulos del match = motores UCI del registro central (cutechess solo habla UCI,
// así que se excluye KallpaModulo en su modo JSON propio; sus variantes UCI hce/ml sí entran).
function MODULE(id) {
  const e = engines.get(id);
  if (!e || e.kind !== 'uci') return null;
  return { name: e.name, cmd: e.cmd, args: e.args, options: e.options };
}

function listModules() {
  return engines.list()
    .filter((e) => e.kind === 'uci')
    .map((e) => ({ id: e.id, name: e.name, available: e.available }));
}

function engineArgs(label, mod) {
  const a = ['-engine', `name=${label}`, `cmd=${mod.cmd}`];
  for (const ar of mod.args) a.push(`arg=${ar}`);
  for (const [k, v] of Object.entries(mod.options)) a.push(`option.${k}=${v}`);
  return a;
}

/**
 * Lanza un match. opts: { a, b, games, st(seg/jugada), concurrency }.
 * onEvent recibe objetos {type:'game'|'score'|'done'|'error'|'info', ...}.
 * Devuelve un handle con kill().
 */
function runMatch(opts, onEvent) {
  const A = MODULE(opts.a), B = MODULE(opts.b);
  if (!A || !B) { onEvent({ type: 'error', message: 'Módulo desconocido' }); return { kill() {} }; }
  if (!fs.existsSync(CUTECHESS)) { onEvent({ type: 'error', message: 'cutechess-cli no encontrado' }); return { kill() {} }; }
  if (!fs.existsSync(A.cmd) || !fs.existsSync(B.cmd)) { onEvent({ type: 'error', message: 'Binario de motor no encontrado' }); return { kill() {} }; }

  const games = Math.max(2, Math.min(1000, Number(opts.games) || 20));
  const rounds = Math.ceil(games / 2);
  const st = String(opts.st || '1');
  const conc = Math.max(1, Math.min(8, Number(opts.concurrency) || 2));
  const labelA = 'A', labelB = 'B';

  const args = [
    ...engineArgs(labelA, A),
    ...engineArgs(labelB, B),
    '-each', 'proto=uci', `st=${st}`,
    ...(fs.existsSync(BOOK) ? ['-openings', `file=${BOOK}`, 'format=epd', 'order=random', '-repeat'] : []),
    '-games', '2', '-rounds', String(rounds), '-concurrency', String(conc),
    '-ratinginterval', '10',
  ];

  onEvent({ type: 'info', message: `${A.name} vs ${B.name} — ${rounds * 2} partidas, ${st}s/jugada`, total: rounds * 2, nameA: A.name, nameB: B.name });

  const proc = spawn(CUTECHESS, args, { windowsHide: true });
  let buf = '';
  const score = { w: 0, d: 0, l: 0, played: 0 };

  function handleLine(line) {
    line = line.trim();
    if (!line) return;
    // "Finished game 3 (A vs B): 1-0 {White mates}"
    const fin = line.match(/^Finished game (\d+) \((\w+) vs (\w+)\): (1-0|0-1|1\/2-1\/2)/);
    if (fin) {
      const [, , whiteName, , result] = fin;
      const aIsWhite = whiteName === labelA;
      let outcome;
      if (result === '1/2-1/2') { score.d++; outcome = 'draw'; }
      else if ((result === '1-0' && aIsWhite) || (result === '0-1' && !aIsWhite)) { score.w++; outcome = 'a'; }
      else { score.l++; outcome = 'b'; }
      score.played++;
      onEvent({ type: 'game', n: score.played, outcome, ...score });
      return;
    }
    // "Score of A vs B: 5 - 3 - 2  [0.600] 10"
    const sc = line.match(/^Score of \w+ vs \w+: (\d+) - (\d+) - (\d+)/);
    if (sc) { onEvent({ type: 'score', a: +sc[1], b: +sc[2], d: +sc[3] }); return; }
    // "Elo difference: 35.2 +/- 40.1"
    const elo = line.match(/Elo difference: (-?[\d.]+) \+\/- ([\d.]+)/);
    if (elo) { onEvent({ type: 'info', elo: +elo[1], eloErr: +elo[2] }); return; }
  }

  proc.stdout.on('data', (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) { handleLine(buf.slice(0, i)); buf = buf.slice(i + 1); }
  });
  proc.stderr.on('data', () => { /* cutechess loguea a stdout */ });
  proc.on('error', (err) => onEvent({ type: 'error', message: err.message }));
  proc.on('exit', (code) => onEvent({ type: 'done', code, ...score }));

  return { kill() { try { proc.kill(); } catch { /* noop */ } } };
}

module.exports = { runMatch, listModules };
