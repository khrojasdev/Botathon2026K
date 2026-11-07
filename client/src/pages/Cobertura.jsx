import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, qs } from '../api.js';
import { Page, useApp } from '../App.jsx';
import { useFilters } from '../components/Filters.jsx';
import { Panel, Kpi, Badge, useAsync, Loading, MotivoModal, useToast } from '../components/ui.jsx';
import MapaChile from '../components/MapaChile.jsx';
import { fmt, pct, signed, MESES_L } from '../util.js';

const VERDE = '#2e7d5b', AMBAR = '#d99a2b', ROJO = '#e12d39', GRIS = '#c9c1c2';
const METRICAS = {
  intensidad: { label: 'Atenciones por niño/a', fmt: (v) => fmt(v, 1), color: (v, o) => (v == null ? GRIS : v >= o ? VERDE : v >= o * 0.9 ? AMBAR : ROJO), get: (x) => x.intensidad },
  proyeccion: { label: 'Proyección a diciembre', fmt: (v) => pct(v, 0), color: (v) => (v == null ? GRIS : v >= 1 ? VERDE : v >= 0.95 ? AMBAR : ROJO), get: (x) => x.proyeccion.pct },
  cumplimiento: { label: 'Cumplimiento SIC a la fecha', fmt: (v) => pct(v, 0), color: (v) => (v == null ? GRIS : v >= 1 ? VERDE : v >= 0.9 ? AMBAR : ROJO), get: (x) => x.cumplimiento },
  foja: { label: '% FOJA', fmt: (v) => pct(v, 0), color: (v) => (v == null ? GRIS : v >= 0.5 ? VERDE : v >= 0.45 ? AMBAR : ROJO), get: (x) => x.foja },
};

export default function Cobertura() {
  const { query } = useFilters();
  const { has } = useApp();
  const toast = useToast();
  const nav = useNavigate();
  const { data, error, reload } = useAsync(() => api.get(`/insights/cobertura${qs(query)}`), [JSON.stringify(query)]);
  const [metrica, setMetrica] = useState('intensidad');
  const [sel, setSel] = useState(null);
  const [edit, setEdit] = useState(null);
  const M = METRICAS[metrica];
  const items = useMemo(() => {
    if (!data) return [];
    const maxPac = Math.max(...data.institutos.map((x) => x.pacientes || 0), 1);
    return data.institutos.map((x) => {
      const v = M.get(x);
      return { ...x, valor: v, color: M.color(v, data.objetivo), tamano: 5 + Math.sqrt((x.pacientes || maxPac * 0.05) / maxPac) * 16, etiqueta: v == null ? 'sin dato' : M.fmt(v) };
    });
  }, [data, metrica]);
  const det = items.find((x) => x.it === sel);
  return (
    <Page title="Cobertura y mapa" sub="¿Cuántas atenciones recibe cada niño, niña y joven? ¿Dónde falta capacidad?">
      {!data ? <Loading error={error} /> : (
        <>
          <section className="hero" aria-labelledby="cob-t">
            <div>
              <h2 id="cob-t">Cada niño, niña o joven recibirá en promedio {fmt(data.nacional.intensidad, 1)} atenciones este año.</h2>
              <p>
                Son {fmt(data.nacional.atenciones)} atenciones (meta de gestión y laboratorio de órtesis y prótesis) para {fmt(data.nacional.pacientes)} pacientes proyectados.
                {data.nacional.faltantes > 0 && <> Para llegar a {fmt(data.objetivo, 0)} por paciente en todos los institutos faltan {fmt(data.nacional.faltantes)} atenciones, equivalentes a unos {fmt(data.nacional.fte42, 0)} profesionales de 42 h.</>}
              </p>
            </div>
            <div className="side-stats">
              <div><b>{fmt(data.nacional.pacientes)}</b><span>pacientes proyectados</span></div>
              <div><b>{fmt(data.objetivo, 0)}</b><span>atenciones objetivo por paciente</span></div>
            </div>
          </section>

          <div className="grid g-wide">
            <Panel title="Mapa de institutos" subtitle="El tamaño del punto es la cantidad de pacientes. Haz clic en un instituto."
              right={<div className="row" role="group" aria-label="Indicador del mapa">{Object.entries(METRICAS).map(([k, m]) => <button key={k} className="btn sm" aria-pressed={metrica === k} onClick={() => setMetrica(k)}>{m.label}</button>)}</div>}>
              <MapaChile items={items} seleccionado={sel} onSelect={setSel} titulo={`Mapa: ${M.label} por instituto`} />
              <div className="row small" style={{ justifyContent: 'center', marginTop: 8 }}>
                <span><i className="dot" style={{ background: VERDE }} />{metrica === 'intensidad' ? `≥ ${data.objetivo} por paciente` : 'Sobre la meta'}</span>
                <span><i className="dot" style={{ background: AMBAR }} />Cerca</span>
                <span><i className="dot" style={{ background: ROJO }} />{metrica === 'intensidad' ? 'Brecha de cobertura' : 'Bajo la meta'}</span>
                <span><i className="dot" style={{ background: GRIS }} />Sin dato</span>
              </div>
            </Panel>
            <div className="grid" style={{ alignContent: 'start' }}>
              {det ? <DetalleInstituto x={det} objetivo={data.objetivo} onVer={() => nav(`/?it=${det.it}`)} /> : (
                <Panel title="Elige un instituto"><p className="muted">Haz clic en un punto del mapa o en una fila de la tabla para ver su detalle y simular contrataciones.</p></Panel>
              )}
              <Simulador institutos={data.institutos} cargos={data.cargos} it={sel} />
            </div>
          </div>

          <Panel title="Brecha de cobertura por instituto" subtitle={`Atenciones por paciente vs. objetivo de ${data.objetivo} (editable en Reglas y parámetros)`} bodyClass="">
            <div className="tablewrap"><table className="t">
              <thead><tr><th>Instituto</th><th className="n">Pacientes proyectados</th><th className="n">Atenciones (meta + LOP)</th><th className="n">Por paciente</th><th style={{ minWidth: 160 }}>vs. objetivo</th><th className="n">Atenciones faltantes</th><th className="n">Profesionales 42 h equiv.</th><th>Cierre de año</th></tr></thead>
              <tbody>
                {items.map((x) => (
                  <tr key={x.it} className={`clickable ${sel === x.it ? 'sel' : ''}`} tabIndex={0} onClick={() => setSel(x.it)} onKeyDown={(e) => e.key === 'Enter' && setSel(x.it)}>
                    <td><b>{x.nombre}</b> <span className="muted small">{x.zona}</span></td>
                    <td className="n">{x.pacientes == null ? <span className="muted">sin dato</span> : fmt(x.pacientes)}
                      {has('parametros') && <button className="btn sm ghost" onClick={(e) => { e.stopPropagation(); setEdit({ it: x.it, nombre: x.nombre, pacientes: x.pacientes || '' }); }} aria-label={`Editar pacientes de ${x.nombre}`}>✎</button>}</td>
                    <td className="n">{fmt(x.atenciones)}</td>
                    <td className="n"><b style={{ color: METRICAS.intensidad.color(x.intensidad, data.objetivo) }}>{fmt(x.intensidad, 1)}</b></td>
                    <td>{x.intensidad != null && <Barra v={x.intensidad} obj={data.objetivo} />}</td>
                    <td className="n">{x.faltantes ? fmt(x.faltantes) : x.pacientes ? <Badge tone="ok">sin brecha</Badge> : '—'}</td>
                    <td className="n">{x.fte42 ? fmt(x.fte42, 1) : '—'}</td>
                    <td><EstadoProy e={x.proyeccion.estado} p={x.proyeccion.pct} /></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <p className="small muted" style={{ padding: '8px 16px' }}>Pacientes únicos proyectados y atenciones LOP tomados de la hoja «Planificación Total» del Excel. Profesionales equivalentes = atenciones faltantes / rendimiento promedio del instituto por hora semanal × 42 h.</p>
          </Panel>
          {edit && (
            <MotivoModal title={`Pacientes proyectados · ${edit.nombre}`} onClose={() => setEdit(null)}
              onConfirm={async (motivo) => { try { await api.put('/insights/pacientes', { it: edit.it, pacientes: edit.pacientes, motivo }); toast('Pacientes actualizados'); reload(); } catch (e) { toast(e.message, true); throw e; } }}>
              <div className="field"><label htmlFor="pp">Pacientes únicos proyectados en el año</label><input id="pp" type="number" min="1" value={edit.pacientes} onChange={(e) => setEdit({ ...edit, pacientes: e.target.value })} /></div>
            </MotivoModal>
          )}
        </>
      )}
    </Page>
  );
}

function Barra({ v, obj }) {
  const max = Math.max(obj * 1.6, v);
  return (
    <div style={{ position: 'relative', height: 12, background: 'var(--nas-soft)', borderRadius: 99 }} aria-hidden="true">
      <div style={{ width: `${(v / max) * 100}%`, height: '100%', borderRadius: 99, background: METRICAS.intensidad.color(v, obj) }} />
      <div style={{ position: 'absolute', left: `${(obj / max) * 100}%`, top: -3, bottom: -3, width: 2, background: '#4d4346' }} title={`Objetivo ${obj}`} />
    </div>
  );
}

export function EstadoProy({ e, p }) {
  if (e === 'sin_datos' || p == null) return <span className="muted small">sin datos SIC</span>;
  const map = { cumple: ['ok', 'Cumplirá'], riesgo: ['warn', 'En riesgo'], no_cumple: ['red', 'No cumplirá'] };
  const [t, l] = map[e];
  return <Badge tone={t}>{l} · {pct(p, e === 'cumple' ? 0 : 1)}</Badge>;
}

function DetalleInstituto({ x, objetivo, onVer }) {
  return (
    <Panel title={x.nombre} subtitle={x.zona} right={<button className="btn sm" onClick={onVer}>Ver en el resumen</button>}>
      <dl className="dl">
        <dt>Profesionales</dt><dd>{fmt(x.dotacion)} · {fmt(x.horasSem)} h/sem</dd>
        <dt>Pacientes proyectados</dt><dd>{x.pacientes == null ? 'sin dato' : fmt(x.pacientes)}</dd>
        <dt>Atenciones al año</dt><dd>{fmt(x.atenciones)}</dd>
        <dt>Por paciente</dt><dd style={{ color: METRICAS.intensidad.color(x.intensidad, objetivo) }}>{fmt(x.intensidad, 1)} (objetivo {objetivo})</dd>
        <dt>Brecha</dt><dd>{x.faltantes ? `${fmt(x.faltantes)} atenciones ≈ ${fmt(x.fte42, 1)} profesionales 42 h` : x.pacientes ? 'Sin brecha' : '—'}</dd>
        <dt>% FOJA</dt><dd>{pct(x.foja)}</dd>
        <dt>Cumplimiento SIC</dt><dd>{x.cumplimiento == null ? 'sin datos' : pct(x.cumplimiento)}</dd>
        <dt>Cierre de año</dt><dd><EstadoProy e={x.proyeccion.estado} p={x.proyeccion.pct} /></dd>
      </dl>
    </Panel>
  );
}

function Simulador({ institutos, cargos, it }) {
  const toast = useToast();
  const [f, setF] = useState({ it: '', cargo: 'KINESIOLOGO', horas: 42, cantidad: 1, desde_mes: 8 });
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const itSel = f.it || it || '';
  const simular = async (e) => {
    e.preventDefault(); setBusy(true);
    try { setRes(await api.post('/insights/simular', { ...f, it: itSel })); } catch (x) { toast(x.message, true); } finally { setBusy(false); }
  };
  return (
    <Panel title="¿Y si contratamos?" subtitle="Simula el efecto de sumar profesionales (no modifica la planificación)">
      <form onSubmit={simular} className="grid g2" style={{ gap: 10 }}>
        <div className="field"><label htmlFor="s-it">Instituto</label>
          <select id="s-it" value={itSel} onChange={(e) => { setF({ ...f, it: e.target.value }); setRes(null); }} required>
            <option value="">Elige…</option>{institutos.map((x) => <option key={x.it} value={x.it}>{x.nombre}</option>)}
          </select></div>
        <div className="field"><label htmlFor="s-c">Cargo</label>
          <select id="s-c" value={f.cargo} onChange={(e) => setF({ ...f, cargo: e.target.value })}>{cargos.map((c) => <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>)}</select></div>
        <div className="field"><label htmlFor="s-n">Cantidad</label><input id="s-n" type="number" min="1" max="50" value={f.cantidad} onChange={(e) => setF({ ...f, cantidad: e.target.value })} /></div>
        <div className="field"><label htmlFor="s-h">Horas semanales</label><input id="s-h" type="number" min="1" max="44" value={f.horas} onChange={(e) => setF({ ...f, horas: e.target.value })} /></div>
        <div className="field"><label htmlFor="s-m">Desde</label>
          <select id="s-m" value={f.desde_mes} onChange={(e) => setF({ ...f, desde_mes: e.target.value })}>{MESES_L.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></div>
        <div style={{ alignSelf: 'end' }}><button className="btn primary" disabled={busy || !itSel}>{busy ? 'Calculando…' : 'Simular'}</button></div>
      </form>
      {res && (
        <div className="notice" style={{ marginTop: 12 }} aria-live="polite">
          <b>+{fmt(res.extraAtenciones)} atenciones planificadas</b> en el año ({fmt(res.porProfesional.rateDir, 0)} directas por semana cada uno).
          <div style={{ marginTop: 6 }}>Atenciones por paciente: <b>{fmt(res.antes.intensidad, 1)} → {fmt(res.despues.intensidad, 1)}</b>
            {res.antes.faltantes != null && <> · brecha: {fmt(res.antes.faltantes)} → <b>{fmt(res.despues.faltantes)}</b> ({signed(res.despues.faltantes - res.antes.faltantes)})</>}</div>
        </div>
      )}
    </Panel>
  );
}
