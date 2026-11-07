import React, { useState } from 'react';
import { CHILE, proyectar } from './chileGeo.js';

/**
 * Mapa de Chile con un punto por instituto.
 * items: [{ it, nombre, coord:[lat,lon], valor, color, tamano, etiqueta }]
 */
export default function MapaChile({ items, seleccionado, onSelect, altura = 640, titulo }) {
  const [hover, setHover] = useState(null);
  const escala = altura / CHILE.H;
  const ancho = CHILE.W * escala;
  const visibles = items.filter((x) => x.coord);
  // separar etiquetas que quedan muy juntas (Santiago/Valparaíso/O'Higgins…)
  const puntos = visibles.map((x) => { const [px, py] = proyectar(x.coord[0], x.coord[1]); return { ...x, px: px * escala, py: py * escala }; }).sort((a, b) => a.py - b.py);
  let ultimo = -99;
  for (const p of puntos) { p.ly = Math.max(p.py, ultimo + 15); ultimo = p.ly; }
  const activo = hover ?? seleccionado;
  return (
    <svg viewBox={`-6 -6 ${ancho + 190} ${altura + 12}`} width="100%" style={{ maxWidth: ancho + 196, display: 'block', margin: '0 auto' }} role="img" aria-label={titulo || 'Mapa de institutos Teletón en Chile'}>
      <g transform={`scale(${escala})`}>
        <path d={CHILE.d} fill="#f1eeee" stroke="#ddd5d6" strokeWidth={1 / escala} />
      </g>
      {[...puntos].sort((a, b) => b.tamano - a.tamano).map((p) => {
        const on = activo === p.it;
        return (
          <g key={p.it} transform={`translate(${p.px},${p.py})`} style={{ cursor: onSelect ? 'pointer' : 'default' }}
            onMouseEnter={() => setHover(p.it)} onMouseLeave={() => setHover(null)} onClick={() => onSelect?.(p.it)}
            tabIndex={onSelect ? 0 : -1} role={onSelect ? 'button' : undefined} aria-label={`${p.nombre}: ${p.etiqueta}`}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect?.(p.it)}>
            <circle r={p.tamano + (on ? 3 : 0)} fill={p.color} fillOpacity={0.9} stroke={on ? '#4d4346' : '#fff'} strokeWidth={on ? 2.5 : 1.5} />
            <line x1={p.tamano + 2} y1={0} x2={ancho - p.px + 14} y2={p.ly - p.py} stroke="#ddd5d6" strokeWidth="0.8" />
            <text x={ancho - p.px + 18} y={p.ly - p.py + 4} fontSize="12.5" fontWeight={on ? 800 : 600} fill="#4d4346" fontFamily="Atkinson Hyperlegible, sans-serif">
              {p.nombre} <tspan fill={p.color} fontWeight="800">{p.etiqueta}</tspan>
            </text>
          </g>
        );
      })}
    </svg>
  );
}
