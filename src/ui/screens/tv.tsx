/** MODO PRESENTADOR (?tv=CODIGO): para proyectar en clase. Solo lectura. */
import { NOMBRES_EQUIPO, kpis, sumaUtil, type Equipo } from '../../engine';
import { actual, eventoAhora, juego, restante, revision, sala, semana, sync } from '../../state';
import { Avatar, Contador, GraficoLineas, RelojAnillo, img, money } from '../comun';

export function Tv() {
  revision.value;
  const s = sala.value;
  const data = sync.value;
  const e = juego.value;
  if (!s || !data) return <section class="tv cargando"><div class="spinner" /><p>Conectando con la sala…</p></section>;
  const link = `${location.origin}${location.pathname}?sala=${s.codigo}`;
  if (s.estado === 'espera' || s.estado === 'eleccion') {
    return (
      <section class="tv">
        <img class="tv-logo" src={img('img/logo.webp')} alt="Cookie Production Fight!" />
        <p class="tv-sub">Entra a <b>{location.host}{location.pathname}</b> con el código</p>
        <div class="tv-codigo">{s.codigo}</div>
        <div class="tv-jug">{data.jugadores.map((j) => <span class="pop"><Avatar id={j.avatar} tam={72} bot={j.es_bot} /><b>{j.nombre}</b></span>)}</div>
        <small class="tv-link">{link}</small>
      </section>
    );
  }
  if (!e) return <section class="tv cargando"><div class="spinner" /></section>;
  const k = kpis(e);
  const sem = semana.value;
  const ev = eventoAhora.value;
  const total = sem ? (s.segundos + (sem.extra || 0)) * 1000 : 0;
  const listos = new Set(sem?.listos ?? []);
  return (
    <section class="tv tv-juego">
      <header class="tv-cab">
        <img src={img('img/logo.webp')} alt="" height={64} />
        <div class="tv-sem">Semana <b>{Math.min(actual.value, s.total_rondas)}</b>/{s.total_rondas}</div>
        {s.estado === 'jugando' && <RelojAnillo restanteMs={restante.value} totalMs={total} tam={96} />}
      </header>
      <div class="tv-equipos">
        {(['A', 'B'] as Equipo[]).map((X) => (
          <div class={`tv-eq eq-${X}`}>
            <h2>{NOMBRES_EQUIPO[X]}</h2>
            <b class="tv-dinero"><Contador valor={sumaUtil(e.equipos[X].utilidad)} /></b>
            <div class="tv-int">
              {data.jugadores.filter((j) => j.equipo === X).map((j) => (
                <span class={listos.has(`${X}:${j.rol}`) || j.es_bot ? 'listo' : ''}><Avatar id={j.avatar} tam={56} bot={j.es_bot} /></span>
              ))}
            </div>
            <small>Servicio {Math.round(k[X].nivelServicio * 100)}% · Influencers {k[X].influencersGanados}</small>
          </div>
        ))}
      </div>
      {ev && <div class="tv-evento"><img src={img(`img/eventos/${ev.id}.webp`)} alt="" height={80} /><div><b>{ev.def.nombre}</b><p>{ev.def.desc}</p></div></div>}
      {e.historial.length > 1 && (
        <GraficoLineas titulo="Utilidad acumulada" formatoY={money} alto={200}
          series={[{ nombre: NOMBRES_EQUIPO.A, valores: k.A.acumulada, clase: 's-a' }, { nombre: NOMBRES_EQUIPO.B, valores: k.B.acumulada, clase: 's-b' }]} />
      )}
    </section>
  );
}
