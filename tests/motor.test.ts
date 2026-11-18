import { describe, expect, it } from 'vitest';
import {
  avanzarConSemilla, costoHab, crearRng, decisionBot, estadoInicial, habDeRol, kpis, leerDecision, premios,
  consejos, puntajes, reproducir, avanzarRonda, type Asientos, type DecSemana,
} from '../src/engine';

const TODO_BOT: Asientos = {
  A: { fabrica: 'bot', distribuidor: 'bot', tienda: 'bot' },
  B: { fabrica: 'bot', distribuidor: 'bot', tienda: 'bot' },
};
const vacias = (n: number): DecSemana[] => Array.from({ length: n }, () => ({}));

describe('determinismo', () => {
  it('misma semilla, mismo resultado; semilla distinta, partida distinta', () => {
    const a = reproducir(777, vacias(20), { sabores: 5, asientos: TODO_BOT });
    const b = reproducir(777, vacias(20), { sabores: 5, asientos: TODO_BOT });
    const c = reproducir(778, vacias(20), { sabores: 5, asientos: TODO_BOT });
    expect(JSON.stringify(a.historial)).toBe(JSON.stringify(b.historial));
    expect(JSON.stringify(a.historial)).not.toBe(JSON.stringify(c.historial));
  });

  it('avanzar semana a semana = reproducir desde cero', () => {
    const inc = estadoInicial({ sabores: 4, asientos: TODO_BOT });
    inc.semilla = 99;
    for (let t = 1; t <= 15; t++) avanzarConSemilla(inc, t, {});
    const full = reproducir(99, vacias(15), { sabores: 4, asientos: TODO_BOT });
    expect(puntajes(inc)).toEqual(puntajes(full));
  });
});

describe('subasta', () => {
  it('gana el monto más alto y paga su monto; el perdedor no paga', () => {
    const e = estadoInicial({ sabores: 5 });
    avanzarRonda(e, 1, {
      A: { distribuidor: { pujas: [{ monto: 40 }, null, null] } },
      B: { distribuidor: { pujas: [{ monto: 25 }, null, null] } },
    }, crearRng(2));
    expect(e.inf.A.dueno).toBe('A');
    expect(e.equipos.A.utilidad.influencers).toBe(40);
    expect(e.equipos.B.utilidad.influencers).toBe(0);
  });
  it('empate: gana la mejor calidad promedio', () => {
    const e = estadoInicial({ sabores: 3 });
    avanzarRonda(e, 1, {
      A: { fabrica: { calidad: ['premium', 'premium', 'premium'] }, distribuidor: { pujas: [{ monto: 30 }, null, null] } },
      B: { fabrica: { calidad: ['economico', 'economico', 'economico'] }, distribuidor: { pujas: [{ monto: 30 }, null, null] } },
    }, crearRng(3));
    expect(e.inf.A.dueno).toBe('A');
    expect(e.historial[0].subasta.A.desempate).toBe(true);
  });
});

describe('saneo de decisiones', () => {
  it('acota precios, cantidades y pujas', () => {
    const d = leerDecision({
      fabrica: { produccion: [9999, -5, 10.7] },
      tienda: { precio: [100, 0.1, null], pedido: [9999, 3, 4] },
      distribuidor: { pujas: [{ monto: 1e9 }, { monto: -1 }, null] },
    }, 3);
    expect(d.produccion).toEqual([250, 0, 10]);
    expect(d.precio).toEqual([8, 2.5, null]);
    expect(d.pedidoDist[0]).toBe(500);
    expect(d.pujas).toEqual([{ monto: 10000 }, null, null]);
  });
});

describe('bots y autopiloto', () => {
  it('dos equipos de bots quedan parejos y atienden casi toda la demanda', () => {
    let ganaA = 0;
    let servicio = 0;
    const N = 60;
    for (let s = 1; s <= N; s++) {
      const e = reproducir(s * 31337, vacias(30), { sabores: 5, asientos: TODO_BOT });
      const p = puntajes(e);
      if (p.A > p.B) ganaA++;
      const k = kpis(e);
      servicio += (k.A.nivelServicio + k.B.nivelServicio) / 2;
    }
    expect(ganaA / N).toBeGreaterThan(0.3);
    expect(ganaA / N).toBeLessThan(0.7);
    expect(servicio / N).toBeGreaterThan(0.95);
  });

  it('con autopiloto, una persona que no envía es reemplazada por el bot', () => {
    const sin = reproducir(5, vacias(10), { sabores: 5 });
    const con = reproducir(5, vacias(10), { sabores: 5, autopiloto: true });
    expect(puntajes(con).A).toBeGreaterThan(puntajes(sin).A);
    expect(con.historial[0].equipos.A.autopiloto).toEqual(['fabrica', 'distribuidor', 'tienda']);
    expect(sin.historial[0].equipos.A.autopiloto).toEqual([]);
  });

  it('la decisión que envía una persona manda sobre el autopiloto', () => {
    const e = reproducir(5, [{ A: { tienda: { precio: [7, 7, 7, 7, 7] } } }], { sabores: 5, autopiloto: true });
    expect(e.equipos.A.precio[0]).toBe(7);
    expect(e.historial[0].equipos.A.autopiloto).not.toContain('tienda');
  });

  it('decisionBot no usa azar', () => {
    const e = reproducir(11, vacias(5), { sabores: 5, asientos: TODO_BOT });
    expect(decisionBot(e, 'A', 'distribuidor', 6)).toEqual(decisionBot(e, 'A', 'distribuidor', 6));
  });
});

describe('habilidades', () => {
  it('el costo baja en proporción con menos sabores', () => {
    expect(costoHab(habDeRol('fabrica'), 5)).toBe(100);
    expect(costoHab(habDeRol('fabrica'), 3)).toBe(60);
  });
  it('incendio destruye 30% de la tienda rival la semana siguiente', () => {
    const asientos = structuredClone(TODO_BOT);
    asientos.A.tienda = 'humano';
    const e = reproducir(3, vacias(6), { sabores: 5, asientos, autopiloto: true });
    const antes = e.equipos.B.stock.tienda.map((l) => l.q);
    avanzarConSemilla(e, 7, { A: { tienda: { habilidad: true } } });
    expect(e.pend).toHaveLength(1);
    // la semana 8 ejecuta el incendio antes de llegadas y ventas
    const stockAntes8 = e.equipos.B.stock.tienda.map((l) => l.q);
    avanzarConSemilla(e, 8, {});
    const h = e.historial[7].habilidades[0];
    expect(h.id).toBe('incendio');
    expect(h.perdido).toBe(stockAntes8.reduce((a, q) => a + Math.round(q * 0.3), 0));
    expect(antes.length).toBe(5);
  });
});

describe('analítica', () => {
  it('calcula KPIs, premios y consejos coherentes', () => {
    const e = reproducir(2024, vacias(30), { sabores: 5, asientos: TODO_BOT });
    const k = kpis(e);
    expect(k.A.acumulada).toHaveLength(30);
    expect(k.A.acumulada[29]).toBeCloseTo(puntajes(e).A, 6);
    expect(k.A.nivelServicio).toBeGreaterThan(0.8);
    expect(k.A.latigo.tienda).toBeGreaterThan(0);
    expect(premios(e).length).toBeGreaterThan(0);
    expect(consejos(e, 'A').length).toBeGreaterThan(0);
  });
});
