export const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const MESES_L = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
export const fmt = (n, d = 0) => (n == null || isNaN(n) ? '—' : Number(n).toLocaleString('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const pct = (n, d = 1) => (n == null || isNaN(n) ? '—' : `${(n * 100).toLocaleString('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d })}%`);
export const hhmm = (h) => { if (h == null) return '—'; const t = Math.round(h * 60); return `${Math.floor(t / 60).toLocaleString('es-CL')}:${String(t % 60).padStart(2, '0')}`; };
export const signed = (n) => (n == null ? '—' : `${n > 0 ? '+' : ''}${fmt(n)}`);
export const fecha = (s) => (s ? new Date(s).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Santiago' }) : '—');
export const ROLES = { admin: 'Planificación central', planificador: 'Planificador/a', dmn: 'Dirección Médica Nacional', jefatura: 'Jefatura de instituto', profesional: 'Profesional', bot: 'Robot Blue Prism' };
export const AREAS = { FI: 'Fisiatría', KI: 'Kinesiología', TO: 'Terapia ocupacional', FO: 'Fonoaudiología', PC: 'Psicología', AS: 'Servicio social', EN: 'Enfermería', ED: 'Educación', UTAC: 'Terapias artísticas', UEDA: 'Deporte adaptado', ULAB: 'Unidad laboral', UTA: 'Tecnología asistiva', MG: 'Medicina general', NE: 'Neurología', NU: 'Nutrición', PE: 'Pediatría', OD: 'Odontología' };
export const TIPOS_CAMBIO = {
  ALTA: ['Alta', 'ok'], ALTA_REEMPLAZO: ['Alta reemplazo', 'ok'], REINGRESO: ['Reingreso', 'ok'], BAJA: ['Baja', 'red'], TERMINO_CONTRATO: ['Término contrato', 'red'],
  AUMENTO_JORNADA: ['Aumento jornada', 'dir'], DISMINUCION_JORNADA: ['Disminución jornada', 'warn'], CAMBIO_CARGO: ['Cambio de cargo', 'navy'], CAMBIO_INSTITUTO: ['Cambio instituto', 'navy'],
  CAMBIO_CONTRATO: ['Cambio contrato', ''], CAMBIO_DIAS: ['Cambio días', ''], REVISAR_MULTI_INSTITUTO: ['Revisar multi-IT', 'warn'], REVISAR_PLAN: ['Revisar plan', 'warn'],
  AJUSTE_MANUAL: ['Ajuste manual', ''], PARAMETRO: ['Parámetro', 'navy'], ASIGNACION_SOLICITADA: ['Asignación solicitada', 'warn'], ASIGNACION_APROBADA: ['Asignación aprobada', 'ok'],
  ASIGNACION_RECHAZADA: ['Asignación rechazada', 'red'], ASIGNACION_REVOCADA: ['Asignación revocada', 'red'],
};
