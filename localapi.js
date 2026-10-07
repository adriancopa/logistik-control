// Redirige las llamadas /api/* al motor local (SQLite en el teléfono) y, si hay una hoja de Google configurada,
// sincroniza los datos con los demás dispositivos en segundo plano.
import { crearMotor, almacenIDB } from './engine.js';
const realFetch = window.fetch.bind(window);
// En el teléfono las llamadas a Google van por el motor HTTP nativo (sin restricciones CORS del WebView, sigue redirecciones)
const cap = window.Capacitor, nativo = () => cap?.isNativePlatform?.() && cap.Plugins?.CapacitorHttp;
async function fetchNube(url, opts) {
  const http = nativo();
  if (!http) return realFetch(url, opts);
  try {
    const r = await http.request({ url, method: opts.method || 'GET', headers: opts.headers, data: opts.body, responseType: 'text', connectTimeout: 30000, readTimeout: 90000 });
    const txt = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
    return { status: r.status, json: async () => JSON.parse(txt) };
  } catch (e) { throw new TypeError(e?.message || 'Sin conexión'); }
}
// La clave puede venir en el enlace de acceso (…/#k=CLAVE): la parte después de # nunca viaja por internet ni queda en el servidor.
const claveDelEnlace = () => { const m = /[#&]k=([A-Za-z0-9_-]{8,64})/.exec(location.hash); return m ? m[1] : null; };
const configBase = async () => {
  try {
    const j = await (await realFetch('sync-config.json', { cache: 'no-store' })).json(); if (j.url) window.LC_URL_BASE = j.url;
    const k = j.clave || claveDelEnlace();
    if (claveDelEnlace()) history.replaceState(null, '', location.pathname + location.search);   // borra la clave de la barra de direcciones
    return j.url && k ? { url: j.url, clave: k } : null;
  } catch { return null; }
};
const motor = crearMotor({
  storage: almacenIDB(), fetch: fetchNube, initSqlJs: (o) => globalThis.initSqlJs(o), configBase,
  onEstado: (e) => { window.LC_SYNC = e; window.dispatchEvent(new CustomEvent('lc-sync', { detail: e })); },
  onDatos: (n) => window.dispatchEvent(new CustomEvent('lc-datos', { detail: n })),
});
motor.init().catch((e) => console.error('Motor local', e));
window.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url, u = new URL(url, location.href);
  if (!u.pathname.startsWith('/api/')) return realFetch(input, init);
  let body; try { body = init.body ? JSON.parse(init.body) : undefined; } catch { body = undefined; }
  const r = await motor.handle((init.method || 'GET').toUpperCase(), u.pathname + u.search, Object.fromEntries(new Headers(init.headers || {}).entries()), body);
  if (r.base64) { const bin = atob(r.base64), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Response(new Blob([a], { type: r.type }), { status: r.status }); }
  return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
};
