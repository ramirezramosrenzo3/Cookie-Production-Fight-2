# Roadmap propuesto

## Fase 1 — Lanzamiento 2.0 (este repositorio)
- [x] Motor en TypeScript con paridad exacta con la v1
- [x] Seguridad: Auth anónimo, bots en el motor, permisos mínimos, límite de salas
- [x] Sincronización incremental de 1 llamada + avisos por Realtime + pg_cron
- [x] Nueva interfaz móvil, modo oscuro, accesibilidad
- [x] Sonido, vibración, transiciones, confeti, premios
- [x] Modo solo sin servidor, modo presentador, revancha, autopiloto, mensajes rápidos
- [x] Informe final con efecto látigo, KPIs y consejos
- [x] CI + despliegue a GitHub Pages
- [ ] Prueba piloto con un grupo real y ajuste de textos

## Fase 2 — Retención y diversión (2-4 semanas)
- Presets de partida: **Rápida** (12 × 40 s), **Clase** (30 × 60 s), **Maratón**.
- Mini-predicción durante la espera ("¿quién vende más esta semana?").
- **Rediseño del Distribuidor:** envío exprés (1 semana, +costo) o contratos de volumen; validar con simulaciones de 1 000 partidas.
- Logros persistentes (primera victoria, 100 % de servicio, sabotaje perfecto…).
- Música de fondo opcional y más variaciones de sonido.
- Animación de camiones entre nodos al cerrar la semana.
- Reacciones con emojis visibles para todo el equipo.

## Fase 3 — Plataforma educativa (1-2 meses)
- **Panel docente:** crear varias salas con la misma semilla, ver todas a la vez, exportar resultados a CSV.
- **Servidor autoritativo opcional** (Edge Function): el servidor simula y solo envía a cada equipo lo que puede ver. Cierra el hallazgo S3.
- Repetición de la partida semana a semana ("replay") para el debrief en clase.
- Ranking por curso / temporada.
- Internacionalización (inglés/portugués) extrayendo textos a un diccionario.

## Fase 4 — Escala
- Analítica de producto (abandono, tiempos por rol, uso de sugerencias).
- Monitoreo de errores en el cliente.
- Bots con niveles de dificultad (prudente, agresivo, caótico).
