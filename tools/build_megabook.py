# -*- coding: utf-8 -*-
# Construye un índice de aperturas (libro) a partir de una base ChessBase.
#
#   Paso 1 (build):     decodifica partidas y escribe registros crudos
#                       (clave_posición, jugada, resultado) a un .bin
#   Paso 2 (aggregate): agrupa el .bin en un SQLite consultable por posición
#
# Clave de posición = primeros 8 bytes de sha1("piezas turno enroque").
# Idéntica en Python y en Node, así el backend consulta sin ambigüedad.
import sys, os, time, struct, hashlib, argparse, glob
import multiprocessing as mp
import megalib

REC = struct.Struct("<8sHB")   # key(8) + move(u16) + result(u8) = 11 bytes
RES_MAP = {"1-0": 2, "1/2-1/2": 1, "0-1": 0, "*": 3}


def pos_key(board):
    parts = board.fen().split(" ")
    s = (parts[0] + " " + parts[1] + " " + parts[2]).encode("utf-8")
    return hashlib.sha1(s).digest()[:8]


def enc_move(mv):
    return (mv.from_square << 10) | (mv.to_square << 4) | (mv.promotion or 0)


def _build_worker(task):
    root, start, end, depth, outpath, wid, nworkers = task
    out = open(outpath, "wb", buffering=1 << 20)
    games = positions = 0
    buf = bytearray()
    t0 = time.time()
    for g in megalib.iter_games(root, start=start, end=end):
        r = RES_MAP.get(g["result"], 3)
        board = g["game"].board()
        ply = 0
        for mv in g["game"].mainline_moves():
            if ply >= depth:
                break
            buf += REC.pack(pos_key(board), enc_move(mv), r)
            board.push(mv)
            ply += 1
        positions += ply
        games += 1
        if len(buf) >= (1 << 22):
            out.write(buf); buf = bytearray()
        if wid == 0 and games % 20000 == 0:
            el = time.time() - t0
            print(f"  [w0] {games:>8,} part | {games/el:6.1f} g/s | {el/60:5.1f} min "
                  f"(×{nworkers} workers ≈ {games*nworkers/el:6.0f} g/s totales)", flush=True)
    out.write(buf); out.close()
    return games, positions, megalib.iter_games.last_decode_errors


NUM_WORKERS = 1  # lo fija cmd_build (global para que el worker lo vea)


def cmd_build(args):
    global NUM_WORKERS
    nr = megalib.num_records(args.root)
    end_total = nr if args.count is None else min(args.start + args.count, nr)
    workers = max(1, args.workers)
    NUM_WORKERS = workers
    span = end_total - args.start
    step = (span + workers - 1) // workers
    tasks = []
    for w in range(workers):
        s = args.start + w * step
        e = min(s + step, end_total)
        if s >= e:
            break
        tasks.append((args.root, s, e, args.depth, f"{args.out}.part{w:03d}", w, workers))

    print(f"records totales: {nr:,} | procesando {span:,} ({args.start:,}..{end_total:,}) "
          f"con {len(tasks)} workers, depth {args.depth}", flush=True)
    t0 = time.time()
    with mp.Pool(len(tasks)) as pool:
        results = pool.map(_build_worker, tasks)
    games = sum(r[0] for r in results)
    positions = sum(r[1] for r in results)
    errors = sum(r[2] for r in results)
    el = time.time() - t0
    nbytes = sum(os.path.getsize(t[4]) for t in tasks if os.path.exists(t[4]))
    print(f"LISTO build: {games:,} partidas, {positions:,} posiciones en {el/60:.1f} min "
          f"({games/max(el,1):.0f} g/s). Errores saltados: {errors:,}")
    print(f"Crudo: {len(tasks)} partes, {nbytes/1e9:.2f} GB ({args.out}.part*)")


def cmd_aggregate(args):
    import sqlite3
    if os.path.exists(args.db):
        os.remove(args.db)
    con = sqlite3.connect(args.db)
    con.execute("PRAGMA journal_mode=OFF")
    con.execute("PRAGMA synchronous=OFF")
    con.execute("CREATE TABLE raw(k BLOB, m INTEGER, r INTEGER)")
    t0 = time.time()
    parts = sorted(glob.glob(args.bin + ".part*")) or [args.bin]
    print(f"leyendo {len(parts)} parte(s)…", flush=True)
    n = 0
    size = REC.size
    for path in parts:
        if not os.path.exists(path):
            continue
        f = open(path, "rb")
        while True:
            chunk = f.read(size * 100000)
            if not chunk:
                break
            batch = [REC.unpack(chunk[i:i + size]) for i in range(0, len(chunk) - size + 1, size)]
            con.executemany("INSERT INTO raw VALUES (?,?,?)", batch)
            n += len(batch)
            if n % 10_000_000 < 100000:
                print(f"  insertadas {n:,} filas ({(time.time()-t0)/60:.1f} min)", flush=True)
        f.close()
    print(f"agrupando {n:,} filas…", flush=True)
    con.execute("""CREATE TABLE book AS
        SELECT k,
               m,
               SUM(r=2) AS w,
               SUM(r=1) AS d,
               SUM(r=0) AS l,
               COUNT(*) AS n
        FROM raw GROUP BY k, m""")
    con.execute("DROP TABLE raw")
    con.execute("CREATE INDEX idx_book_k ON book(k)")
    con.execute("VACUUM")
    con.commit()
    rows = con.execute("SELECT COUNT(*) FROM book").fetchone()[0]
    con.close()
    print(f"LISTO aggregate: {rows:,} (posición,jugada) únicas en {(time.time()-t0)/60:.1f} min")
    print(f"Libro: {args.db} ({os.path.getsize(args.db)/1e9:.2f} GB)")


if __name__ == "__main__":
    DEF_ROOT = r"C:\Users\canch\Documents\ChessBase\Bases\Mega2026\Mega Database 2026"
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)

    b = sub.add_parser("build")
    b.add_argument("--root", default=DEF_ROOT)
    b.add_argument("--out", default="mega_raw.bin")
    b.add_argument("--depth", type=int, default=24)
    b.add_argument("--count", type=int, default=None, help="nº de registros a procesar (def: todos)")
    b.add_argument("--start", type=int, default=1)
    b.add_argument("--workers", type=int, default=max(1, (os.cpu_count() or 2) - 2))
    b.set_defaults(func=cmd_build)

    a = sub.add_parser("aggregate")
    a.add_argument("--bin", default="mega_raw.bin")
    a.add_argument("--db", default="mega_book.sqlite")
    a.set_defaults(func=cmd_aggregate)

    args = p.parse_args()
    args.func(args)
