/**
 * ESTADO DE LA APLICACIÓN (signals) y controlador de la partida.
 * La interfaz solo lee estas señales; toda la red pasa por un Transporte.
 */
import { batch, computed, signal } from '@preact/signals';
import {
  avanzarConSemilla, estadoInicial, eventoActivo, eventoPorId, productos, EQUIPOS, ROLES,
  type Asientos, type DecEquipo, type DecSemana, type Equipo, type Estado, type Rol, type CalidadId,
} from './engine';
import type { MensajeEquipo, Sync, Transporte } from './net/tipos';
import { traducirError } from './net/supabase';
import { sonido, vibrar } from './fx/sonido';

/* ---------------------------- persistencia ---------------------------- */
const leer = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const escribir = (k: string, v: string | null) => {
  try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* sin almacenamiento */ }
};
export const persistir = <T,>(k: string, inicial: T) => {
  let v = inicial;
  try { const r = leer(k); if (r) v = { ...inicial, ...JSON.parse(r) }; } catch { /* corrupto */ }
  const s = signal<T>(v);
  s.subscribe((x) => escribir(k, JSON.stringify(x)));
  return s;
};

export const perfil = persistir('cpf2.perfil', { nombre: '', avatar: 0 });
export const ajustes = persistir('cpf2.ajustes', { sonido: true, vibrar: true, tutorialVisto: false });
export const ultimaSala = signal<string | null>(leer('cpf2.sala'));

/* ------------------------------ navegación ------------------------------ */
export type Pantalla = 'home' | 'perfil' | 'online' | 'solo' | 'ayuda' | 'sala' | 'tv';
export const pantalla = signal<Pantalla>('home');
export const siguienteTrasPerfil = signal<Pantalla>('home');
export const aviso = signal<{ texto: string; tipo: 'error' | 'ok' | 'info' } | null>(null);
let avisoT: ReturnType<typeof setTimeout> | undefined;
export function avisar(texto: string, tipo: 'error' | 'ok' | 'info' = 'info', ms = 3500) {
  aviso.value = { texto, tipo };
  clearTimeout(avisoT);
  avisoT = setTimeout(() => { aviso.value = null; }, ms);
}
export function irA(p: Pantalla) {
  if ((p === 'online' || p === 'solo') && (!perfil.value.nombre || !perfil.value.avatar)) {
    siguienteTrasPerfil.value = p;
    pantalla.value = 'perfil';
    return;
  }
  pantalla.value = p;
}

/* ------------------------------- partida ------------------------------- */
export const sync = signal<Sync | null>(null);
export const juego = signal<Estado | null>(null);
/** Se incrementa cuando el motor avanza (el estado se muta en el lugar). */
export const revision = signal(0);
export const ahora = signal(Date.now());
export const desfase = signal(0);
export const modo = signal<'local' | 'online' | null>(null);
export const mensajes = signal<MensajeEquipo[]>([]);
export const transicion = signal<{ ronda: number; total: number; ventas: number; vendidas: number; demanda: number } | null>(null);

export const sala = computed(() => sync.value?.sala ?? null);
export const yo = computed(() => sync.value?.yo ?? null);
export const semana = computed(() => sync.value?.semana ?? null);
/** Número de la semana que se está jugando. */
export const actual = computed(() => (juego.value ? juego.value.ronda + 1 : 1) + revision.value * 0);
export const restante = computed(() => {
  const s = semana.value;
  if (!s?.fin) return null;
  return Math.max(0, Date.parse(s.fin) - ahora.value);
});
export const eventoAhora = computed(() => {
  revision.value;
  const e = juego.value;
  if (!e) return null;
  const ev = eventoActivo(e, actual.value);
  return ev ? { ...ev, def: eventoPorId(ev.id)! } : null;
});

let transporte: Transporte | null = null;
let decs: DecSemana[] = [];
let conocidas = 0;
let claveMotor = '';
let ciclo: ReturnType<typeof setInterval> | undefined;
let reloj: ReturnType<typeof setInterval> | undefined;
let ocupado = false;
let autoEnviada = 0;
let extPedida = 0;

export const getTransporte = () => transporte;

export function abrirPartida(t: Transporte) {
  cerrarPartida();
  transporte = t;
  modo.value = t.modo;
  if (t.modo === 'online') { ultimaSala.value = t.codigo; escribir('cpf2.sala', t.codigo); }
  t.alMensaje?.((m) => {
    if (m.equipo !== yo.value?.equipo) return;
    mensajes.value = [...mensajes.value.slice(-4), m];
    sonido('ping');
  });
  t.alCambio?.(() => void refrescar());
  pantalla.value = 'sala';
  void refrescar();
  ciclo = setInterval(() => void refrescar(), t.intervalo);
  reloj = setInterval(tick, 200);
}

export function cerrarPartida() {
  clearInterval(ciclo);
  clearInterval(reloj);
  transporte?.cerrar();
  transporte = null;
  decs = []; conocidas = 0; claveMotor = ''; autoEnviada = 0; extPedida = 0;
  batch(() => {
    sync.value = null; juego.value = null; modo.value = null; mensajes.value = []; transicion.value = null;
    borrador.value = null;
  });
}

export function olvidarSala() {
  ultimaSala.value = null;
  escribir('cpf2.sala', null);
}

function asientosDe(s: Sync): Asientos {
  const a = { A: {}, B: {} } as Asientos;
  for (const X of EQUIPOS) for (const rol of ROLES) {
    const j = s.jugadores.find((p) => p.equipo === X && p.rol === rol);
    a[X][rol] = j?.es_bot ? 'bot' : 'humano';
  }
  return a;
}

export async function refrescar() {
  const t = transporte;
  if (!t || ocupado) return;
  ocupado = true;
  try {
    const s = await t.sincronizar(conocidas);
    if (t !== transporte) return;
    if (!s) { avisar('La sala ya no existe', 'error'); olvidarSala(); cerrarPartida(); pantalla.value = 'home'; return; }
    desfase.value = Date.parse(s.ahora) - Date.now();
    aplicar(s);
  } catch (e) {
    avisar(traducirError(e), 'error');
  } finally {
    ocupado = false;
  }
}

function aplicar(s: Sync) {
  const enJuego = s.sala.estado === 'jugando' || s.sala.estado === 'terminado';
  let avanzo = false;
  const antes = juego.value?.ronda ?? 0;
  if (enJuego && s.semana) {
    const asientos = asientosDe(s);
    const clave = `${s.sala.codigo}|${s.sala.semilla}|${s.sala.sabores}|${s.sala.autopiloto}|${JSON.stringify(asientos)}`;
    if (clave !== claveMotor) {
      claveMotor = clave;
      const e = estadoInicial({ sabores: s.sala.sabores, asientos, autopiloto: s.sala.autopiloto });
      e.semilla = s.sala.semilla >>> 0;
      juego.value = e;
    }
    for (const d of s.decisiones) {
      decs[d.ronda - 1] = decs[d.ronda - 1] || {};
      const eq = (decs[d.ronda - 1][d.equipo] = decs[d.ronda - 1][d.equipo] || {}) as DecEquipo;
      (eq as Record<Rol, unknown>)[d.rol] = d.payload;
    }
    conocidas = Math.max(conocidas, s.semana.cerradas);
    const e = juego.value!;
    while (e.ronda < s.semana.cerradas) {
      avanzarConSemilla(e, e.ronda + 1, decs[e.ronda] || {});
      avanzo = true;
    }
  }
  batch(() => {
    sync.value = s;
    if (avanzo) revision.value++;
  });
  const e = juego.value;
  if (avanzo && e && e.ronda - antes === 1) celebrarSemana();
  prepararBorrador();
}

function celebrarSemana() {
  const e = juego.value;
  const X = yo.value?.equipo;
  if (!e || !X || !e.historial.length) return;
  const h = e.historial[e.historial.length - 1].equipos[X];
  const suma = (a: number[]) => a.reduce((x, y) => x + y, 0);
  transicion.value = {
    ronda: e.ronda, total: h.utilidadRonda.total, ventas: h.utilidadRonda.ventas,
    vendidas: suma(h.vendido), demanda: suma(h.demanda),
  };
  sonido(h.utilidadRonda.total >= 0 ? 'moneda' : 'baja');
  const alertado = e.pend.some((p) => p.contra === X && p.ejecutar === e.ronda + 1)
    || e.historial[e.historial.length - 1].habilidades.some((h2) => h2.contra === X);
  if (alertado) { sonido('alarma'); vibrar([120, 60, 120]); }
  setTimeout(() => { if (transicion.value?.ronda === e.ronda) transicion.value = null; }, 2600);
}

/* ------------------------------ reloj ------------------------------ */
function tick() {
  ahora.value = Date.now() + desfase.value;
  const s = sync.value;
  const t = transporte;
  if (!s || !t || s.sala.estado !== 'jugando') return;
  const r = restante.value;
  // Pide el tiempo extra cuando aparece un evento (todos ven 15 s de presentación)
  const ev = eventoAhora.value;
  if (ev && ev.inicio === actual.value && extPedida !== actual.value && !s.semana?.extra) {
    extPedida = actual.value;
    void t.extender(actual.value).catch(() => {});
  }
  if (r !== null && r <= 5000 && r > 0 && Math.ceil(r / 1000) !== ultimoTic) {
    ultimoTic = Math.ceil(r / 1000);
    if (!enviada.value) sonido('tic');
  }
  // Envío automático 2.5 s antes de que acabe el tiempo (si no la mandaste)
  if (r !== null && r <= 2500 && (!s.mi_decision || cambiosSinEnviar.value) && autoEnviada !== actual.value && yo.value?.rol && borrador.value) {
    autoEnviada = actual.value;
    void enviarDecision(true);
  }
}
let ultimoTic = 0;

/* ------------------------------ borrador ------------------------------ */
export interface Borrador {
  ronda: number;
  rol: Rol;
  calidad: CalidadId[];
  produccion: number[];
  pedido: number[];
  precio: number[];
  pujas: number[];
  habilidad: boolean;
}
export const borrador = signal<Borrador | null>(null);
export const enviada = computed(() => !!sync.value?.mi_decision);
export const cambiosSinEnviar = computed(() => {
  const b = borrador.value;
  const md = sync.value?.mi_decision;
  if (!b || !md) return false;
  return JSON.stringify(payloadDe(b)) !== JSON.stringify(md);
});

function prepararBorrador() {
  const e = juego.value;
  const me = yo.value;
  const s = sync.value;
  if (!e || !me?.rol || !me.equipo || !s || s.sala.estado !== 'jugando') return;
  const r = actual.value;
  if (borrador.value && borrador.value.ronda === r) return;
  const eq = e.equipos[me.equipo];
  const P = productos(e);
  const ult = e.historial[e.historial.length - 1]?.equipos[me.equipo];
  const md = (s.mi_decision || {}) as Record<string, unknown>;
  const arr = (k: string) => (Array.isArray(md[k]) ? (md[k] as number[]) : null);
  const b: Borrador = {
    ronda: r,
    rol: me.rol,
    calidad: (arr('calidad') as unknown as CalidadId[]) || eq.calidad.slice(),
    produccion: arr('produccion') || P.map((p, i) => (ult ? ult.pedidoFab[i] : p.demMedia)),
    pedido: arr('pedido') || P.map((p, i) => (me.rol === 'tienda'
      ? (ult ? ult.demanda[i] : p.demMedia)
      : (ult ? ult.pedidoDist[i] : p.demMedia))),
    precio: (arr('precio') as number[] | null) || eq.precio.slice(),
    pujas: Array.isArray(md.pujas) ? (md.pujas as ({ monto: number } | null)[]).map((x) => x?.monto ?? 0) : [0, 0, 0],
    habilidad: md.habilidad === true,
  };
  borrador.value = b;
}

export function editar(f: (b: Borrador) => void) {
  const b = borrador.value;
  if (!b) return;
  const c = structuredClone(b);
  f(c);
  borrador.value = c;
}

export function payloadDe(b: Borrador): Record<string, unknown> {
  const extra = b.habilidad ? { habilidad: true } : {};
  if (b.rol === 'fabrica') return { calidad: b.calidad, produccion: b.produccion, ...extra };
  if (b.rol === 'distribuidor') {
    const e = juego.value!;
    const r = actual.value;
    const pujas = (['A', 'B', 'C'] as const).map((k, i) => (r < e.inf[k].ocupadoHasta || !(b.pujas[i] > 0) ? null : { monto: Math.floor(b.pujas[i]) }));
    return { pedido: b.pedido, pujas, ...extra };
  }
  return { precio: b.precio, pedido: b.pedido, ...extra };
}

export async function enviarDecision(auto = false) {
  const t = transporte;
  const b = borrador.value;
  if (!t || !b) return;
  try {
    await t.enviarDecision(b.ronda, payloadDe(b));
    sonido('enviar');
    vibrar(30);
    avisar(auto ? '⏱ Tiempo: enviamos lo que tenías en pantalla' : '✔ Decisión enviada', 'ok', 2200);
    await refrescar();
  } catch (e) {
    avisar(traducirError(e), 'error');
  }
}

export function enviarMensaje(texto: string) {
  const t = transporte;
  const me = yo.value;
  if (!t?.enviarMensaje || !me?.equipo) return;
  const m: MensajeEquipo = { de: me.nombre, avatar: me.avatar, equipo: me.equipo as Equipo, texto, ts: Date.now() };
  t.enviarMensaje(m);
  mensajes.value = [...mensajes.value.slice(-4), m];
}

export async function accion(f: (t: Transporte) => Promise<unknown>) {
  const t = transporte;
  if (!t) return;
  try { await f(t); await refrescar(); } catch (e) { avisar(traducirError(e), 'error'); }
}
