// Filtros, agregaciones y KPIs sobre los resultados del motor.
import { state, results } from './store.js';
import { MESES, TRAMO_LABEL } from './engine.js';

export function parseFilters(qs = {}, user) {
  const list = (v) => (v == null || v === '' ? [] : String(v).split(',').map((s) => s.trim()).filter(Boolean));
  const f = {
    it: list(qs.it).map(Number),
    cod_esp: list(qs.cod_esp),
    cargo: list(qs.cargo),
    tipo_contrato: list(qs.tipo_contrato),
    tipo_trabajador: list(qs.tipo_trabajador),
    zona: list(qs.zona),
    tramo: list(qs.tramo),
    meses: list(qs.meses).map(Number).filter((m) => m >= 1 && m <= 12),
    q: qs.q ? String(qs.q).trim() : '',
    alertas: qs.alertas === '1' || qs.alertas === 'true',
    persona: qs.persona ? Number(qs.persona) : null,
  };
  if (!f.meses.length) f.meses = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  if (user?.rol === 'jefatura' && user.it) f.it = [Number(user.it)];
  if (user?.rol === 'profesional') f.persona = Number(user.persona_id) || -1;
  return f;
}

export function instMap() { return new Map(state.institutos.map((i) => [i.it, i])); }

export function filtered(filters, res = results().res) {
  const im = instMap();
  const out = [];
  for (const f of state.filas) {
    if (f.activo === false) continue;
    const r = res.get(f.id);
    if (!r) continue;
    if (filters.it.length && !filters.it.includes(f.it)) continue;
    if (filters.cod_esp.length && !filters.cod_esp.includes(f.cod_esp)) continue;
    if (filters.cargo.length && !filters.cargo.includes(f.cargo)) continue;
    if (filters.tipo_contrato.length && !filters.tipo_contrato.includes(f.tipo_contrato)) continue;
    if (filters.tipo_trabajador.length && !filters.tipo_trabajador.includes(f.tipo_trabajador)) continue;
    if (filters.zona.length && !filters.zona.includes(im.get(f.it)?.zona)) continue;
    if (filters.tramo.length && !filters.tramo.includes(r.tramo)) continue;
    if (filters.persona && f.persona_id !== filters.persona) continue;
    if (filters.q && !String(f.persona_id).includes(filters.q) && !f.cargo.toLowerCase().includes(filters.q.toLowerCase())) continue;
    if (filters.alertas && !r.alertas.length && !sicAlerta(f, r, filters.meses)) continue;
    // excluir filas sin horas en los meses seleccionados
    if (!filters.meses.some((m) => r.horas[m - 1] > 0 || r.planTot[m - 1] > 0)) continue;
    out.push({ f, r });
  }
  return out;
}

export function sicDe(f, mes) { return state.sic.get(`${f.persona_id}-${f.it}-${mes}`); }

export function sicAlerta(f, r, meses) {
  const p = results().ctx.params;
  let plan = 0, real = 0, n = 0;
  for (const m of meses) {
    const s = sicDe(f, m);
    if (!s) continue;
    n++; plan += r.planDir[m - 1]; real += s.directas;
  }
  if (!n || plan === 0) return null;
  const cumpl = real / (plan * p.meta_pct);
  const desv = (real - plan) / plan;
  if (real < plan * p.meta_pct * (1 - p.alerta_sic_umbral)) return { tipo: 'bajo', cumpl, desv, plan, real };
  if (desv > p.alerta_sic_umbral) return { tipo: 'sobre', cumpl, desv, plan, real };
  return null;
}

function emptyAgg() {
  return { personas: new Set(), filas: 0, horasSem: 0, dirSem: 0, indSem: 0, nasSem: 0, planDir: 0, planInd: 0, planTot: 0, mgDir: 0, mgInd: 0, mgTot: 0,
    horasDirMes: 0, horasContrMes: 0, sicReal: 0, sicPlan: 0, sicMeta: 0, sicInd: 0, alertas: 0 };
}
function addAgg(a, f, r, meses, ref) {
  const act = meses.some((m) => r.horas[m - 1] > 0);
  if (act) a.personas.add(f.persona_id);
  a.filas++;
  a.horasSem += r.horas[ref - 1];
  if (r.horas[ref - 1] > 0) {
    a.dirSem += r.dirH[ref - 1];
    a.indSem += r.indH[ref - 1];
    a.nasSem += r.horas[ref - 1] - r.dirH[ref - 1] - r.indH[ref - 1];
  }
  for (const m of meses) {
    const i = m - 1;
    a.planDir += r.planDir[i]; a.planInd += r.planInd[i]; a.planTot += r.planTot[i];
    a.mgDir += r.mgDir[i]; a.mgTot += r.mgTot[i];
    a.horasDirMes += r.horasDirMes[i]; a.horasContrMes += r.horasContrMes[i];
    const s = sicDe(f, m);
    if (s) { a.sicReal += s.directas; a.sicInd += s.indirectas || 0; a.sicPlan += r.planDir[i]; a.sicMeta += r.mgDir[i]; }
  }
  a.mgInd = a.mgTot - a.mgDir;
  if (r.alertas.length) a.alertas++;
}
function finAgg(a) {
  return {
    dotacion: a.personas.size, filas: a.filas,
    horasSem: round(a.horasSem, 1), dirSem: round(a.dirSem, 2), indSem: round(a.indSem, 2), nasSem: round(a.nasSem, 2),
    planDir: a.planDir, planInd: a.planInd, planTot: a.planTot, mgDir: a.mgDir, mgInd: a.mgTot - a.mgDir, mgTot: a.mgTot,
    foja: a.horasContrMes > 0 ? a.horasDirMes / a.horasContrMes : null,
    horasDirMes: round(a.horasDirMes, 1), horasContrMes: round(a.horasContrMes, 1),
    sicReal: a.sicReal, sicPlan: a.sicPlan, sicMeta: a.sicMeta,
    cumplimiento: a.sicMeta > 0 ? a.sicReal / a.sicMeta : null,
    alertas: a.alertas,
  };
}
const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

export function aggregate(rows, filters, keyFn) {
  const ref = Math.max(...filters.meses);
  const groups = new Map();
  for (const { f, r } of rows) {
    const k = keyFn ? keyFn(f, r) : 'total';
    if (!groups.has(k)) groups.set(k, emptyAgg());
    addAgg(groups.get(k), f, r, filters.meses, ref);
  }
  return [...groups.entries()].map(([k, a]) => ({ key: k, ...finAgg(a) }));
}

export function dashboard(filters) {
  const rows = filtered(filters);
  const im = instMap();
  const total = aggregate(rows, filters)[0] || finAgg(emptyAgg());
  const porInst = aggregate(rows, filters, (f) => f.it)
    .map((x) => ({ ...x, it: x.key, codigo: im.get(x.key)?.codigo, nombre: im.get(x.key)?.nombre, zona: im.get(x.key)?.zona }))
    .sort((a, b) => a.it - b.it);
  const porArea = aggregate(rows, filters, (f) => f.cod_esp || 'S/A').sort((a, b) => b.planTot - a.planTot);
  const porCargo = aggregate(rows, filters, (f) => f.cargo).sort((a, b) => b.planTot - a.planTot).slice(0, 15);
  const porTramo = aggregate(rows, filters, (f, r) => r.tramo).map((x) => ({ ...x, label: TRAMO_LABEL[x.key] }));
  const porMes = MESES.map((nombre, i) => {
    const m = i + 1;
    let planDir = 0, planInd = 0, mgDir = 0, mgTot = 0, sic = 0, sicPlan = 0, hd = 0, hc = 0, conSic = false, horasSem = 0;
    for (const { f, r } of rows) {
      planDir += r.planDir[i]; planInd += r.planInd[i]; mgDir += r.mgDir[i]; mgTot += r.mgTot[i];
      hd += r.horasDirMes[i]; hc += r.horasContrMes[i]; horasSem += r.horas[i];
      const s = sicDe(f, m);
      if (s) { sic += s.directas; sicPlan += r.planDir[i]; conSic = true; }
    }
    return { mes: m, nombre, planDir, planInd, planTot: planDir + planInd, mgDir, mgTot, sic: conSic ? sic : null, sicPlan, foja: hc ? hd / hc : null, horasSem, seleccionado: filters.meses.includes(m) };
  });
  // alertas destacadas
  const alertasSic = [];
  for (const { f, r } of rows) {
    const a = sicAlerta(f, r, filters.meses);
    if (a) alertasSic.push({ fila_id: f.id, persona_id: f.persona_id, it: f.it, instituto: im.get(f.it)?.nombre, cargo: f.cargo, ...a });
  }
  alertasSic.sort((a, b) => a.cumpl - b.cumpl);
  const ultimaIngesta = state.ingestas[0] || null;
  return {
    filtros: filters, total, porInst, porArea, porCargo, porTramo, porMes,
    alertas: { sic: alertasSic.slice(0, 50), sicTotal: alertasSic.length, reglas: rows.filter((x) => x.r.alertas.length).length },
    contexto: { meta_pct: results().ctx.params.meta_pct, ultimaIngesta, bot: state.bot, versionAprobada: state.versiones.find((v) => v.estado === 'aprobada') || null },
  };
}

export function filaResumen({ f, r }, filters, im = instMap()) {
  const ref = Math.max(...filters.meses);
  const pick = (arr) => filters.meses.reduce((a, m) => a + arr[m - 1], 0);
  const sic = filters.meses.reduce((a, m) => a + (sicDe(f, m)?.directas || 0), 0);
  const hasSic = filters.meses.some((m) => sicDe(f, m));
  const hc = pick(r.horasContrMes);
  const alerta = sicAlerta(f, r, filters.meses);
  return {
    id: f.id, persona_id: f.persona_id, it: f.it, instituto: im.get(f.it)?.nombre, codigo: im.get(f.it)?.codigo, cargo: f.cargo, cod_esp: f.cod_esp,
    tipo_contrato: f.tipo_contrato, tipo_trabajador: f.tipo_trabajador, vacante: !!f.vacante, excepcion: f.excepcion, licencia_extensa: !!f.licencia_extensa,
    horas: r.horas[ref - 1], X: r.X, tramo: r.tramo, pDir: r.pDir, pInd: r.pInd, pNas: r.pNas, asig: r.asigTotal, asigCount: r.asigCount,
    rateDir: r.rateDirT[ref - 1], rateInd: r.rateInd[ref - 1],
    planDir: pick(r.planDir), planInd: pick(r.planInd), planTot: pick(r.planTot), mgDir: pick(r.mgDir), mgTot: pick(r.mgTot),
    foja: hc > 0 ? pick(r.horasDirMes) / hc : null,
    sic: hasSic ? sic : null, cumplimiento: hasSic && pick(r.mgDir) > 0 ? sic / filters.meses.filter((m) => sicDe(f, m)).reduce((a, m) => a + r.mgDir[m - 1], 0) : null,
    alertas: r.alertas, alertaSic: alerta?.tipo || null,
    cambios: state.cambios.filter((c) => c.fila_id === f.id).length,
    congelado: r.congelado.some(Boolean), origen: f.origen,
  };
}

/** Resumen compacto por instituto para versiones/simulación. */
export function resumenGlobal(res) {
  const filters = parseFilters({});
  const rows = filtered(filters, res);
  const im = instMap();
  const total = aggregate(rows, filters)[0];
  const porInst = aggregate(rows, filters, (f) => f.it).map((x) => ({ it: x.key, nombre: im.get(x.key)?.nombre, planDir: x.planDir, planTot: x.planTot, mgTot: x.mgTot, horasSem: x.horasSem, dotacion: x.dotacion, foja: x.foja }));
  const porArea = aggregate(rows, filters, (f) => f.cod_esp || 'S/A').map((x) => ({ area: x.key, planDir: x.planDir, planTot: x.planTot, mgTot: x.mgTot }));
  return { total: { planDir: total.planDir, planTot: total.planTot, mgDir: total.mgDir, mgTot: total.mgTot, horasSem: total.horasSem, dotacion: total.dotacion, foja: total.foja, filas: total.filas }, porInst, porArea };
}
