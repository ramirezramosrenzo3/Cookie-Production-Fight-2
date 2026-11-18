/**
 * TRANSPORTE ONLINE (Supabase)
 *  - Identidad: sesión anónima de Supabase Auth (auth.uid()).
 *  - Datos: una sola función `sincronizar` por ciclo (incremental).
 *  - Tiempo real: canal Broadcast para "¡sincronicen ya!" y mensajes rápidos del equipo.
 */
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { Equipo, Rol } from '../engine';
import type { MensajeEquipo, OpcionesSala, Sync, Transporte } from './tipos';

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const onlineDisponible = () => !!(URL && KEY && !URL.includes('TU-PROYECTO'));

let cliente: SupabaseClient | null = null;
async function sb(): Promise<SupabaseClient> {
  if (!onlineDisponible()) throw new Error('El modo online no está configurado (faltan las claves de Supabase).');
  if (!cliente) {
    // Carga diferida: quien juega "solo" nunca descarga la librería de Supabase
    const { createClient } = await import('@supabase/supabase-js');
    cliente = createClient(URL!, KEY!, { auth: { persistSession: true, autoRefreshToken: true } });
  }
  const { data } = await cliente.auth.getSession();
  if (!data.session) {
    const { error } = await cliente.auth.signInAnonymously();
    if (error) throw new Error('No se pudo iniciar sesión. Activa "Anonymous sign-ins" en Supabase > Authentication.');
  }
  return cliente;
}

export function traducirError(e: unknown): string {
  const m = String((e as { message?: string })?.message ?? e ?? '');
  if (/failed to fetch|networkerror|load failed|network/i.test(m)) return 'Sin conexión. Reintentando…';
  if (/could not find the function|schema cache/i.test(m)) return 'Falta actualizar la base de datos (ver docs/DESPLIEGUE.md).';
  if (/JWT|token/i.test(m)) return 'La sesión expiró. Recarga la página.';
  return m || 'Ocurrió un error';
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const c = await sb();
  const { data, error } = await c.rpc(fn, args);
  if (error) throw new Error(traducirError(error));
  return data as T;
}

export async function crearSalaOnline(o: OpcionesSala): Promise<string> {
  return rpc<string>('crear_sala', {
    p_nombre: o.nombre, p_rondas: o.rondas, p_segundos: o.segundos, p_avatar: o.avatar,
    p_sabores: o.sabores, p_autopiloto: o.autopiloto,
  });
}
export async function unirseOnline(codigo: string, nombre: string, avatar: number): Promise<string> {
  return rpc<string>('unirse_sala', { p_codigo: codigo.trim().toUpperCase(), p_nombre: nombre, p_avatar: avatar });
}

export class TransporteSupabase implements Transporte {
  readonly modo = 'online' as const;
  readonly intervalo = 1500;
  private canal: RealtimeChannel | null = null;
  private cbMsg: ((m: MensajeEquipo) => void) | null = null;
  private cbCambio: (() => void) | null = null;

  constructor(readonly codigo: string) {
    void sb().then((c) => {
      this.canal = c.channel(`cpf2:${codigo}`, { config: { broadcast: { self: false } } })
        .on('broadcast', { event: 'msg' }, ({ payload }) => this.cbMsg?.(payload as MensajeEquipo))
        .on('broadcast', { event: 'cambio' }, () => this.cbCambio?.())
        .subscribe();
    }).catch(() => { /* sin tiempo real: queda la sincronización periódica */ });
  }

  private avisar() { void this.canal?.send({ type: 'broadcast', event: 'cambio', payload: {} }); }

  sincronizar(desde: number) { return rpc<Sync | null>('sincronizar', { p_codigo: this.codigo, p_desde: desde }); }
  async completarBots() { await rpc('completar_bots', { p_codigo: this.codigo }); this.avisar(); }
  async quitarBots() { await rpc('quitar_bots', { p_codigo: this.codigo }); this.avisar(); }
  async salir() { await rpc('salir_sala', { p_codigo: this.codigo }); this.avisar(); }
  async iniciar() { await rpc('iniciar_sala', { p_codigo: this.codigo }); this.avisar(); }
  async elegirPuesto(equipo: Equipo, rol: Rol) {
    await rpc('elegir_puesto', { p_codigo: this.codigo, p_equipo: equipo, p_rol: rol }); this.avisar();
  }
  async liberarPuesto() { await rpc('liberar_puesto', { p_codigo: this.codigo }); this.avisar(); }
  async enviarDecision(ronda: number, payload: Record<string, unknown>) {
    await rpc('enviar_decision', { p_codigo: this.codigo, p_ronda: ronda, p_payload: payload }); this.avisar();
  }
  async extender(ronda: number) { await rpc('extender_ronda', { p_codigo: this.codigo, p_ronda: ronda }); }
  async revancha() { const c = await rpc<string>('revancha', { p_codigo: this.codigo }); this.avisar(); return c; }
  enviarMensaje(m: MensajeEquipo) { void this.canal?.send({ type: 'broadcast', event: 'msg', payload: m }); }
  alMensaje(cb: (m: MensajeEquipo) => void) { this.cbMsg = cb; }
  alCambio(cb: () => void) { this.cbCambio = cb; }
  cerrar() { if (this.canal && cliente) void cliente.removeChannel(this.canal); this.canal = null; }
}
