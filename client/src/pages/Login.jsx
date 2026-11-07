import React, { useEffect, useState } from 'react';
import { api, setToken } from '../api.js';
import { ROLES } from '../util.js';

const DESC = {
  admin: 'Ve todo el país, edita reglas y aprueba versiones',
  planificador: 'Carga reportes, ajusta la planificación',
  dmn: 'Autoriza asignaciones especiales y versiones',
  jefatura: 'Ve sólo su instituto y solicita asignaciones',
  profesional: 'Ve su propia planificación y metas',
  bot: 'Cuenta técnica para Blue Prism',
};

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('admin@teleton.cl');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(null);
  const [users, setUsers] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { document.title = 'Ingresar · Cada hora cuenta'; api.get('/auth/demo-users').then(setUsers).catch(() => {}); }, []);
  const go = async (e, pass) => {
    e?.preventDefault(); setBusy(true); setErr(null);
    try {
      const r = await api.post('/auth/login', { email: pass ? pass.email : email, password: pass ? 'Teleton2026' : password });
      setToken(r.token); onLogin(r.user);
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  // 12 bloques = 12 meses; color según el reparto nacional de una semana
  const blocks = Array.from({ length: 24 }, (_, i) => (i < 14 ? 'd' : i < 17 ? 'i' : ''));
  return (
    <div className="login">
      <div className="art">
        <div>
          <h1>Cada hora<br />cuenta</h1>
          <p>Planificación asistencial de los Institutos Teletón: cuántas horas de cada profesional llegan a niños, niñas y jóvenes en rehabilitación, mes a mes, con reglas editables y trazabilidad completa.</p>
          <div className="clock" aria-hidden="true">{blocks.map((c, i) => <span key={i} className={c} />)}</div>
          <p className="small" style={{ marginTop: 10 }}>Rojo: atención directa · celeste: indirecta · gris: no asistencial</p>
        </div>
        <p className="small">Botathon 2026 · Datos ficticios, sin nombres ni RUT. Acceso por rol según la Ley 19.628 / 21.719 de protección de datos.</p>
      </div>
      <div className="form">
        <h2 style={{ fontFamily: 'var(--display)', fontSize: '1.8rem', margin: 0 }}>Ingresar</h2>
        <form onSubmit={go} className="grid" style={{ gap: 10 }}>
          <div className="field"><label htmlFor="em">Correo</label><input id="em" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="field"><label htmlFor="pw">Contraseña</label><input id="pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Teleton2026" /></div>
          {err && <div className="notice red" role="alert">{err}</div>}
          <button className="btn primary" disabled={busy} style={{ justifyContent: 'center', padding: 10 }}>Ingresar</button>
        </form>
        <div>
          <p className="muted small" style={{ margin: '6px 0' }}>Acceso rápido para la demo (contraseña Teleton2026):</p>
          <div className="roles">
            {users.filter((u) => u.rol !== 'bot').map((u) => (
              <button key={u.email} onClick={(e) => go(e, u)} disabled={busy}>
                <b>{ROLES[u.rol]}</b><span>{DESC[u.rol]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
