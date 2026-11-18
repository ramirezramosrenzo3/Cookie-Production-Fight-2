import type { DecEquipo, Equipo, Rol } from '../engine';

export type EstadoSala = 'espera' | 'eleccion' | 'jugando' | 'terminado';

export interface SalaInfo {
  codigo: string;
  estado: EstadoSala;
  total_rondas: number;
  segundos: number; // 0 = sin reloj (solo modo local)
  semilla: number;
  sabores: number;
  autopiloto: boolean;
  eleccion_fin: string | null;
  iniciada_en: string | null;
  siguiente: string | null;
}
export interface JugadorInfo {
  nombre: string;
  equipo: Equipo | null;
  rol: Rol | null;
  es_anfitrion: boolean;
  es_bot: boolean;
  avatar: number;
  eligio?: boolean;
}
export interface YoInfo {
  nombre: string;
  equipo: Equipo | null;
  rol: Rol | null;
  es_anfitrion: boolean;
  avatar: number;
}
export interface SemanaInfo {
  ronda: number;
  cerradas: number;
  inicio: string | null;
  fin: string | null;
  extra: number;
  necesarios: number;
  listos: string[];
}
export interface DecisionFila { ronda: number; equipo: Equipo; rol: Rol; payload: DecEquipo[Rol] }

export interface Sync {
  ahora: string;
  sala: SalaInfo;
  jugadores: JugadorInfo[];
  yo: YoInfo | null;
  semana: SemanaInfo | null;
  mi_decision: Record<string, unknown> | null;
  decisiones: DecisionFila[];
}

export interface OpcionesSala {
  nombre: string;
  avatar: number;
  rondas: number;
  segundos: number;
  sabores: number;
  autopiloto: boolean;
}

export interface MensajeEquipo { de: string; avatar: number; equipo: Equipo; texto: string; ts: number }

export interface Transporte {
  readonly modo: 'local' | 'online';
  readonly codigo: string;
  /** Intervalo de sincronización recomendado (ms). */
  readonly intervalo: number;
  sincronizar(desde: number): Promise<Sync | null>;
  completarBots(): Promise<void>;
  quitarBots(): Promise<void>;
  salir(): Promise<void>;
  iniciar(): Promise<void>;
  elegirPuesto(equipo: Equipo, rol: Rol): Promise<void>;
  liberarPuesto(): Promise<void>;
  enviarDecision(ronda: number, payload: Record<string, unknown>): Promise<void>;
  extender(ronda: number): Promise<void>;
  revancha(): Promise<string>;
  /** Mensajes rápidos al equipo (solo online). */
  enviarMensaje?(m: MensajeEquipo): void;
  alMensaje?(cb: (m: MensajeEquipo) => void): void;
  /** Aviso inmediato para que los demás sincronicen ya (sin esperar el intervalo). */
  alCambio?(cb: () => void): void;
  cerrar(): void;
}
