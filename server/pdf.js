// Reportes PDF generados en el servidor (los usa la app y el robot de Blue Prism para distribuir a jefaturas).
import PDFDocument from 'pdfkit';
import { MESES } from './engine.js';

const C = { ink: '#1d2433', muted: '#5b6475', line: '#d9dee8', head: '#0b2a4a', accent: '#d6002a', zebra: '#f4f6fa' };
const fmt = (n, d = 0) => { d = typeof d === 'number' ? d : 0; return n == null || isNaN(n) ? '—' : Number(n).toLocaleString('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d }); };
const pct = (n) => (n == null ? '—' : `${(n * 100).toLocaleString('es-CL', { maximumFractionDigits: 1 })}%`);
const hhmm = (h) => { if (h == null) return '—'; const t = Math.round(h * 60); return `${Math.floor(t / 60).toLocaleString('es-CL')}:${String(t % 60).padStart(2, '0')}`; };

function header(doc, titulo, subtitulo) {
  doc.rect(0, 0, doc.page.width, 64).fill(C.head);
  doc.fillColor('#ffffff').fontSize(16).font('Helvetica-Bold').text(titulo, 36, 18);
  doc.fontSize(9).font('Helvetica').fillColor('#c9d6e8').text(subtitulo, 36, 40);
  doc.rect(doc.page.width - 36 - 90, 22, 90, 20).fill(C.accent);
  doc.fillColor('#fff').fontSize(8).font('Helvetica-Bold').text('CADA HORA CUENTA', doc.page.width - 36 - 90, 28, { width: 90, align: 'center' });
  doc.fillColor(C.ink).font('Helvetica');
  doc.y = 80;
}

function kpis(doc, items) {
  const w = (doc.page.width - 72 - (items.length - 1) * 8) / items.length;
  const y = doc.y;
  items.forEach((k, i) => {
    const x = 36 + i * (w + 8);
    doc.roundedRect(x, y, w, 52, 4).lineWidth(0.7).stroke(C.line);
    doc.fillColor(C.muted).fontSize(7.5).text(k.label.toUpperCase(), x + 8, y + 8, { width: w - 16 });
    doc.fillColor(C.ink).fontSize(15).font('Helvetica-Bold').text(k.value, x + 8, y + 22, { width: w - 16 });
    doc.font('Helvetica');
  });
  doc.y = y + 64;
}

function table(doc, cols, rows, opts = {}) {
  const totalW = doc.page.width - 72;
  const sumW = cols.reduce((a, c) => a + (c.w || 1), 0);
  const widths = cols.map((c) => ((c.w || 1) / sumW) * totalW);
  const rowH = opts.rowH || 15;
  const drawHead = () => {
    const y = doc.y;
    const hh = opts.headH || 26;
    doc.rect(36, y, totalW, hh).fill(C.head);
    let x = 36;
    cols.forEach((c, i) => {
      doc.fillColor('#fff').fontSize(7).font('Helvetica-Bold').text(c.label, x + 3, y + 4, { width: widths[i] - 6, align: c.align || 'left', height: hh - 4 });
      x += widths[i];
    });
    doc.font('Helvetica');
    doc.y = y + hh;
  };
  if (opts.title) { doc.fillColor(C.ink).fontSize(10.5).font('Helvetica-Bold').text(opts.title, 36, doc.y); doc.font('Helvetica'); doc.moveDown(0.3); }
  drawHead();
  rows.forEach((r, ri) => {
    if (doc.y + rowH > doc.page.height - 40) { doc.addPage(); doc.y = 40; drawHead(); }
    const y = doc.y;
    const isTotal = r.__total;
    if (isTotal) doc.rect(36, y, totalW, rowH).fill('#e7ecf4');
    else if (ri % 2) doc.rect(36, y, totalW, rowH).fill(C.zebra);
    let x = 36;
    cols.forEach((c, i) => {
      const v = c.fmt ? c.fmt(r[c.key], r) : r[c.key];
      doc.fillColor(C.ink).fontSize(7.5).font(isTotal ? 'Helvetica-Bold' : 'Helvetica').text(v == null ? '' : String(v), x + 3, y + 4, { width: widths[i] - 6, align: c.align || 'left', lineBreak: false, ellipsis: true });
      x += widths[i];
    });
    doc.y = y + rowH;
  });
  doc.font('Helvetica');
  doc.moveDown(0.8);
}

function footer(doc, usuario) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.fillColor(C.muted).fontSize(7).text(`Generado ${new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' })} · ${usuario} · Datos ficticios Botathon 2026 · Página ${i + 1} de ${range.count}`,
      36, doc.page.height - 28, { width: doc.page.width - 72, align: 'center', lineBreak: false });
  }
}

export function pdfDashboard(res, data, { titulo, subtitulo, usuario }) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36, bufferPages: true, info: { Title: titulo, Author: 'Cada hora cuenta' } });
  doc.pipe(res);
  header(doc, titulo, subtitulo);
  const t = data.total;
  kpis(doc, [
    { label: 'Dotación (personas)', value: fmt(t.dotacion) },
    { label: 'Horas semanales', value: fmt(t.horasSem) },
    { label: 'Atenciones planificadas', value: fmt(t.planTot) },
    { label: `Meta gestión (${Math.round(data.contexto.meta_pct * 100)}%)`, value: fmt(t.mgTot) },
    { label: '% FOJA', value: pct(t.foja) },
    { label: 'Cumplimiento SIC', value: t.cumplimiento == null ? 'sin datos' : pct(t.cumplimiento) },
  ]);
  const rows = data.porInst.map((x) => ({ ...x }));
  rows.push({ __total: true, nombre: 'Total general', ...t });
  table(doc, [
    { key: 'nombre', label: 'Instituto', w: 1.6 },
    { key: 'dotacion', label: 'Dotación', align: 'right', fmt: fmt, w: 0.8 },
    { key: 'horasSem', label: 'Suma horas semanales', align: 'right', fmt: fmt },
    { key: 'dirSem', label: 'Tiempo (h/sem) atención directa', align: 'right', fmt: hhmm },
    { key: 'indSem', label: 'Tiempo (h/sem) atención indirecta', align: 'right', fmt: hhmm },
    { key: 'nasSem', label: 'Tiempo (h/sem) no asistencial NAS', align: 'right', fmt: hhmm },
    { key: 'planDir', label: 'Atención anual directa (grupal e indiv.)', align: 'right', fmt: fmt },
    { key: 'planInd', label: 'Atención anual indirecta', align: 'right', fmt: fmt },
    { key: 'planTot', label: 'Total atenciones planificadas', align: 'right', fmt: fmt },
    { key: 'mgTot', label: `Meta gestión ${Math.round(data.contexto.meta_pct * 100)}%`, align: 'right', fmt: fmt },
    { key: 'foja', label: '% FOJA', align: 'right', fmt: pct, w: 0.7 },
  ], rows, { title: 'Planificación por instituto', headH: 30 });

  if (doc.y > doc.page.height - 200) doc.addPage(), (doc.y = 40);
  table(doc, [
    { key: 'key', label: 'Área / especialidad', w: 1.2 },
    { key: 'dotacion', label: 'Dotación', align: 'right', fmt },
    { key: 'horasSem', label: 'Horas sem.', align: 'right', fmt },
    { key: 'planDir', label: 'At. directas', align: 'right', fmt },
    { key: 'planInd', label: 'At. indirectas', align: 'right', fmt },
    { key: 'planTot', label: 'Total', align: 'right', fmt },
    { key: 'mgTot', label: 'Meta gestión', align: 'right', fmt },
    { key: 'foja', label: '% FOJA', align: 'right', fmt: pct },
    { key: 'cumplimiento', label: 'Cumpl. SIC', align: 'right', fmt: pct },
  ], data.porArea, { title: 'Resumen por área' });

  if (doc.y > doc.page.height - 160) doc.addPage(), (doc.y = 40);
  table(doc, [
    { key: 'nombre', label: 'Mes', w: 0.7 },
    { key: 'horasSem', label: 'Horas sem. contratadas', align: 'right', fmt },
    { key: 'planDir', label: 'At. directas plan', align: 'right', fmt },
    { key: 'planInd', label: 'At. indirectas plan', align: 'right', fmt },
    { key: 'mgTot', label: 'Meta gestión', align: 'right', fmt },
    { key: 'sic', label: 'Directas realizadas (SIC)', align: 'right', fmt },
    { key: 'foja', label: '% FOJA', align: 'right', fmt: pct },
  ], data.porMes.filter((m) => m.seleccionado), { title: 'Proyección mensual' });

  if (data.alertas.sic.length) {
    if (doc.y > doc.page.height - 160) doc.addPage(), (doc.y = 40);
    table(doc, [
      { key: 'persona_id', label: 'Profesional', w: 0.8 },
      { key: 'instituto', label: 'Instituto' },
      { key: 'cargo', label: 'Cargo', w: 1.6 },
      { key: 'plan', label: 'Plan directas', align: 'right', fmt },
      { key: 'real', label: 'Realizadas SIC', align: 'right', fmt },
      { key: 'cumpl', label: 'Cumpl. vs meta', align: 'right', fmt: pct },
      { key: 'tipo', label: 'Alerta', fmt: (v) => (v === 'bajo' ? 'Bajo meta' : 'Sobre plan') },
    ], data.alertas.sic.slice(0, 25), { title: `Alertas de desviación plan vs. realizado (${data.alertas.sicTotal})` });
  }
  footer(doc, usuario);
  doc.end();
}

export function pdfPlanificacion(res, filas, { titulo, subtitulo, usuario }) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36, bufferPages: true, info: { Title: titulo } });
  doc.pipe(res);
  header(doc, titulo, subtitulo);
  table(doc, [
    { key: 'persona_id', label: 'ID prof.', w: 0.7 },
    { key: 'codigo', label: 'IT', w: 0.5 },
    { key: 'cargo', label: 'Cargo', w: 2 },
    { key: 'tipo_contrato', label: 'Contrato', w: 0.8 },
    { key: 'horas', label: 'H/sem', align: 'right', fmt, w: 0.55 },
    { key: 'X', label: 'Prom. pond.', align: 'right', fmt, w: 0.6 },
    { key: 'pDir', label: '% Dir', align: 'right', fmt: pct, w: 0.55 },
    { key: 'pNas', label: '% NAS', align: 'right', fmt: pct, w: 0.55 },
    { key: 'asig', label: 'Asig. h', align: 'right', fmt: (v) => fmt(v, 2), w: 0.55 },
    { key: 'rateDir', label: 'At. dir/sem', align: 'right', fmt: (v) => fmt(v, 1), w: 0.65 },
    { key: 'planDir', label: 'Plan directas', align: 'right', fmt, w: 0.75 },
    { key: 'planTot', label: 'Plan total', align: 'right', fmt, w: 0.7 },
    { key: 'mgTot', label: 'Meta 90%', align: 'right', fmt, w: 0.7 },
    { key: 'foja', label: 'FOJA', align: 'right', fmt: pct, w: 0.55 },
    { key: 'cumplimiento', label: 'Cumpl. SIC', align: 'right', fmt: pct, w: 0.65 },
  ], filas, { rowH: 14 });
  footer(doc, usuario);
  doc.end();
}

export function pdfFicha(res, fila, calc, extra, { usuario, instituto }) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36, bufferPages: true });
  doc.pipe(res);
  header(doc, `Planificación individual · Profesional #${fila.persona_id}`, `${fila.cargo} · ${instituto} · ${fila.tipo_contrato || ''} · Tramo ${calc.tramo.toUpperCase()} (prom. ponderado ${calc.X} h)`);
  kpis(doc, [
    { label: 'Atenciones directas año', value: fmt(calc.total.planDir) },
    { label: 'Atenciones totales año', value: fmt(calc.total.planTot) },
    { label: 'Meta gestión', value: fmt(calc.total.mgTot) },
    { label: '% Directo / Indirecto / NAS', value: `${pct(calc.pDir)} / ${pct(calc.pInd)} / ${pct(calc.pNas)}` },
    { label: 'Asignaciones especiales', value: `${fmt(calc.asigTotal, 2)} h/sem` },
  ]);
  const rows = MESES.map((m, i) => ({ mes: m, horas: calc.horas[i], semhab: calc.semhab[i], rateDir: calc.rateDirT[i], rateInd: calc.rateInd[i], planDir: calc.planDir[i], planInd: calc.planInd[i], mgDir: calc.mgDir[i], mgTot: calc.mgTot[i], sic: extra.sic[i], foja: calc.foja[i] }));
  rows.push({ __total: true, mes: 'Total', planDir: calc.total.planDir, planInd: calc.total.planInd, mgDir: calc.total.mgDir, mgTot: calc.total.mgTot, sic: extra.sic.some((x) => x != null) ? extra.sic.reduce((a, b) => a + (b || 0), 0) : null });
  table(doc, [
    { key: 'mes', label: 'Mes', w: 0.6 }, { key: 'horas', label: 'H/sem', align: 'right', fmt },
    { key: 'semhab', label: 'Semanas hábiles', align: 'right', fmt: (v) => fmt(v, 2) },
    { key: 'rateDir', label: 'At. directas/sem', align: 'right', fmt: (v) => fmt(v, 2) }, { key: 'rateInd', label: 'At. indirectas/sem', align: 'right', fmt },
    { key: 'planDir', label: 'Plan directas', align: 'right', fmt }, { key: 'planInd', label: 'Plan indirectas', align: 'right', fmt },
    { key: 'mgDir', label: 'Meta directas', align: 'right', fmt }, { key: 'mgTot', label: 'Meta total', align: 'right', fmt },
    { key: 'sic', label: 'Realizadas SIC', align: 'right', fmt }, { key: 'foja', label: '% FOJA', align: 'right', fmt: pct },
  ], rows, { title: 'Detalle mensual' });
  footer(doc, usuario);
  doc.end();
}
