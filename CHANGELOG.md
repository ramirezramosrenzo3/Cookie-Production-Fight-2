# Changelog

## 2.0.0 — 2026-11-18

Reescritura completa del cliente y del backend sobre el mismo motor de reglas (5.1.3).

### Añadido
- Modo **Jugar solo** contra 5 bots sin servidor, con o sin reloj.
- **Modo presentador** (`?tv=CODIGO`), **revancha** y **autopiloto** para personas desconectadas.
- **Informe final** con efecto látigo, nivel de servicio, KPIs, premios y consejos.
- Indicador de **cobertura** por sabor, atajos "Sugerencia" e "Igual que la semana pasada".
- Sonido sintetizado, vibración, confeti, tarjeta de cierre de semana, alertas animadas.
- Mensajes rápidos al equipo (Realtime Broadcast).
- Modo oscuro, foco visible, `prefers-reduced-motion`.
- PWA con service worker; `?semilla=N` para mercados reproducibles.
- CI (tipos, pruebas, SQL en Postgres, build, prueba en navegador) y despliegue a GitHub Pages.

### Cambiado
- Motor portado a TypeScript sin estado global; **resultado idéntico** a la v1 (prueba de paridad).
- Los bots se resuelven dentro del motor; la semana cierra cuando deciden todas las personas.
- Una sola función `sincronizar` incremental reemplaza ~8 consultas por ciclo.
- Identidad con Supabase Auth anónimo (`auth.uid()`).
- Imágenes en WebP (−87 %).

### Seguridad
- Eliminado `bots_pendientes` (exponía ids de bots y permitía decidir por ellos).
- Permisos mínimos: solo 12 funciones ejecutables por usuarios autenticados.
- Límite de 12 salas por persona por hora; payload máximo 8 KB.
- Supabase empaquetado con versión fija (antes CDN con versión flotante).
