-- Prueba de punta a punta de las funciones (se ejecuta con scripts/probar-sql.sh).
-- Dos personas (H1 anfitrión, H2) + 4 bots. Cualquier fallo aborta con ON_ERROR_STOP.
\set H1 '11111111-1111-1111-1111-111111111111'
\set H2 '22222222-2222-2222-2222-222222222222'
\set H3 '33333333-3333-3333-3333-333333333333'

create temp table t (k text primary key, v text);
grant all on t to authenticated, anon;

-- 1) Sin sesión no se puede crear sala
set role authenticated;
do $$ begin
  perform crear_sala('Ana', 10, 30, 1, 3, true);
  raise exception 'FALLA: creó sala sin sesión';
exception when others then
  if sqlerrm not like 'Sin sesión%' then raise; end if;
end $$;

-- 2) H1 crea la sala
set request.jwt.claim.sub = :'H1';
insert into t select 'codigo', crear_sala('Ana', 10, 30, 1, 3, true);

-- 3) Las tablas no se pueden leer directamente
do $$ begin
  perform 1 from salas;
  raise exception 'FALLA: leyó la tabla salas';
exception when insufficient_privilege then null;
end $$;

-- 4) H2 se une; un no-anfitrión no puede agregar bots ni iniciar
set request.jwt.claim.sub = :'H2';
select unirse_sala((select v from t where k = 'codigo'), 'Beto', 2) is not null as unido;
do $$ begin
  perform completar_bots((select v from t where k = 'codigo'));
  raise exception 'FALLA: un invitado agregó bots';
exception when others then if sqlerrm not like 'Solo quien creó%' then raise; end if;
end $$;

-- 5) H1 completa con bots e inicia
set request.jwt.claim.sub = :'H1';
select completar_bots((select v from t where k = 'codigo')) = 4 as bots_ok;
select iniciar_sala((select v from t where k = 'codigo'));

-- 6) Elección de puestos: H1 tienda A, H2 tienda B; H2 no puede robar el de H1
select elegir_puesto((select v from t where k = 'codigo'), 'A', 'tienda');
set request.jwt.claim.sub = :'H2';
do $$ begin
  perform elegir_puesto((select v from t where k = 'codigo'), 'A', 'tienda');
  raise exception 'FALLA: robó un puesto ocupado';
exception when others then if sqlerrm not like 'Ese puesto ya%' then raise; end if;
end $$;
select elegir_puesto((select v from t where k = 'codigo'), 'B', 'tienda');

-- 7) Se fuerza el fin del tiempo de elección y sincronizar arranca la partida
reset role;
update salas set eleccion_fin = now() - interval '1 second' where codigo = (select v from t where k = 'codigo');
set role authenticated;
do $$
declare j json;
begin
  j := sincronizar((select v from t where k = 'codigo'), 0);
  if j->'sala'->>'estado' <> 'jugando' then raise exception 'FALLA: no empezó (%)', j->'sala'->>'estado'; end if;
  if (j->'semana'->>'necesarios')::int <> 2 then raise exception 'FALLA: necesarios = %', j->'semana'->>'necesarios'; end if;
  if j->'yo'->>'rol' <> 'tienda' then raise exception 'FALLA: yo.rol'; end if;
  if (select count(*) from json_array_elements(j->'jugadores') x where x->>'rol' is null) > 0 then
    raise exception 'FALLA: quedaron jugadores sin puesto';
  end if;
  if j::text like '%1111-1111%' or j::text like '%2222-2222%' then raise exception 'FALLA: sincronizar expone ids'; end if;
end $$;

-- 8) Decisiones: H2 envía; la semana sigue abierta; la decisión NO aparece en sincronizar
select enviar_decision((select v from t where k = 'codigo'), 1, '{"precio":[5,5,5],"pedido":[40,40,40]}');
do $$
declare j json;
begin
  j := sincronizar((select v from t where k = 'codigo'), 0);
  if (j->'semana'->>'ronda')::int <> 1 then raise exception 'FALLA: la semana cerró con 1 de 2 personas'; end if;
  if json_array_length(j->'decisiones') <> 0 then raise exception 'FALLA: se filtró una decisión de la semana abierta'; end if;
  if json_array_length(j->'semana'->'listos') <> 1 then raise exception 'FALLA: listos'; end if;
  if (j->'mi_decision'->'precio'->>0)::numeric <> 5 then raise exception 'FALLA: mi_decision'; end if;
end $$;

-- 9) Semana equivocada y persona ajena rechazadas
do $$ begin
  perform enviar_decision((select v from t where k = 'codigo'), 2, '{}');
  raise exception 'FALLA: aceptó semana equivocada';
exception when others then if sqlerrm not like 'La semana ya cambió%' then raise; end if;
end $$;
set request.jwt.claim.sub = :'H3';
do $$ begin
  perform enviar_decision((select v from t where k = 'codigo'), 1, '{}');
  raise exception 'FALLA: aceptó a alguien fuera de la sala';
exception when others then if sqlerrm not like 'No estás%' then raise; end if;
end $$;

-- 10) H1 envía: con las 2 personas listas la semana cierra en el siguiente sincronizar
set request.jwt.claim.sub = :'H1';
select enviar_decision((select v from t where k = 'codigo'), 1, '{"precio":[4,4,4],"pedido":[50,50,50]}');
do $$
declare j json;
begin
  j := sincronizar((select v from t where k = 'codigo'), 0);
  if (j->'semana'->>'ronda')::int <> 2 then raise exception 'FALLA: no cerró la semana 1'; end if;
  if json_array_length(j->'decisiones') <> 2 then raise exception 'FALLA: decisiones cerradas = %', json_array_length(j->'decisiones'); end if;
  j := sincronizar((select v from t where k = 'codigo'), 1);
  if json_array_length(j->'decisiones') <> 0 then raise exception 'FALLA: p_desde no filtra'; end if;
end $$;

-- 11) Tiempo vencido: la semana cierra sin decisiones (los bots no necesitan enviar)
reset role;
update rondas set cerrada_en = now() - interval '40 seconds' where sala = (select v from t where k = 'codigo') and numero = 1;
select cerrar_vencidas() >= 1 as cron_ok;
select count(*) = 2 as dos_semanas from rondas where sala = (select v from t where k = 'codigo');

-- 12) Jugar hasta el final y pedir revancha
do $$
declare c text := (select v from t where k = 'codigo'); i int;
begin
  for i in 3..10 loop
    update rondas set cerrada_en = now() - interval '40 seconds' where sala = c and numero = i - 1;
    perform cerrar_ronda(c);
  end loop;
  if (select estado from salas where codigo = c) <> 'terminado' then raise exception 'FALLA: no terminó'; end if;
end $$;
set role authenticated;
set request.jwt.claim.sub = :'H2';
insert into t select 'revancha', revancha((select v from t where k = 'codigo'));
set request.jwt.claim.sub = :'H1';
select revancha((select v from t where k = 'codigo')) = (select v from t where k = 'revancha') as misma_revancha;
select unirse_sala((select v from t where k = 'revancha'), 'Ana', 3) = (select v from t where k = 'revancha') as unido_revancha;

-- 13) anon no puede ejecutar funciones
reset role;
set role anon;
do $$ begin
  perform sincronizar('XXXX', 0);
  raise exception 'FALLA: anon ejecutó sincronizar';
exception when insufficient_privilege then null;
end $$;
reset role;
select 'TODAS LAS PRUEBAS SQL PASARON' as resultado;
