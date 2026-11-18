-- =====================================================================
--  COOKIE PRODUCTION FIGHT! 2 — BASE DE DATOS
--  Pegar TODO en Supabase > SQL Editor > Run (o `supabase db push`).
--  Idempotente: se puede ejecutar más de una vez.
--
--  Cambios clave respecto a la v1:
--   * Identidad con Supabase Auth anónimo (auth.uid()), no con un UUID que
--     viaja como parámetro: nadie puede hacerse pasar por otro jugador.
--   * Los bots ya NO envían decisiones: cada dispositivo las calcula dentro
--     del motor (deterministas). Se elimina bots_pendientes, que exponía los
--     ids secretos de los bots y permitía enviar decisiones en su nombre.
--   * Una sola llamada `sincronizar` reemplaza las 6-7 consultas por ciclo de
--     la v1, devuelve solo las semanas nuevas y además cierra la semana o la
--     elección cuando corresponde.
--   * Autopiloto opcional, revancha, límite de salas por persona,
--     limpieza automática de salas viejas y cierre por pg_cron.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- TABLAS ----------
create table if not exists salas (
  codigo text primary key,
  estado text not null default 'espera' check (estado in ('espera', 'eleccion', 'jugando', 'terminado')),
  total_rondas int not null default 30 check (total_rondas between 5 and 60),
  segundos int not null default 60 check (segundos between 20 and 180),
  semilla int not null,
  sabores smallint not null default 5 check (sabores in (3, 4, 5)),
  autopiloto boolean not null default true,
  anfitrion uuid not null,                 -- secreto: nunca se expone
  eleccion_fin timestamptz,
  iniciada_en timestamptz,
  siguiente text,                          -- código de la revancha
  creada_en timestamptz not null default now()
);

create table if not exists jugadores (
  sala text not null references salas(codigo) on delete cascade,
  id uuid not null,                        -- secreto: auth.uid() de la persona o uuid del bot
  nombre text not null check (length(nombre) between 1 and 20),
  equipo text check (equipo in ('A', 'B')),
  rol text check (rol in ('fabrica', 'distribuidor', 'tienda')),
  es_anfitrion boolean not null default false,
  es_bot boolean not null default false,
  avatar smallint check (avatar between 1 and 16),
  confirmado_en timestamptz,
  unido_en timestamptz not null default now(),
  primary key (sala, id)
);
create unique index if not exists puesto_unico on jugadores (sala, equipo, rol)
  where equipo is not null and rol is not null;

create table if not exists rondas (
  sala text not null references salas(codigo) on delete cascade,
  numero int not null,
  cerrada_en timestamptz not null default now(),
  primary key (sala, numero)
);

create table if not exists decisiones (
  sala text not null references salas(codigo) on delete cascade,
  ronda int not null,
  jugador uuid not null,                   -- secreto
  equipo text not null,
  rol text not null,
  payload jsonb not null,
  enviada_en timestamptz not null default now(),
  primary key (sala, ronda, jugador)
);
create index if not exists decisiones_sala_ronda on decisiones (sala, ronda);

create table if not exists extras (
  sala text not null references salas(codigo) on delete cascade,
  ronda int not null,
  segs int not null,
  primary key (sala, ronda)
);

-- ---------- AUXILIARES ----------
create or replace function yo() returns uuid
language plpgsql stable set search_path = public as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Sin sesión: activa el acceso anónimo en Supabase (ver docs/DESPLIEGUE.md)'; end if;
  return u;
end $$;

create or replace function ronda_actual(p_codigo text) returns int
language sql stable set search_path = public as $$
  select coalesce(max(numero), 0) + 1 from rondas where sala = p_codigo;
$$;

create or replace function inicio_ronda(p_codigo text, p_ronda int) returns timestamptz
language sql stable set search_path = public as $$
  select case when p_ronda = 1
              then (select iniciada_en from salas where codigo = p_codigo)
              else (select cerrada_en from rondas where sala = p_codigo and numero = p_ronda - 1)
         end;
$$;

create or replace function gracia_envio() returns interval
language sql immutable set search_path = public as $$ select interval '3 seconds' $$;

create or replace function fin_ronda(p_codigo text, p_ronda int) returns timestamptz
language sql stable set search_path = public as $$
  select inicio_ronda(p_codigo, p_ronda)
         + make_interval(secs => (select segundos from salas where codigo = p_codigo)
                                 + coalesce((select segs from extras where sala = p_codigo and ronda = p_ronda), 0));
$$;

create or replace function avatar_libre(p_codigo text, p_preferido int default null) returns int
language plpgsql volatile set search_path = public as $$
declare a int;
begin
  if p_preferido between 1 and 16
     and not exists (select 1 from jugadores where sala = p_codigo and avatar = p_preferido) then
    return p_preferido;
  end if;
  select n into a from generate_series(1, 16) n
    where not exists (select 1 from jugadores where sala = p_codigo and avatar = n)
    order by random() limit 1;
  return a;
end $$;

create or replace function validar_nombre(p_nombre text) returns text
language plpgsql immutable set search_path = public as $$
begin
  if trim(coalesce(p_nombre, '')) = '' then raise exception 'Escribe tu nombre'; end if;
  if length(trim(p_nombre)) > 20 then raise exception 'El nombre tiene más de 20 letras'; end if;
  return trim(p_nombre);
end $$;

-- Personas con puesto (las que deben decidir cada semana)
create or replace function personas_en_juego(p_codigo text) returns int
language sql stable set search_path = public as $$
  select count(*)::int from jugadores where sala = p_codigo and not es_bot and rol is not null;
$$;

-- ---------- SALA ----------
drop function if exists crear_sala(text, int, int, int, int, boolean);
create or replace function crear_sala(p_nombre text, p_rondas int, p_segundos int, p_avatar int default null,
                                      p_sabores int default 5, p_autopiloto boolean default true)
returns text
language plpgsql security definer set search_path = public as $$
declare
  u uuid := yo();
  letras text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text;
  nom text := validar_nombre(p_nombre);
begin
  if p_avatar is not null and (p_avatar < 1 or p_avatar > 16) then raise exception 'Avatar no válido'; end if;
  if p_sabores not in (3, 4, 5) then raise exception 'La dificultad debe ser de 3, 4 o 5 sabores'; end if;
  if p_rondas not between 5 and 60 then raise exception 'Las semanas deben estar entre 5 y 60'; end if;
  if p_segundos not between 20 and 180 then raise exception 'Los segundos deben estar entre 20 y 180'; end if;
  if (select count(*) from salas where anfitrion = u and creada_en > now() - interval '1 hour') >= 12 then
    raise exception 'Creaste demasiadas salas en la última hora. Espera un momento.';
  end if;
  loop
    c := '';
    for i in 1..4 loop
      c := c || substr(letras, 1 + floor(random() * length(letras))::int, 1);
    end loop;
    exit when not exists (select 1 from salas where codigo = c);
  end loop;
  insert into salas (codigo, total_rondas, segundos, semilla, anfitrion, sabores, autopiloto)
  values (c, p_rondas, p_segundos, floor(random() * 2000000000)::int, u, p_sabores, coalesce(p_autopiloto, true));
  insert into jugadores (sala, id, nombre, es_anfitrion, avatar)
  values (c, u, nom, true, coalesce(p_avatar, 1 + floor(random() * 16)::int));
  return c;
end $$;

drop function if exists unirse_sala(text, text, int);
create or replace function unirse_sala(p_codigo text, p_nombre text, p_avatar int default null)
returns text
language plpgsql security definer set search_path = public as $$
declare
  u uuid := yo();
  s salas%rowtype;
  nom text := validar_nombre(p_nombre);
begin
  if p_avatar is not null and (p_avatar < 1 or p_avatar > 16) then raise exception 'Avatar no válido'; end if;
  select * into s from salas where codigo = upper(trim(p_codigo));
  if not found then raise exception 'La sala no existe'; end if;
  perform pg_advisory_xact_lock(hashtext(s.codigo));
  if exists (select 1 from jugadores where sala = s.codigo and id = u) then
    update jugadores set nombre = nom where sala = s.codigo and id = u;
    return s.codigo;
  end if;
  if s.estado <> 'espera' then raise exception 'La partida ya empezó'; end if;
  if p_avatar is not null and exists (
       select 1 from jugadores where sala = s.codigo and avatar = p_avatar and not es_bot) then
    raise exception 'Ese avatar ya lo eligió otra persona en esta sala. Elige otro.';
  end if;
  if (select count(*) from jugadores where sala = s.codigo) >= 6 then
    if exists (select 1 from jugadores where sala = s.codigo and es_bot) then
      delete from jugadores where sala = s.codigo and id = (
        select id from jugadores where sala = s.codigo and es_bot order by nombre desc limit 1);
    else
      raise exception 'La sala ya tiene 6 jugadores';
    end if;
  end if;
  if p_avatar is not null then
    update jugadores b
    set avatar = (select n from generate_series(1, 16) n
                  where n <> p_avatar
                    and not exists (select 1 from jugadores x where x.sala = s.codigo and x.avatar = n)
                  order by random() limit 1)
    where b.sala = s.codigo and b.es_bot and b.avatar = p_avatar;
  end if;
  insert into jugadores (sala, id, nombre, avatar)
  values (s.codigo, u, nom, coalesce(p_avatar, avatar_libre(s.codigo)));
  return s.codigo;
end $$;

create or replace function exigir_anfitrion(p_codigo text, p_estado text) returns salas
language plpgsql security definer set search_path = public as $$
declare s salas%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext(p_codigo));
  select * into s from salas where codigo = p_codigo;
  if not found then raise exception 'La sala no existe'; end if;
  if s.anfitrion <> yo() then raise exception 'Solo quien creó la sala puede hacer esto'; end if;
  if p_estado is not null and s.estado <> p_estado then raise exception 'La partida ya empezó'; end if;
  return s;
end $$;

drop function if exists completar_bots(text);
create or replace function completar_bots(p_codigo text) returns int
language plpgsql security definer set search_path = public as $$
declare falta int;
begin
  perform exigir_anfitrion(p_codigo, 'espera');
  falta := 6 - (select count(*) from jugadores where sala = p_codigo);
  if falta <= 0 then return 0; end if;
  for k in 1..falta loop
    insert into jugadores (sala, id, nombre, es_bot, unido_en, avatar)
    values (p_codigo, gen_random_uuid(),
            'Bot ' || ((select count(*) from jugadores where sala = p_codigo and es_bot) + 1),
            true, clock_timestamp(), avatar_libre(p_codigo));
  end loop;
  return falta;
end $$;

drop function if exists quitar_bots(text);
create or replace function quitar_bots(p_codigo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_anfitrion(p_codigo, 'espera');
  delete from jugadores where sala = p_codigo and es_bot;
end $$;

drop function if exists salir_sala(text);
create or replace function salir_sala(p_codigo text) returns void
language plpgsql security definer set search_path = public as $$
declare s salas%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext(p_codigo));
  select * into s from salas where codigo = p_codigo;
  if not found then return; end if;
  if s.estado = 'terminado' then return; end if;
  if s.estado <> 'espera' then raise exception 'La partida ya empezó; no se puede salir'; end if;
  if s.anfitrion = yo() then
    delete from salas where codigo = p_codigo;
  else
    delete from jugadores where sala = p_codigo and id = yo();
  end if;
end $$;

drop function if exists iniciar_sala(text);
create or replace function iniciar_sala(p_codigo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_anfitrion(p_codigo, 'espera');
  if (select count(*) from jugadores where sala = p_codigo) <> 6 then
    raise exception 'Se necesitan exactamente 6 jugadores (completa con bots)';
  end if;
  update jugadores set equipo = null, rol = null, confirmado_en = null where sala = p_codigo;
  update salas set estado = 'eleccion', eleccion_fin = now() + interval '120 seconds' where codigo = p_codigo;
end $$;

drop function if exists elegir_puesto(text, text, text);
create or replace function elegir_puesto(p_codigo text, p_equipo text, p_rol text) returns void
language plpgsql security definer set search_path = public as $$
declare s salas%rowtype; u uuid := yo();
begin
  perform pg_advisory_xact_lock(hashtext(p_codigo));
  select * into s from salas where codigo = p_codigo;
  if not found or s.estado <> 'eleccion' then raise exception 'Ahora no se están eligiendo puestos'; end if;
  if now() >= s.eleccion_fin then raise exception 'Se acabó el tiempo para elegir'; end if;
  if p_equipo not in ('A', 'B') or p_rol not in ('fabrica', 'distribuidor', 'tienda') then
    raise exception 'Puesto no válido';
  end if;
  if not exists (select 1 from jugadores where sala = p_codigo and id = u and not es_bot) then
    raise exception 'No estás en esta sala';
  end if;
  if exists (select 1 from jugadores where sala = p_codigo and equipo = p_equipo and rol = p_rol and id <> u) then
    raise exception 'Ese puesto ya lo tomó otro jugador';
  end if;
  update jugadores set equipo = p_equipo, rol = p_rol, confirmado_en = clock_timestamp()
  where sala = p_codigo and id = u;
end $$;

drop function if exists liberar_puesto(text);
create or replace function liberar_puesto(p_codigo text) returns void
language plpgsql security definer set search_path = public as $$
declare s salas%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext(p_codigo));
  select * into s from salas where codigo = p_codigo;
  if not found or s.estado <> 'eleccion' then raise exception 'Ahora no se están eligiendo puestos'; end if;
  update jugadores set equipo = null, rol = null, confirmado_en = null
  where sala = p_codigo and id = yo() and not es_bot;
end $$;

-- Cierra la elección (tiempo cumplido o todas las personas eligieron hace 4 s). Interna.
create or replace function cerrar_eleccion(p_codigo text) returns boolean
language plpgsql security definer set search_path = public as $$
declare s salas%rowtype; todos boolean; ultimo timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext(p_codigo));
  select * into s from salas where codigo = p_codigo;
  if not found or s.estado <> 'eleccion' then return false; end if;
  select bool_and(equipo is not null), max(confirmado_en) into todos, ultimo
  from jugadores where sala = p_codigo and not es_bot;
  if not (now() >= s.eleccion_fin or (coalesce(todos, false) and now() >= ultimo + interval '4 seconds')) then
    return false;
  end if;
  with libres as (
    select e.equipo, r.rol, row_number() over (order by random()) as n
    from (values ('A'), ('B')) as e(equipo)
    cross join (values ('fabrica'), ('distribuidor'), ('tienda')) as r(rol)
    where not exists (select 1 from jugadores j where j.sala = p_codigo and j.equipo = e.equipo and j.rol = r.rol)
  ), sin_puesto as (
    select id, row_number() over (order by random()) as n
    from jugadores where sala = p_codigo and equipo is null
  )
  update jugadores j set equipo = lb.equipo, rol = lb.rol
  from sin_puesto sp join libres lb on lb.n = sp.n
  where j.sala = p_codigo and j.id = sp.id;
  update salas set estado = 'jugando', iniciada_en = now() where codigo = p_codigo;
  return true;
end $$;

-- ---------- SEMANAS ----------
drop function if exists enviar_decision(text, int, jsonb);
create or replace function enviar_decision(p_codigo text, p_ronda int, p_payload jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  u uuid := yo();
  s salas%rowtype;
  j jugadores%rowtype;
  r int;
begin
  if octet_length(p_payload::text) > 8000 then raise exception 'La decisión es demasiado grande'; end if;
  if jsonb_typeof(p_payload) <> 'object' then raise exception 'Decisión no válida'; end if;
  perform pg_advisory_xact_lock(hashtext(p_codigo));
  select * into s from salas where codigo = p_codigo;
  if not found or s.estado <> 'jugando' then raise exception 'La partida no está en curso'; end if;
  select * into j from jugadores where sala = p_codigo and id = u and rol is not null and not es_bot;
  if not found then raise exception 'No estás en esta partida'; end if;
  r := ronda_actual(p_codigo);
  if r > s.total_rondas then raise exception 'La partida ya terminó'; end if;
  if p_ronda <> r then raise exception 'La semana ya cambió, revisa la pantalla'; end if;
  if now() >= fin_ronda(p_codigo, r) + gracia_envio() then raise exception 'Se acabó el tiempo de esta semana'; end if;
  insert into decisiones (sala, ronda, jugador, equipo, rol, payload, enviada_en)
  values (p_codigo, r, u, j.equipo, j.rol, p_payload, now())
  on conflict (sala, ronda, jugador) do update set payload = excluded.payload, enviada_en = now();
end $$;

-- Cierra la semana si todas las PERSONAS ya decidieron o si se acabó el tiempo. Interna.
create or replace function cerrar_ronda(p_codigo text) returns boolean
language plpgsql security definer set search_path = public as $$
declare s salas%rowtype; r int; votos int;
begin
  perform pg_advisory_xact_lock(hashtext(p_codigo));
  select * into s from salas where codigo = p_codigo;
  if not found or s.estado <> 'jugando' then return false; end if;
  r := ronda_actual(p_codigo);
  if r > s.total_rondas then return false; end if;
  select count(*) into votos from decisiones where sala = p_codigo and ronda = r;
  if votos < personas_en_juego(p_codigo) and now() < fin_ronda(p_codigo, r) + gracia_envio() then return false; end if;
  insert into rondas (sala, numero, cerrada_en) values (p_codigo, r, now());
  if r >= s.total_rondas then update salas set estado = 'terminado' where codigo = p_codigo; end if;
  return true;
end $$;

drop function if exists extender_ronda(text, int);
create or replace function extender_ronda(p_codigo text, p_ronda int) returns void
language plpgsql security definer set search_path = public as $$
declare s salas%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext(p_codigo));
  select * into s from salas where codigo = p_codigo;
  if not found or s.estado <> 'jugando' then return; end if;
  if not exists (select 1 from jugadores where sala = p_codigo and id = yo() and rol is not null and not es_bot) then return; end if;
  if p_ronda <> ronda_actual(p_codigo) or p_ronda > s.total_rondas then return; end if;
  insert into extras (sala, ronda, segs) values (p_codigo, p_ronda, 15) on conflict do nothing;
end $$;

-- ---------- SINCRONIZAR: una sola llamada por ciclo ----------
-- Devuelve todo lo que necesita la pantalla. p_desde = última semana cerrada que el dispositivo
-- ya tiene: solo se envían las decisiones de semanas cerradas posteriores (nunca la semana en curso).
-- De paso cierra la elección o la semana si ya corresponde.
drop function if exists sincronizar(text, int);
create or replace function sincronizar(p_codigo text, p_desde int default 0) returns json
language plpgsql security definer set search_path = public as $$
declare
  s salas%rowtype;
  u uuid := auth.uid();
  r int;
begin
  select * into s from salas where codigo = upper(trim(p_codigo));
  if not found then return null; end if;
  if s.estado = 'eleccion' then perform cerrar_eleccion(s.codigo);
  elsif s.estado = 'jugando' then perform cerrar_ronda(s.codigo);
  end if;
  select * into s from salas where codigo = s.codigo;
  r := ronda_actual(s.codigo);
  return json_build_object(
    'ahora', clock_timestamp(),
    'sala', json_build_object('codigo', s.codigo, 'estado', s.estado, 'total_rondas', s.total_rondas,
      'segundos', s.segundos, 'semilla', s.semilla, 'sabores', s.sabores, 'autopiloto', s.autopiloto,
      'eleccion_fin', s.eleccion_fin, 'iniciada_en', s.iniciada_en, 'siguiente', s.siguiente),
    'jugadores', coalesce((select json_agg(json_build_object('nombre', j.nombre, 'equipo', j.equipo, 'rol', j.rol,
        'es_anfitrion', j.es_anfitrion, 'es_bot', j.es_bot, 'avatar', j.avatar, 'eligio', j.confirmado_en is not null)
        order by j.unido_en) from jugadores j where j.sala = s.codigo), '[]'::json),
    'yo', (select json_build_object('nombre', j.nombre, 'equipo', j.equipo, 'rol', j.rol,
        'es_anfitrion', j.es_anfitrion, 'avatar', j.avatar) from jugadores j where j.sala = s.codigo and j.id = u),
    'semana', case when s.estado in ('jugando', 'terminado') then json_build_object(
        'ronda', r, 'cerradas', r - 1,
        'inicio', inicio_ronda(s.codigo, r),
        'fin', case when r <= s.total_rondas then fin_ronda(s.codigo, r) end,
        'extra', coalesce((select segs from extras where sala = s.codigo and ronda = r), 0),
        'necesarios', personas_en_juego(s.codigo),
        'listos', coalesce((select json_agg(d.equipo || ':' || d.rol) from decisiones d
                            where d.sala = s.codigo and d.ronda = r), '[]'::json)) end,
    'mi_decision', (select payload from decisiones where sala = s.codigo and jugador = u and ronda = r),
    'decisiones', coalesce((select json_agg(json_build_object('ronda', d.ronda, 'equipo', d.equipo, 'rol', d.rol,
        'payload', d.payload) order by d.ronda)
        from decisiones d where d.sala = s.codigo and d.ronda > coalesce(p_desde, 0) and d.ronda < r), '[]'::json)
  );
end $$;

-- ---------- REVANCHA ----------
drop function if exists revancha(text);
create or replace function revancha(p_codigo text) returns text
language plpgsql security definer set search_path = public as $$
declare s salas%rowtype; me jugadores%rowtype; c text;
begin
  perform pg_advisory_xact_lock(hashtext(p_codigo));
  select * into s from salas where codigo = p_codigo;
  if not found or s.estado <> 'terminado' then raise exception 'La partida no ha terminado'; end if;
  if s.siguiente is not null then return s.siguiente; end if;
  select * into me from jugadores where sala = p_codigo and id = yo() and not es_bot;
  if not found then raise exception 'No estás en esta sala'; end if;
  c := crear_sala(me.nombre, s.total_rondas, s.segundos, me.avatar, s.sabores, s.autopiloto);
  update salas set siguiente = c where codigo = p_codigo;
  return c;
end $$;

-- ---------- MANTENIMIENTO (pg_cron, opcional) ----------
-- Cierra semanas vencidas aunque nadie tenga la app abierta.
create or replace function cerrar_vencidas() returns int
language plpgsql security definer set search_path = public as $$
declare c text; n int := 0;
begin
  for c in select codigo from salas where estado in ('eleccion', 'jugando') loop
    if (select estado from salas where codigo = c) = 'eleccion' then
      if cerrar_eleccion(c) then n := n + 1; end if;
    elsif cerrar_ronda(c) then n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- Borra salas de más de 3 días (y todo lo relacionado, por cascada).
create or replace function limpiar_salas() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from salas where creada_en < now() - interval '3 days';
  get diagnostics n = row_count;
  return n;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('cpf2-cerrar-vencidas', '30 seconds', 'select public.cerrar_vencidas()');
    perform cron.schedule('cpf2-limpiar', '17 4 * * *', 'select public.limpiar_salas()');
  end if;
exception when others then
  raise notice 'pg_cron no disponible: %', sqlerrm;
end $$;

-- ---------- SEGURIDAD ----------
alter table salas enable row level security;
alter table jugadores enable row level security;
alter table rondas enable row level security;
alter table decisiones enable row level security;
alter table extras enable row level security;

-- Nadie lee ni escribe tablas directamente: todo pasa por las funciones.
revoke all on salas, jugadores, rondas, decisiones, extras from anon, authenticated;

-- Funciones: por defecto Postgres da EXECUTE a todos; se restringe a sesiones autenticadas
-- (el acceso anónimo de Supabase usa el rol authenticated). Las internas no se exponen.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  crear_sala(text, int, int, int, int, boolean),
  unirse_sala(text, text, int),
  completar_bots(text), quitar_bots(text), salir_sala(text), iniciar_sala(text),
  elegir_puesto(text, text, text), liberar_puesto(text),
  enviar_decision(text, int, jsonb), extender_ronda(text, int),
  sincronizar(text, int), revancha(text)
to authenticated;
