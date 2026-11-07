# Cada hora cuenta · Botathon Teletón 2026

Plataforma que reemplaza el Excel de planificación asistencial: incorpora los reportes de **BUK** y **SIC** sin copiar y pegar (vía **Blue Prism**), aplica reglas **parametrizables**, calcula por profesional y mes las horas de atención directa, indirecta y no asistencial, las atenciones planificadas y la **meta de gestión (90%)**, y deja **trazabilidad** de cada cambio.

```
 Carpeta de reportes ──► Blue Prism (lee, valida, informa errores) ──► API Node/Express ──► Supabase (PostgreSQL)
  BUK_xxx.xlsx            · Teleton - Ingesta BUK SIC (proceso)          · motor de cálculo        · filas_plan, cambios,
  SIC_xxx.xlsx            · Teleton - API Conector (objeto C#)           · detección de cambios      versiones, auditoría…
                          ◄── PDF por instituto para jefaturas ◄──────── · reportes PDF/Excel
                                                                          ▲
                                                React (Vite) ─────────────┘  dashboards, filtros, roles
```

## Qué incluye

| Requisito del desafío | Dónde |
|---|---|
| Blue Prism en el centro | `blueprism/` — objeto + proceso importables y `GUIA_BLUE_PRISM.md` |
| Datos sin copiar/pegar, errores detectados e informados | Robot valida fila a fila → CSV de errores + la API revalida (cargo no homologado, duplicados…) → vista **Reportes BUK / SIC** |
| Reglas parametrizables | **Reglas y parámetros**: % por cargo y tramo, minutos estándar, grupal, asignaciones, calendario, meta, jornada legal |
| Cálculo correcto | **Validación vs. Excel**: 423 de 471 filas idénticas en los 12 meses (94% de las celdas); las diferencias son valores manuales del Excel o multi-instituto |
| Cambios durante el año | Al llegar un BUK nuevo se detectan altas, bajas, reemplazos, cambios de jornada/cargo/contrato/término y se aplican **desde el mes en que rigen** (meses anteriores quedan cerrados 🔒) |
| Visibilidad | Resumen nacional → instituto → área → profesional, filtros por mes, zona, cargo, contrato, tramo |
| Deseables | Trazabilidad (quién/qué/cuándo/por qué), versiones con aprobación y restauración, plan vs. SIC con alertas, multi-instituto, reemplazos, vacantes, aprobación DMN de asignaciones, **simulación** de parámetros antes de aplicar, distribución automática de PDF por instituto |
| Extras que nos diferencian | **Cobertura y mapa**: atenciones por niño/a vs. pacientes proyectados en un mapa de Chile, brecha en profesionales equivalentes y simulador «¿y si contratamos?». **Proyección a diciembre**: con lo realizado en SIC estima si cada instituto, área y profesional llegará a la meta (alerta temprana) |
| Accesibilidad | Tipografía Atkinson Hyperlegible (diseñada para baja visión), tamaño de texto A/A+/A++, alto contraste, navegación por teclado, lector de pantalla (ARIA), «Escuchar resumen» por voz |
| Protección de datos | Roles con alcance (jefatura sólo ve su IT, profesional sólo su plan), auditoría de logins y exportaciones, sin nombres/RUT, sólo el **mes** de nacimiento (para el día de cumpleaños) |

### Roles demo (contraseña `Teleton2026`)
`admin@teleton.cl` (planificación central) · `planificador@teleton.cl` · `dmn@teleton.cl` (aprueba asignaciones y versiones) · `jefatura.val@teleton.cl` (sólo Valparaíso) · `profesional@teleton.cl` (su propio plan) · `bot@teleton.cl` (Blue Prism).

## Correr localmente (2 comandos)

Requiere Node 20+.

```bash
npm install && npm run build
npm start            # http://localhost:3000
```
Sin `DATABASE_URL` funciona **en memoria** (ideal para probar). Con `DATABASE_URL` usa Supabase/PostgreSQL: crea las tablas y carga el seed solo la primera vez.

## Conexiones que debes hacer (una sola vez, ~10 min)

Solo hay **3 conexiones**. No se necesita nada más.

### 1) Supabase: la base de datos
1. Entra a https://supabase.com, inicia sesión con GitHub y crea un proyecto con **New project**. Ponle de nombre `botathon2026`, elige una contraseña de base de datos (guárdala) y la región **South America (São Paulo)**.
2. Cuando el proyecto esté listo (unos 2 min), presiona el botón **Connect** de arriba.
3. Abre la pestaña **Connection string** → **URI** y elige **Session pooler**. Copia la URI, que se ve así:
   `postgresql://postgres.xxxxxxxx:[YOUR-PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`
4. Reemplaza `[YOUR-PASSWORD]` por tu contraseña. Esa es tu **DATABASE_URL**.
   - Usa el **pooler** y no la conexión directa, porque Render no soporta IPv6.
   - **No** tienes que crear tablas: la app las crea y carga los datos al primer arranque.

### 2) Render: publica la app conectada a este repo
1. Entra a https://render.com e inicia sesión **con GitHub**.
2. Ve a **New + → Blueprint**. Autoriza a Render a ver el repo `khrojasdev/Botathon2026K` y selecciónalo. Render leerá el archivo `render.yaml`.
3. Cuando pida **DATABASE_URL**, pega la URI de Supabase. `JWT_SECRET` se genera solo. Luego presiona **Apply**.
4. Espera el primer deploy (unos 5 min) y abre la URL, del tipo `https://cada-hora-cuenta.onrender.com`.
   - En los logs debe aparecer: `Seed cargado (471 filas) — modo supabase/postgres`.
   - Desde ahora, cada `git push` a `main` vuelve a desplegar la app automáticamente.
   - El plan gratis se duerme: **abre la URL 2 minutos antes de la demo**.

### 3) Blue Prism: conecta el robot a la URL de Render
Sigue `blueprism/GUIA_BLUE_PRISM.md`. Lo único que configuras es el dato **URL API** con la URL de Render.

> Para reiniciar los datos antes de presentar: entra como Planificación central → **Reportes BUK / SIC → Reiniciar demo**.

## ¿Dónde se puede desplegar?

| Opción | ¿Sirve? | Por qué |
|---|---|---|
| **Render** (Web Service gratis) | ✅ **Recomendado** | Corre el servidor Node completo (API + front en una sola URL), con PDF, carga de Excel y estado en memoria. Ya está listo con `render.yaml` |
| Railway / Fly.io / Koyeb | ✅ | Igual que Render: un servicio Node con `npm install && npm run build` y `npm start` |
| **Vercel** | ⚠️ Solo el front | Vercel ejecuta el backend como funciones *serverless* que se apagan entre llamadas: el motor guarda una caché en memoria, la carga de archivos y la generación de PDF superan sus límites y el robot necesita una API estable. Si quieres usar Vercel, publica ahí `client/` y deja la API en Render |
| Tu PC (`npm start`) | ✅ Para la demo | Blue Prism y la app en la misma máquina, sin depender de internet |

## Datos
- `server/seed/seed.json`: generado desde los Excel entregados (`tools/build_seed.py`).
- `data/BUK_2026-08_novedades.xlsx`: reporte BUK de agosto simulado con 10 novedades (2 altas + 1 reemplazo, 2 bajas, término de contrato, 3 cambios de jornada, cambio de cargo) y 6 errores intencionales.
- `data/SIC_atenciones_2026_ene-jul.xlsx`: atenciones realizadas simuladas (con casos bajo meta y sobre plan).
- `data/BUK_base_contratos_ene-jul.xlsx`: base original (ya está reflejada en el seed; si la cargas, la plataforma informa las diferencias entre BUK y el Excel de planificación).

## Estructura
```
server/   engine.js (motor) · ingest.js (validación + cambios) · routes.js (API) · store.js (Supabase) · pdf.js
client/   React + Vite + Recharts
blueprism/ .bpobject, .bpprocess, .bprelease, csharp/ (código de los code stages, compilable para pruebas)
tools/    generadores de seed, archivos demo y XML de Blue Prism
```

## Uso de IA
Se usó IA (Claude) como asistente para programar, analizar la lógica del Excel y generar los artefactos de Blue Prism; el equipo revisó y validó los resultados contra el Excel original.
