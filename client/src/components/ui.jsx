import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { TIPOS_CAMBIO } from '../util.js';

export function Panel({ title, subtitle, right, children, id, bodyClass = 'body' }) {
  return (
    <section className="panel" aria-labelledby={id}>
      {(title || right) && (
        <header>
          {title && <h2 id={id}>{title}</h2>}
          {subtitle && <p>{subtitle}</p>}
          {right && <div className="right">{right}</div>}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function Kpi({ label, value, hint, meta, bar }) {
  return (
    <div className={`kpi ${meta ? 'meta' : ''}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {hint && <div className="hint">{hint}</div>}
      {bar != null && <div className="bar" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, bar * 100))}%` }} /></div>}
    </div>
  );
}

export const Badge = ({ tone = '', children, title }) => <span className={`badge ${tone}`} title={title}>{children}</span>;
export const TipoCambio = ({ tipo }) => { const [l, t] = TIPOS_CAMBIO[tipo] || [tipo, '']; return <Badge tone={t}>{l}</Badge>; };

export function HourBar({ dir, ind, total, label }) {
  if (!total) return <div className="hourbar" aria-label="sin horas" />;
  const d = (dir / total) * 100, i = (ind / total) * 100;
  return (
    <div className="hourbar" role="img" aria-label={label || `Directa ${d.toFixed(0)}%, indirecta ${i.toFixed(0)}%, no asistencial ${(100 - d - i).toFixed(0)}%`}>
      <span className="d" style={{ width: `${d}%` }} /><span className="i" style={{ width: `${i}%` }} /><span className="x" style={{ width: `${Math.max(0, 100 - d - i)}%` }} />
    </div>
  );
}

export function Modal({ title, onClose, children }) {
  const ref = useRef();
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.querySelector('input,select,textarea,button')?.focus();
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => { window.removeEventListener('keydown', k); prev?.focus?.(); };
  }, []);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [t, setT] = useState(null);
  const show = useCallback((msg, err = false) => { setT({ msg, err }); setTimeout(() => setT(null), err ? 6000 : 3500); }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div aria-live="polite" role="status">{t && <div className={`toast ${t.err ? 'err' : ''}`}>{t.msg}</div>}</div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function useAsync(fn, deps) {
  const [state, set] = useState({ loading: true, data: null, error: null });
  const reload = useCallback(() => {
    set((s) => ({ ...s, loading: true }));
    return fn().then((data) => set({ loading: false, data, error: null })).catch((error) => set({ loading: false, data: null, error }));
  }, deps); // eslint-disable-line
  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload };
}

export function Loading({ error }) {
  if (error) return <div className="notice red" role="alert">{error.message}</div>;
  return <div className="muted" role="status" style={{ padding: 20 }}>Calculando…</div>;
}

/** Modal estándar para pedir motivo de un cambio (trazabilidad). */
export function MotivoModal({ title, children, onConfirm, onClose, confirmLabel = 'Guardar cambio', danger }) {
  const [motivo, setMotivo] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await onConfirm(motivo); onClose(); } finally { setBusy(false); } }}>
        {children}
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="motivo">Motivo o justificación (queda registrado)</label>
          <textarea id="motivo" required minLength={4} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: Solicitud de jefatura IT Valparaíso por correo del 05-11" />
        </div>
        <div className="row" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className={`btn ${danger ? 'danger' : 'primary'}`} disabled={busy || motivo.trim().length < 4}>{busy ? 'Guardando…' : confirmLabel}</button>
        </div>
      </form>
    </Modal>
  );
}

export function SortTh({ k, sort, setSort, children, n, cls = '' }) {
  const active = sort.key === k;
  return (
    <th className={`${n ? 'n' : ''} ${cls}`} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button className="sort" onClick={() => setSort({ key: k, dir: active && sort.dir === 'desc' ? 'asc' : 'desc' })}>
        {children}{active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
      </button>
    </th>
  );
}
export function sortRows(rows, sort) {
  if (!sort.key) return rows;
  const d = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = a[sort.key], y = b[sort.key];
    if (x == null) return 1; if (y == null) return -1;
    return (typeof x === 'string' ? x.localeCompare(y) : x - y) * d;
  });
}
