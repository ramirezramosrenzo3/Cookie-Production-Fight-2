/** Paneles de decisión por rol: tarjetas por sabor con controles táctiles. */
import {
  CALIDADES, CALIDAD_IDS, CONFIG, INFLUENCERS, INF_KEYS, NOMBRES_EQUIPO, decisionBot, enCamino, productos,
  type CalidadId, type Estado, type Equipo, type Rol, type Tramo, type Etapa,
} from '../../engine';
import { actual, borrador, editar, juego, revision, yo } from '../../state';
import { Galleta, Segmentado, Stepper, money, money2, num, pct } from '../comun';

const TRAMO: Record<Rol, Tramo> = { fabrica: 'prod', distribuidor: 'fd', tienda: 'dt' };
const CAMPO: Record<Rol, 'pedidoFab' | 'pedidoDist' | 'demanda'> = { fabrica: 'pedidoFab', distribuidor: 'pedidoDist', tienda: 'demanda' };

/** Lo que esta etapa suele tener que entregar por semana (promedio de 3 semanas). */
function consumo(e: Estado, X: Equipo, rol: Rol, i: number) {
  const h = e.historial.slice(-3);
  if (!h.length) return productos(e)[i].demMedia / 2;
  return h.reduce((a, r) => a + r.equipos[X][CAMPO[rol]][i], 0) / h.length;
}

function Cobertura({ semanas }: { semanas: number }) {
  const cls = semanas < 2 ? 'baja' : semanas > 5.5 ? 'alta' : 'ok';
  const txt = semanas < 2 ? 'Riesgo de quiebre' : semanas > 5.5 ? 'Demasiado stock' : 'Bien cubierto';
  return <span class={`cobertura ${cls}`} title={txt}>{semanas >= 99 ? '∞' : semanas.toFixed(1)} sem</span>;
}

function Llegadas({ e, X, rol, i }: { e: Estado; X: Equipo; rol: Rol; i: number }) {
  const eq = e.equipos[X];
  const t = actual.value;
  const tr = TRAMO[rol];
  const llega = (w: number) => eq.enTransito[tr].filter((x) => x.p === i && Math.min(1, Math.max(0, x.llega - t)) === w).reduce((a, x) => a + x.q, 0);
  return <span class="llegadas" title="Llega al cerrar esta semana · la próxima">🚚 {num(llega(0))} · {num(llega(1))}</span>;
}

export function PanelRol() {
  revision.value;
  const e = juego.value;
  const me = yo.value;
  const b = borrador.value;
  if (!e || !me?.rol || !me.equipo || !b) return null;
  const X = me.equipo as Equipo;
  const rol = me.rol;
  const P = productos(e);
  const eq = e.equipos[X];
  const stock = eq.stock[rol as Etapa];
  const bot = decisionBot(e, X, rol, actual.value) as Record<string, unknown>;
  const ult = e.historial[e.historial.length - 1]?.equipos[X];

  const sugerir = () => editar((d) => {
    if (rol === 'fabrica') { d.produccion = (bot.produccion as number[]).slice(); }
    else if (rol === 'distribuidor') { d.pedido = (bot.pedido as number[]).slice(); }
    else { d.pedido = (bot.pedido as number[]).slice(); }
  });
  const repetir = () => editar((d) => {
    if (!ult) return;
    if (rol === 'fabrica') d.produccion = ult.produccion.slice();
    else if (rol === 'distribuidor') d.pedido = ult.pedidoFab.slice();
    else d.pedido = ult.pedidoDist.slice();
  });

  return (
    <div class="panel-rol">
      <div class="atajos">
        <button type="button" class="chip-btn" onClick={sugerir} title="Lo que haría un bot prudente">💡 Sugerencia</button>
        {ult && <button type="button" class="chip-btn" onClick={repetir}>↺ Igual que la semana pasada</button>}
      </div>
      {P.map((p, i) => {
        const cons = consumo(e, X, rol, i);
        const pedidoActual = rol === 'fabrica' ? b.produccion[i] : b.pedido[i];
        const posicion = stock[i].q + enCamino(eq, TRAMO[rol], i) + pedidoActual;
        const sem = cons > 0 ? posicion / cons : 99;
        return (
          <article class="sabor" style={{ '--sabor': p.color }}>
            <header>
              <Galleta i={i} tam={34} />
              <div class="sabor-t"><b>{p.nombre}</b>
                <small>📦 {num(stock[i].q)} en almacén · <Llegadas e={e} X={X} rol={rol} i={i} /></small>
              </div>
              <Cobertura semanas={sem} />
            </header>
            {rol === 'fabrica' && (
              <>
                <Segmentado<CalidadId> etiqueta={`Calidad ${p.nombre}`} valor={b.calidad[i]}
                  onCambio={(v) => editar((d) => { d.calidad[i] = v; })}
                  opciones={CALIDAD_IDS.map((k) => ({ v: k, t: CALIDADES[k].nombre, sub: money2(CONFIG.costoBase * CALIDADES[k].costo) }))} />
                <div class="campo-linea"><span>Producir <small>(máx. {p.capProd})</small></span>
                  <Stepper etiqueta={`Producir ${p.nombre}`} valor={b.produccion[i]} max={p.capProd} onCambio={(v) => editar((d) => { d.produccion[i] = v; })} />
                </div>
                {ult && <small class="nota">El distribuidor te pidió {num(ult.pedidoFab[i])}, despachaste {num(ult.despFD[i])}.</small>}
              </>
            )}
            {rol === 'distribuidor' && (
              <>
                <div class="campo-linea"><span>Pedir a fábrica</span>
                  <Stepper etiqueta={`Pedir ${p.nombre}`} valor={b.pedido[i]} max={CONFIG.tope} onCambio={(v) => editar((d) => { d.pedido[i] = v; })} />
                </div>
                {ult && <small class="nota">La tienda te pidió {num(ult.pedidoDist[i])}, le despachaste {num(ult.despDT[i])}.</small>}
              </>
            )}
            {rol === 'tienda' && (
              <>
                <div class="campo-linea"><span>Precio</span>
                  <Stepper etiqueta={`Precio ${p.nombre}`} valor={b.precio[i]} min={CONFIG.precioMin} max={CONFIG.precioMax} paso={0.1} decimales={2}
                    onCambio={(v) => editar((d) => { d.precio[i] = v; })} />
                </div>
                <input type="range" class="rango" min={CONFIG.precioMin} max={CONFIG.precioMax} step={0.05} value={b.precio[i]} aria-label={`Precio ${p.nombre}`}
                  onInput={(ev) => editar((d) => { d.precio[i] = Math.round(Number((ev.target as HTMLInputElement).value) * 100) / 100; })} />
                <div class="campo-linea"><span>Pedir al distribuidor</span>
                  <Stepper etiqueta={`Pedir ${p.nombre}`} valor={b.pedido[i]} max={CONFIG.tope} onCambio={(v) => editar((d) => { d.pedido[i] = v; })} />
                </div>
                {ult && <small class="nota">Demanda {num(ult.demanda[i])} · vendiste {num(ult.vendido[i])}{ult.perdidoFinal[i] > 0 ? <b class="neg"> · perdiste {num(ult.perdidoFinal[i])}</b> : null}</small>}
              </>
            )}
          </article>
        );
      })}
      {rol === 'distribuidor' && <Subasta />}
      <Estimado />
    </div>
  );
}

function Subasta() {
  const e = juego.value!;
  const b = borrador.value!;
  const t = actual.value;
  return (
    <section class="subasta">
      <h3>📸 Influencers <small>puja secreta · gana el monto más alto y paga lo que ofreció</small></h3>
      <div class="inf-grid">
        {INF_KEYS.map((k, idx) => {
          const inf = e.inf[k];
          const info = INFLUENCERS[k];
          const ocupado = t < inf.ocupadoHasta;
          return (
            <div class={`inf ${ocupado ? 'ocupado' : ''} ${ocupado && inf.dueno ? 'dueno-' + inf.dueno : ''}`}>
              <b>{info.apodo}</b>
              <small>+{pct(info.min)} a +{pct(info.max)} demanda · 2 sem</small>
              {ocupado
                ? <span class="inf-est">Con {NOMBRES_EQUIPO[inf.dueno!]} (+{pct(inf.uplift)})</span>
                : <Stepper etiqueta={`Puja ${info.apodo}`} valor={b.pujas[idx]} max={CONFIG.topeMonto} paso={10} sufijo="$"
                    onCambio={(v) => editar((d) => { d.pujas[idx] = v; })} />}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Estimado() {
  const e = juego.value!;
  const b = borrador.value!;
  const suma = (a: number[]) => a.reduce((x, y) => x + y, 0);
  let txt = '';
  if (b.rol === 'fabrica') {
    const costo = suma(b.produccion.map((q, i) => q * CONFIG.costoBase * CALIDADES[b.calidad[i]].costo));
    txt = `Producirás ${num(suma(b.produccion))} galletas (${money(costo)} en costo, se descuenta al vender).`;
  } else if (b.rol === 'distribuidor') {
    const p = suma(b.pujas.filter((_, i) => actual.value >= e.inf[INF_KEYS[i]].ocupadoHasta));
    txt = `Pedirás ${num(suma(b.pedido))} galletas a fábrica.${p > 0 ? ` Pujas: ${money(p)} (solo pagas las que ganes).` : ''}`;
  } else {
    txt = `Pedirás ${num(suma(b.pedido))} galletas. Precio promedio ${money2(suma(b.precio) / b.precio.length)}.`;
  }
  return <p class="estimado">{txt} <small>Cobertura = semanas que te alcanza el stock + lo que viene + este pedido.</small></p>;
}
