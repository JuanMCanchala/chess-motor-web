import { create } from 'zustand';
import { TreeSnapshot, TreeNode } from './treeStore';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export interface Chapter { id: string; name: string; snap: TreeSnapshot; }
export interface Study   { id: string; name: string; chapters: Chapter[]; }

interface StudyStore {
  studies:          Study[];
  currentStudyId:   string | null;
  currentChapterId: string | null;

  load:           () => void;
  addStudy:       (name: string) => void;
  renameStudy:    (id: string, name: string) => void;
  deleteStudy:    (id: string) => void;
  selectStudy:    (id: string) => void;
  addChapter:     (name: string) => string;
  renameChapter:  (id: string, name: string) => void;
  deleteChapter:  (id: string) => void;
  selectChapter:  (id: string) => void;
  saveChapter:    (id: string, snap: TreeSnapshot) => void;

  currentStudy:   () => Study | undefined;
  currentChapter: () => Chapter | undefined;
}

function uid(p: string) {
  return p + Math.random().toString(36).slice(2, 9);
}

export function emptySnapshot(): TreeSnapshot {
  const root: TreeNode = {
    id: 'n0', fen: START_FEN, san: null, uci: null, parentId: null,
    children: [], isWhite: false, moveNo: 1,
  };
  return { nodes: { n0: root }, rootId: 'n0', currentId: 'n0', seq: 1 };
}

const LS_KEY = 'kallpa_studies';

function persist(studies: Study[]) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(LS_KEY, JSON.stringify(studies)); } catch { /* noop */ }
}

export const useStudyStore = create<StudyStore>((set, get) => ({
  studies: [],
  currentStudyId: null,
  currentChapterId: null,

  load: () => {
    if (typeof window === 'undefined') return;
    let studies: Study[] = [];
    try { studies = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { studies = []; }
    if (!Array.isArray(studies) || studies.length === 0) {
      studies = [{
        id: uid('st'), name: 'Mi repertorio',
        chapters: [{ id: uid('ch'), name: 'Capítulo 1', snap: emptySnapshot() }],
      }];
    }
    const st = studies[0];
    set({ studies, currentStudyId: st.id, currentChapterId: st.chapters[0]?.id ?? null });
  },

  addStudy: (name) => set((s) => {
    const study: Study = { id: uid('st'), name: name || 'Estudio', chapters: [{ id: uid('ch'), name: 'Capítulo 1', snap: emptySnapshot() }] };
    const studies = [...s.studies, study];
    persist(studies);
    return { studies, currentStudyId: study.id, currentChapterId: study.chapters[0].id };
  }),

  renameStudy: (id, name) => set((s) => {
    const studies = s.studies.map((st) => st.id === id ? { ...st, name } : st);
    persist(studies); return { studies };
  }),

  deleteStudy: (id) => set((s) => {
    const studies = s.studies.filter((st) => st.id !== id);
    persist(studies);
    const cur = studies[0];
    return { studies, currentStudyId: cur?.id ?? null, currentChapterId: cur?.chapters[0]?.id ?? null };
  }),

  selectStudy: (id) => set((s) => {
    const st = s.studies.find((x) => x.id === id);
    return { currentStudyId: id, currentChapterId: st?.chapters[0]?.id ?? null };
  }),

  addChapter: (name) => {
    const id = uid('ch');
    set((s) => {
      const studies = s.studies.map((st) => st.id === s.currentStudyId
        ? { ...st, chapters: [...st.chapters, { id, name: name || `Capítulo ${st.chapters.length + 1}`, snap: emptySnapshot() }] }
        : st);
      persist(studies);
      return { studies, currentChapterId: id };
    });
    return id;
  },

  renameChapter: (id, name) => set((s) => {
    const studies = s.studies.map((st) => st.id === s.currentStudyId
      ? { ...st, chapters: st.chapters.map((c) => c.id === id ? { ...c, name } : c) } : st);
    persist(studies); return { studies };
  }),

  deleteChapter: (id) => set((s) => {
    const studies = s.studies.map((st) => st.id === s.currentStudyId
      ? { ...st, chapters: st.chapters.filter((c) => c.id !== id) } : st);
    persist(studies);
    const st = studies.find((x) => x.id === s.currentStudyId);
    const nextChap = s.currentChapterId === id ? (st?.chapters[0]?.id ?? null) : s.currentChapterId;
    return { studies, currentChapterId: nextChap };
  }),

  selectChapter: (id) => set({ currentChapterId: id }),

  saveChapter: (id, snap) => set((s) => {
    const studies = s.studies.map((st) => st.id === s.currentStudyId
      ? { ...st, chapters: st.chapters.map((c) => c.id === id ? { ...c, snap } : c) } : st);
    persist(studies); return { studies };
  }),

  currentStudy:   () => get().studies.find((st) => st.id === get().currentStudyId),
  currentChapter: () => get().currentStudy()?.chapters.find((c) => c.id === get().currentChapterId),
}));
