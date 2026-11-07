import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, qs } from '../api.js';
import { Page, useApp } from '../App.jsx';
import { Panel, Badge, useAsync, Loading, Modal, useToast } from '../components/ui.jsx';
import { fmt, fecha } from '../util.js';

export default function Asignaciones() {
  const { has, refreshPend } = useApp();
  const toast = useToast();
  const [estado, setEstado] = useState('pendiente');
  const { data, error, reload } = useAsync(() => api.get(`/asignaciones${qs({ estado })}`), [estado]);
  const [res, setRes] = useState(null);
  const [com, setCom] = useState('');
  const estados = [['pendiente', 'Pendientes'], ['aprobada', 'Aprobadas'], ['rechazada', 'Rechazadas'], ['revocada', 'Revocadas'], ['', 'Todas']];
  return (
    <Page title="Asignaciones especiales" sub="Solicitudes de jefaturas y autorización de la Dirección Médica Nacional — reemplaza la recolección por correo">
      <div className="notice small">Para solicitar una asignación, abre la ficha del profesional desde <Link to="/planificacion">Profesionales</Link> y usa «Solicitar asignación». Las que requieren autorización no afectan la planificación hasta ser aprobadas.</div>
      <div className="tabs" role="tablist">{estados.map(([k, l]) => <button key={l} role="tab" aria-selected={estado === k} onClick={() => setEstado(k)}>{l}{data?.resumen?.[k] ? ` (${data.resumen[k]})` : ''}</button>)}</div>
      <Panel bodyClass="">
        {!data ? <Loading error={error} /> : (
          <div className="tablewrap"><table className="t">
            <thead><tr><th>Solicitud</th><th>Profesional</th><th>Instituto</th><th>Asignación</th><th className="n">H/sem</th><th>Motivo</th><th>Solicitado por</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {data.rows.map((a) => (
                <tr key={a.id}>
                  <td className="small">#{a.id}<br />{fecha(a.creado)}</td>
                  <td><Link to={`/profesional/${a.fila_id}`}>#{a.persona_id}</Link><div className="small muted">{a.cargo?.toLowerCase()}</div></td>
                  <td>{a.instituto}</td><td>{a.nombre}{a.requiere_autorizacion && <div><Badge tone="warn">requiere DMN</Badge></div>}</td>
                  <td className="n">{fmt(a.horas, 2)}</td><td className="small">{a.motivo}</td><td className="small">{a.solicitado_por}</td>
                  <td><Badge tone={{ aprobada: 'ok', pendiente: 'warn', rechazada: 'red', revocada: 'red' }[a.estado]}>{a.estado}</Badge>{a.resuelto_por && <div className="small muted">{a.resuelto_por}</div>}</td>
                  <td>{a.estado === 'pendiente' && has('aprobar_asig') && <div className="row">
                    <button className="btn sm primary" onClick={() => { setRes({ a, aprobar: true }); setCom(''); }}>Aprobar</button>
                    <button className="btn sm" onClick={() => { setRes({ a, aprobar: false }); setCom(''); }}>Rechazar</button></div>}</td>
                </tr>
              ))}
              {!data.rows.length && <tr><td colSpan={9} className="muted">No hay asignaciones en este estado.</td></tr>}
            </tbody>
          </table></div>
        )}
      </Panel>
      {res && (
        <Modal title={`${res.aprobar ? 'Aprobar' : 'Rechazar'} «${res.a.nombre}» · #${res.a.persona_id}`} onClose={() => setRes(null)}>
          <p className="small">{res.aprobar ? `Se descontarán ${res.a.horas} h semanales de atención y la planificación se recalcula de inmediato.` : 'La solicitud queda registrada como rechazada.'}</p>
          <div className="field"><label htmlFor="cm">Comentario</label><textarea id="cm" value={com} onChange={(e) => setCom(e.target.value)} /></div>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
            <button className="btn" onClick={() => setRes(null)}>Cancelar</button>
            <button className={`btn ${res.aprobar ? 'primary' : 'danger'}`} onClick={async () => { try { await api.post(`/asignaciones/${res.a.id}/resolver`, { aprobar: res.aprobar, comentario: com }); toast(res.aprobar ? 'Asignación aprobada' : 'Asignación rechazada'); setRes(null); reload(); refreshPend(); } catch (e) { toast(e.message, true); } }}>{res.aprobar ? 'Aprobar' : 'Rechazar'}</button>
          </div>
        </Modal>
      )}
    </Page>
  );
}
