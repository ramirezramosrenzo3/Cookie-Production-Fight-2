/**
 * EFECTOS DE SONIDO sintetizados con WebAudio (0 KB de archivos de audio)
 * y vibración háptica. Se respetan los ajustes del jugador.
 */
type Efecto = 'click' | 'enviar' | 'moneda' | 'baja' | 'alarma' | 'tic' | 'evento' | 'ping' | 'victoria' | 'derrota' | 'habilidad';

let ctx: AudioContext | null = null;
let activo = true;
let vibra = true;
export function configurarFx(o: { sonido: boolean; vibrar: boolean }) { activo = o.sonido; vibra = o.vibrar; }

function ac() {
  if (!ctx) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function nota(f: number, t0: number, dur: number, tipo: OscillatorType = 'sine', vol = 0.18, deslizar?: number) {
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = tipo;
  o.frequency.setValueAtTime(f, c.currentTime + t0);
  if (deslizar) o.frequency.exponentialRampToValueAtTime(deslizar, c.currentTime + t0 + dur);
  g.gain.setValueAtTime(0.0001, c.currentTime + t0);
  g.gain.exponentialRampToValueAtTime(vol, c.currentTime + t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + t0);
  o.stop(c.currentTime + t0 + dur + 0.02);
}

export function sonido(e: Efecto) {
  if (!activo || typeof window === 'undefined') return;
  try {
    switch (e) {
      case 'click': nota(660, 0, 0.05, 'triangle', 0.08); break;
      case 'enviar': nota(523, 0, 0.09, 'triangle'); nota(784, 0.08, 0.14, 'triangle'); break;
      case 'moneda': nota(988, 0, 0.08, 'square', 0.08); nota(1319, 0.07, 0.22, 'square', 0.08); break;
      case 'baja': nota(392, 0, 0.16, 'sawtooth', 0.07, 262); break;
      case 'alarma': for (let i = 0; i < 3; i++) { nota(880, i * 0.22, 0.11, 'square', 0.09); nota(660, i * 0.22 + 0.11, 0.11, 'square', 0.09); } break;
      case 'tic': nota(1200, 0, 0.03, 'square', 0.05); break;
      case 'evento': nota(392, 0, 0.12, 'triangle'); nota(523, 0.12, 0.12, 'triangle'); nota(659, 0.24, 0.25, 'triangle'); break;
      case 'ping': nota(1046, 0, 0.07, 'sine', 0.12); nota(1568, 0.06, 0.12, 'sine', 0.1); break;
      case 'habilidad': nota(220, 0, 0.35, 'sawtooth', 0.09, 880); break;
      case 'victoria': [523, 659, 784, 1046, 784, 1046].forEach((f, i) => nota(f, i * 0.13, i === 5 ? 0.5 : 0.14, 'triangle', 0.16)); break;
      case 'derrota': [392, 370, 349, 330].forEach((f, i) => nota(f, i * 0.22, 0.24, 'triangle', 0.12)); break;
    }
  } catch { /* audio no disponible */ }
}

export function vibrar(p: number | number[]) {
  if (!vibra) return;
  try { navigator.vibrate?.(p); } catch { /* sin vibración */ }
}
