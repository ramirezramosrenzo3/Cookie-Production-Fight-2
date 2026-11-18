import { useState } from 'preact/hooks';
import {
  DIFICULTADES, NOMBRES_EQUIPO, NOMBRES_ROL, EQUIPOS, ROLES, VERSION_MOTOR, type Equipo, type Rol,
} from '../../engine';
import { TransporteLocal } from '../../net/local';
import { TransporteSupabase, crearSalaOnline, onlineDisponible, traducirError, unirseOnline } from '../../net/supabase';
import {
  abrirPartida, ajustes, avisar, irA, pantalla, perfil, siguienteTrasPerfil, ultimaSala, olvidarSala,
} from '../../state';
import { Avatar, Boton, Escena, Galleta, Segmentado, Stepper, img } from '../comun';

const Atras = ({ a = 'home' as const }: { a?: 'home' }) =>
  <button type="button" class="atras" onClick={() => irA(a)} aria-label="Volver">‹ Volver</button>;

/* ================================ HOME ================================ */
export function Home() {
  const codigoUrl = new URLSearchParams(location.search).get('sala');
  return (
    <section class="home">
      {[1, 4, 3, 5].map((g, k) => <img class={`deco deco-${k}`} src={img(`img/galleta${g}.webp`)} alt="" aria-hidden="true" />)}
      <img class="logo" src={img('img/logo.webp')} alt="Cookie Production Fight!" width={380} height={199} />
      <span class="sello">2</span>
      <p class="lema">Produce, distribuye y vende. ¡Supera a tu rival!</p>
      <div class="escenas" aria-hidden="true"><Escena rol="fabrica" tam={110} /><Escena rol="distribuidor" tam={110} /><Escena rol="tienda" tam={110} /></div>
      <div class="menu">
        <Boton grande onClick={() => irA('online')}>{codigoUrl ? `Unirme a la sala ${codigoUrl.toUpperCase()}` : 'Jugar online'}</Boton>
        <Boton grande variante="secundario" onClick={() => irA('solo')}>Jugar solo vs bots</Boton>
        <Boton variante="fantasma" onClick={() => irA('ayuda')}>¿Cómo se juega?</Boton>
        {ultimaSala.value && onlineDisponible() && (
          <Boton variante="fantasma" onClick={() => abrirPartida(new TransporteSupabase(ultimaSala.value!))}>
            Volver a la sala {ultimaSala.value}
          </Boton>
        )}
      </div>
      <p class="pie">v{VERSION_MOTOR} · {perfil.value.nombre
        ? <button type="button" class="enlace" onClick={() => { siguienteTrasPerfil.value = 'home'; pantalla.value = 'perfil'; }}>
            <Avatar id={perfil.value.avatar} tam={22} /> {perfil.value.nombre}</button>
        : null}</p>
    </section>
  );
}

/* ================================ PERFIL ================================ */
export function Perfil() {
  const [avatar, setAvatar] = useState(perfil.value.avatar);
  const [nombre, setNombre] = useState(perfil.value.nombre);
  const listo = avatar > 0 && nombre.trim().length > 0;
  const guardar = () => {
    if (!listo) return;
    perfil.value = { avatar, nombre: nombre.trim().slice(0, 20) };
    irA(siguienteTrasPerfil.value);
  };
  return (
    <section class="card pantalla">
      <Atras />
      <h1>Tu perfil</h1>
      <div class="perfil-prev">
        <Avatar id={avatar} tam={112} />
        <input class="input-nombre" value={nombre} maxLength={20} placeholder="Tu nombre" aria-label="Tu nombre" autoComplete="nickname"
          onInput={(e) => setNombre((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === 'Enter' && guardar()} />
      </div>
      <div class="grid-av" role="radiogroup" aria-label="Elige tu avatar">
        {Array.from({ length: 16 }, (_, i) => i + 1).map((a) => (
          <button type="button" role="radio" aria-checked={a === avatar} class={`av-op ${a === avatar ? 'sel' : ''}`} onClick={() => setAvatar(a)}>
            <Avatar id={a} tam={56} />
          </button>
        ))}
      </div>
      <Boton grande disabled={!listo} onClick={guardar}>{listo ? '¡Listo!' : 'Elige avatar y nombre'}</Boton>
    </section>
  );
}

/* ================================ ONLINE ================================ */
export function Online() {
  const codigoUrl = (new URLSearchParams(location.search).get('sala') || '').toUpperCase();
  const [codigo, setCodigo] = useState(codigoUrl);
  const [sabores, setSabores] = useState(5);
  const [rondas, setRondas] = useState(30);
  const [segundos, setSegundos] = useState(60);
  const [autopiloto, setAutopiloto] = useState(true);
  const [cargando, setCargando] = useState(false);
  const p = perfil.value;

  if (!onlineDisponible()) {
    return (
      <section class="card pantalla">
        <Atras />
        <h1>Modo online</h1>
        <p>Este despliegue no tiene configurado Supabase. Puedes <b>jugar solo contra bots</b> ahora mismo, o configurar el servidor siguiendo <code>docs/DESPLIEGUE.md</code>.</p>
        <Boton grande onClick={() => irA('solo')}>Jugar solo vs bots</Boton>
      </section>
    );
  }

  const ejecutar = async (f: () => Promise<string>) => {
    setCargando(true);
    try {
      const c = await f();
      if (ultimaSala.value && ultimaSala.value !== c) olvidarSala();
      history.replaceState(null, '', location.pathname);
      abrirPartida(new TransporteSupabase(c));
    } catch (e) {
      avisar(traducirError(e), 'error');
    } finally {
      setCargando(false);
    }
  };

  return (
    <section class="card pantalla">
      <Atras />
      <h1>Jugar online</h1>
      <div class="bloque">
        <h2>Unirme con código</h2>
        <div class="fila-codigo">
          <input class="input-codigo" value={codigo} maxLength={4} placeholder="ABCD" aria-label="Código de sala" autoCapitalize="characters" autoComplete="off"
            onInput={(e) => setCodigo((e.target as HTMLInputElement).value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
          <Boton disabled={codigo.length !== 4 || cargando} onClick={() => ejecutar(() => unirseOnline(codigo, p.nombre, p.avatar))}>Unirme</Boton>
        </div>
      </div>
      <div class="separador"><span>o crea una sala</span></div>
      <div class="bloque">
        <h2>Dificultad</h2>
        <Segmentado etiqueta="Dificultad" valor={String(sabores)} onCambio={(v) => setSabores(Number(v))}
          opciones={DIFICULTADES.map((d) => ({ v: String(d.sabores), t: `${d.sabores} sabores`, sub: d.nombre }))} />
        <div class="fila2">
          <label class="campo">Semanas<Stepper etiqueta="Semanas" valor={rondas} min={5} max={60} paso={5} onCambio={setRondas} /></label>
          <label class="campo">Segundos por semana<Stepper etiqueta="Segundos" valor={segundos} min={20} max={180} paso={10} onCambio={setSegundos} /></label>
        </div>
        <label class="interruptor">
          <input type="checkbox" checked={autopiloto} onChange={(e) => setAutopiloto((e.target as HTMLInputElement).checked)} />
          <span><b>Autopiloto</b><small>Si alguien se desconecta o no decide a tiempo, un bot decide por esa persona esa semana.</small></span>
        </label>
        <Boton grande disabled={cargando} onClick={() => ejecutar(() => crearSalaOnline({ nombre: p.nombre, avatar: p.avatar, rondas, segundos, sabores, autopiloto }))}>
          Crear sala
        </Boton>
      </div>
    </section>
  );
}

/* ================================ SOLO ================================ */
export function Solo() {
  const [sabores, setSabores] = useState(3);
  const [rondas, setRondas] = useState(20);
  const [ritmo, setRitmo] = useState('0');
  const [equipo, setEquipo] = useState<Equipo>('A');
  const [rol, setRol] = useState<Rol>('tienda');
  const p = perfil.value;
  // ?semilla=123 permite repetir exactamente el mismo mercado (torneos justos entre grupos, pruebas)
  const semillaUrl = Number(new URLSearchParams(location.search).get('semilla')) || undefined;
  const empezar = () => abrirPartida(new TransporteLocal({
    nombre: p.nombre, avatar: p.avatar, rondas, segundos: Number(ritmo), sabores, equipo, rol, semilla: semillaUrl,
  }));
  return (
    <section class="card pantalla">
      <Atras />
      <h1>Jugar solo</h1>
      <p class="ayuda">Tú contra 5 bots. Sin internet, sin esperas: ideal para aprender.</p>
      <h2>Tu puesto</h2>
      <div class="puestos">
        {ROLES.map((r) => (
          <button type="button" class={`puesto ${r === rol ? 'sel' : ''}`} aria-pressed={r === rol} onClick={() => setRol(r)}>
            <Escena rol={r} tam={72} /><b>{NOMBRES_ROL[r]}</b>
            <small>{r === 'fabrica' ? 'Calidad y producción' : r === 'distribuidor' ? 'Pedidos e influencers' : 'Precio y pedidos'}</small>
          </button>
        ))}
      </div>
      <Segmentado etiqueta="Equipo" valor={equipo} onCambio={setEquipo}
        opciones={EQUIPOS.map((X) => ({ v: X, t: NOMBRES_EQUIPO[X] }))} />
      <h2>Partida</h2>
      <Segmentado etiqueta="Dificultad" valor={String(sabores)} onCambio={(v) => setSabores(Number(v))}
        opciones={DIFICULTADES.map((d) => ({ v: String(d.sabores), t: `${d.sabores} sabores`, sub: d.nombre }))} />
      <div class="fila2">
        <label class="campo">Semanas<Stepper etiqueta="Semanas" valor={rondas} min={5} max={60} paso={5} onCambio={setRondas} /></label>
        <label class="campo">Ritmo
          <Segmentado etiqueta="Ritmo" valor={ritmo} onCambio={setRitmo}
            opciones={[{ v: '0', t: 'Sin reloj' }, { v: '45', t: '45 s' }, { v: '60', t: '60 s' }]} />
        </label>
      </div>
      <Boton grande onClick={empezar}>¡A producir!</Boton>
    </section>
  );
}

/* ================================ AYUDA ================================ */
const PASOS = [
  { t: 'Dos equipos, una cadena', i: 'img/camion.webp',
    d: 'Cada equipo tiene Fábrica → Distribuidor → Tienda. Las galletas viajan por la cadena y tardan 2 semanas en cada tramo.' },
  { t: 'Fábrica', i: 'img/fabrica.webp',
    d: 'Elige la calidad (económica, estándar o premium) y cuánto producir. Premium cuesta más pero atrae más clientes.' },
  { t: 'Distribuidor', i: 'img/distribucion.webp',
    d: 'Pide galletas a la fábrica y puja por influencers que suben la demanda de tu equipo. La puja más alta gana y paga.' },
  { t: 'Tienda', i: 'img/tienda.webp',
    d: 'Pon el precio y pide al distribuidor. Un precio bajo roba clientes al rival; uno alto deja más margen.' },
  { t: 'Eventos y sabotajes', i: 'img/habilidades/incendio.webp',
    d: 'Navidad, huelgas, ratas… El mercado cambia. Y cada rol tiene una habilidad para fastidiar al rival: Incendio, Fake News y GTA.' },
  { t: 'El secreto', i: 'img/checklist.webp',
    d: 'Guardar galletas cuesta y quedarse sin stock pierde ventas. Pide parejo, mira lo que viene en camino y ¡habla con tu equipo!' },
];
export function Ayuda() {
  const [k, setK] = useState(0);
  const p = PASOS[k];
  return (
    <section class="card pantalla ayuda-pant">
      <Atras />
      <div class="paso" key={k}>
        <img src={img(p.i)} alt="" width={140} height={120} />
        <h1>{p.t}</h1>
        <p>{p.d}</p>
      </div>
      <div class="puntos" role="tablist">{PASOS.map((_, i) => <button type="button" role="tab" aria-selected={i === k} aria-label={`Paso ${i + 1}`} class={i === k ? 'sel' : ''} onClick={() => setK(i)} />)}</div>
      <div class="fila-btn">
        <Boton variante="fantasma" disabled={k === 0} onClick={() => setK(k - 1)}>Anterior</Boton>
        {k < PASOS.length - 1
          ? <Boton onClick={() => setK(k + 1)}>Siguiente</Boton>
          : <Boton onClick={() => { ajustes.value = { ...ajustes.value, tutorialVisto: true }; irA('solo'); }}>Probar ahora</Boton>}
      </div>
      <p class="ayuda centro"><Galleta i={0} tam={18} /> Gana el equipo con más dinero al final.</p>
    </section>
  );
}
