# -*- coding: utf-8 -*-
# Genera src/data/eco.json: { "piezas turno enroque": [eco, nombre] }
# a partir de los TSV de lichess/chess-openings descargados en eco_src/.
import chess, json, os, glob, re

NUM = re.compile(r"^\d+\.+$")


def pos_key(board):
    f = board.fen().split(" ")
    return f[0] + " " + f[1] + " " + f[2]


def main():
    out = {}
    for path in sorted(glob.glob(os.path.join("eco_src", "*.tsv"))):
        with open(path, encoding="utf-8") as fh:
            next(fh, None)  # cabecera
            for line in fh:
                cols = line.rstrip("\n").split("\t")
                if len(cols) < 3:
                    continue
                eco, name, pgn = cols[0], cols[1], cols[2]
                board = chess.Board()
                ok = True
                for tok in pgn.replace(".", ". ").split():
                    if NUM.match(tok) or tok in ("1-0", "0-1", "1/2-1/2", "*"):
                        continue
                    try:
                        board.push_san(tok)
                    except Exception:
                        ok = False
                        break
                if ok:
                    out[pos_key(board)] = [eco, name]
    os.makedirs(os.path.join("..", "src", "data"), exist_ok=True)
    dst = os.path.join("..", "src", "data", "eco.json")
    with open(dst, "w", encoding="utf-8") as g:
        json.dump(out, g, ensure_ascii=False, separators=(",", ":"))
    print(f"openings: {len(out):,} -> {dst} ({os.path.getsize(dst)/1024:.0f} KB)")


if __name__ == "__main__":
    main()
