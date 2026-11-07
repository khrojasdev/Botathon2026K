import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { MESES, AREAS } from '../util.js';
import { useApp } from '../App.jsx';

const KEYS = ['it', 'cod_esp', 'cargo', 'tipo_contrato', 'tipo_trabajador', 'zona', 'meses', 'tramo'];

export function useFilters() {
  const [sp, setSp] = useSearchParams();
  const f = Object.fromEntries(KEYS.map((k) => [k, sp.get(k) || '']));
  const set = (k, v) => { const n = new URLSearchParams(sp); if (v == null || v === '') n.delete(k); else n.set(k, v); n.delete('page'); setSp(n, { replace: true }); };
  const clear = () => setSp(new URLSearchParams(), { replace: true });
  const query = Object.fromEntries(Object.entries(f).filter(([, v]) => v));
  return { f, set, clear, query };
}

const PRESETS = [['Año', ''], ['Ene–Abr (44 h)', '1,2,3,4'], ['May–Dic (42 h)', '5,6,7,8,9,10,11,12'], ['Ejecutado ene–jul', '1,2,3,4,5,6,7']];

export default function Filters({ extra }) {
  const { cat, user } = useApp();
  const { f, set, clear } = useFilters();
  if (!cat) return null;
  const meses = f.meses ? f.meses.split(',').map(Number) : [];
  const toggleMes = (m) => {
    let s = meses.length ? [...meses] : [];
    s = s.includes(m) ? s.filter((x) => x !== m) : [...s, m].sort((a, b) => a - b);
    set('meses', s.length === 12 ? '' : s.join(','));
  };
  const Sel = ({ k, label, options, all = 'Todos' }) => (
    <div className="field">
      <label htmlFor={`f-${k}`}>{label}</label>
      <select id={`f-${k}`} value={f[k]} onChange={(e) => set(k, e.target.value)}>
        <option value="">{all}</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
  const active = Object.values(f).some(Boolean);
  return (
    <div className="filters" role="search" aria-label="Filtros de planificación">
      {user.rol !== 'jefatura' && <Sel k="it" label="Instituto" all="Nacional (todos)" options={cat.institutos.map((i) => [i.it, `${i.nombre}`])} />}
      <Sel k="zona" label="Zona" options={cat.zonas.map((z) => [z, z])} />
      <Sel k="cod_esp" label="Área / especialidad" options={cat.areas.map((a) => [a, AREAS[a] ? `${AREAS[a]} (${a})` : a])} />
      <Sel k="cargo" label="Cargo" options={cat.cargos.map((c) => [c, c.charAt(0) + c.slice(1).toLowerCase()])} />
      <Sel k="tipo_contrato" label="Contrato" options={cat.tipos_contrato.map((c) => [c, c])} />
      <Sel k="tramo" label="Tramo de jornada" options={Object.entries(cat.tramos)} />
      <div className="field" style={{ minWidth: 300 }}>
        <span id="lbl-meses">Meses</span>
        <div className="months" role="group" aria-labelledby="lbl-meses">
          {MESES.map((m, i) => (
            <button key={m} type="button" aria-pressed={!meses.length || meses.includes(i + 1)} onClick={() => toggleMes(i + 1)}>{m}</button>
          ))}
        </div>
        <div className="chips" style={{ marginTop: 4 }}>
          {PRESETS.map(([l, v]) => <button key={l} type="button" className="btn sm" aria-pressed={f.meses === v} onClick={() => set('meses', v)}>{l}</button>)}
        </div>
      </div>
      {extra}
      {active && <button className="btn ghost" onClick={clear}>Limpiar filtros</button>}
    </div>
  );
}
