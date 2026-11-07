import React, { useEffect, useState } from 'react';
// Modo «lectura fácil»: textos simples, letra más grande y menos columnas técnicas.
export const esFacil = () => document.documentElement.dataset.facil === '1';
export function setFacil(v) {
  document.documentElement.dataset.facil = v ? '1' : '';
  try { const a = JSON.parse(localStorage.getItem('chc_a11y') || '{}'); a.facil = v; localStorage.setItem('chc_a11y', JSON.stringify(a)); } catch {}
  window.dispatchEvent(new Event('chc-facil'));
}
export function useFacil() {
  const [f, setF] = useState(esFacil());
  useEffect(() => { const h = () => setF(esFacil()); window.addEventListener('chc-facil', h); return () => window.removeEventListener('chc-facil', h); }, []);
  return f;
}
/** Muestra el texto técnico o su versión en lectura fácil. */
export function Txt({ t, f }) { return useFacil() ? <>{f}</> : <>{t}</>; }
