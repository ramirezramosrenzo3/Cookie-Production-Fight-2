/**
 * TRANSPORTE LOCAL: partida contra 5 bots sin servidor (funciona sin internet).
 * Imita la semántica de las funciones SQL para que la interfaz no note la diferencia.
 */
import { EQUIPOS, ROLES, EVENTO_SEGUNDOS_EXTRA, semillaNueva, type Equipo, type Rol } from '../engine';
import type { DecisionFila, JugadorInfo, Sync, Transporte } from './tipos';

export interface OpcionesLocal {
  nombre: string;
  avatar: number;
  rondas: number;
  segundos: number; // 0 = sin reloj
  sabores: number;
  equipo: Equipo;
  rol: Rol;
  semilla?: number;
}

export class TransporteLocal implements Transporte {
  readonly modo = 'local' as const;
  readonly codigo = 'SOLO';
  readonly intervalo = 250;
  private jugadores: JugadorInfo[];
  private decisiones: DecisionFila[] = [];
  private actual: Record<string, unknown> | null = null;
  private cierres: number[] = []; // instante de cierre de cada semana
  private extras = new Map<number, number>();
  private iniciada = Date.now();
  private semilla: number;
  private terminado = false;

  constructor(private op: OpcionesLocal) {
    this.semilla = op.semilla ?? semillaNueva();
    const libres = Array.from({ length: 16 }, (_, i) => i + 1).filter((a) => a !== op.avatar);
    let b = 0;
    this.jugadores = [];
    for (const X of EQUIPOS) {
      for (const rol of ROLES) {
        const yo = X === op.equipo && rol === op.rol;
        this.jugadores.push(yo
          ? { nombre: op.nombre, equipo: X, rol, es_anfitrion: true, es_bot: false, avatar: op.avatar, eligio: true }
          : { nombre: `Bot ${++b}`, equipo: X, rol, es_anfitrion: false, es_bot: true, avatar: libres[(this.semilla + b * 5) % libres.length], eligio: true });
      }
    }
  }

  private ronda() { return this.cierres.length + 1; }
  private inicio(r: number) { return r === 1 ? this.iniciada : this.cierres[r - 2]; }
  private fin(r: number) {
    if (!this.op.segundos) return null;
    return this.inicio(r) + (this.op.segundos + (this.extras.get(r) || 0)) * 1000;
  }

  private cerrarSiCorresponde() {
    if (this.terminado) return;
    const r = this.ronda();
    const fin = this.fin(r);
    if (this.actual || (fin !== null && Date.now() >= fin + 300)) {
      if (this.actual) this.decisiones.push({ ronda: r, equipo: this.op.equipo, rol: this.op.rol, payload: this.actual as never });
      this.actual = null;
      this.cierres.push(Date.now());
      if (r >= this.op.rondas) this.terminado = true;
    }
  }

  async sincronizar(desde: number): Promise<Sync> {
    this.cerrarSiCorresponde();
    const r = this.ronda();
    const yo = this.jugadores.find((j) => !j.es_bot)!;
    const fin = this.terminado ? null : this.fin(r);
    return {
      ahora: new Date().toISOString(),
      sala: {
        codigo: this.codigo, estado: this.terminado ? 'terminado' : 'jugando', total_rondas: this.op.rondas,
        segundos: this.op.segundos, semilla: this.semilla, sabores: this.op.sabores, autopiloto: false,
        eleccion_fin: null, iniciada_en: new Date(this.iniciada).toISOString(), siguiente: null,
      },
      jugadores: this.jugadores.map((j) => ({ ...j })),
      yo: { nombre: yo.nombre, equipo: yo.equipo, rol: yo.rol, es_anfitrion: true, avatar: yo.avatar },
      semana: {
        ronda: r, cerradas: r - 1,
        inicio: new Date(this.inicio(r)).toISOString(),
        fin: fin === null ? null : new Date(fin).toISOString(),
        extra: this.extras.get(r) || 0,
        necesarios: 1,
        listos: this.actual ? [`${this.op.equipo}:${this.op.rol}`] : [],
      },
      mi_decision: this.actual,
      decisiones: this.decisiones.filter((d) => d.ronda > desde),
    };
  }

  async enviarDecision(ronda: number, payload: Record<string, unknown>) {
    if (this.terminado) throw new Error('La partida ya terminó');
    if (ronda !== this.ronda()) throw new Error('La semana ya cambió, revisa la pantalla');
    this.actual = payload;
    // Sin reloj la semana cierra al enviar; con reloj, igual que online: cuando todas las personas decidieron.
  }

  async extender(ronda: number) {
    if (this.op.segundos && ronda === this.ronda() && !this.extras.has(ronda)) this.extras.set(ronda, EVENTO_SEGUNDOS_EXTRA);
  }

  async revancha() { return 'SOLO'; }
  async completarBots() {}
  async quitarBots() {}
  async salir() {}
  async iniciar() {}
  async elegirPuesto() {}
  async liberarPuesto() {}
  cerrar() {}
}
