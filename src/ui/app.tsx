import { useEffect } from 'preact/hooks';
import { ajustes, aviso, pantalla, abrirPartida } from '../state';
import { configurarFx } from '../fx/sonido';
import { TransporteSupabase, onlineDisponible } from '../net/supabase';
import { Home, Perfil, Online, Solo, Ayuda } from './screens/menu';
import { Sala } from './screens/sala';
import { Tv } from './screens/tv';

export function App() {
  useEffect(() => ajustes.subscribe((a) => configurarFx(a)), []);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const tv = q.get('tv');
    if (tv && onlineDisponible()) {
      abrirPartida(new TransporteSupabase(tv.toUpperCase()));
      pantalla.value = 'tv';
    } else if (q.get('sala')) {
      pantalla.value = 'home';
    }
  }, []);
  const p = pantalla.value;
  const a = aviso.value;
  return (
    <>
      <div id="app" class={`p-${p}`}>
        {p === 'home' && <Home />}
        {p === 'perfil' && <Perfil />}
        {p === 'online' && <Online />}
        {p === 'solo' && <Solo />}
        {p === 'ayuda' && <Ayuda />}
        {p === 'sala' && <Sala />}
        {p === 'tv' && <Tv />}
      </div>
      {a && <div class={`aviso aviso-${a.tipo}`} role={a.tipo === 'error' ? 'alert' : 'status'}>{a.texto}</div>}
    </>
  );
}
