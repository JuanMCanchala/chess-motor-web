'use strict';

// Lector del libro de aperturas de la Mega Database 2026 (SQLite generado por
// tools/build_megabook.py). Devuelve el mismo formato que el Opening Explorer.
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');
const { Chess } = require('chess.js');

const DB_PATH = path.join(__dirname, '..', 'tools', 'mega_book.sqlite');

let _db = null;
let _tried = false;

function db() {
  if (_db || _tried) return _db;
  _tried = true;
  try {
    if (!fs.existsSync(DB_PATH)) return null;
    const { DatabaseSync } = require('node:sqlite');
    _db = new DatabaseSync(DB_PATH, { readOnly: true });
  } catch (err) {
    console.error('[mega] no se pudo abrir el libro:', err.message);
    _db = null;
  }
  return _db;
}

function available() { return !!db(); }

/** Clave de posición idéntica a la de Python: sha1("piezas turno enroque")[:8]. */
function posKey(fen) {
  const p = fen.split(' ');
  const s = `${p[0]} ${p[1]} ${p[2]}`;
  return crypto.createHash('sha1').update(s).digest().subarray(0, 8);
}

const PROMO = { 2: 'n', 3: 'b', 4: 'r', 5: 'q' };
function sq(i) { return String.fromCharCode(97 + (i & 7)) + ((i >> 3) + 1); }
function decodeMove(m) {
  const from = sq((m >> 10) & 63);
  const to   = sq((m >> 4) & 63);
  const promo = PROMO[m & 15];
  return { from, to, uci: from + to + (promo || ''), promotion: promo };
}

/** Consulta la Mega para una FEN. Devuelve {white,draws,black,moves[]} o null. */
function query(fen, maxMoves = 15) {
  const d = db();
  if (!d) return null;
  let rows;
  try {
    rows = d.prepare('SELECT m, w, d, l, n FROM book WHERE k = ?').all(posKey(fen));
  } catch (err) {
    console.error('[mega] query:', err.message);
    return null;
  }

  const chess = new Chess(fen);
  const moves = [];
  for (const r of rows) {
    const mv = decodeMove(Number(r.m));
    let san;
    try {
      const c = new Chess(fen);
      const res = c.move({ from: mv.from, to: mv.to, promotion: mv.promotion });
      if (!res) continue;
      san = res.san;
    } catch { continue; }
    moves.push({
      uci: mv.uci, san,
      white: Number(r.w), draws: Number(r.d), black: Number(r.l),
    });
  }
  void chess;
  moves.sort((a, b) => (b.white + b.draws + b.black) - (a.white + a.draws + a.black));
  const top = moves.slice(0, maxMoves);
  return {
    white: top.reduce((s, m) => s + m.white, 0),
    draws: top.reduce((s, m) => s + m.draws, 0),
    black: top.reduce((s, m) => s + m.black, 0),
    moves: top,
  };
}

module.exports = { query, available };
