/** Generador pseudoaleatorio determinista (mulberry32). Idéntico al de la v1. */
export type Rng = () => number;

export function crearRng(semilla: number): Rng {
  let a = semilla >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Azar de la semana t (demanda, desvío, subastas). */
export const rngSemana = (semilla: number, t: number) => crearRng((semilla ^ Math.imul(t, 0x9e3779b1)) >>> 0);
/** Azar de la evaluación de eventos de la semana n. */
export const rngEvento = (semilla: number, n: number) =>
  crearRng((semilla ^ Math.imul(n, 0x85ebca6b) ^ 0x5bd1e995) >>> 0);

/** Semilla aleatoria para partidas locales. */
export const semillaNueva = () => Math.floor(Math.random() * 2_000_000_000);
