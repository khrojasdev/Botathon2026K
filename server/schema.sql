-- Esquema "Cada hora cuenta" (Supabase / PostgreSQL). Idempotente: se ejecuta en cada arranque.
create table if not exists institutos (
  it int primary key, codigo text not null, nombre text not null, zona text, grupo_grupal text default 'Otros',
  dias_adicionales_zona numeric default 5
);
create table if not exists param_general (
  clave text primary key, valor jsonb not null, actualizado timestamptz default now(), actualizado_por text
);
create table if not exists param_cargo (
  cargo text primary key, cod_esp text, unidad text, std_dir numeric, std_ind numeric, t1 jsonb, t2 jsonb, t3 jsonb
);
create table if not exists param_grupal (
  cod_esp text primary key, pct numeric, pac_sancon numeric, pac_otros numeric
);
create table if not exists param_asignacion (
  nombre text primary key, horas numeric, descripcion text, requiere_autorizacion boolean default false
);
create table if not exists calendario (
  mes int primary key, dias int, inhabiles int, dias_habiles int, semanas numeric
);
create table if not exists calendario_instituto (
  it int, mes int, semanas numeric, motivo text, primary key (it, mes)
);
create table if not exists feriados (
  id serial primary key, fecha date, tipo text, alcance text
);
-- Una fila = profesional x instituto x período de vigencia (igual que el Excel), datos mensuales en jsonb
create table if not exists filas_plan (
  id int primary key, persona_id bigint not null, it int not null, cargo text, cod_esp text,
  data jsonb not null, activo boolean default true, actualizado timestamptz default now()
);
create index if not exists filas_plan_persona on filas_plan (persona_id);
create table if not exists asignaciones (
  id serial primary key, fila_id int not null, nombre text not null, horas numeric not null, estado text not null,
  requiere_autorizacion boolean default false, solicitado_por text, resuelto_por text, motivo text, comentario text,
  creado timestamptz default now(), resuelto timestamptz
);
create table if not exists sic_realizado (
  persona_id bigint, it int, mes int, directas int, indirectas int, ingesta_id int, primary key (persona_id, it, mes)
);
create table if not exists ingestas (
  id serial primary key, fecha timestamptz default now(), origen text, tipo text, archivo text, periodo text,
  filas int, validas int, errores int, cambios int, usuario text, estado text, resumen jsonb
);
create table if not exists ingesta_errores (
  id serial primary key, ingesta_id int, fila int, campo text, valor text, mensaje text, origen text, severidad text default 'error', persona_id text
);
create table if not exists cambios (
  id serial primary key, ingesta_id int, fecha timestamptz default now(), persona_id bigint, it int, fila_id int,
  tipo text, campo text, valor_anterior text, valor_nuevo text, vigencia_desde text, usuario text, motivo text,
  impacto int
);
create table if not exists auditoria (
  id serial primary key, fecha timestamptz default now(), usuario text, rol text, accion text, entidad text,
  entidad_id text, detalle jsonb, motivo text
);
create table if not exists versiones (
  id serial primary key, nombre text, estado text default 'borrador', usuario text, motivo text,
  creado timestamptz default now(), aprobado_por text, aprobado timestamptz, resumen jsonb, snapshot jsonb
);
create table if not exists usuarios (
  id serial primary key, email text unique not null, nombre text, rol text not null, it int, persona_id bigint,
  password_hash text not null, activo boolean default true
);
create table if not exists bot_estado (
  id int primary key default 1, ultimo_latido timestamptz, mensaje text, ejecucion jsonb
);
