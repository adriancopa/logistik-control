const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', TILE_RESPALDO = 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png';
function crearMapa(el, centro = [-17.78, -63.18], zoom = 11) {   // los mosaicos vistos se guardan en el dispositivo (sw.js): la 2.ª vez cargan al instante
  const mapa = L.map(el, { preferCanvas: true, fadeAnimation: false }).setView(centro, zoom);
  const opc = { maxZoom: 19, crossOrigin: true, updateWhenIdle: false, keepBuffer: 4, attribution: '© OpenStreetMap' };
  let cap = L.tileLayer(TILE_URL, opc).addTo(mapa), errores = 0;
  cap.on('tileerror', () => { if (++errores === 4) { mapa.removeLayer(cap); cap = L.tileLayer(TILE_RESPALDO, { ...opc, subdomains: 'abc' }).addTo(mapa); } });
  return mapa;
}
const pinIcono = (txt, cls = '') => L.divIcon({ html: `<div class="pin ${cls}">${txt}</div>`, className: '', iconSize: [30, 30], iconAnchor: [15, 15] });
// LOGISTIK CONTROL — App móvil (chofer y solicitante). Offline-first: toda acción del chofer entra a una cola local
// (IndexedDB) con hora y GPS tomados automáticamente por el dispositivo, y se sincroniza al servidor cuando hay red.
const $ = (s, r = document) => r.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const Cap = window.Capacitor;
const native = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
const plugin = (n) => Cap.registerPlugin(n);
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2));
const TZ_MIN = -240;                       // hora de planificación: Bolivia (UTC-4)
const SOLO_VIAJE = ['VIAJE', 'ENTREGA_VEHICULO', 'ESPERA'];
const FINAL = ['FINALIZADA', 'OMITIDA'];
const CAUSAS = { TRAFICO: 'Tráfico', AVERIA: 'Avería', ESPERA_CARGA: 'Espera para cargar', ESPERA_DESCARGA: 'Espera para descargar', FALTA_PRODUCTO: 'Falta de producto', FALTA_DOCUMENTACION: 'Falta de documentación', CLIENTE_NO_DISPONIBLE: 'Cliente no disponible', DIRECCION_INCORRECTA: 'Dirección incorrecta', CAMBIO_PRIORIDAD: 'Cambio de prioridad', SOLICITUD_URGENTE: 'Solicitud urgente', PROBLEMA_VEHICULO: 'Problema del vehículo', CLIMA: 'Condición climática', OTRO: 'Otro' };

// ---------- almacenamiento local ----------
const dbp = new Promise((res, rej) => {
  const r = indexedDB.open('logistik', 1);
  r.onupgradeneeded = () => { r.result.createObjectStore('kv'); r.result.createObjectStore('ops', { keyPath: 'seq', autoIncrement: true }); };
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const idb = async (store, mode, fn) => { const d = await dbp; return new Promise((res, rej) => { const t = d.transaction(store, mode); const out = fn(t.objectStore(store)); t.oncomplete = () => res(out.result); t.onerror = () => rej(t.error); }); };
const kvGet = (k) => idb('kv', 'readonly', (s) => s.get(k));
const kvSet = (k, v) => idb('kv', 'readwrite', (s) => s.put(v, k));
const opsAll = () => idb('ops', 'readonly', (s) => s.getAll());
const opsAdd = (op) => idb('ops', 'readwrite', (s) => s.add(op));
const opsDel = (seqs) => idb('ops', 'readwrite', (s) => { seqs.forEach((q) => s.delete(q)); return {}; });
const opsClear = () => idb('ops', 'readwrite', (s) => s.clear());

const S = { server: '', token: null, user: null, mj: null, pend: 0, online: navigator.onLine, errores: [], pos: null, gpsOn: false, gpsErr: null, buf: [], tab: 'nueva', syncing: false };
const app = $('#app');

// ---------- red ----------
async function api(method, url, body, timeout = 15000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeout);
  try {
    const r = await fetch(S.server + '/api' + url, { method, signal: ac.signal, headers: { 'content-type': 'application/json', ...(S.token && { authorization: 'Bearer ' + S.token }) }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    S.online = true;
    if (!r.ok) throw Object.assign(new Error(j.error || 'Error ' + r.status), { status: r.status, detail: j });
    return j;
  } catch (e) { if (!e.status) { S.online = false; e.message = 'Sin conexión con el servidor'; } throw e; } finally { clearTimeout(t); }
}
const normUrl = (u) => { u = String(u || '').trim().replace(/\/+$/, ''); return u && !/^https?:\/\//.test(u) ? 'http://' + u : u; };

// ---------- tiempo y geografía ----------
const minutosDesde = (fecha, hhmm, iso) => Math.round((Date.parse(iso) - (Date.parse(`${fecha}T${hhmm}:00Z`) - TZ_MIN * 60000)) / 60000);
const haversineM = (a, b, c, d) => { const r = (x) => (x * Math.PI) / 180; const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2; return 12742000 * Math.asin(Math.sqrt(h)); };
const hhmm = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—');
const lugar = (a) => ({ lat: a.destino_lat ?? a.origen_lat, lon: a.destino_lon ?? a.origen_lon, nombre: a.destino_nombre || a.origen_nombre });

// ---------- GPS ----------
async function here() {
  if (S.pos && Date.now() - S.pos.at < 45000) return S.pos;
  try {
    if (native) { const p = await plugin('Geolocation').getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 }); return { lat: p.coords.latitude, lon: p.coords.longitude, prec: p.coords.accuracy, at: Date.now() }; }
    return await new Promise((res, rej) => navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lon: p.coords.longitude, prec: p.coords.accuracy, at: Date.now() }), rej, { enableHighAccuracy: true, timeout: 10000 }));
  } catch { return S.pos || null; }
}
function onLoc(p) {
  S.pos = { ...p, at: Date.now() }; S.gpsErr = null;
  const last = S.buf[S.buf.length - 1];
  if (!last || Date.parse(p.ts) - Date.parse(last.ts) >= 15000 || haversineM(last.lat, last.lon, p.lat, p.lon) > 40) S.buf.push(p);
  if (S.buf.length >= 10) flushGps();
}
async function flushGps() {
  const jid = S.mj?.jornada?.id; if (!S.buf.length || !jid) return;
  const puntos = S.buf; S.buf = [];
  await enqueue('GPS', { jornada_id: jid, puntos }, { local: false });
}
async function startGps() {
  if (S.gpsOn) return; S.gpsOn = true; render();
  try {
    if (native) {
      const BG = plugin('BackgroundGeolocation');
      S.watchId = await BG.addWatcher({ backgroundMessage: 'Registrando la ruta de su jornada de trabajo', backgroundTitle: 'Logistik Control — jornada activa', requestPermissions: true, stale: false, distanceFilter: 15 }, (loc, err) => {
        if (err) { S.gpsErr = err.code === 'NOT_AUTHORIZED' ? 'Permiso de ubicación denegado' : 'GPS no disponible'; if (err.code === 'NOT_AUTHORIZED' && confirm('Para registrar su ruta la app necesita el permiso de ubicación. ¿Abrir los ajustes?')) BG.openSettings(); render(); return; }
        onLoc({ lat: loc.latitude, lon: loc.longitude, prec: loc.accuracy, vel: loc.speed != null ? loc.speed * 3.6 : null, ts: new Date(loc.time || Date.now()).toISOString() });
      });
    } else {
      S.watchId = navigator.geolocation.watchPosition((p) => onLoc({ lat: p.coords.latitude, lon: p.coords.longitude, prec: p.coords.accuracy, vel: p.coords.speed != null ? p.coords.speed * 3.6 : null, ts: new Date(p.timestamp).toISOString() }), () => { S.gpsErr = 'GPS no disponible'; render(); }, { enableHighAccuracy: true });
    }
  } catch (e) { S.gpsErr = 'No se pudo iniciar el GPS'; S.gpsOn = false; }
}
async function stopGps() {
  await flushGps(); S.gpsOn = false;
  try { if (native) await plugin('BackgroundGeolocation').removeWatcher({ id: S.watchId }); else navigator.geolocation.clearWatch(S.watchId); } catch { /* ya detenido */ }
}

// ---------- cámara ----------
async function takePhoto() {
  if (native) {
    try { const r = await plugin('Camera').getPhoto({ quality: 55, width: 1280, resultType: 'base64', source: 'CAMERA', correctOrientation: true, saveToGallery: false }); return r.base64String; } catch { return null; }
  }
  return new Promise((res) => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.capture = 'environment';
    i.onchange = () => { const f = i.files[0]; if (!f) return res(null); const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.readAsDataURL(f); }; i.click();
  });
}

// ---------- cola de operaciones (offline) ----------
function applyLocal(op) {
  const it = S.mj?.itinerario; if (!it) return; const p = op.payload;
  const act = p.actividad_id && it.actividades.find((a) => a.id === p.actividad_id);
  const fin = (a, iso) => { a.ej_estado = 'FINALIZADA'; a.fin_real = iso; a.desv_fin_min = minutosDesde(it.fecha, a.hora_fin_plan, iso); const u = S.mj.config.umbral; a.semaforo = a.desv_fin_min <= u.verde_max ? 'VERDE' : a.desv_fin_min <= u.amarillo_max ? 'AMARILLO' : 'ROJO'; };
  switch (op.tipo) {
    case 'JORNADA_INICIO': S.mj.jornada = { id: p.jornada_id, inicio_en: op.ts, fin_en: null }; it.estado = 'EN_EJECUCION'; break;
    case 'ACT_VIAJE': if (act) { act.ej_estado = 'EN_VIAJE'; act.salida_en = op.ts; } break;
    case 'ACT_LLEGADA': if (act) { act.llegada_en = op.ts; SOLO_VIAJE.includes(act.tipo) ? fin(act, op.ts) : (act.ej_estado = 'LLEGO'); } break;
    case 'ACT_INICIO_OP': if (act) { act.ej_estado = 'EN_OPERACION'; act.inicio_op_en = op.ts; } break;
    case 'ACT_FIN_OP': if (act) fin(act, op.ts); break;
    case 'ACT_OMITIR': if (act) act.ej_estado = 'OMITIDA'; break;
    case 'JORNADA_FIN': if (S.mj.jornada) S.mj.jornada.fin_en = op.ts; it.estado = 'CERRADO'; it.actividades.forEach((a) => { if (!FINAL.includes(a.ej_estado || 'PENDIENTE')) a.ej_estado = 'OMITIDA'; }); break;
  }
}
async function enqueue(tipo, payload, { local = true } = {}) {
  if (tipo.startsWith('ACT_') || tipo === 'JORNADA_FIN') await flushGps();   // los puntos GPS deben llegar antes que la operación para contar los km
  const op = { id: uuid(), tipo, ts: new Date().toISOString(), payload };   // hora automática: el chofer no puede editarla
  await opsAdd(op);
  if (local) { applyLocal(op); await kvSet('mj', S.mj); }
  S.pend = (await opsAll()).length; render(); flush();
  return op;
}
async function flush() {
  if (S.syncing || !S.token) return; S.syncing = true;
  try {
    for (;;) {
      const ops = await opsAll(); S.pend = ops.length;
      if (!ops.length) break;
      let size = 0; const batch = [];
      for (const o of ops) { size += JSON.stringify(o).length; if (batch.length && (size > 2.5e6 || batch.length >= 40)) break; batch.push(o); }
      let r; try { r = await api('POST', '/sync', { ops: batch.map(({ seq, ...o }) => o) }, 60000); } catch (e) { if (e.status === 401) { S.needLogin = true; } break; }
      const done = [];
      r.results.forEach((x, i) => { if (x.ok || x.permanente) { done.push(batch[i].seq); if (!x.ok) S.errores.push(`${batch[i].tipo.replace('_', ' ')}: ${x.error}`); } });
      if (!done.length) break;
      await opsDel(done);
    }
    S.pend = (await opsAll()).length;
    if (!S.pend && S.user?.rol === 'CHOFER') await refreshMj();
  } finally { S.syncing = false; render(); }
}
async function refreshMj() {
  try {
    const mj = await api('GET', '/mi-jornada');
    S.mj = mj; await kvSet('mj', mj);
    for (const op of await opsAll()) if (op.tipo !== 'GPS' && op.tipo !== 'FOTO') applyLocal(op);   // re-aplica lo aún no sincronizado
  } catch (e) { if (e.status === 401) S.needLogin = true; }
}

// ---------- arranque / login ----------
async function boot() {
  const cfg = await kvGet('cfg');
  if (cfg) { S.token = cfg.token; S.user = cfg.user; S.mj = (await kvGet('mj')) || null; S.pend = (await opsAll()).length; }
  window.addEventListener('online', () => { S.online = true; flush(); }); window.addEventListener('offline', () => { S.online = false; render(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushGps(); else flush(); });
  setInterval(() => { flushGps(); flush(); }, 20000);
  if (S.token && S.user) { await render(); if (S.user.rol === 'CHOFER') { await refreshMj(); if (S.mj?.jornada && !S.mj.jornada.fin_en) startGps(); flush(); } else render(); } else loginView();
}
function loginView(msg = '') {
  app.innerHTML = `<main><div class="login"><div class="logo">🚚</div><h1>Logistik Control</h1><p class="mut" style="text-align:center;margin:0 0 14px">Ingrese con su usuario y PIN</p><div class="card">
    <label>Usuario</label><input id="u" autocapitalize="off" autocomplete="username" placeholder="Su usuario"><label>PIN</label><input id="p" type="password" inputmode="numeric" autocomplete="current-password" placeholder="Su clave numérica">
    <div class="err" id="e">${esc(msg)}</div><button class="big" id="go">Ingresar</button></div><div id="nube"></div><button class="sec link" id="cfgsync">☁ Conectar con Google Sheets</button></div></main>`;
  const aviso = () => { const e = window.LC_SYNC || {}, n = $('#nube'); if (n) n.innerHTML = e.estado === 'sin-clave' ? '<div class="card alerta"><b>🔑 Este equipo todavía no está conectado a la nube.</b><div class="mut">Abra el enlace de acceso que le dio el administrador, o conéctelo con la clave. Sin eso no verá los usuarios ni los datos de la empresa.</div><button class="big" id="cn2">Conectar con la nube</button></div>' : e.estado === "sin-red" ? '<div class="nota">Sin conexión a internet: se usarán los datos guardados en este equipo.</div>' : ''; if ($('#cn2')) $('#cn2').onclick = conectarNube; };
  aviso(); window.addEventListener('lc-sync', aviso, { once: false });
  const go = async () => {
    S.token = null; $('#e').textContent = ''; $('#go').disabled = true; $('#go').textContent = 'Ingresando…';
    try {
      const r = await api('POST', '/login', { usuario: $('#u').value.trim(), pin: $('#p').value });
      S.token = r.token; S.user = r.user; S.needLogin = false;
      if (!['CHOFER', 'SOLICITANTE'].includes(r.user.rol)) {   // administrador, planificador y consulta usan el panel de gestión
        sessionStorage.setItem('tk', r.token); location.href = 'admin.html'; return;
      }
      await kvSet('cfg', { server: '', token: S.token, user: S.user });
      if (S.user.rol === 'CHOFER') { await refreshMj(); if (S.mj?.jornada && !S.mj.jornada.fin_en) startGps(); flush(); }
      render();
    } catch (e) { $('#e').textContent = e.message; $('#go').disabled = false; $('#go').textContent = 'Ingresar'; }
  };
  $('#go').onclick = go; $('#p').onkeydown = (e) => { if (e.key === 'Enter') go(); };
  $('#cfgsync').onclick = conectarNube;
}
// ----- Sincronización con Google Sheets -----
const ETQ = { 'sin-clave': '🔑 Falta conectar con la nube', local: '⚪ Solo en este teléfono', ok: '🟢 Sincronizado', sincronizando: '🔄 Sincronizando…', 'sin-red': '🟠 Sin conexión', error: '🔴 Error de sincronización' };
function chipSync() { const e = window.LC_SYNC || { estado: 'local', pendientes: 0 }; return (ETQ[e.estado] || ETQ.local) + (e.pendientes ? ` · ${e.pendientes}` : ''); }
window.addEventListener('lc-sync', () => { const c = $('#syncchip'); if (c) c.textContent = chipSync(); });
let rt = null;
window.addEventListener('lc-datos', () => {   // llegaron cambios de otros usuarios: refresca sin interrumpir si se está escribiendo
  clearTimeout(rt);
  rt = setTimeout(async () => {
    if (!S.token || !S.user || document.querySelector('.modal')) return;
    const a = document.activeElement; if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return;
    if (S.user.rol === 'CHOFER') { await refreshMj(); render(); } else if (S.user.rol === 'SOLICITANTE' && S.tab === 'mis') render();
  }, 500);
});
function conectarNube() {
  modal(`<h2>Conectar con Google Sheets</h2><p class="mut">Pida al administrador la URL de la aplicación web y la clave. Solo hace falta la primera vez.</p>
    <label>URL de la aplicación web</label><input id="su" value="${esc(window.LC_URL_BASE || '')}" placeholder="https://script.google.com/macros/s/.../exec" autocapitalize="off"><label>Clave</label><input id="sk" autocapitalize="off">
    <div class="err" id="se"></div><button class="big" id="ok">CONECTAR</button><button class="sec" id="no" style="width:100%">Cancelar</button>`, (m, close) => {
    $('#no', m).onclick = close;
    $('#ok', m).onclick = async () => {
      const cuerpo = { url: $('#su', m).value, clave: $('#sk', m).value }; $('#ok', m).disabled = true; $('#se', m).textContent = 'Conectando… (puede tardar unos segundos)';
      try { await api('POST', '/sync/config', cuerpo, 90000); close(); toast('Conectado. Ya puede ingresar.'); }
      catch (er) {
        if (er.detail?.confirmar && confirm(er.message)) { try { await api('POST', '/sync/config', { ...cuerpo, reemplazar: true }, 90000); close(); toast('Conectado. Ya puede ingresar.'); return; } catch (e2) { $('#se', m).textContent = e2.message; } }
        else $('#se', m).textContent = er.message;
        $('#ok', m).disabled = false;
      }
    };
  });
}
async function logout() {
  const n = (await opsAll()).length;
  if (n && !confirm(`Hay ${n} registros sin sincronizar. Si sale ahora se perderán. ¿Salir de todos modos?`)) return;
  if (S.gpsOn) await stopGps();
  await opsClear(); await kvSet('cfg', null); await kvSet('mj', null); Object.assign(S, { token: null, user: null, mj: null, pend: 0, errores: [] }); loginView();
}

// ---------- interfaz ----------
function render() {
  if (!S.token || !S.user) return;
  if (S.needLogin) return loginView('Su sesión expiró. Ingrese de nuevo (sus registros pendientes se conservan).');
  const chips = `<span class="chip" id="syncchip">${chipSync()}</span>${S.user.rol === 'CHOFER' ? `<span class="chip ${S.gpsOn ? (S.gpsErr ? 'bad' : 'ok') : ''}">GPS ${S.gpsOn ? (S.gpsErr ? '⚠' : 'activo') : 'apagado'}</span>` : ''}${S.pend ? `<span class="chip warn">${S.pend} por sincronizar</span>` : ''}`;
  app.innerHTML = `<div class="top"><div class="who"><b>🚚 ${esc(S.user.nombre_completo)}</b><small>${esc({ CHOFER: 'Chofer', SOLICITANTE: 'Solicitante' }[S.user.rol] || S.user.rol)}</small></div><button class="pill" id="out">Salir</button><div class="chips">${chips}</div></div><main id="main"></main>`;
  $('#out').onclick = logout;
  const vista = { CHOFER: choferView, SOLICITANTE: solicitanteView }[S.user.rol];
  if (vista) vista($('#main')); else $('#main').innerHTML = '<div class="card">Su rol usa la versión web de Logistik Control.</div>';
}
function modal(html, bind) {
  const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div>${html}</div>`; document.body.appendChild(m);
  const close = () => m.remove(); bind(m, close); return close;
}
const toast = (t) => { const d = document.createElement('div'); d.textContent = t; d.className = 'toast'; document.body.appendChild(d); setTimeout(() => d.remove(), 3500); };

// ----- Chofer: MI JORNADA -----
function choferView(m) {
  const mj = S.mj, it = mj?.itinerario;
  const err = S.errores.length ? `<div class="card alerta"><b>⚠ Avisos</b>${S.errores.map((e) => `<div class="err">${esc(e)}</div>`).join('')}<button class="sec" id="clr">Entendido</button></div>` : '';
  if (!it) { m.innerHTML = `${err}<div class="card vacio"><div class="big-i">🗓️</div><h2>Hoy no tiene itinerario</h2><p class="mut">Cuando logística apruebe su ruta del día aparecerá aquí automáticamente.</p><button class="sec" id="ref" style="width:100%">🔄 Actualizar</button></div>`; $('#ref').onclick = async () => { await refreshMj(); render(); }; if ($('#clr')) $('#clr').onclick = () => { S.errores = []; render(); }; return; }
  const acts = it.actividades, j = mj.jornada, activa = j && !j.fin_en, cerrada = j?.fin_en;
  const est = (a) => a.ej_estado || 'PENDIENTE';
  const cur = acts.find((a) => !FINAL.includes(est(a)));
  const hechas = acts.filter((a) => FINAL.includes(est(a))).length, pct = acts.length ? Math.round((100 * hechas) / acts.length) : 0;
  const fechaTxt = new Date(it.fecha + 'T12:00:00').toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'long' });
  const head = `<div class="hero"><div class="hl">Mi jornada</div><div class="hd">${esc(fechaTxt)}${it.es_hoy ? '' : ' ⚠ no es hoy'}</div><div class="hs">🚚 ${esc(it.vehiculo_codigo)} · ${acts.length} actividades</div><div class="bar"><i style="width:${pct}%"></i></div><div class="hs">${hechas} de ${acts.length} listas (${pct}%)</div></div><button class="sec" id="ruta" style="width:100%;margin:0 0 12px">🗺️ Ver mi ruta del día y navegar</button>`;
  let body = '';
  if (!j) body = `<div class="card"><h2>Paso 1: inicie su jornada</h2><p class="mut">Al iniciar se activa el GPS de su teléfono para registrar el recorrido. Verá una notificación mientras esté activo.</p><button class="big ok" id="ini">▶ INICIAR JORNADA</button></div>`;
  else if (cerrada) body = resumenHTML();
  else if (!cur) body = `<div class="card"><h2>✅ Terminó todas las actividades</h2><p class="mut">Cierre la jornada para ver su resumen.</p><button class="big bad" id="finj">🏁 FINALIZAR JORNADA</button></div>`;
  else {
    const l = lugar(cur), p = S.pos; let dist = '';
    if (l.lat != null && p) { const d = haversineM(p.lat, p.lon, l.lat, l.lon); dist = `<div class="kv"><span>📏 Distancia al destino</span><b>${(d / 1000).toFixed(1)} km · ~${Math.max(1, Math.round(d / 1000 / 30 * 60))} min</b></div>`; }
    const e = est(cur), solo = SOLO_VIAJE.includes(cur.tipo), nxt = acts[acts.indexOf(cur) + 1];
    const pasos = solo ? (cur.tipo === 'ESPERA' ? [['⏸️', 'Pausa'], ['▶️', 'Fin']] : [['🚚', 'Viaje'], ['📍', 'Llegada']]) : [['🚚', 'Viaje'], ['📍', 'Llegada'], ['⚙️', 'Trabajo'], ['✅', 'Fin']];
    const ix = solo ? { PENDIENTE: 0, EN_VIAJE: 1 }[e] : { PENDIENTE: 1, EN_VIAJE: 1, LLEGO: 2, EN_OPERACION: 3 }[e];
    const dest = esc(l.nombre || 'el destino');
    const pausa = cur.tipo === 'ESPERA';
    const btn = { PENDIENTE: solo ? ['vi', pausa ? '⏸️ INICIAR PAUSA' : '🚚 INICIAR VIAJE', '', pausa ? 'Toque cuando empiece su pausa o almuerzo.' : `Toque cuando salga hacia <b>${dest}</b>.`] : ['ll', '📍 REGISTRAR LLEGADA', 'nar', `Ya está en <b>${dest}</b>? Toque para registrar su llegada (se guarda hora y ubicación solas).`], EN_VIAJE: ['ll', pausa ? '▶️ TERMINAR PAUSA' : '📍 REGISTRAR LLEGADA', 'nar', pausa ? 'Toque cuando retome el trabajo.' : `Toque cuando llegue a <b>${dest}</b>. La hora y la ubicación se guardan solas.`], LLEGO: ['io', '⚙️ INICIAR TRABAJO', 'ok', 'Toque cuando empiece a cargar o descargar.'], EN_OPERACION: ['fo', '✅ TERMINAR TRABAJO', 'bad', 'Toque al terminar. Podrá anotar el peso real y tomar una foto.'] }[e];
    body = `<div class="card act-card"><div class="row" style="justify-content:space-between;align-items:center"><span class="chip">ACTIVIDAD ${cur.numero} DE ${acts.length}</span><span class="chip ${e === 'PENDIENTE' ? '' : 'ok'}">${esc({ PENDIENTE: 'Por iniciar', EN_VIAJE: 'En camino', LLEGO: 'Llegó', EN_OPERACION: 'Trabajando' }[e])}</span></div>
      <h2 style="margin:10px 0 4px">${esc(cur.actividad)}</h2>
      <div class="kv"><span>📍 Destino</span><b>${esc(l.nombre || '—')}</b></div><div class="kv"><span>🕒 Horario planificado</span><b>${esc(cur.hora_inicio_plan)} – ${esc(cur.hora_fin_plan)}</b></div>${dist}${cur.peso_kg ? `<div class="kv"><span>⚖️ Carga</span><b>${cur.peso_kg > 0 ? 'subir' : 'bajar'} ${Math.abs(cur.peso_kg)} kg</b></div>` : ''}
      ${cur.comentarios ? `<div class="nota">📝 ${esc(cur.comentarios)}</div>` : ''}
      <div class="stepper">${pasos.map((s, k) => `<div class="s ${k < ix ? 'done' : k === ix ? 'now' : ''}"><i>${k < ix ? '✓' : s[0]}</i>${s[1]}</div>`).join('')}</div>
      <button class="big ${btn[2]}" id="${btn[0]}">${btn[1]}</button><p class="ayuda">${btn[3]}</p>
      ${e === 'PENDIENTE' && !solo ? '<button class="sec" id="vi" style="width:100%">🚚 Primero debo viajar hacia este punto</button>' : ''}</div>
      <div class="acciones">${l.lat != null ? '<button id="nav"><i>🧭</i>Cómo llegar</button>' : ''}<button id="foto"><i>📷</i>Foto</button><button id="inc"><i>⚠️</i>Problema</button><button id="comb"><i>⛽</i>Diésel</button><button id="mant"><i>🔧</i>Falla del vehículo</button></div>
      ${nxt ? `<div class="card flat"><span class="mut">Después:</span> <b>${esc(nxt.actividad)}</b> <span class="mut">(${esc(nxt.hora_inicio_plan)})</span></div>` : ''}
      <div class="row" style="margin-bottom:10px"><button class="sec peligro" id="omi">No se pudo realizar</button><button class="sec" id="finj">🏁 Terminar jornada ya</button></div>`;
  }
  const lista = `<div class="card"><h3 style="margin-top:0">📋 Mi ruta de hoy</h3>${acts.map((a) => `<div class="act"><span class="dot ${est(a)} ${a === cur ? 'cur' : ''}"></span><div style="flex:1"><b>${a.numero}. ${esc(a.actividad)}</b><br><span class="mut">${esc(a.hora_inicio_plan)}–${esc(a.hora_fin_plan)} · ${esc(a.destino_nombre || a.origen_nombre || '')}</span></div>${a.semaforo ? `<span class="sem ${a.semaforo}">${a.desv_fin_min > 0 ? '+' : ''}${a.desv_fin_min} min</span>` : est(a) === 'FINALIZADA' ? '<span class="sem VERDE">✓</span>' : ''}</div>`).join('')}</div>`;
  m.innerHTML = err + head + body + lista;
  const on = (id, f) => { const e = $('#' + id, m); if (e) e.onclick = f; };
  on('clr', () => { S.errores = []; render(); }); on('ruta', rutaDelDia); on('ini', iniciarJornada); on('finj', finalizarJornada);
  if (cur && activa) {
    on('vi', async () => accion('ACT_VIAJE', cur)); on('ll', async () => { await accion('ACT_LLEGADA', cur); postLlegada(cur); }); on('io', () => accion('ACT_INICIO_OP', cur)); on('fo', () => finalizarOperacion(cur));
    on('nav', () => { const l = lugar(cur); window.open(`https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lon}&travelmode=driving`, '_system'); });
    on('foto', async () => { const b = await takePhoto(); if (b) { await guardarFoto('EJECUCION', cur.id, 'MANUAL', b); toast('📷 Foto guardada'); } });
    on('mant', mantModal); on('inc', () => incidenciaModal(cur, false)); on('comb', combustibleModal); on('omi', () => omitir(cur));
  }
}
// ----- Ruta del día: paradas del itinerario, mapa y navegación sugerida en Google Maps -----
function paradasRuta() {
  const acts = S.mj.itinerario.actividades, est = (a) => a.ej_estado || 'PENDIENTE', out = [];
  const tarea = (a) => (['CARGA', 'DESCARGA', 'DESCARGA_TOTAL'].includes(a.carga_tipo) ? `${a.carga_tipo === 'CARGA' ? '⬆️ Cargar' : '⬇️ Descargar'} ${Math.abs(Math.round(a.peso_kg || 0)).toLocaleString('es-BO')} kg${a.comentarios ? ' · ' + a.comentarios : ''}` : null);
  const poner = (nombre, lat, lon, hora, a) => { if (lat == null) return; const u = out[out.length - 1]; if (u && Math.abs(u.lat - lat) < 1e-6 && Math.abs(u.lon - lon) < 1e-6) { u.acts.push(a); const t = tarea(a); if (t && !u.tareas.includes(t)) u.tareas.push(t); return; } const t = tarea(a); out.push({ nombre, lat, lon, hora, acts: [a], tareas: t ? [t] : [] }); };
  acts.forEach((a, i) => { if (i === 0) poner(a.origen_nombre, a.origen_lat, a.origen_lon, a.hora_inicio_plan, a); poner(a.destino_nombre, a.destino_lat, a.destino_lon, a.hora_fin_plan, a); });
  const pend = acts.find((a) => !FINAL.includes(est(a)));
  out.forEach((p, i) => { p.hecha = p.acts.every((a) => FINAL.includes(est(a))); p.n = i + 1; });
  const actual = out.findIndex((p) => !p.hecha);
  return { paradas: out, actual: actual < 0 ? out.length : actual, pend };
}
function rutaDelDia() {
  const { paradas, actual } = paradasRuta();
  if (!paradas.length) return toast('Este itinerario no tiene lugares ubicados en el mapa.');
  let km = 0; for (let i = 1; i < paradas.length; i++) km += (haversineM(paradas[i - 1].lat, paradas[i - 1].lon, paradas[i].lat, paradas[i].lon) / 1000) * 1.3;
  const resto = paradas.slice(Math.max(0, actual - 0));
  const url = () => {
    const tramo = resto.slice(0, 10), dest = tramo[tramo.length - 1], via = tramo.slice(0, -1).map((p) => `${p.lat},${p.lon}`).join('|');
    return `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${dest.lat},${dest.lon}${via ? '&waypoints=' + encodeURIComponent(via) : ''}${S.mj.jornada && !S.mj.jornada.fin_en ? '' : `&origin=${paradas[0].lat},${paradas[0].lon}`}`;
  };
  modal(`<h2>🗺️ Mi ruta sugerida</h2><p class="mut" style="margin:0 0 8px">${paradas.length} paradas · unos <b>${km.toFixed(0)} km</b> · ~${Math.max(1, Math.round(km / 30))} h de manejo (estimado)</p>
    <div id="rutamap" style="height:230px;border-radius:16px;border:1px solid var(--line);margin-bottom:10px"></div>
    <button class="big" id="gm" style="margin-top:0">🧭 Abrir la ruta en Google Maps</button><p class="ayuda">${resto.length > 10 ? 'Se cargarán las próximas 10 paradas. ' : ''}Google Maps le guiará calle por calle${S.mj.jornada && !S.mj.jornada.fin_en ? ' desde donde está ahora' : ''}.</p>
    ${paradas.map((p) => `<div class="act"><span class="num2 ${p.hecha ? 'ok' : p.n - 1 === actual ? 'now' : ''}">${p.hecha ? '✓' : p.n}</span><div style="flex:1"><b>${esc(p.nombre)}</b> <span class="mut">${esc(p.hora || '')}</span>${p.tareas.map((t) => `<div class="mut">${esc(t)}</div>`).join('')}</div><button class="sec" data-ll="${p.n - 1}" style="flex:none;padding:8px 10px">Ir</button></div>`).join('')}
    <button class="sec" id="cerrar" style="width:100%;margin-top:10px">Cerrar</button>`, (m, close) => {
    $('#cerrar', m).onclick = close; $('#gm', m).onclick = () => window.open(url(), '_system');
    m.querySelectorAll('[data-ll]').forEach((b) => (b.onclick = () => { const p = paradas[+b.dataset.ll]; window.open(`https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${p.lat},${p.lon}`, '_system'); }));
    if (window.L) setTimeout(() => {
      const mapa = crearMapa('rutamap', [paradas[0].lat, paradas[0].lon], 12);
      L.polyline(paradas.map((p) => [p.lat, p.lon]), { color: '#2563eb', weight: 4, dashArray: '8 6' }).addTo(mapa);
      paradas.forEach((p) => L.marker([p.lat, p.lon], { icon: L.divIcon({ html: `<div class="pin ${p.hecha ? 'ok' : p.n - 1 === actual ? 'now' : ''}">${p.hecha ? '✓' : p.n}</div>`, className: '', iconSize: [30, 30], iconAnchor: [15, 15] }) }).bindPopup(esc(p.nombre)).addTo(mapa));
      const ajustar = () => { mapa.invalidateSize(); mapa.fitBounds(paradas.map((p) => [p.lat, p.lon]), { padding: [24, 24] }); }; ajustar(); setTimeout(ajustar, 500);
    }, 200);
  });
}
async function conPos(payload) { const p = await here(); return { ...payload, lat: p?.lat ?? null, lon: p?.lon ?? null, prec: p?.prec ?? null }; }   // GPS automático
async function accion(tipo, act, extra = {}) { if (!S.mj.jornada) return; await enqueue(tipo, await conPos({ jornada_id: S.mj.jornada.id, actividad_id: act.id, ...extra })); }
async function guardarFoto(entidad, entidad_id, momento, b64) { const p = await here(); await enqueue('FOTO', { id: uuid(), entidad, entidad_id, momento, data_base64: b64, lat: p?.lat ?? null, lon: p?.lon ?? null }, { local: false }); }

function iniciarJornada() {
  modal(`<h2>Iniciar jornada</h2><p>Para registrar su ruta, esta aplicación usa la <b>ubicación de su teléfono mientras dure la jornada</b>, también con la pantalla apagada. Verá una notificación permanente mientras esté activa, y se apaga al finalizar la jornada.</p>
    <label>Odómetro inicial (km, opcional)</label><input id="odo" type="number" inputmode="decimal"><button class="big ok" id="ok">ACEPTAR E INICIAR</button><button class="sec" id="no" style="width:100%">Cancelar</button>`, (m, close) => {
    $('#no', m).onclick = close;
    $('#ok', m).onclick = async () => { close(); await startGps(); const it = S.mj.itinerario; await enqueue('JORNADA_INICIO', await conPos({ jornada_id: uuid(), itinerario_id: it.id, odometro: $('#odo', m)?.value ? +$('#odo', m).value : null })); };
  });
}
async function postLlegada(act) {
  const a = S.mj.itinerario.actividades.find((x) => x.id === act.id), l = lugar(act), p = await here();
  if (l.lat != null && p) {
    const d = Math.round(haversineM(p.lat, p.lon, l.lat, l.lon)); toast(`Llegada registrada · a ${d} m del punto planificado`);
    if (d > 150) { await new Promise((res) => modal(`<h2>Fuera de la zona del punto</h2><p>Está a <b>${d} m</b> del punto planificado. Tome una foto como evidencia.</p><button class="big" id="f">📷 Tomar foto</button><button class="sec" id="s" style="width:100%">Continuar sin foto</button>`, (m, close) => {
      $('#f', m).onclick = async () => { const b = await takePhoto(); if (b) { await guardarFoto('EJECUCION', act.id, 'LLEGADA', b); close(); res(); } }; $('#s', m).onclick = () => { close(); res(); }; })); }
  } else toast('Llegada registrada');
  chequearRetraso(a);
}
function chequearRetraso(a) {   // el retraso exige indicar la causa
  if (a?.ej_estado === 'FINALIZADA' && a.desv_fin_min > S.mj.config.umbral.verde_max) incidenciaModal(a, true);
}
function finalizarOperacion(act) {
  modal(`<h2>Finalizar operación</h2><label>Peso real movido (kg)</label><input id="pe" type="number" inputmode="decimal" value="${Math.abs(act.peso_kg || 0) || ''}"><label>Observaciones</label><textarea id="ob" rows="2"></textarea>
    <button class="sec" id="ft" style="width:100%">📷 Foto de la operación</button><div class="mut" id="fm"></div><button class="big bad" id="ok">FINALIZAR</button><button class="sec" id="no" style="width:100%">Cancelar</button>`, (m, close) => {
    let foto = null; $('#no', m).onclick = close;
    $('#ft', m).onclick = async () => { foto = await takePhoto(); $('#fm', m).textContent = foto ? '✔ Foto lista' : ''; };
    $('#ok', m).onclick = async () => { close(); await accion('ACT_FIN_OP', act, { peso_real: $('#pe', m).value ? +$('#pe', m).value : null, obs: $('#ob', m).value || null }); if (foto) await guardarFoto('EJECUCION', act.id, 'FIN_OP', foto); toast('Operación finalizada'); chequearRetraso(S.mj.itinerario.actividades.find((x) => x.id === act.id)); };
  });
}
function incidenciaModal(act, obligatoria) {
  modal(`<h2>${obligatoria ? 'Causa del retraso' : 'Registrar incidencia'}</h2>${obligatoria ? `<p class="mut">La actividad terminó con ${act.desv_fin_min} min de retraso. Indique la causa.</p>` : ''}
    <label>Causa / tipo</label><select id="tp"><option value="">Seleccione…</option>${Object.entries(CAUSAS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
    <label>Comentario</label><textarea id="cm" rows="2"></textarea>${obligatoria ? '' : '<label><input type="checkbox" id="rt" style="width:auto"> Provocó retraso</label>'}
    <button class="sec" id="ft" style="width:100%;margin-top:6px">📷 Foto / evidencia</button><div class="mut" id="fm"></div><div class="err" id="er"></div>
    <button class="big" id="ok">GUARDAR</button>${obligatoria ? '' : '<button class="sec" id="no" style="width:100%">Cancelar</button>'}`, (m, close) => {
    let foto = null; if ($('#no', m)) $('#no', m).onclick = close;
    $('#ft', m).onclick = async () => { foto = await takePhoto(); $('#fm', m).textContent = foto ? '✔ Foto lista' : ''; };
    $('#ok', m).onclick = async () => {
      const tp = $('#tp', m).value; if (!tp) return ($('#er', m).textContent = 'Seleccione una causa');
      close(); const id = uuid();
      await enqueue('INCIDENCIA', await conPos({ jornada_id: S.mj.jornada.id, actividad_id: act.id, id, tipo: tp, comentario: $('#cm', m).value || null, es_causa_retraso: obligatoria || !!$('#rt', m)?.checked }), { local: false });
      if (foto) await guardarFoto('INCIDENCIA', id, 'EVIDENCIA', foto); toast('Incidencia registrada');
    };
  });
}
function mantModal() {
  const it = S.mj.itinerario;
  modal(`<h2>Reportar mantenimiento / falla</h2><p class="mut">Vehículo ${esc(it.vehiculo_codigo)}. Logística recibirá el aviso de inmediato.</p>
    <label>¿Qué le pasa al vehículo o qué necesita?</label><textarea id="d" rows="3" placeholder="Ej.: Ruido al frenar, luz de aceite encendida…"></textarea>
    <label style="display:block;margin:6px 0"><input type="checkbox" id="u" style="width:auto"> Es urgente</label>
    <label style="display:block;margin:6px 0"><input type="checkbox" id="i" style="width:auto"> No puede seguir circulando</label>
    <div class="err" id="er"></div><button class="big" id="ok">ENVIAR REPORTE</button><button class="sec" id="no" style="width:100%">Cancelar</button>`, (m, close) => {
    $('#no', m).onclick = close;
    $('#ok', m).onclick = async () => {
      try { await api('POST', '/mantenimientos', { vehiculo_id: it.vehiculo_id, descripcion: $('#d', m).value, prioridad: $('#u', m).checked ? 'URGENTE' : 'NORMAL', inmoviliza: $('#i', m).checked }); close(); toast('Reporte enviado a logística'); }
      catch (e) { $('#er', m).textContent = e.message; }
    };
  });
}
function combustibleModal() {
  modal(`<h2>Carga de combustible</h2><label>Estación de servicio</label><input id="es"><div class="row"><div><label>Litros</label><input id="li" type="number" inputmode="decimal"></div><div><label>Total Bs</label><input id="to" type="number" inputmode="decimal"></div></div>
    <div class="mut" id="pl"></div><label>Odómetro (km)</label><input id="od" type="number" inputmode="decimal"><label><input type="checkbox" id="tl" checked style="width:auto"> Tanque lleno</label>
    <div class="row"><button class="sec" id="f1">📷 Comprobante</button><button class="sec" id="f2">📷 Tablero</button></div><div class="mut" id="fm"></div><div class="err" id="er"></div><button class="big" id="ok">GUARDAR</button><button class="sec" id="no" style="width:100%">Cancelar</button>`, (m, close) => {
    let f1 = null, f2 = null; $('#no', m).onclick = close;
    const pl = () => { const l = +$('#li', m).value, t = +$('#to', m).value; $('#pl', m).textContent = l > 0 && t > 0 ? `Precio: Bs ${(t / l).toFixed(2)} por litro` : ''; }; $('#li', m).oninput = pl; $('#to', m).oninput = pl;
    $('#f1', m).onclick = async () => { f1 = await takePhoto(); $('#fm', m).textContent = [f1 && '✔ comprobante', f2 && '✔ tablero'].filter(Boolean).join(' · '); };
    $('#f2', m).onclick = async () => { f2 = await takePhoto(); $('#fm', m).textContent = [f1 && '✔ comprobante', f2 && '✔ tablero'].filter(Boolean).join(' · '); };
    $('#ok', m).onclick = async () => {
      const litros = +$('#li', m).value, total = +$('#to', m).value; if (!(litros > 0) || !(total > 0)) return ($('#er', m).textContent = 'Indique litros y total');
      close(); const id = uuid();
      await enqueue('COMBUSTIBLE', { id, jornada_id: S.mj.jornada?.id ?? null, estacion: $('#es', m).value || null, litros, total_bs: total, precio_litro: total / litros, odometro_km: $('#od', m).value ? +$('#od', m).value : null, tanque_lleno: $('#tl', m).checked }, { local: false });
      if (f1) await guardarFoto('COMBUSTIBLE', id, 'COMPROBANTE', f1); if (f2) await guardarFoto('COMBUSTIBLE', id, 'TABLERO', f2); toast('Combustible registrado');
    };
  });
}
function omitir(act) {
  modal(`<h2>Omitir actividad ${act.numero}</h2><label>Motivo (obligatorio)</label><textarea id="mo" rows="2"></textarea><div class="err" id="er"></div><button class="big bad" id="ok">OMITIR</button><button class="sec" id="no" style="width:100%">Cancelar</button>`, (m, close) => {
    $('#no', m).onclick = close; $('#ok', m).onclick = async () => { const mo = $('#mo', m).value.trim(); if (mo.length < 3) return ($('#er', m).textContent = 'Indique el motivo'); close(); await accion('ACT_OMITIR', act, { motivo: mo }); };
  });
}
function resumenLocal() {
  const acts = S.mj.itinerario.actividades, ok = acts.filter((a) => a.ej_estado === 'FINALIZADA'), last = ok[ok.length - 1];
  return { actividades_planificadas: acts.length, actividades_ejecutadas: ok.length, actividades_pendientes: acts.length - ok.length, retraso_acumulado_min: Math.max(0, last?.desv_fin_min ?? 0) };
}
function resumenHTML() {
  const r = S.mj.jornada.resumen || resumenLocal(), f = (ic, k, l, u = '') => (r[k] != null ? `<div class="stat"><i>${ic}</i><b>${esc(r[k])}${u}</b><span>${l}</span></div>` : '');
  return `<div class="card"><h2>🏁 ¡Jornada terminada!</h2>${S.pend ? '<p class="chip warn">Pendiente de enviar al servidor</p>' : ''}<div class="stats">${f('✅', 'actividades_ejecutadas', 'Hechas')}${f('⏭️', 'actividades_pendientes', 'Sin hacer')}${f('🛣️', 'km_reales', 'Km (GPS)', ' km')}${f('⏱️', 'retraso_acumulado_min', 'Retraso', ' min')}${f('⛽', 'combustible_l', 'Diésel', ' L')}${f('💵', 'combustible_bs', 'Costo diésel', ' Bs')}${f('⚠️', 'incidencias', 'Incidencias')}</div><p class="mut">Gracias por su trabajo. Logística ya puede ver su resumen.</p></div>`;
}
function finalizarJornada() {
  const acts = S.mj.itinerario.actividades, enCurso = acts.find((a) => ['EN_VIAJE', 'LLEGO', 'EN_OPERACION'].includes(a.ej_estado));
  if (enCurso) return toast(`Termine u omita la actividad ${enCurso.numero} antes de cerrar la jornada`);
  const r = resumenLocal();
  modal(`<h2>Finalizar jornada</h2><div class="kv"><span>Planificadas</span><b>${r.actividades_planificadas}</b></div><div class="kv"><span>Ejecutadas</span><b>${r.actividades_ejecutadas}</b></div><div class="kv"><span>Pendientes (se marcarán no ejecutadas)</span><b>${r.actividades_pendientes}</b></div><div class="kv"><span>Retraso acumulado</span><b>${r.retraso_acumulado_min} min</b></div>
    <h3>¿Hubo alguna incidencia adicional?</h3><div class="tabs"><button id="si">Sí</button><button id="nn" class="on">No</button></div><label>Comentarios</label><textarea id="cm" rows="2"></textarea>
    <button class="sec" id="ft" style="width:100%">📷 Foto</button><div class="mut" id="fm"></div><label>Odómetro final (km, opcional)</label><input id="od" type="number" inputmode="decimal">
    <button class="big bad" id="ok">CERRAR JORNADA</button><button class="sec" id="no" style="width:100%">Cancelar</button>`, (m, close) => {
    let inc = false, foto = null; $('#no', m).onclick = close;
    $('#si', m).onclick = () => { inc = true; $('#si', m).className = 'on'; $('#nn', m).className = ''; }; $('#nn', m).onclick = () => { inc = false; $('#nn', m).className = 'on'; $('#si', m).className = ''; };
    $('#ft', m).onclick = async () => { foto = await takePhoto(); $('#fm', m).textContent = foto ? '✔ Foto lista' : ''; };
    $('#ok', m).onclick = async () => { close(); const jid = S.mj.jornada.id; if (foto) await guardarFoto('JORNADA', jid, 'CIERRE', foto); await stopGps(); await enqueue('JORNADA_FIN', await conPos({ jornada_id: jid, incidencia_adicional: inc, comentario: $('#cm', m).value || null, odometro: $('#od', m).value ? +$('#od', m).value : null })); };
  });
}

// ----- Solicitante -----
const PASOS = [['NUEVA', 'Pedida'], ['APROBADA', 'Aprobada'], ['PLANIFICADA', 'Planificada'], ['EN_EJECUCION', 'En camino'], ['COMPLETADA', 'Entregada']];
const ETXT = { NUEVA: 'Nueva', EN_REVISION: 'En revisión', APROBADA: 'Aprobada', PLANIFICADA: 'Planificada', EN_EJECUCION: 'En camino', COMPLETADA: 'Entregada', REPROGRAMADA: 'Reprogramada', CANCELADA: 'Cancelada' };
function linea(estado) {
  if (['CANCELADA', 'REPROGRAMADA'].includes(estado)) return '';
  const i = estado === 'EN_REVISION' ? 0 : PASOS.findIndex((p) => p[0] === estado);
  return `<div class="tl">${PASOS.map((p, k) => `<div class="p ${k < i || estado === 'COMPLETADA' ? 'done' : k === i ? 'now' : ''}">${p[1]}</div>`).join('')}</div>`;
}
async function solicitanteView(m) {
  m.innerHTML = `<div class="tabs"><button data-t="nueva" class="${S.tab === 'nueva' ? 'on' : ''}">📝 Pedir transporte</button><button data-t="mis" class="${S.tab === 'mis' ? 'on' : ''}">📋 Mis pedidos</button></div><div id="sb"></div>`;
  m.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { S.tab = b.dataset.t; render(); }));
  const box = $('#sb', m);
  try {
    if (S.tab === 'mis') {
      const l = await api('GET', '/solicitudes');
      box.innerHTML = l.map((s) => `<div class="card sol ${s.prioridad}"><div class="row" style="justify-content:space-between"><b>#${s.numero} · ${esc(s.material || s.descripcion || s.tipo_operacion)}</b><span class="tag E${s.estado}">${esc(ETXT[s.estado] || s.estado)}</span></div>
        <div class="mut">📍 ${esc(s.origen_nombre || s.origen_direccion || 'punto GPS')} → ${esc(s.destino_nombre || s.destino_direccion || 'punto GPS')}</div><div class="mut">📅 ${esc(s.fecha_requerida)} ${esc(s.hora_requerida || '')}${s.peso_kg ? ` · ⚖️ ${esc(s.peso_kg)} kg` : ''}${s.prioridad !== 'NORMAL' ? ` · ${esc(s.prioridad.toLowerCase())}` : ''}</div>
        ${s.fecha_estimada_atencion ? `<div class="nota ok">📅 Atención estimada: <b>${esc(s.fecha_estimada_atencion.replace('T', ' '))}</b></div>` : ''}${linea(s.estado)}${['NUEVA', 'EN_REVISION', 'APROBADA', 'PLANIFICADA'].includes(s.estado) ? `<button class="sec peligro" data-c="${s.id}" style="margin-top:8px">Cancelar pedido</button>` : ''}</div>`).join('')
        || `<div class="card vacio"><div class="big-i">📦</div><h2>Aún no ha pedido nada</h2><p class="mut">Toque “Pedir transporte” para hacer su primera solicitud.</p><button class="big" id="ir">📝 Pedir transporte</button></div>`;
      box.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => modal(`<h2>Cancelar pedido</h2><label class="req">Motivo</label><textarea id="mo" rows="3" placeholder="¿Por qué lo cancela?"></textarea><div class="err" id="er"></div><button class="big bad" id="ok">Sí, cancelar</button><button class="sec" id="no" style="width:100%">Volver</button>`, (w, close) => { $('#no', w).onclick = close; $('#ok', w).onclick = async () => { const motivo = $('#mo', w).value.trim(); if (motivo.length < 3) return ($('#er', w).textContent = 'Escriba el motivo'); try { await api('POST', `/solicitudes/${b.dataset.c}/estado`, { estado: 'CANCELADA', motivo }); close(); render(); } catch (e) { $('#er', w).textContent = e.message; } }; })));
      if ($('#ir', box)) $('#ir', box).onclick = () => { S.tab = 'nueva'; render(); };
      return;
    }
    const ubs = await api('GET', '/ubicaciones'); const dt = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    const seg = (name, items, def) => `<div class="seg ${name === 'pr' ? 'urg' : ''}">${items.map(([v, t, s]) => `<label><input type="radio" name="${name}" value="${v}" ${v === def ? 'checked' : ''}><span>${t}${s ? `<small>${s}</small>` : ''}</span></label>`).join('')}</div>`;
    const punto = (k) => `<label>Lugar conocido</label><select id="${k}u"><option value="">— Elegir de la lista —</option>${ubs.map((u) => `<option value="${u.id}">${esc(u.nombre)}</option>`).join('')}</select><label>o escriba la dirección</label><input id="${k}d" placeholder="Calle, zona o referencia">
      <button class="sec" id="${k}g" style="width:100%;margin-top:8px">📍 Usar mi ubicación actual</button><div class="hint" id="${k}m">Sin punto GPS (es opcional)</div><label>Persona de contacto</label><input id="${k}c" placeholder="Nombre y teléfono (opcional)">`;
    const sec = (n, t, s, h) => `<div class="card seccion"><div class="sh"><span class="num">${n}</span><div><b>${t}</b>${s ? `<small>${s}</small>` : ''}</div></div>${h}</div>`;
    box.innerHTML = `<p class="mut" style="margin:0 2px 8px">Complete los 5 pasos. Los campos con <b style="color:var(--bad)">*</b> son obligatorios.</p>
      ${sec(1, '¿Qué tipo de transporte es?', '', `<label class="req">Logística</label>${seg('tl', [['INTERNA', 'Interna', 'entre nuestras instalaciones'], ['EXTERNA', 'Externa', 'clientes y proveedores']], 'INTERNA')}<label class="req">Operación</label><select id="to"><option value="ENTREGA">Entrega — llevar algo a alguien</option><option value="RECOJO">Recojo — traer algo</option><option value="TRASLADO">Traslado — mover entre lugares</option><option value="DEVOLUCION">Devolución</option><option value="OTRO">Otro</option></select><label>Prioridad</label>${seg('pr', [['NORMAL', 'Normal', ''], ['URGENTE', 'Urgente', ''], ['CRITICA', 'Crítica', '']], 'NORMAL')}`)}
      ${sec(2, '¿Qué se transporta?', 'Material, cantidad y peso aproximado', `<label class="req">Material o producto</label><input id="ma" placeholder="Ej.: Envases PEAD"><div class="row2"><div><label>Cantidad</label><input id="ca" type="number" inputmode="decimal"></div><div><label>Unidad</label><input id="un" placeholder="cajas, kg…"></div></div><div class="row2"><div><label>Peso (kg)</label><input id="pe" type="number" inputmode="decimal"></div><div><label>Volumen (m³)</label><input id="vo" type="number" inputmode="decimal"></div></div><label>Detalles</label><textarea id="de" rows="2" placeholder="Ej.: frágil, necesita montacargas"></textarea>`)}
      ${sec(3, '¿De dónde sale?', 'Punto de carga', punto('o'))}${sec(4, '¿A dónde va?', 'Punto de entrega', punto('d'))}
      ${sec(5, '¿Cuándo se necesita?', '', `<div class="row2"><div><label class="req">Fecha</label><input id="fr" type="date" value="${dt}"></div><div><label>Hora</label><input id="hr" type="time"></div></div>`)}
      <div class="err" id="er"></div><button class="big" id="env">✅ ENVIAR SOLICITUD</button>`;
    const gps = { o: null, d: null };
    for (const k of ['o', 'd']) $('#' + k + 'g', box).onclick = async () => { $('#' + k + 'm', box).textContent = 'Obteniendo su ubicación…'; const p = await here(); if (!p) return ($('#' + k + 'm', box).textContent = 'No se pudo obtener la ubicación (revise el permiso)'); gps[k] = p; $('#' + k + 'm', box).textContent = `✔ Punto guardado: ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`; };
    $('#env', box).onclick = async () => {
      box.querySelectorAll('.invalid').forEach((e) => e.classList.remove('invalid'));
      const falta = (id) => { const e = $(id, box); e.classList.add('invalid'); e.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
      const radio = (n) => box.querySelector(`input[name=${n}]:checked`).value;
      const hay = (k) => $('#' + k + 'u', box).value || $('#' + k + 'd', box).value.trim() || gps[k];
      if (!$('#ma', box).value.trim()) { falta('#ma'); return ($('#er', box).textContent = 'Indique qué material o producto se transporta'); }
      if (!hay('o')) { falta('#ou'); return ($('#er', box).textContent = 'Indique de dónde sale'); }
      if (!hay('d')) { falta('#du'); return ($('#er', box).textContent = 'Indique a dónde va'); }
      if (!$('#fr', box).value) { falta('#fr'); return ($('#er', box).textContent = 'Indique la fecha'); }
      const pt = (k, pre) => ({ [`${pre}_ubicacion_id`]: $('#' + k + 'u', box).value || null, [`${pre}_direccion`]: $('#' + k + 'd', box).value || null, [`${pre}_lat`]: gps[k]?.lat ?? null, [`${pre}_lon`]: gps[k]?.lon ?? null, [`${pre}_gps_fuente`]: gps[k] ? 'DISPOSITIVO' : null, [`${pre}_contacto`]: $('#' + k + 'c', box).value || null });
      $('#env', box).disabled = true;
      try { const r = await api('POST', '/solicitudes', { tipo_logistica: radio('tl'), tipo_operacion: $('#to', box).value, fecha_requerida: $('#fr', box).value, hora_requerida: $('#hr', box).value || null, prioridad: radio('pr'), material: $('#ma', box).value, cantidad: $('#ca', box).value, unidad: $('#un', box).value, peso_kg: $('#pe', box).value, volumen_m3: $('#vo', box).value, descripcion: $('#de', box).value, ...pt('o', 'origen'), ...pt('d', 'destino') }); toast(`✅ Solicitud #${r.numero} enviada`); S.tab = 'mis'; render(); }
      catch (e) { $('#er', box).textContent = e.message; $('#env', box).disabled = false; }
    };
  } catch (e) { box.innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
}

boot();
