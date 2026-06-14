# -*- coding: utf-8 -*-
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import megalib
ROOT = r"C:\Users\canch\Documents\ChessBase\Bases\Mega2026\Mega Database 2026"
print("total records:", megalib.num_records(ROOT))
n = 0
for g in megalib.iter_games(ROOT, max_games=15, with_names=True):
    board = g["game"].board()
    sans = []
    for mv in g["game"].mainline_moves():
        sans.append(board.san(mv)); board.push(mv)
        if len(sans) >= 12: break
    print(f"#{g['index']:>3} {g['white']} vs {g['black']} [{g['result']}] {g['w_elo']}/{g['b_elo']} {g['year']}: {' '.join(sans)}")
    n += 1
print("decoded ok:", n, "| decode errors saltados:", megalib.iter_games.last_decode_errors)
