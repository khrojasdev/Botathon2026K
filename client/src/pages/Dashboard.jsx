import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, BarChart, Cell } from 'recharts';
import { api, download, qs } from '../api.js';
import { Page, useApp } from '../App.jsx';
import Filters, { useFilters } from '../components/Filters.jsx';
import { Panel, Kpi, HourBar, useAsync, Loading, Badge, SortTh, sortRows, useToast } from '../components/ui.jsx';
import { fmt, pct, hhmm, fecha, AREAS } from '../util.js';
import { Txt } from '../facil.jsx';

export function speak(text) {
  if (!('speechSynthesis' in window)) return false;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'es-CL'; u.rate = 1;
  window.speechSynthesis.speak(u);
  return true;
}

export default function Dashboard() {
  const { f, set, query } = useFilters();
  const { user } = useApp();
  const toast = useToast();
  const nav = useNavigate();
  const { data, loading, error } = useAsync(() => api.get(`/dashboard${qs(query)}`), [JSON.stringify(query)]);
  const [sort, setSort] = useState({ key: 'it', dir: 'asc' });
  const [busy, setBusy] = useState('');
  const dl = async (kind) => {
    setBusy(kind);
    try {
      if (kind === 'pdf') await download(`/reportes/dashboard.pdf${qs(query)}`, 'planificacion_2026.pdf');
      else await download(`/export/planificacion.xlsx${qs(query)}`, 'planificacion_2026.xlsx');
    } catch (e) { toast(e.message, true); } finally { setBusy(''); }
  };
  const tools = (
    <>
      <button className="btn" onClick={() => dl('pdf')} disabled={!!busy}>{busy === 'pdf' ? 'Generando…' : 'Descargar PDF'}</button>
      <button className="btn" onClick={() => dl('xlsx')} disabled={!!busy}>{busy === 'xlsx' ? 'Generando…' : 'Descargar Excel'}</button>
    </>
  );
  const scope = f.it && data ? data.porInst[0]?.nombre : user.rol === 'jefatura' ? data?.porInst[0]?.nombre : 'Nacional';
  return (
    <Page title={`Resumen ${scope ? (scope === 'Nacional' ? 'nacional' : `· IT ${scope}`) : ''}`} sub="Planificación de capacidad asistencial 2026" tools={tools}>
      <Filters />
      {!data ? <Loading error={error} /> : <DashboardBody data={data} loading={loading} sort={sort} setSort={setSort} set={set} nav={nav} query={query} />}
    </Page>
  );
}

function DashboardBody({ data, loading, sort, setSort, set, nav }) {
  const t = data.total;
  const meta = data.contexto.meta_pct;
  const dPct = t.horasSem ? t.dirSem / t.horasSem : 0;
  const iPct = t.horasSem ? t.indSem / t.horasSem : 0;
  const resumen = `De cada 100 horas contratadas, ${Math.round(dPct * 100)} llegan a atención directa a pacientes, ${Math.round(iPct * 100)} van a registros e informes y ${100 - Math.round(dPct * 100) - Math.round(iPct * 100)} a tareas no asistenciales.`;
  const leer = () => speak(`${resumen} Hay ${t.dotacion} profesionales con ${fmt(t.horasSem)} horas semanales. Se planifican ${fmt(t.planTot)} atenciones y la meta de gestión es ${fmt(t.mgTot)}. El factor de ocupación de jornada asistencial es ${pct(t.foja)}. ${data.alertas.sicTotal} profesionales tienen alertas de desviación respecto de lo realizado.`);
  const insts = sortRows(data.porInst, sort);
  return (
    <div className="grid" style={{ opacity: loading ? 0.6 : 1 }} aria-busy={loading}>
      <section className="hero" aria-labelledby="hero-t">
        <div>
          <h2 id="hero-t">De cada 100 horas contratadas, {Math.round(dPct * 100)} llegan a atención directa.</h2>
          <p>Otras {Math.round(iPct * 100)} se usan en registros e informes y {100 - Math.round(dPct * 100) - Math.round(iPct * 100)} en tareas no asistenciales. Semana tipo de {data.porMes.filter((m) => m.seleccionado).slice(-1)[0]?.nombre}.</p>
          <button className="btn sm" style={{ marginTop: 10 }} onClick={leer} aria-label="Escuchar el resumen en voz alta">🔊 Escuchar resumen</button>
        </div>
        <div className="side-stats">
          <div><b>{fmt(t.dotacion)}</b><span>profesionales</span></div>
          <div><b>{fmt(t.horasSem)}</b><span>horas por semana</span></div>
        </div>
        <div className="week">
          <div className="bigbar" role="img" aria-label={resumen}>
            <div style={{ width: `${dPct * 100}%`, background: 'var(--dir)' }}>{hhmm(t.dirSem)} h directa</div>
            <div style={{ width: `${iPct * 100}%`, background: 'var(--ind)' }}>{hhmm(t.indSem)} h</div>
            <div style={{ flex: 1, background: 'var(--nas)' }}>{hhmm(t.nasSem)} h no asistencial</div>
          </div>
          <div className="legend">
            <span><i className="dot" style={{ background: 'var(--dir)' }} />Atención directa (individual y grupal)</span>
            <span><i className="dot" style={{ background: 'var(--ind)' }} />Atención indirecta (registros, informes)</span>
            <span><i className="dot" style={{ background: 'var(--nas)' }} />No asistencial: pausas, colación, coordinación, asignaciones especiales</span>
          </div>
        </div>
      </section>

      <div className="kpis" aria-label="Indicadores">
        <Kpi label={<Txt t="Atenciones planificadas" f="Atenciones que haremos este año" />} value={fmt(t.planTot)} hint={`${fmt(t.planDir)} directas · ${fmt(t.planInd)} indirectas`} />
        <Kpi meta label={<Txt t={`Meta de gestión asistencial (${Math.round(meta * 100)}%)`} f="Lo mínimo que debemos cumplir" />} value={fmt(t.mgTot)} hint={<Txt t={`Directas ${fmt(t.mgDir)} · piso mínimo`} f={`Es el ${Math.round(meta * 100)}% de lo planificado`} />} />
        <Kpi label={<Txt t="% FOJA" f="Tiempo con pacientes (FOJA)" />} value={pct(t.foja)} hint={<Txt t="Horas directas / horas contratadas" f="Indicador oficial: horas directas sobre horas de contrato" />} bar={t.foja} />
        <Kpi label={<Txt t="Cumplimiento vs. meta (SIC)" f="Cuánto llevamos de la meta" />} value={t.cumplimiento == null ? 'Sin datos' : pct(t.cumplimiento)} hint={t.cumplimiento == null ? 'Carga el reporte SIC' : `${fmt(t.sicReal)} directas realizadas`} bar={t.cumplimiento} />
        <Kpi label={<Txt t="Alertas" f="Casos que necesitan apoyo" />} value={fmt(data.alertas.sicTotal + data.alertas.reglas)} hint={`${data.alertas.sicTotal} desviación SIC · ${data.alertas.reglas} reglas`} />
      </div>

      <Panel title="Proyección mensual" subtitle="Atenciones planificadas, meta de gestión y realizado según SIC" id="p-mes">
        <div style={{ height: 290 }}>
          <ResponsiveContainer>
            <ComposedChart data={data.porMes} margin={{ top: 10, right: 10, left: 6, bottom: 0 }}>
              <CartesianGrid stroke="#eeeaeb" vertical={false} />
              <XAxis dataKey="nombre" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => fmt(v / 1000) + 'k'} tick={{ fontSize: 12 }} width={44} />
              <Tooltip formatter={(v, n) => [fmt(v), n]} />
              <Legend wrapperStyle={{ fontSize: 13 }} />
              <Bar dataKey="planDir" name="Directas planificadas" stackId="a" fill="#e12d39">
                {data.porMes.map((m) => <Cell key={m.mes} fillOpacity={m.seleccionado ? 1 : 0.3} />)}
              </Bar>
              <Bar dataKey="planInd" name="Indirectas planificadas" stackId="a" fill="#f2a0a6">
                {data.porMes.map((m) => <Cell key={m.mes} fillOpacity={m.seleccionado ? 1 : 0.3} />)}
              </Bar>
              <Line dataKey="mgDir" name={`Meta directas (${Math.round(meta * 100)}%)`} stroke="#4d4346" strokeDasharray="5 4" dot={false} strokeWidth={2} />
              <Line dataKey="sic" name="Directas realizadas (SIC)" stroke="#2b2326" strokeWidth={2.5} dot={{ r: 3 }} connectNulls={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="small muted" style={{ margin: '4px 0 0' }}>Enero–abril se planifica con jornada de 44 h y mayo–diciembre con 42 h (Ley 21.561). Febrero refleja vacaciones colectivas.</p>
      </Panel>

      <Panel title="Planificación por instituto" subtitle="Haz clic en un instituto para profundizar" id="p-inst" bodyClass="">
        <div className="tablewrap">
          <table className="t">
            <thead>
              <tr>
                <SortTh k="nombre" sort={sort} setSort={setSort}>Instituto</SortTh>
                <SortTh k="dotacion" sort={sort} setSort={setSort} n>Dotación</SortTh>
                <SortTh k="horasSem" sort={sort} setSort={setSort} n>Horas sem.</SortTh>
                <th style={{ minWidth: 150 }}>Reparto semanal</th>
                <SortTh k="dirSem" sort={sort} setSort={setSort} n cls="tec">H/sem directa</SortTh>
                <SortTh k="indSem" sort={sort} setSort={setSort} n cls="tec">H/sem indirecta</SortTh>
                <SortTh k="nasSem" sort={sort} setSort={setSort} n cls="tec">H/sem NAS</SortTh>
                <SortTh k="planDir" sort={sort} setSort={setSort} n cls="tec">At. directas</SortTh>
                <SortTh k="planInd" sort={sort} setSort={setSort} n cls="tec">At. indirectas</SortTh>
                <SortTh k="planTot" sort={sort} setSort={setSort} n>Total atenciones</SortTh>
                <SortTh k="mgTot" sort={sort} setSort={setSort} n>Meta {Math.round(meta * 100)}%</SortTh>
                <SortTh k="foja" sort={sort} setSort={setSort} n cls="tec">% FOJA</SortTh>
                <SortTh k="cumplimiento" sort={sort} setSort={setSort} n>Cumpl. SIC</SortTh>
              </tr>
            </thead>
            <tbody>
              {insts.map((x) => (
                <tr key={x.it} className="clickable" tabIndex={0} onClick={() => set('it', String(x.it))} onKeyDown={(e) => e.key === 'Enter' && set('it', String(x.it))}>
                  <td><b>{x.nombre}</b> <span className="muted small">{x.zona}</span></td>
                  <td className="n">{fmt(x.dotacion)}</td>
                  <td className="n">{fmt(x.horasSem)}</td>
                  <td><HourBar dir={x.dirSem} ind={x.indSem} total={x.horasSem} /></td>
                  <td className="n tec">{hhmm(x.dirSem)}</td>
                  <td className="n tec">{hhmm(x.indSem)}</td>
                  <td className="n tec">{hhmm(x.nasSem)}</td>
                  <td className="n tec">{fmt(x.planDir)}</td>
                  <td className="n tec">{fmt(x.planInd)}</td>
                  <td className="n"><b>{fmt(x.planTot)}</b></td>
                  <td className="n" style={{ color: 'var(--red)' }}>{fmt(x.mgTot)}</td>
                  <td className="n tec">{pct(x.foja)}</td>
                  <td className="n">{x.cumplimiento == null ? '—' : <Badge tone={x.cumplimiento >= 1 ? 'ok' : x.cumplimiento >= 0.9 ? 'warn' : 'red'}>{pct(x.cumplimiento)}</Badge>}</td>
                </tr>
              ))}
              <tr className="total">
                <td>Total general</td><td className="n">{fmt(t.dotacion)}</td><td className="n">{fmt(t.horasSem)}</td>
                <td><HourBar dir={t.dirSem} ind={t.indSem} total={t.horasSem} /></td>
                <td className="n tec">{hhmm(t.dirSem)}</td><td className="n tec">{hhmm(t.indSem)}</td><td className="n tec">{hhmm(t.nasSem)}</td>
                <td className="n tec">{fmt(t.planDir)}</td><td className="n tec">{fmt(t.planInd)}</td><td className="n">{fmt(t.planTot)}</td>
                <td className="n">{fmt(t.mgTot)}</td><td className="n tec">{pct(t.foja)}</td><td className="n">{pct(t.cumplimiento)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid g2">
        <Panel title="Por área" subtitle="Atenciones planificadas en el período" id="p-area">
          <div style={{ height: Math.max(220, data.porArea.length * 28) }}>
            <ResponsiveContainer>
              <BarChart data={data.porArea.map((a) => ({ ...a, nombre: AREAS[a.key] || a.key }))} layout="vertical" margin={{ left: 10, right: 20 }}>
                <XAxis type="number" tickFormatter={(v) => fmt(v / 1000) + 'k'} tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="nombre" width={140} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v, n) => [fmt(v), n]} />
                <Bar dataKey="planDir" name="Directas" stackId="a" fill="#e12d39" cursor="pointer" onClick={(d) => set('cod_esp', d.key)} />
                <Bar dataKey="planInd" name="Indirectas" stackId="a" fill="#f2a0a6" cursor="pointer" onClick={(d) => set('cod_esp', d.key)} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Alertas de desviación" subtitle="Realizado SIC vs. meta del período" id="p-alert" right={<Link className="btn sm" to="/sic">Ver todas</Link>}>
          {!data.alertas.sic.length ? (
            <p className="muted">Sin alertas. {data.total.cumplimiento == null ? 'Aún no se ha cargado el reporte SIC de atenciones realizadas.' : 'Todos los profesionales están dentro del rango esperado.'}</p>
          ) : (
            <table className="t">
              <thead><tr><th>Profesional</th><th>Instituto</th><th className="n">Plan</th><th className="n">Real</th><th className="n">Cumpl.</th></tr></thead>
              <tbody>
                {data.alertas.sic.slice(0, 8).map((a) => (
                  <tr key={a.fila_id} className="clickable" onClick={() => nav(`/profesional/${a.fila_id}`)}>
                    <td>#{a.persona_id} <span className="muted small">{a.cargo.toLowerCase()}</span></td>
                    <td>{a.instituto}</td><td className="n">{fmt(a.plan)}</td><td className="n">{fmt(a.real)}</td>
                    <td className="n"><Badge tone={a.tipo === 'bajo' ? 'red' : 'warn'}>{pct(a.cumpl)}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <BotCard ctx={data.contexto} />
        </Panel>
      </div>
    </div>
  );
}

function BotCard({ ctx }) {
  const b = ctx.bot; const ing = ctx.ultimaIngesta; const v = ctx.versionAprobada;
  return (
    <dl className="dl" style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
      <dt>Robot Blue Prism</dt><dd>{b?.ultimo_latido ? <>activo · {fecha(b.ultimo_latido)}</> : <span className="muted">sin ejecuciones aún</span>}</dd>
      <dt>Último reporte</dt><dd>{ing ? <Link to="/ingestas">{ing.tipo} · {ing.archivo} ({fecha(ing.fecha)})</Link> : '—'}</dd>
      <dt>Versión aprobada</dt><dd>{v ? <Link to="/trazabilidad?tab=versiones">{v.nombre}</Link> : '—'}</dd>
    </dl>
  );
}
