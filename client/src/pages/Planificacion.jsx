import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, download, qs } from '../api.js';
import { Page } from '../App.jsx';
import Filters, { useFilters } from '../components/Filters.jsx';
import { Panel, useAsync, Loading, Badge, HourBar, useToast } from '../components/ui.jsx';
import { fmt, pct } from '../util.js';

export default function Planificacion() {
  const { query } = useFilters();
  const [q, setQ] = useState('');
  const [alertas, setAlertas] = useState(false);
  const [sort, setSort] = useState({ key: 'it', dir: 'asc' });
  const [page, setPage] = useState(1);
  const toast = useToast();
  const nav = useNavigate();
  const params = { ...query, q, alertas: alertas ? 1 : '', sort: sort.key, dir: sort.dir, page, size: 50 };
  const { data, error, loading } = useAsync(() => api.get(`/planificacion${qs(params)}`), [JSON.stringify(params)]);
  const th = (k, l, n) => (
    <th className={n ? 'n' : ''} aria-sort={sort.key === k ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button className="sort" onClick={() => { setSort({ key: k, dir: sort.key === k && sort.dir === 'desc' ? 'asc' : 'desc' }); setPage(1); }}>{l}{sort.key === k ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</button>
    </th>
  );
  const dl = (u, n) => download(`${u}${qs({ ...query, q, alertas: alertas ? 1 : '' })}`, n).catch((e) => toast(e.message, true));
  const pages = data ? Math.ceil(data.total / data.size) : 1;
  return (
    <Page title="Profesionales" sub="Planificación por profesional, instituto y período de vigencia"
      tools={<><button className="btn" onClick={() => dl('/reportes/planificacion.pdf', 'planificacion_profesionales.pdf')}>Descargar PDF</button><button className="btn" onClick={() => dl('/export/planificacion.xlsx', 'planificacion_2026.xlsx')}>Descargar Excel</button></>}>
      <Filters extra={<>
        <div className="field"><label htmlFor="q">Buscar ID o cargo</label><input id="q" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Ej.: 71558 o kinesiólogo" /></div>
        <label className="row small" style={{ alignSelf: 'center' }}><input type="checkbox" checked={alertas} onChange={(e) => { setAlertas(e.target.checked); setPage(1); }} /> Sólo con alertas</label>
      </>} />
      <Panel title={data ? `${fmt(data.total)} filas de planificación` : 'Profesionales'} subtitle="Una fila por profesional × instituto × período. Haz clic para ver el detalle mensual." bodyClass="">
        {!data ? <Loading error={error} /> : (
          <>
            <div className="tablewrap" style={{ opacity: loading ? 0.6 : 1 }}>
              <table className="t">
                <thead><tr>
                  {th('persona_id', 'ID')}{th('instituto', 'Instituto')}{th('cargo', 'Cargo')}{th('horas', 'H/sem', 1)}{th('X', 'Prom. pond.', 1)}
                  <th>Reparto</th>{th('asig', 'Asig. h', 1)}{th('rateDir', 'At. dir/sem', 1)}{th('planTot', 'Plan total', 1)}{th('mgTot', 'Meta', 1)}{th('foja', 'FOJA', 1)}{th('cumplimiento', 'Cumpl. SIC', 1)}<th>Estado</th>
                </tr></thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id} className="clickable" tabIndex={0} onClick={() => nav(`/profesional/${r.id}`)} onKeyDown={(e) => e.key === 'Enter' && nav(`/profesional/${r.id}`)}>
                      <td><b>#{r.persona_id}</b></td>
                      <td>{r.instituto}</td>
                      <td>{r.cargo.charAt(0) + r.cargo.slice(1).toLowerCase()}<div className="muted small">{r.tipo_contrato}{r.tipo_trabajador !== 'Titular' ? ` · ${r.tipo_trabajador}` : ''}</div></td>
                      <td className="n">{fmt(r.horas)}</td>
                      <td className="n">{fmt(r.X)}</td>
                      <td style={{ minWidth: 110 }}><HourBar dir={r.pDir} ind={r.pInd} total={r.pDir + r.pInd + r.pNas} /></td>
                      <td className="n">{r.asig ? fmt(r.asig, 2) : '—'}</td>
                      <td className="n">{fmt(r.rateDir, 1)}</td>
                      <td className="n"><b>{fmt(r.planTot)}</b></td>
                      <td className="n">{fmt(r.mgTot)}</td>
                      <td className="n">{pct(r.foja)}</td>
                      <td className="n">{r.cumplimiento == null ? '—' : <Badge tone={r.alertaSic === 'bajo' ? 'red' : r.alertaSic === 'sobre' ? 'warn' : 'ok'}>{pct(r.cumplimiento)}</Badge>}</td>
                      <td>
                        <div className="chips">
                          {r.excepcion && <Badge tone="navy" title="Reparte horas entre institutos">Multi-IT</Badge>}
                          {r.vacante && <Badge>Vacante</Badge>}
                          {r.licencia_extensa && <Badge tone="warn">Lic. extensa</Badge>}
                          {r.tipo_trabajador === 'Reemplazo' && <Badge tone="dir">Reemplazo</Badge>}
                          {r.cambios > 0 && <Badge tone="dir" title="Tiene cambios registrados">{r.cambios} cambio{r.cambios > 1 ? 's' : ''}</Badge>}
                          {r.alertas.length > 0 && <Badge tone="red" title={r.alertas.join('\n')}>{r.alertas.length} alerta{r.alertas.length > 1 ? 's' : ''}</Badge>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!data.rows.length && <tr><td colSpan={13} className="muted">No hay profesionales con esos filtros. Prueba quitando alguno.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="row" style={{ padding: 12 }}>
              <span className="muted small">Página {page} de {pages}</span>
              <span className="spacer" />
              <button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button>
              <button className="btn sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Siguiente</button>
            </div>
          </>
        )}
      </Panel>
    </Page>
  );
}
