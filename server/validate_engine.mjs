import fs from 'fs';
import { buildCtx, calcFila } from './engine.js';
const seed = JSON.parse(fs.readFileSync(new URL('./seed/seed.json', import.meta.url)));
const state = { ...seed, params: {} };
const ctx = buildCtx(state);
let cells = 0, ok = 0, okT = 0, rowsOk = 0, xOk = 0; const bad = [];
let sumXl = 0, sumCalc = 0;
for (const f of seed.filas) {
  const r = calcFila(f, ctx);
  let rowOk = true;
  if (r.X === f.esperado.X) xOk++;
  for (let i = 0; i < 12; i++) {
    cells++;
    const e = f.esperado.dir[i], t = f.esperado.tot[i];
    sumXl += t; sumCalc += r.planTot[i];
    if (r.planDir[i] === e) ok++; else rowOk = false;
    if (r.planTot[i] === t) okT++; else rowOk = false;
  }
  if (rowOk) rowsOk++; else bad.push([f.id, f.persona_id, f.cargo, f.it, r.X, f.esperado.X, r.planDir.join(','), f.esperado.dir.join(',')]);
}
console.log({ cells, dir: (ok / cells).toFixed(4), tot: (okT / cells).toFixed(4), rowsOk, rows: seed.filas.length, xOk, sumXl, sumCalc, diffPct: ((sumCalc - sumXl) / sumXl * 100).toFixed(3) });
for (const b of bad.slice(0, 45)) console.log(b.join(' | '));
