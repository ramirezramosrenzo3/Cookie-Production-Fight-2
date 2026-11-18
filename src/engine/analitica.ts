/**
 * ANALÍTICA DE LA PARTIDA (para el informe final y el modo presentador)
 * Todo se calcula a partir del historial: no cambia el resultado del juego.
 */
import { EQUIPOS, NOMBRES_EQUIPO, rival, type Equipo, type Rol } from './reglas';
import { sumaUtil, type Estado } from './motor';

const suma = (a: number[]) => a.reduce((x, y) => x + y, 0);
function varianza(a: number[]) {
  if (a.length < 2) return 0;
  const m = suma(a) / a.length;
  return suma(a.map((x) => (x - m) ** 2)) / (a.length - 1);
}

export interface Serie { semana: number; valor: number }

export interface KpiEquipo {
  equipo: Equipo;
  total: number;
  /** utilidad acumulada al cierre de cada semana */
  acumulada: number[];
  ventasUnidades: number;
  demandaUnidades: number;
  /** % de la demanda atendida (incluye clientes desviados recibidos) */
  nivelServicio: number;
  ventasPerdidas: number;
  mantenimiento: number;
  influencersGanados: number;
  gastoInfluencers: number;
  habilidadesUsadas: number;
  danoCausado: number;
  danoRecibido: number;
  precioPromedio: number;
  /**
   * Efecto látigo: desviación estándar de los pedidos de cada etapa ÷ la de la demanda
   * (1 = sin amplificación). Se ignoran las 2 primeras semanas (arranque) y se acota a 20×
   * para que partidas cortas o con demanda casi constante no den cifras absurdas.
   */
  latigo: Record<Rol, number>;
  /** Series por semana (sumando sabores) para el gráfico de efecto látigo */
  series: { demanda: number[]; tienda: number[]; distribuidor: number[]; fabrica: number[] };
}

export function kpis(estado: Estado): Record<Equipo, KpiEquipo> {
  const H = estado.historial;
  const out = {} as Record<Equipo, KpiEquipo>;
  for (const X of EQUIPOS) {
    let acc = 0;
    const acumulada = H.map((r) => (acc += r.equipos[X].utilidadRonda.total));
    const demanda = H.map((r) => suma(r.equipos[X].demanda));
    const tienda = H.map((r) => suma(r.equipos[X].pedidoDist));
    const distribuidor = H.map((r) => suma(r.equipos[X].pedidoFab));
    const fabrica = H.map((r) => suma(r.equipos[X].produccion));
    const desde = H.length >= 6 ? 2 : 0;
    const sd = (a: number[]) => Math.sqrt(varianza(a.slice(desde)));
    const sdDem = Math.max(sd(demanda), 0.05 * (suma(demanda) / Math.max(1, demanda.length)), 1);
    const latigo = (a: number[]) => Math.min(20, sd(a) / sdDem);
    const vendidas = suma(H.map((r) => suma(r.equipos[X].vendido)));
    const dem = suma(demanda);
    const recibidos = suma(H.map((r) => suma(r.equipos[X].desvRec)));
    let danoCausado = 0;
    let danoRecibido = 0;
    H.forEach((r) => r.habilidades.forEach((h) => {
      if (h.de === X) danoCausado += h.perdido;
      if (h.contra === X) danoRecibido += h.perdido;
    }));
    const u = estado.equipos[X].utilidad;
    const precios = H.flatMap((r) => r.equipos[X].precio);
    out[X] = {
      equipo: X,
      total: sumaUtil(u),
      acumulada,
      ventasUnidades: vendidas,
      demandaUnidades: dem,
      nivelServicio: dem + recibidos > 0 ? Math.min(1, vendidas / (dem + recibidos)) : 1,
      ventasPerdidas: suma(H.map((r) => suma(r.equipos[X].perdidoFinal))),
      mantenimiento: u.mantenimiento,
      influencersGanados: H.reduce((a, r) => a + r.equipos[X].pujas.filter((p) => p === 'gano').length, 0),
      gastoInfluencers: u.influencers,
      habilidadesUsadas: H.reduce((a, r) => a + r.equipos[X].habilidadesUsadas.length, 0),
      danoCausado, danoRecibido,
      precioPromedio: precios.length ? suma(precios) / precios.length : 0,
      latigo: { tienda: latigo(tienda), distribuidor: latigo(distribuidor), fabrica: latigo(fabrica) },
      series: { demanda, tienda, distribuidor, fabrica },
    };
  }
  return out;
}

export interface Premio { id: string; icono: string; titulo: string; equipo: Equipo; detalle: string }

/** Premios divertidos para la pantalla final (máximo uno por categoría). */
export function premios(estado: Estado): Premio[] {
  if (!estado.historial.length) return [];
  const k = kpis(estado);
  const [A, B] = [k.A, k.B];
  const lista: Premio[] = [];
  const mejor = (f: (x: KpiEquipo) => number, mayor = true) => {
    const a = f(A), b = f(B);
    if (a === b) return null;
    return (mayor ? a > b : a < b) ? A : B;
  };
  const pct = (x: number) => Math.round(x * 100) + '%';

  const serv = mejor((x) => x.nivelServicio);
  if (serv) lista.push({ id: 'servicio', icono: '🎯', titulo: 'Estante siempre lleno', equipo: serv.equipo,
    detalle: `Atendió el ${pct(serv.nivelServicio)} de sus clientes` });
  const lat = mejor((x) => x.latigo.fabrica + x.latigo.distribuidor, false);
  if (lat) lista.push({ id: 'zen', icono: '🧘', titulo: 'Cadena zen', equipo: lat.equipo,
    detalle: 'Pedidos más estables (menos efecto látigo)' });
  const inf = mejor((x) => x.influencersGanados);
  if (inf && inf.influencersGanados > 0) lista.push({ id: 'fama', icono: '📸', titulo: 'Reyes del TikTok', equipo: inf.equipo,
    detalle: `${inf.influencersGanados} influencers contratados` });
  const dano = mejor((x) => x.danoCausado);
  if (dano && dano.danoCausado > 0) lista.push({ id: 'villano', icono: '😈', titulo: 'Villanos del año', equipo: dano.equipo,
    detalle: `Destruyeron ${dano.danoCausado} galletas rivales` });
  const ahorro = mejor((x) => x.mantenimiento, false);
  if (ahorro) lista.push({ id: 'ahorro', icono: '🐷', titulo: 'Almacén eficiente', equipo: ahorro.equipo,
    detalle: 'Menor costo de mantener inventario' });
  return lista;
}

/** Consejos para aprender de la partida (en lenguaje simple). */
export function consejos(estado: Estado, X: Equipo): string[] {
  const k = kpis(estado)[X];
  const r = kpis(estado)[rival(X)];
  const out: string[] = [];
  if (k.nivelServicio < 0.85) out.push(`Perdieron ${k.ventasPerdidas} ventas por falta de stock. Pidan antes: todo tarda 2 semanas en llegar.`);
  const margen = estado.equipos[X].utilidad.ventas;
  if (margen > 0 && k.mantenimiento / margen > 0.2) out.push(`El inventario les costó ${Math.round((k.mantenimiento / margen) * 100)}% del margen. Guardar galletas no es gratis.`);
  const maxLat = Math.max(k.latigo.distribuidor, k.latigo.fabrica);
  if (estado.historial.length >= 8 && maxLat > 2) out.push(`Sus pedidos oscilaron ${maxLat.toFixed(1)} veces más que la demanda real (efecto látigo). Pedir parejo y comunicarse ayuda.`);
  if (k.precioPromedio > 0 && Math.abs(k.precioPromedio - 4.5) < 0.05 && r.total > k.total) out.push('Nunca movieron el precio. Bajarlo atrae clientes; subirlo deja más margen por galleta.');
  if (k.gastoInfluencers > k.total * 0.3 && k.total > 0) out.push('Gastaron mucho en influencers respecto a lo que ganaron. Pujar menos suele rendir más.');
  if (!out.length) out.push(`¡Buen trabajo! Nivel de servicio ${Math.round(k.nivelServicio * 100)}% y cadena estable.`);
  return out;
}

export const nombreEquipo = (X: Equipo) => NOMBRES_EQUIPO[X];
