/**
 * PARIDAD CON LA V1
 * El motor nuevo debe dar EXACTAMENTE el mismo resultado que game.js 5.1.3
 * con la misma semilla y las mismas decisiones (incluidos bots, eventos y habilidades).
 */
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
  crearRng, reproducir, estadoInicial, avanzarConSemilla, puntajes,
  type Asientos, type DecSemana, type Equipo, type Rol,
} from '../src/engine';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const L = require('../legacy/game.legacy.cjs');

const CAL = ['economico', 'estandar', 'premium'];

/** Decisiones aleatorias pero válidas (mismo generador para ambos motores) */
function decisionesAzar(seed: number, rondas: number, n: number): DecSemana[] {
  const r = crearRng(seed);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const arr = (f: () => unknown) => Array.from({ length: n }, f);
  const out: DecSemana[] = [];
  for (let t = 1; t <= rondas; t++) {
    const dec: DecSemana = {};
    for (const X of ['A', 'B'] as Equipo[]) {
      dec[X] = {
        fabrica: { calidad: arr(() => pick(CAL)) as never, produccion: arr(() => Math.floor(r() * 200)) as number[], habilidad: r() < 0.15 },
        distribuidor: {
          pedido: arr(() => Math.floor(r() * 200)) as number[],
          pujas: [0, 1, 2].map(() => (r() < 0.5 ? null : { monto: Math.floor(r() * 60) })),
          habilidad: r() < 0.15,
        },
        tienda: { precio: arr(() => 2 + r() * 6) as number[], pedido: arr(() => Math.floor(r() * 150)) as number[], habilidad: r() < 0.15 },
      };
      // a veces una persona no envía nada
      if (r() < 0.1) delete dec[X]!.tienda;
    }
    out.push(dec);
  }
  return out;
}

const limpiar = (h: unknown) => JSON.parse(JSON.stringify(h, (k, v) => (k === 'autopiloto' ? undefined : v)));

function legacyJugar(seed: number, decs: DecSemana[], n: number, bots: [Equipo, Rol][] = []) {
  L.setSabores(n);
  const e = L.estadoInicial();
  e.semilla = seed >>> 0;
  decs.forEach((d, idx) => {
    const t = idx + 1;
    const dec = JSON.parse(JSON.stringify(d));
    for (const [X, rol] of bots) {
      dec[X] = dec[X] || {};
      dec[X][rol] = L.decisionBot(e, X, rol, t);
    }
    L.avanzarRonda(e, t, dec, L.crearRng((seed ^ Math.imul(t, 0x9e3779b1)) >>> 0));
  });
  return e;
}

describe('paridad con el motor v1 (5.1.3)', () => {
  it('confirma la versión del motor original', () => {
    expect(L.VERSION).toBe('5.1.3');
  });

  for (const n of [3, 4, 5]) {
    it(`decisiones al azar, ${n} sabores, 12 semillas × 40 semanas`, () => {
      for (let s = 1; s <= 12; s++) {
        const seed = 1000 * n + s * 7919;
        const decs = decisionesAzar(s, 40, n);
        const viejo = legacyJugar(seed, decs, n);
        const nuevo = reproducir(seed, decs, { sabores: n });
        expect(puntajes(nuevo)).toEqual(L.puntajes(viejo));
        expect(limpiar(nuevo.historial)).toEqual(limpiar(viejo.historial));
        expect(nuevo.eventosUsados).toEqual(viejo.eventosUsados);
      }
    });
  }

  it('bots resueltos dentro del motor = bots enviados por los celulares en la v1', () => {
    const bots: [Equipo, Rol][] = [['A', 'fabrica'], ['A', 'distribuidor'], ['B', 'fabrica'], ['B', 'distribuidor'], ['B', 'tienda']];
    const asientos: Asientos = {
      A: { fabrica: 'bot', distribuidor: 'bot', tienda: 'humano' },
      B: { fabrica: 'bot', distribuidor: 'bot', tienda: 'bot' },
    };
    for (let s = 1; s <= 8; s++) {
      const seed = 424242 + s;
      // la persona (tienda A) juega al azar; el resto son bots
      const decs = decisionesAzar(s + 50, 30, 5).map((d) => ({ A: { tienda: d.A!.tienda } }));
      const viejo = legacyJugar(seed, decs, 5, bots);
      const nuevo = estadoInicial({ sabores: 5, asientos });
      nuevo.semilla = seed;
      decs.forEach((d, i) => avanzarConSemilla(nuevo, i + 1, d));
      expect(puntajes(nuevo)).toEqual(L.puntajes(viejo));
      expect(limpiar(nuevo.historial)).toEqual(limpiar(viejo.historial));
    }
  });
});
