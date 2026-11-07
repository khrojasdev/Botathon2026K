// Funciones extra: cobertura por paciente (brecha), simulador de contratación y proyección de cierre de año.
import { state, results } from './store.js';
import { MESES, calcFila, baseSemanasVigencia, otrosPorRegla, jornadaLegal } from './engine.js';
import { filtered, instMap, sicDe, parseFilters } from './analytics.js';

const COORDS = {
  11: [-18.48, -70.31], 12: [-20.21, -70.15], 21: [-23.65, -70.40], 22: [-22.46, -68.93], 31: [-27.37, -70.33], 41: [-29.95, -71.34],
  51: [-33.05, -71.62], 61: [-34.17, -70.74], 71: [-35.43, -71.66], 81: [-36.83, -73.05], 91: [-38.74, -72.60], 101: [-41.47, -72.94],
  102: [-42.48, -73.76], 111: [-45.57, -72.07], 131: [-33.45, -70.67], 141: [-39.81, -73.25], 161: [-36.61, -72.10],
};
const val = (obj, it) => (obj ? obj[it] ?? obj[String(it)] ?? null : null);

/** Agregados por instituto: meta, horas, SIC y proyección. */
function porInstituto(filters) {
  const rows = filtered({ ...filters, meses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] });
  const map = new Map();
  for (const { f, r } of rows) {
    if (!map.has(f.it)) map.set(f.it, { it: f.it, filas: [], planDir: 0, planTot: 0, mgDir: 0, mgTot: 0, horasSem: 0, personas: new Set() });
    const a = map.get(f.it);
    a.filas.push({ f, r });
    a.planDir += r.total.planDir; a.planTot += r.total.planTot; a.mgDir += r.total.mgDir; a.mgTot += r.total.mgTot;
    a.horasSem += r.horas[11]; if (r.horas.some((h) => h > 0)) a.personas.add(f.persona_id);
  }
  return map;
}

function proyeccionDe(filas, p) {
  // meses con datos SIC (en cualquiera de las filas del grupo)
  const mesesSic = new Set();
  for (const { f } of filas) for (let m = 1; m <= 12; m++) if (sicDe(f, m)) mesesSic.add(m);
  const conSic = [...mesesSic].sort((a, b) => a - b);
  const ultimo = conSic.length ? Math.max(...conSic) : 0;
  let real = 0, planYtd = 0, mgYtd = 0, planResto = 0, mgAnual = 0;
  const mensual = MESES.map(() => ({ plan: 0, mg: 0, real: null }));
  for (const { f, r } of filas) {
    mgAnual += r.total.mgDir;
    for (let m = 1; m <= 12; m++) {
      const i = m - 1;
      mensual[i].plan += r.planDir[i]; mensual[i].mg += r.mgDir[i];
      if (m <= ultimo) {
        const s = sicDe(f, m);
        planYtd += r.planDir[i]; mgYtd += r.mgDir[i];
        if (s) { real += s.directas; mensual[i].real = (mensual[i].real || 0) + s.directas; }
      } else planResto += r.planDir[i];
    }
  }
  const ritmo = planYtd > 0 ? real / planYtd : null; // % de lo planificado que efectivamente se realiza
  const proyectado = ritmo == null ? null : Math.round(real + planResto * ritmo);
  const pct = proyectado == null || !mgAnual ? null : proyectado / mgAnual;
  const faltante = Math.max(0, mgAnual - real);
  const mesesRest = 12 - ultimo;
  const necesarioMes = mesesRest > 0 ? faltante / mesesRest : null;
  const ritmoMes = mesesRest > 0 && ritmo != null ? (planResto * ritmo) / mesesRest : null;
  const estado = pct == null ? 'sin_datos' : pct >= 1 ? 'cumple' : pct >= p.umbral_riesgo_proyeccion ? 'riesgo' : 'no_cumple';
  // series acumuladas
  let acR = 0, acP = 0, acM = 0, acProj = 0;
  const serie = mensual.map((x, i) => {
    acP += x.plan; acM += x.mg;
    const m = i + 1;
    if (m <= ultimo) { acR += x.real || 0; acProj = acR; } else acProj += x.plan * (ritmo ?? 1);
    return { mes: m, nombre: MESES[i], realAcum: m <= ultimo ? acR : null, proyAcum: m >= ultimo ? Math.round(acProj) : null, metaAcum: acM, planAcum: acP };
  });
  return { ultimoMesReal: ultimo, real, planYtd, mgYtd, ritmo, proyectado, metaAnual: mgAnual, pct, estado, faltante, necesarioMes, ritmoMes, serie };
}

export function insightsCobertura(qs, user) {
  const { ctx } = results();
  const p = ctx.params;
  const filters = parseFilters(qs, user);
  const im = instMap();
  const grupos = porInstituto(filters);
  let totMeta = 0, totLop = 0, totPac = 0, totHoras = 0;
  const lista = [];
  for (const [it, a] of grupos) {
    const inst = im.get(it) || {};
    const pac = val(p.pacientes_proyectados, it);
    const lop = val(p.atenciones_lop, it) || 0;
    const atenciones = a.mgTot + lop;
    const intensidad = pac ? atenciones / pac : null;
    const objetivo = p.intensidad_objetivo;
    const faltantes = pac ? Math.max(0, Math.round(objetivo * pac - atenciones)) : null;
    // rendimiento: atenciones de meta por hora semanal contratada → equivalente en profesionales de 42 h
    const porHora = a.horasSem > 0 ? a.mgTot / a.horasSem : null;
    const fte42 = faltantes != null && porHora ? faltantes / (porHora * 42) : null;
    const proy = proyeccionDe(a.filas, p);
    if (pac) { totMeta += atenciones; totPac += pac; }
    totLop += lop; totHoras += a.horasSem;
    lista.push({
      it, codigo: inst.codigo, nombre: inst.nombre, zona: inst.zona, coord: COORDS[it] || null,
      dotacion: a.personas.size, horasSem: a.horasSem, mgTot: a.mgTot, mgDir: a.mgDir, lop, atenciones, pacientes: pac,
      intensidad, objetivo, faltantes, fte42, porHora,
      foja: null, cumplimiento: proy.mgYtd ? proy.real / proy.mgYtd : null, proyeccion: { pct: proy.pct, estado: proy.estado, proyectado: proy.proyectado, metaAnual: proy.metaAnual },
    });
  }
  // FOJA por instituto
  for (const x of lista) {
    const a = grupos.get(x.it);
    let hd = 0, hc = 0;
    for (const { r } of a.filas) { hd += r.total.horasDirMes; hc += r.total.horasContrMes; }
    x.foja = hc ? hd / hc : null;
  }
  lista.sort((a, b) => a.it - b.it);
  return {
    objetivo: p.intensidad_objetivo,
    nacional: { pacientes: totPac, atenciones: totMeta, intensidad: totPac ? totMeta / totPac : null, faltantes: lista.reduce((s, x) => s + (x.faltantes || 0), 0), fte42: lista.reduce((s, x) => s + (x.fte42 || 0), 0), horasSem: totHoras },
    institutos: lista,
    cargos: [...new Set(state.filas.filter((f) => f.activo !== false).map((f) => f.cargo))].sort(),
  };
}

/** Simula contratar N profesionales de un cargo en un instituto desde un mes (sin guardar nada). */
export function simularContratacion({ it, cargo, horas = 42, cantidad = 1, desde_mes = 8 }) {
  const { ctx } = results();
  const p = ctx.params;
  it = Number(it); horas = Number(horas); cantidad = Math.max(1, Math.min(50, Number(cantidad) || 1)); desde_mes = Math.max(1, Math.min(12, Number(desde_mes) || 1));
  const cargoP = state.cargos.find((c) => c.cargo === cargo);
  if (!cargoP) throw Object.assign(new Error('Cargo sin parámetros de distribución'), { status: 400 });
  const ini = new Date(Date.UTC(2026, desde_mes - 1, 1));
  const base = baseSemanasVigencia(ctx, it, ini, new Date(Date.UTC(2026, 11, 31)));
  const fila = {
    id: -1, persona_id: 0, it, cargo, cod_esp: cargoP.cod_esp, tipo_contrato: 'Indefinido', tipo_trabajador: 'Titular',
    periodo_inicio: ini.toISOString().slice(0, 10), periodo_fin: '2026-12-31', colacion: false, dias_semana: 5, beneficio_colacion: false,
    horas: base.map((b, i) => (b > 0 ? Math.min(horas, jornadaLegal(i + 1, p)) : 0)), base, lic: Array(12).fill(0),
    vac: Array(12).fill(0), perm: Array(12).fill(0), otros: otrosPorRegla(ctx, null), asignaciones: [],
  };
  const r = calcFila(fila, ctx);
  const cob = insightsCobertura({ it: String(it) }, null).institutos.find((x) => x.it === it);
  const extraMeta = r.total.mgTot * cantidad;
  const pac = cob?.pacientes;
  return {
    porProfesional: { planDir: r.total.planDir, planTot: r.total.planTot, mgTot: r.total.mgTot, rateDir: r.rateDirT[11], rateInd: r.rateInd[11], tramo: r.tramo, pDir: r.pDir, pNas: r.pNas },
    cantidad, extraAtenciones: r.total.planTot * cantidad, extraMeta,
    antes: { atenciones: cob?.atenciones, intensidad: cob?.intensidad, faltantes: cob?.faltantes },
    despues: { atenciones: (cob?.atenciones || 0) + extraMeta, intensidad: pac ? ((cob?.atenciones || 0) + extraMeta) / pac : null, faltantes: pac ? Math.max(0, Math.round(p.intensidad_objetivo * pac - (cob?.atenciones || 0) - extraMeta)) : null },
    mensual: MESES.map((m, i) => ({ mes: m, planDir: r.planDir[i] * cantidad, planTot: r.planTot[i] * cantidad })),
  };
}

export function insightsProyeccion(qs, user) {
  const { ctx } = results();
  const p = ctx.params;
  const filters = parseFilters(qs, user);
  const rows = filtered({ ...filters, meses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] });
  const im = instMap();
  const nacional = proyeccionDe(rows, p);
  const grupos = new Map();
  const areas = new Map();
  for (const x of rows) {
    if (!grupos.has(x.f.it)) grupos.set(x.f.it, []);
    grupos.get(x.f.it).push(x);
    const k = x.f.cod_esp || 'S/A';
    if (!areas.has(k)) areas.set(k, []);
    areas.get(k).push(x);
  }
  const porInst = [...grupos].map(([it, filas]) => { const pr = proyeccionDe(filas, p); delete pr.serie; return { it, nombre: im.get(it)?.nombre, codigo: im.get(it)?.codigo, ...pr }; }).sort((a, b) => (a.pct ?? 9) - (b.pct ?? 9));
  const porArea = [...areas].map(([area, filas]) => { const pr = proyeccionDe(filas, p); delete pr.serie; return { area, ...pr }; }).sort((a, b) => (a.pct ?? 9) - (b.pct ?? 9));
  const profesionales = rows.map((x) => { const pr = proyeccionDe([x], p); return { fila_id: x.f.id, persona_id: x.f.persona_id, instituto: im.get(x.f.it)?.nombre, cargo: x.f.cargo, pct: pr.pct, proyectado: pr.proyectado, metaAnual: pr.metaAnual, ritmo: pr.ritmo, estado: pr.estado }; })
    .filter((x) => x.pct != null && x.metaAnual > 0 && x.estado !== 'cumple').sort((a, b) => a.pct - b.pct).slice(0, 30);
  const resumen = { cumple: porInst.filter((x) => x.estado === 'cumple').length, riesgo: porInst.filter((x) => x.estado === 'riesgo').length, no_cumple: porInst.filter((x) => x.estado === 'no_cumple').length };
  return { nacional, porInst, porArea, profesionales, resumen, umbral: p.umbral_riesgo_proyeccion };
}
