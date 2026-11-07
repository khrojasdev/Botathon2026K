# Blue Prism paso a paso · "Cada hora cuenta"

> **Resumen:** no programas nada en Blue Prism. Importas 2 archivos que ya traen todo, cambias **1 dato** (la URL de la plataforma), dejas los Excel en una carpeta y aprietas **Go**. Tiempo estimado: 20–30 minutos la primera vez.

---

## Parte 0 · Entiende qué vas a tener (2 min)

Vas a importar dos cosas. Así se usan en Blue Prism:

| Archivo | Qué es en Blue Prism | Para qué sirve |
|---|---|---|
| `Teleton - API Conector.bpobject` | Un **Business Object** (la "caja de herramientas") | Tiene 11 acciones listas: *Login, Listar Archivos, Leer Excel, Validar Reporte BUK, Validar Reporte SIC, Enviar Ingesta, Guardar Errores CSV, Mover Archivo, Latido, Obtener Institutos, Descargar Archivo* |
| `Teleton - Ingesta BUK SIC.bpprocess` | Un **Process** (el "guion" del robot) | Usa esas acciones en orden: entra a la plataforma → revisa la carpeta → lee y valida cada Excel → envía lo válido → guarda los errores → archiva → descarga los PDF por instituto |

El robot **no necesita Microsoft Excel** ni descargar nada de Digital Exchange.

---

## Parte 1 · Tu carpeta en el PC (ya está lista)

Todo está en **`C:\Users\khrva\OneDrive\Desktop\Botathon`**:

```
Botathon\
├─ cada-hora-cuenta\          ← la plataforma (código, datos demo, README)
│   └─ blueprism\             ← los 2 archivos para importar + esta guía
├─ robot\
│   ├─ Entrada\               ← aquí dejas los Excel de BUK/SIC
│   ├─ Procesados\            ← el robot mueve aquí lo procesado
│   ├─ Errores\               ← CSV con filas rechazadas
│   └─ Reportes\              ← PDF por instituto
└─ demo\                      ← copias de los Excel de prueba (para arrastrar a Entrada)
```

El proceso ya trae estas rutas configuradas, así que no tienes que cambiarlas.

Solo comprueba que la plataforma responda. Abre en el navegador:
- tu URL de Render (por ejemplo `https://cada-hora-cuenta.onrender.com`), o
- `http://localhost:3000` si la estás corriendo en tu PC (ver la sección "Correr la plataforma en tu PC").

> **OneDrive:** la carpeta está en el Escritorio sincronizado. Si el robot dice que un archivo "está en uso", pausa OneDrive durante la demo: clic en la nube de la barra de tareas → **Pausar sincronización**.

## Parte 2 · Importa en Blue Prism (5 min)

1. Abre **Blue Prism** e inicia sesión con el usuario que te dio la organización.
2. Importa **primero el objeto**:
   - Menú superior **File → Import → Process / Object**.
   - Clic en **Browse**, elige `Teleton - API Conector.bpobject` y luego **Next**.
   - Si pregunta qué hacer si ya existe: elige **Overwrite** (o **Import as new**). Luego **Next → Finish**.
3. Repite lo mismo con `Teleton - Ingesta BUK SIC.bpprocess`.
4. Ve a la pestaña **Studio** (columna izquierda). Ahora debes ver:
   - En **Objects**: `Teleton - API Conector`
   - En **Processes**: `Teleton - Ingesta BUK SIC`

> Si la importación da error en tu versión de Blue Prism, salta a la **Parte 7 (Plan B)**.

---

## Parte 3 · Revisa que el objeto compile (3 min)

1. En **Studio → Objects**, haz doble clic en **Teleton - API Conector**. Se abre *Object Studio*.
2. Arriba hay pestañas de páginas. Quédate en **Initialise**.
3. Haz doble clic en la caja grande **Business Object Properties**, abre la pestaña **Code Options** y revisa:
   - **Language:** `C#`
   - **External References:** deben aparecer `System.dll`, `System.Data.dll`, `System.Xml.dll`, `System.Drawing.dll`, `System.IO.Compression.dll` y `System.Core.dll`. Si falta alguna, escríbela abajo y presiona **Add**.
4. Abre la pestaña **Global Code** y presiona **Check Code**. Debe responder **"No errors"**.
   - ❌ *Si aparece un error con `ZipArchive`*: agrega también `System.IO.Compression.FileSystem.dll` en External References.
5. Presiona **OK** y luego **File → Save**. Cierra Object Studio.

---

## Parte 4 · Configura el proceso (3 min) ← el único paso con datos tuyos

1. En **Studio → Processes**, haz doble clic en **Teleton - Ingesta BUK SIC**.
2. En la página **Main Page**, a la derecha, verás unas cajas (Data Items) bajo la nota "CONFIGURACIÓN".
3. Haz doble clic en cada una y cambia el **Initial Value**:

| Data Item | Pon esto |
|---|---|
| **URL API** | La URL de Render **sin `/` al final**, por ejemplo `https://cada-hora-cuenta.onrender.com` |
| Email Robot | `bot@teleton.cl` (déjalo así) |
| Password Robot | `Teleton2026` (déjalo así) |
| Carpeta Entrada / Procesados / Errores / Reportes | Déjalos así (ya apuntan a `Botathon\robot\...`) |

4. **File → Save**. Si pide un comentario de versión, escribe por ejemplo "Configuración demo".
5. Menú **Process → Validate** (o el ícono ✓). No debe haber errores en rojo; las advertencias amarillas se pueden ignorar.

---

## Parte 5 · Primera prueba (5 min)

1. Abre la app en el navegador, entra como **Planificación central** y ve a **Reportes BUK / SIC**. Si quieres partir de cero, usa **Reiniciar demo**.
2. Copia los dos Excel de `Botathon\demo` a **`robot\Entrada`**.
3. Vuelve a Blue Prism con el proceso abierto en Process Studio:
   - Presiona **Reset** (botón con flecha circular) y después **Go** (▶).
   - Para mostrar el recorrido etapa por etapa, usa **Step** (F11) en vez de **Go**.
4. Cuando termine (unos 10–30 s), revisa lo siguiente:
   - **En la app → Reportes BUK / SIC:** aparecen 2 cargas con la etiqueta "🤖 Blue Prism". El BUK muestra **6 errores** y **11 cambios** (altas, bajas, reemplazo, jornada, cargo y término de contrato).
   - **En la app → Resumen nacional:** el robot figura "activo" y la planificación ya incluye agosto.
   - **`robot\Errores`:** quedan los CSV con las filas rechazadas.
   - **`robot\Procesados`:** quedan los dos Excel, con fecha y hora en el nombre.
   - **`robot\Reportes\<fecha>\`:** queda un PDF por instituto.

✅ Si ves todo eso, el robot ya está listo.

---

## Parte 6 · Dejarlo automático en Control Room (5 min, opcional pero luce)

1. En Process Studio: menú **Process → Properties** → marca **Publish this process to Control Room** → **OK** → **Save**.
2. Ve a la pestaña **Control** (Control Room).
3. Arrastra **Teleton - Ingesta BUK SIC** desde *Available Processes* hasta tu PC (aparece con el nombre de tu equipo) en *Resources*.
4. Clic derecho sobre la sesión creada → **Start**. Vas a ver el estado *Running* y luego *Completed*.
5. Para programarlo, ve a **Control → Scheduler → New Schedule**, agrega una Task con este proceso y tu PC, y elige por ejemplo "cada 5 minutos" durante la demo. Así basta con dejar un Excel en la carpeta y el robot lo procesa solo.

---

## Parte 7 · Plan B si el XML no se importa

Puedes armar lo mismo a mano en unos 20 minutos.

**Si falla el objeto:**
1. En **Studio**, clic derecho en **Objects → Create Object** y ponle de nombre `Teleton - API Conector`.
2. En la página **Initialise**, abre **Business Object Properties → Code Options**:
   - **Language:** C#.
   - Agrega las referencias indicadas en la Parte 3.
   - En **Global Code**, pega el bloque que va desde `// ===== Utilidades compartidas` hasta antes de `public void Login(` del archivo `blueprism/csharp/TeletonApiConector.cs`.
3. Por cada acción (Login, Listar Archivos, …):
   - Crea una página nueva con ese nombre.
   - Agrega un **Code stage**.
   - Define sus Inputs y Outputs con los mismos nombres y tipos del método en el `.cs`. En Blue Prism: `string` = Text, `decimal` = Number, `bool` = Flag, `DataTable` = Collection.
   - Pega el cuerpo del método en la pestaña **Code**.

**Si falla el proceso:** crea un proceso nuevo y arma este flujo, siempre con *Action → Business Object: Teleton - API Conector*:

```
Main Page:
  Start → Login → Listar Archivos (Carpeta=[Carpeta Entrada], Patron="*.xlsx")
        → Loop sobre [Archivos]
              → Página "Procesar Archivo" (Ruta=[Archivos.Ruta], Nombre=[Archivos.Nombre], Tipo=[Archivos.Tipo])
          fin Loop
        → Página "Distribuir Reportes" → Latido → End

Procesar Archivo:
  Start → Leer Excel → Decision [Tipo]="SIC" → (Validar Reporte SIC | Validar Reporte BUK con 44 y 42)
        → Decision [Cant Errores]>0 → Guardar Errores CSV
        → Enviar Ingesta → Mover Archivo a Procesados → Latido → End
  (Recover → Mover Archivo a Errores → Resume)

Distribuir Reportes:
  Start → Obtener Institutos → Loop [Institutos]
        → Calc URL = [URL API] & "/api/reportes/instituto/" & [Institutos.IT] & ".pdf"
        → Descargar Archivo → fin Loop → End
```

---

## Correr la plataforma en tu PC (sin Render)

1. Instala **Node.js 20 LTS** desde https://nodejs.org: botón **LTS** → siguiente, siguiente, finalizar.
2. Abre **PowerShell** y ejecuta:
   ```
   cd "C:\Users\khrva\OneDrive\Desktop\Botathon\cada-hora-cuenta"
   npm install
   npm run build
   npm start
   ```
3. Abre `http://localhost:3000`. En Blue Prism, deja **URL API** en `http://localhost:3000` (ya viene así por defecto).
   - Sin `DATABASE_URL` los datos viven en memoria y se pierden al cerrar, lo que basta para la demo.
   - Para guardar en Supabase, crea un archivo `.env` copiando `.env.example` y pega tu `DATABASE_URL`. Después ejecuta en PowerShell `$env:DATABASE_URL="..."; npm start`.

## Errores típicos

| Mensaje | Qué hacer |
|---|---|
| "No se pudo autenticar en la plataforma" | Si usas localhost: revisa que `npm start` siga abierto. Si usas Render: está dormido: abre la URL en el navegador, espera a que cargue y vuelve a ejecutar. Revisa también que *URL API* no termine en `/` |
| "The underlying connection was closed / SSL" | Actualiza .NET Framework a 4.7.2 o superior. El objeto ya fuerza TLS 1.2 |
| "Unable to find action …" | Importa el objeto **antes** que el proceso y guárdalo |
| El archivo no se procesa | El nombre debe contener `BUK` o `SIC`. Si no, el robot lo manda a `Errores` como "no reconocido" |
| Proxy de la red | Configura el proxy en *Opciones de Internet* de Windows: el robot usa ese mismo proxy |

---

## Guion de demo (5 min)

1. **Resumen nacional** (30 s): "de cada 100 horas, 57 llegan a atención directa". Filtra por instituto y por área.
2. **Robot** (60 s): deja el BUK de agosto en `robot\Entrada` y presiona **Start** en Control Room. Mientras corre, muestra el proceso en Studio.
3. **Resultado** (60 s): en *Reportes BUK / SIC* muestra los 6 errores (5 los detectó el robot y 1 la plataforma) y los 11 cambios con su impacto. Abre al profesional con disminución de jornada: los meses previos quedan cerrados 🔒.
4. **Asignación** (45 s): la jefatura solicita, la DMN aprueba y la meta se recalcula.
5. **Parámetros** (45 s): baja la meta a 85%, usa **Simular impacto**, aplica con motivo y muéstralo en *Cambios y versiones*.
6. **Distribución** (30 s): abre `robot\Reportes` con un PDF por instituto.

**Para la lámina de arquitectura:** Blue Prism hace las tareas repetitivas con archivos (recibir, leer, validar, informar, archivar y distribuir). La plataforma pone el criterio (reglas, cálculo, aprobación, versiones y tableros). Para escalar, se agregan Runtime Resources y una Work Queue por archivo; la API no guarda estado entre llamadas, así que crece horizontalmente.
