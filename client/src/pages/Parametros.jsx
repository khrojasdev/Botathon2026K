import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { Page, useApp } from '../App.jsx';
import { Panel, Badge, useAsync, Loading, Modal, useToast } from '../components/ui.jsx';
import { fmt, pct, signed, MESES_L, AREAS } from '../util.js';

const GENERALES = [
  ['meta_pct', 'Meta de gestión (% de la proyección anual)', 'pct'],
  ['tramo1_min', 'Tramo 1: desde (h/sem)', 'n'],
  ['tramo2_min', 'Tramo 2: desde (h/sem)', 'n'],
  ['pausa_pct_alta', 'Pausa saludable con jornada ≥ umbral', 'pct'],
  ['pausa_pct_baja', 'Pausa saludable con jornada < umbral', 'pct'],
  ['pausa_umbral', 'Umbral de pausa saludable (h/sem)', 'n'],
  ['colacion_h_dia', 'Colación en contrato (h/día)', 'n'],
  ['beneficio_colacion_h_dia', 'Beneficio colación (h/día)', 'n'],
  ['max_asignaciones', 'Máximo de asignaciones especiales', 'n'],
  ['max_asignaciones_umbral_h', '…para profesionales con más de (h/sem)', 'n'],
  ['alerta_sic_umbral', 'Umbral de alerta plan vs. SIC', 'pct'],
  ['mes_inicio_proyeccion', 'Mes desde el que se proyecta (descuentos prorrateados)', 'n'],
  ['intensidad_objetivo', 'Objetivo de atenciones por paciente al año (cobertura)', 'n'],
  ['umbral_riesgo_proyeccion', 'Proyección bajo este % de la meta = no cumplirá', 'pct'],
];

export default function Parametros() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') || 'generales';
  const { data, error, reload } = useAsync(() => api.get('/parametros'), []);
  const tabs = [['generales', 'Reglas generales'], ['cargos', 'Distribución por cargo'], ['grupal', 'Atención grupal'], ['asignaciones', 'Asignaciones especiales'], ['calendario', 'Calendario']];
  return (
    <Page title="Reglas y parámetros" sub="Toda la lógica de cálculo se edita aquí, sin tocar código ni fórmulas">
      <div className="tabs" role="tablist">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setSp({ tab: k })}>{l}</button>)}</div>
      {!data ? <Loading error={error} /> : (
        <>
          {tab === 'generales' && <Generales p={data} reload={reload} />}
          {tab === 'cargos' && <Cargos p={data} reload={reload} />}
          {tab === 'grupal' && <Grupal p={data} reload={reload} />}
          {tab === 'asignaciones' && <CatalogoAsig p={data} reload={reload} />}
          {tab === 'calendario' && <Calendario p={data} reload={reload} />}
        </>
      )}
    </Page>
  );
}

/** Modal de cambio con simulación previa de impacto. */
function CambioModal({ title, children, simPayload, onApply, onClose }) {
  const { has } = useApp();
  const toast = useToast();
  const [sim, setSim] = useState(null);
  const [motivo, setMotivo] = useState('');
  const [busy, setBusy] = useState(false);
  const simular = async () => { setBusy(true); try { setSim(await api.post('/simulacion', simPayload())); } catch (e) { toast(e.message, true); } finally { setBusy(false); } };
  return (
    <Modal title={title} onClose={onClose}>
      {children}
      {sim && (
        <div className="notice" style={{ marginTop: 12 }} aria-live="polite">
          <b>Impacto simulado (sin aplicar):</b> atenciones {fmt(sim.actual.planTot)} → {fmt(sim.simulado.planTot)} (<span className={sim.simulado.planTot - sim.actual.planTot >= 0 ? 'diff-pos' : 'diff-neg'}>{signed(sim.simulado.planTot - sim.actual.planTot)}</span>);
          meta {fmt(sim.actual.mgTot)} → {fmt(sim.simulado.mgTot)}; FOJA {pct(sim.actual.foja)} → {pct(sim.simulado.foja)}.
          <div className="small" style={{ marginTop: 6 }}>Institutos más afectados: {sim.porInst.filter((x) => x.delta).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 4).map((x) => `${x.nombre} ${signed(x.delta)}`).join(' · ') || 'ninguno'}</div>
        </div>
      )}
      {has('parametros') && (
        <div className="field" style={{ marginTop: 12 }}><label htmlFor="mot">Motivo del cambio (obligatorio, queda en el historial)</label>
          <textarea id="mot" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: Instrucción DMN memo 45/2026" /></div>
      )}
      <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onClose}>Cancelar</button>
        {has('simular') && simPayload && <button className="btn" onClick={simular} disabled={busy}>Simular impacto</button>}
        {has('parametros') && <button className="btn primary" disabled={busy || motivo.trim().length < 4} onClick={async () => { setBusy(true); try { const r = await onApply(motivo); toast(`Parámetro actualizado${r?.impacto != null ? ` · ${signed(r.impacto)} atenciones` : ''}`); onClose(); } catch (e) { toast(e.message, true); } finally { setBusy(false); } }}>Aplicar cambio</button>}
      </div>
    </Modal>
  );
}

function Generales({ p, reload }) {
  const { has } = useApp();
  const [form, setForm] = useState(null);
  const g = p.general;
  const show = (k, t) => (t === 'pct' ? pct(g[k], 0) : fmt(g[k], 2));
  return (
    <div className="grid g2">
      <Panel title="Reglas generales" right={(has('parametros') || has('simular')) && <button className="btn sm primary" onClick={() => setForm({ ...g })}>Editar / simular</button>}>
        <dl className="dl">{GENERALES.map(([k, l, t]) => <React.Fragment key={k}><dt>{l}</dt><dd>{show(k, t)}</dd></React.Fragment>)}
          <dt>Jornada legal</dt><dd>{g.jornada_legal.map((j) => `${j.horas} h desde ${MESES_L[j.desde_mes - 1].toLowerCase()}`).join(' · ')}</dd>
          <dt>Planificar vacantes</dt><dd>{g.incluir_vacantes ? 'Sí' : 'No (se excluyen)'}</dd>
        </dl>
      </Panel>
      <Panel title="Cómo se usan">
        <ol className="small" style={{ paddingLeft: 18, margin: 0, lineHeight: 1.7 }}>
          <li>Las horas contratadas por mes vienen de BUK según la vigencia del contrato.</li>
          <li>El promedio ponderado del año define el tramo (≥ {g.tramo1_min} h, {g.tramo2_min}–{g.tramo1_min} h, &lt; {g.tramo2_min} h).</li>
          <li>Cargo + tramo entregan el % directo, indirecto y no asistencial.</li>
          <li>Se descuentan colación y asignaciones especiales (máx. {g.max_asignaciones} si supera {g.max_asignaciones_umbral_h} h).</li>
          <li>Las horas disponibles se convierten en atenciones con los minutos estándar del cargo, redondeando hacia abajo, y con factor grupal en Educación, Servicio social, Arte, Deporte y Unidad laboral.</li>
          <li>Se multiplica por las semanas hábiles de cada mes (calendario, feriados regionales, vacaciones, licencias).</li>
          <li>La meta de gestión es el {pct(g.meta_pct, 0)} de la proyección.</li>
        </ol>
      </Panel>
      {form && (
        <CambioModal title="Reglas generales" onClose={() => setForm(null)}
          simPayload={() => ({ general: diff(g, form) })}
          onApply={async (motivo) => { const r = await api.put('/parametros/general', { cambios: diff(g, form), motivo }); reload(); return r; }}>
          <div className="grid g2" style={{ gap: 10 }}>
            {GENERALES.map(([k, l, t]) => (
              <div className="field" key={k}><label htmlFor={`g-${k}`}>{l}</label>
                <input id={`g-${k}`} type="number" step={t === 'pct' ? 1 : 0.05} value={t === 'pct' ? Math.round(form[k] * 1000) / 10 : form[k]}
                  onChange={(e) => setForm({ ...form, [k]: t === 'pct' ? Number(e.target.value) / 100 : Number(e.target.value) })} /></div>
            ))}
            {form.jornada_legal.map((j, i) => (
              <div className="field" key={i}><label htmlFor={`jl-${i}`}>Jornada legal desde {MESES_L[j.desde_mes - 1].toLowerCase()} (h)</label>
                <input id={`jl-${i}`} type="number" value={j.horas} onChange={(e) => setForm({ ...form, jornada_legal: form.jornada_legal.map((x, k) => (k === i ? { ...x, horas: Number(e.target.value) } : x)) })} /></div>
            ))}
            <label className="row small"><input type="checkbox" checked={form.incluir_vacantes} onChange={(e) => setForm({ ...form, incluir_vacantes: e.target.checked })} /> Planificar vacantes</label>
          </div>
        </CambioModal>
      )}
    </div>
  );
}
const diff = (a, b) => Object.fromEntries(Object.entries(b).filter(([k, v]) => JSON.stringify(a[k]) !== JSON.stringify(v)));

function Cargos({ p, reload }) {
  const { has } = useApp();
  const [q, setQ] = useState('');
  const [ed, setEd] = useState(null);
  const rows = p.cargos.filter((c) => !q || c.cargo.toLowerCase().includes(q.toLowerCase()) || (c.cod_esp || '').toLowerCase() === q.toLowerCase());
  const T = ({ t }) => <><td className="n">{pct(t[0], 0)}</td><td className="n">{pct(t[1], 0)}</td><td className="n muted">{pct(t[2], 0)}</td></>;
  return (
    <Panel title="Distribución por cargo y tramo de jornada" subtitle="% directo / indirecto / no asistencial y minutos estándar por atención" bodyClass=""
      right={<div className="row"><input aria-label="Buscar cargo" placeholder="Buscar cargo o área" value={q} onChange={(e) => setQ(e.target.value)} className="field" style={{ border: '1px solid var(--line)', borderRadius: 7, padding: '5px 8px' }} />
        {has('parametros') && <button className="btn sm primary" onClick={() => setEd({ cargo: '', cod_esp: '', unidad: '', std_dir: 40, std_ind: 30, t1: [0.65, 0.1, 0.25], t2: [0.7, 0.1, 0.2], t3: [0.75, 0.1, 0.15], nuevo: true })}>Nuevo cargo</button>}</div>}>
      <div className="tablewrap"><table className="t">
        <thead>
          <tr><th rowSpan={2}>Cargo</th><th rowSpan={2}>Área</th><th rowSpan={2} className="n">Min. directa</th><th rowSpan={2} className="n">Min. indirecta</th><th colSpan={3} style={{ textAlign: 'center' }}>≥ 40 h</th><th colSpan={3} style={{ textAlign: 'center' }}>22 – 40 h</th><th colSpan={3} style={{ textAlign: 'center' }}>&lt; 22 h</th><th rowSpan={2} className="n">Profesionales</th><th rowSpan={2} /></tr>
          <tr>{[0, 1, 2].map((i) => <React.Fragment key={i}><th className="n">Dir</th><th className="n">Ind</th><th className="n">NAS</th></React.Fragment>)}</tr>
        </thead>
        <tbody>{rows.map((c) => (
          <tr key={c.cargo}><td>{c.cargo.toLowerCase()}</td><td>{c.cod_esp && <Badge>{c.cod_esp}</Badge>}</td><td className="n">{c.std_dir}</td><td className="n">{c.std_ind}</td>
            <T t={c.t1} /><T t={c.t2} /><T t={c.t3} /><td className="n">{p.uso_cargos[c.cargo] || '—'}</td>
            <td>{(has('parametros') || has('simular')) && <button className="btn sm" onClick={() => setEd(JSON.parse(JSON.stringify(c)))}>Editar</button>}</td></tr>
        ))}</tbody>
      </table></div>
      {ed && (
        <CambioModal title={ed.nuevo ? 'Nuevo cargo homologado' : `Cargo: ${ed.cargo.toLowerCase()}`} onClose={() => setEd(null)}
          simPayload={() => ({ cargos: [ed] })}
          onApply={async (motivo) => { const r = await api.put('/parametros/cargo', { ...ed, motivo }); reload(); return r; }}>
          {ed.nuevo && <div className="grid g2" style={{ gap: 10 }}>
            <div className="field"><label htmlFor="cn">Nombre del cargo (como viene en BUK)</label><input id="cn" value={ed.cargo} onChange={(e) => setEd({ ...ed, cargo: e.target.value.toUpperCase() })} /></div>
            <div className="field"><label htmlFor="ce">Área</label><select id="ce" value={ed.cod_esp} onChange={(e) => setEd({ ...ed, cod_esp: e.target.value })}><option value="">—</option>{Object.entries(AREAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          </div>}
          <div className="grid g2" style={{ gap: 10, marginTop: 8 }}>
            <div className="field"><label htmlFor="sd">Minutos estándar atención directa</label><select id="sd" value={ed.std_dir} onChange={(e) => setEd({ ...ed, std_dir: Number(e.target.value) })}>{[30, 40, 45, 60].map((m) => <option key={m}>{m}</option>)}</select></div>
            <div className="field"><label htmlFor="si">Minutos estándar atención indirecta</label><input id="si" type="number" value={ed.std_ind} onChange={(e) => setEd({ ...ed, std_ind: Number(e.target.value) })} /></div>
          </div>
          {['t1', 't2', 't3'].map((t, ti) => (
            <fieldset key={t} style={{ border: '1px solid var(--line)', borderRadius: 8, marginTop: 10 }}>
              <legend className="small"><b>Tramo {['≥ 40 h', '22 – 40 h', '< 22 h'][ti]}</b> · suma {pct(ed[t][0] + ed[t][1] + ed[t][2], 0)}</legend>
              <div className="row">{['Directo', 'Indirecto', 'NAS'].map((l, i) => (
                <div className="field" key={l} style={{ minWidth: 90 }}><label htmlFor={`${t}${i}`}>% {l}</label>
                  <input id={`${t}${i}`} type="number" min="0" max="100" value={Math.round(ed[t][i] * 100)} onChange={(e) => { const v = [...ed[t]]; v[i] = Number(e.target.value) / 100; setEd({ ...ed, [t]: v }); }} /></div>
              ))}</div>
            </fieldset>
          ))}
        </CambioModal>
      )}
    </Panel>
  );
}

function Grupal({ p, reload }) {
  const { has } = useApp();
  const [ed, setEd] = useState(null);
  return (
    <Panel title="Atención grupal" subtitle="% de atenciones directas que son grupales y pacientes por grupo (Santiago/Concepción vs. otros institutos)" bodyClass="">
      <table className="t"><thead><tr><th>Área</th><th className="n">% grupal</th><th className="n">Pacientes por grupo · San/Con</th><th className="n">Pacientes por grupo · otros IT</th><th className="n">Factor otros IT</th><th /></tr></thead>
        <tbody>{p.grupal.map((g) => <tr key={g.cod_esp}><td>{AREAS[g.cod_esp] || g.cod_esp} <Badge>{g.cod_esp}</Badge></td><td className="n">{pct(g.pct, 0)}</td><td className="n">{g.pac_sancon}</td><td className="n">{g.pac_otros}</td><td className="n">× {fmt(1 + g.pct * (g.pac_otros - 1), 2)}</td>
          <td>{(has('parametros') || has('simular')) && <button className="btn sm" onClick={() => setEd({ ...g })}>Editar</button>}</td></tr>)}</tbody></table>
      {ed && (
        <CambioModal title={`Atención grupal · ${AREAS[ed.cod_esp] || ed.cod_esp}`} onClose={() => setEd(null)} simPayload={() => ({ grupal: [ed] })}
          onApply={async (motivo) => { await api.put('/parametros/grupal', { ...ed, motivo }); reload(); }}>
          <div className="grid g3" style={{ gap: 10 }}>
            <div className="field"><label htmlFor="gp">% grupal</label><input id="gp" type="number" value={Math.round(ed.pct * 100)} onChange={(e) => setEd({ ...ed, pct: Number(e.target.value) / 100 })} /></div>
            <div className="field"><label htmlFor="gs">Pacientes San/Con</label><input id="gs" type="number" step="0.5" value={ed.pac_sancon} onChange={(e) => setEd({ ...ed, pac_sancon: Number(e.target.value) })} /></div>
            <div className="field"><label htmlFor="go">Pacientes otros IT</label><input id="go" type="number" step="0.5" value={ed.pac_otros} onChange={(e) => setEd({ ...ed, pac_otros: Number(e.target.value) })} /></div>
          </div>
        </CambioModal>
      )}
    </Panel>
  );
}

function CatalogoAsig({ p, reload }) {
  const { has } = useApp();
  const toast = useToast();
  const [ed, setEd] = useState(null);
  const [motivo, setMotivo] = useState('');
  return (
    <Panel title="Catálogo de asignaciones especiales" subtitle="Horas semanales que se descuentan por rol; algunas requieren autorización de DMN" bodyClass=""
      right={has('parametros') && <button className="btn sm primary" onClick={() => setEd({ nombre: '', horas: 1, descripcion: '', requiere_autorizacion: false, nuevo: true })}>Nueva asignación</button>}>
      <div className="tablewrap"><table className="t"><thead><tr><th>Asignación</th><th className="n">H/sem</th><th>Descripción</th><th>Autorización</th><th /></tr></thead>
        <tbody>{p.asignaciones.map((a) => <tr key={a.nombre}><td>{a.nombre}</td><td className="n">{a.horas == null ? 'variable' : fmt(a.horas, 2)}</td><td className="small">{a.descripcion}</td>
          <td>{a.requiere_autorizacion ? <Badge tone="warn">Requiere DMN</Badge> : <Badge tone="ok">Automática</Badge>}</td>
          <td>{has('parametros') && <button className="btn sm" onClick={() => setEd({ ...a })}>Editar</button>}</td></tr>)}</tbody></table></div>
      {ed && (
        <Modal title={ed.nuevo ? 'Nueva asignación especial' : ed.nombre} onClose={() => setEd(null)}>
          {ed.nuevo && <div className="field"><label htmlFor="an">Nombre</label><input id="an" value={ed.nombre} onChange={(e) => setEd({ ...ed, nombre: e.target.value })} /></div>}
          <div className="field" style={{ marginTop: 8 }}><label htmlFor="ah">Horas semanales (vacío = variable)</label><input id="ah" type="number" step="0.25" value={ed.horas ?? ''} onChange={(e) => setEd({ ...ed, horas: e.target.value })} /></div>
          <div className="field" style={{ marginTop: 8 }}><label htmlFor="ad">Descripción</label><input id="ad" value={ed.descripcion} onChange={(e) => setEd({ ...ed, descripcion: e.target.value })} /></div>
          <label className="row small" style={{ marginTop: 8 }}><input type="checkbox" checked={ed.requiere_autorizacion} onChange={(e) => setEd({ ...ed, requiere_autorizacion: e.target.checked })} /> Requiere autorización de Dirección Médica Nacional</label>
          <div className="field" style={{ marginTop: 8 }}><label htmlFor="am">Motivo</label><textarea id="am" value={motivo} onChange={(e) => setMotivo(e.target.value)} /></div>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}><button className="btn" onClick={() => setEd(null)}>Cancelar</button>
            <button className="btn primary" disabled={motivo.trim().length < 4 || !ed.nombre} onClick={async () => { try { await api.put('/parametros/asignacion', { ...ed, motivo }); toast('Catálogo actualizado'); setEd(null); reload(); } catch (e) { toast(e.message, true); } }}>Guardar</button></div>
        </Modal>
      )}
    </Panel>
  );
}

function Calendario({ p, reload }) {
  const { has } = useApp();
  const [ed, setEd] = useState(null);
  return (
    <div className="grid g-wide">
      <Panel title="Calendario 2026" subtitle="Semanas hábiles por mes = días hábiles / 5 (feriados y fines de semana descontados)" bodyClass=""
        right={has('parametros') && <button className="btn sm primary" onClick={() => setEd({ it: '', mes: 6, semanas: 4.0 })}>Ajuste por instituto</button>}>
        <table className="t"><thead><tr><th>Mes</th><th className="n">Días</th><th className="n">Inhábiles</th><th className="n">Días hábiles</th><th className="n">Semanas</th><th>Ajustes por instituto</th><th /></tr></thead>
          <tbody>{p.calendario.map((c) => (
            <tr key={c.mes}><td>{MESES_L[c.mes - 1]}</td><td className="n">{c.dias}</td><td className="n">{c.inhabiles}</td><td className="n">{c.dias_habiles}</td><td className="n"><b>{fmt(c.semanas, 1)}</b></td>
              <td className="small">{p.calendario_instituto.filter((x) => x.mes === c.mes).map((x) => `${p.institutos.find((i) => i.it === x.it)?.nombre}: ${x.semanas}`).join(' · ') || '—'}</td>
              <td>{has('parametros') && <button className="btn sm" onClick={() => setEd({ mes: c.mes, semanas: c.semanas, dias_habiles: c.dias_habiles })}>Editar</button>}</td></tr>
          ))}</tbody></table>
      </Panel>
      <Panel title="Feriados y zonas" subtitle="Feriados regionales y zonas extremas afectan días hábiles y vacaciones">
        <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>
          {p.feriados.filter((f) => !f.tipo.includes('Colectivo')).map((f) => <li key={f.fecha + f.tipo}>{f.fecha} · {f.tipo}{f.alcance !== 'Nacional' ? ` (${f.alcance})` : ''}</li>)}
          <li>Feriado colectivo: 2 al 20 de febrero (vacaciones institucionales).</li>
        </ul>
        <p className="small"><b>Días adicionales por zona:</b> {p.institutos.filter((i) => i.dias_adicionales_zona !== 5).map((i) => `${i.nombre}: ${i.dias_adicionales_zona} días`).join(', ')}; resto 5 días.</p>
      </Panel>
      {ed && (
        <CambioModal title={ed.it !== undefined ? 'Ajuste de calendario por instituto' : `Calendario · ${MESES_L[ed.mes - 1]}`} onClose={() => setEd(null)} simPayload={null}
          onApply={async (motivo) => { const r = await api.put('/parametros/calendario', { ...ed, motivo }); reload(); return r; }}>
          {ed.it !== undefined && <div className="field"><label htmlFor="ci">Instituto</label><select id="ci" value={ed.it} onChange={(e) => setEd({ ...ed, it: e.target.value })}><option value="">Selecciona…</option>{p.institutos.map((i) => <option key={i.it} value={i.it}>{i.nombre}</option>)}</select></div>}
          <div className="grid g2" style={{ gap: 10, marginTop: 8 }}>
            {ed.it !== undefined && <div className="field"><label htmlFor="cm">Mes</label><select id="cm" value={ed.mes} onChange={(e) => setEd({ ...ed, mes: Number(e.target.value) })}>{MESES_L.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></div>}
            <div className="field"><label htmlFor="cs">Semanas hábiles</label><input id="cs" type="number" step="0.1" value={ed.semanas} onChange={(e) => setEd({ ...ed, semanas: Number(e.target.value) })} /></div>
          </div>
          <p className="small muted">Ej.: Arica pierde un día hábil por el feriado regional del 7 de junio → 4,0 semanas. Los meses ya cerrados no cambian.</p>
        </CambioModal>
      )}
    </div>
  );
}
