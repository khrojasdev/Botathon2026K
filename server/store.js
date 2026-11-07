// Estado en memoria + persistencia write-through en Supabase/PostgreSQL.
// Si no hay DATABASE_URL, funciona 100% en memoria (modo demo local).
import fs from 'fs';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { DEFAULT_PARAMS, buildCtx, calcAll } from './engine.js';

const seedPath = new URL('./seed/seed.json', import.meta.url);
const schemaPath = new URL('./schema.sql', import.meta.url);

export const state = {
  institutos: [], params: { ...DEFAULT_PARAMS }, cargos: [], grupal: [], asignaciones_catalogo: [], calendario: [],
  calendario_instituto: [], feriados: [], filas: [], asignaciones: [], sic: new Map(), ingestas: [], ingestaErrores: [],
  cambios: [], auditoria: [], versiones: [], usuarios: [], bot: null, seq: { asig: 1, ingesta: 1, cambio: 1, audit: 1, version: 1, error: 1 },
};
let pool = null;
export const dbInfo = { mode: 'memoria', ok: true, error: null };

// -------------------- caché de cálculo --------------------
let cache = null;
export function invalidate() { cache = null; }
export function results() {
  if (!cache) {
    linkAsignaciones();
    const ctx = buildCtx(state);
    cache = { ctx, res: calcAll(state, ctx) };
  }
  return cache;
}
export function linkAsignaciones() {
  const by = new Map();
  for (const a of state.asignaciones) {
    if (!by.has(a.fila_id)) by.set(a.fila_id, []);
    by.get(a.fila_id).push(a);
  }
  for (const f of state.filas) f.asignaciones = by.get(f.id) || [];
}

// -------------------- DB helpers --------------------
async function q(sql, params = []) {
  if (!pool) return { rows: [] };
  return pool.query(sql, params);
}
export async function persist(sql, params) {
  if (!pool) return;
  try { await pool.query(sql, params); } catch (e) { console.error('[db]', e.message, sql.slice(0, 80)); }
}

const FILA_COLS = (f) => {
  const { asignaciones, ...data } = f;
  return [f.id, f.persona_id, f.it, f.cargo, f.cod_esp, JSON.stringify(data), f.activo !== false];
};
export async function saveFila(f) {
  invalidate();
  await persist(`insert into filas_plan (id, persona_id, it, cargo, cod_esp, data, activo, actualizado) values ($1,$2,$3,$4,$5,$6,$7, now())
    on conflict (id) do update set persona_id=$2, it=$3, cargo=$4, cod_esp=$5, data=$6, activo=$7, actualizado=now()`, FILA_COLS(f));
}
export async function saveFilasBulk(filas) {
  invalidate();
  if (!pool || !filas.length) return;
  await bulk('filas_plan', ['id', 'persona_id', 'it', 'cargo', 'cod_esp', 'data', 'activo'], filas.map(FILA_COLS),
    '(id) do update set persona_id=excluded.persona_id, it=excluded.it, cargo=excluded.cargo, cod_esp=excluded.cod_esp, data=excluded.data, activo=excluded.activo, actualizado=now()', 60);
}
export async function saveAsignacion(a) {
  invalidate();
  await persist(`insert into asignaciones (id, fila_id, nombre, horas, estado, requiere_autorizacion, solicitado_por, resuelto_por, motivo, comentario, creado, resuelto)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) on conflict (id) do update set estado=$5, horas=$4, resuelto_por=$8, comentario=$10, resuelto=$12`,
    [a.id, a.fila_id, a.nombre, a.horas, a.estado, !!a.requiere_autorizacion, a.solicitado_por, a.resuelto_por, a.motivo, a.comentario, a.creado, a.resuelto]);
}
export async function saveParamGeneral() {
  invalidate();
  for (const [k, v] of Object.entries(state.params)) {
    await persist(`insert into param_general (clave, valor) values ($1,$2) on conflict (clave) do update set valor=$2, actualizado=now()`, [k, JSON.stringify(v)]);
  }
}
export async function saveCargo(c) {
  invalidate();
  await persist(`insert into param_cargo (cargo, cod_esp, unidad, std_dir, std_ind, t1, t2, t3) values ($1,$2,$3,$4,$5,$6,$7,$8)
    on conflict (cargo) do update set cod_esp=$2, unidad=$3, std_dir=$4, std_ind=$5, t1=$6, t2=$7, t3=$8`,
    [c.cargo, c.cod_esp, c.unidad, c.std_dir, c.std_ind, JSON.stringify(c.t1), JSON.stringify(c.t2), JSON.stringify(c.t3)]);
}
export async function saveGrupal(g) {
  invalidate();
  await persist(`insert into param_grupal values ($1,$2,$3,$4) on conflict (cod_esp) do update set pct=$2, pac_sancon=$3, pac_otros=$4`, [g.cod_esp, g.pct, g.pac_sancon, g.pac_otros]);
}
export async function saveAsigCatalogo(a) {
  await persist(`insert into param_asignacion values ($1,$2,$3,$4) on conflict (nombre) do update set horas=$2, descripcion=$3, requiere_autorizacion=$4`,
    [a.nombre, a.horas, a.descripcion, !!a.requiere_autorizacion]);
}
export async function saveCalendario(c) {
  invalidate();
  await persist(`insert into calendario values ($1,$2,$3,$4,$5) on conflict (mes) do update set dias=$2, inhabiles=$3, dias_habiles=$4, semanas=$5`,
    [c.mes, c.dias, c.inhabiles, c.dias_habiles, c.semanas]);
}
export async function saveCalInstituto(c) {
  invalidate();
  await persist(`insert into calendario_instituto values ($1,$2,$3,$4) on conflict (it, mes) do update set semanas=$3, motivo=$4`, [c.it, c.mes, c.semanas, c.motivo]);
}

export async function audit(user, accion, entidad, entidad_id, detalle, motivo) {
  const a = { id: state.seq.audit++, fecha: new Date().toISOString(), usuario: user?.email || 'sistema', rol: user?.rol || 'sistema', accion, entidad, entidad_id: entidad_id != null ? String(entidad_id) : null, detalle, motivo: motivo || null };
  state.auditoria.unshift(a);
  await persist(`insert into auditoria (id, fecha, usuario, rol, accion, entidad, entidad_id, detalle, motivo) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [a.id, a.fecha, a.usuario, a.rol, accion, entidad, a.entidad_id, JSON.stringify(detalle || {}), a.motivo]);
  return a;
}

export async function addIngesta(ing) {
  ing.id = state.seq.ingesta++;
  ing.fecha = new Date().toISOString();
  state.ingestas.unshift(ing);
  await persist(`insert into ingestas (id, fecha, origen, tipo, archivo, periodo, filas, validas, errores, cambios, usuario, estado, resumen) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [ing.id, ing.fecha, ing.origen, ing.tipo, ing.archivo, ing.periodo, ing.filas, ing.validas, ing.errores, ing.cambios, ing.usuario, ing.estado, JSON.stringify(ing.resumen || {})]);
  return ing;
}
export async function addErrores(ingesta_id, errores) {
  for (const e of errores) { e.id = state.seq.error++; e.ingesta_id = ingesta_id; state.ingestaErrores.push(e); }
  await bulk('ingesta_errores', ['id', 'ingesta_id', 'fila', 'campo', 'valor', 'mensaje', 'origen', 'severidad', 'persona_id'],
    errores.map((e) => [e.id, ingesta_id, e.fila, e.campo, e.valor == null ? null : String(e.valor), e.mensaje, e.origen || 'api', e.severidad || 'error', e.persona_id == null ? null : String(e.persona_id)]), '(id) do nothing');
  return;
  for (const e of []) {
    await persist(`insert into ingesta_errores (id, ingesta_id, fila, campo, valor, mensaje, origen, severidad, persona_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [e.id, ingesta_id, e.fila, e.campo, e.valor == null ? null : String(e.valor), e.mensaje, e.origen || 'api', e.severidad || 'error', e.persona_id == null ? null : String(e.persona_id)]);
  }
}
export async function addCambio(c) {
  c.id = state.seq.cambio++;
  c.fecha = new Date().toISOString();
  state.cambios.unshift(c);
  await persist(`insert into cambios (id, ingesta_id, fecha, persona_id, it, fila_id, tipo, campo, valor_anterior, valor_nuevo, vigencia_desde, usuario, motivo, impacto)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [c.id, c.ingesta_id, c.fecha, c.persona_id, c.it, c.fila_id, c.tipo, c.campo, c.valor_anterior == null ? null : String(c.valor_anterior), c.valor_nuevo == null ? null : String(c.valor_nuevo), c.vigencia_desde, c.usuario, c.motivo, c.impacto ?? null]);
  return c;
}
export async function saveSic(rows, ingesta_id) {
  for (const r of rows) {
    state.sic.set(`${r.persona_id}-${r.it}-${r.mes}`, { ...r, ingesta_id });
  }
  if (!pool) return;
  // inserción por lotes
  const chunk = 400;
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const vals = []; const ph = [];
    part.forEach((r, j) => { ph.push(`($${j * 6 + 1},$${j * 6 + 2},$${j * 6 + 3},$${j * 6 + 4},$${j * 6 + 5},$${j * 6 + 6})`); vals.push(r.persona_id, r.it, r.mes, r.directas, r.indirectas, ingesta_id); });
    await persist(`insert into sic_realizado (persona_id, it, mes, directas, indirectas, ingesta_id) values ${ph.join(',')}
      on conflict (persona_id, it, mes) do update set directas=excluded.directas, indirectas=excluded.indirectas, ingesta_id=excluded.ingesta_id`, vals);
  }
}
export async function saveVersion(v) {
  await persist(`insert into versiones (id, nombre, estado, usuario, motivo, creado, aprobado_por, aprobado, resumen, snapshot) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    on conflict (id) do update set estado=$3, aprobado_por=$7, aprobado=$8`,
    [v.id, v.nombre, v.estado, v.usuario, v.motivo, v.creado, v.aprobado_por, v.aprobado, JSON.stringify(v.resumen), JSON.stringify(v.snapshot || null)]);
}
export async function loadVersionSnapshot(id) {
  const v = state.versiones.find((x) => x.id === id);
  if (!v) return null;
  if (v.snapshot) return v.snapshot;
  const r = await q('select snapshot from versiones where id=$1', [id]);
  return r.rows[0]?.snapshot || null;
}
export async function saveBot() {
  await persist(`insert into bot_estado (id, ultimo_latido, mensaje, ejecucion) values (1,$1,$2,$3) on conflict (id) do update set ultimo_latido=$1, mensaje=$2, ejecucion=$3`,
    [state.bot?.ultimo_latido, state.bot?.mensaje, JSON.stringify(state.bot?.ejecucion || null)]);
}

// -------------------- seed --------------------
const DEMO_PASS = process.env.DEMO_PASSWORD || 'Teleton2026';
function demoUsers() {
  const val = state.filas.find((f) => f.it === 51 && f.cargo === 'KINESIOLOGO');
  return [
    { email: 'admin@teleton.cl', nombre: 'Planificación Central (Admin)', rol: 'admin' },
    { email: 'planificador@teleton.cl', nombre: 'Analista de Planificación', rol: 'planificador' },
    { email: 'dmn@teleton.cl', nombre: 'Dirección Médica Nacional', rol: 'dmn' },
    { email: 'jefatura.val@teleton.cl', nombre: 'Jefatura IT Valparaíso', rol: 'jefatura', it: 51 },
    { email: 'profesional@teleton.cl', nombre: `Profesional #${val?.persona_id}`, rol: 'profesional', persona_id: val?.persona_id },
    { email: 'bot@teleton.cl', nombre: 'Robot Blue Prism', rol: 'bot' },
  ];
}

function applySeed(seed) {
  state.institutos = seed.institutos;
  state.cargos = seed.cargos;
  state.grupal = seed.grupal;
  state.asignaciones_catalogo = seed.asignaciones_catalogo;
  state.calendario = seed.calendario;
  state.feriados = seed.feriados;
  state.calendario_instituto = [];
  state.params = { ...DEFAULT_PARAMS };
  state.filas = [];
  state.asignaciones = [];
  for (const f of seed.filas) {
    const { asignaciones, ...rest } = f;
    rest.origen = 'Excel planificación 2026';
    rest.activo = true;
    state.filas.push(rest);
    for (const a of asignaciones) {
      state.asignaciones.push({ id: state.seq.asig++, fila_id: f.id, nombre: a.nombre, horas: a.horas, estado: 'aprobada', requiere_autorizacion: a.requiere_autorizacion,
        solicitado_por: 'carga inicial', resuelto_por: a.requiere_autorizacion ? 'DMN (carga inicial)' : null, motivo: 'Planificación vigente', creado: new Date().toISOString() });
    }
  }
}

async function bulk(table, cols, rows, conflict = 'do nothing', chunk = 200) {
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const vals = []; const ph = [];
    part.forEach((r, j) => { ph.push('(' + cols.map((_, k) => `$${j * cols.length + k + 1}`).join(',') + ')'); vals.push(...r); });
    await persist(`insert into ${table} (${cols.join(',')}) values ${ph.join(',')} on conflict ${conflict}`, vals);
  }
}

async function insertSeedToDb() {
  await bulk('institutos', ['it', 'codigo', 'nombre', 'zona', 'grupo_grupal', 'dias_adicionales_zona'], state.institutos.map((i) => [i.it, i.codigo, i.nombre, i.zona, i.grupo_grupal, i.dias_adicionales_zona]));
  await bulk('param_general', ['clave', 'valor'], Object.entries(state.params).map(([k, v]) => [k, JSON.stringify(v)]), '(clave) do update set valor=excluded.valor');
  await bulk('param_cargo', ['cargo', 'cod_esp', 'unidad', 'std_dir', 'std_ind', 't1', 't2', 't3'], state.cargos.map((c) => [c.cargo, c.cod_esp, c.unidad, c.std_dir, c.std_ind, JSON.stringify(c.t1), JSON.stringify(c.t2), JSON.stringify(c.t3)]));
  await bulk('param_grupal', ['cod_esp', 'pct', 'pac_sancon', 'pac_otros'], state.grupal.map((g) => [g.cod_esp, g.pct, g.pac_sancon, g.pac_otros]));
  await bulk('param_asignacion', ['nombre', 'horas', 'descripcion', 'requiere_autorizacion'], state.asignaciones_catalogo.map((a) => [a.nombre, a.horas, a.descripcion, !!a.requiere_autorizacion]));
  await bulk('calendario', ['mes', 'dias', 'inhabiles', 'dias_habiles', 'semanas'], state.calendario.map((c) => [c.mes, c.dias, c.inhabiles, c.dias_habiles, c.semanas]));
  await bulk('feriados', ['fecha', 'tipo', 'alcance'], state.feriados.map((f) => [f.fecha, f.tipo, f.alcance]), '(id) do nothing');
  await bulk('filas_plan', ['id', 'persona_id', 'it', 'cargo', 'cod_esp', 'data', 'activo'], state.filas.map(FILA_COLS), '(id) do nothing', 60);
  await bulk('asignaciones', ['id', 'fila_id', 'nombre', 'horas', 'estado', 'requiere_autorizacion', 'solicitado_por', 'resuelto_por', 'motivo'],
    state.asignaciones.map((a) => [a.id, a.fila_id, a.nombre, a.horas, a.estado, a.requiere_autorizacion, a.solicitado_por, a.resuelto_por, a.motivo]));
  await persist(`select setval(pg_get_serial_sequence('asignaciones','id'), (select coalesce(max(id),1) from asignaciones))`);
  await bulk('usuarios', ['id', 'email', 'nombre', 'rol', 'it', 'persona_id', 'password_hash'], state.usuarios.map((u) => [u.id, u.email, u.nombre, u.rol, u.it || null, u.persona_id || null, u.password_hash]), '(email) do nothing');
}

function seedUsers() {
  const hash = bcrypt.hashSync(DEMO_PASS, 8);
  state.usuarios = demoUsers().map((u, i) => ({ id: i + 1, ...u, password_hash: hash, activo: true }));
}

async function createInitialVersion() {
  const { makeVersion } = await import('./versions.js');
  const v = await makeVersion({ email: 'sistema', rol: 'sistema' }, 'v1 · Planificación aprobada (Excel original)', 'Carga inicial desde Excel de planificación vigente', true);
  v.estado = 'aprobada'; v.aprobado_por = 'Carga inicial'; v.aprobado = v.creado;
  await saveVersion(v);
}

// -------------------- carga --------------------
export async function init() {
  const url = process.env.DATABASE_URL;
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  if (url) {
    try {
      pool = new pg.Pool({ connectionString: url, ssl: url.includes('localhost') ? false : { rejectUnauthorized: false }, max: 5, idleTimeoutMillis: 0, keepAlive: true, connectionTimeoutMillis: 15000 });
      await pool.query(fs.readFileSync(schemaPath, 'utf8'));
      dbInfo.mode = 'supabase/postgres';
    } catch (e) {
      console.error('[db] No se pudo conectar, se usa modo memoria:', e.message);
      dbInfo.ok = false; dbInfo.error = e.message; pool = null;
    }
  }
  const count = pool ? Number((await q('select count(*)::int as n from filas_plan')).rows[0].n) : 0;
  if (!pool || count === 0) {
    applySeed(seed);
    seedUsers();
    if (pool) { console.log('[db] Base vacía: cargando seed inicial…'); await insertSeedToDb(); }
    await createInitialVersion();
    console.log(`[store] Seed cargado (${state.filas.length} filas) — modo ${dbInfo.mode}`);
    return;
  }
  // cargar desde BD
  state.institutos = (await q('select * from institutos order by it')).rows.map((r) => ({ ...r, dias_adicionales_zona: Number(r.dias_adicionales_zona) }));
  const pgen = (await q('select * from param_general')).rows;
  state.params = { ...DEFAULT_PARAMS, ...Object.fromEntries(pgen.map((r) => [r.clave, r.valor])) };
  state.cargos = (await q('select * from param_cargo')).rows.map((c) => ({ ...c, std_dir: Number(c.std_dir), std_ind: Number(c.std_ind) }));
  state.grupal = (await q('select * from param_grupal')).rows.map((g) => ({ cod_esp: g.cod_esp, pct: Number(g.pct), pac_sancon: Number(g.pac_sancon), pac_otros: Number(g.pac_otros) }));
  state.asignaciones_catalogo = (await q('select * from param_asignacion')).rows.map((a) => ({ ...a, horas: a.horas == null ? null : Number(a.horas) }));
  state.calendario = (await q('select * from calendario order by mes')).rows.map((c) => ({ ...c, semanas: Number(c.semanas) }));
  state.calendario_instituto = (await q('select * from calendario_instituto')).rows.map((c) => ({ ...c, semanas: Number(c.semanas) }));
  state.feriados = (await q('select fecha::text, tipo, alcance from feriados order by fecha')).rows;
  state.filas = (await q('select * from filas_plan order by id')).rows.map((r) => ({ ...r.data, id: r.id, activo: r.activo }));
  state.asignaciones = (await q('select * from asignaciones order by id')).rows.map((a) => ({ ...a, horas: Number(a.horas) }));
  for (const s of (await q('select * from sic_realizado')).rows) state.sic.set(`${s.persona_id}-${s.it}-${s.mes}`, { ...s, persona_id: Number(s.persona_id) });
  state.ingestas = (await q('select * from ingestas order by id desc')).rows;
  state.ingestaErrores = (await q('select * from ingesta_errores order by id')).rows;
  state.cambios = (await q('select * from cambios order by id desc')).rows.map((c) => ({ ...c, persona_id: Number(c.persona_id) }));
  state.auditoria = (await q('select * from auditoria order by id desc limit 2000')).rows;
  state.versiones = (await q('select id, nombre, estado, usuario, motivo, creado, aprobado_por, aprobado, resumen from versiones order by id desc')).rows;
  state.usuarios = (await q('select * from usuarios order by id')).rows.map((u) => ({ ...u, persona_id: u.persona_id ? Number(u.persona_id) : null }));
  const bot = (await q('select * from bot_estado where id=1')).rows[0];
  state.bot = bot || null;
  const max = (arr) => arr.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0);
  state.seq = { asig: max(state.asignaciones) + 1, ingesta: max(state.ingestas) + 1, cambio: max(state.cambios) + 1, audit: max(state.auditoria) + 1, version: max(state.versiones) + 1, error: max(state.ingestaErrores) + 1 };
  if (!state.usuarios.length) { seedUsers(); for (const u of state.usuarios) await persist('insert into usuarios (id, email, nombre, rol, it, persona_id, password_hash) values ($1,$2,$3,$4,$5,$6,$7) on conflict (email) do nothing', [u.id, u.email, u.nombre, u.rol, u.it || null, u.persona_id || null, u.password_hash]); }
  console.log(`[store] Estado cargado desde BD (${state.filas.length} filas, ${state.sic.size} registros SIC)`);
}

export async function resetDemo() {
  if (pool) {
    await pool.query(`truncate institutos, param_general, param_cargo, param_grupal, param_asignacion, calendario, calendario_instituto, feriados, filas_plan, asignaciones, sic_realizado, ingestas, ingesta_errores, cambios, auditoria, versiones, usuarios, bot_estado restart identity`);
  }
  state.sic = new Map(); state.ingestas = []; state.ingestaErrores = []; state.cambios = []; state.auditoria = []; state.versiones = []; state.bot = null;
  state.seq = { asig: 1, ingesta: 1, cambio: 1, audit: 1, version: 1, error: 1 };
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  applySeed(seed); seedUsers();
  if (pool) await insertSeedToDb();
  invalidate();
  await createInitialVersion();
}

export function nextFilaId() { return state.filas.reduce((m, f) => Math.max(m, f.id), 0) + 1; }
