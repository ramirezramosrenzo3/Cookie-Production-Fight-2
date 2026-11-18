import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { sonido } from '../fx/sonido';

/* ------------------------------ formato ------------------------------ */
export const money = (n: number) => (n < 0 ? '−' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('es-PE');
export const money2 = (n: number) => '$' + n.toFixed(2);
export const num = (n: number) => Math.round(n).toLocaleString('es-PE');
export const pct = (x: number) => Math.round(x * 100) + '%';
export const img = (ruta: string) => `${import.meta.env.BASE_URL}${ruta}`;

/* ------------------------------ imágenes ------------------------------ */
export function Avatar({ id, tam = 40, bot = false }: { id: number; tam?: number; bot?: boolean }) {
  const [falla, setFalla] = useState(false);
  return (
    <span class="avatar" style={{ width: tam, height: tam }}>
      {id && !falla
        ? <img src={img(`avatares/${id}.webp`)} alt={`Avatar ${id}`} width={tam} height={tam} onError={() => setFalla(true)} />
        : <span class="avatar-ph" style={{ fontSize: tam * 0.5 }}>🍪</span>}
      {bot && <span class="avatar-bot" title="Bot">🤖</span>}
    </span>
  );
}

export const Galleta = ({ i, tam = 28 }: { i: number; tam?: number }) =>
  <img class="galleta" src={img(`img/galleta${i + 1}.webp`)} alt="" width={tam} height={tam} />;

export const Escena = ({ rol, tam = 64 }: { rol: 'fabrica' | 'distribuidor' | 'tienda'; tam?: number }) =>
  <img class="escena" src={img(`img/${rol === 'distribuidor' ? 'distribucion' : rol}.webp`)} alt="" width={tam} height={tam * 0.83} />;

/* ------------------------------ botones ------------------------------ */
type BotonProps = JSX.HTMLAttributes<HTMLButtonElement> & { variante?: 'primario' | 'secundario' | 'fantasma' | 'peligro'; grande?: boolean; disabled?: boolean };
export function Boton({ variante = 'primario', grande, class: cls, onClick, children, ...rest }: BotonProps) {
  return (
    <button
      type="button"
      class={`btn btn-${variante} ${grande ? 'btn-grande' : ''} ${cls ?? ''}`}
      onClick={(e) => { sonido('click'); (onClick as ((e: Event) => void) | undefined)?.(e); }}
      {...rest}
    >{children}</button>
  );
}

/** Campo numérico táctil: − valor + y atajos. */
export function Stepper({ valor, min = 0, max, paso = 10, onCambio, etiqueta, decimales = 0, sufijo }: {
  valor: number; min?: number; max: number; paso?: number; onCambio: (v: number) => void; etiqueta: string; decimales?: number; sufijo?: string;
}) {
  const fijar = (v: number) => {
    const r = Math.min(max, Math.max(min, v));
    onCambio(decimales ? Math.round(r * 10 ** decimales) / 10 ** decimales : Math.round(r));
  };
  return (
    <div class="stepper" role="group" aria-label={etiqueta}>
      <button type="button" class="st-btn" aria-label={`Restar ${paso}`} onClick={() => fijar(valor - paso)} disabled={valor <= min}>−</button>
      <input
        class="st-val" type="number" inputMode={decimales ? 'decimal' : 'numeric'} aria-label={etiqueta}
        min={min} max={max} step={decimales ? 0.1 : 1}
        value={decimales ? valor.toFixed(decimales) : valor}
        onChange={(e) => fijar(Number((e.target as HTMLInputElement).value) || 0)}
        onFocus={(e) => (e.target as HTMLInputElement).select()}
      />
      {sufijo && <span class="st-suf">{sufijo}</span>}
      <button type="button" class="st-btn" aria-label={`Sumar ${paso}`} onClick={() => fijar(valor + paso)} disabled={valor >= max}>+</button>
    </div>
  );
}

export function Segmentado<T extends string>({ opciones, valor, onCambio, etiqueta }: {
  opciones: { v: T; t: string; sub?: string }[]; valor: T; onCambio: (v: T) => void; etiqueta: string;
}) {
  return (
    <div class="segmentado" role="radiogroup" aria-label={etiqueta}>
      {opciones.map((o) => (
        <button type="button" role="radio" aria-checked={o.v === valor} class={o.v === valor ? 'sel' : ''}
          onClick={() => { sonido('click'); onCambio(o.v); }}>
          <b>{o.t}</b>{o.sub && <small>{o.sub}</small>}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ modal ------------------------------ */
export function Modal({ abierto, children, onCerrar, clase = '' }: { abierto: boolean; children: ComponentChildren; onCerrar?: () => void; clase?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar?.(); };
    addEventListener('keydown', esc);
    return () => { removeEventListener('keydown', esc); prev?.focus?.(); };
  }, [abierto]);
  if (!abierto) return null;
  return (
    <div class="modal-fondo" onClick={(e) => { if (e.target === e.currentTarget) onCerrar?.(); }}>
      <div class={`modal ${clase}`} role="dialog" aria-modal="true" tabIndex={-1} ref={ref}>{children}</div>
    </div>
  );
}

/* ------------------------------ números animados ------------------------------ */
export function Contador({ valor, formato = money, ms = 700 }: { valor: number; formato?: (n: number) => string; ms?: number }) {
  const [v, setV] = useState(valor);
  const desde = useRef(valor);
  useEffect(() => {
    const ini = desde.current;
    if (ini === valor || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setV(valor); desde.current = valor; return; }
    const t0 = performance.now();
    let raf = 0;
    const paso = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const e = 1 - (1 - k) ** 3;
      setV(ini + (valor - ini) * e);
      if (k < 1) raf = requestAnimationFrame(paso);
      else desde.current = valor;
    };
    raf = requestAnimationFrame(paso);
    return () => { cancelAnimationFrame(raf); desde.current = valor; };
  }, [valor]);
  return <>{formato(v)}</>;
}

/* ------------------------------ reloj circular ------------------------------ */
export function RelojAnillo({ restanteMs, totalMs, tam = 52 }: { restanteMs: number | null; totalMs: number; tam?: number }) {
  if (restanteMs === null) return <div class="reloj-anillo sin" style={{ width: tam, height: tam }} title="Sin reloj">∞</div>;
  const k = totalMs > 0 ? Math.max(0, Math.min(1, restanteMs / totalMs)) : 0;
  const r = tam / 2 - 4;
  const C = 2 * Math.PI * r;
  const seg = Math.ceil(restanteMs / 1000);
  const urgente = seg <= 10;
  return (
    <div class={`reloj-anillo ${urgente ? 'urgente' : ''}`} style={{ width: tam, height: tam }} role="timer" aria-label={`${seg} segundos`}>
      <svg width={tam} height={tam} viewBox={`0 0 ${tam} ${tam}`}>
        <circle cx={tam / 2} cy={tam / 2} r={r} class="ra-fondo" />
        <circle cx={tam / 2} cy={tam / 2} r={r} class="ra-prog" stroke-dasharray={C} stroke-dashoffset={C * (1 - k)} transform={`rotate(-90 ${tam / 2} ${tam / 2})`} />
      </svg>
      <b>{seg}</b>
    </div>
  );
}

/* ------------------------------ gráfico de líneas (SVG) ------------------------------ */
export interface SerieGrafico { nombre: string; valores: number[]; clase: string; punteada?: boolean }
export function GraficoLineas({ series, alto = 180, formatoY = num, titulo }: { series: SerieGrafico[]; alto?: number; formatoY?: (n: number) => string; titulo: string }) {
  const W = 640, H = alto, pl = 52, pr = 12, pt = 12, pb = 24;
  const todos = series.flatMap((s) => s.valores);
  if (!todos.length) return null;
  let min = Math.min(0, ...todos), max = Math.max(...todos);
  if (max === min) max = min + 1;
  const n = Math.max(...series.map((s) => s.valores.length));
  const x = (i: number) => pl + (n <= 1 ? 0 : (i * (W - pl - pr)) / (n - 1));
  const y = (v: number) => pt + (1 - (v - min) / (max - min)) * (H - pt - pb);
  const ticks = [min, min + (max - min) / 2, max];
  return (
    <figure class="grafico">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={titulo} preserveAspectRatio="none">
        {ticks.map((t) => <g><line x1={pl} x2={W - pr} y1={y(t)} y2={y(t)} class="g-grid" /><text x={pl - 6} y={y(t) + 4} class="g-eje" text-anchor="end">{formatoY(t)}</text></g>)}
        {min < 0 && <line x1={pl} x2={W - pr} y1={y(0)} y2={y(0)} class="g-cero" />}
        {series.map((s) => (
          <polyline class={`g-linea ${s.clase} ${s.punteada ? 'punteada' : ''}`} fill="none"
            points={s.valores.map((v, i) => `${x(i)},${y(v)}`).join(' ')} vector-effect="non-scaling-stroke" />
        ))}
        <text x={pl} y={H - 6} class="g-eje">Sem 1</text>
        <text x={W - pr} y={H - 6} class="g-eje" text-anchor="end">Sem {n}</text>
      </svg>
      <figcaption class="leyenda">
        {series.map((s) => <span><i class={`lg ${s.clase} ${s.punteada ? 'punteada' : ''}`} />{s.nombre}</span>)}
      </figcaption>
    </figure>
  );
}
