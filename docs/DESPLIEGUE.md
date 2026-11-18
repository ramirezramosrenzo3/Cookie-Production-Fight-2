# Despliegue

El modo **Jugar solo** funciona sin configurar nada. El modo **online** necesita un proyecto de Supabase (plan gratuito suficiente).

## 1. Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com) (región São Paulo si juegan desde Perú).
2. **Authentication → Sign In / Providers → Anonymous sign-ins: activar.** Sin esto el modo online responde "No se pudo iniciar sesión".
3. **Database → Extensions → `pg_cron`: activar** (opcional pero recomendado: cierra semanas aunque nadie tenga la app abierta y borra salas viejas).
4. **SQL Editor → New query:** pega todo `supabase/migrations/0001_cpf2.sql` y ejecuta. Es idempotente.
   - Con la CLI: `supabase link --project-ref <ref>` y `supabase db push`.
5. **Project Settings → API:** copia la *Project URL* y la clave *publishable/anon*. **Nunca** uses la `service_role`.

> La base de la v1 y la de la v2 son incompatibles (la v2 usa `auth.uid()`). Usa un proyecto nuevo o un esquema limpio.

## 2. Desarrollo local

```bash
cp .env.example .env.local   # completa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

## 3. GitHub Pages (automático)

1. En el repositorio: **Settings → Pages → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables:** crea `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (son públicas por diseño; van como variables, no secretos).
3. Cada push a `main` ejecuta `.github/workflows/deploy.yml` y publica `dist/`.

Cualquier hosting estático sirve (Vercel, Netlify, Cloudflare Pages): comando `npm run build`, carpeta `dist`.

## 4. Verificación

```bash
npm run typecheck && npm test && npm run build
node scripts/smoke.mjs            # partida completa en Chromium (requiere Playwright)
scripts/probar-sql.sh             # migración + 13 escenarios en un Postgres local
```

## 5. Modo presentador

Abre `https://<tu-sitio>/?tv=CODIGO` en el proyector: muestra el código para unirse, luego el marcador, el reloj, quién ya decidió, el evento activo y la curva de dinero.
