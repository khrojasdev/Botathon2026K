import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../api.js';
import { Page, useApp } from '../App.jsx';
import { Panel, Badge, TipoCambio, useAsync, Loading, Modal, MotivoModal, useToast } from '../components/ui.jsx';
import { fmt, fecha, signed, TIPOS_CAMBIO } from '../util.js';

export default function Trazabilidad() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') || 'cambios';
  const { has } = useApp();
  const tabs = [['cambios', 'Cambios'], ['versiones', 'Versiones'], ...(has('auditoria') ? [['auditoria', 'Auditoría de accesos']] : [])];
  return (
    <Page title="Cambios y versiones" sub="Quién cambió qué, cuándo y por qué">
      <div className="tabs" role="tablist">
        {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setSp({ tab: k })}>{l}</button>)}
      </div>
      {tab === 'cambios' && <Cambios />}
      {tab === 'versiones' && <Versiones />}
      {tab === 'auditoria' && <Auditoria />}
    </Page>
  );
}

function Cambios() {
  const [tipo, setTipo] = useState('');
  const [persona, setPersona] = useState('');
  const { data, error } = useAsync(() => api.get(`/cambios${qs({ tipo, persona })}`), [tipo, persona]);
  return (
    <Panel title={data ? `${fmt(data.total)} cambios registrados` : 'Cambios'} bodyClass="" right={
      <div className="row">
        <div className="field" style={{ minWidth: 180 }}><label htmlFor="tc">Tipo</label>
          <select id="tc" value={tipo} onChange={(e) => setTipo(e.target.value)}><option value="">Todos</option>
            {data && Object.entries(data.tipos).map(([k, n]) => <option key={k} value={k}>{TIPOS_CAMBIO[k]?.[0] || k} ({n})</option>)}</select></div>
        <div className="field" style={{ minWidth: 120 }}><label htmlFor="pp">ID profesional</label><input id="pp" value={persona} onChange={(e) => setPersona(e.target.value)} /></div>
      </div>}>
      {!data ? <Loading error={error} /> : (
        <div className="tablewrap"><table className="t">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Profesional</th><th>Instituto</th><th>Campo</th><th>Antes → después</th><th>Rige desde</th><th className="n">Impacto/año</th><th>Usuario</th><th>Motivo</th></tr></thead>
          <tbody>
            {data.rows.map((c) => (
              <tr key={c.id}>
                <td className="small">{fecha(c.fecha)}</td><td><TipoCambio tipo={c.tipo} /></td>
                <td>{c.fila_id ? <Link to={`/profesional/${c.fila_id}`}>#{c.persona_id}</Link> : '—'}</td><td>{c.instituto || '—'}</td><td className="small">{c.campo}</td>
                <td className="small" style={{ maxWidth: 320, wordBreak: 'break-word' }}>{c.valor_anterior ?? '—'} → <b>{c.valor_nuevo ?? '—'}</b></td>
                <td className="small">{c.vigencia_desde || '—'}</td>
                <td className="n">{c.impacto == null ? '' : <span className={c.impacto >= 0 ? 'diff-pos' : 'diff-neg'}>{signed(c.impacto)}</span>}</td>
                <td className="small">{c.usuario}</td><td className="small">{c.motivo}</td>
              </tr>
            ))}
            {!data.rows.length && <tr><td colSpan={10} className="muted">Sin cambios todavía. Cargar un reporte BUK, aprobar una asignación o editar un parámetro genera registros aquí.</td></tr>}
          </tbody>
        </table></div>
      )}
    </Panel>
  );
}

function Versiones() {
  const { has } = useApp();
  const toast = useToast();
  const { data, error, reload } = useAsync(() => api.get('/versiones'), []);
  const [nueva, setNueva] = useState(false);
  const [nombre, setNombre] = useState('');
  const [cmp, setCmp] = useState(null);
  const [rest, setRest] = useState(null);
  const comparar = async (v) => { try { setCmp({ v, d: await api.get(`/versiones/${v.id}/comparar`) }); } catch (e) { toast(e.message, true); } };
  return (
    <>
      <Panel title="Versiones de la planificación" subtitle="Cada carga BUK crea un borrador; la versión aprobada es el respaldo oficial" bodyClass=""
        right={has('versionar') && <button className="btn primary sm" onClick={() => setNueva(true)}>Guardar versión actual</button>}>
        {!data ? <Loading error={error} /> : (
          <div className="tablewrap"><table className="t">
            <thead><tr><th>#</th><th>Nombre</th><th>Estado</th><th>Creada</th><th>Por</th><th className="n">Atenciones</th><th className="n">Meta</th><th className="n">Dotación</th><th>Aprobada por</th><th /></tr></thead>
            <tbody>
              {data.map((v) => (
                <tr key={v.id}>
                  <td>{v.id}</td><td><b>{v.nombre}</b><div className="small muted">{v.motivo}</div></td>
                  <td><Badge tone={v.estado === 'aprobada' ? 'ok' : 'warn'}>{v.estado}</Badge></td>
                  <td className="small">{fecha(v.creado)}</td><td className="small">{v.usuario}</td>
                  <td className="n">{fmt(v.resumen?.total?.planTot)}</td><td className="n">{fmt(v.resumen?.total?.mgTot)}</td><td className="n">{fmt(v.resumen?.total?.dotacion)}</td>
                  <td className="small">{v.aprobado_por ? `${v.aprobado_por} · ${fecha(v.aprobado)}` : '—'}</td>
                  <td><div className="row">
                    <button className="btn sm" onClick={() => comparar(v)}>Comparar con actual</button>
                    {has('aprobar_version') && v.estado !== 'aprobada' && <button className="btn sm primary" onClick={async () => { await api.post(`/versiones/${v.id}/aprobar`, {}); toast('Versión aprobada'); reload(); }}>Aprobar</button>}
                    {has('aprobar_version') && <button className="btn sm" onClick={() => setRest(v)}>Restaurar</button>}
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Panel>
      {cmp && (
        <Panel title={`Actual vs. «${cmp.v.nombre}»`} right={<button className="btn sm" onClick={() => setCmp(null)}>Cerrar</button>} bodyClass="">
          <div className="kpis" style={{ margin: '0 16px 12px', borderRadius: 8 }}>
            {[['Atenciones', 'actual', 'version'], ['Meta', 'mgActual', 'mgVersion'], ['Horas semanales', 'horasActual', 'horasVersion'], ['Dotación', 'dotActual', 'dotVersion']].map(([l, a, b]) => (
              <div className="kpi" key={l}><div className="label">{l}</div><div className="value">{fmt(cmp.d.total[a])}</div>
                <div className="hint">versión: {fmt(cmp.d.total[b])} · <span className={cmp.d.total[a] - cmp.d.total[b] >= 0 ? 'diff-pos' : 'diff-neg'}>{signed(cmp.d.total[a] - cmp.d.total[b])}</span></div></div>
            ))}
          </div>
          <div className="tablewrap"><table className="t">
            <thead><tr><th>Instituto</th><th className="n">Versión</th><th className="n">Actual</th><th className="n">Diferencia</th><th className="n">Horas versión</th><th className="n">Horas actual</th></tr></thead>
            <tbody>{cmp.d.porInst.map((x) => <tr key={x.it}><td>{x.nombre}</td><td className="n">{fmt(x.version)}</td><td className="n">{fmt(x.actual)}</td>
              <td className="n">{x.delta ? <span className={x.delta >= 0 ? 'diff-pos' : 'diff-neg'}>{signed(x.delta)}</span> : '0'}</td><td className="n">{fmt(x.horasVersion)}</td><td className="n">{fmt(x.horasActual)}</td></tr>)}</tbody>
          </table></div>
        </Panel>
      )}
      {nueva && (
        <MotivoModal title="Guardar versión de la planificación" confirmLabel="Guardar versión" onClose={() => setNueva(false)}
          onConfirm={async (motivo) => { await api.post('/versiones', { nombre, motivo }); toast('Versión guardada'); reload(); }}>
          <div className="field"><label htmlFor="vn">Nombre</label><input id="vn" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Planificación noviembre post-ajustes DMN" /></div>
        </MotivoModal>
      )}
      {rest && (
        <MotivoModal danger title={`Restaurar «${rest.nombre}»`} confirmLabel="Restaurar versión" onClose={() => setRest(null)}
          onConfirm={async (motivo) => { try { await api.post(`/versiones/${rest.id}/restaurar`, { motivo }); toast('Versión restaurada. Se guardó un respaldo del estado anterior.'); reload(); } catch (e) { toast(e.message, true); throw e; } }}>
          <p>La planificación, asignaciones y parámetros vuelven a esta versión. Antes se guarda automáticamente un respaldo del estado actual.</p>
        </MotivoModal>
      )}
    </>
  );
}

function Auditoria() {
  const { data, error } = useAsync(() => api.get('/auditoria'), []);
  return (
    <Panel title="Auditoría" subtitle="Accesos, exportaciones y acciones sobre datos personales (control de acceso y trazabilidad, Ley 21.719)" bodyClass="">
      {!data ? <Loading error={error} /> : (
        <div className="tablewrap"><table className="t">
          <thead><tr><th>Fecha</th><th>Usuario</th><th>Rol</th><th>Acción</th><th>Entidad</th><th>Detalle</th><th>Motivo</th></tr></thead>
          <tbody>{data.map((a) => <tr key={a.id}><td className="small">{fecha(a.fecha)}</td><td className="small">{a.usuario}</td><td><Badge>{a.rol}</Badge></td><td>{a.accion}</td>
            <td className="small">{a.entidad} {a.entidad_id}</td><td className="small" style={{ maxWidth: 360, wordBreak: 'break-word' }}>{JSON.stringify(a.detalle)?.slice(0, 160)}</td><td className="small">{a.motivo}</td></tr>)}</tbody>
        </table></div>
      )}
    </Panel>
  );
}
