'use client';

import { useState, useEffect, useCallback } from 'react';

// ─── Singleton WebSocket ───────────────────────────────────────────────────────

let _ws: WebSocket | null = null;
let _pendingResolve: ((r: unknown) => void) | null = null;
let _onAnalyzeInfo:   ((msg: unknown) => void) | null = null;
let _onAnalyzeDone:   ((msg: unknown) => void) | null = null;
let _statusListeners: Set<(s: string) => void> = new Set();
let _messageListeners: Set<(msg: unknown) => void> = new Set();
let _status = 'disconnected';
let _queue: string[] = [];

function setStatus(s: string) {
  _status = s;
  _statusListeners.forEach((fn) => fn(s));
}

/** Envía solo si el socket está OPEN; si no, encola hasta que abra. */
function send(data: string) {
  if (_ws && _ws.readyState === WebSocket.OPEN) _ws.send(data);
  else _queue.push(data);
}

export function wsConnect() {
  if (typeof window === 'undefined') return;
  setStatus('connecting');

  _ws = new WebSocket(`ws://${window.location.host}/ws`);

  _ws.onopen = () => {
    setStatus('connected');
    const pend = _queue; _queue = [];
    pend.forEach((d) => { try { _ws?.send(d); } catch { /* noop */ } });
  };

  _ws.onclose = () => {
    setStatus('disconnected');
    setTimeout(wsConnect, 2500);
  };

  _ws.onerror = () => setStatus('disconnected');

  _ws.onmessage = (e: MessageEvent) => {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(e.data as string); } catch { return; }

    // Notificar oyentes generales
    _messageListeners.forEach((fn) => fn(msg));

    const { event } = msg;
    if (event === 'ready') return;

    if (event === 'analyze_info')   { _onAnalyzeInfo?.(msg);  return; }
    if (event === 'analyze_result') { _onAnalyzeDone?.(msg); _onAnalyzeInfo = _onAnalyzeDone = null; return; }

    if (_pendingResolve) {
      const r = _pendingResolve;
      _pendingResolve = null;
      r(msg.result);
    }
  };
}

/** Envía un comando y espera una respuesta. */
export function wsCmd<T = unknown>(cmd: string, payload: object = {}): Promise<T> {
  return new Promise((resolve) => {
    _pendingResolve = resolve as (r: unknown) => void;
    send(JSON.stringify({ cmd, payload }));
  });
}

/** Inicia análisis con streaming. */
export function wsAnalyze(
  payload: object,
  onInfo: (msg: unknown) => void,
  onDone: (msg: unknown) => void,
) {
  _onAnalyzeInfo = onInfo;
  _onAnalyzeDone = onDone;
  send(JSON.stringify({ cmd: 'analyze', payload }));
}

/** Detiene el análisis. */
export function wsStopAnalysis() {
  _onAnalyzeInfo = _onAnalyzeDone = null;
  // Solo enviar si hay conexión activa (en CONNECTING no hay nada que parar)
  if (_ws && _ws.readyState === WebSocket.OPEN) {
    _ws.send(JSON.stringify({ cmd: 'stop_analysis', payload: {} }));
  }
}

// ─── React hooks ──────────────────────────────────────────────────────────────

/** Hook para el estado de conexión. */
export function useWsStatus() {
  const [status, setStatus2] = useState(_status);

  useEffect(() => {
    const fn = (s: string) => setStatus2(s);
    _statusListeners.add(fn);
    return () => { _statusListeners.delete(fn); };
  }, []);

  return { status };
}

/** Hook para escuchar mensajes específicos del WebSocket. */
export function useWsEvent(
  event: string,
  handler: (msg: Record<string, unknown>) => void,
) {
  const stableHandler = useCallback(handler, []); // eslint-disable-line

  useEffect(() => {
    const fn = (msg: unknown) => {
      const m = msg as Record<string, unknown>;
      if (m.event === event) stableHandler(m);
    };
    _messageListeners.add(fn);
    return () => { _messageListeners.delete(fn); };
  }, [event, stableHandler]);
}
