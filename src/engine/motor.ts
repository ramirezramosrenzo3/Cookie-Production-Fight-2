/**
 * MOTOR DEL JUEGO (puro y determinista)
 * ------------------------------------------------------------------
 * Con la misma semilla y las mismas decisiones, cualquier dispositivo calcula
 * exactamente el mismo resultado. No toca la red ni el DOM.
 *
 * Cambios respecto a la v1:
 *  - Sin estado global mutable: la cantidad de sabores vive en el estado (`n`).
 *  - Los bots (y el autopiloto de una persona desconectada) se resuelven DENTRO
 *    del motor: ya no hace falta que un celular envíe decisiones en su nombre.
 *  - Se puede avanzar semana a semana (incremental) sin reproducir todo.
 */
import {
  BOT, CALIDADES, CONFIG, EQUIPOS, EVENTOS, EVENTO_ESPERA, EVENTO_PRIMERA_RONDA, EVENTO_PROB_INICIAL,
  EVENTO_PROB_PASO, HABILIDADES, INFLUENCERS, INF_KEYS, ROLES, costoHab, eventoPorId, habPorId,
  normalizarSabores, productosDe, rival,
  type CalidadId, type Equipo, type HabilidadId, type InfKey, type Producto, type Rol,
} from './reglas';
import { crearRng, rngEvento, rngSemana, type Rng } from './rng';

/* ============================== TIPOS ============================== */
export interface Lote { q: number; c: number }
export interface Envio { llega: number; p: number; q: number; c: number }
export type Etapa = 'fabrica' | 'distribuidor' | 'tienda';
export type Tramo = 'prod' | 'fd' | 'dt';

export interface Utilidad {
  ventas: number; mantenimiento: number; influencers: number; habilidades: number; perdidas: number;
}
export interface EstadoEquipo {
  stock: Record<Etapa, Lote[]>;
  enTransito: Record<Tramo, Envio[]>;
  calidad: CalidadId[];
  precio: number[];
  utilidad: Utilidad;
  sabotaje?: { llega: number; perdido: number };
}
export interface EstadoInfluencer { ocupadoHasta: number; dueno: Equipo | null; uplift: number; hasta: number }
export interface HabPendiente { id: HabilidadId; de: Equipo; contra: Equipo; ejecutar: number }
export interface EventoActivo { id: string; inicio: number; fin: number }

export type TipoAsiento = 'humano' | 'bot';
export type Asientos = Record<Equipo, Record<Rol, TipoAsiento>>;

export interface Opciones {
  sabores: number;
  /** Qué asientos son bots. Por defecto, todos humanos. */
  asientos?: Asientos;
  /** Si una persona no envía decisión, el bot decide por ella (por defecto: no, como en la v1). */
  autopiloto?: boolean;
}

export interface Estado {
  n: number;
  ronda: number;
  semilla: number | null;
  asientos: Asientos;
  autopiloto: boolean;
  inf: Record<InfKey, EstadoInfluencer>;
  hab: Record<Equipo, Record<HabilidadId, number>>;
  pend: HabPendiente[];
  fakeHasta: Record<Equipo, number>;
  equipos: Record<Equipo, EstadoEquipo>;
  historial: RegistroSemana[];
  evento: EventoActivo | null;
  eventosUsados: string[];
  probEvento: number;
  proxEval: number;
}

/* Decisiones tal como las envía cada rol (payload de la red) */
export interface DecFabrica { calidad?: (CalidadId | null)[]; produccion?: number[]; habilidad?: boolean }
export interface DecDistribuidor { pedido?: number[]; pujas?: ({ monto: number } | null)[]; habilidad?: boolean }
export interface DecTienda { precio?: (number | null)[]; pedido?: number[]; habilidad?: boolean }
export interface DecEquipo { fabrica?: DecFabrica; distribuidor?: DecDistribuidor; tienda?: DecTienda }
export type DecSemana = Partial<Record<Equipo, DecEquipo>>;

export type ResultadoPuja = 'gano' | 'perdio' | 'ocupado' | 'sin_puja';

export interface ReporteEquipo {
  produccion: number[]; pedidoFab: number[]; pedidoDist: number[];
  despFD: number[]; despDT: number[];
  desvEnv: number[]; desvRec: number[];
  att: number[]; demanda: number[]; vendido: number[]; perdido: number[]; perdidoFinal: number[];
  mantenimiento: number;
  stock: Record<Etapa, number[]>;
  calidad: CalidadId[]; precio: number[];
  influencers: { k: InfKey; uplift: number }[];
  pujas: ResultadoPuja[];
  utilidadRonda: Utilidad & { total: number };
  habilidadesUsadas: HabilidadId[];
  /** Asientos que decidió el bot esta semana (bots y autopiloto) */
  autopiloto: Rol[];
}
export interface RegistroSemana {
  ronda: number;
  evento: string | null;
  habilidades: { id: HabilidadId; de: Equipo; contra: Equipo; perdido: number; llega?: number }[];
  base: number[];
  probDesvio: number[];
  subasta: Record<InfKey, { ocupado: boolean; ganador: Equipo | null; desempate: boolean; uplift: number }>;
  equipos: Record<Equipo, ReporteEquipo>;
}

/* ============================ UTILIDADES ============================ */
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export const sumaUtil = (u: Utilidad) => u.ventas - u.mantenimiento - u.influencers - (u.habilidades || 0) - (u.perdidas || 0);
export const productos = (e: Estado): Producto[] => productosDe(e.n);
const ceros = (n: number) => Array<number>(n).fill(0);

function agregar(lista: Lote[], i: number, q: number, c: number) {
  if (q <= 0) return;
  const L = lista[i];
  const total = L.q + q;
  L.c = (L.q * L.c + q * c) / total;
  L.q = total;
}
function retirar(lista: Lote[], i: number, q: number): Lote {
  const L = lista[i];
  const n = Math.min(q, L.q);
  L.q -= n;
  return { q: n, c: L.c };
}

/** Calidad promedio (en enteros ×100) para desempatar la subasta. */
export const calidadPromedio = (eq: EstadoEquipo) =>
  eq.calidad.reduce((a, k) => a + Math.round(CALIDADES[k].demanda * 100), 0);

export const todosHumanos = (): Asientos => ({
  A: { fabrica: 'humano', distribuidor: 'humano', tienda: 'humano' },
  B: { fabrica: 'humano', distribuidor: 'humano', tienda: 'humano' },
});

/* ========================== ESTADO INICIAL ========================== */
export function estadoInicial(op: Opciones = { sabores: 5 }): Estado {
  const n = normalizarSabores(op.sabores);
  const P = productosDe(n);
  const equipo = (): EstadoEquipo => {
    const lote = (k: number) => P.map((p) => ({ q: Math.round(p.demMedia * k), c: CONFIG.costoBase }));
    const enTransito: Record<Tramo, Envio[]> = { prod: [], fd: [], dt: [] };
    for (const clave of ['prod', 'fd', 'dt'] as Tramo[]) {
      P.forEach((p, i) => {
        for (let w = 1; w <= CONFIG.lead; w++) {
          enTransito[clave].push({ llega: w, p: i, q: Math.round(p.demMedia), c: CONFIG.costoBase });
        }
      });
    }
    return {
      stock: {
        fabrica: lote(CONFIG.stockInicial.fabrica),
        distribuidor: lote(CONFIG.stockInicial.distribuidor),
        tienda: lote(CONFIG.stockInicial.tienda),
      },
      enTransito,
      calidad: P.map(() => 'estandar' as CalidadId),
      precio: P.map(() => CONFIG.precioBase),
      utilidad: { ventas: 0, mantenimiento: 0, influencers: 0, habilidades: 0, perdidas: 0 },
    };
  };
  const inf = {} as Record<InfKey, EstadoInfluencer>;
  INF_KEYS.forEach((k) => { inf[k] = { ocupadoHasta: 0, dueno: null, uplift: 0, hasta: -1 }; });
  const hab = { A: {}, B: {} } as Record<Equipo, Record<HabilidadId, number>>;
  HABILIDADES.forEach((h) => { hab.A[h.id] = 0; hab.B[h.id] = 0; });
  return {
    n, ronda: 0, semilla: null,
    asientos: op.asientos ? structuredClone(op.asientos) : todosHumanos(),
    autopiloto: !!op.autopiloto,
    inf, hab, pend: [], fakeHasta: { A: 0, B: 0 },
    equipos: { A: equipo(), B: equipo() }, historial: [],
    evento: null, eventosUsados: [], probEvento: EVENTO_PROB_INICIAL, proxEval: EVENTO_PRIMERA_RONDA,
  };
}

/* ============================ HABILIDADES ============================ */
export function habilidadDisponible(estado: Estado, X: Equipo, id: HabilidadId, t: number):
  { ok: true } | { ok: false; motivo: 'no existe' | 'enfriamiento' | 'fondos'; faltan?: number } {
  const def = habPorId(id);
  if (!def) return { ok: false, motivo: 'no existe' };
  const ultimo = estado.hab[X][id] || 0;
  const faltan = ultimo > 0 ? ultimo + def.enfriamiento - t : 0;
  if (faltan > 0) return { ok: false, motivo: 'enfriamiento', faltan };
  if (sumaUtil(estado.equipos[X].utilidad) < costoHab(def, estado.n)) return { ok: false, motivo: 'fondos' };
  return { ok: true };
}

function ejecutarHabilidad(estado: Estado, h: HabPendiente, t: number) {
  const def = habPorId(h.id)!;
  const V = estado.equipos[h.contra];
  const r: RegistroSemana['habilidades'][number] = { id: h.id, de: h.de, contra: h.contra, perdido: 0 };
  if (h.id === 'incendio') {
    productos(estado).forEach((_, i) => {
      const lote = retirar(V.stock.tienda, i, Math.round(V.stock.tienda[i].q * def.pct));
      r.perdido += lote.q;
      V.utilidad.perdidas += lote.q * lote.c;
    });
  } else if (h.id === 'fake') {
    estado.fakeHasta[h.contra] = t + (def.duracion || 1) - 1;
  } else if (h.id === 'gta') {
    const fd = V.enTransito.fd;
    if (fd.length) {
      const llega = Math.max(...fd.map((e) => e.llega));
      fd.filter((e) => e.llega === llega).forEach((e) => {
        const n = Math.round(e.q * def.pct);
        e.q -= n;
        r.perdido += n;
        V.utilidad.perdidas += n * e.c;
      });
      V.enTransito.fd = fd.filter((e) => e.q > 0);
      r.llega = llega;
      if (r.perdido > 0) V.sabotaje = { llega, perdido: r.perdido };
    }
  }
  return r;
}

/* ============================== EVENTOS ============================== */
export function prepararEvento(estado: Estado, n: number) {
  if (estado.semilla === null || estado.semilla === undefined) return;
  if (estado.evento && n > estado.evento.fin) estado.evento = null;
  if (estado.evento || n < estado.proxEval) return;
  const rng = rngEvento(estado.semilla, n);
  if (rng() < estado.probEvento / 100) {
    let usados = estado.eventosUsados || [];
    if (usados.length >= EVENTOS.length) usados = [];
    const libres = EVENTOS.filter((x) => !usados.includes(x.id));
    const ev = libres[Math.min(libres.length - 1, Math.floor(rng() * libres.length))];
    estado.eventosUsados = usados.concat(ev.id);
    estado.evento = { id: ev.id, inicio: n, fin: n + ev.duracion - 1 };
    estado.probEvento = EVENTO_PROB_INICIAL;
    estado.proxEval = n + EVENTO_ESPERA;
  } else {
    estado.probEvento = Math.min(100, estado.probEvento + EVENTO_PROB_PASO);
  }
}
export function eventoActivo(estado: Estado, t: number) {
  const e = estado.evento;
  return e && t >= e.inicio && t <= e.fin ? e : null;
}

/* ===================== LECTURA DE DECISIONES (saneo) ===================== */
export interface DecisionLimpia {
  calidad: (CalidadId | null)[];
  produccion: number[];
  pedidoFab: number[];
  pujas: ({ monto: number } | null)[];
  precio: (number | null)[];
  pedidoDist: number[];
  habilidad: Record<Rol, boolean>;
}

export function leerDecision(dec: DecEquipo, n: number): DecisionLimpia {
  const P = productosDe(n);
  const f = (dec.fabrica || {}) as DecFabrica;
  const d = (dec.distribuidor || {}) as DecDistribuidor;
  const t = (dec.tienda || {}) as DecTienda;
  const cantidades = (lista: unknown, topes?: number[]) => P.map((_, i) => {
    const max = topes ? topes[i] : CONFIG.tope;
    const v = Math.floor(Number(Array.isArray(lista) ? lista[i] : 0));
    return Number.isFinite(v) ? clamp(v, 0, max) : 0;
  });
  const leerPuja = (x: unknown) => {
    if (!x || typeof x !== 'object') return null;
    const monto = Math.floor(Number((x as { monto: unknown }).monto));
    if (!Number.isFinite(monto) || monto <= 0) return null;
    return { monto: Math.min(monto, CONFIG.topeMonto) };
  };
  const calidadValida = (k: unknown): k is CalidadId =>
    typeof k === 'string' && Object.prototype.hasOwnProperty.call(CALIDADES, k);
  return {
    calidad: P.map((_, i) => (Array.isArray(f.calidad) && calidadValida(f.calidad[i]) ? f.calidad[i] : null)),
    produccion: cantidades(f.produccion, P.map((p) => p.capProd)),
    pedidoFab: cantidades(d.pedido),
    pujas: [0, 1, 2].map((k) => leerPuja(Array.isArray(d.pujas) ? d.pujas[k] : null)),
    precio: P.map((_, i) => {
      const raw = Array.isArray(t.precio) ? t.precio[i] : undefined;
      if (raw === null || raw === undefined || (raw as unknown) === '') return null;
      const v = Number(raw);
      return Number.isFinite(v) ? clamp(Math.round(v * 100) / 100, CONFIG.precioMin, CONFIG.precioMax) : null;
    }),
    pedidoDist: cantidades(t.pedido),
    habilidad: { fabrica: f.habilidad === true, distribuidor: d.habilidad === true, tienda: t.habilidad === true },
  };
}

/* ============================== SUBASTA ============================== */
function subastar(estado: Estado, t: number, lect: Record<Equipo, DecisionLimpia>, rng: Rng) {
  const res = {} as RegistroSemana['subasta'];
  INF_KEYS.forEach((k, idx) => {
    const inf = estado.inf[k];
    if (t < inf.ocupadoHasta) {
      res[k] = { ocupado: true, ganador: inf.dueno, desempate: false, uplift: inf.uplift };
      return;
    }
    const ofertas = EQUIPOS
      .map((X) => ({ X, monto: lect[X].pujas[idx]?.monto ?? 0 }))
      .filter((o) => o.monto > 0);
    let ganador: { X: Equipo; monto: number } | null = null;
    let desempate = false;
    if (ofertas.length) {
      const max = Math.max(...ofertas.map((o) => o.monto));
      const top = ofertas.filter((o) => o.monto === max);
      if (top.length === 1) {
        ganador = top[0];
      } else {
        desempate = true;
        const mejor = Math.max(...top.map((o) => calidadPromedio(estado.equipos[o.X])));
        const empatados = top.filter((o) => calidadPromedio(estado.equipos[o.X]) === mejor);
        ganador = empatados.length === 1 ? empatados[0] : empatados[Math.floor(rng() * empatados.length)];
      }
    }
    if (ganador) {
      const info = INFLUENCERS[k];
      const uplift = info.min + (info.max - info.min) * rng();
      inf.ocupadoHasta = t + CONFIG.duracionInfluencer;
      inf.dueno = ganador.X;
      inf.uplift = uplift;
      inf.hasta = t + CONFIG.duracionInfluencer - 1;
      estado.equipos[ganador.X].utilidad.influencers += ganador.monto;
      res[k] = { ocupado: false, ganador: ganador.X, desempate, uplift };
    } else {
      res[k] = { ocupado: false, ganador: null, desempate: false, uplift: 0 };
    }
  });
  return res;
}

export function factorInfluencers(estado: Estado, X: Equipo, t: number) {
  let m = 1;
  INF_KEYS.forEach((k) => {
    const inf = estado.inf[k];
    if (inf.dueno === X && t <= inf.hasta) m *= 1 + inf.uplift;
  });
  return m;
}

/* ====================== RESOLVER DECISIONES DE LA SEMANA ====================== */
/**
 * Completa las decisiones de la semana: los asientos bot siempre deciden con
 * `decisionBot`; una persona sin decisión usa el bot si el autopiloto está activo.
 * Debe llamarse con el estado de ANTES de procesar la semana t.
 */
export function resolverDecisiones(estado: Estado, t: number, dec: DecSemana) {
  const out: Record<Equipo, DecEquipo> = { A: { ...(dec.A || {}) }, B: { ...(dec.B || {}) } };
  const auto: Record<Equipo, Rol[]> = { A: [], B: [] };
  for (const X of EQUIPOS) {
    for (const rol of ROLES) {
      const esBot = estado.asientos[X][rol] === 'bot';
      const falta = out[X][rol] === undefined || out[X][rol] === null;
      if (esBot || (falta && estado.autopiloto)) {
        (out[X] as Record<Rol, unknown>)[rol] = decisionBot(estado, X, rol, t);
        auto[X].push(rol);
      }
    }
  }
  return { decisiones: out, auto };
}

/* ============================== UNA SEMANA ============================== */
export function avanzarRonda(estado: Estado, t: number, decisionesEntrada: DecSemana, rng: Rng): Estado {
  const P = productos(estado);
  const N = estado.n;
  const { decisiones, auto } = resolverDecisiones(estado, t, decisionesEntrada);

  const base = P.map((p) => Math.round(p.demMedia * (1 + CONFIG.ruidoDemanda * (2 * rng() - 1))));
  const ev = eventoActivo(estado, t);
  const evDef = ev ? eventoPorId(ev.id) : null;
  const huelga = !!evDef?.logistico;
  const modEv = P.map((_, i) => 1 + (evDef?.efectos[i] || 0));
  const prob = P.map(() => CONFIG.probDesvioMin + (CONFIG.probDesvioMax - CONFIG.probDesvioMin) * rng());

  const lect: Record<Equipo, DecisionLimpia> = {
    A: leerDecision(decisiones.A, N),
    B: leerDecision(decisiones.B, N),
  };
  const antes = {} as Record<Equipo, Utilidad>;
  EQUIPOS.forEach((X) => { antes[X] = { ...estado.equipos[X].utilidad }; });

  // 0) Habilidades programadas la semana anterior: se ejecutan ahora
  const hechas: RegistroSemana['habilidades'] = [];
  estado.pend = (estado.pend || []).filter((h) => {
    if (h.ejecutar === t) { hechas.push(ejecutarHabilidad(estado, h, t)); return false; }
    return h.ejecutar > t;
  });
  // 0b) Habilidades confirmadas esta semana: se cobran y quedan programadas
  const usadas: Record<Equipo, HabilidadId[]> = { A: [], B: [] };
  EQUIPOS.forEach((X) => {
    HABILIDADES.forEach((hb) => {
      if (!lect[X].habilidad[hb.rol] || !habilidadDisponible(estado, X, hb.id, t).ok) return;
      estado.equipos[X].utilidad.habilidades += costoHab(hb, N);
      estado.hab[X][hb.id] = t;
      estado.pend.push({ id: hb.id, de: X, contra: rival(X), ejecutar: t + 1 });
      usadas[X].push(hb.id);
    });
  });

  // 1) Calidad y precio
  EQUIPOS.forEach((X) => {
    const eq = estado.equipos[X];
    lect[X].calidad.forEach((c, i) => { if (c) eq.calidad[i] = c; });
    lect[X].precio.forEach((pr, i) => { if (pr !== null) eq.precio[i] = pr; });
  });

  // 2) Subasta
  const subasta = subastar(estado, t, lect, rng);

  // 3) Llegadas, producción y pedidos
  const ctx = {} as Record<Equipo, ReporteEquipo>;
  EQUIPOS.forEach((X) => {
    const eq = estado.equipos[X];
    const L = lect[X];
    for (const [clave, destino] of [['prod', 'fabrica'], ['fd', 'distribuidor'], ['dt', 'tienda']] as [Tramo, Etapa][]) {
      eq.enTransito[clave] = eq.enTransito[clave].filter((e) => {
        if (!huelga && e.llega <= t) { agregar(eq.stock[destino], e.p, e.q, e.c); return false; }
        return true;
      });
    }
    P.forEach((_, i) => {
      const q = L.produccion[i];
      if (q > 0) eq.enTransito.prod.push({ llega: t + CONFIG.lead, p: i, q, c: CONFIG.costoBase * CALIDADES[eq.calidad[i]].costo });
    });
    const despFD = ceros(N);
    P.forEach((_, i) => {
      const lote = retirar(eq.stock.fabrica, i, L.pedidoFab[i]);
      if (lote.q > 0) eq.enTransito.fd.push({ llega: t + CONFIG.lead, p: i, q: lote.q, c: lote.c });
      despFD[i] = lote.q;
    });
    const despDT = ceros(N);
    P.forEach((_, i) => {
      const lote = retirar(eq.stock.distribuidor, i, L.pedidoDist[i]);
      if (lote.q > 0) eq.enTransito.dt.push({ llega: t + CONFIG.lead, p: i, q: lote.q, c: lote.c });
      despDT[i] = lote.q;
    });
    ctx[X] = {
      produccion: L.produccion.slice(), pedidoFab: L.pedidoFab.slice(), pedidoDist: L.pedidoDist.slice(),
      despFD, despDT, desvEnv: ceros(N), desvRec: ceros(N),
    } as ReporteEquipo;
  });

  // 4) Demanda compartida
  const att = {} as Record<Equipo, number[]>;
  EQUIPOS.forEach((X) => {
    const eq = estado.equipos[X];
    const fac = factorInfluencers(estado, X, t);
    att[X] = P.map((_, i) =>
      Math.pow(CONFIG.precioBase / eq.precio[i], CONFIG.elasticidad) * CALIDADES[eq.calidad[i]].demanda * fac);
  });
  const fakePct = habPorId('fake')!.pct;
  const demanda: Record<Equipo, number[]> = { A: ceros(N), B: ceros(N) };
  P.forEach((_, i) => {
    const s = att.A[i] + att.B[i];
    const mercado = base[i] * modEv[i] * Math.pow(s / 2, CONFIG.crecimientoMercado);
    EQUIPOS.forEach((X) => {
      const fk = (estado.fakeHasta[X] || 0) >= t ? 1 - fakePct : 1;
      demanda[X][i] = Math.round(((mercado * att[X][i]) / s) * fk);
    });
  });

  // 5) Ventas
  EQUIPOS.forEach((X) => {
    const eq = estado.equipos[X];
    const c = ctx[X];
    c.att = att[X];
    c.demanda = demanda[X];
    c.vendido = ceros(N);
    P.forEach((_, i) => {
      const v = Math.min(demanda[X][i], eq.stock.tienda[i].q);
      const lote = retirar(eq.stock.tienda, i, v);
      c.vendido[i] = v;
      eq.utilidad.ventas += v * (eq.precio[i] - lote.c);
    });
    c.perdido = demanda[X].map((x, i) => x - c.vendido[i]);
  });

  // 6) Desvío de clientes
  P.forEach((_, i) => {
    const desviar = (X: Equipo, Y: Equipo) => {
      const cx = ctx[X];
      const cy = ctx[Y];
      const eqY = estado.equipos[Y];
      const pr = clamp((prob[i] * cy.att[i]) / cx.att[i], 0.02, 0.9);
      for (let k = 0; k < cx.perdido[i]; k++) {
        if (eqY.stock.tienda[i].q <= 0) break;
        if (rng() < pr) {
          const lote = retirar(eqY.stock.tienda, i, 1);
          eqY.utilidad.ventas += eqY.precio[i] - lote.c;
          cy.vendido[i] += 1;
          cy.desvRec[i] += 1;
          cx.desvEnv[i] += 1;
        }
      }
    };
    desviar('A', 'B');
    desviar('B', 'A');
  });

  // 7) Mantenimiento
  EQUIPOS.forEach((X) => {
    const eq = estado.equipos[X];
    let valor = 0;
    P.forEach((_, i) => {
      valor += eq.stock.fabrica[i].q * eq.stock.fabrica[i].c
        + eq.stock.distribuidor[i].q * CONFIG.precioFab
        + eq.stock.tienda[i].q * CONFIG.precioDist;
    });
    const costo = CONFIG.tasaMantenimiento * valor;
    eq.utilidad.mantenimiento += costo;
    ctx[X].mantenimiento = costo;
  });

  // 8) Reporte
  EQUIPOS.forEach((X) => {
    const eq = estado.equipos[X];
    const c = ctx[X];
    c.perdidoFinal = c.perdido.map((x, i) => x - c.desvEnv[i]);
    c.stock = {
      fabrica: eq.stock.fabrica.map((L) => L.q),
      distribuidor: eq.stock.distribuidor.map((L) => L.q),
      tienda: eq.stock.tienda.map((L) => L.q),
    };
    c.calidad = eq.calidad.slice();
    c.precio = eq.precio.slice();
    c.influencers = INF_KEYS
      .filter((k) => estado.inf[k].dueno === X && t <= estado.inf[k].hasta)
      .map((k) => ({ k, uplift: estado.inf[k].uplift }));
    c.pujas = INF_KEYS.map((k, idx) => {
      const sub = subasta[k];
      const monto = lect[X].pujas[idx]?.monto ?? 0;
      if (sub.ocupado) return 'ocupado';
      if (!monto) return 'sin_puja';
      return sub.ganador === X ? 'gano' : 'perdio';
    });
    const u = eq.utilidad;
    const a = antes[X];
    const ur = {
      ventas: u.ventas - a.ventas,
      mantenimiento: u.mantenimiento - a.mantenimiento,
      influencers: u.influencers - a.influencers,
      habilidades: u.habilidades - a.habilidades,
      perdidas: u.perdidas - a.perdidas,
      total: 0,
    };
    ur.total = ur.ventas - ur.mantenimiento - ur.influencers - ur.habilidades - ur.perdidas;
    c.utilidadRonda = ur;
    c.habilidadesUsadas = usadas[X];
    c.autopiloto = auto[X];
  });

  estado.ronda = t;
  estado.historial.push({
    ronda: t,
    evento: ev ? ev.id : null,
    habilidades: hechas,
    base,
    probDesvio: prob,
    subasta: Object.fromEntries(INF_KEYS.map((k) => [k, { ...subasta[k] }])) as RegistroSemana['subasta'],
    equipos: ctx,
  });
  prepararEvento(estado, t + 1);
  return estado;
}

/** Avanza la semana t con el azar derivado de la semilla (lo que usan todos los dispositivos). */
export function avanzarConSemilla(estado: Estado, t: number, dec: DecSemana) {
  if (estado.semilla === null) throw new Error('El estado no tiene semilla');
  return avanzarRonda(estado, t, dec, rngSemana(estado.semilla, t));
}

/** Reconstruye la partida desde la semana 1. */
export function reproducir(semilla: number, decisionesPorRonda: DecSemana[], op: Opciones = { sabores: 5 }): Estado {
  const estado = estadoInicial(op);
  estado.semilla = semilla >>> 0;
  decisionesPorRonda.forEach((dec, idx) => avanzarConSemilla(estado, idx + 1, dec));
  return estado;
}

export function puntajes(estado: Estado): Record<Equipo, number> {
  return { A: sumaUtil(estado.equipos.A.utilidad), B: sumaUtil(estado.equipos.B.utilidad) };
}

/* ================================ BOTS ================================ */
function promedioReciente(estado: Estado, X: Equipo, campo: 'pedidoFab' | 'pedidoDist' | 'demanda', i: number, porDefecto: number) {
  const h = estado.historial.slice(-BOT.ventana);
  if (!h.length) return porDefecto;
  return h.reduce((a, r) => a + r.equipos[X][campo][i], 0) / h.length;
}
export const enCamino = (eq: EstadoEquipo, clave: Tramo, i: number) =>
  eq.enTransito[clave].filter((e) => e.p === i).reduce((a, e) => a + e.q, 0);
const faltante = (necesidad: number, posicion: number, tope: number) =>
  clamp(Math.ceil(necesidad * BOT.cobertura - posicion), 0, tope);

/**
 * Decisión de un bot (sin azar). `estado` = partida tras cerrar t-1; `t` = semana que se decide.
 * También sirve como "sugerencia" para las personas.
 */
export function decisionBot(estado: Estado, X: Equipo, rol: 'fabrica', t: number): DecFabrica;
export function decisionBot(estado: Estado, X: Equipo, rol: 'distribuidor', t: number): DecDistribuidor;
export function decisionBot(estado: Estado, X: Equipo, rol: 'tienda', t: number): DecTienda;
export function decisionBot(estado: Estado, X: Equipo, rol: Rol, t: number): DecFabrica | DecDistribuidor | DecTienda;
export function decisionBot(estado: Estado, X: Equipo, rol: Rol, t: number) {
  const P = productos(estado);
  const eq = estado.equipos[X];
  const mitad = (i: number) => P[i].demMedia / 2;

  if (rol === 'fabrica') {
    return {
      calidad: P.map(() => 'estandar' as CalidadId),
      produccion: P.map((p, i) => faltante(
        promedioReciente(estado, X, 'pedidoFab', i, mitad(i)),
        eq.stock.fabrica[i].q + enCamino(eq, 'prod', i),
        p.capProd)),
    };
  }
  if (rol === 'distribuidor') {
    const pedido = P.map((_, i) => faltante(
      promedioReciente(estado, X, 'pedidoDist', i, mitad(i)),
      eq.stock.distribuidor[i].q + enCamino(eq, 'fd', i),
      CONFIG.tope));
    let demanda = 0;
    let margen = 0;
    let posicion = 0;
    P.forEach((_, i) => {
      const d = promedioReciente(estado, X, 'demanda', i, mitad(i));
      demanda += d;
      margen += d * Math.max(0, eq.precio[i] - CONFIG.costoBase * CALIDADES[eq.calidad[i]].costo);
      posicion += eq.stock.tienda[i].q + enCamino(eq, 'dt', i);
    });
    const hayStock = demanda > 0 && posicion / demanda >= BOT.minCoberturaPuja;
    const pujas = INF_KEYS.map((k, idx) => {
      const inf = estado.inf[k];
      if (t < inf.ocupadoHasta || !hayStock) return null;
      const info = INFLUENCERS[k];
      const alza = (info.min + info.max) / 2;
      const ganancia = margen * alza * 0.7 * CONFIG.duracionInfluencer;
      const fr = BOT.fraccionesPuja[(t + idx) % BOT.fraccionesPuja.length];
      const monto = Math.min(CONFIG.topeMonto, Math.floor(ganancia * fr));
      return monto >= 1 ? { monto } : null;
    });
    return { pedido, pujas };
  }
  const precio: number[] = [];
  const pedido = P.map((_, i) => {
    const d = promedioReciente(estado, X, 'demanda', i, mitad(i));
    const pos = eq.stock.tienda[i].q + enCamino(eq, 'dt', i);
    precio.push(CONFIG.precioBase);
    return faltante(d, pos, CONFIG.tope);
  });
  return { precio, pedido };
}

export { crearRng };
