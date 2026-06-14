# Lector reutilizable de bases ChessBase (CBH/CBG) sobre los módulos de
# asdfjkl/cbh2pgn (MIT, Dominik Klein). Expone un generador iter_games().
import os, sys, mmap

_HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cbh2pgn")
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

import game, header, player, tournament  # noqa: E402


def _fresh_initial():
    """Posición inicial estándar en la representación interna de ChessBase.
    Se construye nueva cada vez porque game.decode() la muta."""
    cb_position = [
        [(game.W_ROOK, 0), (game.W_PAWN, 0), (0, None), (0, None), (0, None), (0, None), (game.B_PAWN, 0), (game.B_ROOK, 0)],
        [(game.W_KNIGHT, 0), (game.W_PAWN, 1), (0, None), (0, None), (0, None), (0, None), (game.B_PAWN, 1), (game.B_KNIGHT, 0)],
        [(game.W_BISHOP, 0), (game.W_PAWN, 2), (0, None), (0, None), (0, None), (0, None), (game.B_PAWN, 2), (game.B_BISHOP, 0)],
        [(game.W_QUEEN, 0), (game.W_PAWN, 3), (0, None), (0, None), (0, None), (0, None), (game.B_PAWN, 3), (game.B_QUEEN, 0)],
        [(game.W_KING, None), (game.W_PAWN, 4), (0, None), (0, None), (0, None), (0, None), (game.B_PAWN, 4), (game.B_KING, None)],
        [(game.W_BISHOP, 1), (game.W_PAWN, 5), (0, None), (0, None), (0, None), (0, None), (game.B_PAWN, 5), (game.B_BISHOP, 1)],
        [(game.W_KNIGHT, 1), (game.W_PAWN, 6), (0, None), (0, None), (0, None), (0, None), (game.B_PAWN, 6), (game.B_KNIGHT, 1)],
        [(game.W_ROOK, 1), (game.W_PAWN, 7), (0, None), (0, None), (0, None), (0, None), (game.B_PAWN, 7), (game.B_ROOK, 1)],
    ]
    piece_list = [None,
        [(3, 0), None, None, None, None, None, None, None],
        [(1, 0), (6, 0), None, None, None, None, None, None],
        [(2, 0), (5, 0), None, None, None, None, None, None],
        [(0, 0), (7, 0), None, None, None, None, None, None],
        [(3, 7), None, None, None, None, None, None, None],
        [(1, 7), (6, 7), None, None, None, None, None, None],
        [(2, 7), (5, 7), None, None, None, None, None, None],
        [(0, 7), (7, 7), None, None, None, None, None, None],
        [(4, 0)],
        [(4, 7)],
        [(0, 1), (1, 1), (2, 1), (3, 1), (4, 1), (5, 1), (6, 1), (7, 1)],
        [(0, 6), (1, 6), (2, 6), (3, 6), (4, 6), (5, 6), (6, 6), (7, 6)]]
    return cb_position, piece_list


def open_db(root):
    if root.endswith(".cbh"):
        root = root[:-4]
    mm = {}
    files = {}
    for ext in (".cbh", ".cbp", ".cbt", ".cbg"):
        f = open(root + ext, "rb")
        files[ext] = f
        mm[ext] = mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ)
    return files, mm


def num_records(root):
    files, mm = open_db(root)
    n = len(mm[".cbh"]) // 46
    for f in files.values():
        f.close()
    return n


def iter_games(root, max_games=None, start=1, end=None, with_names=False):
    """Itera partidas decodificadas. Cada item es un dict:
    { index, white, black, result, w_elo, b_elo, year, game (chess.pgn.Game) }.
    Saltea partidas borradas, Chess960, codificaciones especiales y errores."""
    files, mm = open_db(root)
    cbh, cbp, cbt, cbg = mm[".cbh"], mm[".cbp"], mm[".cbt"], mm[".cbg"]
    nr = len(cbh) // 46
    last = nr if end is None else min(end, nr)
    yielded = 0
    decode_errors = 0
    try:
        for i in range(start, last):
            rec = cbh[46 * i:46 * (i + 1)]
            if not header.is_game(rec) or header.is_marked_as_deleted(rec):
                continue
            try:
                go = header.get_game_offset(rec)
                not_initial, not_encoded, is960, special, glen = game.get_info_gamelen(cbg, go)
                if not_encoded != 0 or is960 or special:
                    continue
                if not_initial:
                    fen, cbpos, plist = game.decode_start_position(cbg, go)
                    g, err = game.decode(cbg[go + 4 + 28:go + glen], cbpos, plist, fen=fen)
                else:
                    cbpos, plist = _fresh_initial()
                    g, err = game.decode(cbg[go + 4:go + glen], cbpos, plist)
                if g is None:
                    decode_errors += 1
                    continue
            except Exception:
                decode_errors += 1
                continue

            w_elo, b_elo = header.get_ratings(rec)
            yy, _mm, _dd = header.get_yymmdd(rec)
            item = {
                "index":  i,
                "result": header.get_result(rec),
                "w_elo":  w_elo,
                "b_elo":  b_elo,
                "year":   yy,
                "game":   g,
            }
            if with_names:
                try:
                    item["white"] = player.get_name(cbp, header.get_whiteplayer_offset(rec))
                    item["black"] = player.get_name(cbp, header.get_blackplayer_offset(rec))
                except Exception:
                    item["white"] = item["black"] = "?"
            yield item
            yielded += 1
            if max_games and yielded >= max_games:
                break
    finally:
        iter_games.last_decode_errors = decode_errors
        for f in files.values():
            f.close()


iter_games.last_decode_errors = 0
