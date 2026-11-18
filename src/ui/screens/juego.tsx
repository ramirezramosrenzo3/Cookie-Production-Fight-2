import { useEffect, useState } from 'preact/hooks';
import {
  NOMBRES_EQUIPO, NOMBRES_ROL, ROLES, costoHab, habDeRol, habilidadDisponible, habPorId, productos, rival, sumaUtil,
  EVENTO_SEGUNDOS_EXTRA, INF_KEYS, INFLUENCERS,
  type Equipo, type Etapa, type Tramo,
} from '../../engine';
import {
  actual, ahora, ajustes, borrador, cambiosSinEnviar, editar, enviada, enviarDecision, enviarMensaje, eventoAhora,
  juego, mensajes, modo, restante, revision, sala, semana, sync, transicion, yo,
} from '../../state';
import { sonido, vibrar } from '../../fx/sonido';
import { Avatar, Boton, Contador, Escena, Galleta, Modal, RelojAnillo, img, money, num, pct } from '../comun';
import { PanelRol } from './roles';

type Tab = 'decidir' | 'cadena' | 'mercado';

export function Juego() {
  revision.value;
  const [tab, setTab] = useState<Tab>('decidir');
  const e = juego.value;
  const me = yo.value;
  if (!e) return <section class="card pantalla cargando"><div class="spinner" /></section>;
  if (!me?.rol) return <section class="card pantalla"><p>No apareces en esta partida.</p></section>;
  return (
    <div class="juego">
      <Hud />
      <Alertas />
      <EventoBanner />
      <nav class="tabs" role="tablist">
        {([['decidir', '🎯 Decidir'], ['cadena', '🚚 Cadena'], ['mercado', '📊 Mercado']] as [Tab, string][]).map(([k, t]) => (
          <button type="button" role="tab" aria-selected={tab === k} class={tab === k ? 'sel' : ''} onClick={() => { sonido('click'); setTab(k); }}>{t}</button>
        ))}
      </nav>
      <main class="tab-cuerpo">
        {tab === 'decidir' && <><BannerRol /><PanelRol /><Habilidad /></>}
        {tab === 'cadena' && <><Cadena />{modo.value === 'online' && <Pings />}</>}
        {tab === 'mercado' && <Mercado />}
      </main>
      <BarraEnvio />
      <EventoModal />
      <Transicion />
      <Mensajes />
    </div>
  );
}

/* ------------------------------ HUD ------------------------------ */
function Hud() {
  const e = juego.value!;
  const s = sala.value!;
  const X = yo.value!.equipo as Equipo;
  const mio = sumaUtil(e.equipos[X].utilidad);
  const otro = sumaUtil(e.equipos[rival(X)].utilidad);
  const dif = mio - otro;
  const sem = semana.value;
  const total = sem ? (s.segundos + (sem.extra || 0)) * 1000 : 0;
  return (
    <header class={`hud eq-${X}`}>
      <div class="hud-sem"><small>Semana</small><b>{Math.min(actual.value, s.total_rondas)}<span>/{s.total_rondas}</span></b></div>
      <div class="hud-dinero">
        <small>{NOMBRES_EQUIPO[X]}</small>
        <b class={mio < 0 ? 'neg' : ''}><Contador valor={mio} /></b>
        <span class={`vs ${dif > 0 ? 'gana' : dif < 0 ? 'pierde' : ''}`}>{dif === 0 ? 'Empate' : dif > 0 ? `▲ ${money(dif)}` : `▼ ${money(-dif)}`}</span>
      </div>
      <RelojAnillo restanteMs={restante.value} totalMs={total} />
      <button type="button" class="hud-son" aria-label={ajustes.value.sonido ? 'Silenciar' : 'Activar sonido'}
        onClick={() => { ajustes.value = { ...ajustes.value, sonido: !ajustes.value.sonido }; }}>{ajustes.value.sonido ? '🔊' : '🔇'}</button>
    </header>
  );
}

function BannerRol() {
  const me = yo.value!;
  const rol = me.rol!;
  const txt = { fabrica: 'Decide calidad y producción', distribuidor: 'Pide a fábrica y puja por influencers', tienda: 'Fija precios y pide al distribuidor' }[rol];
  return (
    <div class="banner-rol"><Escena rol={rol} tam={84} /><div><h2>{NOMBRES_ROL[rol]}</h2><p>{txt}</p></div></div>
  );
}

/* ------------------------------ alertas de sabotaje ------------------------------ */
function Alertas() {
  const e = juego.value!;
  const X = yo.value!.equipo as Equipo;
  const t = actual.value;
  const ultima = e.historial[e.historial.length - 1];
  const ids = new Set<string>();
  ultima?.habilidades.forEach((h) => { if (h.contra === X && h.id !== 'fake') ids.add(h.id); });
  if ((e.fakeHasta[X] || 0) >= t) ids.add('fake');
  if (!ids.size) return null;
  return (
    <div class="alertas" role="alert">
      {[...ids].map((id) => {
        const h = habPorId(id)!;
        const perdido = ultima?.habilidades.find((x) => x.id === id && x.contra === X)?.perdido;
        return <div class="alerta sacudir"><img src={img(`img/habilidades/${id}.webp`)} alt="" width={34} height={34} /><b>{h.aviso}</b>{perdido ? <small>−{num(perdido)} galletas</small> : null}</div>;
      })}
    </div>
  );
}

/* ------------------------------ eventos ------------------------------ */
const pctTxt = (f: number) => (f > 0 ? '+' : '−') + Math.round(Math.abs(f) * 100) + '%';
function Efectos({ efectos }: { efectos: Record<number, number> }) {
  const e = juego.value!;
  const n = productos(e).length;
  return (
    <div class="efectos">
      {Object.keys(efectos).map(Number).filter((i) => i < n).sort((a, b) => a - b).map((i) => (
        <span class={`efecto ${efectos[i] > 0 ? 'sube' : 'baja'}`}><Galleta i={i} tam={20} />{productos(e)[i].nombre} <b>{pctTxt(efectos[i])}</b></span>
      ))}
    </div>
  );
}

function EventoBanner() {
  const ev = eventoAhora.value;
  if (!ev) return null;
  const quedan = ev.fin - actual.value + 1;
  return (
    <section class="evento-banner">
      <img src={img(`img/eventos/${ev.id}.webp`)} alt="" width={48} height={48} />
      <div><b>{ev.def.nombre}</b> <small>{quedan === 1 ? 'última semana' : `${quedan} semanas`}</small>
        {ev.def.logistico ? <p class="op">{ev.def.operativo}</p> : <Efectos efectos={ev.def.efectos} />}</div>
    </section>
  );
}

function EventoModal() {
  const ev = eventoAhora.value;
  const sem = semana.value;
  const [visto, setVisto] = useState(0);
  const inicio = sem?.inicio ? Date.parse(sem.inicio) : 0;
  const fin = inicio + EVENTO_SEGUNDOS_EXTRA * 1000;
  const abierto = !!ev && ev.inicio === actual.value && visto !== actual.value && ahora.value < fin && sala.value?.estado === 'jugando';
  useEffect(() => { if (abierto) { sonido('evento'); vibrar(80); } }, [abierto]);
  if (!abierto || !ev) return null;
  const k = Math.max(0, (fin - ahora.value) / (EVENTO_SEGUNDOS_EXTRA * 1000));
  return (
    <Modal abierto clase="evento-modal" onCerrar={() => setVisto(actual.value)}>
      <div class="ev-barra"><i style={{ transform: `scaleX(${k})` }} /></div>
      <img class="ev-img rebote" src={img(`img/eventos/${ev.id}.webp`)} alt="" width={150} height={150} />
      <h2>{ev.def.nombre}</h2>
      <p>{ev.def.desc}</p>
      {ev.def.logistico ? <p class="op">{ev.def.operativo}</p> : <Efectos efectos={ev.def.efectos} />}
      <p class="ayuda">Dura {ev.def.duracion === 1 ? '1 semana' : `${ev.def.duracion} semanas`}. La semana recibe {EVENTO_SEGUNDOS_EXTRA} s extra.</p>
      <Boton onClick={() => setVisto(actual.value)}>Entendido</Boton>
    </Modal>
  );
}

/* ------------------------------ habilidad ------------------------------ */
function Habilidad() {
  const e = juego.value!;
  const me = yo.value!;
  const b = borrador.value;
  const [confirmar, setConfirmar] = useState(false);
  if (!b) return null;
  const X = me.equipo as Equipo;
  const hb = habDeRol(me.rol!);
  const disp = habilidadDisponible(e, X, hb.id, actual.value);
  const costo = costoHab(hb, e.n);
  const ultima = actual.value >= sala.value!.total_rondas;
  let estado: string | null = null;
  if (ultima) estado = 'No disponible en la última semana';
  else if (!disp.ok && disp.motivo === 'enfriamiento') estado = `Disponible en ${disp.faltan} sem`;
  else if (!disp.ok) estado = `Faltan ${money(costo - sumaUtil(e.equipos[X].utilidad))}`;
  return (
    <section class={`habilidad ${b.habilidad ? 'activa' : ''}`}>
      <img src={img(`img/habilidades/${hb.id}.webp`)} alt="" width={64} height={64} />
      <div class="hab-t"><b>{hb.nombre}</b><span>{hb.efecto}</span><small>Costo {money(costo)} · enfriamiento {hb.enfriamiento} sem</small></div>
      {b.habilidad
        ? <button type="button" class="hab-btn" onClick={() => editar((d) => { d.habilidad = false; })}>Quitar</button>
        : <button type="button" class="hab-btn usar" disabled={!!estado} onClick={() => setConfirmar(true)}>{estado ?? 'Usar'}</button>}
      <Modal abierto={confirmar} onCerrar={() => setConfirmar(false)} clase="hab-modal">
        <img class="rebote" src={img(`img/habilidades/${hb.id}.webp`)} alt="" width={130} height={130} />
        <h2>{hb.nombre}</h2>
        <p><b>{hb.efecto}</b></p>
        <p class="ayuda">Cuesta {money(costo)} del dinero del equipo. Se ejecuta al cerrar la próxima semana. Se envía junto con tu decisión.</p>
        <div class="fila-btn">
          <Boton variante="fantasma" onClick={() => setConfirmar(false)}>Volver</Boton>
          <Boton variante="peligro" onClick={() => { editar((d) => { d.habilidad = true; }); setConfirmar(false); sonido('habilidad'); }}>¡Hacerlo!</Boton>
        </div>
      </Modal>
    </section>
  );
}

/* ------------------------------ barra de envío ------------------------------ */
function BarraEnvio() {
  const sem = semana.value;
  const s = sala.value!;
  if (s.estado !== 'jugando') return null;
  const listos = sem?.listos.length ?? 0;
  const nec = sem?.necesarios ?? 0;
  const env = enviada.value;
  const cambios = cambiosSinEnviar.value;
  return (
    <footer class="barra-envio">
      <div class="be-estado">
        {env && !cambios ? <span class="ok">✔ Enviada</span> : cambios ? <span class="pend">Cambios sin enviar</span> : <span>Sin enviar</span>}
        <small>{listos}/{nec} {nec === 1 ? 'persona lista' : 'personas listas'}</small>
      </div>
      <Boton grande disabled={!borrador.value || (env && !cambios)} onClick={() => enviarDecision(false)}>
        {env ? (cambios ? 'Actualizar' : 'Enviada') : 'Enviar decisión'}
      </Boton>
    </footer>
  );
}

/* ------------------------------ transición de semana ------------------------------ */
function Transicion() {
  const t = transicion.value;
  if (!t) return null;
  return (
    <div class="transicion" role="status" aria-live="polite">
      <small>Cierre de la semana {t.ronda}</small>
      <b class={t.total >= 0 ? 'pos' : 'neg'}>{t.total >= 0 ? '+' : ''}<Contador valor={t.total} /></b>
      <span>Vendiste {num(t.vendidas)} de {num(t.demanda)} 🍪</span>
    </div>
  );
}

/* ------------------------------ cadena ------------------------------ */
function Cadena() {
  const e = juego.value!;
  const me = yo.value!;
  const X = me.equipo as Equipo;
  const eq = e.equipos[X];
  const listos = new Set(sync.value?.semana?.listos ?? []);
  const jug = sync.value!.jugadores;
  const t = actual.value;
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const huelga = !!eventoAhora.value?.def.logistico;
  const camiones = (tr: Tramo) => {
    const g = new Map<number, number>();
    eq.enTransito[tr].forEach((x) => g.set(x.llega, (g.get(x.llega) || 0) + x.q));
    return [...g.entries()].sort((a, b) => a[0] - b[0]).map(([llega, q]) => ({ q, ya: llega - t <= 0, gta: tr === 'fd' && eq.sabotaje?.llega === llega }));
  };
  const Tramo_ = ({ tr }: { tr: Tramo }) => (
    <div class="tramo">
      {camiones(tr).map((c) => (
        <div class={`camion ${c.ya ? 'ya' : ''} ${c.gta ? 'humo' : ''}`}>
          <img src={img('img/camion.webp')} alt="" width={40} height={32} />
          <small>{num(c.q)} · {c.ya ? (huelga ? 'bloqueado (huelga)' : 'llega al cerrar') : 'la próxima'}{c.gta ? ' · −35%' : ''}</small>
        </div>
      ))}
    </div>
  );
  const ult = e.historial[e.historial.length - 1]?.equipos[X];
  return (
    <section class="cadena card">
      <div class="nodo"><img src={img('img/engranaje.webp')} alt="" width={40} height={40} /><div><b>Producción</b><small>{num(sum(eq.enTransito.prod.map((x) => x.q)))} en proceso</small></div></div>
      <Tramo_ tr="prod" />
      {ROLES.map((rol, k) => {
        const j = jug.find((p) => p.equipo === X && p.rol === rol);
        const decidio = listos.has(`${X}:${rol}`) || j?.es_bot;
        return (
          <>
            <div class={`nodo ${rol === me.rol ? 'mio' : ''}`}>
              <Escena rol={rol} tam={60} />
              <div><b>{NOMBRES_ROL[rol]}</b> {j && <span class="quien"><Avatar id={j.avatar} tam={20} bot={j.es_bot} /> {j.nombre}</span>}
                <small>📦 {num(sum(eq.stock[rol as Etapa].map((l) => l.q)))} · {decidio ? '✔ listo' : '⏳ decidiendo'}</small></div>
              {rol === me.rol && <span class="tu">TÚ</span>}
            </div>
            {k < 2 && <Tramo_ tr={k === 0 ? 'fd' : 'dt'} />}
          </>
        );
      })}
      <div class="tramo fijo">🛒 {ult ? `Semana pasada: vendió ${num(sum(ult.vendido))} de ${num(sum(ult.demanda))}` : 'Aquí verás las ventas'}</div>
      <div class="nodo"><span class="ic">🙋</span><b>Clientes</b></div>
    </section>
  );
}

const PINGS = ['🍫 ¡Falta stock!', '📦 Tengo de sobra', '⬆️ Pidan más', '⬇️ Pidan menos', '💸 Subamos precio', '🔥 ¡Sabotaje!', '👍 Ok', '🎉 ¡Vamos!'];
function Pings() {
  return (
    <section class="card pings">
      <h3>Mensajes rápidos al equipo</h3>
      <div class="ping-grid">{PINGS.map((p) => <button type="button" class="chip-btn" onClick={() => { enviarMensaje(p); sonido('ping'); }}>{p}</button>)}</div>
    </section>
  );
}
function Mensajes() {
  const m = mensajes.value.filter((x) => Date.now() - x.ts < 6000);
  ahora.value;
  if (!m.length) return null;
  return <div class="mensajes" aria-live="polite">{m.map((x) => <div class="msg"><Avatar id={x.avatar} tam={24} /><b>{x.de}:</b> {x.texto}</div>)}</div>;
}

/* ------------------------------ mercado ------------------------------ */
function Mercado() {
  const e = juego.value!;
  const X = yo.value!.equipo as Equipo;
  const R = rival(X);
  const ult = e.historial[e.historial.length - 1];
  const P = productos(e);
  const t = actual.value;
  return (
    <>
      <section class="card">
        <h2>Marcador</h2>
        <div class="marcador">
          {[X, R].map((Y) => {
            const u = e.equipos[Y].utilidad;
            return (
              <div class={`marc eq-${Y} ${Y === X ? 'mio' : ''}`}>
                <small>{NOMBRES_EQUIPO[Y]}{Y === X ? ' (tú)' : ''}</small>
                <b><Contador valor={sumaUtil(u)} /></b>
                {Y === X && <ul>
                  <li>Margen de ventas <span>{money(u.ventas)}</span></li>
                  <li>Mantenimiento <span class="neg">−{money(u.mantenimiento)}</span></li>
                  <li>Influencers <span class="neg">−{money(u.influencers)}</span></li>
                  {u.habilidades > 0 && <li>Habilidades <span class="neg">−{money(u.habilidades)}</span></li>}
                  {u.perdidas > 0 && <li>Sabotajes <span class="neg">−{money(u.perdidas)}</span></li>}
                </ul>}
              </div>
            );
          })}
        </div>
      </section>
      <section class="card">
        <h2>Influencers</h2>
        <div class="inf-lista">
          {INF_KEYS.map((k, idx) => {
            const inf = e.inf[k];
            const ocupado = t < inf.ocupadoHasta;
            const res = ult?.equipos[X].pujas[idx];
            return (
              <div class="inf-fila">
                <b>{INFLUENCERS[k].apodo}</b>
                <span>{ocupado ? `Con ${NOMBRES_EQUIPO[inf.dueno!]} · +${pct(inf.uplift)} · ${inf.ocupadoHasta - t} sem` : 'Libre'}</span>
                {res && res !== 'sin_puja' && <small class={res === 'gano' ? 'pos' : res === 'perdio' ? 'neg' : ''}>{res === 'gano' ? '✔ Ganaste' : res === 'perdio' ? '✖ Perdiste' : 'Ocupado'}</small>}
              </div>
            );
          })}
        </div>
      </section>
      {ult && (
        <section class="card">
          <h2>Semana {ult.ronda} en tu tienda</h2>
          <div class="tabla-scroll">
            <table>
              <thead><tr><th>Sabor</th><th>Precio</th><th>Demanda</th><th>Vendido</th><th>Perdido</th></tr></thead>
              <tbody>
                {P.map((p, i) => {
                  const r = ult.equipos[X];
                  return <tr><td><Galleta i={i} tam={20} /> {p.nombre}</td><td>${r.precio[i].toFixed(2)}</td><td>{num(r.demanda[i])}</td><td>{num(r.vendido[i])}</td><td class={r.perdidoFinal[i] > 0 ? 'neg' : ''}>{num(r.perdidoFinal[i])}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
          <p class="ayuda">Mercado total (ambos equipos): {num(ult.base.reduce((a, b) => a + b, 0))} clientes base esta semana.</p>
        </section>
      )}
    </>
  );
}
