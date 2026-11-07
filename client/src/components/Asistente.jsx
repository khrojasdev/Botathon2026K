import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

const Rec = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
function hablar(texto) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(texto); u.lang = 'es-CL'; window.speechSynthesis.speak(u);
}

export default function Asistente() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([{ de: 'bot', texto: 'Hola, pregúntame por metas, cumplimiento, cobertura por niño/a, proyección a diciembre o lo que cambió con el último reporte. Puedes escribir o usar el micrófono.', sugerencias: ['¿Cómo vamos con la meta este año?', '¿Dónde falta capacidad?', '¿Llegaremos a la meta en diciembre?'] }]);
  const [txt, setTxt] = useState('');
  const [voz, setVoz] = useState(true);
  const [escuchando, setEscuchando] = useState(false);
  const [busy, setBusy] = useState(false);
  const fin = useRef(); const inp = useRef(); const recRef = useRef();
  const nav = useNavigate();
  useEffect(() => { fin.current?.scrollIntoView({ block: 'end' }); }, [msgs, open]);
  useEffect(() => { if (open) setTimeout(() => inp.current?.focus(), 50); }, [open]);
  useEffect(() => { const k = (e) => e.key === 'Escape' && setOpen(false); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);

  const preguntar = async (p) => {
    const pregunta = (p ?? txt).trim();
    if (!pregunta || busy) return;
    setTxt(''); setBusy(true);
    setMsgs((m) => [...m, { de: 'yo', texto: pregunta }]);
    try {
      const r = await api.post('/asistente', { pregunta });
      setMsgs((m) => [...m, { de: 'bot', ...r }]);
      if (voz) hablar(r.texto);
    } catch (e) { setMsgs((m) => [...m, { de: 'bot', texto: `No pude responder: ${e.message}` }]); }
    finally { setBusy(false); }
  };
  const microfono = () => {
    if (!Rec) { setMsgs((m) => [...m, { de: 'bot', texto: 'Tu navegador no permite dictado por voz. Usa Chrome o Edge, o escribe la pregunta.' }]); return; }
    if (escuchando) { recRef.current?.stop(); return; }
    const r = new Rec(); r.lang = 'es-CL'; r.interimResults = true; r.maxAlternatives = 1;
    r.onresult = (e) => { const t = [...e.results].map((x) => x[0].transcript).join(''); setTxt(t); if (e.results[e.results.length - 1].isFinal) { r.stop(); preguntar(t); } };
    r.onend = () => setEscuchando(false); r.onerror = () => setEscuchando(false);
    recRef.current = r; setEscuchando(true); r.start();
  };

  return (
    <>
      <button className="asis-fab" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="asistente">
        <span aria-hidden="true">💬</span> {open ? 'Cerrar asistente' : 'Pregúntale a la planificación'}
      </button>
      {open && (
        <section id="asistente" className="asis" role="dialog" aria-label="Asistente de planificación">
          <header><b>Asistente de planificación</b>
            <label className="small" style={{ marginLeft: 'auto' }}><input type="checkbox" checked={voz} onChange={(e) => { setVoz(e.target.checked); if (!e.target.checked) window.speechSynthesis?.cancel(); }} /> Responder en voz alta</label>
          </header>
          <div className="asis-msgs" aria-live="polite">
            {msgs.map((m, i) => (
              <div key={i} className={`asis-msg ${m.de}`}>
                <p>{m.texto}</p>
                {m.enlaces?.length > 0 && <div className="chips">{m.enlaces.map((l) => <button key={l.to} className="btn sm" onClick={() => { nav(l.to); }}>{l.label}</button>)}</div>}
                {m.sugerencias?.length > 0 && i === msgs.length - 1 && <div className="chips" style={{ marginTop: 6 }}>{m.sugerencias.map((s) => <button key={s} className="btn sm ghost asis-sug" onClick={() => preguntar(s)}>{s}</button>)}</div>}
                {m.de === 'bot' && i > 0 && <button className="btn sm ghost" onClick={() => hablar(m.texto)} aria-label="Escuchar esta respuesta">🔊</button>}
              </div>
            ))}
            {busy && <div className="asis-msg bot"><p className="muted">Buscando en los datos…</p></div>}
            <div ref={fin} />
          </div>
          <form className="asis-form" onSubmit={(e) => { e.preventDefault(); preguntar(); }}>
            <button type="button" className={`btn ${escuchando ? 'primary' : ''}`} onClick={microfono} aria-pressed={escuchando} aria-label={escuchando ? 'Detener dictado' : 'Dictar pregunta por voz'}>{escuchando ? '● Escuchando' : '🎤'}</button>
            <input ref={inp} value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Ej.: ¿cómo va Valparaíso?" aria-label="Escribe tu pregunta" />
            <button className="btn primary" disabled={busy || !txt.trim()}>Preguntar</button>
          </form>
        </section>
      )}
    </>
  );
}
