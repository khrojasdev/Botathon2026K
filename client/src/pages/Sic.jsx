import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, Cell, CartesianGrid } from 'recharts';
import { api, qs } from '../api.js';
import { Page, useApp } from '../App.jsx';
import Filters, { useFilters } from '../components/Filters.jsx';
import { Panel, Kpi, Badge, useAsync, Loading } from '../components/ui.jsx';
import { fmt, pct } from '../util.js';

export default function Sic() {
  const { query } = useFilters();
  const { has } = useApp();
  const nav = useNavigate();
  const q = { meses: '1,2,3,4,5,6,7', ...query };
  const { data, error } = useAsync(() => api.get(`/dashboard${qs(q)}`), [JSON.stringify(q)]);
  const t = data?.total;
  const sinDatos = data && t.cumplimiento == null;
  return (
    <Page title="Plan vs. realizado" sub="Contraste de lo planificado con las atenciones registradas en SIC">
      <Filters />
      {!data ? <Loading error={error} /> : sinDatos ? (
        <div className="notice">Aún no hay atenciones realizadas para este filtro. {has('ingesta') ? <>Carga el reporte SIC en <Link to="/ingestas">Reportes BUK / SIC</Link> o deja que el robot de Blue Prism lo procese.</> : 'El equipo de planificación debe cargar el reporte SIC.'}</div>
      ) : (
        <>
          <div className="kpis">
            <Kpi label="Directas planificadas (meses con SIC)" value={fmt(t.sicPlan)} />
            <Kpi meta label="Meta de gestión del período" value={fmt(t.sicMeta)} />
            <Kpi label="Directas realizadas (SIC)" value={fmt(t.sicReal)} />
            <Kpi label="Cumplimiento vs. meta" value={pct(t.cumplimiento)} bar={t.cumplimiento} hint={t.cumplimiento >= 1 ? 'Sobre la meta' : 'Bajo la meta'} />
            <Kpi label="Profesionales con alerta" value={fmt(data.alertas.sicTotal)} hint={`Umbral ±${pct(0.15, 0)} configurable en Parámetros`} />
          </div>
          <Panel title="Cumplimiento por instituto" subtitle="Atenciones directas realizadas / meta de gestión (100% = meta cumplida)">
            <div style={{ height: 300 }}>
              <ResponsiveContainer>
                <BarChart data={data.porInst.filter((x) => x.cumplimiento != null)} margin={{ top: 10, right: 10 }}>
                  <CartesianGrid stroke="#edf0f4" vertical={false} />
                  <XAxis dataKey="codigo" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v) => pct(v, 0)} domain={[0, 'auto']} tick={{ fontSize: 12 }} width={48} />
                  <Tooltip formatter={(v) => pct(v)} labelFormatter={(l) => data.porInst.find((x) => x.codigo === l)?.nombre} />
                  <ReferenceLine y={1} stroke="#160307" strokeDasharray="4 4" label={{ value: 'Meta', fill: '#160307', fontSize: 12, position: 'right' }} />
                  <Bar dataKey="cumplimiento" name="Cumplimiento">
                    {data.porInst.filter((x) => x.cumplimiento != null).map((x) => <Cell key={x.it} fill={x.cumplimiento >= 1 ? '#1f7a4d' : x.cumplimiento >= 0.9 ? '#e8a33d' : '#e12d39'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel title="Profesionales con desviación" subtitle="Bajo la meta en más del umbral, o sobre lo planificado (posible sub-planificación)" bodyClass="">
            <div className="tablewrap">
              <table className="t">
                <thead><tr><th>Profesional</th><th>Instituto</th><th>Cargo</th><th className="n">Plan directas</th><th className="n">Realizadas</th><th className="n">Desviación</th><th className="n">vs. meta</th><th>Alerta</th></tr></thead>
                <tbody>
                  {data.alertas.sic.map((a) => (
                    <tr key={a.fila_id} className="clickable" tabIndex={0} onClick={() => nav(`/profesional/${a.fila_id}`)} onKeyDown={(e) => e.key === 'Enter' && nav(`/profesional/${a.fila_id}`)}>
                      <td><b>#{a.persona_id}</b></td><td>{a.instituto}</td><td>{a.cargo.toLowerCase()}</td>
                      <td className="n">{fmt(a.plan)}</td><td className="n">{fmt(a.real)}</td>
                      <td className="n"><span className={a.desv >= 0 ? 'diff-pos' : 'diff-neg'}>{pct(a.desv)}</span></td>
                      <td className="n">{pct(a.cumpl)}</td>
                      <td><Badge tone={a.tipo === 'bajo' ? 'red' : 'warn'}>{a.tipo === 'bajo' ? 'Bajo la meta' : 'Sobre lo planificado'}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.alertas.sicTotal > data.alertas.sic.length && <p className="small muted" style={{ padding: '8px 16px' }}>Se muestran las {data.alertas.sic.length} de mayor desviación de {data.alertas.sicTotal}. Usa los filtros para acotar.</p>}
          </Panel>
        </>
      )}
    </Page>
  );
}
