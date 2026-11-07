import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { api, download } from '../api.js';
import { Page, useApp } from '../App.jsx';
import { Panel, Kpi, Badge, TipoCambio, useAsync, Loading, MotivoModal, Modal, useToast } from '../components/ui.jsx';
import { fmt, pct, MESES, fecha, signed, AREAS } from '../util.js';

export default function Ficha() {
  const { id } = useParams();
  const { data, error, reload } = useAsync(() => api.get(`/filas/${id}`), [id]);
  const toast = useToast();
  return (
    <Page title={data ? `Profesional #${data.fila.persona_id}` : 'Profesional'} sub={data ? `${data.fila.cargo} · IT ${data.fila.instituto}` : ''}
      tools={<><Link className="btn" to="/planificacion">Volver al listado</Link>{data && <button className="btn" onClick={() => download(`/reportes/ficha/${id}.pdf`, `ficha_${data.fila.persona_id}.pdf`).catch((e) => toast(e.message, true))}>Descargar PDF</button>}</>}>
      {!data ? <Loading error={error} /> : <FichaView d={data} reload={reload} />}
    </Page>
  );
}

export function FichaView({ d, reload, readOnly }) {
  const { has } = useApp();
  const toast = useToast();
  const { fila: f, calc: c } = d;
  const [edit, setEdit] = useState(null);
  const [asig, setAsig] = useState(false);
  const canEdit = !readOnly && has('editar_fila');
  const sicTot = d.sic.reduce((a, b) => a + (b || 0), 0);
  const mesesSic = d.sic.map((v, i) => (v != null ? i : -1)).filter((i) => i >= 0);
  const metaSic = mesesSic.reduce((a, i) => a + c.mgDir[i], 0);
  const ref = 11;
  const chart = MESES.map((m, i) => ({ m, plan: c.planDir[i], meta: c.mgDir[i], sic: d.sic[i], horas: c.horas[i] }));
  const save = async (motivo) => {
    try { await api.put(`/filas/${f.id}`, { ...edit, motivo }); toast('Cambio guardado y planificación recalculada'); reload(); }
    catch (e) { toast(e.message, true); throw e; }
  };
  const editable = (campo, i, val) => canEdit && !c.congelado[i] ? (
    <button className="btn sm ghost" style={{ padding: '0 4px' }} onClick={() => setEdit({ campo, mes: i + 1, valor: val, label: `${campo === 'lic' ? 'Licencia' : campo === 'vac' ? 'Vacaciones' : 'Permisos'} · ${MESES[i]}` })} aria-label={`Editar ${campo} de ${MESES[i]}`}>{fmt(val, 2)}</button>
  ) : fmt(val, 2);
  return (
    <>
      <div className="row">
        <Badge tone="navy">{AREAS[f.cod_esp] || f.cod_esp}</Badge>
        <Badge>{f.tipo_contrato}</Badge>
        <Badge tone={f.tipo_trabajador === 'Reemplazo' ? 'dir' : ''}>{f.tipo_trabajador}</Badge>
        <Badge>Tramo {d.tramoLabel} (prom. ponderado {c.X} h)</Badge>
        {f.excepcion && <Badge tone="navy">Multi-instituto</Badge>}
        {f.vacante && <Badge>Vacante</Badge>}
        {f.licencia_extensa && <Badge tone="warn">Licencia extensa</Badge>}
        {c.congelado.some(Boolean) && <Badge tone="warn" title="Meses anteriores a un cambio quedan cerrados con su planificación original">Meses cerrados: {c.congelado.filter(Boolean).length}</Badge>}
        <span className="muted small">Vigencia {f.periodo_inicio} a {f.periodo_fin} · Origen: {f.origen}</span>
      </div>
      {c.alertas.length > 0 && <div className="notice warn" role="alert">{c.alertas.map((a) => <div key={a}>⚠ {a}</div>)}</div>}

      <div className="kpis">
        <Kpi label="Atenciones directas en el año" value={fmt(c.total.planDir)} hint={`${fmt(c.rateDirT[ref], 1)} por semana`} />
        <Kpi label="Atenciones totales" value={fmt(c.total.planTot)} hint={`${fmt(c.total.planInd)} indirectas`} />
        <Kpi meta label="Meta de gestión" value={fmt(c.total.mgTot)} hint={`${fmt(c.total.mgDir)} directas`} />
        <Kpi label="% FOJA" value={pct(c.total.horasContrMes ? c.total.horasDirMes / c.total.horasContrMes : null)} hint="Horas directas / contratadas" />
        <Kpi label="Realizado SIC" value={mesesSic.length ? fmt(sicTot) : 'Sin datos'} hint={mesesSic.length ? `${pct(metaSic ? sicTot / metaSic : null)} de la meta (${mesesSic.length} meses)` : ''} />
      </div>

      <div className="grid g-wide">
        <Panel title="Mes a mes" subtitle="Planificado vs. meta vs. realizado (directas)">
          <div style={{ height: 250 }}>
            <ResponsiveContainer>
              <ComposedChart data={chart}>
                <CartesianGrid stroke="#edf0f4" vertical={false} />
                <XAxis dataKey="m" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 12 }} width={36} />
                <Tooltip /><Legend wrapperStyle={{ fontSize: 13 }} />
                <Bar dataKey="plan" name="Planificadas" fill="#e12d39" />
                <Line dataKey="meta" name="Meta" stroke="#160307" strokeDasharray="5 4" dot={false} />
                <Line dataKey="sic" name="Realizadas SIC" stroke="#1f7a4d" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Cómo se calcula" subtitle={`Semana tipo de diciembre (${fmt(c.horas[ref])} h contratadas)`}>
          <Calculo c={c} />
        </Panel>
      </div>

      <Panel title="Detalle mensual" subtitle={canEdit ? 'Haz clic en licencias, vacaciones o permisos para ajustarlos (queda registrado con motivo).' : 'Semanas hábiles descontando licencias, vacaciones, permisos y beneficios.'} bodyClass="">
        <div className="tablewrap">
          <table className="t">
            <thead><tr><th>Concepto</th>{MESES.map((m) => <th key={m} className="n">{m}</th>)}<th className="n">Año</th></tr></thead>
            <tbody>
              <tr><td>Horas semanales</td>{c.horas.map((h, i) => <td key={i} className="n">{fmt(h)}</td>)}<td className="n">{fmt(c.X)}*</td></tr>
              <tr><td>Semanas calendario</td>{c.baseSem.map((h, i) => <td key={i} className="n">{fmt(h, 2)}</td>)}<td /></tr>
              <tr><td>− Licencias</td>{f.lic.map((h, i) => <td key={i} className="n">{editable('lic', i, h)}</td>)}<td /></tr>
              <tr><td>− Vacaciones</td>{f.vac.map((h, i) => <td key={i} className="n">{editable('vac', i, h)}</td>)}<td /></tr>
              <tr><td>− Permisos</td>{f.perm.map((h, i) => <td key={i} className="n">{editable('perm', i, h)}</td>)}<td /></tr>
              <tr><td>− Otros (beneficios, feriados)</td>{f.otros.map((h, i) => <td key={i} className="n">{fmt(h, 2)}</td>)}<td /></tr>
              <tr><td><b>= Semanas hábiles</b></td>{c.semhab.map((h, i) => <td key={i} className="n"><b>{fmt(h, 2)}</b></td>)}<td className="n">{fmt(c.total.semhab, 1)}</td></tr>
              <tr><td>Atenciones directas / semana</td>{c.rateDirT.map((h, i) => <td key={i} className="n">{fmt(h, 1)}</td>)}<td /></tr>
              <tr><td>Atenciones indirectas / semana</td>{c.rateInd.map((h, i) => <td key={i} className="n">{fmt(h)}</td>)}<td /></tr>
              <tr><td><b>Plan directas</b></td>{c.planDir.map((h, i) => <td key={i} className="n" title={c.congelado[i] ? 'Mes cerrado' : ''}><b>{fmt(h)}</b>{c.congelado[i] ? ' 🔒' : ''}</td>)}<td className="n"><b>{fmt(c.total.planDir)}</b></td></tr>
              <tr><td>Plan indirectas</td>{c.planInd.map((h, i) => <td key={i} className="n">{fmt(h)}</td>)}<td className="n">{fmt(c.total.planInd)}</td></tr>
              <tr><td style={{ color: 'var(--red)' }}>Meta gestión (total)</td>{c.mgTot.map((h, i) => <td key={i} className="n">{fmt(h)}</td>)}<td className="n">{fmt(c.total.mgTot)}</td></tr>
              <tr><td>Realizadas SIC (directas)</td>{d.sic.map((h, i) => <td key={i} className="n">{h == null ? '—' : <span style={{ color: h < c.mgDir[i] ? 'var(--red)' : 'var(--ok)' }}>{fmt(h)}</span>}</td>)}<td className="n">{mesesSic.length ? fmt(sicTot) : '—'}</td></tr>
              <tr><td>% FOJA</td>{c.foja.map((h, i) => <td key={i} className="n">{pct(h, 0)}</td>)}<td /></tr>
              {d.esperado && <tr><td className="muted">Excel original (total)</td>{d.esperado.tot.map((h, i) => <td key={i} className="n muted" style={{ color: h !== c.planTot[i] ? 'var(--red)' : undefined }}>{fmt(h)}</td>)}<td className="n muted">{fmt(d.esperado.tot.reduce((a, b) => a + b, 0))}</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ padding: '6px 16px' }}>* Promedio ponderado de horas semanales del período de vigencia; define el tramo de jornada. 🔒 = mes cerrado: un cambio posterior no altera lo ya planificado.</p>
      </Panel>

      <div className="grid g2">
        <Panel title="Asignaciones especiales" subtitle={`${fmt(c.asigTotal, 2)} h/sem descontadas`} right={!readOnly && has('solicitar_asig') && <button className="btn sm primary" onClick={() => setAsig(true)}>Solicitar asignación</button>}>
          {!d.asignaciones.length ? <p className="muted">Sin asignaciones especiales.</p> : (
            <table className="t"><thead><tr><th>Asignación</th><th className="n">H/sem</th><th>Estado</th><th>Resuelto por</th></tr></thead>
              <tbody>{d.asignaciones.map((a) => <tr key={a.id}><td>{a.nombre}</td><td className="n">{fmt(a.horas, 2)}</td><td><Badge tone={{ aprobada: 'ok', pendiente: 'warn', rechazada: 'red', revocada: 'red' }[a.estado]}>{a.estado}</Badge></td><td className="small muted">{a.resuelto_por || '—'}</td></tr>)}</tbody>
            </table>
          )}
          {(d.otrasFilas.length > 0 || d.titular || d.reemplazos.length > 0) && (
            <div style={{ marginTop: 12 }}>
              {d.otrasFilas.length > 0 && <p className="small"><b>Otras filas de esta persona:</b> {d.otrasFilas.map((o) => <Link key={o.id} to={`/profesional/${o.id}`} style={{ marginRight: 8 }}>{o.instituto} · {o.cargo.toLowerCase()} ({o.periodo_inicio?.slice(5)}→{o.periodo_fin?.slice(5)})</Link>)}</p>}
              {d.titular && <p className="small"><b>Reemplaza a:</b> <Link to={`/profesional/${d.titular.id}`}>#{d.titular.persona_id}</Link></p>}
              {d.reemplazos.length > 0 && <p className="small"><b>Reemplazado por:</b> {d.reemplazos.map((r) => <Link key={r.id} to={`/profesional/${r.id}`}>#{r.persona_id} </Link>)}</p>}
            </div>
          )}
        </Panel>
        <Panel title="Historial de cambios" subtitle="Quién cambió qué, cuándo y por qué">
          {!d.cambios.length ? <p className="muted">Sin cambios desde la carga inicial.</p> : (
            <ul className="timeline">
              {d.cambios.map((x) => (
                <li key={x.id}><time>{fecha(x.fecha)}<br />rige {x.vigencia_desde || '—'}</time>
                  <div><TipoCambio tipo={x.tipo} /> {x.campo}: <b>{x.valor_anterior ?? '—'}</b> → <b>{x.valor_nuevo ?? '—'}</b>
                    {x.impacto != null && <span className={x.impacto >= 0 ? 'diff-pos' : 'diff-neg'}> {signed(x.impacto)} atenciones/año</span>}
                    <div className="muted small">{x.usuario} · {x.motivo}</div></div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {edit && (
        <MotivoModal title={`Ajustar ${edit.label}`} onClose={() => setEdit(null)} onConfirm={save}>
          <div className="field"><label htmlFor="v">Semanas</label><input id="v" type="number" step="0.05" min="0" max="5" value={edit.valor} onChange={(e) => setEdit({ ...edit, valor: e.target.value })} /></div>
        </MotivoModal>
      )}
      {asig && <SolicitarAsignacion fila={f} onClose={() => setAsig(false)} onDone={() => { reload(); }} />}
    </>
  );
}

function Calculo({ c }) {
  const i = 11;
  const steps = [
    ['Horas contratadas', `${fmt(c.horas[i])} h`],
    ['− Colación en contrato', `${fmt(c.colacion, 2)} h`],
    [`− No asistencial (${pct(c.pNas, 0)} de ${c.X} h)`, `${fmt(c.nasSem, 2)} h`, `pausa saludable ${fmt(c.pausa, 2)} · beneficio colación ${fmt(c.beneficio, 2)} · otras ${fmt(c.otrasNas, 2)}`],
    ['− Asignaciones especiales', `${fmt(c.asigTotal, 2)} h`],
    ['= Disponible para atención', `${fmt(c.disp[i], 2)} h`],
    [`Directa ${pct(c.pDir / (c.pDir + c.pInd), 0)} ÷ ${c.stdDir} min`, `${fmt(c.dirH[i], 2)} h → ${fmt(c.rateDir[i])} at/sem`],
    [`Indirecta ÷ ${c.stdInd} min`, `${fmt(c.indH[i], 2)} h → ${fmt(c.rateInd[i])} at/sem`],
  ];
  if (c.factorGrupal > 1) steps.push([`Atención grupal (${pct(c.gPct, 0)} × ${c.gPac} pacientes)`, `× ${fmt(c.factorGrupal, 2)} = ${fmt(c.rateDirT[i], 1)} at/sem`]);
  steps.push(['× semanas hábiles del mes', `${fmt(c.semhab[i], 2)} → ${fmt(c.planTot[i])} atenciones`]);
  return (
    <dl className="dl" style={{ gridTemplateColumns: '1fr auto' }}>
      {steps.map(([a, b, n]) => <React.Fragment key={a}><dt>{a}{n && <div className="small" style={{ fontSize: '.75rem' }}>{n}</div>}</dt><dd className="num" style={{ textAlign: 'right' }}>{b}</dd></React.Fragment>)}
    </dl>
  );
}

export function SolicitarAsignacion({ fila, onClose, onDone }) {
  const { cat, refreshPend } = useApp();
  const toast = useToast();
  const [nombre, setNombre] = useState('');
  const [horas, setHoras] = useState('');
  const item = cat?.asignaciones.find((a) => a.nombre === nombre);
  return (
    <MotivoModal title={`Solicitar asignación · #${fila.persona_id}`} confirmLabel="Enviar solicitud" onClose={onClose}
      onConfirm={async (motivo) => {
        try {
          const a = await api.post('/asignaciones', { fila_id: fila.id, nombre, horas: horas || item?.horas, motivo });
          toast(a.estado === 'pendiente' ? 'Solicitud enviada a Dirección Médica Nacional para autorización' : 'Asignación aprobada automáticamente y planificación recalculada');
          refreshPend(); onDone();
        } catch (e) { toast(e.message, true); throw e; }
      }}>
      <div className="field"><label htmlFor="an">Asignación</label>
        <select id="an" value={nombre} onChange={(e) => { setNombre(e.target.value); setHoras(''); }} required>
          <option value="">Selecciona…</option>
          {cat?.asignaciones.map((a) => <option key={a.nombre} value={a.nombre}>{a.nombre}{a.horas ? ` (${a.horas} h)` : ''}{a.requiere_autorizacion ? ' · requiere DMN' : ''}</option>)}
        </select>
      </div>
      <div className="field" style={{ marginTop: 8 }}><label htmlFor="ah">Horas semanales</label><input id="ah" type="number" step="0.25" min="0.25" value={horas || item?.horas || ''} onChange={(e) => setHoras(e.target.value)} required /></div>
      {item?.requiere_autorizacion && <p className="notice warn small">Esta asignación requiere autorización de la Dirección Médica Nacional. No afecta la planificación hasta ser aprobada.</p>}
      <p className="small muted">Regla: máximo 2 asignaciones para profesionales con más de 30 h semanales.</p>
    </MotivoModal>
  );
}
