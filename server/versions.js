import { state, results, saveVersion, loadVersionSnapshot, saveFila, saveAsignacion, saveParamGeneral, saveCargo, saveGrupal, saveCalendario, invalidate, audit, persist } from './store.js';
import { resumenGlobal } from './analytics.js';

export async function makeVersion(user, nombre, motivo, keepInMemory = false) {
  const { res } = results();
  const snapshot = {
    filas: state.filas.map(({ asignaciones, ...f }) => f),
    asignaciones: state.asignaciones,
    params: state.params, cargos: state.cargos, grupal: state.grupal, calendario: state.calendario,
  };
  const v = {
    id: state.seq.version++, nombre, estado: 'borrador', usuario: user?.email || 'sistema', motivo: motivo || null,
    creado: new Date().toISOString(), aprobado_por: null, aprobado: null, resumen: resumenGlobal(res),
  };
  state.versiones.unshift(v);
  await saveVersion({ ...v, snapshot });
  // en modo memoria guardamos el snapshot en el objeto
  v.snapshot = snapshot;
  if (!keepInMemory && process.env.DATABASE_URL) delete v.snapshot;
  return v;
}

export function compararResumen(a, b) {
  const map = new Map(b.porInst.map((x) => [x.it, x]));
  const porInst = a.porInst.map((x) => {
    const y = map.get(x.it) || {};
    return { it: x.it, nombre: x.nombre, actual: x.planTot, version: y.planTot ?? 0, delta: x.planTot - (y.planTot ?? 0), mgActual: x.mgTot, mgVersion: y.mgTot ?? 0, horasActual: x.horasSem, horasVersion: y.horasSem ?? 0 };
  });
  return {
    total: { actual: a.total.planTot, version: b.total.planTot, delta: a.total.planTot - b.total.planTot, mgActual: a.total.mgTot, mgVersion: b.total.mgTot, horasActual: a.total.horasSem, horasVersion: b.total.horasSem, dotActual: a.total.dotacion, dotVersion: b.total.dotacion },
    porInst,
  };
}

export async function restaurarVersion(user, id, motivo) {
  const snap = await loadVersionSnapshot(id);
  if (!snap) throw new Error('Versión sin respaldo disponible');
  await makeVersion(user, `Respaldo automático antes de restaurar v${id}`, motivo);
  state.filas = snap.filas.map((f) => ({ ...f }));
  state.asignaciones = snap.asignaciones.map((a) => ({ ...a }));
  state.params = { ...snap.params };
  state.cargos = snap.cargos; state.grupal = snap.grupal; state.calendario = snap.calendario;
  invalidate();
  await persist('delete from filas_plan');
  await persist('delete from asignaciones');
  for (const f of state.filas) await saveFila(f);
  for (const a of state.asignaciones) await saveAsignacion(a);
  await saveParamGeneral();
  for (const c of state.cargos) await saveCargo(c);
  for (const g of state.grupal) await saveGrupal(g);
  for (const c of state.calendario) await saveCalendario(c);
  await audit(user, 'restaurar_version', 'version', id, {}, motivo);
}
