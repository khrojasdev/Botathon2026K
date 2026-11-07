import React from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Page } from '../App.jsx';
import { Panel, Kpi, useAsync, Loading, Badge } from '../components/ui.jsx';
import { fmt, pct, signed } from '../util.js';

export default function Validacion() {
  const { data, error } = useAsync(() => api.get('/validacion'), []);
  return (
    <Page title="Validación vs. Excel" sub="El motor reproduce la planificación del Excel actual, celda por celda">
      {!data ? <Loading error={error} /> : (
        <>
          <div className="kpis">
            <Kpi label="Filas idénticas al Excel (12 meses)" value={`${fmt(data.okRows)} / ${fmt(data.rows)}`} bar={data.okRows / data.rows} hint={pct(data.okRows / data.rows)} />
            <Kpi label="Celdas mensuales idénticas" value={pct(data.okCells / data.cells)} bar={data.okCells / data.cells} hint={`${fmt(data.okCells)} de ${fmt(data.cells)} (directas y totales)`} />
            <Kpi label="Atenciones año · Excel" value={fmt(data.sumXl)} />
            <Kpi label="Atenciones año · plataforma" value={fmt(data.sumApp)} hint={`${signed(data.sumApp - data.sumXl)} (${pct((data.sumApp - data.sumXl) / data.sumXl, 2)})`} />
          </div>
          {data.excluidas > 0 && <div className="notice small">{data.excluidas} filas se excluyen de la comparación porque tuvieron cambios posteriores (reportes BUK, asignaciones o ajustes).</div>}
          <Panel title={`Diferencias (${data.difs.length} filas)`} subtitle="Casi todas son valores ingresados a mano en el Excel que no siguen sus propias reglas, o profesionales multi-instituto" bodyClass="">
            <div className="tablewrap"><table className="t">
              <thead><tr><th>Profesional</th><th>Instituto</th><th>Cargo</th><th className="n">Prom. Excel</th><th className="n">Prom. app</th><th>Total mensual Excel → plataforma</th><th className="n">Dif. año</th><th>Causa probable</th></tr></thead>
              <tbody>{data.difs.map((d) => (
                <tr key={d.id}><td><Link to={`/profesional/${d.id}`}>#{d.persona_id}</Link></td><td>{d.instituto}</td><td className="small">{d.cargo.toLowerCase()}</td>
                  <td className="n">{d.X_excel}</td><td className="n">{d.X_app}</td>
                  <td className="small num">{d.excel.map((v, i) => <span key={i} style={{ color: v !== d.app[i] ? 'var(--red)' : 'var(--muted)', marginRight: 6 }}>{v !== d.app[i] ? `${v}→${d.app[i]}` : v}</span>)}</td>
                  <td className="n"><span className={d.dif >= 0 ? 'diff-pos' : 'diff-neg'}>{signed(d.dif)}</span></td><td><Badge tone={d.causa.startsWith('Redondeo') ? '' : 'warn'}>{d.causa}</Badge></td></tr>
              ))}</tbody>
            </table></div>
          </Panel>
        </>
      )}
    </Page>
  );
}
