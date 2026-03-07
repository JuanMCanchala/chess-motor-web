'use strict';

const { spawn }   = require('child_process');
const readline    = require('readline');

/**
 * EngineBridge — gestiona el proceso del motor KallpaModulo.
 *
 * Protocolo: JSON por línea en stdin/stdout.
 * Comandos normales:    request → 1 respuesta JSON
 * Comando "analyze":   request → N líneas tipo:info + 1 línea tipo:result
 */
class EngineBridge {
  constructor(enginePath) {
    this._path      = enginePath;
    this._proc      = null;
    this._rl        = null;
    this._pending   = null;   // { resolve, reject } para comando actual
    this._analyzing = false;
    this._onInfo    = null;
    this._onDone    = null;
  }

  /** Lanza el proceso del motor. */
  start() {
    this._proc = spawn(this._path, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this._rl = readline.createInterface({ input: this._proc.stdout });

    this._rl.on('line', (line) => {
      line = line.trim();
      if (!line) return;

      let msg;
      try { msg = JSON.parse(line); } catch { return; }

      if (this._analyzing) {
        if (msg.type === 'info') {
          this._onInfo?.(msg);
        } else if (msg.type === 'result') {
          this._analyzing = false;
          const cb = this._onDone;
          this._onInfo = this._onDone = null;
          cb?.(msg);
        }
      } else if (this._pending) {
        const { resolve } = this._pending;
        this._pending = null;
        resolve(msg);
      }
    });

    this._proc.on('error', (err) => {
      console.error('[engine] error:', err.message);
      const p = this._pending;
      if (p) { this._pending = null; p.reject(err); }
    });

    this._proc.on('exit', (code, signal) => {
      console.log(`[engine] exit code=${code} signal=${signal}`);
    });

    this._proc.stderr.on('data', () => { /* ignorar stderr del motor */ });
  }

  _write(obj) {
    if (this._proc?.stdin?.writable)
      this._proc.stdin.write(JSON.stringify(obj) + '\n');
  }

  /** Envía un comando y espera una respuesta JSON. */
  send(cmd, payload = {}) {
    return new Promise((resolve, reject) => {
      this._pending = { resolve, reject };
      this._write({ cmd, payload });
    });
  }

  /** Inicia análisis con streaming. onInfo se llama por cada depth, onDone al terminar. */
  startAnalyze(payload, onInfo, onDone) {
    this._analyzing = true;
    this._onInfo    = onInfo;
    this._onDone    = onDone;
    this._write({ cmd: 'analyze', payload });
  }

  /** Detiene el análisis en curso. */
  stopAnalyze() {
    this._analyzing = false;
    this._onInfo = this._onDone = null;
    this._write({ cmd: 'stop_analysis', payload: {} });
  }

  /** Mata el proceso del motor. */
  kill() {
    this._analyzing = false;
    this._pending   = null;
    this._onInfo    = this._onDone = null;
    this._rl?.close();
    this._rl = null;
    if (this._proc) {
      this._proc.kill('SIGTERM');
      this._proc = null;
    }
  }
}

module.exports = EngineBridge;
