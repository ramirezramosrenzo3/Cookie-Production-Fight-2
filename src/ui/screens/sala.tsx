import { useEffect, useState } from 'preact/hooks';
import { HABILIDADES, NOMBRES_EQUIPO, NOMBRES_ROL, ROLES, costoHab, type Equipo } from '../../engine';
import { accion, ahora, avisar, cerrarPartida, irA, olvidarSala, sala, sync, yo, getTransporte } from '../../state';
import { Avatar, Boton, Escena, img, money } from '../comun';
import { Juego } from './juego';
import { Fin } from './fin';

export function Sala() {
  const s = sala.value;
  if (!s) return <section class="card pantalla cargando"><div class="spinner" aria-label="Cargando" /><p>Conectando…</p></section>;
  if (s.estado === 'espera') return <Lobby />;
  if (s.estado === 'eleccion') return <Eleccion />;
  const sem = sync.value?.semana;
  if (s.estado === 'terminado' && sem && sem.cerradas >= s.total_rondas) return <Fin />;
  return <Juego />;
}

function salirAlInicio() {
  olvidarSala();
  cerrarPartida();
  irA('home');
}

/* ================================ LOBBY ================================ */
function Lobby() {
  const s = sala.value!;
  const data = sync.value!;
  const anfitrion = !!yo.value?.es_anfitrion;
  const jug = data.jugadores;
  const lleno = jug.length === 6;
  const personas = jug.filter((j) => !j.es_bot).length;
  const link = `${location.origin}${location.pathname}?sala=${s.codigo}`;
  const compartir = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Cookie Production Fight! 2', text: `Únete a mi sala ${s.codigo}`, url: link });
      else { await navigator.clipboard.writeText(link); avisar('Link copiado', 'ok'); }
    } catch { /* cancelado */ }
  };
  return (
    <section class="card pantalla">
      <div class="lobby-cab">
        <div>
          <small>Código de sala</small>
          <div class="codigo-grande" aria-label={`Código ${s.codigo.split('').join(' ')}`}>{s.codigo}</div>
        </div>
        <Boton variante="secundario" onClick={compartir}>Invitar</Boton>
      </div>
      <div class="chips">
        <span class="chip">{s.sabores} sabores</span><span class="chip">{s.total_rondas} semanas</span>
        <span class="chip">{s.segundos} s/semana</span>{s.autopiloto && <span class="chip">Autopiloto</span>}
      </div>
      <h2>Jugadores {jug.length}/6 <small>({personas} {personas === 1 ? 'persona' : 'personas'})</small></h2>
      <ul class="lista-jug">
        {jug.map((j) => <li class="pop"><Avatar id={j.avatar} tam={44} bot={j.es_bot} /><b>{j.nombre}</b>{j.es_anfitrion && <span title="Anfitrión">👑</span>}</li>)}
        {Array.from({ length: 6 - jug.length }, () => <li class="vacio"><span class="avatar-vacio" />Esperando…</li>)}
      </ul>
      {anfitrion ? (
        <>
          <Boton grande disabled={!lleno} onClick={() => accion((t) => t.iniciar())}>{lleno ? 'Empezar: elegir puestos' : 'Faltan jugadores'}</Boton>
          {!lleno && <Boton variante="secundario" onClick={() => accion((t) => t.completarBots())}>🤖 Completar con bots</Boton>}
          {jug.some((j) => j.es_bot) && <Boton variante="fantasma" onClick={() => accion((t) => t.quitarBots())}>Quitar bots</Boton>}
        </>
      ) : <p class="ayuda centro esperando">Esperando a que el anfitrión empiece…</p>}
      <Boton variante="fantasma" onClick={async () => { await accion((t) => t.salir()); salirAlInicio(); }}>Salir de la sala</Boton>
      <details class="reglas">
        <summary>Reglas en 1 minuto</summary>
        <ul>
          <li>Cada equipo: Fábrica → Distribuidor → Tienda. Todo tarda 2 semanas en llegar.</li>
          <li>La demanda del mercado se reparte entre los dos equipos según precio, calidad e influencers.</li>
          <li>Ganancia = margen de ventas − mantenimiento del stock − pujas − habilidades − mercadería perdida.</li>
          <li>Habilidades: {HABILIDADES.map((h) => `${h.nombre} (${money(costoHab(h, s.sabores))})`).join(' · ')}.</li>
          <li>Los bots 🤖 deciden solos. {s.autopiloto ? 'Con autopiloto, si alguien no decide, un bot decide por esa persona.' : ''}</li>
        </ul>
      </details>
    </section>
  );
}

/* ================================ ELECCIÓN ================================ */
function Eleccion() {
  const s = sala.value!;
  const data = sync.value!;
  const me = yo.value;
  const fin = s.eleccion_fin ? Date.parse(s.eleccion_fin) : 0;
  const seg = Math.max(0, Math.ceil((fin - ahora.value) / 1000));
  const sinElegir = data.jugadores.filter((j) => !j.es_bot && !j.equipo);
  return (
    <section class="card pantalla">
      <h1>Elige equipo y puesto <span class="contador-chip">{seg}s</span></h1>
      <p class="ayuda">El primero en tomar un puesto lo bloquea. Si no eliges a tiempo, te toca uno al azar.</p>
      <div class="dos-col">
        {(['A', 'B'] as Equipo[]).map((X) => (
          <div class={`col-eq eq-${X} ${me?.equipo === X ? 'mio' : ''}`}>
            <h3>{NOMBRES_EQUIPO[X]}</h3>
            {ROLES.map((rol) => {
              const j = data.jugadores.find((p) => p.equipo === X && p.rol === rol);
              const mio = me?.equipo === X && me?.rol === rol;
              return (
                <div class={`slot ${mio ? 'mio' : ''}`}>
                  <Escena rol={rol} tam={44} />
                  <div class="slot-txt"><b>{NOMBRES_ROL[rol]}</b>
                    {mio ? <span><Avatar id={me!.avatar} tam={22} /> Tú</span>
                      : j ? <span>{me?.equipo === X ? <><Avatar id={j.avatar} tam={22} /> {j.nombre}</> : '🔒 Ocupado'}</span>
                      : <span class="libre">Libre</span>}
                  </div>
                  {mio ? <button type="button" class="mini sec" onClick={() => accion((t) => t.liberarPuesto())}>Cambiar</button>
                    : !j && <button type="button" class="mini" onClick={() => accion((t) => t.elegirPuesto(X, rol))}>Elegir</button>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p class="centro">{sinElegir.length
        ? <>Faltan: {sinElegir.map((j) => <span class="falta"><Avatar id={j.avatar} tam={22} /> {j.nombre}</span>)}</>
        : '✔ Todos eligieron. ¡Arrancamos!'}</p>
    </section>
  );
}

/* Utilidad: escucha el link ?sala= al llegar desde una invitación */
export function useInvitacion() {
  const [hecho, setHecho] = useState(false);
  useEffect(() => {
    if (hecho) return;
    setHecho(true);
    const c = new URLSearchParams(location.search).get('sala');
    if (c && !getTransporte()) irA('online');
  }, []);
}
export const imgEquipo = (X: Equipo) => img(`img/bolsa${X === 'A' ? 1 : 4}.webp`);
