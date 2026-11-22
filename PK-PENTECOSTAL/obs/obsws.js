/* PK-PENTECOSTAL
 * Hecho por Sebastian Lopez · IPUC Natania 6° Etapa
 * Zona Especial Misionera – Archipiélago de San Andrés, Providencia y Santa Catalina
 * «Por toda la tierra salió su voz, y hasta el extremo del mundo sus palabras.» Salmos 19:4
 */
/* Cliente mínimo de OBS WebSocket v5 (OBS Studio 28+ trae el servidor integrado:
 * Herramientas → Ajustes del servidor WebSocket). Sin dependencias. */
(function () {
  const SUB_TODOS = 0x7ff;            // General, Config, Scenes, Inputs, Transitions, Filters, Outputs, SceneItems, MediaInputs, Vendors, Ui
  const SUB_VUMETROS = 1 << 16;       // InputVolumeMeters (alto volumen)

  async function sha256b64(txt) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  }

  class OBSWS {
    constructor() { this.ws = null; this.conectado = false; this.pend = new Map(); this.oyentes = {}; this.n = 0; }
    on(ev, fn) { (this.oyentes[ev] ||= []).push(fn); return this; }
    emit(ev, d) { (this.oyentes[ev] || []).forEach((f) => { try { f(d); } catch (e) { console.error(e); } }); }

    conectar({ host = 'localhost', puerto = 4455, clave = '', vumetros = true } = {}) {
      this.desconectar(true);
      return new Promise((resolve, reject) => {
        let ws;
        try { ws = new WebSocket(`ws://${host}:${puerto}`); } catch (e) { return reject(e); }
        this.ws = ws;
        let listo = false;
        const fallo = (msg) => { if (!listo) { listo = true; reject(new Error(msg)); } };
        const tmo = setTimeout(() => { fallo('Tiempo de espera agotado'); ws.close(); }, 6000);
        ws.onmessage = async (m) => {
          const { op, d } = JSON.parse(m.data);
          if (op === 0) { // Hello
            const ident = { rpcVersion: 1, eventSubscriptions: SUB_TODOS | (vumetros ? SUB_VUMETROS : 0) };
            if (d.authentication) {
              if (!clave) { fallo('OBS pide contraseña'); ws.close(); return; }
              const secret = await sha256b64(clave + d.authentication.salt);
              ident.authentication = await sha256b64(secret + d.authentication.challenge);
            }
            ws.send(JSON.stringify({ op: 1, d: ident }));
          } else if (op === 2) { // Identified
            clearTimeout(tmo); listo = true; this.conectado = true;
            this.emit('conectado', d); resolve(d);
          } else if (op === 5) { // Event
            this.emit(d.eventType, d.eventData || {}); this.emit('*', d);
          } else if (op === 7) { // RequestResponse
            const p = this.pend.get(d.requestId); if (!p) return;
            this.pend.delete(d.requestId);
            if (d.requestStatus.result) p.ok(d.responseData || {});
            else p.err(Object.assign(new Error(d.requestStatus.comment || `Error OBS ${d.requestStatus.code}`), { code: d.requestStatus.code }));
          }
        };
        ws.onerror = () => fallo('No se pudo conectar con OBS');
        ws.onclose = (e) => {
          clearTimeout(tmo);
          const era = this.conectado; this.conectado = false;
          for (const p of this.pend.values()) p.err(new Error('Conexión cerrada'));
          this.pend.clear();
          if (e.code === 4009) fallo('Contraseña incorrecta');
          else fallo(e.reason || 'No se pudo conectar con OBS (¿está abierto y con el servidor WebSocket activado?)');
          if (era) this.emit('desconectado', { code: e.code, reason: e.reason });
        };
      });
    }

    // Conecta con los datos guardados; si fallan (puerto o contraseña que ya no coinciden con OBS), pide a
    // detectar() la configuración real del OBS de este equipo ({encontrado, habilitado, puerto, clave}) y
    // reintenta con ella. Devuelve { usada, corregida } para que el panel guarde los datos buenos.
    async conectarAuto(cfg, detectar) {
      try { await this.conectar(cfg); return { usada: cfg, corregida: false }; } catch (e1) {
        let loc = null;
        try { loc = detectar ? await detectar() : null; } catch (_) { /* sin detección */ }
        if (!loc || !loc.encontrado) throw e1;
        if (loc.habilitado === false) throw new Error('El servidor WebSocket de OBS está desactivado. En OBS: Herramientas → Ajustes del servidor WebSocket → marque «Habilitar servidor WebSocket»');
        const otra = Object.assign({}, cfg, { host: 'localhost', puerto: +loc.puerto || 4455, clave: loc.clave || '' });
        if (otra.host === cfg.host && otra.puerto === +cfg.puerto && otra.clave === cfg.clave) throw e1;
        try { await this.conectar(otra); return { usada: otra, corregida: true }; } catch (e2) {
          if (/contraseña/i.test(e2.message)) throw e2;
          throw new Error(`No se pudo conectar con OBS (puerto ${otra.puerto}). ¿Está OBS abierto?`);
        }
      }
    }

    desconectar(silencioso) {
      if (this.ws) { const w = this.ws; this.ws = null; if (silencioso) w.onclose = null; try { w.close(); } catch (_) { /* ya cerrado */ } }
      this.conectado = false;
    }

    call(requestType, requestData = {}) {
      if (!this.conectado || !this.ws) return Promise.reject(new Error('OBS no está conectado'));
      const requestId = 'r' + (++this.n);
      return new Promise((ok, err) => {
        this.pend.set(requestId, { ok, err });
        this.ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
        setTimeout(() => { if (this.pend.has(requestId)) { this.pend.delete(requestId); err(new Error('OBS no respondió: ' + requestType)); } }, 10000);
      });
    }
  }
  window.OBSWS = OBSWS;
})();
