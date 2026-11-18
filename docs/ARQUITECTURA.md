# Arquitectura

```
┌──────────────────────────── Navegador (PWA) ────────────────────────────┐
│  ui/ (Preact)  ──lee──▶  state.ts (signals)  ──usa──▶  engine/ (puro)   │
│                               │                                          │
│                               ▼                                          │
│                     net/Transporte (interfaz)                            │
│                     ├─ TransporteLocal   → partida vs bots, sin red      │
│                     └─ TransporteSupabase→ RPC `sincronizar` + Broadcast │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │ HTTPS (1 llamada / 1,5 s)   WebSocket (avisos y mensajes)
                       ┌────────▼─────────┐
                       │ Supabase         │  Postgres: salas, jugadores, rondas,
                       │  Auth anónimo    │  decisiones, extras · funciones
                       │  Realtime        │  security definer · RLS · pg_cron
                       └──────────────────┘
```

## Principio central: simulación determinista en el cliente

El servidor **no simula**: solo guarda decisiones y decide cuándo cierra cada semana. Cada dispositivo:

1. Recibe las decisiones de las semanas **cerradas** (nunca las de la semana en curso).
2. Avanza el motor con `avanzarConSemilla(estado, t, decisiones)`, usando un generador `mulberry32` derivado de la semilla de la sala y del número de semana.
3. Completa en el propio motor las decisiones de los **bots** y, si la sala tiene autopiloto, las de las personas que no enviaron (`resolverDecisiones`). Como `decisionBot` no usa azar, todos los dispositivos obtienen lo mismo.

Ventajas: costo de servidor casi nulo, partidas reproducibles (`?semilla=`), modo solo sin red con el mismo código. Contrapartida: las decisiones cerradas del rival son visibles para un usuario técnico (ver `ANALISIS.md`, S3).

## Módulos

| Ruta | Responsabilidad |
|---|---|
| `src/engine/reglas.ts` | Parámetros, productos, calidades, eventos, habilidades, bots. **Único lugar con números de balance.** |
| `src/engine/motor.ts` | Estado inicial, saneo de decisiones, subasta, una semana completa, bots, reproducción. Sin DOM ni red. |
| `src/engine/analitica.ts` | KPIs (nivel de servicio, efecto látigo, costos), premios y consejos para el informe final. |
| `src/engine/rng.ts` | Azar determinista (idéntico a la v1). |
| `src/net/tipos.ts` | Contrato `Transporte` y formas de datos de la red. |
| `src/net/local.ts` | Servidor en memoria que imita las funciones SQL (modo solo). |
| `src/net/supabase.ts` | Cliente Supabase (carga diferida), sesión anónima, RPC y canal Broadcast. |
| `src/state.ts` | Señales de la app, ciclo de sincronización, reloj, borrador de decisión, envío automático. |
| `src/ui/` | Componentes y pantallas. |
| `src/fx/` | Sonido (WebAudio), vibración, confeti. |
| `supabase/migrations/` | Esquema, funciones, seguridad y tareas programadas. |
| `legacy/` | Motor y pruebas de la v1, usados por la prueba de paridad. |

## Ciclo de una semana (online)

1. Cada celular llama a `sincronizar(codigo, ultimaSemanaConocida)` cada 1,5 s (o al instante si llega un aviso por Broadcast).
2. La función cierra la semana si **todas las personas** enviaron o si se acabó el tiempo (+3 s de gracia), y devuelve solo las decisiones nuevas.
3. El cliente avanza el motor, muestra la tarjeta de cierre y prepara el borrador de la nueva semana.
4. 2,5 s antes del final, si no enviaste (o tienes cambios sin enviar), se envía lo que tienes en pantalla.
5. Si nadie tiene la app abierta, `pg_cron` cierra la semana igual (cada 30 s).

## Seguridad

- Las tablas no se leen ni se escriben directamente (`revoke all`); todo pasa por 12 funciones `security definer` con `search_path` fijo.
- Identidad = `auth.uid()` de una sesión anónima; los ids nunca salen en las respuestas.
- `sincronizar` jamás devuelve decisiones de la semana en curso.
- Bloqueos `pg_advisory_xact_lock(hashtext(codigo))` evitan carreras entre envío y cierre.

## Decisiones de diseño (ADR resumidos)

- **Preact + signals** en lugar de React: misma ergonomía, 10× más liviano, ideal para celulares modestos.
- **Sin framework CSS:** tokens de marca en `:root` con variante oscura; un solo archivo de estilos.
- **Sondeo + Broadcast** en lugar de `postgres_changes`: Realtime sobre tablas con permisos por columna es frágil; un aviso sin datos + una lectura incremental es simple y robusto.
- **Paridad estricta con la v1:** los números de balance no cambian en la 2.0. Cualquier cambio de reglas debe ir en una versión de reglas nueva, con simulaciones.
