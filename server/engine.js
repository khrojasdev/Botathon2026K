// Motor de cálculo de planificación asistencial — "Cada hora cuenta"
// Reproduce la lógica del Excel "Nac - Planificación Asistencial x mes" con reglas parametrizables.
// Todas las constantes vienen de ctx.params (editable desde la app, sin tocar código).

export const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const EPS = 1e-6;
const fl = (v) => Math.floor(v + EPS);
const r2 = (v) => Math.round(v * 100) / 100;

export const DEFAULT_PARAMS = {
  meta_pct: 0.9,
  tramo1_min: 40, // >= 40 h  → tramo 1
  tramo2_min: 22, // >= 22 h  → tramo 2 ; < 22 → tramo 3
  pausa_umbral: 40,
  pausa_pct_alta: 0.1,
  pausa_pct_baja: 0.06,
  colacion_h_dia: 0.5,
  beneficio_colacion_h_dia: 0.25,
  max_asignaciones: 2,
  max_asignaciones_umbral_h: 30,
  jornada_legal: [{ desde_mes: 1, horas: 44 }, { desde_mes: 5, horas: 42 }],
  incluir_vacantes: true,
  alerta_sic_umbral: 0.15,
  mes_inicio_proyeccion: 7,
  dias_cumpleanos: 0.5,
  dias_visperas_fp: 0.5,
  dias_visperas_navidad: 1,
  dias_descuento_anual_default: 5,
  vacaciones_feb_semanas: 3,
  // Cobertura: atenciones (meta de gestión + LOP) por paciente único proyectado
  intensidad_objetivo: 22,
  pacientes_proyectados: { 11: 735.13, 12: 869.59, 21: 1265.16, 22: 753.22, 31: 751.41, 41: 1700.02, 51: 3742.64, 71: 2116.76, 81: 3533.09, 91: 2137.44, 101: 2137.6, 111: 688.96, 131: 11610, 141: 806.42 },
  atenciones_lop: { 11: 615, 12: 1200, 21: 1538, 22: 1184, 31: 800, 41: 1900, 51: 4484, 71: 2930, 81: 4086, 91: 4154, 101: 2850, 111: 500, 131: 22070, 141: 1084 },
  umbral_riesgo_proyeccion: 0.95,
};

export function tramoDe(x, p) {
  if (x >= p.tramo1_min) return 't1';
  if (x >= p.tramo2_min) return 't2';
  return 't3';
}
export const TRAMO_LABEL = { t1: '≥ 40 h', t2: '22 – 40 h', t3: '< 22 h' };

export function jornadaLegal(mes, p) {
  let h = 45;
  for (const j of [...p.jornada_legal].sort((a, b) => a.desde_mes - b.desde_mes)) if (mes >= j.desde_mes) h = j.horas;
  return h;
}

export function vigenciaMeses(f) {
  const mi = f.periodo_inicio ? Number(String(f.periodo_inicio).slice(5, 7)) : 1;
  const mf = f.periodo_fin ? Number(String(f.periodo_fin).slice(5, 7)) : 12;
  return Array.from({ length: 12 }, (_, i) => i + 1 >= mi && i + 1 <= mf);
}

/** Promedio ponderado de horas semanales del año (sobre los meses vigentes de la fila). */
export function promedioPonderado(horas) {
  const act = horas.filter((h) => h > 0);
  if (!act.length) return 0;
  return fl(act.reduce((a, b) => a + b, 0) / act.length);
}

/** Calcula una fila de planificación (profesional × instituto × período de vigencia). */
export function calcFila(f, ctx) {
  const p = ctx.params;
  const cargo = ctx.cargos.get(f.cargo) || ctx.cargoFallback(f);
  const inst = ctx.institutos.get(f.it) || { grupo_grupal: 'Otros' };
  const horas = f.horas.map((h) => Number(h) || 0);
  // meses vigentes: en el Excel, el promedio se calcula sobre el período de vigencia de la fila
  const vig = vigenciaMeses(f);
  const vigHoras = horas.filter((h, i) => vig[i]);
  const X = vigHoras.length ? fl(vigHoras.reduce((a, b) => a + b, 0) / vigHoras.length) : 0;
  const tramo = tramoDe(X, p);
  const [pDir, pInd, pNas] = cargo[tramo] || [0, 0, 1];
  const nasSem = X * pNas;
  const pausa = X * (X >= p.pausa_umbral ? p.pausa_pct_alta : p.pausa_pct_baja);
  const beneficio = f.beneficio_colacion ? p.beneficio_colacion_h_dia * (f.dias_semana || 5) : 0;
  const otrasNas = Math.max(0, nasSem - pausa - beneficio);
  const asigs = (f.asignaciones || []).filter((a) => a.estado === undefined || a.estado === 'aprobada');
  const asigTotal = asigs.reduce((a, b) => a + (Number(b.horas) || 0), 0);
  const colacion = f.colacion ? p.colacion_h_dia * (f.dias_semana || 5) : 0;

  // grupal
  const g = ctx.grupal.get(f.cod_esp);
  let gPct = 0, gPac = 1;
  if (g) {
    gPct = f.grupal_override != null ? f.grupal_override : g.pct;
    gPac = inst.grupo_grupal === 'San-Con' ? g.pac_sancon : g.pac_otros;
  }
  const factorGrupal = 1 + gPct * (gPac - 1);
  const stdDir = cargo.std_dir || 40;
  const stdInd = cargo.std_ind || 30;
  const incluir = !(f.vacante && !p.incluir_vacantes);

  const m = {
    horas, hd: [], disp: [], dirH: [], indH: [], rateDir: [], rateInd: [], rateDirT: [], semhab: [], baseSem: [],
    planDir: [], planInd: [], planTot: [], mgDir: [], mgTot: [], horasContrMes: [], horasDirMes: [], foja: [], congelado: [],
  };
  for (let i = 0; i < 12; i++) {
    const fr = f.congelado && f.congelado[i];
    const h = horas[i];
    const hd = h > 0 ? h - colacion : 0;
    const disp = hd > 0 ? Math.max(0, hd - nasSem - asigTotal) : 0;
    const share = pDir + pInd > 0 ? 1 / (pDir + pInd) : 0;
    const dirH = disp * pDir * share;
    const indH = disp * pInd * share;
    const rateDir = fl((dirH * 60) / stdDir);
    const rateInd = fl((indH * 60) / stdInd);
    const rateDirT = rateDir * factorGrupal;
    const base = Number(f.base?.[i]) || 0;
    const semhab = Math.max(0, base - (f.lic?.[i] || 0) - (f.vac?.[i] || 0) - (f.perm?.[i] || 0) - (f.otros?.[i] || 0));
    let planDir = incluir ? fl(semhab * rateDirT) : 0;
    let planTot = incluir ? fl(semhab * (rateDirT + rateInd)) : 0;
    let semhabOut = semhab;
    if (fr) { planDir = fr.planDir; planTot = fr.planTot; semhabOut = fr.semhab; }
    const mgDir = fl(planDir * p.meta_pct);
    const mgTot = fl(planTot * p.meta_pct);
    const calSem = ctx.semanasMes(f.it, i + 1);
    const horasContrMes = h * calSem;
    const horasDirMes = fr ? fr.horasDirMes ?? dirH * semhabOut : dirH * semhabOut;
    m.hd.push(r2(hd)); m.disp.push(disp); m.dirH.push(dirH); m.indH.push(indH);
    m.rateDir.push(rateDir); m.rateInd.push(rateInd); m.rateDirT.push(rateDirT);
    m.semhab.push(semhabOut); m.baseSem.push(base);
    m.planDir.push(planDir); m.planTot.push(planTot); m.planInd.push(planTot - planDir);
    m.mgDir.push(mgDir); m.mgTot.push(mgTot);
    m.horasContrMes.push(horasContrMes); m.horasDirMes.push(horasDirMes);
    m.foja.push(horasContrMes > 0 ? horasDirMes / horasContrMes : null);
    m.congelado.push(!!fr);
  }
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const alertas = [];
  if (X > p.max_asignaciones_umbral_h && asigs.length > p.max_asignaciones)
    alertas.push(`Supera máximo de ${p.max_asignaciones} asignaciones especiales (${asigs.length})`);
  horas.forEach((h, i) => { if (h > jornadaLegal(i + 1, p)) alertas.push(`${MESES[i]}: ${h} h supera jornada legal (${jornadaLegal(i + 1, p)} h)`); });
  if (!ctx.cargos.get(f.cargo)) alertas.push(`Cargo sin parámetros de distribución: ${f.cargo}`);
  return {
    id: f.id, X, tramo, pDir, pInd, pNas, nasSem, pausa, beneficio, otrasNas, asigTotal, asigCount: asigs.length, colacion,
    stdDir, stdInd, gPct, gPac, factorGrupal, ...m,
    total: {
      planDir: sum(m.planDir), planInd: sum(m.planInd), planTot: sum(m.planTot), mgDir: sum(m.mgDir), mgTot: sum(m.mgTot),
      semhab: sum(m.semhab), horasDirMes: sum(m.horasDirMes), horasContrMes: sum(m.horasContrMes),
    },
    alertas,
  };
}

export function buildCtx(state) {
  const cargos = new Map(state.cargos.map((c) => [c.cargo, c]));
  const grupal = new Map(state.grupal.map((g) => [g.cod_esp, g]));
  const institutos = new Map(state.institutos.map((i) => [i.it, i]));
  const calMap = new Map(state.calendario.map((c) => [c.mes, c]));
  const instCal = new Map((state.calendario_instituto || []).map((c) => [`${c.it}-${c.mes}`, c]));
  const params = { ...DEFAULT_PARAMS, ...(state.params || {}) };
  // cargo de respaldo: primer cargo de la misma especialidad
  const porEsp = new Map();
  for (const c of state.cargos) if (c.cod_esp && !porEsp.has(c.cod_esp)) porEsp.set(c.cod_esp, c);
  return {
    params, cargos, grupal, institutos,
    cargoFallback: (f) => porEsp.get(f.cod_esp) || { std_dir: 40, std_ind: 30, t1: [0.6, 0.15, 0.25], t2: [0.6, 0.15, 0.25], t3: [0.6, 0.15, 0.25] },
    semanasMes: (it, mes) => {
      const o = instCal.get(`${it}-${mes}`);
      if (o) return Number(o.semanas);
      return Number(calMap.get(mes)?.semanas || 0);
    },
  };
}

export function calcAll(state, ctx = buildCtx(state)) {
  const out = new Map();
  for (const f of state.filas) if (f.activo !== false) out.set(f.id, calcFila(f, ctx));
  return out;
}

/** Semanas base de un mes según la vigencia del contrato (para altas nuevas). */
export function baseSemanasVigencia(ctx, it, inicio, fin) {
  const base = [];
  for (let mes = 1; mes <= 12; mes++) {
    const ini = new Date(Date.UTC(2026, mes - 1, 1));
    const finMes = new Date(Date.UTC(2026, mes, 0));
    const a = inicio && inicio > ini ? inicio : ini;
    const b = fin && fin < finMes ? fin : finMes;
    if (b < a) { base.push(0); continue; }
    const frac = ((b - a) / 86400000 + 1) / ((finMes - ini) / 86400000 + 1);
    base.push(Math.round(ctx.semanasMes(it, mes) * frac * 100) / 100);
  }
  return base;
}

/** Descuentos "otros" por regla (para filas creadas desde un reporte nuevo). */
export function otrosPorRegla(ctx, mesNac) {
  const p = ctx.params;
  const out = [];
  const meses = 12 - p.mes_inicio_proyeccion + 1;
  for (let mes = 1; mes <= 12; mes++) {
    let d = 0;
    if (mes >= p.mes_inicio_proyeccion) {
      d += p.dias_descuento_anual_default / 5 / meses;
      if (mes === mesNac) d += p.dias_cumpleanos / 5;
      if (mes === 9) d += p.dias_visperas_fp / 5;
      if (mes === 12) d += p.dias_visperas_navidad / 5;
    }
    out.push(Math.round(d * 10000) / 10000);
  }
  return out;
}
