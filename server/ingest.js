// Ingesta de reportes BUK (dotación) y SIC (atenciones realizadas):
// normaliza → valida → detecta cambios vs. planificación vigente → aplica desde la fecha en que rigen.
import XLSX from 'xlsx';
import { state, results, saveFila, saveAsignacion, addIngesta, addErrores, addCambio, saveSic, audit, nextFilaId, invalidate } from './store.js';
import { jornadaLegal, baseSemanasVigencia, otrosPorRegla, MESES } from './engine.js';
import { makeVersion } from './versions.js';

// ---------------- normalización ----------------
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const ALIAS = {
  personaid: 'persona_id', idpersona: 'persona_id', rut: 'persona_id_rut',
  it: 'it', codit: 'it', instituto: 'instituto', area: 'area',
  periodo: 'periodo', mes: 'periodo',
  tipodecontrato: 'tipo_contrato', tipocontrato: 'tipo_contrato',
  fechaingresocompania: 'fecha_ingreso', fechaingreso: 'fecha_ingreso', fechainicio: 'fecha_ingreso',
  fechatermino: 'fecha_termino', fechadetermino: 'fecha_termino',
  horassemanales: 'horas', horas: 'horas', hs: 'horas',
  cargo: 'cargo', tipotrabajador: 'tipo_trabajador', diasdelajornada: 'dias_jornada', ndias: 'ndias',
  codesp: 'cod_esp', centrodecosto: 'centro_costo', nombresubarea: 'subarea', fechadenacimiento: 'fecha_nacimiento',
  personaidreemplazado: 'reemplaza_a', reemplazaa: 'reemplaza_a', titularreemplazado: 'reemplaza_a',
  atencionesdirectas: 'directas', directas: 'directas', atencionesdirectasrealizadas: 'directas',
  atencionesindirectas: 'indirectas', indirectas: 'indirectas', atencionesindirectasrealizadas: 'indirectas',
};
export function normalizeRow(raw) {
  const o = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = ALIAS[norm(k)];
    if (key) o[key] = typeof v === 'string' ? v.trim() : v;
  }
  return o;
}

export function parseDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v)) return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()));
  if (typeof v === 'number' || /^\d{5}(\.\d+)?$/.test(String(v))) {
    const n = Number(v);
    if (n > 30000 && n < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000);
    return null;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) {
    let d = +m[1], mo = +m[2];
    if (mo > 12 && d <= 12) [d, mo] = [mo, d]; // formato m/d/aaaa
    return new Date(Date.UTC(+m[3], mo - 1, d));
  }
  const t = Date.parse(s);
  return isNaN(t) ? null : new Date(t);
}
const iso = (d) => (d ? d.toISOString().slice(0, 10) : null);
const num = (v) => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return isNaN(n) ? null : n;
};

export function parseWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  let h = aoa.findIndex((r) => r.some((c) => norm(c) === 'personaid'));
  if (h < 0) h = 0;
  const headers = aoa[h].map((c) => (c == null ? '' : String(c)));
  const rows = [];
  for (let i = h + 1; i < aoa.length; i++) {
    const r = aoa[i];
    if (!r || r.every((c) => c == null || c === '')) continue;
    const o = { __fila: i + 1 };
    headers.forEach((k, j) => { if (k) o[k] = r[j] instanceof Date ? iso(r[j]) : r[j]; });
    rows.push(o);
  }
  return { rows, hoja: wb.SheetNames[0], headers };
}

export function detectTipo(nombre, rows) {
  const n = norm(nombre);
  if (n.includes('sic')) return 'SIC';
  if (n.includes('buk') || n.includes('contrato') || n.includes('dotacion')) return 'BUK';
  const keys = Object.keys(normalizeRow(rows[0] || {}));
  return keys.includes('directas') ? 'SIC' : 'BUK';
}

// ---------------- validación ----------------
const instSet = () => new Set(state.institutos.map((i) => i.it));
const cargoSet = () => new Set(state.cargos.map((c) => c.cargo.toUpperCase()));

export function validarBUK(rawRows) {
  const p = results().ctx.params;
  const errores = []; const validas = [];
  const vistos = new Map();
  const its = instSet(); const cargos = cargoSet();
  rawRows.forEach((raw, idx) => {
    const fila = raw.__fila || raw.Fila || idx + 2;
    const r = normalizeRow(raw);
    const errs = []; const warns = [];
    const pid = num(r.persona_id);
    if (!pid || !Number.isInteger(pid)) errs.push(['PersonaId', r.persona_id, 'PersonaId vacío o no numérico']);
    const it = num(r.it);
    if (!it) errs.push(['IT', r.it, 'Código de instituto vacío']);
    else if (!its.has(it)) errs.push(['IT', r.it, `Instituto ${it} no existe en el maestro`]);
    const per = parseDate(r.periodo);
    if (!per) errs.push(['Periodo', r.periodo, 'Periodo vacío o con formato inválido']);
    else if (per.getUTCFullYear() !== 2026) errs.push(['Periodo', iso(per), 'Periodo fuera del año de planificación (2026)']);
    const mes = per ? per.getUTCMonth() + 1 : null;
    const horas = num(r.horas);
    if (horas == null) errs.push(['Horas Semanales', r.horas, 'Horas semanales vacías o no numéricas']);
    else if (horas <= 0) errs.push(['Horas Semanales', horas, 'Horas semanales deben ser mayores a 0']);
    else if (mes && horas > jornadaLegal(mes, p)) errs.push(['Horas Semanales', horas, `Supera la jornada legal vigente en ${MESES[mes - 1]} (${jornadaLegal(mes, p)} h)`]);
    const cargo = r.cargo ? String(r.cargo).toUpperCase().trim() : '';
    if (!cargo) errs.push(['Cargo', r.cargo, 'Cargo vacío']);
    else if (!cargos.has(cargo)) errs.push(['Cargo', r.cargo, 'Cargo no homologado en la tabla de distribución (crear parámetro antes de cargar)']);
    const fi = parseDate(r.fecha_ingreso);
    const ft = parseDate(r.fecha_termino);
    if (r.fecha_ingreso && !fi) errs.push(['Fecha Ingreso', r.fecha_ingreso, 'Fecha de ingreso inválida']);
    if (r.fecha_termino && !ft) errs.push(['Fecha Término', r.fecha_termino, 'Fecha de término inválida']);
    if (fi && ft && ft < fi) errs.push(['Fecha Término', iso(ft), 'Fecha de término anterior a la fecha de ingreso']);
    const tc = r.tipo_contrato ? String(r.tipo_contrato).trim() : '';
    if (tc && !['indefinido', 'plazofijo', 'honorarios', 'reemplazo'].includes(norm(tc))) warns.push(['Tipo de Contrato', tc, 'Tipo de contrato no reconocido']);
    if (norm(tc) === 'plazofijo' && !ft) warns.push(['Fecha Término', '', 'Contrato a plazo fijo sin fecha de término']);
    const tt = r.tipo_trabajador ? String(r.tipo_trabajador).trim() : 'Titular';
    if (norm(tt) === 'reemplazo' && !num(r.reemplaza_a)) warns.push(['Tipo_Trabajador', tt, 'Reemplazo sin titular asociado (PersonaId Reemplazado)']);
    const nd = num(r.ndias);
    if (nd != null && (nd < 1 || nd > 7)) errs.push(['Ndias', nd, 'Días de jornada fuera de rango (1–7)']);
    const key = `${pid}-${it}-${mes}`;
    if (pid && it && mes) {
      if (vistos.has(key)) errs.push(['PersonaId', pid, `Registro duplicado (misma persona, instituto y periodo; fila ${vistos.get(key)})`]);
      else vistos.set(key, fila);
    }
    for (const [campo, valor, mensaje] of errs) errores.push({ fila, campo, valor, mensaje, severidad: 'error', persona_id: pid, origen: 'api' });
    for (const [campo, valor, mensaje] of warns) errores.push({ fila, campo, valor, mensaje, severidad: 'advertencia', persona_id: pid, origen: 'api' });
    if (!errs.length) {
      validas.push({ fila, persona_id: pid, it, mes, periodo: iso(per), horas, cargo, cod_esp: r.cod_esp || null, tipo_contrato: tc || null, tipo_trabajador: tt,
        fecha_ingreso: iso(fi), fecha_termino: iso(ft), ndias: nd, centro_costo: r.centro_costo ? String(r.centro_costo) : null,
        mes_nacimiento: parseDate(r.fecha_nacimiento)?.getUTCMonth() + 1 || null, reemplaza_a: num(r.reemplaza_a), dias_jornada: r.dias_jornada || null });
    }
  });
  return { validas, errores };
}

export function validarSIC(rawRows) {
  const errores = []; const validas = []; const its = instSet();
  const personas = new Set(state.filas.map((f) => `${f.persona_id}-${f.it}`));
  const vistos = new Set();
  rawRows.forEach((raw, idx) => {
    const fila = raw.__fila || raw.Fila || idx + 2;
    const r = normalizeRow(raw);
    const errs = [];
    const pid = num(r.persona_id), it = num(r.it), per = parseDate(r.periodo);
    const d = num(r.directas), ind = num(r.indirectas) ?? 0;
    if (!pid) errs.push(['PersonaId', r.persona_id, 'PersonaId vacío o no numérico']);
    if (!it || !its.has(it)) errs.push(['IT', r.it, 'Instituto inválido']);
    if (!per) errs.push(['Periodo', r.periodo, 'Periodo inválido']);
    if (d == null) errs.push(['Atenciones Directas', r.directas, 'Valor vacío o no numérico']);
    else if (d < 0) errs.push(['Atenciones Directas', d, 'Atenciones negativas']);
    if (ind < 0) errs.push(['Atenciones Indirectas', ind, 'Atenciones negativas']);
    if (pid && it && !personas.has(`${pid}-${it}`)) errs.push(['PersonaId', pid, 'Profesional no existe en la planificación de ese instituto']);
    const key = `${pid}-${it}-${per?.getUTCMonth()}`;
    if (vistos.has(key)) errs.push(['PersonaId', pid, 'Registro duplicado']); else vistos.add(key);
    for (const [campo, valor, mensaje] of errs) errores.push({ fila, campo, valor, mensaje, severidad: 'error', persona_id: pid, origen: 'api' });
    if (!errs.length) validas.push({ persona_id: pid, it, mes: per.getUTCMonth() + 1, directas: Math.round(d), indirectas: Math.round(ind) });
  });
  return { validas, errores };
}

// ---------------- detección y aplicación de cambios ----------------
function covers(f, mes) {
  const mi = f.periodo_inicio ? Number(f.periodo_inicio.slice(5, 7)) : 1;
  const mf = f.periodo_fin ? Number(f.periodo_fin.slice(5, 7)) : 12;
  return mes >= mi && mes <= mf;
}
function freezeBefore(f, mes, resBefore) {
  const r = resBefore.get(f.id);
  if (!r) return;
  f.congelado = f.congelado || Array(12).fill(null);
  for (let i = 0; i < mes - 1; i++) {
    if (!f.congelado[i]) f.congelado[i] = { planDir: r.planDir[i], planTot: r.planTot[i], semhab: r.semhab[i], horasDirMes: r.horasDirMes[i] };
  }
}
function finMesAnterior(mes) { return iso(new Date(Date.UTC(2026, mes - 1, 0))); }
function capLegal(h, mes, p) { return Math.min(h, jornadaLegal(mes, p)); }

function nuevaFila(r, mes, ctx, extra = {}) {
  const p = ctx.params;
  const cargoP = state.cargos.find((c) => c.cargo.toUpperCase() === r.cargo);
  const ini = new Date(Date.UTC(2026, mes - 1, 1));
  const fi = r.fecha_ingreso ? new Date(r.fecha_ingreso) : null;
  const inicio = fi && fi > ini ? fi : ini;
  const fin = r.fecha_termino ? new Date(r.fecha_termino) : new Date(Date.UTC(2026, 11, 31));
  const base = baseSemanasVigencia(ctx, r.it, inicio, fin);
  const horas = base.map((b, i) => (b > 0 && i + 1 >= mes ? capLegal(r.horas, i + 1, p) : 0));
  return {
    id: nextFilaId(), persona_id: r.persona_id, it: r.it, cargo: cargoP?.cargo || r.cargo, cod_esp: r.cod_esp || cargoP?.cod_esp || null,
    centro_costo: r.centro_costo, desc_cc: null, tipo_contrato: r.tipo_contrato || 'Indefinido', tipo_trabajador: r.tipo_trabajador || 'Titular',
    titular_id: r.reemplaza_a || null, vacante: false, excepcion: null, licencia_extensa: false,
    fecha_ingreso: r.fecha_ingreso, fecha_termino: r.fecha_termino, periodo_inicio: iso(inicio), periodo_fin: iso(fin),
    colacion: false, dias_semana: r.ndias || 5, beneficio_colacion: false, grupal_override: null, mes_nacimiento: r.mes_nacimiento || null,
    dias_jornada: r.dias_jornada, horas, base: base.map((b, i) => (i + 1 >= mes ? b : 0)), lic: Array(12).fill(0),
    vac: base.map((b, i) => (i === 1 && b > 0 && mes <= 2 ? Math.min(b, p.vacaciones_feb_semanas) : 0)), perm: Array(12).fill(0),
    otros: otrosPorRegla(ctx, r.mes_nacimiento), activo: true, origen: `BUK ${MESES[mes - 1]}-2026`, esperado: null,
    buk_ultimo: { mes, horas: r.horas, cargo: r.cargo, tipo_contrato: r.tipo_contrato, ndias: r.ndias, fecha_termino: r.fecha_termino, it: r.it }, ...extra,
  };
}

export async function aplicarBUK(validas, ingesta, user) {
  const { ctx, res: resBefore } = results();
  const p = ctx.params;
  const cambios = [];
  const tocadas = new Set();
  const periodos = [...new Set(validas.map((v) => v.mes))].sort((a, b) => a - b);
  for (const mes of periodos) {
    const rows = validas.filter((v) => v.mes === mes);
    const reportadas = new Set(rows.map((r) => r.persona_id));
    const add = (persona_id, it, fila_id, tipo, campo, antes, despues, motivo) => cambios.push({ ingesta_id: ingesta.id, persona_id, it, fila_id, tipo, campo, valor_anterior: antes, valor_nuevo: despues, vigencia_desde: `2026-${String(mes).padStart(2, '0')}-01`, usuario: user.email, motivo });
    for (const r of rows) {
      const propias = state.filas.filter((f) => f.persona_id === r.persona_id && f.activo !== false);
      const activas = propias.filter((f) => covers(f, mes) && (f.horas[mes - 1] > 0 || f.vacante));
      const multi = activas.length > 1 || activas.some((f) => f.excepcion);
      let f = activas.find((x) => x.it === r.it);
      if (!f && !activas.length && propias.some((x) => x.buk_ultimo && x.buk_ultimo.mes === mes - 1 && x.it === r.it)) {
        // estaba en el reporte anterior pero la planificación no le asigna horas: inconsistencia a revisar
        const x = propias.find((y) => y.it === r.it);
        add(r.persona_id, r.it, x.id, 'REVISAR_PLAN', 'horas semanales', x.horas[mes - 1], r.horas, 'BUK informa jornada activa pero la planificación vigente no le asigna horas');
        continue;
      }
      if (!f && !activas.length) {
        // ALTA o reingreso
        const nf = nuevaFila(r, mes, ctx);
        const titular = r.reemplaza_a ? state.filas.find((x) => x.persona_id === r.reemplaza_a) : null;
        state.filas.push(nf); tocadas.add(nf.id);
        add(r.persona_id, r.it, nf.id, r.tipo_trabajador === 'Reemplazo' ? 'ALTA_REEMPLAZO' : propias.length ? 'REINGRESO' : 'ALTA', 'dotación', null,
          `${nf.cargo} · ${r.horas} h/sem${titular ? ` · reemplaza a #${titular.persona_id}` : ''}`, 'Profesional nuevo en reporte BUK');
        continue;
      }
      if (!f && activas.length && !multi) {
        // cambio de instituto: cerrar anterior y abrir nueva
        const old = activas[0];
        freezeBefore(old, mes, resBefore);
        old.periodo_fin = finMesAnterior(mes);
        for (let i = mes - 1; i < 12; i++) { old.horas[i] = 0; old.base[i] = 0; }
        const nf = nuevaFila(r, mes, ctx, { mes_nacimiento: old.mes_nacimiento, colacion: old.colacion, beneficio_colacion: old.beneficio_colacion });
        state.filas.push(nf); tocadas.add(old.id); tocadas.add(nf.id);
        add(r.persona_id, r.it, nf.id, 'CAMBIO_INSTITUTO', 'instituto', old.it, r.it, 'Traslado detectado en BUK');
        continue;
      }
      if (!f) {
        // multi-instituto con instituto no esperado → revisión manual
        add(r.persona_id, r.it, activas[0]?.id, 'REVISAR_MULTI_INSTITUTO', 'instituto', activas.map((x) => x.it).join('+'), r.it, 'Profesional multi-instituto: requiere revisión de la hoja de excepciones');
        continue;
      }
      // cargo
      const prev = f.buk_ultimo && f.buk_ultimo.mes < mes ? f.buk_ultimo : null;
      const cargoPrev = prev?.cargo || f.cargo.toUpperCase();
      if (r.cargo && r.cargo !== cargoPrev && r.cargo !== f.cargo.toUpperCase()) {
        freezeBefore(f, mes, resBefore);
        const old = f;
        old.periodo_fin = finMesAnterior(mes);
        const nf = { ...JSON.parse(JSON.stringify(old)), id: nextFilaId(), cargo: state.cargos.find((c) => c.cargo.toUpperCase() === r.cargo)?.cargo || r.cargo,
          cod_esp: r.cod_esp || state.cargos.find((c) => c.cargo.toUpperCase() === r.cargo)?.cod_esp || old.cod_esp, periodo_inicio: `2026-${String(mes).padStart(2, '0')}-01`,
          periodo_fin: r.fecha_termino || old.fecha_termino || '2026-12-31', congelado: null, origen: `BUK ${MESES[mes - 1]}-2026 (cambio de cargo)`, esperado: null, asignaciones: undefined };
        for (let i = 0; i < 12; i++) { if (i < mes - 1) { nf.horas[i] = 0; nf.base[i] = 0; } else { old.horas[i] = 0; old.base[i] = 0; } }
        for (let i = mes - 1; i < 12; i++) if (nf.horas[i] > 0 || nf.base[i] > 0) nf.horas[i] = capLegal(r.horas, i + 1, p);
        state.filas.push(nf); tocadas.add(old.id); tocadas.add(nf.id);
        // las asignaciones vigentes se trasladan a la nueva fila
        for (const a of state.asignaciones.filter((a) => a.fila_id === old.id && a.estado === 'aprobada')) { const na = { ...a, id: state.seq.asig++, fila_id: nf.id, motivo: 'Traspaso por cambio de cargo' }; state.asignaciones.push(na); await saveAsignacion(na); }
        add(r.persona_id, r.it, nf.id, 'CAMBIO_CARGO', 'cargo', old.cargo, nf.cargo, 'Cambio contractual de cargo');
        f = nf;
      }
      // jornada
      const horasPrev = prev ? prev.horas : f.horas[mes - 1] || 0;
      if (!multi && Math.abs(horasPrev - r.horas) > 1e-9 && Math.abs((f.horas[mes - 1] || 0) - r.horas) > 1e-9) {
        const antes = f.horas[mes - 1] || horasPrev;
        freezeBefore(f, mes, resBefore);
        for (let i = mes - 1; i < 12; i++) if (covers(f, i + 1) && (f.base[i] > 0 || f.horas[i] > 0)) f.horas[i] = capLegal(r.horas, i + 1, p);
        tocadas.add(f.id);
        add(r.persona_id, r.it, f.id, r.horas > antes ? 'AUMENTO_JORNADA' : 'DISMINUCION_JORNADA', 'horas semanales', antes, r.horas, 'Cambio de jornada informado por BUK');
      } else if (multi) {
        const suma = activas.reduce((a, x) => a + (x.horas[mes - 1] || 0), 0);
        if (Math.abs(suma - r.horas) > 1e-9 && Math.abs((f.horas[mes - 1] || 0) - r.horas) > 1e-9)
          add(r.persona_id, r.it, f.id, 'REVISAR_MULTI_INSTITUTO', 'horas semanales', suma, r.horas, 'Profesional con horas repartidas entre institutos: validar distribución');
      }
      // término de contrato
      if (r.fecha_termino && r.fecha_termino !== f.fecha_termino && r.fecha_termino !== prev?.fecha_termino) {
        const ft = new Date(r.fecha_termino);
        const mt = ft.getUTCMonth() + 1;
        freezeBefore(f, Math.min(mes, mt), resBefore);
        const antes = f.fecha_termino;
        f.fecha_termino = r.fecha_termino; f.periodo_fin = r.fecha_termino;
        const bv = baseSemanasVigencia(ctx, f.it, null, ft);
        for (let i = mt - 1; i < 12; i++) {
          if (i === mt - 1) f.base[i] = Math.min(f.base[i], bv[i]);
          else { f.base[i] = 0; f.horas[i] = 0; }
        }
        tocadas.add(f.id);
        add(r.persona_id, r.it, f.id, 'TERMINO_CONTRATO', 'fecha término', antes, r.fecha_termino, 'Fecha de término informada por BUK');
      }
      const tcPrev = prev?.tipo_contrato || f.tipo_contrato;
      if (r.tipo_contrato && tcPrev && r.tipo_contrato !== tcPrev) {
        add(r.persona_id, r.it, f.id, 'CAMBIO_CONTRATO', 'tipo de contrato', tcPrev, r.tipo_contrato, 'Cambio de tipo de contrato');
        f.tipo_contrato = r.tipo_contrato; tocadas.add(f.id);
      }
      const ndPrev = prev?.ndias || f.dias_semana;
      if (r.ndias && ndPrev && r.ndias !== ndPrev) {
        add(r.persona_id, r.it, f.id, 'CAMBIO_DIAS', 'días de jornada', ndPrev, r.ndias, 'Cambio en días de la jornada');
        f.dias_semana = r.ndias; tocadas.add(f.id);
      }
      f.buk_ultimo = { mes, horas: r.horas, cargo: r.cargo, tipo_contrato: r.tipo_contrato, ndias: r.ndias, fecha_termino: r.fecha_termino, it: r.it };
      tocadas.add(f.id);
    }
    // BAJAS: activos en el periodo que no vienen en el reporte (sólo si el reporte es completo)
    const activosMes = state.filas.filter((f) => f.activo !== false && !f.vacante && covers(f, mes) && f.horas[mes - 1] > 0);
    const personasActivas = new Set(activosMes.map((f) => f.persona_id));
    const completo = rows.length >= personasActivas.size * 0.5;
    if (completo) {
      for (const f of activosMes) {
        if (reportadas.has(f.persona_id)) continue;
        freezeBefore(f, mes, resBefore);
        f.periodo_fin = finMesAnterior(mes);
        for (let i = mes - 1; i < 12; i++) { f.horas[i] = 0; f.base[i] = 0; }
        tocadas.add(f.id);
        add(f.persona_id, f.it, f.id, 'BAJA', 'dotación', `${f.cargo}`, 'No informado en BUK', 'Profesional ausente en el reporte del periodo');
      }
    }
  }
  for (const id of tocadas) { const f = state.filas.find((x) => x.id === id); if (f) await saveFila(f); }
  invalidate();
  const { res: resAfter } = results();
  // impacto anual en atenciones (total) por fila
  for (const c of cambios) {
    const ids = state.filas.filter((f) => f.persona_id === c.persona_id).map((f) => f.id);
    const before = ids.reduce((a, id) => a + (resBefore.get(id)?.total.planTot || 0), 0);
    const after = ids.reduce((a, id) => a + (resAfter.get(id)?.total.planTot || 0), 0);
    c.impacto = after - before;
  }
  // un mismo profesional con varios cambios: impacto sólo en el primero
  const vistos = new Set();
  for (const c of cambios) { if (vistos.has(c.persona_id)) c.impacto = null; vistos.add(c.persona_id); await addCambio(c); }
  return cambios;
}

// ---------------- orquestación ----------------
export async function procesarIngesta({ tipo, archivo, filas, erroresBot = [], origen, user }) {
  tipo = (tipo || detectTipo(archivo || '', filas)).toUpperCase();
  const { validas, errores } = tipo === 'SIC' ? validarSIC(filas) : validarBUK(filas);
  // errores informados por el bot (se registran aunque la fila no haya llegado)
  const bot = erroresBot.map((e) => ({ fila: Number(e.fila ?? e.Fila) || null, campo: e.campo ?? e.Campo, valor: e.valor ?? e.Valor, mensaje: e.mensaje ?? e.Mensaje, severidad: (e.severidad ?? e.Severidad) || 'error', persona_id: e.persona_id ?? e.PersonaId ?? null, origen: 'bot' }));
  const allErr = [...bot, ...errores];
  const periodos = tipo === 'SIC' ? [...new Set(validas.map((v) => v.mes))] : [...new Set(validas.map((v) => v.mes))];
  const ing = await addIngesta({ origen, tipo, archivo, periodo: periodos.sort((a, b) => a - b).map((m) => MESES[m - 1]).join(', ') || '—',
    filas: filas.length + bot.filter((b) => b.severidad === 'error').length, validas: validas.length, errores: allErr.filter((e) => e.severidad === 'error').length, cambios: 0,
    usuario: user.email, estado: 'procesando', resumen: {} });
  await addErrores(ing.id, allErr);
  let cambios = [];
  const totalAntes = results().res; const sumAntes = [...totalAntes.values()].reduce((a, r) => a + r.total.planTot, 0);
  if (tipo === 'SIC') {
    await saveSic(validas, ing.id);
  } else {
    cambios = await aplicarBUK(validas, ing, user);
  }
  const sumDespues = [...results().res.values()].reduce((a, r) => a + r.total.planTot, 0);
  ing.cambios = cambios.length;
  ing.estado = allErr.some((e) => e.severidad === 'error') ? 'con_errores' : 'ok';
  const porTipo = {};
  for (const c of cambios) porTipo[c.tipo] = (porTipo[c.tipo] || 0) + 1;
  ing.resumen = { porTipo, advertencias: allErr.filter((e) => e.severidad === 'advertencia').length, erroresBot: bot.length, atencionesAntes: sumAntes, atencionesDespues: sumDespues, delta: sumDespues - sumAntes };
  const { persist } = await import('./store.js');
  await persist('update ingestas set cambios=$2, estado=$3, resumen=$4 where id=$1', [ing.id, ing.cambios, ing.estado, JSON.stringify(ing.resumen)]);
  await audit(user, `ingesta_${tipo.toLowerCase()}`, 'ingesta', ing.id, { archivo, origen, validas: validas.length, errores: ing.errores, cambios: cambios.length }, `Reporte ${tipo} procesado (${origen})`);
  if (tipo === 'BUK' && cambios.length) {
    const v = await makeVersion(user, `Ingesta BUK #${ing.id} · ${ing.periodo}`, `${cambios.length} cambios detectados en ${archivo}`);
    ing.resumen.version_id = v.id;
  }
  return { ok: true, ingesta_id: ing.id, tipo, validas: validas.length, errores: ing.errores, advertencias: ing.resumen.advertencias, cambios: cambios.length, porTipo, delta: ing.resumen.delta,
    mensaje: `${tipo}: ${validas.length} filas válidas, ${ing.errores} con error, ${cambios.length} cambios aplicados`, detalleErrores: allErr.slice(0, 200), detalleCambios: cambios.slice(0, 200) };
}
