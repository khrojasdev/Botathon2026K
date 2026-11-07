import express from 'express';
import compression from 'compression';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { init, dbInfo } from './store.js';
import { router } from './routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');
app.use(compression());
app.use(express.json({ limit: '25mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');
  next();
});
app.get('/api/health', (req, res) => res.json({ ok: true, db: dbInfo }));
app.use('/api', router);

const dist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  app.get('/', (req, res) => res.send('API "Cada hora cuenta" activa. Compila el cliente con: npm run build'));
}
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) { try { res.end(); } catch {} return; }
  res.status(err.status || 500).json({ error: err.message || 'Error interno' });
});

const port = process.env.PORT || 3000;
init().then(() => {
  app.listen(port, () => console.log(`▶ Cada hora cuenta escuchando en http://localhost:${port} (BD: ${dbInfo.mode})`));
}).catch((e) => { console.error('Error al iniciar', e); process.exit(1); });
