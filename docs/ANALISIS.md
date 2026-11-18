# Auditoría de Cookie Production Fight! (v1 · 5.1.3)

> Informe de asesoría: estado actual, riesgos, oportunidades y qué resuelve la v2.
> Base analizada: repositorio `juego-reposicion` (commit `567c97b`), 4 600 líneas de código, 4,3 MB de imágenes.

## 1. Resumen ejecutivo

**Veredicto: no hay que tirar todo.** El corazón del juego, el motor determinista (`game.js`), es una muy buena decisión de arquitectura: cada celular recalcula la partida con la misma semilla y obtiene el mismo resultado, sin servidor de juego. Las reglas están bien pensadas, tienen 122 pruebas y la identidad visual es encantadora.

Lo que sí hay que rehacer es **todo lo que rodea al motor**:

| Área | Nota v1 | Problema principal | Estado en v2 |
|---|---|---|---|
| Motor y reglas | 8/10 | Estado global mutable (`setSabores`) | ✅ Portado a TypeScript, **paridad exacta** comprobada |
| Seguridad | 4/10 | Un jugador puede enviar decisiones en nombre de los bots rivales | ✅ Bots resueltos en el motor, sesión con Supabase Auth |
| Red y costos | 3/10 | ~8 consultas cada 1,2 s por celular; descarga todo el historial siempre | ✅ 1 consulta incremental cada 1,5 s |
| Interfaz | 5/10 | Tablas de números, `innerHTML` completo, sin modo oscuro | ✅ Preact, tarjetas por sabor, controles táctiles |
| Dinamismo / "juice" | 3/10 | Sin sonido, poca animación, sin celebración | ✅ Sonido sintetizado, vibración, confeti, transiciones |
| Aprendizaje | 4/10 | La partida termina con un total y nada más | ✅ Informe final: efecto látigo, KPIs, premios, consejos |
| Operación | 3/10 | Sin CI, sin build, CDN sin versión fija, salas eternas | ✅ CI, build con Vite, versiones fijas, limpieza con pg_cron |
| Rendimiento de carga | 4/10 | 4,3 MB de PNG (el logo pesa 570 KB) | ✅ 578 KB en WebP (−87 %), Supabase con carga diferida |

## 2. Fortalezas que hay que conservar

1. **Motor puro y determinista.** Se puede reproducir, auditar y probar. Es la base para torneos justos, repeticiones y un modo presentador.
2. **Modelo de seguridad SQL bien encaminado:** funciones `security definer`, RLS, columnas secretas sin permiso de lectura, `pg_advisory_xact_lock` contra condiciones de carrera y SQL idempotente.
3. **Diseño económico rico:** demanda compartida con elasticidad, desvío de clientes, subasta a sobre cerrado, costo de inventario por etapa, eventos y sabotajes balanceados por simulación.
4. **Identidad local y con humor** (Panamericana Sur, Fenómeno del Niño, MAINCRA). Es un diferenciador: hay que potenciarla, no neutralizarla.
5. **Pruebas automáticas del motor** (122) y documentación de reglas muy detallada.

## 3. Hallazgos

Severidad: 🔴 alta · 🟠 media · 🟡 baja.

### 3.1 Seguridad e integridad competitiva

| # | Sev. | Hallazgo | Impacto | v2 |
|---|---|---|---|---|
| S1 | 🔴 | `bots_pendientes` entrega a **cualquier persona de la sala** los ids secretos de **todos** los bots, y `enviar_decision` acepta la **primera** decisión que llegue para un bot. | Con la consola del navegador, un alumno puede decidir por el bot rival (producir 0, precio $8, pedir 0) antes que los celulares honestos. | ✅ Eliminado. Los bots se calculan dentro del motor en cada dispositivo; nadie envía por ellos. |
| S2 | 🟠 | La identidad es un UUID guardado en `localStorage` que viaja como parámetro (`p_jugador`). | Quien conozca ese UUID (celular compartido, captura de red) actúa como esa persona. | ✅ Sesión anónima de Supabase Auth; las funciones usan `auth.uid()`. |
| S3 | 🟠 | Las decisiones de semanas cerradas son legibles por todos, **incluidas las pujas del rival** (la regla dice que no se ven). | Información privilegiada para quien abra la consola. | ⚠️ Igual en v2 (es inherente a que cada celular simule). Solución completa: servidor autoritativo (ver Roadmap, fase 3). |
| S4 | 🟠 | `crear_sala` sin límite. | Cualquiera puede llenar la base con salas. | ✅ Máximo 12 salas por persona por hora. |
| S5 | 🟡 | Supabase se carga de un CDN con versión flotante (`@supabase/supabase-js@2`). | Un cambio de versión puede romper el juego un día cualquiera. | ✅ Versión fija empaquetada con Vite. |
| S6 | 🟡 | Las funciones quedan con `EXECUTE` para `public` (comportamiento por defecto de Postgres). | Funciones internas (`cerrar_ronda`, `validar_envio`) invocables directamente. | ✅ `revoke` general y `grant` solo a las 12 funciones públicas. |
| S7 | 🟡 | Payload de decisión hasta 20 KB sin validar el tipo. | Abuso de almacenamiento. | ✅ 8 KB y debe ser un objeto JSON. |

### 3.2 Red, costos y escalabilidad

- 🔴 **Sondeo pesado.** Cada celular hace en cada ciclo de 1,2 s: `rondas`, `salas`, `jugadores`, `decisiones` (¡todas!), `mi_jugador`, `estado_semana`, `mi_decision`, `bots_pendientes` y, si hay bots, varios `enviar_decision`. Son **~7 solicitudes por segundo por celular**, ~40/s en una sala de 6.
- 🔴 **Descarga creciente.** `decisiones` trae el historial completo en cada ciclo: en la semana 30 son ~180 filas (~30 KB) cada 1,2 s. Estimación por partida de 30 semanas con 6 personas: **~150 MB de transferencia**. Con los 5 GB mensuales del plan gratuito de Supabase alcanza para **~35 partidas al mes**.
- 🟠 Cada celular **re-simula la partida completa desde la semana 1** en cada ciclo (batería).
- 🟠 Si todas las personas cierran la app, la partida se congela (nadie llama a `cerrar_ronda`).
- 🟡 Las salas nunca se borran.

**v2:** una sola función `sincronizar(codigo, desde)` devuelve solo lo nuevo (≈1 KB por ciclo), además cierra la semana o la elección si corresponde; el motor avanza de forma incremental; un canal de Realtime avisa "sincronicen ya" para que el cambio de semana se sienta instantáneo; `pg_cron` cierra semanas vencidas y borra salas de más de 3 días. Estimación: **~10× menos solicitudes y ~15× menos transferencia.**

### 3.3 Diseño de juego

- 🟠 **Tiempo muerto.** Al enviar tu decisión no hay nada que hacer hasta que cierre la semana. *v2:* mensajes rápidos al equipo, pestaña Mercado, cadena animada. *Propuesta:* mini-predicción ("¿quién venderá más esta semana?") con puntos de bonificación.
- 🟠 **Roles asimétricos.** La Tienda tiene 2 palancas fuertes (precio y pedido); la Fábrica, 2; el Distribuidor solo pide y puja. Es el rol menos divertido. *Propuestas:* envío exprés (1 semana de demora por un costo), o negociar "contratos" de volumen con la fábrica.
- 🟠 **Duración.** 30 semanas × 60 s + elección = **más de 32 minutos**. Excelente para una clase, largo para jugar entre amigos. *Propuesta:* preset "Partida rápida" (12 semanas × 40 s ≈ 9 min).
- 🟠 **Desconexiones castigan a todo el equipo**: si alguien cierra el celular, su puesto no pide ni produce. *v2:* **Autopiloto** (opción de sala): el bot decide por quien no envió.
- 🟡 **Sin aprendizaje explícito al final.** El juego es un "Beer Game" con esteroides, pero nunca muestra el efecto látigo. *v2:* gráfico demanda vs pedidos de cada etapa, nivel de servicio, ventas perdidas, costo de inventario y consejos.
- 🟡 **Sin meta-juego:** no hay historial, logros ni ranking. *Ver Roadmap.*
- 🟡 La habilidad **GTA** ("el último camión") es difícil de entender sin verla. *v2:* camión con humo y "−35 %" en la cadena.

### 3.4 Interfaz y experiencia

- 🟠 Formularios de **tablas con inputs pequeños**; en celular hay desplazamiento horizontal y se escribe mucho. *v2:* tarjeta por sabor con botones −/+ de 44 px, deslizador de precio, atajos "💡 Sugerencia" e "↺ Igual que la semana pasada".
- 🟠 **Falta el concepto clave a la vista:** cuántas semanas me alcanza lo que tengo + lo que viene. *v2:* indicador de **cobertura** por sabor (rojo = riesgo de quiebre, ámbar = exceso).
- 🟠 **Re-render con `innerHTML`**: cualquier cambio redibuja el formulario. *v2:* componentes con estado; el sondeo nunca borra lo que escribes.
- 🟠 **Contraste**: texto blanco sobre verde claro (#7FD08F) ≈ 2:1, por debajo de WCAG AA. Sin estilos de foco. *v2:* foco visible, contrastes revisados, `prefers-reduced-motion`, modo oscuro completo.
- 🟡 Nombres inconsistentes ("Tienda final" / "Tienda minorista").
- 🟡 Sin tutorial: solo texto de reglas. *v2:* "¿Cómo se juega?" en 6 tarjetas + modo solo sin reloj para aprender.

### 3.5 Código y operación

- 🟠 `app.js` de 1 400 líneas con plantillas de texto; sin tipos ni módulos; sin build.
- 🟠 Versiones contradictorias en los encabezados (`game.js` dice 3.1, `app.js` 4.1, el motor 5.1.3).
- 🟠 Sin CI ni README; la guía asume subir un ZIP a mano.
- 🟡 `setSabores()` muta una lista global: cualquier llamada olvidada cambia el resultado.

## 4. Lo que trae Cookie Production Fight! 2

**Operativo:** TypeScript estricto · Vite · Preact (34 KB gzip de carga inicial) · Supabase con carga diferida · CI (tipos, pruebas, SQL, build, prueba en navegador) · despliegue automático a GitHub Pages · PWA con service worker.

**Calidad:** prueba de **paridad** que compara el motor nuevo contra `game.js` 5.1.3 (3, 4 y 5 sabores, 40 semanas, bots, eventos y habilidades: resultado idéntico) · pruebas de reglas, bots, autopiloto y analítica · 13 escenarios SQL probados en Postgres real (seguridad, cierre, cron, revancha) · prueba de humo que juega una partida completa en Chromium.

**Interfaz:** HUD fijo con reloj circular y marcador animado · 3 pestañas (Decidir · Cadena · Mercado) · barra de envío fija · cobertura por sabor · modo oscuro · accesibilidad.

**Dinamismo y alegría:** efectos de sonido sintetizados (0 KB de audio) · vibración · tarjeta de cierre de semana con "+$261" · alerta de sabotaje que sacude la pantalla · confeti de galletas al ganar · premios divertidos ("Villanos del año", "Cadena zen", "Reyes del TikTok") · influencers con nombre propio.

**Nuevos modos:** **Jugar solo vs bots** sin servidor ni internet (con o sin reloj) · **Modo presentador** `?tv=CÓDIGO` para proyectar en clase · **Revancha** con un toque · `?semilla=N` para repetir exactamente el mismo mercado (torneos justos entre grupos).

## 5. Decisiones que necesito de ti

1. **¿Público principal?** Clase/universidad (prioriza informe final, modo presentador, duración larga) o casual entre amigos (prioriza partidas rápidas, logros, ranking). Cambia los valores por defecto y el roadmap.
2. **Avatares:** el historial dice "16 avatares reales". Si son retratos de personas reales, conviene su consentimiento antes de publicar el juego abierto, o reemplazarlos por personajes.
3. **¿Servidor autoritativo?** Una Edge Function que simule la semana ocultaría por completo las pujas del rival (S3). Suma complejidad y costo; recomendable solo si habrá competencias con premio o nota.
4. **Rediseño del Distribuidor** (envío exprés o contratos): ¿lo pruebo en una rama con simulaciones de balance?
5. **Nombre del repositorio:** GitHub no admite "!" en el nombre; propongo `Cookie-Production-Fight-2` (el título del juego conserva el "!").

## 6. Métricas recomendadas (para decidir con datos)

- Partidas iniciadas vs terminadas (abandono) y semana de abandono.
- Tiempo medio de decisión por rol (¿algún rol se aburre o se agobia?).
- % de decisiones enviadas automáticamente (señal de tiempo insuficiente o desconexión).
- Uso de "Sugerencia" (si es >60 %, el juego se está jugando solo).
- Diferencia de dinero final entre equipos (si siempre es enorme, falta un mecanismo de remontada).
