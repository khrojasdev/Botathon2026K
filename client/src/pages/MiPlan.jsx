import React from 'react';
import { api, download } from '../api.js';
import { Page } from '../App.jsx';
import { useAsync, Loading, useToast } from '../components/ui.jsx';
import { FichaView } from './Ficha.jsx';
import { speak } from './Dashboard.jsx';
import { fmt } from '../util.js';

export default function MiPlan() {
  const { data, error, reload } = useAsync(() => api.get('/mi-plan'), []);
  const toast = useToast();
  const d = data?.[0];
  const leer = () => d && speak(`Tu planificación 2026 en ${d.fila.instituto}: ${fmt(d.calc.total.planDir)} atenciones directas en el año, unas ${fmt(d.calc.rateDirT[11], 0)} por semana. Tu meta de gestión es de ${fmt(d.calc.total.mgTot)} atenciones en total.`);
  return (
    <Page title="Mi planificación" sub="Tus horas, metas y lo realizado según SIC"
      tools={d && <><button className="btn" onClick={leer}>🔊 Escuchar</button><button className="btn" onClick={() => download(`/reportes/ficha/${d.fila.id}.pdf`, 'mi_planificacion.pdf').catch((e) => toast(e.message, true))}>Descargar PDF</button></>}>
      {!data ? <Loading error={error} /> : !data.length ? <p>No encontramos una planificación asociada a tu cuenta.</p> : (
        <>
          <section className="hero"><div><h2>Este año planificamos {fmt(d.calc.total.planDir)} atenciones directas contigo.</h2>
            <p>Son cerca de {fmt(d.calc.rateDirT[11], 0)} por semana. La meta mínima de gestión es {fmt(d.calc.total.mgTot)} atenciones (directas e indirectas).</p></div></section>
          {data.map((x) => <FichaView key={x.fila.id} d={x} reload={reload} readOnly />)}
        </>
      )}
    </Page>
  );
}
