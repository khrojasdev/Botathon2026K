// Asistente conversacional: responde preguntas en lenguaje natural con los datos reales de la plataforma.
// Funciona sin servicios externos (reglas + datos), respeta el alcance del rol y entrega enlaces a la vista correspondiente.
import { state, results } from './store.js';
import { dashboard, parseFilters, instMap } from './analytics.js';
import { insightsCobertura, insightsProyeccion, simularContratacion } from './insights.js';
import { MESES } from './engine.js';

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9#ñ\s]/g, ' ').replace(/\s+/g, ' ').trim();
const n0 = (v) => (v == null || isNaN(v) ? '—' : Math.round(v).toLocaleString('es-CL'));
const n1 = (v) => (v == null || isNaN(v) ? '—' : Number(v).toLocaleString('es-CL', { maximumFractionDigits: 1 }));
const pc = (v) => (v == null || isNaN(v) ? 'sin datos' : `${(v * 100).toLocaleString('es-CL', { maximumFractionDigits: 1 })}%`);

const ALIAS_IT = {
  arica: 11, iquique: 12, antofagasta: 21, calama: 22, copiapo: 31, coquimbo: 41, 'la serena': 41, valparaiso: 51, valpo: 51, 'vina': 51,
  ohiggins: 61, 'o higgins': 61, rancagua: 61, talca: 71, concepcion: 81, conce: 81, temuco: 91, 'puerto montt': 101, coyhaique: 111, aysen: 111,
  santiago: 131, stgo: 131, valdivia: 141, castro: 102, chiloe: 102, nuble: 161, chillan: 161,
};
const ALIAS_AREA = [
  [['kinesiolog', 'kine'], 'KI', 'kinesiología'], [['fonoaudiolog', 'fono'], 'FO', 'fonoaudiología'], [['terapia ocupacional', 'terapeuta ocupacional', 'terapeutas ocupacionales'], 'TO', 'terapia ocupacional'],
  [['psicolog'], 'PC', 'psicología'], [['fisiatr', 'medico', 'medicos'], 'FI', 'fisiatría'], [['enfermer'], 'EN', 'enfermería'], [['educador', 'educacion', 'profesor'], 'ED', 'educación'],
  [['asistente social', 'asistentes sociales', 'servicio social', 'trabajador social'], 'AS', 'servicio social'], [['arte', 'musica', 'teatro', 'danza'], 'UTAC', 'terapias artísticas'],
  [['deporte', 'educacion fisica', 'ueda'], 'UEDA', 'deporte adaptado'], [['laboral', 'ulab'], 'ULAB', 'unidad laboral'], [['tecnologia asistiva', 'uta'], 'UTA', 'tecnología asistiva'],
];
const CARGO_POR_AREA = { KI: 'KINESIOLOGO', FO: 'FONOAUDIOLOGO', TO: 'TERAPEUTA OCUPACIONAL', PC: 'PSICOLOGO', FI: 'MEDICO FISIATRA', EN: 'ENFERMERA', ED: 'EDUCADOR', AS: 'ASISTENTE SOCIAL', UTAC: 'PROFESOR DE ARTE', UEDA: 'PROFESOR DE EDUCACION FISICA' };
const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const CARGO_TXT = { KINESIOLOGO: ['kinesiólogo', 'kinesiólogos'], FONOAUDIOLOGO: ['fonoaudiólogo', 'fonoaudiólogos'], 'TERAPEUTA OCUPACIONAL': ['terapeuta ocupacional', 'terapeutas ocupacionales'], PSICOLOGO: ['psicólogo', 'psicólogos'], 'MEDICO FISIATRA': ['médico fisiatra', 'médicos fisiatras'], ENFERMERA: ['enfermera', 'enfermeras'], EDUCADOR: ['educador', 'educadores'], 'ASISTENTE SOCIAL': ['asistente social', 'asistentes sociales'], 'PROFESOR DE ARTE': ['profesor de arte', 'profesores de arte'], 'PROFESOR DE EDUCACION FISICA': ['profesor de educación física', 'profesores de educación física'] };
const NUMS = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };

function detectar(q) {
  let it = null, itNombre = null;
  for (const [k, v] of Object.entries(ALIAS_IT).sort((a, b) => b[0].length - a[0].length)) if (new RegExp(`\\b${k}\\b`).test(q)) { it = v; itNombre = k; break; }
  let area = null, areaNombre = null;
  for (const [keys, code, nombre] of ALIAS_AREA) if (keys.some((k) => (k.length <= 5 ? new RegExp(`\\b${k}`).test(q) : q.includes(k)))) { area = code; areaNombre = nombre; break; }
  const persona = (q.match(/#?\b(\d{5,6})\b/) || [])[1];
  const mes = MESES.findIndex((m, i) => new RegExp(`\\b(${m}|${['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][i]})\\b`).test(q));
  const cantM = q.match(/\b(\d{1,2})\b/) || Object.keys(NUMS).map((w) => (new RegExp(`\\b${w}\\b`).test(q) ? [null, NUMS[w]] : null)).find(Boolean);
  return { it, itNombre, area, areaNombre, persona: persona ? Number(persona) : null, mes: mes >= 0 ? mes + 1 : null, cantidad: cantM ? Number(cantM[1]) : null };
}
const tiene = (q, ...ws) => ws.some((w) => q.includes(w));

export function responder(pregunta, user) {
  const q = norm(pregunta);
  const d = detectar(q);
  const im = instMap();
  if (user.rol === 'jefatura' && d.it && d.it !== Number(user.it)) d.it = Number(user.it);
  const scopeIt = d.it || (user.rol === 'jefatura' ? Number(user.it) : null);
  const lugar = scopeIt ? `el IT ${im.get(scopeIt)?.nombre}` : 'todo el país';
  const filtros = { it: scopeIt ? String(scopeIt) : '', cod_esp: d.area || '', meses: d.mes ? String(d.mes) : '' };
  const sufijoArea = d.area ? ` en ${d.areaNombre}` : '';
  const linkDash = { label: 'Ver en el resumen', to: `/?${new URLSearchParams(Object.fromEntries(Object.entries(filtros).filter(([, v]) => v)))}` };
  const out = (texto, extra = {}) => ({ texto, puntos: extra.puntos || [], enlaces: extra.enlaces || [], sugerencias: extra.sugerencias || SUGERENCIAS.slice(0, 3) });

  if (!q || tiene(q, 'ayuda', 'que puedes', 'que sabes', 'como funciona', 'hola')) {
    return out('Hola, soy el asistente de planificación. Puedo responder con los datos actuales sobre metas, cumplimiento, cobertura por paciente, proyección a diciembre, alertas, cambios del robot y simular contrataciones.', { sugerencias: SUGERENCIAS });
  }

  // profesional específico
  if (d.persona) {
    const filas = state.filas.filter((f) => f.persona_id === d.persona && f.activo !== false && (user.rol !== 'jefatura' || f.it === Number(user.it)));
    if (!filas.length) return out(`No encontré al profesional #${d.persona} en la planificación que puedes ver.`);
    const { res } = results();
    const partes = filas.map((f) => { const r = res.get(f.id); return `es ${f.cargo.toLowerCase()} en ${im.get(f.it)?.nombre}, con ${n0(r.total.planTot)} atenciones planificadas en el año y meta de ${n0(r.total.mgTot)}`; });
    return out(`El profesional #${d.persona} ${partes.join('; ')}.`, { enlaces: filas.map((f) => ({ label: `Abrir ficha (${im.get(f.it)?.codigo})`, to: `/profesional/${f.id}` })) });
  }

  // simulación de contratación
  if (tiene(q, 'contrat', 'si sumamos', 'si agregamos', 'simul')) {
    const it = scopeIt;
    const cargo = CARGO_POR_AREA[d.area || 'KI'];
    if (!it) return out('Para simular necesito el instituto. Por ejemplo: «¿qué pasa si contratamos 2 kinesiólogos en Valparaíso?»');
    const cant = d.cantidad && d.cantidad < 50 ? d.cantidad : 1;
    const s = simularContratacion({ it, cargo, horas: 42, cantidad: cant, desde_mes: d.mes || 8 });
    const nombre = im.get(it)?.nombre;
    const ct = CARGO_TXT[cargo] || [cargo.toLowerCase(), cargo.toLowerCase() + 's'];
    return out(`Si se contratan ${cant} ${cant > 1 ? ct[1] : ct[0]} de 42 horas en ${nombre} desde ${MESES_L[(d.mes || 8) - 1]}, se suman ${n0(s.extraAtenciones)} atenciones este año. Las atenciones por paciente pasarían de ${n1(s.antes.intensidad)} a ${n1(s.despues.intensidad)}${s.antes.faltantes != null ? ` y la brecha bajaría de ${n0(s.antes.faltantes)} a ${n0(s.despues.faltantes)} atenciones` : ''}.`,
      { enlaces: [{ label: 'Abrir el simulador', to: '/cobertura' }] });
  }

  // cobertura / brecha
  if (tiene(q, 'brecha', 'cobertura', 'por paciente', 'por nino', 'ninos', 'pacientes', 'falta capacidad', 'faltan profesionales')) {
    const c = insightsCobertura({ it: filtros.it }, user);
    if (scopeIt) {
      const x = c.institutos.find((i) => i.it === scopeIt);
      if (!x?.pacientes) return out(`No tengo pacientes proyectados para ${lugar}. Se pueden cargar en «Cobertura y mapa».`, { enlaces: [{ label: 'Cobertura y mapa', to: '/cobertura' }] });
      return out(`En ${x.nombre} cada niño, niña o joven recibirá en promedio ${n1(x.intensidad)} atenciones este año (objetivo ${c.objetivo}). ${x.faltantes ? `Faltan ${n0(x.faltantes)} atenciones, equivalentes a unos ${n1(x.fte42)} profesionales de 42 horas.` : 'No tiene brecha de cobertura.'}`, { enlaces: [{ label: 'Ver en el mapa', to: '/cobertura' }] });
    }
    const brechas = c.institutos.filter((x) => x.faltantes > 0).sort((a, b) => b.faltantes - a.faltantes);
    return out(`A nivel nacional, cada paciente recibirá en promedio ${n1(c.nacional.intensidad)} atenciones. ${brechas.length} institutos están bajo el objetivo de ${c.objetivo}; la mayor brecha está en ${brechas.slice(0, 3).map((x) => `${x.nombre} (${n1(x.intensidad)})`).join(', ')}. En total faltan unos ${n0(c.nacional.fte42)} profesionales de 42 horas.`,
      { enlaces: [{ label: 'Ver en el mapa', to: '/cobertura' }], sugerencias: ['¿Qué pasa si contratamos 3 kinesiólogos en Valparaíso?', '¿Cómo está la cobertura en Santiago?'] });
  }

  // proyección
  if (tiene(q, 'proyecc', 'diciembre', 'fin de ano', 'cierre', 'llegar', 'llegaremos', 'cumplira', 'riesgo')) {
    const p = insightsProyeccion({ it: filtros.it, cod_esp: filtros.cod_esp }, user);
    const n = p.nacional;
    if (n.estado === 'sin_datos') return out('Aún no hay atenciones realizadas cargadas desde SIC, así que no puedo proyectar el cierre.');
    const riesgo = p.porInst.filter((x) => x.estado !== 'cumple');
    return out(`Al ritmo actual (${pc(n.ritmo)} de lo planificado se está realizando), ${lugar}${sufijoArea} cerraría el año con ${pc(n.pct)} de la meta de atenciones directas.${!scopeIt && riesgo.length ? ` En riesgo o bajo la meta: ${riesgo.map((x) => `${x.nombre} (${pc(x.pct)})`).join(', ')}.` : ''}`,
      { enlaces: [{ label: 'Ver proyección', to: `/proyeccion${scopeIt ? `?it=${scopeIt}` : ''}` }] });
  }

  // último reporte / robot / cambios
  if (tiene(q, 'robot', 'blue prism', 'buk', 'reporte', 'carga', 'cambio', 'novedad', 'alta', 'baja')) {
    const ing = state.ingestas.find((i) => i.tipo === 'BUK') || state.ingestas[0];
    if (!ing) return out('Todavía no se ha procesado ningún reporte. Cuando el robot de Blue Prism deje uno, te contaré qué cambió.');
    const tipos = Object.entries(ing.resumen?.porTipo || {}).map(([k, v]) => `${v} ${k.toLowerCase().replace(/_/g, ' ')}`).join(', ');
    return out(`El último reporte ${ing.tipo} (${ing.archivo}) ${ing.origen === 'Blue Prism' ? 'lo procesó el robot de Blue Prism' : 'se cargó manualmente desde la web'}: ${ing.validas} filas válidas, ${ing.errores} con error y ${ing.cambios} cambios${tipos ? ` (${tipos})` : ''}. ${ing.resumen?.delta ? `El efecto es de ${ing.resumen.delta > 0 ? '+' : ''}${n0(ing.resumen.delta)} atenciones en el año.` : ''}`,
      { enlaces: [{ label: 'Ver el detalle del reporte', to: '/ingestas' }] });
  }

  // asignaciones pendientes
  if (tiene(q, 'asignacion', 'pendiente', 'aprobar', 'autoriz')) {
    const pend = state.asignaciones.filter((a) => a.estado === 'pendiente').filter((a) => user.rol !== 'jefatura' || state.filas.find((f) => f.id === a.fila_id)?.it === Number(user.it));
    return out(pend.length ? `Hay ${pend.length} asignaciones especiales esperando autorización de la Dirección Médica Nacional: ${pend.slice(0, 4).map((a) => `${a.nombre} (${a.horas} h)`).join(', ')}.` : 'No hay asignaciones especiales pendientes de autorización.', { enlaces: [{ label: 'Ir a asignaciones', to: '/asignaciones' }] });
  }

  const dash = dashboard(parseFilters(filtros, user));
  const t = dash.total;

  // alertas
  if (tiene(q, 'alerta', 'desviac', 'problema', 'bajo la meta', 'peor', 'atrasad')) {
    const a = dash.alertas.sic;
    if (!a.length) return out(`No hay alertas de desviación en ${lugar}${sufijoArea}.`);
    return out(`Hay ${dash.alertas.sicTotal} profesionales con desviación en ${lugar}${sufijoArea}. Los casos más bajos son ${a.slice(0, 3).map((x) => `#${x.persona_id} (${x.cargo.toLowerCase()}, ${x.instituto}, ${pc(x.cumpl)} de su meta)`).join('; ')}.`,
      { enlaces: [{ label: 'Ver alertas', to: `/sic${scopeIt ? `?it=${scopeIt}` : ''}` }] });
  }
  // dotación
  if (tiene(q, 'cuantos', 'cuantas', 'dotacion', 'profesionales hay', 'personas')) {
    return out(`En ${lugar}${sufijoArea} hay ${n0(t.dotacion)} profesionales con ${n0(t.horasSem)} horas semanales contratadas.`, { enlaces: [{ label: 'Ver profesionales', to: `/planificacion${scopeIt ? `?it=${scopeIt}` : ''}` }] });
  }
  if (tiene(q, 'foja', 'ocupacion', 'horas directas')) {
    return out(`El factor de ocupación de jornada asistencial (FOJA) en ${lugar}${sufijoArea} es ${pc(t.foja)}: de cada 100 horas contratadas, ${Math.round((t.foja || 0) * 100)} se dedican a atención directa a pacientes.`, { enlaces: [linkDash] });
  }
  if (tiene(q, 'cumplimiento', 'como va', 'como vamos', 'como esta', 'realizad', 'sic', 'avance')) {
    return out(t.cumplimiento == null ? `Aún no hay datos de atenciones realizadas para ${lugar}${sufijoArea}.` : `En ${lugar}${sufijoArea} se han realizado ${n0(t.sicReal)} atenciones directas, lo que equivale a ${pc(t.cumplimiento)} de la meta de gestión para esos meses. Hay ${dash.alertas.sicTotal} profesionales con alerta de desviación.`,
      { enlaces: [linkDash], sugerencias: ['¿Llegaremos a la meta en diciembre?', '¿Qué profesionales tienen alertas?'] });
  }
  if (tiene(q, 'meta')) {
    return out(`La meta de gestión ${scopeIt ? 'del IT ' + im.get(scopeIt)?.nombre : 'nacional'}${sufijoArea}${d.mes ? ` en ${MESES_L[d.mes - 1]}` : ' para el año'} es de ${n0(t.mgTot)} atenciones (${Math.round(dash.contexto.meta_pct * 100)}% de las ${n0(t.planTot)} planificadas).`, { enlaces: [linkDash] });
  }
  if (tiene(q, 'hora')) {
    return out(`En ${lugar}${sufijoArea} hay ${n0(t.horasSem)} horas semanales contratadas: ${n0(t.dirSem)} en atención directa, ${n0(t.indSem)} en atención indirecta y ${n0(t.nasSem)} en actividades no asistenciales.`, { enlaces: [linkDash] });
  }
  if (tiene(q, 'atencion', 'planific', 'resumen', 'total') || d.it || d.area) {
    return out(`En ${lugar}${sufijoArea}${d.mes ? ` durante ${MESES_L[d.mes - 1]}` : ''} se planifican ${n0(t.planTot)} atenciones (${n0(t.planDir)} directas y ${n0(t.planInd)} indirectas), con una meta de gestión de ${n0(t.mgTot)}. Trabajan ${n0(t.dotacion)} profesionales${t.cumplimiento != null ? ` y el cumplimiento según SIC va en ${pc(t.cumplimiento)}` : ''}.`,
      { enlaces: [linkDash], sugerencias: [`¿Cómo está la cobertura${scopeIt ? ` en ${im.get(scopeIt)?.nombre}` : ''}?`, '¿Llegaremos a la meta en diciembre?'] });
  }
  return out('No estoy seguro de haber entendido. Prueba con alguna de estas preguntas:', { sugerencias: SUGERENCIAS });
}

const SUGERENCIAS = [
  '¿Cómo vamos con la meta este año?',
  '¿Dónde falta capacidad?',
  '¿Llegaremos a la meta en diciembre?',
  '¿Qué cambió en el último reporte de BUK?',
  '¿Cuántos kinesiólogos hay en Santiago?',
  '¿Qué pasa si contratamos 2 fonoaudiólogos en Concepción?',
  '¿Qué profesionales tienen alertas?',
];
