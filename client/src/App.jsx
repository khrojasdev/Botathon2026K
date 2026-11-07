import React, { createContext, useContext, useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api, getToken, setToken } from './api.js';
import { ROLES } from './util.js';
import { ToastProvider } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Planificacion from './pages/Planificacion.jsx';
import Ficha from './pages/Ficha.jsx';
import Sic from './pages/Sic.jsx';
import Ingestas from './pages/Ingestas.jsx';
import Trazabilidad from './pages/Trazabilidad.jsx';
import Parametros from './pages/Parametros.jsx';
import Asignaciones from './pages/Asignaciones.jsx';
import Validacion from './pages/Validacion.jsx';
import MiPlan from './pages/MiPlan.jsx';
import Cobertura from './pages/Cobertura.jsx';
import Proyeccion from './pages/Proyeccion.jsx';
import Asistente from './components/Asistente.jsx';
import { setFacil, useFacil } from './facil.jsx';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const NAV = [
  { to: '/', label: 'Resumen nacional', perm: 'ver', group: 'Planificación', icon: '◔' },
  { to: '/planificacion', label: 'Profesionales', perm: 'ver', icon: '☰' },
  { to: '/sic', label: 'Plan vs. realizado', perm: 'ver', icon: '⇅' },
  { to: '/cobertura', label: 'Cobertura y mapa', perm: 'ver', icon: '⌖' },
  { to: '/proyeccion', label: 'Proyección a diciembre', perm: 'ver', icon: '↗' },
  { to: '/asignaciones', label: 'Asignaciones especiales', perm: 'ver', icon: '✚', badge: 'pend' },
  { to: '/ingestas', label: 'Reportes BUK / SIC', perm: 'ver_todo', group: 'Datos y control', icon: '⇪' },
  { to: '/trazabilidad', label: 'Cambios y versiones', perm: 'ver', icon: '⟲' },
  { to: '/parametros', label: 'Reglas y parámetros', perm: 'ver', icon: '⚙' },
  { to: '/validacion', label: 'Validación vs. Excel', perm: 'ver_todo', icon: '✓' },
  { to: '/mi-plan', label: 'Mi planificación', perm: 'mi_plan', group: 'Personal', icon: '◉' },
];

function A11yTools() {
  const facil = useFacil();
  const [a, setA] = useState(() => { try { return JSON.parse(localStorage.getItem('chc_a11y') || '{}'); } catch { return {}; } });
  useEffect(() => {
    document.documentElement.dataset.size = a.size || '';
    document.documentElement.dataset.contrast = a.contrast || '';
    try { localStorage.setItem('chc_a11y', JSON.stringify(a)); } catch {}
  }, [a]);
  const sizes = [['', 'A'], ['grande', 'A+'], ['xl', 'A++']];
  return (
    <div className="row" role="group" aria-label="Accesibilidad">
      {sizes.map(([v, l]) => <button key={l} className="btn sm" aria-pressed={(a.size || '') === v} onClick={() => setA({ ...a, size: v })} aria-label={`Tamaño de texto ${l}`}>{l}</button>)}
      <button className="btn sm" aria-pressed={a.contrast === 'alto'} onClick={() => setA({ ...a, contrast: a.contrast === 'alto' ? '' : 'alto' })}>Alto contraste</button>
      <button className="btn sm" aria-pressed={facil} onClick={() => setFacil(!facil)}>Lectura fácil</button>
    </div>
  );
}

function Shell({ children }) {
  const { user, logout, pendientes } = useApp();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  const items = NAV.filter((n) => user.permisos.includes(n.perm));
  return (
    <div className="app">
      <a href="#contenido" className="skip">Saltar al contenido</a>
      <nav className={`side ${open ? 'open' : ''}`} aria-label="Navegación principal">
        <NavLink to={user.rol === 'profesional' ? '/mi-plan' : '/'} className="brand">
          <svg width="34" height="34" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="#fff" /><path d="M16 6 A10 10 0 0 1 26 16 L16 16Z" fill="#e12d39" /><path d="M26 16 A10 10 0 0 1 21 24.7 L16 16Z" fill="#52afd4" /><path d="M16 7v9l6 4" stroke="#160307" strokeWidth="2.6" fill="none" strokeLinecap="round" /></svg>
          <span><b>Cada hora cuenta</b><small>Planificación asistencial 2026</small></span>
        </NavLink>
        {items.map((n) => (
          <React.Fragment key={n.to}>
            {n.group && <div className="group">{n.group}</div>}
            <NavLink to={n.to} end={n.to === '/'} className="nav">
              <span aria-hidden="true">{n.icon}</span>{n.label}
              {n.badge === 'pend' && pendientes > 0 && <span className="count" aria-label={`${pendientes} pendientes`}>{pendientes}</span>}
            </NavLink>
          </React.Fragment>
        ))}
        <div className="me">
          <div>{user.nombre}</div>
          <span className="role">{ROLES[user.rol]}</span>
          <div><button onClick={logout}>Cerrar sesión</button></div>
        </div>
      </nav>
      <div className="main">
        <button className="btn menu-btn" style={{ margin: 8, alignSelf: 'flex-start' }} onClick={() => setOpen(!open)} aria-expanded={open}>☰ Menú</button>
        {children}
      </div>
      {user.permisos.includes('ver') && <Asistente />}
    </div>
  );
}

export function Page({ title, sub, tools, children }) {
  useEffect(() => { document.title = `${title} · Cada hora cuenta`; }, [title]);
  return (
    <>
      <div className="topbar">
        <div><h1>{title}</h1>{sub && <div className="sub">{sub}</div>}</div>
        <div className="tools">{tools}<A11yTools /></div>
      </div>
      <main id="contenido" className="content" tabIndex={-1}>{children}</main>
    </>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [cat, setCat] = useState(null);
  const [ready, setReady] = useState(false);
  const [pendientes, setPend] = useState(0);
  const refreshCat = () => api.get('/catalogos').then(setCat).catch(() => {});
  const refreshPend = () => api.get('/asignaciones?estado=pendiente').then((r) => setPend(r.rows.length)).catch(() => {});
  useEffect(() => {
    const out = () => { setUser(null); };
    window.addEventListener('chc-logout', out);
    if (getToken()) api.get('/auth/me').then((r) => setUser(r.user)).catch(() => setToken(null)).finally(() => setReady(true));
    else setReady(true);
    return () => window.removeEventListener('chc-logout', out);
  }, []);
  useEffect(() => { if (user && user.rol !== 'profesional') { refreshCat(); refreshPend(); } }, [user]);
  const logout = () => { setToken(null); setUser(null); };
  if (!ready) return null;
  if (!user) return <ToastProvider><Login onLogin={(u) => setUser(u)} /></ToastProvider>;
  const has = (p) => user.permisos.includes(p);
  return (
    <Ctx.Provider value={{ user, cat, refreshCat, logout, pendientes, refreshPend, has }}>
      <ToastProvider>
        <Shell>
          <Routes>
            {has('ver') && <Route path="/" element={<Dashboard />} />}
            {has('ver') && <Route path="/planificacion" element={<Planificacion />} />}
            <Route path="/profesional/:id" element={<Ficha />} />
            {has('ver') && <Route path="/sic" element={<Sic />} />}
            {has('ver') && <Route path="/cobertura" element={<Cobertura />} />}
            {has('ver') && <Route path="/proyeccion" element={<Proyeccion />} />}
            {has('ver') && <Route path="/asignaciones" element={<Asignaciones />} />}
            {has('ver_todo') && <Route path="/ingestas" element={<Ingestas />} />}
            {has('ver') && <Route path="/trazabilidad" element={<Trazabilidad />} />}
            {has('ver') && <Route path="/parametros" element={<Parametros />} />}
            {has('ver_todo') && <Route path="/validacion" element={<Validacion />} />}
            {has('mi_plan') && <Route path="/mi-plan" element={<MiPlan />} />}
            <Route path="*" element={<Navigate to={has('ver') ? '/' : '/mi-plan'} replace />} />
          </Routes>
        </Shell>
      </ToastProvider>
    </Ctx.Provider>
  );
}
