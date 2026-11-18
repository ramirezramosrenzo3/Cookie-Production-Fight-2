/**
 * REGLAS Y PARÁMETROS DEL JUEGO
 * ------------------------------------------------------------------
 * Todos los números ajustables viven aquí. Son los mismos que la v1 (5.1.3),
 * de modo que una partida jugada con el motor nuevo da exactamente el mismo
 * resultado que con el motor original (ver tests/paridad.test.ts).
 */

export const VERSION_MOTOR = '2.0.0';
/** Versión de reglas equivalente de la v1 (para la prueba de paridad). */
export const VERSION_REGLAS_V1 = '5.1.3';

export const CONFIG = {
  lead: 2, // semanas de espera en cada etapa
  costoBase: 2.0, // costo de producir una galleta (calidad estándar)
  precioFab: 2.6, // valor de inventario en distribuidor
  precioDist: 3.4, // valor de inventario en tienda
  precioBase: 4.5, // precio al cliente de partida (referencia de la demanda)
  precioMin: 2.5,
  precioMax: 8.0,
  elasticidad: 1.8,
  crecimientoMercado: 0.5,
  tasaMantenimiento: 0.03,
  probDesvioMin: 0.2,
  probDesvioMax: 0.6,
  ruidoDemanda: 0.3,
  tope: 500, // máximo de unidades por pedido
  topeMonto: 10000, // máximo de una puja
  duracionInfluencer: 2,
  stockInicial: { fabrica: 1.5, distribuidor: 1, tienda: 0.5 },
} as const;

export type Equipo = 'A' | 'B';
export type Rol = 'fabrica' | 'distribuidor' | 'tienda';
export type CalidadId = 'economico' | 'estandar' | 'premium';
export type InfKey = 'A' | 'B' | 'C';
export type HabilidadId = 'incendio' | 'fake' | 'gta';

export const EQUIPOS: readonly Equipo[] = ['A', 'B'];
export const ROLES: readonly Rol[] = ['fabrica', 'distribuidor', 'tienda'];
export const INF_KEYS: readonly InfKey[] = ['A', 'B', 'C'];
export const rival = (X: Equipo): Equipo => (X === 'A' ? 'B' : 'A');

export interface Producto {
  id: string;
  nombre: string;
  color: string;
  capProd: number;
  demMedia: number;
}

export const PRODUCTOS_TODOS: readonly Producto[] = [
  { id: 'chocolate', nombre: 'Chocolate', color: '#8B5E3C', capProd: 250, demMedia: 90 },
  { id: 'vainilla', nombre: 'Vainilla', color: '#E9D3A8', capProd: 220, demMedia: 80 },
  { id: 'menta', nombre: 'Menta', color: '#7FD3A1', capProd: 200, demMedia: 70 },
  { id: 'fresa', nombre: 'Fresa', color: '#F38DB5', capProd: 180, demMedia: 60 },
  { id: 'mora', nombre: 'Mora', color: '#8E4B77', capProd: 160, demMedia: 50 },
];

export const productosDe = (n: number): Producto[] => PRODUCTOS_TODOS.slice(0, normalizarSabores(n));
export function normalizarSabores(n: unknown): number {
  const v = Math.floor(Number(n));
  return Number.isFinite(v) ? Math.max(3, Math.min(PRODUCTOS_TODOS.length, v)) : PRODUCTOS_TODOS.length;
}

export const DIFICULTADES = [
  { sabores: 3, nombre: 'Paseo en el parque', desc: 'Ideal para aprender' },
  { sabores: 4, nombre: 'Emprendimiento', desc: 'Más productos, más presión' },
  { sabores: 5, nombre: 'Caos de oficina', desc: 'La experiencia completa' },
] as const;

export const CALIDADES: Record<CalidadId, { nombre: string; costo: number; demanda: number }> = {
  economico: { nombre: 'Económico', costo: 0.8, demanda: 0.85 },
  estandar: { nombre: 'Estándar', costo: 1.0, demanda: 1.0 },
  premium: { nombre: 'Premium', costo: 1.25, demanda: 1.25 },
};
export const CALIDAD_IDS = Object.keys(CALIDADES) as CalidadId[];

export const INFLUENCERS: Record<InfKey, { nombre: string; apodo: string; min: number; max: number }> = {
  A: { nombre: 'Influencer A', apodo: '@MiguelitoCrunch', min: 0.05, max: 0.12 },
  B: { nombre: 'Influencer B', apodo: '@LaReinaDelHorno', min: 0.08, max: 0.13 },
  C: { nombre: 'Influencer C', apodo: '@GalletaViral', min: 0.09, max: 0.16 },
};

/* ---------------------------- EVENTOS ---------------------------- */
export interface EventoDef {
  id: string;
  nombre: string;
  duracion: number;
  /** cambio porcentual de demanda por índice de sabor */
  efectos: Record<number, number>;
  desc: string;
  logistico?: boolean;
  operativo?: string;
}

export const EVENTOS: readonly EventoDef[] = [
  { id: 'navidad', nombre: 'Navidad', duracion: 4, efectos: { 0: 0.2, 1: 0.2, 4: -0.1 },
    desc: 'Llegó la Navidad, aumenta el consumo de galletas tradicionales.' },
  { id: 'maincra', nombre: 'MAINCRA', duracion: 4, efectos: { 0: -0.15, 1: -0.15, 2: -0.15, 3: -0.15, 4: 0.05 },
    desc: '¡Ratas en la cocina! Que inicie la desratización.' },
  { id: 'cyber', nombre: 'Cyber Galletas', duracion: 4, efectos: { 3: 0.1, 1: 0.1, 4: 0.04 },
    desc: 'Llegaron las ofertas de Cyber Galletas.' },
  { id: 'covid', nombre: 'COVID-20', duracion: 4, efectos: { 0: -0.07, 1: -0.07 },
    desc: 'La gente empezará a comprar más papel higiénico que galletas.' },
  { id: 'nino', nombre: 'Fenómeno del Niño', duracion: 4, efectos: { 0: -0.16, 3: 0.12, 4: 0.05 },
    desc: '¡Lima está que arde! Todo se derrite...' },
  { id: 'mochila', nombre: 'Mochila perdida', duracion: 4, efectos: { 2: -0.11, 1: -0.11 },
    desc: 'Durante un paseo escolar se perdió una mochila llena de galletas.' },
  { id: 'happy', nombre: 'Happy Cookies', duracion: 4, efectos: { 2: 0.19, 0: -0.03, 1: -0.03, 3: -0.03, 4: -0.03 },
    desc: 'El sabor de la menta... ¿es más pastoso?' },
  { id: 'muffin', nombre: '¡¡¡ALERTA MUFFIN!!!', duracion: 4, efectos: { 0: -0.09, 1: -0.09, 4: -0.09 },
    desc: 'Ha llegado un nuevo competidor de MUFFINS.' },
  { id: 'huelga', nombre: 'Huelga de transportistas', duracion: 1, efectos: {}, logistico: true,
    desc: 'Han cerrado la Panamericana Sur entre Ica y Lima.',
    operativo: 'Esta semana no llegan las reposiciones ni los traslados. Lo pendiente no se pierde: llega la próxima semana.' },
];
export const eventoPorId = (id: string | null | undefined) => EVENTOS.find((e) => e.id === id) ?? null;

export const EVENTO_PRIMERA_RONDA = 5;
export const EVENTO_PROB_INICIAL = 31;
export const EVENTO_PROB_PASO = 5;
export const EVENTO_ESPERA = 5;
/** Segundos extra que recibe la semana en que aparece un evento (presentación). */
export const EVENTO_SEGUNDOS_EXTRA = 15;

/* -------------------------- HABILIDADES -------------------------- */
export interface HabilidadDef {
  id: HabilidadId;
  rol: Rol;
  nombre: string;
  pct: number;
  costo: number;
  enfriamiento: number;
  duracion?: number;
  aviso: string;
  efecto: string;
}

export const HABILIDADES: readonly HabilidadDef[] = [
  { id: 'incendio', rol: 'tienda', nombre: 'Incendio', pct: 0.3, costo: 40, enfriamiento: 8,
    aviso: 'INCENDIO: −30% INVENTARIO', efecto: '−30% del inventario de la tienda rival' },
  { id: 'fake', rol: 'distribuidor', nombre: 'Fake News', pct: 0.15, duracion: 2, costo: 120, enfriamiento: 6,
    aviso: 'FAKE NEWS: −15% DEMANDA', efecto: '−15% de demanda del rival por 2 semanas' },
  { id: 'gta', rol: 'fabrica', nombre: 'GTA', pct: 0.35, costo: 100, enfriamiento: 10,
    aviso: 'GTA: −35% TRANSPORTE', efecto: 'El último camión de la fábrica rival pierde 35%' },
];
export const habPorId = (id: string) => HABILIDADES.find((h) => h.id === id) ?? null;
export const habDeRol = (rol: Rol) => HABILIDADES.find((h) => h.rol === rol)!;
/** Costo en dinero del equipo (valores base para 5 sabores; baja en proporción con 3 o 4). */
export const costoHab = (def: HabilidadDef, n: number) =>
  def.costo > 0 ? Math.max(5, Math.round((def.costo * n) / 5 / 5) * 5) : 0;

/* ------------------------------ BOTS ----------------------------- */
export const BOT = {
  cobertura: 4.0,
  ventana: 3,
  minCoberturaPuja: 1.5,
  fraccionesPuja: [0.15, 0.2, 0.25],
} as const;

export const NOMBRES_EQUIPO: Record<Equipo, string> = { A: "G'sertte", B: 'Gallecolors' };
export const NOMBRES_ROL: Record<Rol, string> = { fabrica: 'Fábrica', distribuidor: 'Distribuidor', tienda: 'Tienda' };
