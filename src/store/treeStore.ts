import { create } from 'zustand';
import { Chess }   from 'chess.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export interface TreeNode {
  id:       string;
  fen:      string;          // posición DESPUÉS de la jugada (root = posición inicial)
  san:      string | null;   // SAN de la jugada que llegó aquí
  uci:      string | null;   // jugada en UCI largo (lan)
  parentId: string | null;
  children: string[];        // children[0] = continuación principal; resto = variantes
  isWhite:  boolean;         // la jugada la hicieron las blancas
  moveNo:   number;          // nº de jugada (fullmove) de la jugada
  evalCp?:  number | null;   // eval relativa a blancas (la rellena el análisis de partida)
  nag?:     string;          // glifo: '!!', '!', '!?', '?!', '?', '??'
  comment?: string;          // comentario de la jugada (estudio)
}

export interface TreeSnapshot {
  nodes:     Record<string, TreeNode>;
  rootId:    string;
  currentId: string;
  seq:       number;
}

interface TreeState {
  nodes:       Record<string, TreeNode>;
  rootId:      string;
  currentId:   string;
  orientation: 'white' | 'black';
  _seq:        number;

  currentFen:    () => string;
  currentNode:   () => TreeNode;
  pathToCurrent: () => TreeNode[];
  mainline:      () => TreeNode[];

  playUci:    (uci: string) => boolean;
  goTo:       (id: string) => void;
  goPrev:     () => void;
  goNext:     () => void;
  goFirst:    () => void;
  goLast:     () => void;
  flip:       () => void;
  loadFen:    (fen: string) => boolean;
  loadPgn:    (pgn: string) => boolean;
  toPgn:      () => string;
  exportPgn:  (opts: { comments: boolean; glyphs: boolean; variations: boolean }) => string;
  setEval:    (id: string, evalCp: number | null, nag?: string) => void;
  setNag:     (id: string, nag: string | undefined) => void;
  setComment: (id: string, comment: string) => void;
  promote:    (id: string) => void;
  remove:     (id: string) => void;
  resetStart: () => void;
  snapshot:   () => TreeSnapshot;
  loadSnapshot: (s: TreeSnapshot) => void;
}

function makeRoot(fen: string, id: string): TreeNode {
  const f = fen.split(' ');
  const fullmove = Number(f[5]) || 1;
  return {
    id, fen, san: null, uci: null, parentId: null, children: [],
    // El root es "antes" de cualquier jugada; isWhite/moveNo no se muestran.
    isWhite: f[1] !== 'w', moveNo: fullmove,
  };
}

export const useTreeStore = create<TreeState>((set, get) => ({
  nodes:       { n0: makeRoot(START_FEN, 'n0') },
  rootId:      'n0',
  currentId:   'n0',
  orientation: 'white',
  _seq:        1,

  currentFen:  () => get().nodes[get().currentId].fen,
  currentNode: () => get().nodes[get().currentId],

  pathToCurrent: () => {
    const { nodes } = get();
    const path: TreeNode[] = [];
    let id: string | null = get().currentId;
    while (id) { path.unshift(nodes[id]); id = nodes[id].parentId; }
    return path;
  },

  mainline: () => {
    const { nodes, rootId } = get();
    const line: TreeNode[] = [];
    let id: string | undefined = rootId;
    while (id) { line.push(nodes[id]); id = nodes[id].children[0]; }
    return line;
  },

  playUci: (uci) => {
    const { nodes, currentId } = get();
    const cur = nodes[currentId];
    const c = new Chess(cur.fen);
    let mv;
    try {
      mv = c.move({
        from: uci.slice(0, 2),
        to:   uci.slice(2, 4),
        promotion: uci.length > 4 ? uci[4] : undefined,
      });
    } catch { return false; }
    if (!mv) return false;

    // ¿Ya existe esa jugada como hijo? → solo navegar
    const existing = cur.children.find((cid) => nodes[cid].uci === mv.lan);
    if (existing) { set({ currentId: existing }); return true; }

    const before = cur.fen.split(' ');
    const id = 'n' + get()._seq;
    const node: TreeNode = {
      id, fen: c.fen(), san: mv.san, uci: mv.lan,
      parentId: cur.id, children: [],
      isWhite: before[1] === 'w', moveNo: Number(before[5]) || 1,
    };
    set((s) => ({
      nodes: {
        ...s.nodes,
        [id]:     node,
        [cur.id]: { ...s.nodes[cur.id], children: [...s.nodes[cur.id].children, id] },
      },
      currentId: id,
      _seq: s._seq + 1,
    }));
    return true;
  },

  goTo:    (id) => { if (get().nodes[id]) set({ currentId: id }); },
  goPrev:  () => { const p = get().nodes[get().currentId].parentId; if (p) set({ currentId: p }); },
  goNext:  () => { const c = get().nodes[get().currentId].children[0]; if (c) set({ currentId: c }); },
  goFirst: () => set({ currentId: get().rootId }),
  goLast:  () => {
    const { nodes } = get();
    let id = get().currentId;
    while (nodes[id].children[0]) id = nodes[id].children[0];
    set({ currentId: id });
  },

  flip: () => set((s) => ({ orientation: s.orientation === 'white' ? 'black' : 'white' })),

  loadFen: (fen) => {
    try { new Chess(fen); } catch { return false; }
    set({ nodes: { n0: makeRoot(fen, 'n0') }, rootId: 'n0', currentId: 'n0', _seq: 1 });
    return true;
  },

  loadPgn: (pgn) => {
    const c = new Chess();
    try { c.loadPgn(pgn); } catch { return false; }
    const history = c.history({ verbose: true });
    if (history.length === 0) return false;

    const startFen = (history[0] as { before?: string }).before || START_FEN;
    const nodes: Record<string, TreeNode> = { n0: makeRoot(startFen, 'n0') };
    let parent = 'n0';
    let seq = 1;
    for (const m of history) {
      const before = (m.before as string).split(' ');
      const id = 'n' + seq++;
      nodes[id] = {
        id, fen: m.after as string, san: m.san, uci: m.lan,
        parentId: parent, children: [],
        isWhite: before[1] === 'w', moveNo: Number(before[5]) || 1,
      };
      nodes[parent].children = [id];
      parent = id;
    }
    set({ nodes, rootId: 'n0', currentId: parent, _seq: seq });
    return true;
  },

  toPgn: () => {
    const { nodes, rootId } = get();
    const root = nodes[rootId];
    const c = new Chess(root.fen);
    let id = root.children[0];
    while (id) { c.move(nodes[id].san as string); id = nodes[id].children[0]; }
    return c.pgn();
  },

  exportPgn: (opts) => {
    const { nodes, rootId } = get();
    const root = nodes[rootId];
    const render = (startId: string, forceNum: boolean): string => {
      const out: string[] = [];
      let id: string | undefined = startId;
      let withNum = forceNum;
      while (id) {
        const n: TreeNode = nodes[id];
        const num = n.isWhite ? `${n.moveNo}. ` : (withNum ? `${n.moveNo}... ` : '');
        out.push(num + n.san + (opts.glyphs && n.nag ? n.nag : ''));
        let force = false;
        if (opts.comments && n.comment) { out.push(`{${n.comment}}`); force = true; }
        const parent = n.parentId ? nodes[n.parentId] : null;
        if (opts.variations && parent && parent.children[0] === n.id && parent.children.length > 1) {
          for (const alt of parent.children.slice(1)) out.push(`(${render(alt, true)})`);
          force = true;
        }
        withNum = force;
        id = n.children[0];
      }
      return out.join(' ');
    };
    const moves = root.children.length ? render(root.children[0], true) : '';
    const headers = '[Event "?"]\n[Site "?"]\n[Date "????.??.??"]\n[Round "?"]\n[White "?"]\n[Black "?"]\n[Result "*"]\n';
    const setup = root.fen !== START_FEN ? `[SetUp "1"]\n[FEN "${root.fen}"]\n` : '';
    return headers + setup + '\n' + (moves ? moves + ' *' : '*');
  },

  setEval: (id, evalCp, nag) => set((s) =>
    s.nodes[id] ? { nodes: { ...s.nodes, [id]: { ...s.nodes[id], evalCp, nag } } } : {}),

  setNag: (id, nag) => set((s) =>
    s.nodes[id] ? { nodes: { ...s.nodes, [id]: { ...s.nodes[id], nag } } } : {}),

  setComment: (id, comment) => set((s) =>
    s.nodes[id] ? { nodes: { ...s.nodes, [id]: { ...s.nodes[id], comment } } } : {}),

  snapshot: () => {
    const { nodes, rootId, currentId, _seq } = get();
    return { nodes: JSON.parse(JSON.stringify(nodes)), rootId, currentId, seq: _seq };
  },

  loadSnapshot: (s) => set({
    nodes: JSON.parse(JSON.stringify(s.nodes)),
    rootId: s.rootId,
    currentId: s.nodes[s.currentId] ? s.currentId : s.rootId,
    _seq: s.seq,
  }),

  promote: (id) => set((s) => {
    const node = s.nodes[id];
    if (!node?.parentId) return {};
    const parent = s.nodes[node.parentId];
    const rest = parent.children.filter((c) => c !== id);
    return { nodes: { ...s.nodes, [parent.id]: { ...parent, children: [id, ...rest] } } };
  }),

  remove: (id) => set((s) => {
    const node = s.nodes[id];
    if (!node?.parentId) return {};
    const nodes = { ...s.nodes };
    const collect = (nid: string) => { nodes[nid].children.forEach(collect); delete nodes[nid]; };
    collect(id);
    const parent = nodes[node.parentId];
    nodes[node.parentId] = { ...parent, children: parent.children.filter((c) => c !== id) };
    const currentId = s.nodes[s.currentId] && nodes[s.currentId] ? s.currentId : node.parentId;
    return { nodes, currentId };
  }),

  resetStart: () => set({ nodes: { n0: makeRoot(START_FEN, 'n0') }, rootId: 'n0', currentId: 'n0', _seq: 1 }),
}));
