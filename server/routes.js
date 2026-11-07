import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import XLSX from 'xlsx';
import {
  state, results, invalidate, audit, saveFila, saveAsignacion, saveParamGeneral, saveCargo, saveGrupal, saveAsigCatalogo,
  saveCalendario, saveCalInstituto, addCambio, saveVersion, saveBot, resetDemo, dbInfo,
} from './store.js';
import { parseFilters, dashboard, filtered, filaResumen, instMap, sicDe, resumenGlobal, sicAlerta } from './analytics.js';
import { buildCtx, calcAll, calcFila, MESES, TRAMO_LABEL, DEFAULT_PARAMS } from './engine.js';
import { procesarIngesta, parseWorkbook, detectTipo } from './ingest.js';
import { makeVersion, compararResumen, restaurarVersion } from './versions.js';
import { loadVersionSnapshot } from './store.js';
import { pdfDashboard, pdfPlanificacion, pdfFicha } from './pdf.js';

export const router = express.Router();
const SECRET = process.env.JWT_SECRET || 'cada-hora-cuenta-dev-secret';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const PERMISOS = {
  admin: ['ver', 'ver_todo', 'editar_fila', 'parametros', 'ingesta', 'versionar', 'aprobar_version', 'solicitar_asig', 'aprobar_asig', 'auditoria', 'simular', 'reset'],
  planificador: ['ver', 'ver_todo', 'editar_fila', 'parametros', 'ingesta', 'versionar', 'solicitar_asig', 'auditoria', 'simular'],
  dmn: ['ver', 'ver_todo', 'aprobar_asig', 'aprobar_version', 'auditoria', 'simular', 'solicitar_asig'],
  jefatura: ['ver', 'solicitar_asig'],
  profesional: ['mi_plan'],
  bot: ['ver', 'ver_todo', 'ingesta', 'bot'],
};
export const can = (u, p) => !!u && (PERMISOS[u.rol] || []).includes(p);
const pub = (u) => ({ id: u.id, email: u.email, nombre: u.nombre, rol: u.rol, it: u.it, persona_id: u.persona_id, permisos: PERMISOS[u.rol] || [] });

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : req.query.token;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    const p = jwt.verify(token, SECRET);
    const u = state.usuarios.find((x) => x.id === p.id && x.activo !== false);
    if (!u) return res.status(401).json({ error: 'Usuario no válido' });
    req.user = u;
    next();
  } catch { res.status(401).json({ error: 'Sesión expirada' }); }
}
const need = (perm) => (req, res, next) => (can(req.user, perm) ? next() : res.status(403).json({ error: `Tu rol (${req.user.rol}) no tiene permiso para esta acción` }));
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const motivoReq = (req, res) => {
  const m = (req.body?.motivo || '').trim();
  if (m.length < 4) { res.status(400).json({ error: 'Debes indicar un motivo/justificación del cambio (trazabilidad)' }); return null; }
  return m;
};

// ---------------- auth ----------------
router.post('/auth/login', wrap(async (req, res) => {
  const { email, password } = req.body || {};
  const u = state.usuarios.find((x) => x.email.toLowerCase() === String(email || '').toLowerCase().trim());
  if (!u || !bcrypt.compareSync(String(password || ''), u.password_hash)) return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
  const token = jwt.sign({ id: u.id, rol: u.rol }, SECRET, { expiresIn: '12h' });
  await audit(u, 'login', 'usuario', u.id, { ip: req.ip });
  res.json({ token, user: pub(u) });
}));
router.get('/auth/demo-users', (req, res) => res.json(state.usuarios.map((u) => ({ email: u.email, nombre: u.nombre, rol: u.rol }))));
router.use(auth);
router.get('/auth/me', (req, res) => res.json({ user: pub(req.user), db: dbInfo }));

// ---------------- catálogos ----------------
router.get('/catalogos', (req, res) => {
  const filas = state.filas.filter((f) => f.activo !== false);
  const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort();
  res.json({
    institutos: state.institutos.filter((i) => filas.some((f) => f.it === i.it)).sort((a, b) => a.it - b.it),
    areas: uniq(filas.map((f) => f.cod_esp)), cargos: uniq(filas.map((f) => f.cargo)),
    tipos_contrato: uniq(filas.map((f) => f.tipo_contrato)), tipos_trabajador: uniq(filas.map((f) => f.tipo_trabajador)),
    zonas: uniq(state.institutos.map((i) => i.zona)), meses: MESES, tramos: TRAMO_LABEL,
    asignaciones: state.asignaciones_catalogo, meta_pct: results().ctx.params.meta_pct,
  });
});

// ---------------- dashboard ----------------
router.get('/dashboard', need('ver'), (req, res) => res.json(dashboard(parseFilters(req.query, req.user))));

router.get('/planificacion', need('ver'), (req, res) => {
  const filters = parseFilters(req.query, req.user);
  const im = instMap();
  let rows = filtered(filters).map((x) => filaResumen(x, filters, im));
  const sort = req.query.sort || 'it';
  const dir = req.query.dir === 'desc' ? -1 : 1;
  rows.sort((a, b) => ((a[sort] ?? -Infinity) > (b[sort] ?? -Infinity) ? dir : (a[sort] ?? -Infinity) < (b[sort] ?? -Infinity) ? -dir : a.id - b.id));
  const total = rows.length;
  const page = Math.max(1, Number(req.query.page) || 1); const size = Math.min(500, Number(req.query.size) || 50);
  res.json({ total, page, size, rows: rows.slice((page - 1) * size, page * size) });
});

function filaPayload(f, user) {
  const { res } = results();
  const r = res.get(f.id);
  const im = instMap();
  const sic = MESES.map((_, i) => sicDe(f, i + 1)?.directas ?? null);
  const sicInd = MESES.map((_, i) => sicDe(f, i + 1)?.indirectas ?? null);
  const otras = state.filas.filter((x) => x.persona_id === f.persona_id && x.id !== f.id).map((x) => ({ id: x.id, it: x.it, instituto: im.get(x.it)?.nombre, cargo: x.cargo, periodo_inicio: x.periodo_inicio, periodo_fin: x.periodo_fin, activo: x.activo !== false }));
  const titular = f.titular_id ? state.filas.find((x) => x.persona_id === f.titular_id) : null;
  const reemplazos = state.filas.filter((x) => x.titular_id === f.persona_id).map((x) => ({ id: x.id, persona_id: x.persona_id, cargo: x.cargo }));
  const { asignaciones, esperado, ...data } = f;
  return {
    fila: { ...data, instituto: im.get(f.it)?.nombre }, calc: r, sic, sicInd,
    asignaciones: state.asignaciones.filter((a) => a.fila_id === f.id),
    cambios: state.cambios.filter((c) => c.persona_id === f.persona_id).slice(0, 100),
    auditoria: can(user, 'auditoria') ? state.auditoria.filter((a) => a.entidad === 'fila' && Number(a.entidad_id) === f.id).slice(0, 50) : [],
    otrasFilas: otras, titular: titular ? { id: titular.id, persona_id: titular.persona_id, cargo: titular.cargo } : null, reemplazos,
    esperado: esperado || null, tramoLabel: TRAMO_LABEL[r.tramo],
  };
}
function filaAccesible(req, f) {
  if (!f) return false;
  if (req.user.rol === 'jefatura') return f.it === Number(req.user.it);
  if (req.user.rol === 'profesional') return f.persona_id === Number(req.user.persona_id);
  return true;
}
router.get('/filas/:id', (req, res) => {
  const f = state.filas.find((x) => x.id === Number(req.params.id));
  if (!filaAccesible(req, f)) return res.status(404).json({ error: 'No encontrado' });
  res.json(filaPayload(f, req.user));
});
router.get('/mi-plan', need('mi_plan'), (req, res) => {
  const filas = state.filas.filter((f) => f.persona_id === Number(req.user.persona_id) && f.activo !== false);
  res.json(filas.map((f) => filaPayload(f, req.user)));
});

const EDITABLES = { lic: 'Licencias (semanas)', vac: 'Vacaciones (semanas)', perm: 'Permisos (semanas)', horas: 'Horas semanales', otros: 'Otros descuentos (semanas)' };
router.put('/filas/:id', need('editar_fila'), wrap(async (req, res) => {
  const f = state.filas.find((x) => x.id === Number(req.params.id));
  if (!f) return res.status(404).json({ error: 'No encontrado' });
  const motivo = motivoReq(req, res); if (!motivo) return;
  const { campo, mes, valor, desde } = req.body;
  const before = results().res.get(f.id).total.planTot;
  let antes, despues;
  if (EDITABLES[campo]) {
    const v = Number(valor);
    if (isNaN(v) || v < 0) return res.status(400).json({ error: 'Valor inválido' });
    if (campo === 'horas' && desde) {
      antes = f.horas[desde - 1];
      for (let i = desde - 1; i < 12; i++) if (f.base[i] > 0 || f.horas[i] > 0) f.horas[i] = v;
      despues = v;
    } else {
      const i = Number(mes) - 1;
      if (!(i >= 0 && i < 12)) return res.status(400).json({ error: 'Mes inválido' });
      antes = f[campo][i]; f[campo][i] = v; despues = v;
    }
  } else if (['vacante', 'licencia_extensa', 'colacion', 'beneficio_colacion'].includes(campo)) {
    antes = !!f[campo]; f[campo] = !!valor; despues = !!valor;
  } else if (campo === 'grupal_override') {
    antes = f.grupal_override; f.grupal_override = valor === null || valor === '' ? null : Number(valor); despues = f.grupal_override;
  } else return res.status(400).json({ error: 'Campo no editable' });
  await saveFila(f);
  const after = results().res.get(f.id).total.planTot;
  await addCambio({ ingesta_id: null, persona_id: f.persona_id, it: f.it, fila_id: f.id, tipo: 'AJUSTE_MANUAL', campo: `${EDITABLES[campo] || campo}${mes ? ` (${MESES[mes - 1]})` : desde ? ` desde ${MESES[desde - 1]}` : ''}`, valor_anterior: antes, valor_nuevo: despues, vigencia_desde: mes ? `2026-${String(mes).padStart(2, '0')}-01` : desde ? `2026-${String(desde).padStart(2, '0')}-01` : null, usuario: req.user.email, motivo, impacto: after - before });
  await audit(req.user, 'editar_fila', 'fila', f.id, { campo, mes, antes, despues, impacto: after - before }, motivo);
  res.json(filaPayload(f, req.user));
}));

// ---------------- asignaciones especiales ----------------
router.get('/asignaciones', need('ver'), (req, res) => {
  const im = instMap();
  const fmap = new Map(state.filas.map((f) => [f.id, f]));
  let list = state.asignaciones.map((a) => { const f = fmap.get(a.fila_id); return { ...a, persona_id: f?.persona_id, it: f?.it, instituto: im.get(f?.it)?.nombre, cargo: f?.cargo }; });
  if (req.user.rol === 'jefatura') list = list.filter((a) => a.it === Number(req.user.it));
  if (req.query.estado) list = list.filter((a) => a.estado === req.query.estado);
  if (req.query.it) list = list.filter((a) => String(a.it) === String(req.query.it));
  list.sort((a, b) => (a.estado === 'pendiente' ? -1 : 0) - (b.estado === 'pendiente' ? -1 : 0) || b.id - a.id);
  const resumen = {}; for (const a of state.asignaciones) resumen[a.estado] = (resumen[a.estado] || 0) + 1;
  res.json({ rows: list.slice(0, 600), resumen });
});
router.post('/asignaciones', need('solicitar_asig'), wrap(async (req, res) => {
  const { fila_id, nombre, horas } = req.body || {};
  const motivo = motivoReq(req, res); if (!motivo) return;
  const f = state.filas.find((x) => x.id === Number(fila_id));
  if (!filaAccesible(req, f)) return res.status(404).json({ error: 'Profesional no encontrado' });
  const cat = state.asignaciones_catalogo.find((c) => c.nombre === nombre);
  const h = Number(horas ?? cat?.horas);
  if (!nombre || !(h > 0)) return res.status(400).json({ error: 'Indica asignación y horas semanales' });
  const r = results().res.get(f.id);
  const p = results().ctx.params;
  const vigentes = state.asignaciones.filter((a) => a.fila_id === f.id && ['aprobada', 'pendiente'].includes(a.estado));
  if (r.X > p.max_asignaciones_umbral_h && vigentes.length >= p.max_asignaciones)
    return res.status(422).json({ error: `Regla: máximo ${p.max_asignaciones} asignaciones para profesionales con más de ${p.max_asignaciones_umbral_h} h semanales (tiene ${vigentes.length}).` });
  const requiere = !!cat?.requiere_autorizacion || !cat;
  const a = { id: state.seq.asig++, fila_id: f.id, nombre, horas: h, estado: requiere ? 'pendiente' : 'aprobada', requiere_autorizacion: requiere, solicitado_por: req.user.email, motivo, creado: new Date().toISOString(), resuelto_por: requiere ? null : 'Regla automática', resuelto: requiere ? null : new Date().toISOString() };
  state.asignaciones.push(a);
  const before = r.total.planTot;
  await saveAsignacion(a);
  const after = results().res.get(f.id).total.planTot;
  await addCambio({ persona_id: f.persona_id, it: f.it, fila_id: f.id, tipo: requiere ? 'ASIGNACION_SOLICITADA' : 'ASIGNACION_APROBADA', campo: 'asignación especial', valor_anterior: null, valor_nuevo: `${nombre} (${h} h)`, usuario: req.user.email, motivo, impacto: after - before });
  await audit(req.user, 'solicitar_asignacion', 'asignacion', a.id, { fila_id: f.id, nombre, horas: h, estado: a.estado }, motivo);
  res.json(a);
}));
router.post('/asignaciones/:id/resolver', need('aprobar_asig'), wrap(async (req, res) => {
  const a = state.asignaciones.find((x) => x.id === Number(req.params.id));
  if (!a || a.estado !== 'pendiente') return res.status(404).json({ error: 'Solicitud no encontrada o ya resuelta' });
  const { aprobar, comentario } = req.body || {};
  const f = state.filas.find((x) => x.id === a.fila_id);
  const before = results().res.get(f.id).total.planTot;
  a.estado = aprobar ? 'aprobada' : 'rechazada'; a.resuelto_por = req.user.email; a.resuelto = new Date().toISOString(); a.comentario = comentario || null;
  await saveAsignacion(a);
  const after = results().res.get(f.id).total.planTot;
  await addCambio({ persona_id: f.persona_id, it: f.it, fila_id: f.id, tipo: aprobar ? 'ASIGNACION_APROBADA' : 'ASIGNACION_RECHAZADA', campo: 'asignación especial', valor_anterior: 'pendiente', valor_nuevo: `${a.nombre} (${a.horas} h)`, usuario: req.user.email, motivo: comentario || (aprobar ? 'Aprobada por DMN' : 'Rechazada por DMN'), impacto: after - before });
  await audit(req.user, aprobar ? 'aprobar_asignacion' : 'rechazar_asignacion', 'asignacion', a.id, { fila_id: f.id }, comentario);
  res.json(a);
}));
router.post('/asignaciones/:id/revocar', need('editar_fila'), wrap(async (req, res) => {
  const a = state.asignaciones.find((x) => x.id === Number(req.params.id));
  const motivo = motivoReq(req, res); if (!motivo) return;
  if (!a) return res.status(404).json({ error: 'No encontrada' });
  const f = state.filas.find((x) => x.id === a.fila_id);
  const before = results().res.get(f.id).total.planTot;
  a.estado = 'revocada'; a.resuelto_por = req.user.email; a.resuelto = new Date().toISOString(); a.comentario = motivo;
  await saveAsignacion(a);
  const after = results().res.get(f.id).total.planTot;
  await addCambio({ persona_id: f.persona_id, it: f.it, fila_id: f.id, tipo: 'ASIGNACION_REVOCADA', campo: 'asignación especial', valor_anterior: `${a.nombre} (${a.horas} h)`, valor_nuevo: 'revocada', usuario: req.user.email, motivo, impacto: after - before });
  await audit(req.user, 'revocar_asignacion', 'asignacion', a.id, {}, motivo);
  res.json(a);
}));

// ---------------- parámetros ----------------
router.get('/parametros', need('ver'), (req, res) => {
  res.json({ general: results().ctx.params, defaults: DEFAULT_PARAMS, cargos: state.cargos, grupal: state.grupal, asignaciones: state.asignaciones_catalogo,
    calendario: state.calendario, calendario_instituto: state.calendario_instituto, feriados: state.feriados, institutos: state.institutos,
    uso_cargos: Object.fromEntries(state.cargos.map((c) => [c.cargo, state.filas.filter((f) => f.cargo === c.cargo && f.activo !== false).length])) });
});
async function paramChange(req, entidad, id, antes, despues, motivo) {
  await addCambio({ persona_id: null, it: null, fila_id: null, tipo: 'PARAMETRO', campo: `${entidad}: ${id}`, valor_anterior: JSON.stringify(antes), valor_nuevo: JSON.stringify(despues), usuario: req.user.email, motivo, impacto: null });
  await audit(req.user, 'editar_parametro', entidad, id, { antes, despues }, motivo);
}
router.put('/parametros/general', need('parametros'), wrap(async (req, res) => {
  const motivo = motivoReq(req, res); if (!motivo) return;
  const cambios = req.body.cambios || {};
  const before = resumenGlobal(results().res).total;
  const antes = {};
  for (const [k, v] of Object.entries(cambios)) { if (!(k in DEFAULT_PARAMS)) continue; antes[k] = state.params[k]; state.params[k] = v; }
  await saveParamGeneral();
  const after = resumenGlobal(results().res).total;
  await paramChange(req, 'parametros generales', Object.keys(antes).join(', '), antes, cambios, motivo);
  res.json({ ok: true, impacto: after.planTot - before.planTot });
}));
router.put('/parametros/cargo', need('parametros'), wrap(async (req, res) => {
  const motivo = motivoReq(req, res); if (!motivo) return;
  const b = req.body;
  const pctOk = (t) => Array.isArray(t) && t.length === 3 && t.every((x) => x >= 0 && x <= 1) && Math.abs(t[0] + t[1] + t[2] - 1) < 0.011;
  if (![b.t1, b.t2, b.t3].every(pctOk)) return res.status(400).json({ error: 'Cada tramo debe sumar 100% (directo + indirecto + NAS)' });
  if (![30, 40, 45, 60].includes(Number(b.std_dir)) && !(Number(b.std_dir) > 0)) return res.status(400).json({ error: 'Minutos estándar inválidos' });
  let c = state.cargos.find((x) => x.cargo === b.cargo);
  const antes = c ? { ...c } : null;
  const before = resumenGlobal(results().res).total;
  if (!c) { c = { cargo: String(b.cargo).toUpperCase().trim() }; state.cargos.push(c); }
  Object.assign(c, { cod_esp: b.cod_esp ?? c.cod_esp, unidad: b.unidad ?? c.unidad, std_dir: Number(b.std_dir), std_ind: Number(b.std_ind || 30), t1: b.t1, t2: b.t2, t3: b.t3 });
  await saveCargo(c);
  const after = resumenGlobal(results().res).total;
  await paramChange(req, 'distribución por cargo', c.cargo, antes, c, motivo);
  res.json({ ok: true, impacto: after.planTot - before.planTot });
}));
router.put('/parametros/grupal', need('parametros'), wrap(async (req, res) => {
  const motivo = motivoReq(req, res); if (!motivo) return;
  const g = state.grupal.find((x) => x.cod_esp === req.body.cod_esp);
  if (!g) return res.status(404).json({ error: 'Área no encontrada' });
  const antes = { ...g };
  Object.assign(g, { pct: Number(req.body.pct), pac_sancon: Number(req.body.pac_sancon), pac_otros: Number(req.body.pac_otros) });
  await saveGrupal(g);
  await paramChange(req, 'atención grupal', g.cod_esp, antes, g, motivo);
  res.json({ ok: true });
}));
router.put('/parametros/asignacion', need('parametros'), wrap(async (req, res) => {
  const motivo = motivoReq(req, res); if (!motivo) return;
  let a = state.asignaciones_catalogo.find((x) => x.nombre === req.body.nombre);
  const antes = a ? { ...a } : null;
  if (!a) { a = { nombre: req.body.nombre }; state.asignaciones_catalogo.push(a); }
  Object.assign(a, { horas: req.body.horas === '' || req.body.horas == null ? null : Number(req.body.horas), descripcion: req.body.descripcion || a.descripcion || '', requiere_autorizacion: !!req.body.requiere_autorizacion });
  await saveAsigCatalogo(a);
  await paramChange(req, 'catálogo de asignaciones', a.nombre, antes, a, motivo);
  res.json({ ok: true });
}));
router.put('/parametros/calendario', need('parametros'), wrap(async (req, res) => {
  const motivo = motivoReq(req, res); if (!motivo) return;
  const { mes, semanas, dias_habiles, it } = req.body;
  const before = resumenGlobal(results().res).total;
  if (it) {
    let c = state.calendario_instituto.find((x) => x.it === Number(it) && x.mes === Number(mes));
    const antes = c ? { ...c } : null;
    if (!c) { c = { it: Number(it), mes: Number(mes) }; state.calendario_instituto.push(c); }
    c.semanas = Number(semanas); c.motivo = motivo;
    // las semanas base de las filas del instituto se ajustan proporcionalmente
    const baseCal = state.calendario.find((x) => x.mes === Number(mes))?.semanas || c.semanas;
    const prev = antes?.semanas ?? baseCal;
    for (const f of state.filas.filter((x) => x.it === Number(it))) {
      const i = Number(mes) - 1;
      if (f.base[i] > 0 && !(f.congelado && f.congelado[i])) { f.base[i] = Math.round((f.base[i] * c.semanas / prev) * 1000) / 1000; await saveFila(f); }
    }
    await saveCalInstituto(c);
    const after = resumenGlobal(results().res).total;
    await paramChange(req, 'calendario por instituto', `${it}-${MESES[mes - 1]}`, antes, c, motivo);
    return res.json({ ok: true, impacto: after.planTot - before.planTot });
  }
  const c = state.calendario.find((x) => x.mes === Number(mes));
  const antes = { ...c };
  if (dias_habiles != null) c.dias_habiles = Number(dias_habiles);
  c.semanas = Number(semanas ?? Math.round((c.dias_habiles / 5) * 10) / 10);
  for (const f of state.filas) {
    const i = Number(mes) - 1;
    if (f.base[i] > 0 && !(f.congelado && f.congelado[i])) { f.base[i] = Math.round((f.base[i] * c.semanas / antes.semanas) * 1000) / 1000; await saveFila(f); }
  }
  await saveCalendario(c);
  const after = resumenGlobal(results().res).total;
  await paramChange(req, 'calendario nacional', MESES[mes - 1], antes, c, motivo);
  res.json({ ok: true, impacto: after.planTot - before.planTot });
}));

// Simulación: calcula el impacto de cambios de parámetros SIN aplicarlos
router.post('/simulacion', need('simular'), (req, res) => {
  const { general = {}, cargos = [], grupal = [] } = req.body || {};
  const sim = {
    ...state,
    params: { ...state.params, ...general },
    cargos: state.cargos.map((c) => ({ ...c, ...(cargos.find((x) => x.cargo === c.cargo) || {}) })).concat(cargos.filter((x) => !state.cargos.some((c) => c.cargo === x.cargo))),
    grupal: state.grupal.map((g) => ({ ...g, ...(grupal.find((x) => x.cod_esp === g.cod_esp) || {}) })),
  };
  const ctx = buildCtx(sim);
  const simRes = calcAll(sim, ctx);
  const actual = resumenGlobal(results().res);
  const simulado = resumenGlobal(simRes);
  const cmp = compararResumen(simulado, actual);
  const areaMap = new Map(actual.porArea.map((a) => [a.area, a]));
  const porArea = simulado.porArea.map((a) => ({ area: a.area, actual: areaMap.get(a.area)?.planTot || 0, simulado: a.planTot, delta: a.planTot - (areaMap.get(a.area)?.planTot || 0) }));
  // también meta de gestión simulada
  res.json({ actual: actual.total, simulado: simulado.total, porInst: cmp.porInst, porArea });
});

// ---------------- ingestas ----------------
router.get('/ingestas', need('ver'), (req, res) => res.json(state.ingestas.slice(0, 200)));
router.get('/ingestas/:id', need('ver'), (req, res) => {
  const id = Number(req.params.id);
  const ing = state.ingestas.find((x) => x.id === id);
  if (!ing) return res.status(404).json({ error: 'No encontrada' });
  res.json({ ingesta: ing, errores: state.ingestaErrores.filter((e) => e.ingesta_id === id), cambios: state.cambios.filter((c) => c.ingesta_id === id) });
});
router.post('/ingestas/upload', need('ingesta'), upload.single('archivo'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Adjunta un archivo Excel (.xlsx)' });
  const { rows } = parseWorkbook(req.file.buffer);
  if (!rows.length) return res.status(400).json({ error: 'El archivo no tiene filas con encabezado PersonaId' });
  const tipo = req.body.tipo || detectTipo(req.file.originalname, rows);
  res.json(await procesarIngesta({ tipo, archivo: req.file.originalname, filas: rows, origen: 'manual (web)', user: req.user }));
}));

// ---------------- Blue Prism ----------------
router.post('/bot/ingesta', need('ingesta'), wrap(async (req, res) => {
  const { tipo, archivo, filas = [], errores = [] } = req.body || {};
  if (!Array.isArray(filas)) return res.status(400).json({ error: 'filas debe ser un arreglo' });
  const out = await procesarIngesta({ tipo, archivo, filas, erroresBot: errores, origen: 'Blue Prism', user: req.user });
  state.bot = { ultimo_latido: new Date().toISOString(), mensaje: `Procesó ${archivo}: ${out.mensaje}`, ejecucion: { ...(state.bot?.ejecucion || {}), ultimoArchivo: archivo, ultimaIngesta: out.ingesta_id } };
  await saveBot();
  res.json({ ...out, detalleErrores: undefined, detalleCambios: undefined });
}));
router.post('/bot/heartbeat', need('ingesta'), wrap(async (req, res) => {
  state.bot = { ultimo_latido: new Date().toISOString(), mensaje: req.body?.mensaje || 'Bot activo', ejecucion: { ...(state.bot?.ejecucion || {}), ...(req.body?.ejecucion || {}), maquina: req.body?.maquina } };
  await saveBot();
  await audit(req.user, 'bot_heartbeat', 'bot', 1, req.body || {});
  res.json({ ok: true });
}));
router.get('/bot/estado', need('ver'), (req, res) => res.json({ bot: state.bot, ingestas: state.ingestas.filter((i) => i.origen === 'Blue Prism').slice(0, 10) }));
router.get('/bot/institutos', need('ver'), (req, res) => {
  const activos = new Set(state.filas.filter((f) => f.activo !== false).map((f) => f.it));
  res.json(state.institutos.filter((i) => activos.has(i.it)).map((i) => ({ IT: i.it, Codigo: i.codigo, Nombre: i.nombre })));
});
router.get('/bot/resumen', need('ver'), (req, res) => {
  const d = dashboard(parseFilters({}, req.user));
  const t = d.total;
  res.type('text/plain').send(`Planificación nacional: ${t.dotacion} profesionales, ${Math.round(t.horasSem)} h/sem, ${t.planTot} atenciones planificadas, meta ${t.mgTot}. FOJA ${(t.foja * 100).toFixed(1)}%. Alertas SIC: ${d.alertas.sicTotal}.`);
});

// ---------------- reportes PDF / Excel ----------------
const filtroTexto = (f) => {
  const im = instMap();
  const p = [];
  p.push(f.it.length ? `Instituto: ${f.it.map((i) => im.get(i)?.nombre).join(', ')}` : 'Nacional');
  if (f.cod_esp.length) p.push(`Área: ${f.cod_esp.join(', ')}`);
  if (f.cargo.length) p.push(`Cargo: ${f.cargo.join(', ')}`);
  if (f.meses.length < 12) p.push(`Meses: ${f.meses.map((m) => MESES[m - 1]).join(', ')}`);
  if (f.tipo_contrato.length) p.push(`Contrato: ${f.tipo_contrato.join(', ')}`);
  return p.join(' · ');
};
router.get('/reportes/dashboard.pdf', need('ver'), wrap(async (req, res) => {
  const filters = parseFilters(req.query, req.user);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="planificacion_${filters.it.length === 1 ? instMap().get(filters.it[0])?.codigo : 'nacional'}_2026.pdf"`);
  await audit(req.user, 'exportar_pdf', 'reporte', 'dashboard', { filtros: req.query });
  pdfDashboard(res, dashboard(filters), { titulo: 'Planificación asistencial 2026', subtitulo: filtroTexto(filters), usuario: req.user.email });
}));
router.get('/reportes/instituto/:it.pdf', need('ver'), wrap(async (req, res) => {
  const it = Number(req.params.it);
  const filters = parseFilters({ ...req.query, it: String(it) }, req.user);
  const inst = instMap().get(it);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="planificacion_${inst?.codigo || it}_2026.pdf"`);
  await audit(req.user, 'exportar_pdf', 'reporte', `instituto-${it}`, {});
  pdfDashboard(res, dashboard(filters), { titulo: `Planificación asistencial 2026 · IT ${inst?.nombre || it}`, subtitulo: `Reporte para jefatura del instituto · ${filtroTexto(filters)}`, usuario: req.user.email });
}));
router.get('/reportes/planificacion.pdf', need('ver'), wrap(async (req, res) => {
  const filters = parseFilters(req.query, req.user);
  const im = instMap();
  const rows = filtered(filters).map((x) => filaResumen(x, filters, im)).sort((a, b) => a.it - b.it || a.cargo.localeCompare(b.cargo));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="planificacion_profesionales_2026.pdf"');
  await audit(req.user, 'exportar_pdf', 'reporte', 'planificacion', { filtros: req.query, filas: rows.length });
  pdfPlanificacion(res, rows, { titulo: 'Planificación por profesional 2026', subtitulo: `${filtroTexto(filters)} · ${rows.length} filas`, usuario: req.user.email });
}));
router.get('/reportes/ficha/:id.pdf', wrap(async (req, res) => {
  const f = state.filas.find((x) => x.id === Number(req.params.id));
  if (!filaAccesible(req, f)) return res.status(404).json({ error: 'No encontrado' });
  const r = results().res.get(f.id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="ficha_${f.persona_id}.pdf"`);
  pdfFicha(res, f, r, { sic: MESES.map((_, i) => sicDe(f, i + 1)?.directas ?? null) }, { usuario: req.user.email, instituto: instMap().get(f.it)?.nombre });
}));
router.get('/export/planificacion.xlsx', need('ver'), wrap(async (req, res) => {
  const filters = parseFilters(req.query, req.user);
  const im = instMap();
  const rows = filtered(filters);
  const data = rows.map(({ f, r }) => {
    const o = { 'ID profesional': f.persona_id, IT: f.it, Instituto: im.get(f.it)?.nombre, Cargo: f.cargo, Área: f.cod_esp, 'Tipo contrato': f.tipo_contrato, 'Tipo trabajador': f.tipo_trabajador,
      'Prom. pond. h/sem': r.X, Tramo: TRAMO_LABEL[r.tramo], '% Directo': r.pDir, '% Indirecto': r.pInd, '% NAS': r.pNas, 'H/sem NAS': r.nasSem, 'H/sem asignaciones': r.asigTotal,
      'Min. estándar directa': r.stdDir, 'Factor grupal': r.factorGrupal };
    MESES.forEach((m, i) => { o[`H/sem ${m}`] = r.horas[i]; });
    MESES.forEach((m, i) => { o[`Sem. hábiles ${m}`] = Math.round(r.semhab[i] * 100) / 100; });
    MESES.forEach((m, i) => { o[`Plan directas ${m}`] = r.planDir[i]; });
    MESES.forEach((m, i) => { o[`Plan total ${m}`] = r.planTot[i]; });
    MESES.forEach((m, i) => { o[`Meta ${m}`] = r.mgTot[i]; });
    o['Plan directas año'] = r.total.planDir; o['Plan total año'] = r.total.planTot; o['Meta gestión año'] = r.total.mgTot;
    o['% FOJA'] = r.total.horasContrMes ? r.total.horasDirMes / r.total.horasContrMes : null;
    MESES.forEach((m, i) => { o[`SIC directas ${m}`] = sicDe(f, i + 1)?.directas ?? null; });
    return o;
  });
  const d = dashboard(filters);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(d.porInst.map((x) => ({ Instituto: x.nombre, Dotación: x.dotacion, 'Horas semanales': x.horasSem, 'H/sem directa': x.dirSem, 'H/sem indirecta': x.indSem, 'H/sem NAS': x.nasSem, 'Atención anual directa': x.planDir, 'Atención anual indirecta': x.planInd, 'Total atenciones': x.planTot, 'Meta gestión': x.mgTot, '% FOJA': x.foja, 'Realizadas SIC': x.sicReal, 'Cumplimiento SIC': x.cumplimiento }))), 'Resumen instituto');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Planificación');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(d.porMes.map((m) => ({ Mes: m.nombre, 'Plan directas': m.planDir, 'Plan indirectas': m.planInd, 'Meta gestión': m.mgTot, 'SIC directas': m.sic, '% FOJA': m.foja }))), 'Mensual');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  await audit(req.user, 'exportar_excel', 'reporte', 'planificacion', { filtros: req.query, filas: data.length });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="planificacion_2026.xlsx"');
  res.send(buf);
}));

// ---------------- trazabilidad ----------------
router.get('/cambios', need('ver'), (req, res) => {
  let list = state.cambios;
  if (req.user.rol === 'jefatura') list = list.filter((c) => c.it === Number(req.user.it) || c.tipo === 'PARAMETRO');
  if (req.query.tipo) list = list.filter((c) => c.tipo === req.query.tipo);
  if (req.query.persona) list = list.filter((c) => String(c.persona_id) === String(req.query.persona));
  if (req.query.it) list = list.filter((c) => String(c.it) === String(req.query.it));
  const im = instMap();
  const tipos = {}; for (const c of state.cambios) tipos[c.tipo] = (tipos[c.tipo] || 0) + 1;
  res.json({ rows: list.slice(0, 500).map((c) => ({ ...c, instituto: im.get(c.it)?.nombre })), tipos, total: list.length });
});
router.get('/auditoria', need('auditoria'), (req, res) => res.json(state.auditoria.slice(0, 500)));

router.get('/versiones', need('ver'), (req, res) => res.json(state.versiones.map(({ snapshot, ...v }) => v)));
router.post('/versiones', need('versionar'), wrap(async (req, res) => {
  const nombre = (req.body?.nombre || '').trim() || `Versión ${new Date().toLocaleDateString('es-CL')}`;
  const v = await makeVersion(req.user, nombre, req.body?.motivo);
  await audit(req.user, 'crear_version', 'version', v.id, { nombre }, req.body?.motivo);
  const { snapshot, ...out } = v; res.json(out);
}));
router.post('/versiones/:id/aprobar', need('aprobar_version'), wrap(async (req, res) => {
  const v = state.versiones.find((x) => x.id === Number(req.params.id));
  if (!v) return res.status(404).json({ error: 'No encontrada' });
  v.estado = 'aprobada'; v.aprobado_por = req.user.email; v.aprobado = new Date().toISOString();
  const { persist } = await import('./store.js');
  await persist('update versiones set estado=$2, aprobado_por=$3, aprobado=$4 where id=$1', [v.id, v.estado, v.aprobado_por, v.aprobado]);
  await audit(req.user, 'aprobar_version', 'version', v.id, {}, req.body?.motivo);
  const { snapshot, ...out } = v; res.json(out);
}));
router.get('/versiones/:id/comparar', need('ver'), (req, res) => {
  const v = state.versiones.find((x) => x.id === Number(req.params.id));
  if (!v) return res.status(404).json({ error: 'No encontrada' });
  res.json(compararResumen(resumenGlobal(results().res), v.resumen));
});
router.post('/versiones/:id/restaurar', need('aprobar_version'), wrap(async (req, res) => {
  const motivo = motivoReq(req, res); if (!motivo) return;
  await restaurarVersion(req.user, Number(req.params.id), motivo);
  res.json({ ok: true });
}));

// ---------------- validación vs Excel ----------------
router.get('/validacion', need('ver_todo'), (req, res) => {
  const { res: R } = results();
  const im = instMap();
  let cells = 0, okCells = 0, rows = 0, okRows = 0, sumXl = 0, sumApp = 0;
  const difs = [];
  const conCambios = new Set(state.cambios.filter((c) => c.persona_id).map((c) => c.persona_id));
  let excluidas = 0;
  for (const f of state.filas) {
    if (!f.esperado) continue;
    if (conCambios.has(f.persona_id)) { excluidas++; continue; }
    const r = R.get(f.id); if (!r) continue;
    rows++;
    let ok = true; let dif = 0;
    for (let i = 0; i < 12; i++) {
      cells += 2;
      if (r.planDir[i] === f.esperado.dir[i]) okCells++; else ok = false;
      if (r.planTot[i] === f.esperado.tot[i]) okCells++; else ok = false;
      sumXl += f.esperado.tot[i]; sumApp += r.planTot[i]; dif += r.planTot[i] - f.esperado.tot[i];
    }
    if (ok) okRows++;
    else difs.push({ id: f.id, persona_id: f.persona_id, instituto: im.get(f.it)?.nombre, cargo: f.cargo, X_app: r.X, X_excel: f.esperado.X, excel: f.esperado.tot, app: r.planTot, dif,
      causa: r.X !== f.esperado.X ? 'Promedio ponderado distinto (excepción multi-instituto)' : Math.abs(dif) <= 6 ? 'Redondeo (≤ 1 atención/mes)' : f.excepcion ? 'Excepción multi-instituto' : 'Valor manual en el Excel inconsistente con sus reglas' });
  }
  difs.sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif));
  res.json({ cells, okCells, rows, okRows, sumXl, sumApp, excluidas, difs: difs.slice(0, 200) });
});

router.post('/admin/reset', need('reset'), wrap(async (req, res) => { await resetDemo(); res.json({ ok: true }); }));
