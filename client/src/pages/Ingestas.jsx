import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Page, useApp } from '../App.jsx';
import { Panel, Badge, TipoCambio, useAsync, Loading, Modal, useToast } from '../components/ui.jsx';
import { fmt, fecha, signed } from '../util.js';

export default function Ingestas() {
  const { has, refreshCat } = useApp();
  const toast = useToast();
  const list = useAsync(() => api.get('/ingestas'), []);
  const bot = useAsync(() => api.get('/bot/estado'), []);
  const [sel, setSel] = useState(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reset, setReset] = useState(false);
  const subir = async (file) => {
    if (!file) return;
    setBusy(true);
    const fd = new FormData(); fd.append('archivo', file);
    try {
      const r = await api.upload('/ingestas/upload', fd);
      toast(r.mensaje);
      list.reload(); refreshCat(); setSel(r.ingesta_id);
    } catch (e) { toast(e.message, true); } finally { setBusy(false); }
  };
  const b = bot.data?.bot;
  return (
    <Page title="Reportes BUK y SIC" sub="Incorporación automática de datos, sin copiar y pegar"
      tools={has('reset') && <button className="btn" onClick={() => setReset(true)}>Reiniciar demo</button>}>
      <div className="pill-step" aria-label="Flujo automatizado">
        <div><b>1 · Blue Prism detecta</b><span className="small muted">El robot vigila la carpeta de reportes de Gerencia de Personas (BUK) y del SIC.</span></div>
        <div><b>2 · Lee y valida</b><span className="small muted">Revisa cada fila: IDs, horas vs. jornada legal, fechas, duplicados. Deja un CSV con los errores.</span></div>
        <div><b>3 · Entrega sólo lo válido</b><span className="small muted">Envía las filas a la plataforma, que detecta altas, bajas y cambios y recalcula desde la fecha en que rigen.</span></div>
        <div><b>4 · Distribuye</b><span className="small muted">Descarga el PDF de cada instituto para sus jefaturas y archiva el reporte procesado.</span></div>
      </div>
      <div className="grid g2">
        <Panel title="Robot Blue Prism" subtitle="Estado de la última ejecución">
          {!b ? <p className="muted">El robot aún no se ha conectado. Importa el proceso <b>Teletón · Ingesta BUK SIC</b> en Blue Prism y ejecútalo desde Control Room.</p> : (
            <dl className="dl">
              <dt>Último latido</dt><dd>{fecha(b.ultimo_latido)}</dd>
              <dt>Mensaje</dt><dd style={{ fontWeight: 400 }}>{b.mensaje}</dd>
              {b.ejecucion?.maquina && <><dt>Máquina</dt><dd>{b.ejecucion.maquina}</dd></>}
              {b.ejecucion?.archivos != null && <><dt>Archivos en la corrida</dt><dd>{b.ejecucion.archivos}</dd></>}
            </dl>
          )}
        </Panel>
        {has('ingesta') && (
          <Panel title="Carga manual (respaldo)" subtitle="Usa la misma validación que el robot">
            <label className={`drop ${over ? 'over' : ''}`} style={{ display: 'block', cursor: 'pointer' }}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); subir(e.dataTransfer.files[0]); }}>
              <input type="file" accept=".xlsx,.xls" className="sr" onChange={(e) => subir(e.target.files[0])} disabled={busy} />
              <b>{busy ? 'Procesando…' : 'Arrastra un Excel de BUK o SIC, o haz clic para elegirlo'}</b>
              <div className="small muted">El tipo se detecta por el nombre y las columnas.</div>
            </label>
          </Panel>
        )}
      </div>
      <Panel title="Historial de reportes procesados" bodyClass="">
        {!list.data ? <Loading error={list.error} /> : !list.data.length ? <p className="muted" style={{ padding: 16 }}>Aún no se procesa ningún reporte.</p> : (
          <div className="tablewrap">
            <table className="t">
              <thead><tr><th>#</th><th>Fecha</th><th>Tipo</th><th>Archivo</th><th>Origen</th><th>Periodo</th><th className="n">Filas</th><th className="n">Válidas</th><th className="n">Errores</th><th className="n">Cambios</th><th className="n">Δ atenciones</th><th>Estado</th></tr></thead>
              <tbody>
                {list.data.map((i) => (
                  <tr key={i.id} className={`clickable ${sel === i.id ? 'sel' : ''}`} tabIndex={0} onClick={() => setSel(i.id)} onKeyDown={(e) => e.key === 'Enter' && setSel(i.id)}>
                    <td>{i.id}</td><td>{fecha(i.fecha)}</td><td><Badge tone={i.tipo === 'BUK' ? 'navy' : 'dir'}>{i.tipo}</Badge></td><td>{i.archivo}</td>
                    <td>{i.origen === 'Blue Prism' ? <Badge tone="ok">🤖 Blue Prism</Badge> : i.origen}</td><td>{i.periodo}</td>
                    <td className="n">{fmt(i.filas)}</td><td className="n">{fmt(i.validas)}</td><td className="n">{i.errores ? <span className="diff-neg">{i.errores}</span> : 0}</td>
                    <td className="n">{fmt(i.cambios)}</td><td className="n">{i.resumen?.delta ? signed(i.resumen.delta) : '—'}</td>
                    <td><Badge tone={i.estado === 'ok' ? 'ok' : 'warn'}>{i.estado === 'ok' ? 'OK' : 'Con errores'}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      {sel && <Detalle id={sel} />}
      {reset && (
        <Modal title="Reiniciar datos de la demo" onClose={() => setReset(false)}>
          <p>Vuelve a la planificación original del Excel y borra reportes, cambios, versiones y auditoría. Úsalo antes de una presentación.</p>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setReset(false)}>Cancelar</button>
            <button className="btn danger" onClick={async () => { await api.post('/admin/reset'); toast('Demo reiniciada'); setReset(false); setSel(null); list.reload(); bot.reload(); refreshCat(); }}>Reiniciar</button>
          </div>
        </Modal>
      )}
    </Page>
  );
}

function Detalle({ id }) {
  const { data, error } = useAsync(() => api.get(`/ingestas/${id}`), [id]);
  if (!data) return <Loading error={error} />;
  const errs = data.errores.filter((e) => e.severidad !== 'advertencia');
  const warns = data.errores.filter((e) => e.severidad === 'advertencia');
  const r = data.ingesta.resumen || {};
  return (
    <div className="grid g2">
      <Panel title={`Cambios detectados (${data.cambios.length})`} subtitle="Aplicados desde la fecha en que rigen" bodyClass="">
        {r.version_id && <p className="small" style={{ padding: '0 16px' }}>Se generó la versión borrador <Link to="/trazabilidad?tab=versiones">#{r.version_id}</Link> para revisión y aprobación.</p>}
        <div className="tablewrap"><table className="t">
          <thead><tr><th>Tipo</th><th>Profesional</th><th>Antes → después</th><th>Rige</th><th className="n">Impacto/año</th></tr></thead>
          <tbody>
            {data.cambios.map((c) => (
              <tr key={c.id}><td><TipoCambio tipo={c.tipo} /></td><td>{c.fila_id ? <Link to={`/profesional/${c.fila_id}`}>#{c.persona_id}</Link> : `#${c.persona_id}`}</td>
                <td className="small">{c.valor_anterior ?? '—'} → <b>{c.valor_nuevo ?? '—'}</b></td><td className="small">{c.vigencia_desde}</td>
                <td className="n">{c.impacto == null ? '' : <span className={c.impacto >= 0 ? 'diff-pos' : 'diff-neg'}>{signed(c.impacto)}</span>}</td></tr>
            ))}
            {!data.cambios.length && <tr><td colSpan={5} className="muted">{data.ingesta.tipo === 'SIC' ? 'Los reportes SIC alimentan el contraste plan vs. realizado.' : 'Sin cambios respecto de la planificación vigente.'}</td></tr>}
          </tbody>
        </table></div>
      </Panel>
      <Panel title={`Errores (${errs.length}) y advertencias (${warns.length})`} subtitle="Filas rechazadas: no entran a la planificación" bodyClass="">
        <div className="tablewrap"><table className="t">
          <thead><tr><th>Fila</th><th>Campo</th><th>Valor</th><th>Problema</th><th>Detectado por</th></tr></thead>
          <tbody>
            {[...errs, ...warns].map((e) => (
              <tr key={e.id}><td>{e.fila}</td><td>{e.campo}</td><td className="small">{e.valor ?? '—'}</td>
                <td><Badge tone={e.severidad === 'advertencia' ? 'warn' : 'red'}>{e.severidad}</Badge> {e.mensaje}</td>
                <td className="small">{e.origen === 'bot' ? '🤖 Blue Prism' : 'Plataforma'}</td></tr>
            ))}
            {!data.errores.length && <tr><td colSpan={5} className="muted">Reporte sin errores.</td></tr>}
          </tbody>
        </table></div>
      </Panel>
    </div>
  );
}
