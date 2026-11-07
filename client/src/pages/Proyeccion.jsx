import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ResponsiveContainer, ComposedChart, Line, Area, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ReferenceLine } from 'recharts';
import { api, qs } from '../api.js';
import { Page } from '../App.jsx';
import Filters, { useFilters } from '../components/Filters.jsx';
import { Panel, Kpi, useAsync, Loading } from '../components/ui.jsx';
import { EstadoProy } from './Cobertura.jsx';
import { fmt, pct, MESES_L, AREAS } from '../util.js';
import { speak } from './Dashboard.jsx';

export default function Proyeccion() {
  const { query } = useFilters();
  const nav = useNavigate();
  const q = { ...query, meses: '' };
  const { data, error } = useAsync(() => api.get(`/insights/proyeccion${qs(q)}`), [JSON.stringify(q)]);
  const n = data?.nacional;
  const sinDatos = data && n.estado === 'sin_datos';
  const frase = n && !sinDatos ? (n.pct >= 1
    ? `Al ritmo actual, se cerrará el año con ${pct(n.pct, 0)} de la meta de atenciones directas.`
    : `Al ritmo actual, se llegará solo al ${pct(n.pct, 0)} de la meta: faltarían ${fmt(n.metaAnual - n.proyectado)} atenciones directas.`) : '';
  return (
    <Page title="Proyección a diciembre" sub="Con lo realizado según SIC, ¿llegaremos a la meta de gestión?">
      <Filters />
      {!data ? <Loading error={error} /> : sinDatos ? (
        <div className="notice">Todavía no hay atenciones realizadas (SIC) para este filtro. Cuando el robot cargue el reporte SIC aparecerá la proyección.</div>
      ) : (
        <>
          <section className="hero" aria-labelledby="pr-t">
            <div>
              <h2 id="pr-t">{frase}</h2>
              <p>Se ha realizado el {pct(n.ritmo, 0)} de lo planificado entre enero y {MESES_L[n.ultimoMesReal - 1].toLowerCase()}. La proyección aplica ese mismo ritmo a lo planificado para los meses que faltan.</p>
              <button className="btn sm" style={{ marginTop: 10 }} onClick={() => speak(`${frase} ${data.resumen.riesgo + data.resumen.no_cumple} institutos requieren atención.`)}>🔊 Escuchar</button>
            </div>
            <div className="side-stats">
              <div><b>{data.resumen.cumple}</b><span>institutos cumplirán</span></div>
              <div><b>{data.resumen.riesgo + data.resumen.no_cumple}</b><span>en riesgo o bajo meta</span></div>
            </div>
          </section>
          <div className="kpis">
            <Kpi label={`Directas realizadas (ene–${MESES_L[n.ultimoMesReal - 1].slice(0, 3).toLowerCase()})`} value={fmt(n.real)} hint={`${pct(n.mgYtd ? n.real / n.mgYtd : null, 0)} de la meta a la fecha`} />
            <Kpi label="Ritmo de ejecución" value={pct(n.ritmo, 0)} hint="Realizado / planificado" bar={Math.min(1, n.ritmo || 0)} />
            <Kpi label="Proyección a diciembre" value={fmt(n.proyectado)} hint={`Meta anual ${fmt(n.metaAnual)}`} />
            <Kpi meta label="Cumplimiento proyectado" value={pct(n.pct, 0)} bar={Math.min(1, n.pct || 0)} />
            <Kpi label="Necesarias por mes para la meta" value={fmt(n.necesarioMes)} hint={`Al ritmo actual: ${fmt(n.ritmoMes)} por mes`} />
          </div>
          <Panel title="Atenciones directas acumuladas" subtitle="Realizado (SIC), proyección al ritmo actual y meta de gestión">
            <div style={{ height: 300 }}>
              <ResponsiveContainer>
                <ComposedChart data={n.serie} margin={{ top: 24, right: 16, left: 6 }}>
                  <CartesianGrid stroke="#f0dfe1" vertical={false} />
                  <XAxis dataKey="nombre" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v) => fmt(v / 1000) + 'k'} tick={{ fontSize: 12 }} width={48} />
                  <Tooltip formatter={(v, nm) => [fmt(v), nm]} />
                  <Legend wrapperStyle={{ fontSize: 13 }} />
                  <Area dataKey="planAcum" name="Planificado acumulado" fill="#ffd9dc" stroke="#d98a92" fillOpacity={0.6} />
                  <Line dataKey="metaAcum" name="Meta de gestión acumulada" stroke="#160307" strokeDasharray="5 4" dot={false} strokeWidth={2} />
                  <Line dataKey="realAcum" name="Realizado (SIC)" stroke="#e12d39" strokeWidth={3} dot={{ r: 3 }} connectNulls={false} />
                  <Line dataKey="proyAcum" name="Proyección" stroke="#e12d39" strokeDasharray="2 4" strokeWidth={3} dot={false} connectNulls />
                  <ReferenceLine x={n.serie[n.ultimoMesReal - 1]?.nombre} stroke="#52afd4" label={{ value: 'hoy', fill: '#52afd4', fontSize: 12, position: 'top' }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <div className="grid g2">
            <Panel title="Por instituto" subtitle="Ordenado de menor a mayor cumplimiento proyectado" bodyClass="">
              <div className="tablewrap"><table className="t">
                <thead><tr><th>Instituto</th><th className="n">Ritmo</th><th className="n">Proyección</th><th className="n">Meta anual</th><th>Cierre</th></tr></thead>
                <tbody>{data.porInst.map((x) => (
                  <tr key={x.it} className="clickable" tabIndex={0} onClick={() => nav(`/proyeccion?it=${x.it}`)} onKeyDown={(e) => e.key === 'Enter' && nav(`/proyeccion?it=${x.it}`)}>
                    <td><b>{x.nombre}</b></td><td className="n">{pct(x.ritmo, 0)}</td><td className="n">{fmt(x.proyectado)}</td><td className="n">{fmt(x.metaAnual)}</td><td><EstadoProy e={x.estado} p={x.pct} /></td>
                  </tr>))}</tbody>
              </table></div>
            </Panel>
            <Panel title="Por área" bodyClass="">
              <div className="tablewrap"><table className="t">
                <thead><tr><th>Área</th><th className="n">Ritmo</th><th className="n">Proyección</th><th className="n">Meta anual</th><th>Cierre</th></tr></thead>
                <tbody>{data.porArea.map((x) => (
                  <tr key={x.area}><td>{AREAS[x.area] || x.area}</td><td className="n">{pct(x.ritmo, 0)}</td><td className="n">{fmt(x.proyectado)}</td><td className="n">{fmt(x.metaAnual)}</td><td><EstadoProy e={x.estado} p={x.pct} /></td></tr>))}</tbody>
              </table></div>
            </Panel>
          </div>
          <Panel title="Profesionales con riesgo de no llegar a su meta" subtitle="Alerta temprana para conversar con la jefatura antes de fin de año" bodyClass="">
            <div className="tablewrap"><table className="t">
              <thead><tr><th>Profesional</th><th>Instituto</th><th>Cargo</th><th className="n">Ritmo</th><th className="n">Proyección</th><th className="n">Meta anual</th><th>Cierre</th></tr></thead>
              <tbody>{data.profesionales.map((x) => (
                <tr key={x.fila_id} className="clickable" tabIndex={0} onClick={() => nav(`/profesional/${x.fila_id}`)} onKeyDown={(e) => e.key === 'Enter' && nav(`/profesional/${x.fila_id}`)}>
                  <td><b>#{x.persona_id}</b></td><td>{x.instituto}</td><td className="small">{x.cargo.toLowerCase()}</td><td className="n">{pct(x.ritmo, 0)}</td><td className="n">{fmt(x.proyectado)}</td><td className="n">{fmt(x.metaAnual)}</td><td><EstadoProy e={x.estado} p={x.pct} /></td>
                </tr>))}
                {!data.profesionales.length && <tr><td colSpan={7} className="muted">Ningún profesional en riesgo con este filtro.</td></tr>}</tbody>
            </table></div>
          </Panel>
        </>
      )}
    </Page>
  );
}
