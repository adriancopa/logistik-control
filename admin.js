// LOGISTIK CONTROL — panel de gestión (web y app). Sin compilación: ES modules + Leaflet.
const $ = (s, r = document) => r.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const state = { token: sessionStorage.getItem('tk'), user: null, view: null, data: {} };
const app = $('#app');

async function api(method, url, body) {
  const r = await fetch('/api' + url, { method, headers: { 'content-type': 'application/json', ...(state.token && { authorization: 'Bearer ' + state.token }) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && state.user) { logout(); throw new Error('Sesión expirada'); }
  if (!r.ok) throw Object.assign(new Error(j.error || 'Error'), { detail: j });
  return j;
}
const today = (d = 0) => { const x = new Date(Date.now() + d * 864e5); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const hm = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : null; };
const fmt = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const dur = (a) => { const i = hm(a.hora_inicio_plan), f = hm(a.hora_fin_plan); return i == null || f == null ? '' : fmt(Math.max(0, f - i)); };
const ESTADO_TXT = { EN_REVISION: 'En revisión', EN_EJECUCION: 'En ejecución', FUERA_DE_SERVICIO: 'Fuera de servicio', EN_RUTA: 'En ruta', NUEVA: 'Nueva', APROBADA: 'Aprobada', PLANIFICADA: 'Planificada', PLANIFICADO: 'Planificado', COMPLETADA: 'Completada', CANCELADA: 'Cancelada', REPROGRAMADA: 'Reprogramada', BORRADOR: 'Borrador', CERRADO: 'Cerrado', DISPONIBLE: 'Disponible', MANTENIMIENTO: 'En mantenimiento', PENDIENTE: 'Pendiente', REALIZADO: 'Realizado', CANCELADO: 'Cancelado', NORMAL: 'Normal', URGENTE: 'Urgente', CRITICA: 'Crítica', PREVENTIVO: 'Preventivo', CORRECTIVO: 'Correctivo' };
const tag = (t) => `<span class="tag ${esc(t)}">${esc(ESTADO_TXT[t] || String(t).replace(/_/g, ' '))}</span>`;
const opts = (arr, sel, v = (x) => x.id, l = (x) => x.nombre, blank = '— Seleccione —') => `<option value="">${blank}</option>` + arr.map((x) => `<option value="${esc(v(x))}" ${v(x) === sel ? 'selected' : ''}>${esc(l(x))}</option>`).join('');
const fechaCorta = (f) => (f ? String(f).slice(0, 10) : '—');
const fechaLarga = (f) => new Date(f + 'T12:00:00').toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'long' });
const bs = (n) => `Bs ${(+n || 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—');
const hace = (iso) => { if (!iso) return '—'; const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? 'ahora' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`; };

// ---------- Navegación por tareas ----------
const ICON = { inicio: '🏠', solicitudes: '📦', planificacion: '🗓️', seguimiento: '📍', reportes: '📊', ejecucion: '📈', combustible: '⛽', vehiculos: '🚚', mantenimiento: '🔧', ubicaciones: '🗺️', usuarios: '👥', sync: '☁️', auditoria: '🧾', mijornada: '🚚', notif: '🔔' };
const TITULOS = { inicio: 'Inicio', solicitudes: 'Solicitudes', planificacion: 'Planificar el día', seguimiento: 'Seguimiento en vivo', reportes: 'Indicadores', ejecucion: 'Plan vs Real', combustible: 'Combustible', vehiculos: 'Vehículos', mantenimiento: 'Mantenimiento', ubicaciones: 'Lugares', usuarios: 'Usuarios', sync: 'Sincronización', auditoria: 'Historial de cambios', mijornada: 'Mi jornada', notif: 'Avisos' };
const AYUDA = {
  solicitudes: 'Pedidos de transporte: aquí se piden, se aprueban y se sigue su estado.',
  planificacion: 'Arme el itinerario del día: qué vehículo, qué chofer y en qué orden se hacen las actividades.',
  seguimiento: 'Mire ahora mismo dónde está cada vehículo y cómo avanza su jornada.',
  reportes: 'Resultados por período: cumplimiento, kilómetros, retrasos y costos.',
  ejecucion: 'Compara lo planificado contra lo que realmente pasó, actividad por actividad.',
  combustible: 'Cargas de diésel y cuánto rinde cada vehículo (km por litro, Bs por km).',
  vehiculos: 'Los camiones y vehículos de la empresa y de terceros.',
  mantenimiento: 'Lo que cada vehículo necesita y lo que ya se le hizo (kardex).',
  ubicaciones: 'Plantas, almacenes y clientes con sus coordenadas, para planificar y medir rutas.',
  usuarios: 'Quién puede entrar a la aplicación y con qué permisos.',
  sync: 'Conexión con Google Sheets para que todos vean la misma información.',
  auditoria: 'Quién cambió qué y cuándo (no se puede borrar).',
  notif: 'Avisos del sistema: nuevas solicitudes, retrasos, mantenimientos…',
};
const GRUPO_DE = { inicio: 'blue', solicitudes: 'blue', planificacion: 'blue', seguimiento: 'blue', reportes: 'purple', ejecucion: 'purple', combustible: 'purple', vehiculos: 'teal', mantenimiento: 'teal', ubicaciones: 'gray', usuarios: 'gray', sync: 'gray', auditoria: 'gray', notif: 'gray', mijornada: 'blue' };
const NAV = [['Operación del día', ['inicio', 'solicitudes', 'planificacion', 'seguimiento']], ['Reportes', ['reportes', 'ejecucion', 'combustible']], ['Flota', ['vehiculos', 'mantenimiento']], ['Configuración', ['ubicaciones', 'usuarios', 'sync', 'auditoria']]];
const TODOS = NAV.flatMap(([, v]) => v);
const PERM = {
  ADMIN: TODOS, PLANIFICADOR: TODOS.filter((x) => !['usuarios', 'sync', 'auditoria'].includes(x)),
  CONSULTA: ['inicio', 'solicitudes', 'planificacion', 'seguimiento', 'reportes', 'ejecucion', 'combustible', 'vehiculos', 'mantenimiento'],
  CHOFER: ['mijornada'], SOLICITANTE: ['solicitudes'],
};
const puedeEditarPlan = () => ['ADMIN', 'PLANIFICADOR'].includes(state.user?.rol);
const vistasPermitidas = () => (PERM[state.user.rol] || []).filter((x) => window.LC_STANDALONE || x !== 'sync');

function toast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 3500); }
// Ventana (hoja inferior en el teléfono, centrada en la computadora)
function ventana(titulo, html, bind) {
  const m = document.createElement('div'); m.className = 'modalw'; m.innerHTML = `<div><div class="mh"><h2>${titulo}</h2><button class="x" type="button" aria-label="Cerrar">✕</button></div>${html}</div>`;
  document.body.appendChild(m); const close = () => m.remove();
  m.querySelector('.x').onclick = close; m.onclick = (e) => { if (e.target === m) close(); };
  bind?.(m, close); return close;
}
const modalWeb = (html, bind) => { const t = /^<h2>([\s\S]*?)<\/h2>/.exec(html); return ventana(t ? t[1] : '', t ? html.slice(t[0].length) : html, bind); };
function pageHead(view, acciones = '', sub) {
  return `<div class="hero" data-g="${GRUPO_DE[view] || 'blue'}"><div class="ico">${ICON[view] || '📄'}</div><div class="tx"><h1>${TITULOS[view] || view}</h1><p>${sub ?? AYUDA[view] ?? ''}</p></div><div class="acc">${acciones}</div></div>`;
}
const seccion = (n, titulo, sub, html) => `<div class="sec"><div class="sh"><span class="num">${n}</span><div><b>${titulo}</b>${sub ? `<small>${sub}</small>` : ''}</div></div>${html}</div>`;
const vacio = (icono, titulo, texto, boton = '') => `<div class="card empty"><span class="i">${icono}</span><b>${titulo}</b><p>${texto}</p>${boton}</div>`;
function validar(m, reglas) {   // reglas: [[selector, mensaje]]; marca en rojo y devuelve el primer error
  m.querySelectorAll('.invalid').forEach((e) => e.classList.remove('invalid'));
  for (const [sel, msg] of reglas) { const el = m.querySelector(sel); if (el && !String(el.value ?? '').trim()) { el.classList.add('invalid'); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.focus?.(); return msg; } }
  return null;
}

function logout() { sessionStorage.removeItem('tk'); state.token = null; state.user = null; if (window.LC_STANDALONE) location.href = 'index.html'; else render(); }

async function render() {
  if (!state.token) return loginView();
  if (!state.user) { try { state.user = await api('GET', '/me'); } catch { return logout(); } }
  const vis = vistasPermitidas();
  if (state.view !== 'notif') state.view = vis.includes(state.view) ? state.view : vis[0];
  const notifs = await api('GET', '/notificaciones').catch(() => []);
  const sinLeer = notifs.filter((n) => !n.leida_en).length;
  const nv = (id) => `<button class="nv ${id === state.view ? 'on' : ''}" data-nav="${id}"><span class="i">${ICON[id]}</span>${TITULOS[id]}</button>`;
  const principales = ['inicio', 'solicitudes', 'planificacion', 'seguimiento'].filter((x) => vis.includes(x));
  const tab = (id, ico, txt, extra = '') => `<button data-nav="${id}" class="${id === state.view ? 'on' : ''}"><span class="i">${ico}</span>${txt}${extra}</button>`;
  const chipSyncHtml = window.LC_STANDALONE ? `<button class="pill syncchip" data-nav="sync">${chipSync()}</button>` : '';
  app.innerHTML = `<div class="shell">
    <aside class="side"><div class="brandbox">🚚 Logistik Control<small>${esc(state.user.nombre_completo)} · ${esc(ROL_TXT[state.user.rol] || state.user.rol)}</small></div>
      ${NAV.map(([g, items]) => { const v = items.filter((x) => vis.includes(x)); return v.length ? `<div class="grp">${g}</div>${v.map(nv).join('')}` : ''; }).join('')}
      <div class="foot"><button class="nv ${state.view === 'notif' ? 'on' : ''}" data-nav="notif" style="width:100%;margin:0 0 6px"><span class="i">🔔</span>Avisos ${sinLeer ? `<span class="tag bad" style="margin-left:auto">${sinLeer}</span>` : ''}</button>
        ${window.LC_STANDALONE ? `<div class="sm mut syncchip" style="margin:4px 4px 8px;cursor:pointer" data-nav="sync">${chipSync()}</div>` : ''}<button class="btn" id="out" style="width:100%">Cerrar sesión</button></div></aside>
    <div class="content"><header class="top"><span class="brand">🚚 Logistik Control</span>${chipSyncHtml}<button class="pill" data-nav="notif">🔔${sinLeer ? ' ' + sinLeer : ''}</button></header><main id="main"></main></div>
    <nav class="tabbar">${principales.map((id) => tab(id, ICON[id], { inicio: 'Inicio', solicitudes: 'Pedidos', planificacion: 'Planificar', seguimiento: 'En vivo' }[id])).join('')}${vis.length > principales.length ? tab('mas', '☰', 'Más', sinLeer ? `<span class="dot">${sinLeer}</span>` : '') : ''}</nav></div>`;
  $('#out').onclick = logout;
  app.querySelectorAll('[data-nav]').forEach((b) => (b.onclick = () => { if (b.dataset.nav === 'mas') return abrirMas(vis); state.view = b.dataset.nav; window.scrollTo(0, 0); render(); }));
  const v = { inicio: inicioView, solicitudes: solicitudesView, mantenimiento: mantenimientoView, sync: syncView, planificacion: planView, seguimiento: seguimientoView, reportes: reportesView, ejecucion: ejecucionView, combustible: combustibleView, vehiculos: vehiculosView, ubicaciones: ubicacionesView, usuarios: usuariosView, auditoria: auditoriaView, mijornada: jornadaView, notif: notifView }[state.view];
  try { await v($('#main')); } catch (e) { $('#main').innerHTML = `<div class="card err">${esc(e.message)}</div>`; }
}
const ROL_TXT = { ADMIN: 'Administrador', PLANIFICADOR: 'Logística', CHOFER: 'Chofer', SOLICITANTE: 'Solicitante', CONSULTA: 'Consulta' };
function abrirMas(vis) {
  ventana('Menú', `${NAV.map(([g, items]) => { const v = items.filter((x) => vis.includes(x)); return v.length ? `<h3>${g}</h3><div class="bigmenu">${v.map((id) => `<button data-go="${id}" class="${id === state.view ? 'on' : ''}"><span class="i">${ICON[id]}</span>${TITULOS[id]}</button>`).join('')}</div>` : ''; }).join('')}
    <h3>Mi cuenta</h3><div class="bigmenu"><button data-go="notif"><span class="i">🔔</span>Avisos</button><button id="salir"><span class="i">🚪</span>Cerrar sesión</button></div>`, (m, close) => {
    m.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => { close(); state.view = b.dataset.go; window.scrollTo(0, 0); render(); }));
    $('#salir', m).onclick = () => { close(); logout(); };
  });
}

function loginView() {
  app.innerHTML = `<div class="login"><div class="logo">🚚</div><h1>Logistik Control</h1><div class="card"><label>Usuario</label><input id="u" autocomplete="username" autocapitalize="off" placeholder="Ej.: admin"><label>PIN</label><input id="p" type="password" inputmode="numeric" autocomplete="current-password" placeholder="Su clave numérica">
    <div class="err" id="e"></div><button class="btn pri lg" id="go" style="width:100%;margin-top:8px">Ingresar</button></div></div>`;
  const go = async () => {
    try { const r = await api('POST', '/login', { usuario: $('#u').value.trim(), pin: $('#p').value }); state.token = r.token; sessionStorage.setItem('tk', r.token); state.user = r.user; render(); }
    catch (e) { $('#e').textContent = e.message; }
  };
  $('#go').onclick = go; $('#p').onkeydown = (e) => { if (e.key === 'Enter') go(); };
}

async function notifView(m) {
  const n = await api('GET', '/notificaciones'); await api('POST', '/notificaciones/leer');
  const ic = { SOLICITUD_NUEVA: '📦', SOLICITUD_ESTADO: '📋', RETRASO: '⏱️', INCIDENCIA: '⚠️', ENTREGA: '✅', MANTENIMIENTO: '🔧', JORNADA: '🏁', ITINERARIO: '🗓️' };
  m.innerHTML = pageHead('notif') + (n.map((x) => `<div class="item nohover ${x.leida_en ? 'gray' : ''}"><div class="h"><span style="font-size:22px">${ic[x.tipo] || '🔔'}</span><b>${esc(x.titulo)}</b><span class="sp"></span><span class="mut sm">${esc(hace(x.creada_en))}</span></div>${x.mensaje ? `<div class="m">${esc(x.mensaje)}</div>` : ''}</div>`).join('') || vacio('🔔', 'No hay avisos', 'Cuando pase algo importante lo verá aquí.'));
}

// ---------- Inicio guiado ----------
async function inicioView(m) {
  const staff = puedeEditarPlan(), rol = state.user.rol;
  const [al, hoy, sols, mants, vehs, ubs, its, usrs] = await Promise.all([
    api('GET', '/alertas').catch(() => ({ alertas: [], solicitudes_pendientes: 0, manana: today(1) })), api('GET', '/itinerarios?fecha=' + today()).catch(() => []), api('GET', '/solicitudes').catch(() => []),
    api('GET', '/mantenimientos?estado=PENDIENTE').catch(() => []), api('GET', '/vehiculos').catch(() => []), api('GET', '/ubicaciones').catch(() => []), api('GET', '/itinerarios').catch(() => []), rol === 'ADMIN' ? api('GET', '/usuarios').catch(() => []) : Promise.resolve(null)]);
  const cnt = (e) => sols.filter((s) => s.estado === e).length, vis = vistasPermitidas();
  const tile = (go, cls, ico, t, s, extra = '') => (vis.includes(go) ? `<button class="tile ${cls}" data-go="${go}" ${extra}><span class="i">${ico}</span><div><b>${t}</b><span>${s}</span></div></button>` : '');
  const pasos = [
    usrs ? ['Cree los usuarios del equipo (choferes, logística, solicitantes)', usrs.length > 5, 'usuarios'] : null,
    ['Registre sus vehículos con la placa real', vehs.some((v) => !/^PENDIENTE/i.test(v.placa)), 'vehiculos'],
    ['Revise que cada lugar tenga sus coordenadas', ubs.length > 0 && ubs.every((u) => u.lat != null), 'ubicaciones'],
    ['Reciba o cree la primera solicitud de transporte', sols.length > 0, 'solicitudes'],
    ['Planifique y apruebe el primer itinerario', its.some((i) => i.estado !== 'BORRADOR'), 'planificacion'],
  ].filter(Boolean);
  const faltan = staff && pasos.some((p) => !p[1]);
  const flujo = [['📦', 'Solicitar', 'Alguien pide un transporte'], ['✅', 'Aprobar', 'Logística lo revisa'], ['🗓️', 'Planificar', 'Se arma el itinerario'], ['🚚', 'Ejecutar', 'El chofer lo hace con GPS'], ['📊', 'Medir', 'Plan vs real y costos']];
  m.innerHTML = `<div class="hero" data-g="blue"><div class="ico">👋</div><div class="tx"><h1>Hola, ${esc(state.user.nombre_completo.split(' ')[0])}</h1><p>${esc(fechaLarga(today()))} · ${esc(ROL_TXT[rol] || rol)}</p></div></div>
    ${al.alertas.map((x) => `<div class="alert"><span style="font-size:22px">⏰</span><div class="sp"><b>${esc(x.mensaje)}</b></div><button class="btn warn" id="pm">Planificar mañana</button></div>`).join('')}
    <h3 style="margin-top:4px">¿Qué desea hacer?</h3>
    <div class="grid">${tile('solicitudes', '', '📦', 'Pedir un transporte', 'Qué se lleva, de dónde y a dónde', 'data-nuevo="sol"')}${tile('planificacion', 'teal', '🗓️', 'Planificar el día', 'Vehículo, chofer y actividades')}
      ${tile('seguimiento', 'orange', '📍', 'Ver dónde van los vehículos', 'Seguimiento en vivo y avance')}${tile('reportes', 'purple', '📊', 'Ver resultados', 'Cumplimiento, km, costos')}
      ${tile('mantenimiento', 'rose', '🔧', 'Mantenimiento', 'Pendientes y kardex del vehículo')}${tile('combustible', 'slate', '⛽', 'Combustible', 'Cargas y rendimiento')}</div>
    <h3>Resumen de hoy</h3>
    <div class="grid2"><div class="stat" data-go="solicitudes"><div class="n">${cnt('NUEVA') + cnt('EN_REVISION') + cnt('APROBADA')}</div><div class="l">Solicitudes por atender</div></div>
      <div class="stat teal" data-go="seguimiento"><div class="n">${hoy.filter((i) => i.estado === 'EN_EJECUCION').length}<small style="font-size:15px;font-weight:600"> / ${hoy.length}</small></div><div class="l">Vehículos en ruta / itinerarios hoy</div></div>
      <div class="stat ok" data-go="solicitudes"><div class="n">${cnt('COMPLETADA')}</div><div class="l">Solicitudes completadas</div></div>
      <div class="stat ${mants.length ? 'warn' : 'purple'}" data-go="mantenimiento"><div class="n">${mants.length}</div><div class="l">Mantenimientos pendientes</div></div></div>
    ${faltan ? `<div class="card" style="margin-top:14px"><h3 style="margin-top:0">🚀 Primeros pasos</h3>${pasos.map(([t, ok, go]) => `<div class="check ${ok ? 'done' : ''}"><span class="c">${ok ? '✓' : ''}</span><span class="t sp">${t}</span>${ok ? '' : `<button class="btn sm pri" data-go="${go}">Ir</button>`}</div>`).join('')}</div>` : ''}
    <div class="card"><h3 style="margin-top:0">Cómo funciona</h3><div class="flow">${flujo.map(([i, t, s]) => `<div class="st"><span class="i">${i}</span><b>${t}</b>${s}</div>`).join('')}</div></div>`;
  m.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => { state.view = b.dataset.go; if (b.dataset.nuevo === 'sol') state.abrirNuevaSol = true; window.scrollTo(0, 0); render(); }));
  const pm = $('#pm'); if (pm) pm.onclick = () => { state.planFecha = al.manana; state.view = 'planificacion'; render(); };
}

// ---------- Solicitudes ----------
const PASOS_SOL = [['NUEVA', 'Pedida'], ['APROBADA', 'Aprobada'], ['PLANIFICADA', 'Planificada'], ['EN_EJECUCION', 'En camino'], ['COMPLETADA', 'Entregada']];
function lineaTiempo(estado) {
  if (['CANCELADA', 'REPROGRAMADA'].includes(estado)) return '';
  const i = estado === 'EN_REVISION' ? 0 : PASOS_SOL.findIndex((p) => p[0] === estado);
  return `<div class="tl">${PASOS_SOL.map((p, k) => `<div class="p ${k < i || estado === 'COMPLETADA' ? 'done' : k === i ? 'now' : ''}">${p[1]}</div>`).join('')}</div>`;
}
const FILTROS_SOL = [['todas', 'Todas', () => true], ['nuevas', 'Por revisar', (s) => ['NUEVA', 'EN_REVISION'].includes(s.estado)], ['aprobadas', 'Por planificar', (s) => s.estado === 'APROBADA'], ['plan', 'Planificadas', (s) => s.estado === 'PLANIFICADA'], ['ruta', 'En camino', (s) => s.estado === 'EN_EJECUCION'], ['ok', 'Completadas', (s) => s.estado === 'COMPLETADA'], ['otras', 'Canceladas / reprogramadas', (s) => ['CANCELADA', 'REPROGRAMADA'].includes(s.estado)]];

async function solicitudesView(m) {
  const f = state.solFiltro || { grupo: 'todas', tipo: '' };
  const todas = await api('GET', '/solicitudes' + (f.tipo ? '?tipo_logistica=' + f.tipo : ''));
  const puedeCrear = ['SOLICITANTE', 'PLANIFICADOR', 'ADMIN'].includes(state.user.rol);
  const flt = FILTROS_SOL.find((x) => x[0] === f.grupo) || FILTROS_SOL[0];
  const lista = todas.filter(flt[2]);
  m.innerHTML = pageHead('solicitudes', puedeCrear ? '<button class="btn pri lg" id="nueva">＋ Nueva solicitud</button>' : '', state.user.rol === 'SOLICITANTE' ? 'Aquí pide un transporte y ve en qué paso está.' : undefined)
    + `<div class="row" style="margin-bottom:6px"><span class="mut sm">Tipo de logística:</span><select id="ft" style="width:auto;min-height:38px"><option value="">Toda (interna y externa)</option><option value="INTERNA" ${f.tipo === 'INTERNA' ? 'selected' : ''}>Interna</option><option value="EXTERNA" ${f.tipo === 'EXTERNA' ? 'selected' : ''}>Externa</option></select></div>
    <div class="chips">${FILTROS_SOL.map(([k, t, fn]) => `<button data-g="${k}" class="${k === f.grupo ? 'on' : ''}">${t}<b>${todas.filter(fn).length}</b></button>`).join('')}</div>`
    + (lista.map((s) => `<button class="item ${esc(s.prioridad)} ${s.estado === 'COMPLETADA' ? 'ok' : ''}" data-det="${s.id}"><div class="h"><b>#${s.numero}</b><b>${esc(s.material || s.descripcion || 'Sin descripción')}</b><span class="sp"></span>${s.prioridad !== 'NORMAL' ? tag(s.prioridad) : ''}${tag(s.estado)}</div>
      <div class="m">📍 ${esc(s.origen_nombre || s.origen_direccion || 'punto en el mapa')} → ${esc(s.destino_nombre || s.destino_direccion || 'punto en el mapa')}</div>
      <div class="m">${esc(s.tipo_operacion.toLowerCase())} · ${esc(s.tipo_logistica.toLowerCase())}${s.peso_kg ? ` · ⚖️ ${esc(s.peso_kg)} kg` : ''} · 📅 ${esc(s.fecha_requerida)} ${esc(s.hora_requerida || '')} · 👤 ${esc(s.solicitante)}</div>
      ${s.fecha_estimada_atencion ? `<div class="m"><b>Atención estimada:</b> ${esc(s.fecha_estimada_atencion.replace('T', ' '))}</div>` : ''}${lineaTiempo(s.estado)}</button>`).join('')
      || vacio('📦', todas.length ? 'No hay solicitudes en este filtro' : 'Todavía no hay solicitudes', puedeCrear ? 'Pulse “Nueva solicitud” para pedir un transporte.' : 'Cuando alguien pida un transporte aparecerá aquí.', puedeCrear && !todas.length ? '<button class="btn pri" id="nueva2">＋ Nueva solicitud</button>' : ''));
  m.querySelectorAll('[data-g]').forEach((b) => (b.onclick = () => { state.solFiltro = { ...f, grupo: b.dataset.g }; render(); }));
  $('#ft').onchange = (e) => { state.solFiltro = { ...f, tipo: e.target.value }; render(); };
  for (const id of ['#nueva', '#nueva2']) if ($(id)) $(id).onclick = () => nuevaSolicitud();
  m.querySelectorAll('[data-det]').forEach((b) => (b.onclick = () => detalleSolicitud(b.dataset.det)));
  if (state.abrirNuevaSol) { state.abrirNuevaSol = false; if (puedeCrear) nuevaSolicitud(); }
}

function pedirMotivo(titulo, cb) {
  ventana(titulo, `<label class="req">Motivo</label><textarea id="mo" rows="3" placeholder="Explique brevemente por qué"></textarea><div class="err" id="er"></div><div class="bar"><button class="btn" id="no">Volver</button><button class="btn pri" id="ok">Confirmar</button></div>`, (m, close) => {
    $('#no', m).onclick = close;
    $('#ok', m).onclick = async () => { const mo = $('#mo', m).value.trim(); if (mo.length < 3) { $('#mo', m).classList.add('invalid'); return ($('#er', m).textContent = 'Escriba el motivo'); } try { await cb(mo); close(); } catch (e) { $('#er', m).textContent = e.message; } };
  });
}

async function detalleSolicitud(id) {
  const s = await api('GET', '/solicitudes/' + id);
  const staff = puedeEditarPlan(), sol = state.user.rol === 'SOLICITANTE';
  const acc = { NUEVA: [['EN_REVISION', 'Poner en revisión', ''], ['APROBADA', '✅ Aprobar', 'ok']], EN_REVISION: [['APROBADA', '✅ Aprobar', 'ok']], APROBADA: [], PLANIFICADA: [['REPROGRAMADA', 'Reprogramar', 'warn']], EN_EJECUCION: [['COMPLETADA', '✔ Marcar como completada', 'ok'], ['REPROGRAMADA', 'Reprogramar', 'warn']], REPROGRAMADA: [['APROBADA', '✅ Aprobar de nuevo', 'ok']] }[s.estado] || [];
  const puedeCancelar = (staff && !['COMPLETADA', 'CANCELADA'].includes(s.estado)) || (sol && ['NUEVA', 'EN_REVISION', 'APROBADA', 'PLANIFICADA'].includes(s.estado));
  const pt = (p) => (s[p + '_lat'] != null ? `<div class="mut sm">GPS ${s[p + '_lat'].toFixed(5)}, ${s[p + '_lon'].toFixed(5)} (${esc(s[p + '_gps_fuente'] || '')})</div>` : '');
  ventana(`Solicitud #${s.numero} ${tag(s.estado)}`, `${lineaTiempo(s.estado)}
    ${s.fecha_estimada_atencion ? `<div class="alert" style="background:var(--ok-l);border-color:var(--ok)">📅 <b>Atención estimada:</b> ${esc(s.fecha_estimada_atencion.replace('T', ' '))}</div>` : ''}
    ${seccion('📦', 'Qué se transporta', '', `<b>${esc(s.material || '—')}</b> ${esc(s.cantidad || '')} ${esc(s.unidad || '')} · ⚖️ ${esc(s.peso_kg || '—')} kg · 📐 ${esc(s.volumen_m3 || '—')} m³<div>${esc(s.descripcion || '')} ${esc(s.observaciones || '')}</div><div class="mut sm">${esc(s.tipo_operacion)} · logística ${esc(s.tipo_logistica.toLowerCase())} · prioridad ${esc((ESTADO_TXT[s.prioridad] || s.prioridad).toLowerCase())}</div>`)}
    ${seccion('📍', 'Ruta', '', `<div><b>Sale de:</b> ${esc(s.origen_nombre || s.origen_direccion || 'punto en el mapa')} ${esc(s.origen_contacto || '')}</div>${pt('origen')}<div style="margin-top:6px"><b>Va a:</b> ${esc(s.destino_nombre || s.destino_direccion || 'punto en el mapa')} ${esc(s.destino_contacto || '')}</div>${pt('destino')}`)}
    ${seccion('📅', 'Cuándo y quién', '', `Se necesita el <b>${esc(s.fecha_requerida)}</b> ${esc(s.hora_requerida || '')} · pedida por <b>${esc(s.solicitante)}</b>`)}
    <h3>Historial</h3>${s.historial.map((h) => `<div class="sm"><span class="mut">${esc(new Date(h.creado_en).toLocaleString())}</span> — ${esc(h.usuario)}: ${esc(ESTADO_TXT[h.estado_anterior] || h.estado_anterior || 'nueva')} → <b>${esc(ESTADO_TXT[h.estado_nuevo] || h.estado_nuevo)}</b> ${esc(h.motivo || '')}</div>`).join('')}
    ${s.estado === 'APROBADA' && staff ? '<div class="how" style="margin-top:12px"><b>Siguiente paso</b>Esta solicitud ya está aprobada. Agréguela a un itinerario en <b>Planificar el día</b>.</div>' : ''}
    <div class="err" id="se"></div><div class="bar">${staff && s.estado === 'APROBADA' ? '<button class="btn pri" id="irplan">🗓️ Ir a planificar</button>' : ''}${(staff ? acc : []).map(([e, t, c]) => `<button class="btn ${c}" data-st="${e}">${t}</button>`).join('')}${puedeCancelar ? '<button class="btn bad" data-st="CANCELADA">Cancelar solicitud</button>' : ''}</div>`, (m, close) => {
    if ($('#irplan', m)) $('#irplan', m).onclick = () => { close(); state.view = 'planificacion'; render(); };
    m.querySelectorAll('[data-st]').forEach((b) => (b.onclick = async () => {
      const e = b.dataset.st, enviar = async (motivo) => { await api('POST', `/solicitudes/${id}/estado`, { estado: e, motivo }); close(); toast('Estado actualizado: ' + (ESTADO_TXT[e] || e)); render(); };
      if (['CANCELADA', 'REPROGRAMADA'].includes(e)) return pedirMotivo(e === 'CANCELADA' ? 'Cancelar la solicitud' : 'Reprogramar la solicitud', enviar);
      try { await enviar(); } catch (er) { $('#se', m).textContent = er.message; }
    }));
  });
}

// Selector de punto: lugar conocido / dirección / mapa / mi ubicación actual (el GPS es opcional)
let pickMaps = {};
function puntoHTML(pre, ubs) {
  return `<label>Lugar conocido</label><select id="${pre}_ub">${opts(ubs, '', (u) => u.id, (u) => u.nombre, '— Elegir de la lista —')}</select>
    <label>o escriba la dirección</label><input id="${pre}_dir" placeholder="Calle, zona o referencia">
    <div class="row" style="margin:8px 0"><button type="button" class="btn sm" data-gps="${pre}">📍 Usar mi ubicación actual</button><button type="button" class="btn sm" data-map="${pre}">🗺️ Marcar en el mapa</button><button type="button" class="btn sm ghost" data-clr="${pre}">Quitar</button></div>
    <div id="${pre}_mapbox" hidden><div class="map" id="${pre}_map"></div><div class="hint">Toque el mapa para marcar el punto exacto.</div></div>
    <div class="hint" id="${pre}_gps">Sin punto GPS (es opcional)</div><input type="hidden" id="${pre}_lat"><input type="hidden" id="${pre}_lon"><input type="hidden" id="${pre}_src">
    <label>Persona de contacto</label><input id="${pre}_con" placeholder="Nombre y teléfono (opcional)">`;
}
function setPunto(pre, lat, lon, src) {
  $(`#${pre}_lat`).value = lat ?? ''; $(`#${pre}_lon`).value = lon ?? ''; $(`#${pre}_src`).value = src ?? '';
  $(`#${pre}_gps`).textContent = lat == null ? 'Sin punto GPS (es opcional)' : `✔ Punto guardado: ${(+lat).toFixed(5)}, ${(+lon).toFixed(5)} (${src === 'DISPOSITIVO' ? 'su ubicación' : 'mapa'})`;
  const mp = pickMaps[pre]; if (mp && lat != null) { mp.mk ? mp.mk.setLatLng([lat, lon]) : (mp.mk = L.marker([lat, lon]).addTo(mp.map)); mp.map.setView([lat, lon], 15); }
}
function bindPunto(pre) {
  $(`[data-gps="${pre}"]`).onclick = () => {
    if (!navigator.geolocation) return toast('Este dispositivo no permite obtener la ubicación.');
    $(`#${pre}_gps`).textContent = 'Obteniendo su ubicación…';
    navigator.geolocation.getCurrentPosition((p) => setPunto(pre, p.coords.latitude, p.coords.longitude, 'DISPOSITIVO'), (e) => ($(`#${pre}_gps`).textContent = 'No se pudo obtener la ubicación: ' + e.message), { enableHighAccuracy: true, timeout: 15000 });
  };
  $(`[data-clr="${pre}"]`).onclick = () => setPunto(pre, null, null, null);
  $(`[data-map="${pre}"]`).onclick = () => {
    $(`#${pre}_mapbox`).hidden = false;
    if (!pickMaps[pre]) {
      const map = L.map(`${pre}_map`).setView([-17.78, -63.18], 11);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
      pickMaps[pre] = { map }; map.on('click', (e) => setPunto(pre, e.latlng.lat, e.latlng.lng, 'MAPA'));
    }
    setTimeout(() => pickMaps[pre].map.invalidateSize(), 80);
  };
}
async function nuevaSolicitud() {
  const ubs = await api('GET', '/ubicaciones'); pickMaps = {};
  const seg = (name, items, def) => `<div class="seg ${name === 'pr' ? 'urg' : ''}">${items.map(([v, t, s]) => `<label><input type="radio" name="${name}" value="${v}" ${v === def ? 'checked' : ''}><span>${t}${s ? `<small>${s}</small>` : ''}</span></label>`).join('')}</div>`;
  ventana('Nueva solicitud de transporte', `<p class="mut sm" style="margin:0 0 4px">Complete los 5 pasos. Los campos con <b style="color:var(--bad)">*</b> son obligatorios.</p>
    ${seccion(1, '¿Qué tipo de transporte es?', '', `<label class="req">Logística</label>${seg('tl', [['INTERNA', 'Interna', 'entre nuestras instalaciones'], ['EXTERNA', 'Externa', 'clientes y proveedores']], 'INTERNA')}
      <label class="req">Operación</label><select id="to"><option value="ENTREGA">Entrega — llevar algo a alguien</option><option value="RECOJO">Recojo — traer algo</option><option value="TRASLADO">Traslado — mover entre lugares</option><option value="DEVOLUCION">Devolución</option><option value="OTRO">Otro</option></select>
      <label>Prioridad</label>${seg('pr', [['NORMAL', 'Normal', ''], ['URGENTE', 'Urgente', 'hoy o mañana'], ['CRITICA', 'Crítica', 'inmediato']], 'NORMAL')}`)}
    ${seccion(2, '¿Qué se transporta?', 'Material, cantidad y peso aproximado', `<label class="req">Material o producto</label><input id="ma" placeholder="Ej.: Envases PEAD, producto terminado…">
      <div class="grid2"><div><label>Cantidad</label><input id="ca" type="number" min="0" step="any" inputmode="decimal"></div><div><label>Unidad</label><input id="un" list="unidades" placeholder="cajas, kg…"><datalist id="unidades"><option>unidades</option><option>cajas</option><option>pallets</option><option>kg</option><option>litros</option><option>bidones</option></datalist></div>
      <div><label>Peso total (kg)</label><input id="pe" type="number" min="0" step="any" inputmode="decimal"><div class="hint">Ayuda a no sobrecargar el camión</div></div><div><label>Volumen (m³)</label><input id="vo" type="number" min="0" step="any" inputmode="decimal"></div></div>
      <label>Detalles o instrucciones</label><textarea id="de" rows="2" placeholder="Ej.: frágil, necesita montacargas…"></textarea>`)}
    ${seccion(3, '¿De dónde sale?', 'Punto de carga: elija un lugar, escriba la dirección o use su ubicación', puntoHTML('origen', ubs))}
    ${seccion(4, '¿A dónde va?', 'Punto de entrega', puntoHTML('destino', ubs))}
    ${seccion(5, '¿Cuándo se necesita?', '', `<div class="grid2"><div><label class="req">Fecha</label><input id="fr" type="date" value="${today(1)}"></div><div><label>Hora</label><input id="hr" type="time"></div></div><label>Observaciones</label><input id="ob" placeholder="Opcional">`)}
    <div class="err" id="ne"></div><div class="bar"><button class="btn" id="cn">Cancelar</button><button class="btn pri lg" id="env">Enviar solicitud</button></div>`, (m, close) => {
    bindPunto('origen'); bindPunto('destino'); $('#cn', m).onclick = close;
    const radio = (n) => m.querySelector(`input[name=${n}]:checked`).value;
    $('#env', m).onclick = async () => {
      const punto = (pre) => ($(`#${pre}_ub`).value || $(`#${pre}_dir`).value.trim() || $(`#${pre}_lat`).value);
      let err = validar(m, [['#ma', 'Indique qué material o producto se transporta'], ['#fr', 'Indique la fecha en que se necesita']]);
      if (!err && !punto('origen')) { $('#origen_ub').classList.add('invalid'); $('#origen_ub').scrollIntoView({ block: 'center' }); err = 'Indique de dónde sale (lugar, dirección o ubicación)'; }
      if (!err && !punto('destino')) { $('#destino_ub').classList.add('invalid'); $('#destino_ub').scrollIntoView({ block: 'center' }); err = 'Indique a dónde va (lugar, dirección o ubicación)'; }
      if (err) return ($('#ne', m).textContent = err);
      const pt = (pre) => ({ [`${pre}_ubicacion_id`]: $(`#${pre}_ub`).value || null, [`${pre}_direccion`]: $(`#${pre}_dir`).value || null, [`${pre}_lat`]: $(`#${pre}_lat`).value === '' ? null : +$(`#${pre}_lat`).value, [`${pre}_lon`]: $(`#${pre}_lon`).value === '' ? null : +$(`#${pre}_lon`).value, [`${pre}_gps_fuente`]: $(`#${pre}_src`).value || null, [`${pre}_contacto`]: $(`#${pre}_con`).value || null });
      $('#env', m).disabled = true;
      try { const r = await api('POST', '/solicitudes', { tipo_logistica: radio('tl'), tipo_operacion: $('#to', m).value, fecha_requerida: $('#fr', m).value, hora_requerida: $('#hr', m).value || null, prioridad: radio('pr'), material: $('#ma', m).value, cantidad: $('#ca', m).value, unidad: $('#un', m).value, peso_kg: $('#pe', m).value, volumen_m3: $('#vo', m).value, descripcion: $('#de', m).value, observaciones: $('#ob', m).value, ...pt('origen'), ...pt('destino') }); close(); toast(`✅ Solicitud #${r.numero} enviada`); state.view = 'solicitudes'; state.solFiltro = { grupo: 'todas', tipo: '' }; render(); }
      catch (e) { $('#ne', m).textContent = e.message; $('#env', m).disabled = false; }
    };
  });
}

// ---------- Vehículos ----------
async function vehiculosView(m) {
  const [v, t, ch] = await Promise.all([api('GET', '/vehiculos'), api('GET', '/transportistas'), api('GET', '/choferes')]);
  const adm = state.user.rol === 'ADMIN';
  m.innerHTML = pageHead('vehiculos', adm ? '<button class="btn pri lg" id="nuevo">＋ Agregar vehículo</button>' : '')
    + (v.map((x) => `<div class="item nohover ${x.estado === 'DISPONIBLE' ? 'teal' : x.estado === 'EN_RUTA' ? 'ok' : 'URGENTE'}"><div class="h"><span style="font-size:24px">🚚</span><b>${esc(x.codigo)}</b><span class="mut">${esc(x.placa)}</span><span class="sp"></span>${tag(x.estado)}${x.propiedad === 'TERCERO' ? '<span class="tag warn">Tercero</span>' : '<span class="tag ok">Propio</span>'}</div>
      <div class="m">${esc(x.tipo_vehiculo || 'Sin tipo')} · capacidad <b>${esc(x.capacidad_kg)} kg</b>${x.chofer_nombre ? ` · chofer: ${esc(x.chofer_nombre)}` : ''}${x.transportista ? ` · ${esc(x.transportista)}` : ''}</div>
      <div class="row" style="margin-top:8px"><button class="btn sm" data-kardex="${x.id}">🔧 Mantenimiento</button>${adm ? `<button class="btn sm" data-edit="${x.id}">✏️ Editar</button><select data-est="${x.id}" style="width:auto;min-height:32px;padding:3px 8px">${[['DISPONIBLE', 'Disponible'], ['EN_RUTA', 'En ruta'], ['MANTENIMIENTO', 'En mantenimiento'], ['FUERA_DE_SERVICIO', 'Fuera de servicio']].map(([e, tx]) => `<option value="${e}" ${e === x.estado ? 'selected' : ''}>${tx}</option>`).join('')}</select><button class="btn sm bad" data-del="${x.id}">Anular</button>` : ''}</div></div>`).join('') || vacio('🚚', 'No hay vehículos', 'Agregue el primer vehículo para poder planificar.', adm ? '<button class="btn pri" id="nuevo2">＋ Agregar vehículo</button>' : ''));
  m.querySelectorAll('[data-kardex]').forEach((b) => (b.onclick = () => { state.view = 'mantenimiento'; state.mantTab = 'kardex'; state.mantVeh = b.dataset.kardex; render(); }));
  m.querySelectorAll('[data-est]').forEach((s) => (s.onchange = async () => { try { await api('PUT', '/vehiculos/' + s.dataset.est, { estado: s.value }); toast('Estado actualizado'); render(); } catch (e) { toast(e.message); } }));
  m.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => pedirMotivo('Anular vehículo', async (motivo) => { await api('DELETE', '/vehiculos/' + b.dataset.del, { motivo }); render(); })));
  m.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => formVehiculo(v.find((x) => x.id === b.dataset.edit), t, ch)));
  for (const id of ['#nuevo', '#nuevo2']) if ($(id)) $(id).onclick = () => formVehiculo(null, t, ch);
}
function formVehiculo(v, transp, choferes, cb) {
  const nuevo = !v; v = v || { propiedad: 'PROPIO', combustible: 'DIESEL' };
  ventana(nuevo ? 'Agregar vehículo' : `Editar ${esc(v.codigo)}`, `<p class="mut sm" style="margin:0">Los campos con <b style="color:var(--bad)">*</b> son obligatorios.</p>
    ${seccion(1, 'Identificación', '', `<div class="grid2"><div><label class="req">Código interno</label><input id="c" value="${esc(v.codigo || '')}" placeholder="VEH-002"></div><div><label class="req">Placa</label><input id="p" value="${esc(v.placa || '')}" placeholder="1234-ABC"></div>
      <div><label>Tipo de vehículo</label><input id="t" value="${esc(v.tipo_vehiculo || '')}" placeholder="Camión 4T"></div><div><label>Marca / modelo</label><input id="mm" value="${esc(v.marca || '')}" placeholder="Hino 300"></div></div>`)}
    ${seccion(2, 'Capacidad', 'Sirve para validar que no se sobrecargue', `<div class="grid2"><div><label class="req">Capacidad (kg)</label><input id="k" type="number" min="0" value="${esc(v.capacidad_kg || '')}" placeholder="4000"></div><div><label>Capacidad (m³)</label><input id="m3" type="number" min="0" value="${esc(v.capacidad_m3 || '')}"></div>
      <div><label>Tanque (litros)</label><input id="tq" type="number" min="0" value="${esc(v.capacidad_tanque_l || '')}"><div class="hint">Valida cargas de diésel</div></div><div><label>Consumo esperado (km/L)</label><input id="ce" type="number" min="0" step="any" value="${esc(v.consumo_esperado_km_l || '')}"><div class="hint">Alerta si rinde mucho menos</div></div></div>`)}
    ${seccion(3, '¿Es propio o de un tercero?', '', `<div class="seg"><label><input type="radio" name="pro" value="PROPIO" ${v.propiedad === 'PROPIO' ? 'checked' : ''}><span>Propio</span></label><label><input type="radio" name="pro" value="TERCERO" ${v.propiedad === 'TERCERO' ? 'checked' : ''}><span>De un tercero<small>transportista externo</small></span></label></div>
      <div id="terc" ${v.propiedad === 'TERCERO' ? '' : 'hidden'}><label class="req">Empresa transportista</label><select id="em">${opts(transp, v.empresa_transportista_id, (x) => x.id, (x) => x.nombre, '— Elegir — o escriba una nueva abajo')}</select><input id="emn" placeholder="Nombre de empresa nueva (opcional)" style="margin-top:6px">
      <div class="grid2"><div><label>Tarifa por viaje (Bs)</label><input id="tv" type="number" min="0" value="${esc(v.tarifa_viaje || '')}"></div><div><label>Tarifa por km (Bs)</label><input id="tk" type="number" min="0" step="any" value="${esc(v.tarifa_km || '')}"></div></div></div>`)}
    ${seccion(4, 'Chofer habitual', 'Opcional', `<select id="ch">${opts(choferes, v.chofer_asignado_id, (x) => x.id, (x) => x.nombre, '— Sin chofer fijo —')}</select>`)}
    <div class="err" id="er"></div><div class="bar"><button class="btn" id="no">Cancelar</button><button class="btn pri lg" id="ok">${nuevo ? 'Guardar vehículo' : 'Guardar cambios'}</button></div>`, (m, close) => {
    $('#no', m).onclick = close;
    m.querySelectorAll('input[name=pro]').forEach((r) => (r.onchange = () => ($('#terc', m).hidden = m.querySelector('input[name=pro]:checked').value !== 'TERCERO')));
    $('#ok', m).onclick = async () => {
      const err = validar(m, [['#c', 'Escriba el código del vehículo'], ['#p', 'Escriba la placa'], ['#k', 'Indique la capacidad en kg']]); if (err) return ($('#er', m).textContent = err);
      try {
        const ter = m.querySelector('input[name=pro]:checked').value === 'TERCERO'; let em = $('#em', m).value || null;
        if (ter && !em && $('#emn', m).value.trim()) em = (await api('POST', '/transportistas', { nombre: $('#emn', m).value.trim() })).id;
        if (ter && !em) { $('#em', m).classList.add('invalid'); return ($('#er', m).textContent = 'Elija o escriba la empresa transportista'); }
        const body = { codigo: $('#c', m).value.trim(), placa: $('#p', m).value.trim(), tipo_vehiculo: $('#t', m).value || null, marca: $('#mm', m).value || null, capacidad_kg: +$('#k', m).value, capacidad_m3: $('#m3', m).value || null, capacidad_tanque_l: $('#tq', m).value || null, consumo_esperado_km_l: $('#ce', m).value || null, propiedad: ter ? 'TERCERO' : 'PROPIO', empresa_transportista_id: ter ? em : null, tarifa_viaje: ter ? $('#tv', m).value || null : null, tarifa_km: ter ? $('#tk', m).value || null : null, chofer_asignado_id: $('#ch', m).value || null };
        const r = nuevo ? await api('POST', '/vehiculos', body) : await api('PUT', '/vehiculos/' + v.id, body);
        close(); toast('✅ Vehículo guardado'); if (cb) cb(nuevo ? r.id : v.id); else render();
      } catch (e) { $('#er', m).textContent = e.message; }
    };
  });
}

// ---------- Lugares ----------
const TIPOS_LUGAR = [['PLANTA', 'Planta'], ['ALMACEN', 'Almacén'], ['OFICINA', 'Oficina'], ['DEPOSITO', 'Depósito'], ['CENTRO_DISTRIBUCION', 'Centro de distribución'], ['PROVEEDOR', 'Proveedor'], ['CLIENTE', 'Cliente'], ['DISTRIBUIDOR', 'Distribuidor'], ['OTRO', 'Otro']];
function parseCoords(txt) {   // acepta enlaces de Google Maps o "lat, lon"
  const t = decodeURIComponent(String(txt || ''));
  const r = [/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, /@(-?\d+\.\d+),(-?\d+\.\d+)/, /(-?\d{1,2}\.\d{3,})[,\s;]+(-?\d{1,3}\.\d{3,})/];
  for (const re of r) { const m = re.exec(t); if (m) return [+m[1], +m[2]]; }
  return null;
}
async function ubicacionesView(m) {
  const u = await api('GET', '/ubicaciones'); const adm = state.user.rol === 'ADMIN';
  const sin = u.filter((x) => x.lat == null).length;
  m.innerHTML = pageHead('ubicaciones', adm ? '<button class="btn pri lg" id="nuevo">＋ Agregar lugar</button>' : '')
    + (sin ? `<div class="alert">⚠️ <div class="sp"><b>${sin} lugar${sin > 1 ? 'es' : ''} sin coordenadas.</b> Sin ellas no se puede medir si el chofer llegó ni estimar kilómetros.</div></div>` : '')
    + (u.map((x) => `<div class="item nohover ${x.lat == null ? 'URGENTE' : 'ok'}"><div class="h"><span style="font-size:22px">🏭</span><b>${esc(x.nombre)}</b><span class="sp"></span><span class="tag">${esc((TIPOS_LUGAR.find((t) => t[0] === x.tipo) || [0, x.tipo || 'Otro'])[1])}</span>${x.lat == null ? '<span class="tag warn">Falta ubicar</span>' : '<span class="tag ok">Con coordenadas</span>'}</div>
      <div class="m">${esc(x.direccion || '')}${x.lat != null ? ` · ${(+x.lat).toFixed(5)}, ${(+x.lon).toFixed(5)}` : ''} · zona de llegada ${esc(x.radio_geocerca_m)} m</div>
      ${adm ? `<div class="row" style="margin-top:8px"><button class="btn sm" data-edit="${x.id}">✏️ Editar / ubicar</button><button class="btn sm bad" data-del="${x.id}">Anular</button></div>` : ''}</div>`).join('') || vacio('🗺️', 'No hay lugares', 'Agregue las plantas, almacenes y clientes a los que se transporta.'));
  m.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => pedirMotivo('Anular lugar', async (motivo) => { await api('DELETE', '/ubicaciones/' + b.dataset.del, { motivo }); render(); })));
  m.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => formLugar(u.find((x) => x.id === b.dataset.edit))));
  if ($('#nuevo')) $('#nuevo').onclick = () => formLugar(null);
}
function formLugar(l, cb, opts = {}) {
  const nuevo = !l || !l.id; l = l || { tipo: 'OTRO', radio_geocerca_m: 150 };
  const exigir = opts.exigirMapa ?? nuevo;   // un lugar nuevo siempre debe quedar ubicado en el mapa
  let cerrado = false;
  ventana(nuevo ? 'Nuevo lugar' : `Editar ${esc(l.nombre)}`, `<p class="mut sm" style="margin:0">Los campos con <b style="color:var(--bad)">*</b> son obligatorios.</p>
    ${seccion(1, 'Datos del lugar', '', `<label class="req">Nombre</label><input id="n" value="${esc(l.nombre || '')}" placeholder="Ej.: Almacén cliente Norte"><div class="grid2"><div><label>Código corto</label><input id="c" value="${esc(l.codigo || '')}" placeholder="ALM-N"></div><div><label>Tipo</label><select id="t">${TIPOS_LUGAR.map(([k, t]) => `<option value="${k}" ${k === l.tipo ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div><label>Dirección o referencia</label><input id="d" value="${esc(l.direccion || '')}">`)}
    ${seccion(2, 'Ubicación en el mapa', exigir ? 'Obligatoria: sirve para la ruta y para saber si el chofer llegó' : 'Para medir llegadas y estimar kilómetros', `
      <label ${exigir ? 'class="req"' : ''}>Pegue el enlace de Google Maps (o las coordenadas)</label><input id="enl" placeholder="https://www.google.com/maps/…   o   -17.8341, -63.1333">
      <div class="row" style="margin:6px 0"><button class="btn sm" type="button" id="gm">🌐 Abrir Google Maps para buscar</button><button class="btn sm" type="button" id="mp">🗺️ Marcar en el mapa</button><button class="btn sm" type="button" id="gps">📍 Estoy en este lugar</button></div>
      <div class="hint" id="enlh">En Google Maps busque el lugar, toque el punto, copie el enlace y péguelo arriba. (Los enlaces cortos maps.app.goo.gl no se pueden leer: use el enlace largo o las coordenadas.)</div>
      <div id="mapbox" hidden><div class="map" id="lm"></div><div class="hint">Toque el mapa para marcar el punto exacto.</div></div>
      <div class="grid2"><div><label>Latitud</label><input id="la" value="${esc(l.lat ?? '')}" inputmode="decimal"></div><div><label>Longitud</label><input id="lo" value="${esc(l.lon ?? '')}" inputmode="decimal"></div></div><div class="ok-t" id="lst"></div>
      <label>Zona de llegada (metros)</label><input id="r" type="number" min="20" value="${esc(l.radio_geocerca_m ?? 150)}"><div class="hint">Si el chofer registra llegada más lejos que esto, se marca “fuera de zona”.</div>`)}
    <div class="err" id="er"></div><div class="bar"><button class="btn" id="no">Cancelar</button><button class="btn pri lg" id="ok">Guardar lugar</button></div>`, (m, close) => {
    let map = null, mk = null;
    const estado = () => { const la = $('#la', m).value, lo = $('#lo', m).value; $('#lst', m).textContent = la !== '' && lo !== '' ? `✔ Ubicación lista: ${(+la).toFixed(5)}, ${(+lo).toFixed(5)}` : ''; };
    const poner = (la, lo, mover = true) => { $('#la', m).value = (+la).toFixed(6); $('#lo', m).value = (+lo).toFixed(6); estado(); if (map) { mk ? mk.setLatLng([la, lo]) : (mk = L.marker([la, lo]).addTo(map)); if (mover) map.setView([la, lo], 16); } };
    estado(); $('#no', m).onclick = close;
    if ($('#la', m).value !== '' && $('#lo', m).value !== '') setTimeout(() => $('#mp', m).click(), 30);
    $('#enl', m).oninput = () => { const c = parseCoords($('#enl', m).value); if (c) { if (!map) $('#mp', m).click(); poner(c[0], c[1]); $('#enlh', m).textContent = '✔ Coordenadas leídas del enlace.'; } else if (/goo\.gl|maps\.app/.test($('#enl', m).value)) $('#enlh', m).textContent = '⚠ Ese es un enlace corto. Ábralo en el navegador y copie el enlace largo, o pegue las coordenadas.'; };
    $('#gm', m).onclick = () => abrirExterno('https://www.google.com/maps/search/' + encodeURIComponent($('#n', m).value || ''));
    $('#gps', m).onclick = () => { if (!navigator.geolocation) return toast('Sin acceso a la ubicación'); navigator.geolocation.getCurrentPosition((p) => poner(p.coords.latitude, p.coords.longitude), (e) => toast('No se pudo obtener la ubicación: ' + e.message), { enableHighAccuracy: true, timeout: 15000 }); };
    $('#mp', m).onclick = () => {
      $('#mapbox', m).hidden = false;
      if (!map) { const la = +$('#la', m).value, lo = +$('#lo', m).value, ok = $('#la', m).value !== '' && Number.isFinite(la);
        map = crearMapa('lm', ok ? [la, lo] : [-17.78, -63.18], ok ? 16 : 11);
        if (ok) mk = L.marker([la, lo]).addTo(map); map.on('click', (e) => poner(e.latlng.lat, e.latlng.lng, false)); }
      setTimeout(() => map.invalidateSize(), 80);
    };
    $('#ok', m).onclick = async () => {
      let err = validar(m, [['#n', 'Escriba el nombre del lugar']]);
      const la = $('#la', m).value, lo = $('#lo', m).value;
      if (!err && exigir && (la === '' || lo === '')) { $('#enl', m).classList.add('invalid'); err = 'Falta ubicar el lugar: pegue el enlace de Google Maps, marque el punto en el mapa o use su ubicación'; }
      if (err) return ($('#er', m).textContent = err);
      const body = { nombre: $('#n', m).value.trim(), codigo: $('#c', m).value.trim() || null, tipo: $('#t', m).value, direccion: $('#d', m).value || null, lat: la === '' ? null : +la, lon: lo === '' ? null : +lo, radio_geocerca_m: +$('#r', m).value || 150 };
      try { const r = nuevo ? await api('POST', '/ubicaciones', body) : await api('PUT', '/ubicaciones/' + l.id, body); cerrado = true; close(); toast('✅ Lugar guardado'); if (cb) cb(nuevo ? r.id : l.id); else render(); }
      catch (e) { $('#er', m).textContent = e.message; }
    };
    new MutationObserver((_, ob) => { if (!document.body.contains(m)) { ob.disconnect(); if (!cerrado) opts.onCancel?.(); } }).observe(document.body, { childList: true });
  });
}

// ---------- Usuarios ----------
const ROLES = [['ADMIN', 'Administrador', 'Acceso completo, configura todo.'], ['PLANIFICADOR', 'Logística / planificador', 'Recibe solicitudes, planifica y hace seguimiento.'], ['CHOFER', 'Chofer', 'Ve su ruta y registra llegadas, fotos y combustible desde el teléfono.'], ['SOLICITANTE', 'Solicitante', 'Pide transportes y ve su estado.'], ['CONSULTA', 'Solo consulta', 'Ve información y reportes, sin modificar nada.']];
async function usuariosView(m) {
  const u = await api('GET', '/usuarios');
  m.innerHTML = pageHead('usuarios', '<button class="btn pri lg" id="nuevo">＋ Agregar usuario</button>')
    + (u.map((x) => `<div class="item nohover ${x.rol === 'ADMIN' ? 'URGENTE' : x.rol === 'CHOFER' ? 'teal' : ''}"><div class="h"><span style="font-size:22px">${x.rol === 'CHOFER' ? '🧑‍✈️' : x.rol === 'ADMIN' ? '🛡️' : '👤'}</span><b>${esc(x.nombre_completo)}</b><span class="mut">@${esc(x.usuario)}</span><span class="sp"></span><span class="tag">${esc(ROLES.find((r) => r[0] === x.rol)?.[1] || x.rol)}</span></div>
      <div class="m">${esc(x.area || 'Sin área')}</div><div class="row" style="margin-top:8px"><button class="btn sm" data-pin="${x.id}">🔑 Cambiar PIN</button><button class="btn sm" data-edit="${x.id}">✏️ Editar</button><button class="btn sm bad" data-del="${x.id}">Anular</button></div></div>`).join(''));
  $('#nuevo').onclick = () => formUsuario(null);
  m.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => formUsuario(u.find((x) => x.id === b.dataset.edit))));
  m.querySelectorAll('[data-pin]').forEach((b) => (b.onclick = () => ventana('Cambiar PIN', `<label class="req">Nuevo PIN (4 a 8 números)</label><input id="p" inputmode="numeric" placeholder="Ej.: 482913"><div class="hint">Recomendado: 6 dígitos que no sean fáciles de adivinar.</div><div class="err" id="er"></div><div class="bar"><button class="btn" id="no">Cancelar</button><button class="btn pri" id="ok">Guardar PIN</button></div>`, (w, close) => {
    $('#no', w).onclick = close; $('#ok', w).onclick = async () => { try { await api('PUT', '/usuarios/' + b.dataset.pin, { pin: $('#p', w).value }); close(); toast('✅ PIN actualizado'); } catch (e) { $('#er', w).textContent = e.message; } };
  })));
  m.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => pedirMotivo('Anular usuario', async (motivo) => { await api('DELETE', '/usuarios/' + b.dataset.del, { motivo }); render(); })));
}
function formUsuario(u) {
  const nuevo = !u; u = u || { rol: 'SOLICITANTE' };
  ventana(nuevo ? 'Agregar usuario' : `Editar ${esc(u.nombre_completo)}`, `${seccion(1, 'Datos de la persona', '', `<label class="req">Nombre completo</label><input id="n" value="${esc(u.nombre_completo || '')}" placeholder="Ej.: Juan Pérez"><label class="req">Usuario (para ingresar)</label><input id="us" value="${esc(u.usuario || '')}" ${nuevo ? '' : 'disabled'} autocapitalize="off" placeholder="jperez"><label>Área</label><input id="a" value="${esc(u.area || '')}" placeholder="Ej.: Logística, Ventas…">`)}
    ${seccion(2, '¿Qué podrá hacer?', '', `<label class="req">Rol</label><select id="r">${ROLES.map(([k, t]) => `<option value="${k}" ${k === u.rol ? 'selected' : ''}>${t}</option>`).join('')}</select><div class="hint" id="rd"></div>`)}
    ${nuevo ? seccion(3, 'Clave de ingreso', '', `<label class="req">PIN (4 a 8 números)</label><div class="row"><input id="pin" inputmode="numeric" placeholder="Ej.: 482913" style="flex:1"><button class="btn" type="button" id="gen">Generar</button></div><div class="hint">Entréguelo a la persona; podrá cambiarse luego.</div>`) : ''}
    <div class="err" id="er"></div><div class="bar"><button class="btn" id="no">Cancelar</button><button class="btn pri lg" id="ok">Guardar</button></div>`, (m, close) => {
    const rd = () => ($('#rd', m).textContent = ROLES.find((r) => r[0] === $('#r', m).value)[2]); rd(); $('#r', m).onchange = rd; $('#no', m).onclick = close;
    if ($('#gen', m)) $('#gen', m).onclick = () => ($('#pin', m).value = String(Math.floor(100000 + Math.random() * 900000)));
    $('#ok', m).onclick = async () => {
      const err = validar(m, [['#n', 'Escriba el nombre completo'], ...(nuevo ? [['#us', 'Escriba el usuario'], ['#pin', 'Escriba un PIN']] : [])]); if (err) return ($('#er', m).textContent = err);
      try {
        if (nuevo) await api('POST', '/usuarios', { usuario: $('#us', m).value.trim(), nombre_completo: $('#n', m).value.trim(), area: $('#a', m).value, rol: $('#r', m).value, pin: $('#pin', m).value });
        else await api('PUT', '/usuarios/' + u.id, { nombre_completo: $('#n', m).value.trim(), area: $('#a', m).value, rol: $('#r', m).value });
        close(); toast('✅ Usuario guardado'); render();
      } catch (e) { $('#er', m).textContent = e.message; }
    };
  });
}

async function auditoriaView(m) {
  const a = await api('GET', '/auditoria?limit=400'), q = (state.audQ || '').toLowerCase();
  const fil = a.filter((x) => !q || JSON.stringify([x.usuario, x.accion, x.tabla, x.motivo, x.valor_nuevo]).toLowerCase().includes(q));
  m.innerHTML = pageHead('auditoria') + `<div class="card"><input id="q" placeholder="🔍 Buscar por usuario, acción, tabla o motivo…" value="${esc(state.audQ || '')}"></div>`
    + `<div class="card scroll"><table><tr><th>Cuándo</th><th>Quién</th><th>Qué hizo</th><th>Sobre</th><th>Detalle</th></tr>${fil.map((x) => `<tr><td class="sm">${esc(new Date(x.ocurrio_en).toLocaleString())}</td><td>${esc(x.usuario || '—')}</td><td>${tag(x.accion === 'CREAR' ? 'ok' : x.accion === 'ANULAR' ? 'bad' : 'NORMAL').replace(/>[^<]*</, '>' + esc(x.accion.toLowerCase()) + '<')}</td><td>${esc(x.tabla)}</td><td class="sm mut">${esc((x.motivo ? x.motivo + ' · ' : '') + (x.valor_nuevo || '').slice(0, 90))}</td></tr>`).join('') || '<tr><td colspan="5" class="mut">Sin resultados.</td></tr>'}</table></div>`;
  $('#q').oninput = (e) => { state.audQ = e.target.value; clearTimeout(state.audT); state.audT = setTimeout(() => { render(); setTimeout(() => $('#q')?.focus(), 50); }, 350); };
}

// ---------- Planificar el día (constructor de ruta por paradas) ----------
const abrirExterno = (url) => window.open(url, window.Capacitor?.isNativePlatform?.() ? '_system' : '_blank');
const kg = (n) => `${Math.round(+n || 0).toLocaleString('es-BO')} kg`;
const CARGA_TXT = { CARGA: 'Cargar', DESCARGA: 'Descargar', DESCARGA_TOTAL: 'Descargar todo lo que lleva', SOLO_VIAJE: 'Solo viaje / espera' };

async function planView(m) {
  const fecha = state.planFecha || today(); state.planFecha = fecha;
  const [its, vehs, chos, ubs, pend, transp] = await Promise.all([api('GET', '/itinerarios?fecha=' + fecha), api('GET', '/vehiculos'), api('GET', '/choferes'), api('GET', '/ubicaciones'), api('GET', '/solicitudes?estado=APROBADA').catch(() => []), api('GET', '/transportistas').catch(() => [])]);
  const sel = state.itinId && its.find((i) => i.id === state.itinId) ? state.itinId : its[0]?.id; state.itinId = sel;
  const it = sel ? await api('GET', '/itinerarios/' + sel) : null;
  const staff = puedeEditarPlan(), edit = staff && it && !it.bloqueado; state.editando = !!edit;
  const paso = !its.length ? 2 : !it.actividades.length ? 3 : !it.bloqueado ? 4 : 5;
  const guia = ['Elija el día', 'Elija el vehículo y el chofer', 'Agregue las paradas del recorrido', 'Revise y apruebe el plan', 'Listo: el chofer ya ve su ruta'];
  const libres = vehs.filter((v) => !['MANTENIMIENTO', 'FUERA_DE_SERVICIO'].includes(v.estado));
  m.innerHTML = pageHead('planificacion', `<input type="date" id="fd" value="${fecha}" style="width:auto"><button class="btn ${fecha === today() ? 'pri' : ''}" id="hoy">Hoy</button><button class="btn ${fecha === today(1) ? 'pri' : ''}" id="man">Mañana</button>`, `Día seleccionado: <b>${esc(fechaLarga(fecha))}</b>`)
    + (staff && paso < 5 ? `<div class="how"><b>Cómo se hace</b><ol>${guia.map((t, i) => `<li class="${i + 1 < paso ? 'done' : i + 1 === paso ? 'now' : ''}">${t}</li>`).join('')}</ol></div>` : '')
    + (its.length ? `<div class="chips">${its.map((i) => `<button class="${i.id === sel ? 'on' : ''}" data-it="${i.id}">🚚 ${esc(i.vehiculo_codigo)} · ${esc(i.chofer_nombre)} <b>${esc(ESTADO_TXT[i.estado] || i.estado)}</b></button>`).join('')}</div>` : '')
    + (staff ? `<div class="card" id="crearcard"><h3 style="margin-top:0">${its.length ? '➕ Otro vehículo para este día' : '① ¿Qué vehículo y qué chofer hacen el recorrido?'}</h3>
      <label class="req">Vehículo</label><div class="lugar-sel"><select id="nv">${opts(libres, state.preVeh || '', (v) => v.id, (v) => `${v.codigo} · ${v.placa} · ${v.tipo_vehiculo || ''} (${v.capacidad_kg} kg)`)}</select><button class="btn sm" id="nvb" type="button">＋ Nuevo vehículo</button></div>
      <label class="req">Chofer</label><div class="lugar-sel"><select id="nc">${opts(chos, state.preCho || '', (c) => c.id, (c) => c.nombre + (c.empresa_transportista_id ? ' (tercero)' : ''))}</select><button class="btn sm" id="ncb" type="button">＋ Nuevo chofer</button></div>
      <div class="hint">¿No está en la lista? Use “Nuevo” para registrarlo aquí mismo.</div><div class="row" style="margin-top:10px"><button class="btn pri lg" id="crear">Crear itinerario y agregar paradas</button><span class="err" id="ce"></span></div></div>` : '')
    + `<div id="itbox">${it ? '' : vacio('🗓️', 'Todavía no hay itinerario para este día', staff ? 'Elija el vehículo y el chofer arriba para empezar.' : 'Aún no se planificó este día.')}</div>`;
  if (its.length && $('#crearcard')) $('#itbox').after($('#crearcard'));
  $('#fd').onchange = (e) => { state.planFecha = e.target.value; state.itinId = null; render(); };
  $('#hoy').onclick = () => { state.planFecha = today(); state.itinId = null; render(); };
  $('#man').onclick = () => { state.planFecha = today(1); state.itinId = null; render(); };
  m.querySelectorAll('[data-it]').forEach((b) => (b.onclick = () => { state.itinId = b.dataset.it; render(); }));
  if ($('#nvb')) $('#nvb').onclick = () => formVehiculo(null, transp, chos, (id) => { state.preVeh = id; render(); });
  if ($('#ncb')) $('#ncb').onclick = () => formChofer(transp, (id) => { state.preCho = id; render(); });
  if ($('#crear')) $('#crear').onclick = async () => {
    const err = validar(m, [['#nv', 'Elija el vehículo (o cree uno nuevo)'], ['#nc', 'Elija el chofer (o cree uno nuevo)']]); if (err) return ($('#ce').textContent = err);
    try { const r = await api('POST', '/itinerarios', { fecha, vehiculo_id: $('#nv').value, chofer_id: $('#nc').value }); state.itinId = r.id; state.preVeh = state.preCho = null; toast('✅ Itinerario creado. Ahora agregue las paradas.'); render(); } catch (e) { $('#ce').textContent = e.message; }
  };
  const ej = it && it.bloqueado ? await api('GET', '/ejecucion/' + it.id).catch(() => null) : null;
  if (it) itinEditor($('#itbox'), it, ubs, pend, edit, ej);
}

function formChofer(transp, cb) {
  ventana('Nuevo chofer', `<p class="mut sm" style="margin:0">Los campos con <b style="color:var(--bad)">*</b> son obligatorios.</p>
    ${seccion(1, 'Datos del chofer', '', `<label class="req">Nombre completo</label><input id="n" placeholder="Ej.: Carlos Mamani"><div class="grid2"><div><label>Teléfono</label><input id="t" inputmode="tel"></div><div><label>Licencia</label><input id="l"></div></div>
      <label>¿Es de una empresa de transporte (tercero)?</label><select id="em">${opts(transp, '', (x) => x.id, (x) => x.nombre, '— No, es de nuestra empresa —')}</select>`)}
    ${seccion(2, '¿Usará la aplicación en su teléfono?', 'Solo si va a registrar llegadas, fotos y combustible', `<label style="display:flex;gap:8px;align-items:center;margin:0"><input type="checkbox" id="ac"> Sí, darle usuario y PIN</label><div id="cred" hidden><label class="req">Usuario</label><input id="us" autocapitalize="off" placeholder="cmamani"><label class="req">PIN (4 a 8 números)</label><div class="row"><input id="pin" inputmode="numeric" style="flex:1"><button class="btn" type="button" id="gen">Generar</button></div></div>`)}
    <div class="err" id="er"></div><div class="bar"><button class="btn" id="no">Cancelar</button><button class="btn pri lg" id="ok">Guardar chofer</button></div>`, (m, close) => {
    $('#no', m).onclick = close; $('#ac', m).onchange = () => ($('#cred', m).hidden = !$('#ac', m).checked);
    $('#gen', m).onclick = () => ($('#pin', m).value = String(Math.floor(100000 + Math.random() * 900000)));
    $('#ok', m).onclick = async () => {
      const con = $('#ac', m).checked, err = validar(m, [['#n', 'Escriba el nombre del chofer'], ...(con ? [['#us', 'Escriba el usuario'], ['#pin', 'Escriba un PIN']] : [])]); if (err) return ($('#er', m).textContent = err);
      try { const r = await api('POST', '/choferes', { nombre: $('#n', m).value.trim(), telefono: $('#t', m).value || null, licencia: $('#l', m).value || null, empresa_transportista_id: $('#em', m).value || null, ...(con ? { usuario: $('#us', m).value.trim(), pin: $('#pin', m).value } : {}) }); close(); toast('✅ Chofer guardado'); cb?.(r.id); }
      catch (e) { $('#er', m).textContent = e.message; }
    };
  });
}

// ===== Mapas: carga rápida (mosaicos por CDN, caché en el dispositivo y reemplazo si un proveedor falla) =====
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', TILE_RESPALDO = 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png';
function crearMapa(el, centro = [-17.78, -63.18], zoom = 11) {   // los mosaicos vistos se guardan en el dispositivo (sw.js): la 2.ª vez cargan al instante
  const mapa = L.map(el, { preferCanvas: true, fadeAnimation: false }).setView(centro, zoom);
  const opc = { maxZoom: 19, crossOrigin: true, updateWhenIdle: false, keepBuffer: 4, attribution: '© OpenStreetMap' };
  let cap = L.tileLayer(TILE_URL, opc).addTo(mapa), errores = 0;
  cap.on('tileerror', () => { if (++errores === 4) { mapa.removeLayer(cap); cap = L.tileLayer(TILE_RESPALDO, { ...opc, subdomains: 'abc' }).addTo(mapa); } });
  return mapa;
}
const pinIcono = (txt, cls = '') => L.divIcon({ html: `<div class="pin ${cls}">${txt}</div>`, className: '', iconSize: [30, 30], iconAnchor: [15, 15] });

// ===== Tiempo y tipos de actividad (tabla de ruteo) =====
const durTxt = (min) => `${String(Math.floor(Math.max(0, min) / 60)).padStart(2, '0')}:${String(Math.max(0, min) % 60).padStart(2, '0')}`;
const parseDur = (t) => { t = String(t ?? '').trim(); let m = /^(\d{1,2}):(\d{2})$/.exec(t); if (m) return +m[1] * 60 + +m[2]; m = /^(\d+(?:[.,]\d+)?)\s*h$/i.exec(t); if (m) return Math.round(parseFloat(m[1].replace(',', '.')) * 60); m = /^(\d+)\s*(?:min)?$/i.exec(t); return m ? +m[1] : null; };
const RT = [['VIAJE', '🚚 Viaje'], ['CARGA', '⬆️ Cargar'], ['DESCARGA', '⬇️ Descargar (kg)'], ['DESCARGA_TOTAL', '⬇️ Descargar todo'], ['ESPERA', '🍽️ Almuerzo / pausa'], ['OTRO', '📌 Otra tarea'], ['ENTREGA_VEHICULO', '🏁 Entregar vehículo']];
const rtDe = (a) => (['VIAJE', 'ENTREGA_VEHICULO', 'ESPERA'].includes(a.tipo) ? a.tipo : a.carga_tipo === 'DESCARGA_TOTAL' ? 'DESCARGA_TOTAL' : a.carga_tipo === 'DESCARGA' || (!a.carga_tipo && a.peso_kg < 0) ? 'DESCARGA' : a.carga_tipo === 'CARGA' || (!a.carga_tipo && a.peso_kg > 0) ? 'CARGA' : 'OTRO');
const aplicarRt = (a, rt) => { const m = { VIAJE: ['VIAJE', 'SOLO_VIAJE'], ENTREGA_VEHICULO: ['ENTREGA_VEHICULO', 'SOLO_VIAJE'], ESPERA: ['ESPERA', 'SOLO_VIAJE'], OTRO: ['OTRO', 'SOLO_VIAJE'], CARGA: ['CARGA', 'CARGA'], DESCARGA: ['DESCARGA', 'DESCARGA'], DESCARGA_TOTAL: ['DESCARGA', 'DESCARGA_TOTAL'] }[rt]; a.tipo = m[0]; a.carga_tipo = m[1]; };

// ===== Pegar desde Excel: reconoce qué hace cada fila y en qué lugar =====
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const PALABRAS_GENERICAS = new Set(['planta', 'almacen', 'plan', 'parque', 'industrial', 'centro', 'deposito', 'oficina', 'cliente', 'proveedor', 'distribuidor', 'calle', 'avenida', 'zona', 'santa', 'cruz', 'sierra', 'rumbo']);
function aliasesDe(u) {
  const out = new Set(), n = norm(u.nombre); if (n) out.add(n);
  for (const m of String(u.nombre).matchAll(/\(([^)]+)\)/g)) { const p = norm(m[1]); if (p) out.add(p); }
  for (const t of norm(String(u.nombre).replace(/\([^)]*\)/g, ' ')).split(' ')) if (t.length >= 4 && !PALABRAS_GENERICAS.has(t) && !/^\d/.test(t)) out.add(t);
  const tk = norm(String(u.nombre).replace(/\([^)]*\)/g, ' ')).split(' ');
  for (let i = 0; i + 1 < tk.length; i++) if (tk[i].length + tk[i + 1].length >= 6 && !(PALABRAS_GENERICAS.has(tk[i]) && PALABRAS_GENERICAS.has(tk[i + 1]))) out.add(tk[i] + ' ' + tk[i + 1]);
  const anillo = /\d+\w*\s+anillo/.exec(n); if (anillo) out.add(anillo[0]);
  if (u.codigo && norm(u.codigo).length >= 3) out.add(norm(u.codigo));
  return [...out];
}
function buscarLugar(texto, lugares) {
  const t = ' ' + norm(texto) + ' '; let mejor = null;
  for (const u of lugares) for (const al of aliasesDe(u)) { const i = t.lastIndexOf(' ' + al + ' '); if (i >= 0 && (!mejor || al.length > mejor.al.length || (al.length === mejor.al.length && i > mejor.i))) mejor = { u, al, i }; }
  return mejor;
}
function clasificarTexto(texto, pos, lugares) {
  const t = norm(texto), orig = String(texto).toLowerCase().replace(/(\d),(\d)/g, '$1.$2');
  let kgv = 0; const mt = /(\d+(?:\.\d+)?)\s*(?:ton(?:eladas?)?|tn|t)\b/.exec(orig), mk = /(\d+(?:\.\d+)?)\s*kg\b/.exec(orig);
  if (mt) kgv = Math.round(parseFloat(mt[1]) * 1000); else if (mk) kgv = Math.round(parseFloat(mk[1]));
  const hay = (re) => re.test(t), f = buscarLugar(texto, lugares), fid = f?.u.id || null;
  const enExplicito = f && (new RegExp('\\ben ' + f.al.replace(/ /g, ' ') + '\\b').test(t) || /\([^)]*\)/.test(String(texto)) && norm(String(texto).match(/\(([^)]*)\)/)?.[1]).includes(f.al));
  const aqui = (pos && !enExplicito) ? pos : (fid || pos || null);
  const op = (rt, lugar, mag = 0) => ({ rt, origen: lugar, destino: lugar, mag, actividad: String(texto).trim() });
  if (hay(/\b(almuerzo|descanso|refrigerio|pausa|espera)\b/)) return [op('ESPERA', pos || fid)];
  if (hay(/entreg\w* (de |del )?(el )?vehiculo/)) return [{ rt: 'ENTREGA_VEHICULO', origen: pos, destino: fid || pos, mag: 0, actividad: String(texto).trim() }];
  const desc = hay(/\b(descarga|descargar|descargue)\b/), carg = hay(/\b(carguio|carga|cargar|recojo|recoger|recoleccion)\b/);
  if (desc && carg) return [op('DESCARGA_TOTAL', aqui, 0), op('CARGA', aqui, kgv)].map((p, i) => ({ ...p, actividad: String(texto).trim() + (i ? ' (carga)' : ' (descarga)') }));
  if (hay(/\b(rumbo|viaje|traslado|retorno|ir a|dirigirse)\b/)) return [{ rt: 'VIAJE', origen: pos, destino: fid || null, mag: 0, actividad: String(texto).trim() }];
  if (desc) return [op(kgv ? 'DESCARGA' : 'DESCARGA_TOTAL', aqui, kgv)];
  if (hay(/\b(entrega|entregar)\b/) && !hay(/vehiculo/)) return [op(kgv ? 'DESCARGA' : 'DESCARGA_TOTAL', aqui, kgv)];
  if (carg) return [op('CARGA', aqui, kgv)];
  return [op('OTRO', pos || fid)];
}
function analizarExcel(texto, lugares, posIni) {
  const filas = [], HORA = /^\d{1,2}:\d{2}(:\d{2})?$/;
  for (const linea of String(texto).split(/\r?\n/)) {
    const celdas = linea.split('\t').map((c) => c.trim()), horas = celdas.filter((c) => HORA.test(c)).map((c) => c.slice(0, 5).replace(/^(\d):/, '0$1:'));
    if (horas.length < 2) continue;   // títulos, encabezados y filas vacías
    const txt = celdas.filter((c) => c && !HORA.test(c) && !/^\d+$/.test(c)).sort((a, b) => b.length - a.length)[0] || '';
    let ini = horas[0], fin = horas[1]; if (hm(fin) < hm(ini) && horas.length === 2) fin = fmt(hm(ini) + hm(fin));   // el segundo dato era la duración
    if (hm(fin) > hm(ini)) filas.push({ ini, fin, txt });
  }
  let pos = posIni; const out = [];
  for (const f of filas) {
    const partes = clasificarTexto(f.txt, pos, lugares), total = hm(f.fin) - hm(f.ini);
    partes.forEach((p, k) => {
      const ini = k === 0 ? f.ini : out[out.length - 1].hora_fin_plan, fin = k === partes.length - 1 ? f.fin : fmt(hm(ini) + Math.max(5, Math.round(total / partes.length)));
      const a = { actividad: p.actividad, comentarios: '', hora_inicio_plan: ini, hora_fin_plan: fin, origen_ubicacion_id: p.origen || null, destino_ubicacion_id: p.destino || null, mag: p.mag || 0, peso_kg: 0 }; aplicarRt(a, p.rt); out.push(a);
      if (a.destino_ubicacion_id) pos = a.destino_ubicacion_id;
    });
  }
  return out;
}

function itinEditor(box, it, ubs, pend, edit, ej) {
  let acts = it.actividades.map((a) => ({ ...a, mag: Math.abs(a.peso_kg || 0) })), lugares = ubs.slice(), horaSalida = acts[0]?.hora_inicio_plan || '07:00';
  let vista = state.vistaPlan || (window.innerWidth < 760 ? 'paradas' : 'tabla'), cadena = state.cadena ?? true;
  const lug = (id) => lugares.find((u) => u.id === id), nom = (id) => lug(id)?.nombre || '— sin lugar —';
  const tipoCarga = (a) => a.carga_tipo || (a.peso_kg > 0 ? 'CARGA' : a.peso_kg < 0 ? 'DESCARGA' : 'SOLO_VIAJE');
  const esViaje = (a) => ['VIAJE', 'ENTREGA_VEHICULO'].includes(a.tipo);
  const minutos = (a) => Math.max(0, (hm(a.hora_fin_plan) ?? 0) - (hm(a.hora_inicio_plan) ?? 0));
  const kmEntre = (o, d) => { const a = lug(o), b = lug(d); if (a?.lat == null || b?.lat == null || o === d) return 0; const r = (x) => (x * Math.PI) / 180, h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)) * 1.3; };
  const minViaje = (o, d) => Math.max(10, Math.round(((kmEntre(o, d) / 30) * 60) / 5) * 5);
  function normalizar() {   // el vehículo continúa desde donde quedó: el origen de un viaje es el destino de la fila anterior
    acts.forEach((a, i) => { if (esViaje(a)) { if (i > 0 && acts[i - 1].destino_ubicacion_id) a.origen_ubicacion_id = acts[i - 1].destino_ubicacion_id; } else a.origen_ubicacion_id = a.destino_ubicacion_id; });
  }
  function recalcular() {
    normalizar(); let c = 0;
    acts.forEach((a) => {
      a.carga_tipo = tipoCarga(a); const mag = Math.abs(Number(a.mag) || 0);
      a.peso_kg = a.carga_tipo === 'CARGA' ? mag : a.carga_tipo === 'DESCARGA' ? -mag : a.carga_tipo === 'DESCARGA_TOTAL' ? -Math.max(0, c) : 0;
      if (a.carga_tipo === 'DESCARGA_TOTAL') a.mag = Math.max(0, c);
      c += a.peso_kg; a._abordo = c;
    });
  }
  const encadenar = (desde) => { if (!cadena) return; for (let i = Math.max(desde, 1); i < acts.length; i++) { const d = minutos(acts[i]), p = hm(acts[i - 1].hora_fin_plan); if (p == null) break; acts[i].hora_inicio_plan = fmt(Math.min(p, 1439)); acts[i].hora_fin_plan = fmt(Math.min(p + d, 1439)); } };
  const posActual = () => acts.length ? acts[acts.length - 1].destino_ubicacion_id : null;
  const nuevaAct = (tipo, o, d, ct, mag, texto, ini, min, extra = {}) => ({ tipo, actividad: texto, carga_tipo: ct, mag, peso_kg: 0, origen_ubicacion_id: o, destino_ubicacion_id: d, hora_inicio_plan: ini, hora_fin_plan: fmt(Math.min((hm(ini) ?? 0) + min, 1439)), comentarios: '', ...extra });
  const finActual = () => (acts.length ? acts[acts.length - 1].hora_fin_plan : horaSalida);
  const agregarViaje = (o, d) => { if (o && d && o !== d) acts.push(nuevaAct('VIAJE', o, d, 'SOLO_VIAJE', 0, `Viaje a ${nom(d)}`, finActual(), minViaje(o, d))); };
  const faltaLugar = (a) => { const l = lug(a.destino_ubicacion_id), o = lug(a.origen_ubicacion_id); return !l || l.lat == null || !o || o.lat == null; };

  const selLugar = (id, val, extraOpt = '— Elija un lugar —') => `<div class="lugar-sel"><select id="${id}" data-lugar>${opts(lugares, val, (u) => u.id, (u) => u.nombre + (u.lat == null ? '  (⚠ sin ubicar)' : ''), extraOpt)}</select><button type="button" class="btn sm" data-nuevolugar="${id}">＋ Nuevo lugar (Google Maps)</button></div>`;
  async function recargarLugares() { lugares = await api('GET', '/ubicaciones'); }
  function enlazarLugares(m) {
    m.querySelectorAll('[data-nuevolugar]').forEach((b) => (b.onclick = () => formLugar(null, async (nuevoId) => {
      await recargarLugares();
      m.querySelectorAll('select[data-lugar]').forEach((s) => { const v = s.id === b.dataset.nuevolugar ? nuevoId : s.value; s.innerHTML = opts(lugares, v, (u) => u.id, (u) => u.nombre + (u.lat == null ? '  (⚠ sin ubicar)' : ''), '— Elija un lugar —'); });
    })));
  }
  async function asegurarLugar(s, pre) {
    if (s[pre + '_ubicacion_id']) return s[pre + '_ubicacion_id'];
    const nombre = s[pre + '_direccion'] || `Punto ${pre === 'origen' ? 'de recojo' : 'de entrega'} del pedido #${s.numero}`;
    if (s[pre + '_lat'] != null) { const r = await api('POST', '/ubicaciones', { nombre, tipo: 'OTRO', direccion: s[pre + '_direccion'] || null, lat: s[pre + '_lat'], lon: s[pre + '_lon'] }); await recargarLugares(); return r.id; }
    return new Promise((res) => { toast(`El pedido #${s.numero} no tiene punto en el mapa: ubíquelo con Google Maps`); formLugar({ nombre, direccion: s[pre + '_direccion'] || '', tipo: 'OTRO', radio_geocerca_m: 150 }, async (id) => { await recargarLugares(); res(id); }, { exigirMapa: true, onCancel: () => res(null) }); });
  }

  // ----- agregar paradas (asistente) -----
  function elegirParada() {
    const libres = pend.filter((s) => !acts.some((a) => a.solicitud_id === s.id));
    ventana('¿Qué va a hacer el vehículo?', `<p class="mut sm" style="margin:0 0 8px">Elija una opción. El sistema agrega el viaje y calcula los horarios.</p><div class="grid">
      <button class="tile" data-k="carga"><span class="i">⬆️</span><div><b>Cargar</b><span>Recoger mercadería en un lugar</span></div></button>
      <button class="tile teal" data-k="descarga"><span class="i">⬇️</span><div><b>Descargar</b><span>Entregar mercadería en un lugar</span></div></button>
      <button class="tile purple" data-k="pedidos"><span class="i">🧾</span><div><b>Llevar pedidos aprobados</b><span>${libres.length ? libres.length + ' pedido(s) esperando' : 'No hay pedidos esperando'}</span></div></button>
      <button class="tile orange" data-k="viaje"><span class="i">🚚</span><div><b>Solo ir a un lugar</b><span>Viaje sin cargar ni descargar</span></div></button>
      <button class="tile rose" data-k="pausa"><span class="i">🍽️</span><div><b>Almuerzo / pausa</b><span>Tiempo sin operar</span></div></button>
      <button class="tile slate" data-k="fin"><span class="i">🏁</span><div><b>Entregar el vehículo</b><span>Fin del recorrido</span></div></button></div>`, (m, close) => m.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => { close(); b.dataset.k === 'pedidos' ? elegirPedidos() : formParada(b.dataset.k); })));
  }
  function formParada(k) {
    const cur = posActual(), titulo = { carga: '⬆️ Cargar', descarga: '⬇️ Descargar', viaje: '🚚 Solo ir a un lugar', pausa: '🍽️ Almuerzo / pausa', fin: '🏁 Entregar el vehículo' }[k];
    const aBordo = acts.length ? acts[acts.length - 1]._abordo : 0;
    ventana(titulo, `${cur ? `<div class="how" style="margin-top:4px">El vehículo está ahora en <b>${esc(nom(cur))}</b> y lleva <b>${kg(aBordo)}</b>.</div>` : seccion('📍', '¿Desde dónde sale el vehículo?', 'Punto de partida', selLugar('ps', state.ultimoPartida || ''))}
      ${k === 'pausa' ? '' : seccion(k === 'fin' ? '🏁' : '📍', k === 'carga' ? '¿Dónde carga?' : k === 'descarga' ? '¿Dónde descarga?' : k === 'fin' ? '¿Dónde deja el vehículo?' : '¿A qué lugar va?', 'Elija un lugar o agréguelo con su punto de Google Maps', selLugar('pl', cur && ['carga', 'descarga'].includes(k) ? cur : ''))}
      ${k === 'carga' ? seccion('⚖️', '¿Qué carga?', '', `<label>Material</label><input id="ma" placeholder="Ej.: Envases PEAD"><label class="req">Peso (kg)</label><input id="pe" type="number" min="0" step="any" inputmode="decimal"><div class="hint">Capacidad del vehículo: ${kg(it.capacidad_kg)}${aBordo ? ` · ya lleva ${kg(aBordo)}` : ''}</div>`) : ''}
      ${k === 'descarga' ? seccion('⚖️', '¿Cuánto descarga?', '', `<div class="seg"><label><input type="radio" name="dq" value="TODO" checked><span>Todo lo que lleva<small>${kg(aBordo)}</small></span></label><label><input type="radio" name="dq" value="PARTE"><span>Una cantidad<small>indicar kg</small></span></label></div><div id="dparte" hidden><label class="req">Peso a descargar (kg)</label><input id="pe" type="number" min="0" step="any" inputmode="decimal"></div><label>Material</label><input id="ma" placeholder="Opcional">`) : ''}
      ${['carga', 'descarga', 'pausa'].includes(k) ? seccion('⏱️', '¿Cuánto tiempo toma?', '', `<label>Duración (hh:mm o minutos)</label><input id="mn" value="${k === 'pausa' ? '01:00' : '00:30'}" placeholder="00:30">`) : ''}
      <div class="err" id="er"></div><div class="bar"><button class="btn" id="no">Cancelar</button><button class="btn pri lg" id="ok">Agregar al itinerario</button></div>`, (m, close) => {
      enlazarLugares(m); $('#no', m).onclick = close;
      m.querySelectorAll('input[name=dq]').forEach((r) => (r.onchange = () => ($('#dparte', m).hidden = m.querySelector('input[name=dq]:checked').value !== 'PARTE')));
      $('#ok', m).onclick = () => {
        const reglas = [...(cur ? [] : [['#ps', 'Elija desde dónde sale el vehículo']]), ...(k === 'pausa' ? [] : [['#pl', 'Elija el lugar']])]; let err = validar(m, reglas);
        const modo = k === 'descarga' ? m.querySelector('input[name=dq]:checked').value : null;
        if (!err && (k === 'carga' || modo === 'PARTE') && !(+$('#pe', m).value > 0)) { $('#pe', m).classList.add('invalid'); err = 'Indique el peso en kg'; }
        if (err) return ($('#er', m).textContent = err);
        const origen = cur || $('#ps', m).value, lugar = k === 'pausa' ? origen : $('#pl', m).value; if (!cur) state.ultimoPartida = origen;
        if (k === 'viaje' && origen === lugar) return ($('#er', m).textContent = 'El vehículo ya está en ese lugar. Elija otro destino.');
        const min = Math.max(5, parseDur($('#mn', m)?.value) ?? 30), mat = $('#ma', m)?.value.trim(), antes = acts.length; agregarViaje(origen, lugar);
        if (k === 'carga') acts.push(nuevaAct('CARGA', lugar, lugar, 'CARGA', +$('#pe', m).value, `Cargar${mat ? ' ' + mat : ''} en ${nom(lugar)}`, finActual(), min));
        else if (k === 'descarga') acts.push(nuevaAct('DESCARGA', lugar, lugar, modo === 'TODO' ? 'DESCARGA_TOTAL' : 'DESCARGA', modo === 'TODO' ? 0 : +$('#pe', m).value, `Descargar${mat ? ' ' + mat : ''} en ${nom(lugar)}`, finActual(), min));
        else if (k === 'pausa') acts.push(nuevaAct('ESPERA', lugar, lugar, 'SOLO_VIAJE', 0, 'Almuerzo / pausa', finActual(), min));
        else if (k === 'fin') { if (acts.length > antes) { const v = acts[acts.length - 1]; v.tipo = 'ENTREGA_VEHICULO'; v.actividad = `Entregar el vehículo en ${nom(lugar)}`; } else acts.push(nuevaAct('ENTREGA_VEHICULO', lugar, lugar, 'SOLO_VIAJE', 0, `Entregar el vehículo en ${nom(lugar)}`, finActual(), 10)); }
        close(); recalcular(); draw({ ok: 'Parada agregada.' });
      };
    });
  }
  function elegirPedidos() {
    const libres = pend.filter((s) => !acts.some((a) => a.solicitud_id === s.id));
    if (!libres.length) return toast('No hay pedidos aprobados pendientes. Apruebe uno en “Solicitudes”.');
    const cur = posActual();
    ventana('🧾 Llevar pedidos aprobados', `<p class="mut sm" style="margin:0 0 8px">Marque los pedidos. El sistema agrega: ir al origen, cargar, viajar y descargar en el destino.</p>
      ${cur ? '' : seccion('📍', '¿Desde dónde sale el vehículo?', '', selLugar('ps', state.ultimoPartida || ''))}
      ${libres.map((s) => `<label class="item nohover" style="display:block;cursor:pointer"><div class="h"><input type="checkbox" data-s="${s.id}" checked style="width:22px;height:22px"><b>#${s.numero}</b><b>${esc(s.material || s.descripcion || 'Sin descripción')}</b><span class="sp"></span>${s.prioridad !== 'NORMAL' ? tag(s.prioridad) : ''}</div>
        <div class="m">⚖️ ${kg(s.peso_kg)} · 📍 ${esc(s.origen_nombre || s.origen_direccion || 'punto GPS')} → ${esc(s.destino_nombre || s.destino_direccion || 'punto GPS')} · 📅 ${esc(s.fecha_requerida)}</div></label>`).join('')}
      <div class="err" id="er"></div><div class="bar"><button class="btn" id="no">Cancelar</button><button class="btn pri lg" id="ok">Agregar al itinerario</button></div>`, (m, close) => {
      enlazarLugares(m); $('#no', m).onclick = close;
      $('#ok', m).onclick = async () => {
        const marcados = libres.filter((s) => m.querySelector(`[data-s="${s.id}"]`).checked);
        if (!marcados.length) return ($('#er', m).textContent = 'Marque al menos un pedido');
        if (!cur && !$('#ps', m).value) { $('#ps', m).classList.add('invalid'); return ($('#er', m).textContent = 'Elija desde dónde sale el vehículo'); }
        $('#ok', m).disabled = true; $('#er', m).textContent = 'Preparando los lugares…';
        try {
          let pos = cur || $('#ps', m).value; if (!cur) state.ultimoPartida = pos;
          for (const s of marcados) {
            const o = await asegurarLugar(s, 'origen'), d = await asegurarLugar(s, 'destino');
            if (!o || !d) { $('#er', m).textContent = `Falta ubicar el pedido #${s.numero}.`; $('#ok', m).disabled = false; return; }
            if (pos !== o) acts.push(nuevaAct('VIAJE', pos, o, 'SOLO_VIAJE', 0, `Viaje a ${nom(o)}`, finActual(), minViaje(pos, o)));
            acts.push(nuevaAct('RECOJO', o, o, 'CARGA', +s.peso_kg || 0, `Cargar pedido #${s.numero}: ${s.material || s.descripcion || ''}`.trim(), finActual(), 30, { solicitud_id: s.id, prioridad: s.prioridad, tipo_logistica: s.tipo_logistica, comentarios: `Pedido #${s.numero}` }));
            acts.push(nuevaAct('VIAJE', o, d, 'SOLO_VIAJE', 0, `Viaje a ${nom(d)}`, finActual(), minViaje(o, d)));
            acts.push(nuevaAct('ENTREGA', d, d, 'DESCARGA', +s.peso_kg || 0, `Entregar pedido #${s.numero}`, finActual(), 30, { solicitud_id: s.id, prioridad: s.prioridad, tipo_logistica: s.tipo_logistica, comentarios: `Pedido #${s.numero}` }));
            pos = d;
          }
          close(); recalcular(); draw({ ok: `${marcados.length} pedido(s) agregado(s).` });
        } catch (e) { $('#er', m).textContent = e.message; $('#ok', m).disabled = false; }
      };
    });
  }
  function editarParada(i) {
    const a = acts[i], viaje = esViaje(a), ct = tipoCarga(a);
    ventana(`Editar parada ${i + 1}`, `${viaje ? `<label class="req">Va a</label>${selLugar('ed', a.destino_ubicacion_id)}` : `<label class="req">Lugar</label>${selLugar('ed', a.destino_ubicacion_id)}
      <label>¿Qué hace el vehículo aquí?</label><select id="ct">${Object.entries(CARGA_TXT).map(([k, t]) => `<option value="${k}" ${k === ct ? 'selected' : ''}>${t}</option>`).join('')}</select><div id="cq" ${['CARGA', 'DESCARGA'].includes(ct) ? '' : 'hidden'}><label class="req">Peso (kg)</label><input id="pe" type="number" min="0" step="any" value="${esc(a.mag || '')}" inputmode="decimal"></div>`}
      <label>Descripción</label><input id="de" value="${esc(a.actividad)}"><div class="grid2"><div><label>Hora de inicio</label><input id="hi" type="time" value="${esc(a.hora_inicio_plan)}"></div><div><label>Duración (hh:mm)</label><input id="du" value="${durTxt(minutos(a))}"></div></div>
      <label>Comentario para el chofer</label><input id="co" value="${esc(a.comentarios || '')}"><div class="err" id="er"></div><div class="bar"><button class="btn" id="no">Cancelar</button><button class="btn pri lg" id="ok">Guardar cambios</button></div>`, (m, close) => {
      enlazarLugares(m); $('#no', m).onclick = close;
      if ($('#ct', m)) $('#ct', m).onchange = () => ($('#cq', m).hidden = !['CARGA', 'DESCARGA'].includes($('#ct', m).value));
      $('#ok', m).onclick = () => {
        const err = validar(m, [['#ed', 'Elija el lugar']]); if (err) return ($('#er', m).textContent = err);
        if (!viaje) { a.carga_tipo = $('#ct', m).value; a.mag = +$('#pe', m).value || 0; }
        a.destino_ubicacion_id = $('#ed', m).value; a.actividad = $('#de', m).value.trim() || a.actividad; a.comentarios = $('#co', m).value;
        const min = Math.max(5, parseDur($('#du', m).value) ?? 30); a.hora_inicio_plan = $('#hi', m).value || a.hora_inicio_plan; a.hora_fin_plan = fmt(Math.min((hm(a.hora_inicio_plan) ?? 0) + min, 1439));
        encadenar(i + 1); close(); recalcular(); draw();
      };
    });
  }

  // ----- herramientas: pegar desde Excel, copiar otro día, ruta en mapa -----
  function pegarExcel() {
    ventana('📥 Pegar desde Excel', `<p class="mut sm" style="margin:0 0 6px">Copie las filas de su Excel (columnas: <b>N, Inicio, Fin, Duración, Comentarios</b>) y péguelas aquí. El sistema reconoce qué hace cada fila (viaje, carguío, descarga, almuerzo…) y el lugar por su nombre.</p>
      <textarea id="tx" rows="9" placeholder="1&#9;08:00&#9;08:15&#9;00:15&#9;Llegada, validación vehículo y salida al pilat&#10;2&#9;08:15&#9;08:35&#9;00:20&#9;Recojo botellas de pet 1L&#10;3&#9;08:35&#9;09:10&#9;00:35&#9;Rumbo pilat"></textarea>
      ${acts.length ? '<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="rep" checked> Reemplazar las filas actuales</label>' : ''}<div id="vp"></div><div class="err" id="er"></div>
      <div class="bar"><button class="btn" id="no">Cancelar</button><button class="btn" id="an">🔍 Analizar</button><button class="btn pri lg" id="ok">Importar a la tabla</button></div>`, (m, close) => {
      $('#no', m).onclick = close;
      const analizar = () => {
        const pos0 = acts.length && !$('#rep', m)?.checked ? posActual() : null, r = analizarExcel($('#tx', m).value, lugares, pos0);
        if (!r.length) { $('#vp', m).innerHTML = ''; $('#er', m).textContent = 'No encontré filas con hora de inicio y fin. Copie desde Excel las columnas Inicio y Fin (y el comentario).'; return null; }
        $('#er', m).textContent = ''; $('#vp', m).innerHTML = `<div class="scroll"><table><tr><th>Inicio</th><th>Fin</th><th>Qué hace</th><th>Lugar</th><th>Kg</th><th>Texto</th></tr>${r.map((a) => `<tr class="${!a.destino_ubicacion_id ? 'over' : ''}"><td>${a.hora_inicio_plan}</td><td>${a.hora_fin_plan}</td><td>${esc((RT.find((x) => x[0] === rtDe(a)) || [0, ''])[1])}</td><td>${a.destino_ubicacion_id ? esc(nom(a.destino_ubicacion_id)) : '<b>⚠ elegir</b>'}</td><td>${a.mag || ''}</td><td class="sm">${esc(a.actividad)}</td></tr>`).join('')}</table></div><div class="hint">Las filas en rojo no tienen lugar: elíjalo en la tabla después de importar.</div>`;
        return r;
      };
      $('#an', m).onclick = analizar;
      $('#ok', m).onclick = () => { const r = analizar(); if (!r) return; if (!acts.length || $('#rep', m)?.checked) acts = r; else acts.push(...r); close(); recalcular(); horaSalida = acts[0]?.hora_inicio_plan || horaSalida; cadena = false; state.cadena = false; draw({ ok: `${r.length} fila(s) importada(s). Revise los lugares marcados en rojo.` }); };
    });
  }
  async function copiarOtroDia() {
    const todos = (await api('GET', '/itinerarios')).filter((x) => x.id !== it.id).slice(0, 25);
    if (!todos.length) return toast('Todavía no hay otros itinerarios para copiar.');
    ventana('📋 Copiar el itinerario de otro día', `<p class="mut sm" style="margin:0 0 8px">Toque el día que quiere repetir. Se copian paradas, horarios, lugares y cargas (los pedidos no, porque son de cada día).</p>${todos.map((x) => `<button class="item" data-c="${x.id}"><div class="h"><b>${esc(x.fecha)}</b><span>🚚 ${esc(x.vehiculo_codigo)} · ${esc(x.chofer_nombre)}</span><span class="sp"></span>${tag(x.estado)}</div></button>`).join('')}`, (m, close) => m.querySelectorAll('[data-c]').forEach((b) => (b.onclick = async () => {
      const src = await api('GET', '/itinerarios/' + b.dataset.c); close();
      acts = src.actividades.map((a) => ({ ...a, id: undefined, solicitud_id: null, comentarios: a.comentarios && /^Pedido #/.test(a.comentarios) ? '' : a.comentarios, mag: Math.abs(a.peso_kg || 0) })); horaSalida = acts[0]?.hora_inicio_plan || horaSalida;
      await recargarLugares(); recalcular(); draw({ ok: `Copiado de ${src.fecha} (${acts.length} filas). Ajuste lo que cambie y guarde.` });
    })));
  }
  function rutaMapa() {   // borrador de la ruta: puntos numerados en el mapa y enlace a Google Maps antes de aprobar
    recalcular(); const paradas = [];
    acts.forEach((a, i) => { const add = (id, hora) => { const l = lug(id); if (!l || l.lat == null) return; const u = paradas[paradas.length - 1]; if (u && u.id === id) { u.filas.push(i + 1); return; } paradas.push({ id, nombre: l.nombre, lat: l.lat, lon: l.lon, hora, filas: [i + 1] }); }; if (i === 0) add(a.origen_ubicacion_id, a.hora_inicio_plan); add(a.destino_ubicacion_id, esViaje(a) ? a.hora_fin_plan : a.hora_inicio_plan); });
    const sinMapa = [...new Set(acts.filter(faltaLugar).map((a, k) => acts.indexOf(a) + 1))];
    if (!paradas.length) return toast('Aún no hay lugares ubicados en el mapa para dibujar la ruta.');
    let km = 0; for (let i = 1; i < paradas.length; i++) km += kmEntre(paradas[i - 1].id, paradas[i].id);
    const tramos = []; for (let i = 0; i < paradas.length - 1; i += 9) tramos.push(paradas.slice(i, i + 10));
    const enlace = (t) => `https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=${t[0].lat},${t[0].lon}&destination=${t[t.length - 1].lat},${t[t.length - 1].lon}${t.length > 2 ? '&waypoints=' + encodeURIComponent(t.slice(1, -1).map((p) => `${p.lat},${p.lon}`).join('|')) : ''}`;
    ventana('🗺️ Ruta del itinerario (borrador)', `<p class="mut" style="margin:0 0 6px">${paradas.length} puntos · unos <b>${km.toFixed(0)} km</b> · ~${Math.max(1, Math.round(km / 30))} h de manejo (estimado)</p>${sinMapa.length ? `<div class="alert">⚠️ Las filas ${sinMapa.join(', ')} no tienen un lugar ubicado en el mapa.</div>` : ''}
      <div id="rbmap" class="map" style="height:300px"></div>
      <div class="row">${tramos.map((t, i) => `<button class="btn pri" data-gm="${i}">🧭 Ver en Google Maps${tramos.length > 1 ? ` (tramo ${i + 1}/${tramos.length})` : ''}</button>`).join('')}</div><div class="hint">Google Maps muestra la ruta real por calles; los puntos son los de este itinerario.</div>
      ${paradas.map((p, i) => `<div class="act"><span class="tag NORMAL">${i + 1}</span> <b>${esc(p.nombre)}</b> <span class="mut">${esc(p.hora || '')} · filas ${p.filas.join(', ')}</span></div>`).join('')}`, (m) => {
      m.querySelectorAll('[data-gm]').forEach((b) => (b.onclick = () => abrirExterno(enlace(tramos[+b.dataset.gm]))));
      setTimeout(() => { const mapa = crearMapa('rbmap', [paradas[0].lat, paradas[0].lon], 12); L.polyline(paradas.map((p) => [p.lat, p.lon]), { color: '#2563eb', weight: 4, dashArray: '8 6' }).addTo(mapa); paradas.forEach((p, i) => L.marker([p.lat, p.lon], { icon: pinIcono(i + 1, i === 0 ? 'ok' : i === paradas.length - 1 ? 'now' : '') }).bindPopup(`<b>${i + 1}. ${esc(p.nombre)}</b><br>${esc(p.hora || '')}`).addTo(mapa)); const aj = () => { mapa.invalidateSize(); mapa.fitBounds(paradas.map((p) => [p.lat, p.lon]), { padding: [30, 30], maxZoom: 15 }); }; aj(); setTimeout(aj, 450); }, 60);
    });
  }

  // ----- dibujo -----
  const ICONO = { VIAJE: '🚚', CARGA: '⬆️', DESCARGA: '⬇️', RECOJO: '⬆️', ENTREGA: '⬇️', ENTREGA_VEHICULO: '🏁', ESPERA: '🍽️', OTRO: '📌' };
  const lineaTitulo = (a) => { const ct = tipoCarga(a); if (esViaje(a)) return `${a.tipo === 'ENTREGA_VEHICULO' ? '🏁 Entregar el vehículo' : '🚚 Viaje'}: <b>${esc(nom(a.origen_ubicacion_id))}</b> → <b>${esc(nom(a.destino_ubicacion_id))}</b>`; if (a.tipo === 'ESPERA') return '🍽️ Almuerzo / pausa'; return `${ct === 'CARGA' ? '⬆️ Cargar' : ct === 'SOLO_VIAJE' ? '📌 Tarea' : '⬇️ Descargar'}${ct === 'CARGA' || ct === 'DESCARGA' ? ' ' + kg(a.mag) : ct === 'DESCARGA_TOTAL' ? ` todo (${kg(a.mag)})` : ''} en <b>${esc(nom(a.destino_ubicacion_id))}</b>`; };
  const resumenHoras = () => { const por = (f) => acts.filter(f).reduce((t, a) => t + minutos(a), 0), ini = hm(acts[0]?.hora_inicio_plan), fin = hm(acts[acts.length - 1]?.hora_fin_plan); return acts.length && ini != null && fin != null ? `Jornada ${acts[0].hora_inicio_plan}–${acts[acts.length - 1].hora_fin_plan} (${durTxt(fin - ini)} h) · manejo ${durTxt(por(esViaje))} · carga/descarga ${durTxt(por((a) => !esViaje(a) && a.tipo !== 'ESPERA' && a.tipo !== 'OTRO'))} · pausas ${durTxt(por((a) => a.tipo === 'ESPERA'))}` : ''; };
  const SEM_E = { VERDE: '🟢', AMARILLO: '🟡', ROJO: '🔴' };
  const real = (i) => ej?.actividades?.[i];
  const draw = (msgs = {}) => {
    recalcular();
    const pico = Math.max(0, ...acts.map((a) => a._abordo)), cap = it.capacidad_kg, libres = pend.filter((s) => !acts.some((a) => a.solicitud_id === s.id)), conReal = !!ej?.jornada;
    const tarjeta = (a, i) => { const sobre = a._abordo > cap, pct = Math.max(0, Math.min(100, (100 * a._abordo) / cap)), km = esViaje(a) ? kmEntre(a.origen_ubicacion_id, a.destino_ubicacion_id) : 0, r = real(i);
      return `<div class="parada ${sobre || faltaLugar(a) ? 'sobre' : ''}"><div class="pl"><b>${esc(a.hora_inicio_plan)}</b><i>${ICONO[a.tipo] || '📌'}</i><span>${minutos(a)} min</span></div>
        <div class="pc"><div class="pt">${lineaTitulo(a)}</div>${a.actividad && !esViaje(a) && !/^(Cargar|Descargar|Entregar)/.test(a.actividad) ? `<div class="m">${esc(a.actividad)}</div>` : ''}${a.comentarios ? `<div class="m">📝 ${esc(a.comentarios)}</div>` : ''}${km ? `<div class="m">≈ ${km.toFixed(1)} km (estimado)</div>` : ''}${r?.fin_real ? `<div class="m">✅ Real: ${hora(r.inicio_real)}–${hora(r.fin_real)} ${SEM_E[r.semaforo] || ''} ${r.desv_fin_min > 0 ? '+' : ''}${r.desv_fin_min ?? ''} min</div>` : ''}
          <div class="carga"><span class="bar2"><i style="width:${pct}%"></i></span><b>${kg(a._abordo)}</b> a bordo de ${kg(cap)}</div>
          ${faltaLugar(a) ? '<div class="aviso">📍 Falta un lugar ubicado en el mapa.</div>' : ''}${sobre ? `<div class="aviso">⚠️ Aquí lleva ${kg(a._abordo)} y el vehículo admite ${kg(cap)}. ${edit ? `<button class="btn sm warn" data-antes="${i}">⬇️ Descargar todo antes de esta parada</button>` : ''}</div>` : ''}</div>
        ${edit ? `<div class="pa"><button class="btn sm" data-ed="${i}" aria-label="Editar">✏️</button><button class="btn sm" data-up="${i}" aria-label="Subir">↑</button><button class="btn sm" data-dn="${i}" aria-label="Bajar">↓</button><button class="btn sm bad" data-rm="${i}" aria-label="Quitar">✕</button></div>` : ''}</div>`; };
    const optsLugar = (val) => `<option value="">— elegir —</option>${lugares.map((u) => `<option value="${u.id}" ${u.id === val ? 'selected' : ''}>${esc(u.nombre)}${u.lat == null ? ' (sin ubicar)' : ''}</option>`).join('')}${edit ? '<option value="__nuevo__">＋ Nuevo lugar (Google Maps)…</option>' : ''}`;
    const fila = (a, i) => { const rt = rtDe(a), sobre = a._abordo > cap, r = real(i), viaje = esViaje(a);
      const celdaLugar = viaje ? `<div class="sm mut">desde ${esc(i === 0 && edit ? '' : nom(a.origen_ubicacion_id))}</div>${i === 0 && edit ? `<select data-f="origen_ubicacion_id" data-i="${i}">${optsLugar(a.origen_ubicacion_id)}</select><div class="sm mut">hacia</div>` : ''}<select data-f="destino_ubicacion_id" data-i="${i}" ${edit ? '' : 'disabled'}>${optsLugar(a.destino_ubicacion_id)}</select>` : `<select data-f="destino_ubicacion_id" data-i="${i}" ${edit ? '' : 'disabled'}>${optsLugar(a.destino_ubicacion_id)}</select>`;
      return `<tr class="${sobre || faltaLugar(a) ? 'over' : ''}"><td>${i + 1}</td>
        <td><input type="time" data-f="hora_inicio_plan" data-i="${i}" value="${esc(a.hora_inicio_plan)}" ${edit ? '' : 'disabled'}></td><td><input type="time" data-f="hora_fin_plan" data-i="${i}" value="${esc(a.hora_fin_plan)}" ${edit ? '' : 'disabled'}></td>
        <td><input data-f="dur" data-i="${i}" value="${durTxt(minutos(a))}" style="width:68px" ${edit ? '' : 'disabled'}></td>
        <td><select data-f="rt" data-i="${i}" ${edit ? '' : 'disabled'}>${RT.map(([k, t]) => `<option value="${k}" ${k === rt ? 'selected' : ''}>${t}</option>`).join('')}</select></td><td>${celdaLugar}</td>
        <td>${['CARGA', 'DESCARGA', 'OTRO'].includes(rt) ? `<input type="number" data-f="mag" data-i="${i}" value="${esc(a.mag || '')}" placeholder="kg" style="width:84px" step="any" inputmode="decimal" ${edit ? '' : 'disabled'}>` : rt === 'DESCARGA_TOTAL' ? `<span class="mut">${Math.round(a.mag)}</span>` : ''}</td>
        <td><input data-f="actividad" data-i="${i}" value="${esc(a.actividad)}" placeholder="Descripción" ${edit ? '' : 'disabled'}></td><td class="${sobre ? 'err' : ''}" style="white-space:nowrap">${Math.round(a._abordo)}</td>
        ${conReal ? `<td class="sm">${r?.fin_real ? `${hora(r.inicio_real)}–${hora(r.fin_real)}<br>${SEM_E[r.semaforo] || ''} ${r.desv_fin_min > 0 ? '+' : ''}${r.desv_fin_min}` : r?.ej_estado && r.ej_estado !== 'PENDIENTE' ? esc(ESTADO_TXT[r.ej_estado] || r.ej_estado) : '—'}</td>` : ''}
        ${edit ? `<td style="white-space:nowrap"><button class="btn sm" data-up="${i}" aria-label="Subir">↑</button> <button class="btn sm" data-dn="${i}" aria-label="Bajar">↓</button> <button class="btn sm" data-ins="${i}" title="Insertar fila debajo">＋</button> <button class="btn sm bad" data-rm="${i}" aria-label="Quitar">✕</button></td>` : ''}</tr>`; };
    const tabla = `<div class="scroll"><table class="ruteo"><tr><th>N</th><th>Inicio</th><th>Fin</th><th>Duración (h)</th><th>Qué hace</th><th>Lugar</th><th>Kg</th><th>Descripción</th><th>A bordo kg</th>${conReal ? '<th>Real</th>' : ''}${edit ? '<th></th>' : ''}</tr>${acts.map(fila).join('') || `<tr><td colspan="11" class="mut">Aún no hay filas. Use “＋ Agregar fila”, “📥 Pegar desde Excel” o “📋 Copiar de otro día”.</td></tr>`}</table></div><div class="hint">⚖️ Para indicar la carga: elija “Cargar” o “Descargar” en <b>Qué hace</b> y escriba los kg en la columna <b>Kg</b>. Las filas de “Viaje” no llevan kg: la carga viaja con el vehículo.</div>`;
    box.innerHTML = `<div class="card"><div class="row"><h3 style="margin:0">🚚 ${esc(it.vehiculo_codigo)} · ${esc(it.chofer_nombre)}</h3>${tag(it.bloqueado ? 'PLANIFICADO' : 'BORRADOR')}<span class="mut sm">versión ${it.version_actual}</span><span class="sp"></span><span class="tag ${pico > cap ? 'bad' : 'ok'}">Máximo a bordo ${kg(pico)} / ${kg(cap)}</span></div>
      ${it.bloqueado ? `<div class="lock" style="margin-top:10px">🔒 <b>Plan aprobado y bloqueado.</b> El chofer ya puede verlo${conReal ? ' y abajo ve cómo va (columna Real)' : ''}.${puedeEditarPlan() ? ' <button class="btn sm" id="unl">Desbloquear para modificar (pide motivo)</button>' : ''}</div>` : ''}
      <div class="row" style="margin-top:10px"><div class="seg" style="min-width:210px"><label><input type="radio" name="vp" value="tabla" ${vista === 'tabla' ? 'checked' : ''}><span>📋 Tabla</span></label><label><input type="radio" name="vp" value="paradas" ${vista === 'paradas' ? 'checked' : ''}><span>🧭 Paradas</span></label></div>
        ${edit && acts.length ? `<label style="margin:0">Salida</label><input type="time" id="hsal" value="${esc(horaSalida)}" style="width:auto"><label style="margin:0;display:flex;gap:6px;align-items:center" title="Cada fila empieza cuando termina la anterior"><input type="checkbox" id="cad" ${cadena ? 'checked' : ''}> Encadenar horarios</label>` : ''}</div>
      ${resumenHoras() ? `<div class="mut sm" style="margin:8px 0">⏱️ ${esc(resumenHoras())}</div>` : ''}
      ${edit ? `<div class="row" style="margin:8px 0"><button class="btn pri" id="addf">＋ Agregar fila</button><button class="btn" id="add">🧭 Asistente de paradas</button>${libres.length ? `<button class="btn" id="ped">🧾 Pedidos aprobados (${libres.length})</button>` : ''}<button class="btn" id="xl">📥 Pegar desde Excel</button><button class="btn" id="cop">📋 Copiar de otro día</button></div>` : ''}
      <div style="margin-top:6px">${vista === 'tabla' ? tabla : acts.map(tarjeta).join('') || `<div class="empty"><span class="i">🧭</span><b>Aún no hay paradas</b><p>Toque “＋ Agregar fila” o use el asistente.</p></div>`}</div>
      ${(msgs.errores || []).map((e) => `<div class="err">✖ ${esc(e)}</div>`).join('')}${(msgs.advertencias || []).map((e) => `<div class="mut">⚠ ${esc(e)}</div>`).join('')}${msgs.ok ? `<div class="ok-t">${esc(msgs.ok)}</div>` : ''}
      <div class="row" style="margin-top:14px">${edit ? '<button class="btn lg" id="save">💾 Guardar borrador</button><button class="btn ok lg" id="apr">✅ Aprobar plan</button>' : ''}<button class="btn" id="rmap">🗺️ Ver ruta en el mapa</button><button class="btn" id="ver">🕘 Ver versiones</button></div><div id="vers"></div></div>`;
    box.querySelectorAll('input[name=vp]').forEach((r) => (r.onchange = () => { vista = state.vistaPlan = r.value; draw(); }));
    box.querySelectorAll('[data-ed]').forEach((b) => (b.onclick = () => editarParada(+b.dataset.ed)));
    box.querySelectorAll('[data-up]').forEach((b) => (b.onclick = () => { const i = +b.dataset.up; if (i > 0) { const t = acts[i - 1]; acts[i - 1] = acts[i]; acts[i] = t; const d1 = minutos(acts[i - 1]), d2 = minutos(acts[i]), h = acts[i - 1].hora_inicio_plan; if (cadena) { acts[i].hora_inicio_plan = acts[i - 1].hora_inicio_plan; } void d1; void d2; void h; reordenarHoras(i - 1); draw(); } }));
    box.querySelectorAll('[data-dn]').forEach((b) => (b.onclick = () => { const i = +b.dataset.dn; if (i < acts.length - 1) { const t = acts[i + 1]; acts[i + 1] = acts[i]; acts[i] = t; reordenarHoras(i); draw(); } }));
    box.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { const i = +b.dataset.rm; acts.splice(i, 1); if (acts.length && i === 0) acts[0].hora_inicio_plan = horaSalida; reordenarHoras(Math.max(0, i - 1)); draw(); }));
    box.querySelectorAll('[data-ins]').forEach((b) => (b.onclick = () => { const i = +b.dataset.ins, a = acts[i], n = nuevaAct('OTRO', a.destino_ubicacion_id, a.destino_ubicacion_id, 'SOLO_VIAJE', 0, '', a.hora_fin_plan, 30); acts.splice(i + 1, 0, n); encadenar(i + 2); draw(); }));
    box.querySelectorAll('[data-antes]').forEach((b) => (b.onclick = () => { const i = +b.dataset.antes, lugar = acts[i - 1]?.destino_ubicacion_id || acts[i].origen_ubicacion_id; acts.splice(i, 0, nuevaAct('DESCARGA', lugar, lugar, 'DESCARGA_TOTAL', 0, `Descargar todo en ${nom(lugar)}`, acts[i].hora_inicio_plan, 20)); encadenar(i + 1); draw({ ok: 'Se agregó una descarga total antes de esa parada.' }); }));
    // edición en la tabla (como en Excel): cada cambio recalcula horarios y carga a bordo
    box.querySelectorAll('[data-f]').forEach((el) => (el.onchange = async () => {
      const i = +el.dataset.i, f = el.dataset.f, a = acts[i], v = el.value;
      if (f === 'hora_inicio_plan') { const d = minutos(a); a.hora_inicio_plan = v; a.hora_fin_plan = fmt(Math.min((hm(v) ?? 0) + d, 1439)); if (i === 0) horaSalida = v; encadenar(i + 1); }
      else if (f === 'hora_fin_plan') { if ((hm(v) ?? 0) < (hm(a.hora_inicio_plan) ?? 0)) { toast('La hora de fin no puede ser antes del inicio.'); return draw(); } a.hora_fin_plan = v; encadenar(i + 1); }
      else if (f === 'dur') { const d = parseDur(v); if (d == null) { toast('Escriba la duración como 00:40 (horas:minutos) o en minutos.'); return draw(); } a.hora_fin_plan = fmt(Math.min((hm(a.hora_inicio_plan) ?? 0) + d, 1439)); encadenar(i + 1); }
      else if (f === 'rt') { const era = rtDe(a); aplicarRt(a, v); if (a.tipo === 'ESPERA' && !a.actividad) a.actividad = 'Almuerzo / pausa'; if (!esViaje(a) && esViaje({ tipo: ['VIAJE', 'ENTREGA_VEHICULO'].includes(era) ? era : '' })) a.destino_ubicacion_id = a.destino_ubicacion_id || a.origen_ubicacion_id; }
      else if (f === 'mag') { a.mag = +v || 0; if (rtDe(a) === 'OTRO' && a.mag > 0) aplicarRt(a, 'CARGA'); if (a.mag > 0 && /^Otra tarea|^Tarea/.test(a.actividad || '')) a.actividad = ''; }
      else if (['destino_ubicacion_id', 'origen_ubicacion_id'].includes(f)) {
        if (v === '__nuevo__') return formLugar(null, async (id) => { await recargarLugares(); a[f] = id; draw(); }, { exigirMapa: true, onCancel: () => draw() });
        a[f] = v || null; if (f === 'destino_ubicacion_id' && esViaje(a) && !/^Viaje a|^Entregar/.test(a.actividad || 'Viaje a')) { /* se respeta la descripción escrita */ } else if (f === 'destino_ubicacion_id' && esViaje(a) && v) a.actividad = (a.tipo === 'ENTREGA_VEHICULO' ? 'Entregar el vehículo en ' : 'Viaje a ') + nom(v);
      } else a[f] = v;
      draw();
    }));
    function reordenarHoras(desde) { if (!acts.length) return; if (cadena) { acts[0].hora_inicio_plan = horaSalida; acts[0].hora_fin_plan = fmt(Math.min((hm(horaSalida) ?? 0) + minutos(acts[0]), 1439)); encadenar(1); } }
    if ($('#hsal', box)) $('#hsal', box).onchange = (e) => { horaSalida = e.target.value; const d = minutos(acts[0]); acts[0].hora_inicio_plan = horaSalida; acts[0].hora_fin_plan = fmt(Math.min((hm(horaSalida) ?? 0) + d, 1439)); encadenar(1); draw(); };
    if ($('#cad', box)) $('#cad').onchange = (e) => { cadena = state.cadena = e.target.checked; if (cadena) encadenar(1); draw(); };
    if ($('#addf', box)) $('#addf', box).onclick = () => { const p = posActual() || null, ini = finActual(); acts.push(nuevaAct('CARGA', p, p, 'CARGA', 0, '', ini, 30)); draw(); box.querySelector('tr:last-child [data-f=rt]')?.focus(); };
    if ($('#add', box)) $('#add', box).onclick = elegirParada; if ($('#ped', box)) $('#ped', box).onclick = elegirPedidos; if ($('#xl', box)) $('#xl', box).onclick = pegarExcel; if ($('#cop', box)) $('#cop', box).onclick = copiarOtroDia;
    $('#rmap', box).onclick = rutaMapa;
    const guardar = async () => {
      recalcular(); const f = acts.findIndex((a) => !a.actividad?.trim());
      acts.forEach((a) => { if (!a.actividad?.trim()) a.actividad = esViaje(a) ? `Viaje a ${nom(a.destino_ubicacion_id)}` : a.tipo === 'ESPERA' ? 'Almuerzo / pausa' : `${(RT.find((x) => x[0] === rtDe(a)) || [0, 'Tarea'])[1].replace(/^\S+\s/, '')} en ${nom(a.destino_ubicacion_id)}`; }); void f;
      return api('PUT', `/itinerarios/${it.id}/actividades`, { actividades: acts.map(({ mag, _abordo, origen_nombre, destino_nombre, ...a }) => a) });
    };
    if ($('#save', box)) $('#save', box).onclick = async () => { try { const r = await guardar(); draw({ ok: '✅ Borrador guardado.', advertencias: r.advertencias }); } catch (e) { draw({ errores: e.detail?.errores || [e.message], advertencias: e.detail?.advertencias }); } };
    if ($('#apr', box)) $('#apr', box).onclick = async () => {
      try { await guardar(); } catch (e) { return draw({ errores: e.detail?.errores || [e.message], advertencias: e.detail?.advertencias }); }
      const aprobar = async (motivo) => { await api('POST', `/itinerarios/${it.id}/aprobar`, { motivo }); toast('✅ Plan aprobado: el chofer ya puede verlo'); render(); };
      if (it.aprobado_en) return pedirMotivo('Motivo del cambio al plan', aprobar);
      try { await aprobar(); } catch (e) { draw({ errores: e.detail?.errores || [e.message] }); }
    };
    if ($('#unl', box)) $('#unl', box).onclick = () => pedirMotivo('Desbloquear el plan para modificarlo', async (motivo) => { await api('POST', `/itinerarios/${it.id}/desbloquear`, { motivo }); render(); });
    $('#ver', box).onclick = async () => {
      const vs = await api('GET', `/itinerarios/${it.id}/versiones`);
      $('#vers', box).innerHTML = `<h3>Versiones del plan</h3>${vs.map((v) => `<details><summary>v${v.version} — ${esc(v.usuario)}, ${esc(new Date(v.creado_en).toLocaleString())} — ${esc(v.motivo)}</summary><table><tr><th>N°</th><th>Inicio</th><th>Fin</th><th>Actividad</th><th>Peso</th></tr>${v.snapshot.map((a) => `<tr><td>${a.numero}</td><td>${esc(a.hora_inicio_plan)}</td><td>${esc(a.hora_fin_plan)}</td><td>${esc(a.actividad)}</td><td>${esc(a.peso_kg)}</td></tr>`).join('')}</table></details>`).join('') || '<span class="mut">Aún sin versiones aprobadas.</span>'}`;
    };
  };
  draw();
}

// ---------- Seguimiento en vivo ----------
let mapSeg = null;
async function seguimientoView(m) {
  const fecha = state.segFecha || today(); state.segFecha = fecha;
  const [its, pos] = await Promise.all([api('GET', '/itinerarios?fecha=' + fecha), api('GET', '/flota/posiciones').catch(() => [])]);
  const aprob = its.filter((i) => i.estado !== 'BORRADOR' && i.estado !== 'CANCELADO');
  const det = await Promise.all(aprob.map((i) => api('GET', '/ejecucion/' + i.id).catch(() => null)));
  let hechas = 0, total = 0, rojos = 0, incid = 0;
  const tarjetas = aprob.map((i, k) => {
    const d = det[k]; if (!d) return '';
    const acts = d.actividades, ok = acts.filter((a) => a.ej_estado === 'FINALIZADA').length, cerr = acts.filter((a) => ['FINALIZADA', 'OMITIDA'].includes(a.ej_estado)).length;
    hechas += ok; total += acts.length; incid += d.incidencias.length;
    const sem = (c) => acts.filter((a) => a.semaforo === c).length; rojos += sem('ROJO');
    const actual = acts.find((a) => !['FINALIZADA', 'OMITIDA'].includes(a.ej_estado || 'PENDIENTE'));
    const p = pos.find((x) => x.jornada_id === d.jornada?.id), ult = p?.capturado_en || d.track[d.track.length - 1]?.t;
    const pct = acts.length ? Math.round((100 * cerr) / acts.length) : 0;
    const estadoTxt = !d.jornada ? '⏳ El chofer aún no inicia la jornada' : d.jornada.fin_en ? '🏁 Jornada terminada' : actual ? `Ahora: <b>${actual.numero}. ${esc(actual.actividad)}</b> (${esc(({ PENDIENTE: 'por iniciar', EN_VIAJE: 'en camino', LLEGO: 'llegó', EN_OPERACION: 'operando' })[actual.ej_estado || 'PENDIENTE'])})` : 'Sin actividades pendientes';
    return `<div class="item nohover ${d.jornada && !d.jornada.fin_en ? 'teal' : d.jornada ? 'ok' : 'gray'}"><div class="h"><span style="font-size:24px">🚚</span><b>${esc(i.vehiculo_codigo)}</b><span class="mut">${esc(i.chofer_nombre)}</span><span class="sp"></span>${tag(d.jornada ? (d.jornada.fin_en ? 'CERRADO' : 'EN_RUTA') : i.estado)}</div>
      <div class="m">${estadoTxt}</div><div class="prog" style="margin:8px 0 4px"><i style="width:${pct}%"></i></div><div class="m"><b>${ok}</b> de <b>${acts.length}</b> actividades hechas (${pct}%) · ${ult ? `📡 señal GPS ${esc(hace(ult))}` : 'sin señal GPS todavía'}</div>
      <div class="row" style="margin-top:8px"><span class="sem VERDE">🟢 ${sem('VERDE')} a tiempo</span><span class="sem AMARILLO">🟡 ${sem('AMARILLO')} retraso leve</span><span class="sem ROJO">🔴 ${sem('ROJO')} crítico</span>${d.incidencias.length ? `<span class="tag warn">⚠ ${d.incidencias.length} incidencia${d.incidencias.length > 1 ? 's' : ''}</span>` : ''}<span class="sp"></span><button class="btn sm pri" data-ver="${i.id}">Ver detalle: plan vs real →</button></div></div>`;
  }).join('');
  m.innerHTML = pageHead('seguimiento', `<input type="date" id="fd" value="${fecha}" style="width:auto"><button class="btn ${fecha === today() ? 'pri' : ''}" id="hoy">Hoy</button>`, `${esc(fechaLarga(fecha))} · se actualiza solo cuando los choferes registran avances.`)
    + (aprob.length ? `<div class="grid2" style="margin-bottom:14px"><div class="stat teal"><div class="n">${pos.length}</div><div class="l">Vehículos en ruta ahora</div></div><div class="stat"><div class="n">${hechas}<small style="font-size:15px;font-weight:600"> / ${total}</small></div><div class="l">Actividades hechas</div></div>
      <div class="stat ${rojos ? 'bad' : 'ok'}"><div class="n">${rojos}</div><div class="l">Retrasos críticos (+30 min)</div></div><div class="stat ${incid ? 'warn' : 'ok'}"><div class="n">${incid}</div><div class="l">Incidencias</div></div></div>
      <div class="card"><h3 style="margin-top:0">🗺️ Mapa en vivo</h3><div id="segmap" class="map" style="height:300px"></div><div class="hint">🚚 posición actual · 📍 destino de la actividad en curso</div></div>${tarjetas}`
      : vacio('📍', 'No hay itinerarios aprobados para este día', its.length ? 'Hay itinerarios en borrador: apruébelos en “Planificar el día”.' : 'Planifique el día y apruebe el itinerario para poder seguirlo aquí.', '<button class="btn pri" data-go="planificacion">Ir a planificar</button>'));
  $('#fd').onchange = (e) => { state.segFecha = e.target.value; render(); }; $('#hoy').onclick = () => { state.segFecha = today(); render(); };
  m.querySelectorAll('[data-ver]').forEach((b) => (b.onclick = () => { state.ejItin = b.dataset.ver; state.planFecha = fecha; state.view = 'ejecucion'; window.scrollTo(0, 0); render(); }));
  m.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => { state.view = b.dataset.go; render(); }));
  if ($('#segmap')) {
    const previo = mapSeg ? { c: mapSeg.getCenter(), z: mapSeg.getZoom() } : null;
    if (mapSeg) { mapSeg.remove(); mapSeg = null; }
    mapSeg = crearMapa('segmap');
    const pts = [];
    pos.forEach((f) => { L.marker([f.lat, f.lon], { icon: L.divIcon({ html: '<div style="font-size:30px;filter:drop-shadow(0 2px 3px #0006)">🚚</div>', className: '', iconSize: [34, 34], iconAnchor: [17, 17] }) }).bindPopup(`<b>${esc(f.codigo)}</b> · ${esc(f.chofer)}<br>señal ${esc(hace(f.capturado_en))}`).addTo(mapSeg); pts.push([f.lat, f.lon]); });
    det.forEach((d) => { if (!d) return; const a = d.actividades.find((x) => !['FINALIZADA', 'OMITIDA'].includes(x.ej_estado || 'PENDIENTE')); if (a?.destino_lat != null) { L.marker([a.destino_lat, a.destino_lon]).bindPopup(esc(a.actividad)).addTo(mapSeg); pts.push([a.destino_lat, a.destino_lon]); } });
    if (previo) mapSeg.setView(previo.c, previo.z); else if (pts.length) mapSeg.fitBounds(pts, { padding: [40, 40], maxZoom: 15 });
  }
}

// ---------- Indicadores (reportes) ----------
const PERIODOS = [['hoy', 'Hoy'], ['semana', 'Esta semana'], ['mes', 'Este mes'], ['mesant', 'Mes anterior'], ['custom', 'Elegir fechas']];
function rangoPeriodo(p, c) {
  const d = new Date(), iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  if (p === 'hoy') return [iso(d), iso(d)];
  if (p === 'semana') { const l = new Date(d); l.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return [iso(l), iso(d)]; }
  if (p === 'mes') return [iso(new Date(d.getFullYear(), d.getMonth(), 1)), iso(d)];
  if (p === 'mesant') return [iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)), iso(new Date(d.getFullYear(), d.getMonth(), 0))];
  return [c?.desde || iso(d), c?.hasta || iso(d)];
}
const CAUSA_TXT = { TRAFICO: 'Tráfico', AVERIA: 'Avería', ESPERA_CARGA: 'Espera para cargar', ESPERA_DESCARGA: 'Espera para descargar', FALTA_PRODUCTO: 'Falta de producto', FALTA_DOCUMENTACION: 'Falta de documentación', CLIENTE_NO_DISPONIBLE: 'Cliente no disponible', DIRECCION_INCORRECTA: 'Dirección incorrecta', CAMBIO_PRIORIDAD: 'Cambio de prioridad', SOLICITUD_URGENTE: 'Solicitud urgente', PROBLEMA_VEHICULO: 'Problema del vehículo', CLIMA: 'Clima', OTRO: 'Otro' };
async function reportesView(m) {
  const per = state.repPer || 'mes', [desde, hasta] = rangoPeriodo(per, state.repCustom);
  const r = await api('GET', `/reportes/resumen?desde=${desde}&hasta=${hasta}`), t = r.totales;
  const kpi = (cls, ico, titulo, valor, sub, extra = '') => `<div class="stat ${cls}"><div class="l" style="margin:0 0 4px">${ico} ${titulo}</div><div class="n">${valor}</div><div class="l">${sub}</div>${extra}</div>`;
  const cumpCls = t.cumplimiento == null ? '' : t.cumplimiento >= 90 ? 'ok' : t.cumplimiento >= 70 ? 'warn' : 'bad';
  const sol = r.solicitudes, maxC = Math.max(1, ...r.causas.map((c) => c.n));
  const tsv = ['Fecha\tVehículo\tChofer\tEstado\tPlanificadas\tEjecutadas\tCumplimiento %\tRetraso prom. (min)\tKm planificados\tKm reales', ...r.filas.map((f) => [f.fecha, f.vehiculo, f.chofer, f.estado, f.planificadas, f.ejecutadas, f.cumplimiento ?? '', f.retraso_prom ?? '', f.km_plan, f.km_real].join('\t'))].join('\n');
  m.innerHTML = pageHead('reportes', '<button class="btn" id="copiar">📋 Copiar para Excel</button><button class="btn" id="imp">🖨️ Imprimir</button>', `Del <b>${esc(desde)}</b> al <b>${esc(hasta)}</b>`)
    + `<div class="chips">${PERIODOS.map(([k, tx]) => `<button data-p="${k}" class="${k === per ? 'on' : ''}">${tx}</button>`).join('')}</div>`
    + (per === 'custom' ? `<div class="card flat row"><label style="margin:0">Desde</label><input type="date" id="d1" value="${desde}" style="width:auto"><label style="margin:0">Hasta</label><input type="date" id="d2" value="${hasta}" style="width:auto"><button class="btn pri" id="aplicar">Ver</button></div>` : '')
    + (!t.itinerarios ? vacio('📊', 'No hay datos en este período', 'Los indicadores aparecen cuando hay itinerarios aprobados y jornadas ejecutadas. Pruebe con otro período.') : `
    <div class="grid">
      ${kpi(cumpCls, '✅', 'Cumplimiento del plan', t.cumplimiento == null ? '—' : t.cumplimiento + '%', `${t.ejecutadas} de ${t.planificadas} actividades hechas`, `<div class="prog ${cumpCls === 'bad' ? 'bad' : ''}" style="margin-top:8px"><i style="width:${t.cumplimiento || 0}%"></i></div>`)}
      ${kpi(t.retraso_prom > 30 ? 'bad' : t.retraso_prom > 10 ? 'warn' : 'ok', '⏱️', 'Retraso promedio', t.retraso_prom == null ? '—' : t.retraso_prom + ' min', `🟢 ${t.semaforo.VERDE || 0} a tiempo · 🟡 ${t.semaforo.AMARILLO || 0} leve · 🔴 ${t.semaforo.ROJO || 0} crítico`)}
      ${kpi('teal', '🛣️', 'Kilómetros reales (GPS)', t.km_real, `Planificados (estim.): ${t.km_plan} km${t.eficiencia_ruta != null ? ` · eficiencia de ruta ${t.eficiencia_ruta}%` : ''}`)}
      ${kpi('purple', '⛽', 'Combustible', bs(t.combustible_bs), `${t.combustible_l} L en ${t.cargas} carga${t.cargas === 1 ? '' : 's'}${t.km_por_litro ? ` · ${t.km_por_litro} km/L` : ''}${t.bs_por_km ? ` · Bs ${t.bs_por_km}/km` : ''}`)}
      ${kpi('warn', '🔧', 'Mantenimiento', bs(t.mantenimiento_bs), `${t.mantenimientos} realizado${t.mantenimientos === 1 ? '' : 's'} · ${t.mantenimientos_pendientes} pendiente${t.mantenimientos_pendientes === 1 ? '' : 's'} ahora`)}
      ${kpi('', '⚠️', 'Incidencias', t.incidencias, `${t.con_retraso} causaron retraso`)}</div>
    <div class="grid" style="margin-top:14px"><div class="card"><h3 style="margin-top:0">📦 Solicitudes del período</h3><div class="row">${[['NUEVA', 'Nuevas'], ['APROBADA', 'Aprobadas'], ['PLANIFICADA', 'Planificadas'], ['EN_EJECUCION', 'En camino'], ['COMPLETADA', 'Completadas'], ['CANCELADA', 'Canceladas']].map(([k, tx]) => `<span class="tag ${k}">${tx}: ${sol[k] || 0}</span>`).join('')}</div></div>
      <div class="card"><h3 style="margin-top:0">¿Por qué hubo retrasos?</h3>${r.causas.map((c) => `<div style="margin:6px 0"><div class="row sm"><b>${esc(CAUSA_TXT[c.tipo] || c.tipo)}</b><span class="sp"></span>${c.n}×${c.minutos ? ` · ${c.minutos} min` : ''}</div><div class="prog"><i style="width:${Math.round((100 * c.n) / maxC)}%;background:var(--warn)"></i></div></div>`).join('') || '<span class="mut">Sin incidencias registradas.</span>'}</div></div>
    <div class="card scroll"><h3 style="margin-top:0">Detalle por itinerario</h3><table><tr><th>Fecha</th><th>Vehículo</th><th>Chofer</th><th>Estado</th><th>Hechas</th><th>Cumpl.</th><th>Retraso</th><th>Km real</th><th></th></tr>${r.filas.map((f) => `<tr><td>${esc(f.fecha)}</td><td>${esc(f.vehiculo)}</td><td>${esc(f.chofer)}</td><td>${tag(f.estado)}</td><td>${f.ejecutadas}/${f.planificadas}</td><td><b>${f.cumplimiento ?? '—'}${f.cumplimiento != null ? '%' : ''}</b></td><td>${f.retraso_prom ?? '—'}${f.retraso_prom != null ? ' min' : ''}</td><td>${f.km_real}</td><td><button class="btn sm" data-ver="${f.id}" data-f="${f.fecha}">Ver</button></td></tr>`).join('')}</table></div>`);
  m.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => { state.repPer = b.dataset.p; if (b.dataset.p === 'custom') state.repCustom = { desde, hasta }; render(); }));
  if ($('#aplicar')) $('#aplicar').onclick = () => { state.repCustom = { desde: $('#d1').value, hasta: $('#d2').value }; render(); };
  m.querySelectorAll('[data-ver]').forEach((b) => (b.onclick = () => { state.ejItin = b.dataset.ver; state.planFecha = b.dataset.f; state.view = 'ejecucion'; window.scrollTo(0, 0); render(); }));
  $('#imp').onclick = () => window.print();
  $('#copiar').onclick = async () => { try { await navigator.clipboard.writeText(tsv); toast('📋 Copiado. Péguelo en Excel o Google Sheets.'); } catch { toast('No se pudo copiar en este dispositivo'); } };
}

// ---------- Mantenimiento de vehículos + kardex ----------
const lineasHTML = (d) => (d || []).map((x) => `<div>${esc(x.cantidad)} × ${esc(x.descripcion)} <span class="mut">(${bs(x.costo)})</span></div>`).join('') || '<span class="mut">—</span>';

async function mantenimientoView(m) {
  const tab = state.mantTab || 'pend', puede = puedeEditarPlan();
  const [vehs, pend] = await Promise.all([api('GET', '/vehiculos'), api('GET', '/mantenimientos?estado=PENDIENTE')]);
  m.innerHTML = pageHead('mantenimiento', puede ? '<button class="btn pri lg" id="nuevo">＋ Nuevo mantenimiento</button>' : '') + `<div class="chips"><button class="${tab === 'pend' ? 'on' : ''}" data-tab="pend">⏳ Pendientes <b>${pend.length}</b></button><button class="${tab === 'kardex' ? 'on' : ''}" data-tab="kardex">📒 Kardex por vehículo</button></div><div id="mb"></div>`;
  m.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { state.mantTab = b.dataset.tab; render(); }));
  if ($('#nuevo')) $('#nuevo').onclick = () => mantNuevo(vehs);
  const box = $('#mb');
  if (tab === 'pend') {
    box.innerHTML = `<div class="card scroll"><table><tr><th>N°</th><th>Vehículo</th><th>Tipo</th><th>Qué se necesita</th><th>Prioridad</th><th>Programado</th><th>Pidió</th><th></th></tr>
      ${pend.map((x) => `<tr><td>${x.numero}</td><td>${esc(x.vehiculo_codigo)}<br><span class="mut">${esc(x.vehiculo_placa)}</span></td><td>${esc(x.tipo)}</td><td>${esc(x.descripcion)}${x.inmoviliza ? ' <span class="tag CRITICA">inmoviliza</span>' : ''}</td><td>${tag(x.prioridad)}</td>
      <td>${fechaCorta(x.fecha_programada)}${x.km_programado ? `<br><span class="mut">a los ${esc(x.km_programado)} km</span>` : ''}</td><td>${esc(x.solicitante)}<br><span class="mut">${fechaCorta(x.creado_en)}</span></td>
      <td style="white-space:nowrap">${puede ? `<button class="btn sm pri" data-cerrar="${x.id}">Registrar realizado</button> <button class="btn sm bad" data-cancel="${x.id}">Cancelar</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="mut">No hay mantenimientos pendientes.</td></tr>'}</table></div>`;
    box.querySelectorAll('[data-cerrar]').forEach((b) => (b.onclick = () => mantCerrar(pend.find((x) => x.id === b.dataset.cerrar))));
    box.querySelectorAll('[data-cancel]').forEach((b) => (b.onclick = async () => { const motivo = prompt('Motivo de la cancelación:'); if (!motivo) return; try { await api('POST', `/mantenimientos/${b.dataset.cancel}/cancelar`, { motivo }); render(); } catch (e) { alert(e.message); } }));
    return;
  }
  const vid = state.mantVeh && vehs.find((v) => v.id === state.mantVeh) ? state.mantVeh : vehs[0]?.id; state.mantVeh = vid;
  if (!vid) { box.innerHTML = '<div class="card mut">No hay vehículos registrados.</div>'; return; }
  const k = await api('GET', '/kardex/' + vid), r = k.resumen;
  const kv = (l, v) => `<div class="card" style="margin:0;padding:8px 12px"><div class="mut">${l}</div><b>${esc(v)}</b></div>`;
  box.innerHTML = `<div class="card"><div class="row"><label style="margin:0">Vehículo</label><select id="kv" style="width:auto">${vehs.map((v) => `<option value="${v.id}" ${v.id === vid ? 'selected' : ''}>${esc(v.codigo)} · ${esc(v.placa)}</option>`).join('')}</select>${tag(k.vehiculo.estado)}</div>
    <div class="grid2" style="margin-top:10px">${kv('Mantenimientos realizados', r.realizados)}${kv('Pendientes', r.pendientes)}${kv('Costo total', bs(r.total_bs))}${kv('Último mantenimiento', fechaCorta(r.ultimo))}${kv('Último odómetro', r.ultimo_odometro != null ? r.ultimo_odometro + ' km' : '—')}</div></div>
    ${k.pendientes.length ? `<div class="card"><h3 style="margin-top:0">Pendientes</h3>${k.pendientes.map((x) => `<div class="act">#${x.numero} ${tag(x.prioridad)} <b>${esc(x.tipo)}</b>: ${esc(x.descripcion)}</div>`).join('')}</div>` : ''}
    ${kardexMov(k.movimientos)}
    ${k.cancelados.length ? `<div class="card mut"><b>Cancelados:</b> ${k.cancelados.map((x) => `#${x.numero} ${esc(x.descripcion)} (${esc(x.motivo_cancelacion)})`).join(' · ')}</div>` : ''}`;
  $('#kv').onchange = (e) => { state.mantVeh = e.target.value; render(); };
}

function kardexMov(movs) {
  if (!movs.length) return '<div class="card mut">Aún no hay mantenimientos realizados para este vehículo.</div>';
  if (window.innerWidth < 700) {   // teléfono: una tarjeta por mantenimiento
    return '<div class="card"><h3 style="margin-top:0">Kardex (trabajos realizados)</h3>' + movs.map((x) => `<div class="act" style="display:block"><b>${fechaCorta(x.fecha_realizado)}</b> · #${x.numero} · ${esc(x.tipo)}${x.odometro_km != null ? ` · ${esc(x.odometro_km)} km` : ''}<div class="mut">Se necesitaba: ${esc(x.descripcion)}</div><div>Se hizo: ${esc(x.trabajo_realizado)}</div><div class="mut" style="margin-top:4px">Se colocó:</div>${lineasHTML(x.detalle)}<div style="margin-top:4px">${esc(x.proveedor || '')} · <b>${bs(x.total_bs)}</b></div>${x.observaciones ? `<div class="mut">${esc(x.observaciones)}</div>` : ''}</div>`).join('') + '</div>';
  }
  return `<div class="card scroll"><h3 style="margin-top:0">Kardex (trabajos realizados)</h3><table><tr><th>Fecha</th><th>Odómetro</th><th>Tipo</th><th>Qué se necesitaba</th><th>Qué se hizo</th><th>Qué se colocó</th><th>Taller / proveedor</th><th>Costo</th></tr>
    ${movs.map((x) => `<tr><td>${fechaCorta(x.fecha_realizado)}<br><span class="mut">#${x.numero}</span></td><td>${x.odometro_km != null ? esc(x.odometro_km) + ' km' : '—'}</td><td>${esc(x.tipo)}</td><td>${esc(x.descripcion)}</td><td>${esc(x.trabajo_realizado)}${x.observaciones ? `<br><span class="mut">${esc(x.observaciones)}</span>` : ''}</td><td>${lineasHTML(x.detalle)}</td><td>${esc(x.proveedor || '—')}<br><span class="mut">cerró: ${esc(x.cerrado_por_nombre || '')}</span></td><td><b>${bs(x.total_bs)}</b></td></tr>`).join('')}</table></div>`;
}

function mantNuevo(vehs) {
  modalWeb(`<h2>Nuevo mantenimiento</h2><label>Vehículo</label><select id="v">${vehs.map((v) => `<option value="${v.id}">${esc(v.codigo)} · ${esc(v.placa)}</option>`).join('')}</select>
    <div class="grid"><div><label>Tipo</label><select id="t"><option value="PREVENTIVO">Preventivo</option><option value="CORRECTIVO">Correctivo</option></select></div><div><label>Prioridad</label><select id="p"><option>NORMAL</option><option>URGENTE</option></select></div>
    <div><label>Fecha programada</label><input id="f" type="date"></div><div><label>Kilometraje programado</label><input id="k" type="number" min="0"></div></div>
    <label>Qué mantenimiento se necesita</label><textarea id="d" rows="3" placeholder="Ej.: Cambio de aceite y filtros"></textarea>
    <label style="margin-top:6px"><input type="checkbox" id="i" style="width:auto"> El vehículo no debe circular hasta repararlo (pasa a estado Mantenimiento)</label>
    <div class="err" id="e"></div><div class="row" style="margin-top:8px"><button class="btn pri" id="ok">Guardar</button><button class="btn" id="no">Cancelar</button></div>`, (m, close) => {
    $('#no', m).onclick = close;
    $('#ok', m).onclick = async () => {
      try { await api('POST', '/mantenimientos', { vehiculo_id: $('#v', m).value, tipo: $('#t', m).value, prioridad: $('#p', m).value, fecha_programada: $('#f', m).value || null, km_programado: $('#k', m).value, descripcion: $('#d', m).value, inmoviliza: $('#i', m).checked }); close(); state.mantTab = 'pend'; render(); }
      catch (e) { $('#e', m).textContent = e.message; }
    };
  });
}

function mantCerrar(x) {
  const hoyIso = today();
  modalWeb(`<h2>Registrar mantenimiento realizado</h2><div class="card" style="background:var(--bg)"><b>#${x.numero} · ${esc(x.vehiculo_codigo)}</b> — ${esc(x.tipo)}<br>${esc(x.descripcion)}</div>
    <div class="grid"><div><label>Fecha en que se hizo</label><input id="f" type="date" value="${hoyIso}"></div><div><label>Odómetro (km)</label><input id="o" type="number" min="0"></div><div><label>Taller / proveedor</label><input id="pv"></div></div>
    <label>Qué se hizo</label><textarea id="tr" rows="2" placeholder="Ej.: Cambio de pastillas y rectificado de discos"></textarea>
    <h3>Qué se colocó (repuestos / insumos / servicios)</h3><div id="ls"></div><button class="btn sm" id="mas" type="button">+ Agregar línea</button> <b style="float:right" id="tot"></b>
    <label>Observaciones</label><input id="ob"><div class="err" id="e"></div><div class="row" style="margin-top:8px"><button class="btn pri" id="ok">Cerrar y pasar al kardex</button><button class="btn" id="no">Cancelar</button></div>`, (m, close) => {
    const linea = () => { const d = document.createElement('div'); d.className = 'row'; d.style.marginBottom = '4px'; d.innerHTML = '<input class="ld" placeholder="Descripción" style="flex:3"><input class="lc" type="number" min="0" step="any" placeholder="Cant." style="flex:1"><input class="lp" type="number" min="0" step="any" placeholder="Costo Bs" style="flex:1"><button class="btn sm bad" type="button">✕</button>'; d.querySelector('button').onclick = () => { d.remove(); total(); }; d.oninput = total; $('#ls', m).appendChild(d); };
    const leer = () => [...m.querySelectorAll('#ls .row')].map((r) => ({ descripcion: r.querySelector('.ld').value, cantidad: r.querySelector('.lc').value, costo: r.querySelector('.lp').value }));
    const total = () => { $('#tot', m).textContent = 'Total: ' + bs(leer().reduce((t, l) => t + (l.descripcion.trim() ? (l.cantidad === '' ? 1 : +l.cantidad) * (+l.costo || 0) : 0), 0)); };
    linea(); total(); $('#mas', m).onclick = linea; $('#no', m).onclick = close;
    $('#ok', m).onclick = async () => {
      try { await api('POST', `/mantenimientos/${x.id}/cerrar`, { fecha_realizado: $('#f', m).value, odometro_km: $('#o', m).value, proveedor: $('#pv', m).value, trabajo_realizado: $('#tr', m).value, observaciones: $('#ob', m).value, detalle: leer() }); close(); state.mantTab = 'kardex'; state.mantVeh = x.vehiculo_id; render(); }
      catch (e) { $('#e', m).textContent = e.message; }
    };
  });
}

// ---------- Fase 2: Plan vs Real + mapa, y Combustible ----------
const SEM = { VERDE: '🟢', AMARILLO: '🟡', ROJO: '🔴' };
let mapEj = null;
async function ejecucionView(m) {
  const fecha = state.planFecha || today(); state.planFecha = fecha;
  const its = await api('GET', '/itinerarios?fecha=' + fecha);
  const sel = state.ejItin && its.find((i) => i.id === state.ejItin) ? state.ejItin : its[0]?.id; state.ejItin = sel;
  m.innerHTML = pageHead('ejecucion', `<input type="date" id="fd" value="${fecha}" style="width:auto"><button class="btn" id="hoy">Hoy</button>`, 'Compara lo planificado contra lo real. <span class="sem VERDE">🟢 0–10 min</span> <span class="sem AMARILLO">🟡 11–30 min</span> <span class="sem ROJO">🔴 más de 30 min de retraso</span>') + (its.length ? `<div class="chips">${its.map((i) => `<button class="${i.id === sel ? 'on' : ''}" data-it="${i.id}">🚚 ${esc(i.vehiculo_codigo)} · ${esc(i.chofer_nombre)} <b>${esc(ESTADO_TXT[i.estado] || i.estado)}</b></button>`).join('')}</div>` : vacio('📈', 'Sin itinerarios en esta fecha', 'Elija otro día o planifique uno en “Planificar el día”.')) + '<div id="ejb"></div>';
  $('#fd').onchange = (e) => { state.planFecha = e.target.value; state.ejItin = null; render(); };
  $('#hoy').onclick = () => { state.planFecha = today(); state.ejItin = null; render(); };
  m.querySelectorAll('[data-it]').forEach((b) => (b.onclick = () => { state.ejItin = b.dataset.it; render(); }));
  if (!sel) return;
  const [d, flota] = await Promise.all([api('GET', '/ejecucion/' + sel), api('GET', '/flota/posiciones')]);
  const j = d.jornada, r = j?.resumen;
  const kv = (l, v) => (v == null ? '' : `<div class="card" style="margin:0;padding:8px 12px"><div class="mut">${l}</div><b>${esc(v)}</b></div>`);
  $('#ejb').innerHTML = `<div class="card"><div class="row"><b>Jornada:</b> ${j ? `${hora(j.inicio_en)} → ${j.fin_en ? hora(j.fin_en) : 'en curso'}` : '<span class="mut">no iniciada</span>'}</div>
    ${r ? `<div class="grid" style="margin-top:8px">${kv('Ejecutadas / planificadas', `${r.actividades_ejecutadas} / ${r.actividades_planificadas}`)}${kv('Km planificados (est.)', r.km_planificados)}${kv('Km reales (GPS)', r.km_reales)}${kv('Tiempo plan / real (min)', `${r.tiempo_plan_min} / ${r.tiempo_real_min}`)}${kv('Retraso acumulado (min)', r.retraso_acumulado_min)}${kv('Combustible', `${r.combustible_l} L · Bs ${r.combustible_bs}`)}${kv('Incidencias', r.incidencias)}</div>` : ''}</div>
    <div class="card scroll"><table><tr><th>N°</th><th>Actividad</th><th>Plan inicio</th><th>Real inicio</th><th>Desv.</th><th>Plan fin</th><th>Real fin</th><th>Desv.</th><th></th><th>Km plan/real</th><th>Estado</th><th>Incidencias / fotos</th></tr>
    ${d.actividades.map((a) => `<tr data-a="${a.id}" style="cursor:pointer"><td>${a.numero}</td><td>${esc(a.actividad)}</td><td>${esc(a.hora_inicio_plan)}</td><td>${hora(a.inicio_real)}</td><td>${a.desv_inicio_min ?? ''}</td><td>${esc(a.hora_fin_plan)}</td><td>${hora(a.fin_real)}</td><td>${a.desv_fin_min ?? ''}</td><td>${SEM[a.semaforo] || ''}</td>
      <td>${a.distancia_plan_km ?? '—'} / ${a.distancia_real_km ?? '—'}</td><td>${esc(a.ej_estado || 'PENDIENTE')}${a.fuera_geocerca ? ` <span class="tag URGENTE">a ${Math.round(a.llegada_dist_punto_m)} m del punto</span>` : ''}${a.hora_confiable === 0 ? ' <span class="tag" title="Registrado sin conexión y sincronizado después">offline</span>' : ''}</td>
      <td>${a.incidencias.map((i) => `⚠ ${esc(i.tipo.replace(/_/g, ' '))}${i.comentario ? ': ' + esc(i.comentario) : ''}`).join('<br>')} ${a.fotos.map((f) => `<a href="#" data-foto="${f.id}">📷</a>`).join(' ')}</td></tr>`).join('')}</table>
    <div class="mut" style="margin-top:6px">Km planificados = línea recta × 1,3 (estimación hasta el ruteo real de la Fase 4). Los km reales salen del recorrido GPS.</div></div>
    <div class="card"><div id="ejmap" class="map" style="height:380px"></div><span class="mut">Azul: ruta planificada · Naranja: recorrido GPS real · 🚚 posición actual de vehículos en jornada</span></div>`;
  const previo = mapEj && state.ejMapaItin === sel ? { c: mapEj.getCenter(), z: mapEj.getZoom() } : null; state.ejMapaItin = sel;
  if (mapEj) { mapEj.remove(); mapEj = null; }
  mapEj = crearMapa('ejmap');
  const plan = []; d.actividades.forEach((a) => { if (a.origen_lat != null && !plan.length) plan.push([a.origen_lat, a.origen_lon]); if (a.destino_lat != null) { const p = [a.destino_lat, a.destino_lon]; const l = plan[plan.length - 1]; if (!l || l[0] !== p[0] || l[1] !== p[1]) plan.push(p); } });
  const todos = [];
  if (plan.length) { L.polyline(plan, { color: '#1d5fd1', weight: 4, dashArray: '8 6' }).addTo(mapEj); plan.forEach((p, i) => L.circleMarker(p, { radius: 6, color: '#1d5fd1', fillOpacity: 1 }).bindTooltip(String(i + 1)).addTo(mapEj)); todos.push(...plan); }
  if (d.track.length) { const t = d.track.map((p) => [p.lat, p.lon]); L.polyline(t, { color: '#f08a00', weight: 4 }).addTo(mapEj); todos.push(...t); }
  flota.forEach((f) => L.marker([f.lat, f.lon], { icon: L.divIcon({ html: '🚚', className: '', iconSize: [24, 24] }) }).bindPopup(`${esc(f.codigo)} · ${esc(f.chofer)}<br>${hora(f.capturado_en)}`).addTo(mapEj));
  if (previo) mapEj.setView(previo.c, previo.z); else if (todos.length) mapEj.fitBounds(todos, { padding: [30, 30] });
  $('#ejb').querySelectorAll('[data-foto]').forEach((l) => (l.onclick = async (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    const r = await fetch('/api/fotos/' + l.dataset.foto, { headers: { authorization: 'Bearer ' + state.token } });
    if (!r.ok) return alert('No se pudo cargar la foto');
    const u = URL.createObjectURL(await r.blob()), o = document.createElement('div');
    o.style.cssText = 'position:fixed;inset:0;background:#000d;z-index:99;display:flex;align-items:center;justify-content:center';
    o.innerHTML = '<img style="max-width:96%;max-height:96%">'; o.firstChild.src = u; o.onclick = () => { o.remove(); URL.revokeObjectURL(u); }; document.body.appendChild(o);
  }));
  $('#ejb').querySelectorAll('[data-a]').forEach((tr) => (tr.onclick = () => { const a = d.actividades.find((x) => x.id === tr.dataset.a); if (a.destino_lat != null) mapEj.setView([a.destino_lat, a.destino_lon], 15); }));
}
async function combustibleView(m) {
  const rows = await api('GET', '/combustible');
  const tot = rows.reduce((t, r) => ({ l: t.l + r.litros, bs: t.bs + r.total_bs }), { l: 0, bs: 0 });
  const puedeReg = puedeEditarPlan();
  m.innerHTML = pageHead('combustible', puedeReg ? '<button class="btn pri lg" id="nuevo">＋ Registrar carga</button>' : '') + `<div class="grid2" style="margin-bottom:14px"><div class="stat purple"><div class="n">${tot.l.toFixed(1)}</div><div class="l">Litros cargados</div></div><div class="stat"><div class="n">${bs(tot.bs)}</div><div class="l">Costo total</div></div><div class="stat teal"><div class="n">${rows.length}</div><div class="l">Cargas registradas</div></div></div>
    <div class="card"><div class="hint" style="margin:0 0 6px">El rendimiento (km/L, Bs/km) se calcula entre cargas con tanque lleno y odómetro. El chofer también registra sus cargas desde el teléfono.</div>
    <div class="scroll"><table><tr><th>Fecha</th><th>Vehículo</th><th>Estación</th><th>Litros</th><th>Bs/L</th><th>Total Bs</th><th>Odómetro</th><th>Km tramo</th><th>km/L</th><th>L/100 km</th><th>Bs/km</th><th></th></tr>
    ${rows.map((r) => `<tr><td>${esc(new Date(r.cargada_en).toLocaleString())}</td><td>${esc(r.vehiculo_codigo)}</td><td>${esc(r.estacion)}</td><td>${r.litros}</td><td>${(+r.precio_litro).toFixed(2)}</td><td>${r.total_bs}</td><td>${esc(r.odometro_km ?? '—')}</td><td>${esc(r.km_tramo ?? '—')}</td><td>${esc(r.km_por_litro ?? '—')}</td><td>${esc(r.l_100km ?? '—')}</td><td>${esc(r.bs_por_km ?? '—')}</td><td>${r.alerta_consumo ? '<span class="tag CRITICA">consumo alto</span>' : ''}</td></tr>`).join('') || '<tr><td colspan="12" class="mut">Sin cargas registradas.</td></tr>'}</table></div></div>`;
  if ($('#nuevo')) $('#nuevo').onclick = () => cargaCombustible();
}

// ---------- Sincronización con Google Sheets (app del teléfono) ----------
const ETQ = { local: ['⚪', 'Solo en este teléfono'], ok: ['🟢', 'Sincronizado'], sincronizando: ['🔄', 'Sincronizando…'], 'sin-red': ['🟠', 'Sin conexión'], error: ['🔴', 'Error de sincronización'] };
function chipSync() { const e = window.LC_SYNC || { estado: 'local', pendientes: 0 }, t = ETQ[e.estado] || ETQ.local; return `${t[0]} ${t[1]}${e.pendientes ? ` · ${e.pendientes} por enviar` : ''}`; }
window.addEventListener('lc-sync', () => { document.querySelectorAll('.syncchip').forEach((c) => (c.innerHTML = chipSync())); if (state.view === 'sync' && !document.querySelector('#sk')?.matches(':focus') && !document.querySelector('#su')?.matches(':focus')) refrescoSuave(); });
let rt = null;
function refrescoSuave() {   // refresca la pantalla actual sin molestar si el usuario está escribiendo
  clearTimeout(rt);
  rt = setTimeout(() => {
    if (!state.token || !state.user) return;
    const a = document.activeElement;
    if ((a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) || document.querySelector('[style*="position:fixed"], .modalw')) return;
    if (state.view === 'planificacion' && state.editando) { if (!$('#avisoNuevo')) $('#main')?.insertAdjacentHTML('afterbegin', '<div class="alert" id="avisoNuevo">Hay cambios nuevos de otros usuarios. Guarde su edición y recargue esta pantalla para verlos.</div>'); return; }
    render();
  }, 600);
}
window.addEventListener('lc-datos', refrescoSuave);
async function syncView(m) {
  const e = await api('GET', '/sync/estado'), t = ETQ[e.estado] || ETQ.local;
  m.innerHTML = `${pageHead('sync')}<div class="card"><h3 style="margin-top:0">Estado</h3>
    <p>${t[0]} <b>${t[1]}</b>${e.pendientes ? ` · ${e.pendientes} cambios por enviar` : ''}${e.ultima ? ` · última: ${esc(new Date(e.ultima).toLocaleTimeString())}` : ''}</p>
    ${e.error ? `<div class="err">${esc(e.error)}</div>` : ''}
    ${e.configurado ? `<p class="mut">Conectado a: ${esc(e.url)}<br>Dispositivo: ${esc(String(e.dispositivo).slice(0, 8))}</p><div class="row"><button class="btn pri" id="ahora">Sincronizar ahora</button><button class="btn bad" id="desc">Desconectar</button></div>`
    : `<p class="mut">Sin configurar: los datos viven solo en este teléfono. Pegue la URL de la aplicación web de Apps Script y la clave que mostró la función configurar().</p>
      <label>URL de la aplicación web</label><input id="su" value="${esc(window.LC_URL_BASE || '')}" placeholder="https://script.google.com/macros/s/.../exec"><label>Clave</label><input id="sk"><div class="err" id="se"></div><button class="btn pri" id="conectar">Conectar</button>`}</div>
    <div class="card mut">Cada teléfono guarda una copia y se sincroniza cada pocos segundos. Sin internet la app sigue funcionando y envía los cambios al volver la red.</div>`;
  if ($('#ahora')) $('#ahora').onclick = async () => { $('#ahora').disabled = true; await api('POST', '/sync/ahora'); render(); };
  if ($('#desc')) $('#desc').onclick = async () => { if (confirm('Este teléfono dejará de sincronizarse (conserva sus datos actuales). ¿Desconectar?')) { await api('POST', '/sync/desconectar'); render(); } };
  if ($('#conectar')) $('#conectar').onclick = async () => {
    $('#conectar').disabled = true; $('#se').textContent = 'Conectando…';
    const cuerpo = { url: $('#su').value, clave: $('#sk').value };
    try { await api('POST', '/sync/config', cuerpo); }
    catch (er) {
      if (er.detail?.confirmar && confirm(er.message)) { try { await api('POST', '/sync/config', { ...cuerpo, reemplazar: true }); alert('Conectado. Ingrese de nuevo con su usuario.'); return logout(); } catch (e2) { $('#se').textContent = e2.message; } }
      else $('#se').textContent = er.message; $('#conectar').disabled = false; return;
    }
    render();
  };
}

async function jornadaView(m) {
  const its = await api('GET', '/itinerarios?fecha=' + today());
  const it = its.find((i) => i.estado !== 'BORRADOR');
  if (!it) return (m.innerHTML = '<div class="card"><h2>MI JORNADA</h2><p class="mut">No tiene itinerario asignado para hoy.</p></div>');
  const d = await api('GET', '/itinerarios/' + it.id);
  m.innerHTML = `<div class="card"><h2>MI JORNADA — ${esc(d.fecha)} · ${esc(d.vehiculo_codigo)}</h2><p class="mut">Vista de solo lectura. Iniciar jornada, GPS, llegadas y fotos se habilitan en la Fase 2.</p>
    ${d.actividades.map((a) => `<div class="card" style="padding:10px"><b>${a.numero}. ${esc(a.actividad)}</b><br>${esc(a.hora_inicio_plan)}–${esc(a.hora_fin_plan)} · ${esc(a.origen_nombre || '')} → ${esc(a.destino_nombre || '')}<br><span class="mut">${esc(a.comentarios)}</span></div>`).join('')}</div>`;
}


function cargaCombustible() {
  api('GET', '/vehiculos').then((vehs) => ventana('Registrar carga de combustible', `<p class="mut sm" style="margin:0">Los campos con <b style="color:var(--bad)">*</b> son obligatorios.</p>
    ${seccion(1, '¿Qué vehículo y cuándo?', '', `<label class="req">Vehículo</label><select id="v">${opts(vehs, '', (x) => x.id, (x) => x.codigo + ' · ' + x.placa)}</select><label class="req">Fecha de la carga</label><input id="f" type="date" value="${today()}">`)}
    ${seccion(2, '¿Cuánto se cargó?', '', `<div class="grid2"><div><label class="req">Litros</label><input id="l" type="number" min="0" step="any" inputmode="decimal"></div><div><label class="req">Total pagado (Bs)</label><input id="t" type="number" min="0" step="any" inputmode="decimal"></div></div><div class="hint" id="pl"></div>
      <label>Odómetro (km)</label><input id="o" type="number" min="0" inputmode="decimal"><div class="hint">Con el odómetro se calcula el rendimiento (km por litro).</div><label>Estación de servicio</label><input id="e" placeholder="Opcional">`)}
    <div class="err" id="er"></div><div class="bar"><button class="btn" id="no">Cancelar</button><button class="btn pri lg" id="ok">Guardar carga</button></div>`, (m, close) => {
    $('#no', m).onclick = close;
    const pl = () => { const l = +$('#l', m).value, t = +$('#t', m).value; $('#pl', m).textContent = l > 0 && t > 0 ? `Precio: ${bs(t / l)} por litro` : ''; }; $('#l', m).oninput = pl; $('#t', m).oninput = pl;
    $('#ok', m).onclick = async () => {
      const err = validar(m, [['#v', 'Elija el vehículo'], ['#f', 'Indique la fecha'], ['#l', 'Indique los litros'], ['#t', 'Indique el total pagado']]); if (err) return ($('#er', m).textContent = err);
      try { await api('POST', '/combustible', { vehiculo_id: $('#v', m).value, fecha: $('#f', m).value, litros: $('#l', m).value, total_bs: $('#t', m).value, odometro_km: $('#o', m).value, estacion: $('#e', m).value }); close(); toast('✅ Carga registrada'); render(); }
      catch (e) { $('#er', m).textContent = e.message; }
    };
  }));
}

render();
