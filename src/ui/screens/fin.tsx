import { useEffect, useMemo, useState } from 'preact/hooks';
import { NOMBRES_EQUIPO, NOMBRES_ROL, ROLES, consejos, kpis, premios, puntajes, rival, type Equipo } from '../../engine';
import { TransporteSupabase, unirseOnline, traducirError } from '../../net/supabase';
import { abrirPartida, avisar, cerrarPartida, getTransporte, irA, juego, modo, olvidarSala, perfil, sala, sync, yo } from '../../state';
import { confeti } from '../../fx/confeti';
import { sonido } from '../../fx/sonido';
import { Avatar, Boton, GraficoLineas, money, num, pct } from '../comun';

const fmtLat = (x: number) => (x >= 20 ? '20×+' : x.toFixed(1) + '×');

export function Fin() {
  const e = juego.value!;
  const me = yo.value;
  const p = puntajes(e);
  const ganador: Equipo | null = p.A === p.B ? null : p.A > p.B ? 'A' : 'B';
  const X = (me?.equipo ?? 'A') as Equipo;
  const k = useMemo(() => kpis(e), [e.ronda]);
  const pr = useMemo(() => premios(e), [e.ronda]);
  const tips = useMemo(() => consejos(e, X), [e.ronda, X]);
  const gane = ganador === X;
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (gane) { confeti(); sonido('victoria'); } else if (ganador) sonido('derrota');
  }, []);

  const revancha = async () => {
    setCargando(true);
    try {
      if (modo.value === 'local') { irA('solo'); cerrarPartida(); return; }
      const c = await getTransporte()!.revancha();
      const pf = perfil.value;
      await unirseOnline(c, pf.nombre, pf.avatar);
      abrirPartida(new TransporteSupabase(c));
    } catch (err) { avisar(traducirError(err), 'error'); } finally { setCargando(false); }
  };
  const siguiente = sala.value?.siguiente;

  return (
    <div class="fin">
      <section class={`card fin-cab ${gane ? 'gana' : ''}`}>
        <div class="trofeo" aria-hidden="true">{ganador ? (gane ? '🏆' : '🥈') : '🤝'}</div>
        <h1>{ganador ? (gane ? '¡Ganaron!' : `Gana ${NOMBRES_EQUIPO[ganador]}`) : '¡Empate!'}</h1>
        <div class="fin-eq">
          {(ganador ? [ganador, rival(ganador)] : (['A', 'B'] as Equipo[])).map((Y) => (
            <div class={`fin-col eq-${Y} ${Y === ganador ? 'win' : ''}`}>
              <small>{NOMBRES_EQUIPO[Y]}</small>
              <b class={p[Y] < 0 ? 'neg' : ''}>{money(p[Y])}</b>
              <div class="integrantes">
                {ROLES.map((rol) => {
                  const j = sync.value!.jugadores.find((x) => x.equipo === Y && x.rol === rol);
                  return j ? <span title={`${j.nombre} · ${NOMBRES_ROL[rol]}`}><Avatar id={j.avatar} tam={36} bot={j.es_bot} /></span> : null;
                })}
              </div>
            </div>
          ))}
        </div>
        <div class="fila-btn">
          {siguiente && modo.value === 'online'
            ? <Boton grande onClick={async () => {
                try { await unirseOnline(siguiente, perfil.value.nombre, perfil.value.avatar); abrirPartida(new TransporteSupabase(siguiente)); }
                catch (err) { avisar(traducirError(err), 'error'); }
              }}>Unirme a la revancha ({siguiente})</Boton>
            : <Boton grande disabled={cargando} onClick={revancha}>🔁 Revancha</Boton>}
          <Boton variante="fantasma" onClick={() => { olvidarSala(); cerrarPartida(); irA('home'); }}>Inicio</Boton>
        </div>
      </section>

      {pr.length > 0 && (
        <section class="card">
          <h2>Premios</h2>
          <div class="premios">
            {pr.map((x) => <div class={`premio eq-${x.equipo}`}><span class="pr-ic">{x.icono}</span><b>{x.titulo}</b><small>{NOMBRES_EQUIPO[x.equipo]} · {x.detalle}</small></div>)}
          </div>
        </section>
      )}

      <section class="card">
        <h2>Dinero semana a semana</h2>
        <GraficoLineas titulo="Utilidad acumulada por equipo" formatoY={money}
          series={[{ nombre: NOMBRES_EQUIPO.A, valores: k.A.acumulada, clase: 's-a' }, { nombre: NOMBRES_EQUIPO.B, valores: k.B.acumulada, clase: 's-b' }]} />
      </section>

      <section class="card">
        <h2>Efecto látigo de {NOMBRES_EQUIPO[X]}</h2>
        <p class="ayuda">Si los pedidos oscilan mucho más que la demanda real, la cadena está amplificando el ruido.</p>
        <GraficoLineas titulo="Demanda vs pedidos de cada etapa"
          series={[
            { nombre: 'Demanda clientes', valores: k[X].series.demanda, clase: 's-dem' },
            { nombre: 'Pedido tienda', valores: k[X].series.tienda, clase: 's-t' },
            { nombre: 'Pedido distribuidor', valores: k[X].series.distribuidor, clase: 's-d' },
            { nombre: 'Producción', valores: k[X].series.fabrica, clase: 's-f', punteada: true },
          ]} />
        <div class="kpis">
          <div><small>Nivel de servicio</small><b>{pct(k[X].nivelServicio)}</b></div>
          <div><small>Ventas perdidas</small><b>{num(k[X].ventasPerdidas)}</b></div>
          <div><small>Látigo distribuidor</small><b>{fmtLat(k[X].latigo.distribuidor)}</b></div>
          <div><small>Látigo fábrica</small><b>{fmtLat(k[X].latigo.fabrica)}</b></div>
          <div><small>Mantenimiento</small><b>{money(k[X].mantenimiento)}</b></div>
          <div><small>Influencers</small><b>{k[X].influencersGanados}</b></div>
        </div>
      </section>

      <section class="card">
        <h2>Para la próxima</h2>
        <ul class="consejos">{tips.map((t) => <li>{t}</li>)}</ul>
      </section>
    </div>
  );
}
