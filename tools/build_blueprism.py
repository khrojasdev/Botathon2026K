"""Genera los archivos importables de Blue Prism:
   - blueprism/Teleton - API Conector.bpobject   (objeto de negocio con code stages C#)
   - blueprism/Teleton - Ingesta BUK SIC.bpprocess (proceso)
   - blueprism/Teleton - Cada hora cuenta.bprelease (paquete con ambos)
"""
import sys, uuid, datetime
from xml.sax.saxutils import escape, quoteattr
sys.path.insert(0, 'tools')
from bp_code import GLOBAL, ACTIONS

BPVERSION = '6.10.1.12345'
OBJ = 'Teleton - API Conector'
PROC = 'Teleton - Ingesta BUK SIC'
PROC2 = 'Teleton - Ingesta BUK SIC v2'
QUEUE = 'Teleton - Reportes'
WQ = 'Blueprism.Automate.clsWorkQueuesActions'
NS = uuid.UUID('6f1c1d0e-5b7a-4c2e-9d8f-0a1b2c3d4e5f')
gid = lambda *k: str(uuid.uuid5(NS, '|'.join(map(str, k))))
q = quoteattr

def view():
    return '<view><camerax>0</camerax><cameray>0</cameray><zoom version="2">1.25</zoom></view>'

class Page:
    def __init__(self, owner, name, sid=None):
        self.owner, self.name, self.sid = owner, name, sid
        self.stages = []
    def sub(self):
        return f'<subsheetid>{self.sid}</subsheetid>' if self.sid else ''
    def id(self, name):
        return gid(self.owner, self.name, name)
    def add(self, xml):
        self.stages.append(xml)

def disp(x, y, w=60, h=30):
    return f'<display x="{x}" y="{y}" w="{w}" h="{h}" />'

def nxt(t):
    return f'<onsuccess>{t}</onsuccess>' if t else ''

def data_stage(p, name, dtype, x, y, init=None, private=True, fields=None, narrative=''):
    if dtype == 'collection':
        f = ''.join(f'<field name={q(n)} type="{t}" />' for n, t in (fields or []))
        info = f'<collectioninfo>{f}</collectioninfo>' if fields else ''
        p.add(f'<stage stageid="{p.id("data:" + name)}" name={q(name)} type="Collection"><subsheetid_/>'
              f'<narrative>{escape(narrative)}</narrative>{disp(x, y, 90, 30)}<datatype>collection</datatype>'
              f'{"<private />" if private else ""}<alwaysinit />{info}</stage>'.replace('<subsheetid_/>', p.sub()))
    else:
        iv = '' if init is None else escape(str(init))
        iv_xml = f'<initialvalue xml:space="preserve">{iv}</initialvalue>' if iv else '<initialvalue />'
        p.add(f'<stage stageid="{p.id("data:" + name)}" name={q(name)} type="Data">{p.sub()}<narrative>{escape(narrative)}</narrative>'
              f'{disp(x, y, 90, 30)}<datatype>{dtype}</datatype>{iv_xml}{"<private />" if private else ""}<alwaysinit /></stage>')

def inputs_xml(items):
    # items: (type, name, expr)
    return '<inputs>' + ''.join(f'<input type="{t}" name={q(n)} expr={q(e)} />' for t, n, e in items) + '</inputs>'

def outputs_xml(items):
    return '<outputs>' + ''.join(f'<output type="{t}" name={q(n)} stage={q(s)} />' for t, n, s in items) + '</outputs>'

# =====================================================================
# OBJETO DE NEGOCIO
# =====================================================================
def build_object():
    main = Page(OBJ, 'Initialise')
    pages = []
    s_start, s_end = main.id('start'), main.id('end')
    main.add(f'<stage stageid="{s_start}" name="Start" type="Start"><loginhibit />{disp(15, -105)}{nxt(s_end)}</stage>')
    main.add(f'<stage stageid="{s_end}" name="End" type="End"><loginhibit />{disp(15, 90)}</stage>')
    refs = ['System.dll', 'System.Data.dll', 'System.Xml.dll', 'System.Drawing.dll', 'System.IO.Compression.dll', 'System.Core.dll']
    imps = ['System', 'System.Drawing', 'System.Data', 'System.Linq']
    main.add(f'<stage stageid="{main.id("info")}" name="Business Object Properties" type="ProcessInfo">'
             f'<narrative>Conector entre Blue Prism y la plataforma "Cada hora cuenta": lee reportes Excel de BUK y SIC sin Office, los valida, envía lo válido a la API, informa errores y descarga reportes por instituto.</narrative>'
             f'{disp(-195, -105, 150, 90)}<references>' + ''.join(f'<reference>{r}</reference>' for r in refs) + '</references>'
             '<imports>' + ''.join(f'<import>{i}</import>' for i in imps) + '</imports>'
             f'<language>csharp</language><globalcode><![CDATA[]]></globalcode><code><![CDATA[{GLOBAL}]]></code></stage>')
    main.add(f'<stage stageid="{main.id("note")}" name="Nota" type="Note"><narrative>Cada hora cuenta · Botathon Teletón 2026. Objeto sin dependencias de Microsoft Office: lee .xlsx con System.IO.Compression.</narrative>{disp(-195, 30, 150, 60)}</stage>')
    # Clean Up
    cu = Page(OBJ, 'Clean Up', gid(OBJ, 'page', 'Clean Up'))
    cs, ce = cu.id('start'), cu.id('end')
    cu.add(f'<stage stageid="{cs}" name="Start" type="Start">{cu.sub()}<loginhibit />{disp(15, -105)}{nxt(ce)}</stage>')
    cu.add(f'<stage stageid="{ce}" name="End" type="End">{cu.sub()}<loginhibit />{disp(15, 90)}</stage>')
    pages.append(('CleanUp', cu))
    for name, desc, ins, outs, body in ACTIONS:
        p = Page(OBJ, name, gid(OBJ, 'page', name))
        st, cd, en = p.id('start'), p.id('code'), p.id('end')
        p.add(f'<stage stageid="{st}" name="Start" type="Start">{p.sub()}<loginhibit />{disp(15, -105)}'
              + '<inputs>' + ''.join(f'<input type="{t}" name={q(n)} narrative={q(d)} stage={q(n)} />' for n, t, d in ins) + '</inputs>'
              + f'{nxt(cd)}</stage>')
        p.add(f'<stage stageid="{cd}" name={q(name)} type="Code">{p.sub()}<narrative>{escape(desc)}</narrative><loginhibit />{disp(15, -15, 90, 45)}'
              + inputs_xml([(t, n, f'[{n}]') for n, t, _ in ins])
              + outputs_xml([(o[1], o[0], o[0]) for o in outs])
              + f'{nxt(en)}<code><![CDATA[{body}]]></code></stage>')
        p.add(f'<stage stageid="{en}" name="End" type="End">{p.sub()}<loginhibit />{disp(15, 90)}'
              + '<outputs>' + ''.join(f'<output type="{o[1]}" name={q(o[0])} narrative={q(o[2])} stage={q(o[0])} />' for o in outs) + '</outputs></stage>')
        y = -105
        for n, t, d in ins:
            data_stage(p, n, t, 180, y, narrative=d, fields=None); y += 40
        for o in outs:
            data_stage(p, o[0], o[1], 300, -105 + 40 * outs.index(o), fields=o[3], narrative=o[2])
        p.add(f'<stage stageid="{p.id("note")}" name="Descripcion" type="Note">{p.sub()}<narrative>{escape(desc)}</narrative>{disp(-180, -105, 180, 60)}</stage>')
        pages.append(('Normal', p))
    xml = [f'<process name={q(OBJ)} version="1.0" bpversion="{BPVERSION}" narrative={q("Conector de la plataforma Cada hora cuenta (planificación asistencial Teletón).")} type="object" runmode="Exclusive">',
           view(), '<preconditions />', '<endpoint narrative="" />']
    for typ, p in pages:
        xml.append(f'<subsheet subsheetid="{p.sid}" type="{typ}" published="True"><name>{escape(p.name)}</name>{view()}</subsheet>')
    xml += main.stages
    for _, p in pages:
        xml += p.stages
    xml.append('</process>')
    return '\n'.join(xml)

# =====================================================================
# PROCESO
# =====================================================================
def action(p, sid, name, act, x, y, ins, outs, nxt_id, narrative='', obj=OBJ):
    p.add(f'<stage stageid="{sid}" name={q(name)} type="Action">{p.sub()}<narrative>{escape(narrative)}</narrative><loginhibit onsuccess="true" />{disp(x, y, 90, 30)}'
          + inputs_xml(ins) + outputs_xml(outs) + nxt(nxt_id) + f'<resource object={q(obj)} action={q(act)} /></stage>')

def calc(p, sid, name, expr, target, x, y, nxt_id):
    p.add(f'<stage stageid="{sid}" name={q(name)} type="Calculation">{p.sub()}<loginhibit onsuccess="true" />{disp(x, y, 90, 30)}{nxt(nxt_id)}'
          f'<calculation expression={q(expr)} stage={q(target)} /></stage>')

def decision(p, sid, name, expr, x, y, t, f):
    p.add(f'<stage stageid="{sid}" name={q(name)} type="Decision">{p.sub()}{disp(x, y, 90, 45)}<decision expression={q(expr)} /><ontrue>{t}</ontrue><onfalse>{f}</onfalse></stage>')

def note(p, name, text, x, y, w=210, h=90):
    p.add(f'<stage stageid="{p.id("note:" + name)}" name={q(name)} type="Note">{p.sub()}<narrative>{escape(text)}</narrative>{disp(x, y, w, h)}</stage>')

def build_process(PROC=PROC, cola=False):
    main = Page(PROC, 'Main Page')
    pf = Page(PROC, 'Procesar Archivo', gid(PROC, 'page', 'Procesar Archivo'))
    pr = Page(PROC, 'Distribuir Reportes', gid(PROC, 'page', 'Distribuir Reportes'))
    I = main.id
    # ---------------- Main Page ----------------
    main.add(f'<stage stageid="{I("start")}" name="Start" type="Start"><loginhibit />{disp(15, -255)}{nxt(I("login"))}</stage>')
    action(main, I('login'), 'Login plataforma', 'Login', 15, -195,
           [('text', 'UrlBase', '[URL API]'), ('text', 'Email', '[Email Robot]'), ('text', 'Password', '[Password Robot]')],
           [('text', 'Token', 'Token'), ('flag', 'Exito', 'Login OK'), ('text', 'Mensaje', 'Mensaje')], I('d_login'),
           'Obtiene un token JWT con la cuenta técnica del robot (rol bot).')
    decision(main, I('d_login'), '¿Login OK?', '[Login OK]', 15, -135, I('latido1'), I('exc_login'))
    main.add(f'<stage stageid="{I("exc_login")}" name="Error de login" type="Exception"><loginhibit />{disp(150, -135, 90, 30)}'
             f'<exception type="System Exception" detail={q("\"No se pudo autenticar en la plataforma: \" & [Mensaje]")} /></stage>')
    action(main, I('latido1'), 'Latido inicio', 'Latido', 15, -75,
           [('text', 'UrlBase', '[URL API]'), ('text', 'Token', '[Token]'), ('text', 'Mensaje', '"Robot iniciado: revisando carpeta de reportes"'), ('number', 'Archivos', '0')],
           [], I('listar'))
    action(main, I('listar'), 'Listar reportes pendientes', 'Listar Archivos', 15, -15,
           [('text', 'Carpeta', '[Carpeta Entrada]'), ('text', 'Patron', '"*.xlsx"')],
           [('collection', 'Archivos', 'Archivos'), ('number', 'Cantidad', 'Cantidad Archivos')], I('d_hay'))
    decision(main, I('d_hay'), '¿Hay archivos?', '[Cantidad Archivos] > 0', 15, 45, I('encolar') if cola else I('loop_s'), I('latido_nada'))
    action(main, I('latido_nada'), 'Latido sin archivos', 'Latido', 165, 45,
           [('text', 'UrlBase', '[URL API]'), ('text', 'Token', '[Token]'), ('text', 'Mensaje', '"Sin reportes nuevos en la carpeta de entrada"'), ('number', 'Archivos', '0')],
           [], I('end'))
    if cola:
        build_cola(main, pf, pr)
    g1 = gid(PROC, 'loop', 'archivos')
    main.add(f'<stage stageid="{I("loop_s")}" name="Por cada archivo" type="LoopStart"><loginhibit />{disp(15, 105, 90, 30)}{nxt(I("call_proc"))}'
             f'<groupid>{g1}</groupid><looptype>ForEach</looptype><loopdata>Archivos</loopdata></stage>')
    main.add(f'<stage stageid="{I("call_proc")}" name="Procesar Archivo" type="SubSheet"><loginhibit onsuccess="true" />{disp(15, 165, 90, 30)}'
             + inputs_xml([('text', 'Ruta', '[Archivos.Ruta]'), ('text', 'Nombre', '[Archivos.Nombre]'), ('text', 'Tipo', '[Archivos.Tipo]')])
             + f'<outputs />{nxt(I("loop_e"))}<processid>{pf.sid}</processid></stage>')
    main.add(f'<stage stageid="{I("loop_e")}" name="Por cada archivo" type="LoopEnd"><loginhibit />{disp(15, 225, 90, 30)}{nxt(I("call_rep"))}<groupid>{g1}</groupid></stage>')
    main.add(f'<stage stageid="{I("call_rep")}" name="Distribuir Reportes" type="SubSheet"><loginhibit onsuccess="true" />{disp(15, 285, 90, 30)}'
             f'<inputs /><outputs />{nxt(I("latido_fin"))}<processid>{pr.sid}</processid></stage>')
    action(main, I('latido_fin'), 'Latido fin', 'Latido', 15, 345,
           [('text', 'UrlBase', '[URL API]'), ('text', 'Token', '[Token]'), ('text', 'Mensaje', '"Ejecución finalizada: " & [Cantidad Archivos] & " reporte(s) procesado(s) y PDFs distribuidos"'), ('number', 'Archivos', '[Cantidad Archivos]')],
           [], I('end'))
    main.add(f'<stage stageid="{I("end")}" name="End" type="End"><loginhibit />{disp(15, 405)}</stage>')
    main.add(f'<stage stageid="{I("info")}" name="Proceso" type="ProcessInfo">{disp(-195, -255, 150, 90)}</stage>')
    # configuración (visible para todas las páginas)
    cfg = [('URL API', 'text', 'http://localhost:3000', 'URL de la plataforma (Render o local), sin / final'),
           ('Email Robot', 'text', 'bot@teleton.cl', 'Cuenta técnica con rol bot'),
           ('Password Robot', 'text', 'Teleton2026', 'Contraseña (en producción usar Credential Manager)'),
           ('Carpeta Entrada', 'text', r'C:\Users\khrva\OneDrive\Desktop\Botathon\robot\Entrada', 'Aquí GP deja los reportes BUK y SIC'),
           ('Carpeta Procesados', 'text', r'C:\Users\khrva\OneDrive\Desktop\Botathon\robot\Procesados', ''),
           ('Carpeta Errores', 'text', r'C:\Users\khrva\OneDrive\Desktop\Botathon\robot\Errores', 'CSV con filas rechazadas y archivos con fallas'),
           ('Carpeta Reportes', 'text', r'C:\Users\khrva\OneDrive\Desktop\Botathon\robot\Reportes', 'PDF por instituto para jefaturas')]
    note(main, 'Configuracion', 'CONFIGURACIÓN: edita los valores iniciales de estos datos antes de ejecutar (URL de la plataforma y carpetas).', 330, -275, 230, 40)
    for k, (n, t, v, d) in enumerate(cfg):
        data_stage(main, n, t, 330 + (k % 2) * 120, -215 + (k // 2) * 50, init=v, private=False, narrative=d)
    data_stage(main, 'Token', 'text', 330, -5, private=False)
    data_stage(main, 'Login OK', 'flag', 450, -5, init='False')
    data_stage(main, 'Mensaje', 'text', 330, 45)
    data_stage(main, 'Cantidad Archivos', 'number', 450, 45, init='0', private=False)
    data_stage(main, 'Archivos', 'collection', 390, 105, fields=[('Nombre', 'text'), ('Ruta', 'text'), ('Tipo', 'text')])
    note(main, 'Flujo', 'Robot "Cada hora cuenta": 1) inicia sesión en la plataforma, 2) toma cada Excel de BUK/SIC de la carpeta de entrada, 3) lo lee y valida fila a fila, 4) envía sólo lo válido y deja un CSV de errores, 5) mueve el archivo a Procesados, 6) descarga el PDF de planificación de cada instituto para sus jefaturas.', -240, 0, 210, 150)

    # ---------------- Procesar Archivo ----------------
    P = pf.id
    pf.add(f'<stage stageid="{P("start")}" name="Start" type="Start">{pf.sub()}<loginhibit />{disp(15, -255)}'
           '<inputs><input type="text" name="Ruta" stage="Ruta" /><input type="text" name="Nombre" stage="Nombre" /><input type="text" name="Tipo" stage="Tipo" /></inputs>'
           f'{nxt(P("d_tipo"))}</stage>')
    decision(pf, P('d_tipo'), '¿Tipo reconocido?', '[Tipo] <> "DESCONOCIDO"', 15, -195, P('leer'), P('mover_err0'))
    action(pf, P('mover_err0'), 'Archivo no reconocido a Errores', 'Mover Archivo', 165, -195,
           [('text', 'Origen', '[Ruta]'), ('text', 'CarpetaDestino', '[Carpeta Errores]')], [('text', 'NuevaRuta', 'Nueva Ruta')], P('end'))
    action(pf, P('leer'), 'Leer Excel', 'Leer Excel', 15, -135, [('text', 'Ruta', '[Ruta]')],
           [('collection', 'Datos', 'Datos'), ('number', 'Filas', 'Filas'), ('text', 'Hoja', 'Hoja')], P('d_sic'))
    decision(pf, P('d_sic'), '¿Es SIC?', '[Tipo] = "SIC"', 15, -75, P('val_sic'), P('val_buk'))
    val_out = [('collection', 'Validos', 'Validos'), ('collection', 'Errores', 'Errores'), ('number', 'CantValidos', 'Cant Validos'), ('number', 'CantErrores', 'Cant Errores')]
    action(pf, P('val_sic'), 'Validar SIC', 'Validar Reporte SIC', 165, -75, [('collection', 'Datos', '[Datos]')], val_out, P('d_err'))
    action(pf, P('val_buk'), 'Validar BUK', 'Validar Reporte BUK', -135, -75,
           [('collection', 'Datos', '[Datos]'), ('number', 'JornadaMaxEneAbr', '44'), ('number', 'JornadaMaxMayDic', '42')], val_out, P('d_err'))
    decision(pf, P('d_err'), '¿Hay errores?', '[Cant Errores] > 0', 15, -15, P('c_csv'), P('enviar'))
    calc(pf, P('c_csv'), 'Ruta CSV errores', '[Carpeta Errores] & "\\" & Replace([Nombre], ".xlsx", "") & "_errores_" & FormatDateTime(Now(), "yyyyMMdd_HHmmss") & ".csv"', 'Ruta CSV', 165, -15, P('csv'))
    action(pf, P('csv'), 'Guardar CSV de errores', 'Guardar Errores CSV', 165, 45,
           [('collection', 'Errores', '[Errores]'), ('text', 'Ruta', '[Ruta CSV]')], [], P('enviar'))
    action(pf, P('enviar'), 'Enviar a plataforma', 'Enviar Ingesta', 15, 105,
           [('text', 'UrlBase', '[URL API]'), ('text', 'Token', '[Token]'), ('text', 'Tipo', '[Tipo]'), ('text', 'Archivo', '[Nombre]'), ('collection', 'Validos', '[Validos]'), ('collection', 'Errores', '[Errores]')],
           [('flag', 'Exito', 'Envio OK'), ('number', 'IngestaId', 'Ingesta Id'), ('number', 'Cambios', 'Cambios'), ('text', 'Mensaje', 'Respuesta Mensaje'), ('text', 'Respuesta', 'Respuesta')], P('d_ok'))
    decision(pf, P('d_ok'), '¿Envío OK?', '[Envio OK]', 15, 165, P('mover_ok'), P('mover_err'))
    action(pf, P('mover_ok'), 'Mover a Procesados', 'Mover Archivo', 15, 225,
           [('text', 'Origen', '[Ruta]'), ('text', 'CarpetaDestino', '[Carpeta Procesados]')], [('text', 'NuevaRuta', 'Nueva Ruta')], P('latido'))
    action(pf, P('mover_err'), 'Mover a Errores', 'Mover Archivo', 165, 225,
           [('text', 'Origen', '[Ruta]'), ('text', 'CarpetaDestino', '[Carpeta Errores]')], [('text', 'NuevaRuta', 'Nueva Ruta')], P('latido'))
    action(pf, P('latido'), 'Informar resultado', 'Latido', 15, 285,
           [('text', 'UrlBase', '[URL API]'), ('text', 'Token', '[Token]'), ('text', 'Mensaje', '[Nombre] & ": " & [Respuesta Mensaje]'), ('number', 'Archivos', '[Cantidad Archivos]')], [], P('end'))
    pf.add(f'<stage stageid="{P("end")}" name="End" type="End">{pf.sub()}<loginhibit />{disp(15, 345)}'
           + ('<outputs><output type="flag" name="OK" stage="Envio OK" /><output type="text" name="Mensaje" stage="Respuesta Mensaje" /></outputs>' if cola else '') + '</stage>')
    # manejo de excepciones de la página
    pf.add(f'<stage stageid="{P("recover")}" name="Recover" type="Recover">{pf.sub()}{disp(330, 105, 60, 30)}{nxt(P("c_exc"))}</stage>')
    calc(pf, P('c_exc'), 'Detalle excepción', '"Falla procesando " & [Nombre] & ": " & ExceptionDetail()', 'Respuesta Mensaje', 330, 165, P('mover_exc'))
    action(pf, P('mover_exc'), 'Mover a Errores (excepción)', 'Mover Archivo', 330, 225,
           [('text', 'Origen', '[Ruta]'), ('text', 'CarpetaDestino', '[Carpeta Errores]')], [('text', 'NuevaRuta', 'Nueva Ruta')], P('resume'))
    pf.add(f'<stage stageid="{P("resume")}" name="Resume" type="Resume">{pf.sub()}{disp(330, 285, 60, 30)}{nxt(P("latido"))}</stage>')
    for k, (n, t, f) in enumerate([('Ruta', 'text', None), ('Nombre', 'text', None), ('Tipo', 'text', None), ('Datos', 'collection', None), ('Filas', 'number', None), ('Hoja', 'text', None),
                                    ('Validos', 'collection', None), ('Errores', 'collection', [('Fila', 'number'), ('Campo', 'text'), ('Valor', 'text'), ('Mensaje', 'text'), ('Severidad', 'text'), ('PersonaId', 'text')]),
                                    ('Cant Validos', 'number', None), ('Cant Errores', 'number', None), ('Ruta CSV', 'text', None), ('Envio OK', 'flag', None), ('Ingesta Id', 'number', None),
                                    ('Cambios', 'number', None), ('Respuesta Mensaje', 'text', None), ('Respuesta', 'text', None), ('Nueva Ruta', 'text', None)]):
        init = '0' if t == 'number' else ('False' if t == 'flag' else None)
        data_stage(pf, n, t, 480 + (k % 2) * 110, -255 + (k // 2) * 45, init=init, fields=f)
    note(pf, 'Nota', 'Valida cada fila ANTES de enviarla. Las filas con error no se envían como datos: quedan en un CSV en la carpeta de errores y se informan a la plataforma para que el equipo de planificación las vea.', -240, -255, 210, 120)

    # ---------------- Distribuir Reportes ----------------
    R = pr.id
    pr.add(f'<stage stageid="{R("start")}" name="Start" type="Start">{pr.sub()}<loginhibit />{disp(15, -195)}{nxt(R("inst"))}</stage>')
    action(pr, R('inst'), 'Obtener institutos', 'Obtener Institutos', 15, -135, [('text', 'UrlBase', '[URL API]'), ('text', 'Token', '[Token]')],
           [('collection', 'Institutos', 'Institutos')], R('loop_s'))
    g2 = gid(PROC, 'loop', 'institutos')
    pr.add(f'<stage stageid="{R("loop_s")}" name="Por cada instituto" type="LoopStart">{pr.sub()}<loginhibit />{disp(15, -75, 90, 30)}{nxt(R("c_url"))}'
           f'<groupid>{g2}</groupid><looptype>ForEach</looptype><loopdata>Institutos</loopdata></stage>')
    calc(pr, R('c_url'), 'URL del PDF', '[URL API] & "/api/reportes/instituto/" & [Institutos.IT] & ".pdf"', 'URL PDF', 15, -15, R('c_ruta'))
    calc(pr, R('c_ruta'), 'Ruta del PDF', '[Carpeta Reportes] & "\\" & FormatDate(Today(), "yyyy-MM-dd") & "\\Planificacion_" & [Institutos.Codigo] & ".pdf"', 'Ruta PDF', 15, 45, R('desc'))
    action(pr, R('desc'), 'Descargar PDF', 'Descargar Archivo', 15, 105,
           [('text', 'Url', '[URL PDF]'), ('text', 'Token', '[Token]'), ('text', 'Ruta', '[Ruta PDF]')], [('flag', 'Exito', 'Descarga OK'), ('number', 'Bytes', 'Bytes')], R('correo') if cola else R('loop_e'))
    if cola:
        action(pr, R('correo'), 'Preparar correo a jefatura', 'Preparar Correo', 15, 135,
               [('text', 'Para', '[Institutos.Correo]'), ('text', 'Asunto', '"Planificación asistencial 2026 - IT " & [Institutos.Nombre] & " (" & FormatDate(Today(), "dd-MM-yyyy") & ")"'),
                ('text', 'Cuerpo', '[Institutos.Resumen]'), ('text', 'Adjunto', '[Ruta PDF]'), ('text', 'Carpeta', '[Carpeta Reportes] & "\\" & FormatDate(Today(), "yyyy-MM-dd") & "\\Correos"')],
               [('text', 'RutaEml', 'Ruta Correo')], R('loop_e'), 'Deja un borrador .eml con el PDF adjunto. No se envía solo: la jefatura de planificación lo revisa y lo envía desde Outlook.')
    pr.add(f'<stage stageid="{R("loop_e")}" name="Por cada instituto" type="LoopEnd">{pr.sub()}<loginhibit />{disp(15, 195 if cola else 165, 90, 30)}{nxt(R("end"))}<groupid>{g2}</groupid></stage>')
    pr.add(f'<stage stageid="{R("end")}" name="End" type="End">{pr.sub()}<loginhibit />{disp(15, 255 if cola else 225)}</stage>')
    if cola:
        data_stage(pr, 'Ruta Correo', 'text', 300, 25)
    data_stage(pr, 'Institutos', 'collection', 180, -135, fields=[('IT', 'number'), ('Codigo', 'text'), ('Nombre', 'text')] + ([('Correo', 'text'), ('Resumen', 'text')] if cola else []))
    data_stage(pr, 'URL PDF', 'text', 180, -75)
    data_stage(pr, 'Ruta PDF', 'text', 180, -25)
    data_stage(pr, 'Descarga OK', 'flag', 300, -75, init='False')
    data_stage(pr, 'Bytes', 'number', 300, -25, init='0')
    note(pr, 'Nota', 'Distribución automática: deja en Carpeta Reportes\\<fecha> un PDF por instituto. Opcional: agrega aquí una acción "Send Message" del VBO de Outlook para enviarlo a cada jefatura.', -240, -195, 210, 100)

    nota_v = ' Versión 2: usa la cola de trabajo "' + QUEUE + '" (un ítem por archivo, con reintentos y trazabilidad en Control Room) y deja borradores de correo para cada jefatura.' if cola else ''
    xml = [f'<process name={q(PROC)} version="1.0" bpversion="{BPVERSION}" narrative={q("Automatiza la incorporación de reportes BUK y SIC a la planificación asistencial y distribuye los reportes por instituto." + nota_v)} byrefcollection="true">',
           view(), '<preconditions />', '<endpoint narrative="" />']
    for p in (pf, pr):
        xml.append(f'<subsheet subsheetid="{p.sid}" type="Normal" published="False"><name>{escape(p.name)}</name>{view()}</subsheet>')
    if cola:
        main.stages = [x for x in main.stages if not any(f'stageid="{I(k)}"' in x for k in ('loop_s', 'call_proc', 'loop_e'))]
    xml += main.stages + pf.stages + pr.stages
    xml.append('</process>')
    return '\n'.join(xml)

def build_cola(main, pf, pr):
    """Main Page v2: encola cada archivo en la Work Queue y la consume ítem a ítem."""
    I = main.id
    action(main, I('encolar'), 'Agregar archivos a la cola', 'Add To Queue', 15, 105,
           [('text', 'Queue Name', f'"{QUEUE}"'), ('collection', 'Data', '[Archivos]')],
           [('collection', 'Item IDs', 'Items Agregados')], I('get'),
           'Cada fila de Archivos (Nombre, Ruta, Tipo) se convierte en un ítem de la cola. Clave: Nombre.', obj=WQ)
    action(main, I('get'), 'Tomar siguiente ítem', 'Get Next Item', 15, 165,
           [('text', 'Queue Name', f'"{QUEUE}"')],
           [('text', 'Item ID', 'Item ID'), ('collection', 'Data', 'Item Data')], I('d_item'), obj=WQ)
    decision(main, I('d_item'), '¿Hay ítem?', 'Trim([Item ID]) <> ""', 15, 225, I('call_q'), I('call_rep'))
    main.add(f'<stage stageid="{I("call_q")}" name="Procesar Archivo" type="SubSheet"><loginhibit onsuccess="true" />{disp(-135, 225, 90, 30)}'
             + inputs_xml([('text', 'Ruta', '[Item Data.Ruta]'), ('text', 'Nombre', '[Item Data.Nombre]'), ('text', 'Tipo', '[Item Data.Tipo]')])
             + outputs_xml([('flag', 'OK', 'Item OK'), ('text', 'Mensaje', 'Mensaje')])
             + f'{nxt(I("d_ok"))}<processid>{pf.sid}</processid></stage>')
    decision(main, I('d_ok'), '¿Ítem OK?', '[Item OK]', -135, 285, I('done'), I('exc'))
    action(main, I('done'), 'Marcar completado', 'Mark Completed', -135, 345, [('text', 'Item ID', '[Item ID]')], [], I('get'), obj=WQ)
    action(main, I('exc'), 'Marcar excepción', 'Mark Exception', -285, 345,
           [('text', 'Item ID', '[Item ID]'), ('text', 'Exception Reason', '[Mensaje]')], [], I('get'), obj=WQ)
    data_stage(main, 'Item ID', 'text', 570, -5)
    data_stage(main, 'Item OK', 'flag', 570, 45, init='False')
    data_stage(main, 'Item Data', 'collection', 570, 105, fields=[('Nombre', 'text'), ('Ruta', 'text'), ('Tipo', 'text')])
    data_stage(main, 'Items Agregados', 'collection', 570, 155)
    note(main, 'Cola', 'COLA DE TRABAJO "' + QUEUE + '": crea la cola una vez en System > Workflow > Work Queues con campo clave "Nombre". Cada reporte queda como un ítem: si falla se marca como excepción con el motivo y se ve en Control Room.', -330, 105, 170, 130)

def release(obj_xml, proc_xml, proc2_xml=None):
    now = datetime.datetime.now().strftime('%Y-%m-%dT%H:%M:%S')
    oid, pid = gid('id', OBJ), gid('id', PROC)
    body = lambda x: x.replace('<process ', '<process xmlns="http://www.blueprism.co.uk/product/process" ', 1)
    return f'''<?xml version="1.0" encoding="utf-8"?>
<bpr:release xmlns:bpr="http://www.blueprism.co.uk/product/release">
<bpr:name>Cada hora cuenta - Botathon 2026</bpr:name>
<bpr:release-notes>Objeto Teleton - API Conector y procesos Teleton - Ingesta BUK SIC (v1 y v2 con cola de trabajo y borradores de correo).</bpr:release-notes>
<bpr:created>{now}</bpr:created>
<bpr:package-id>1</bpr:package-id>
<bpr:package-name>Cada hora cuenta</bpr:package-name>
<bpr:user-created-by>admin</bpr:user-created-by>
<bpr:contents count="{3 if proc2_xml else 2}">
<object id="{oid}" name={q(OBJ)} xmlns="http://www.blueprism.co.uk/product/object">
{body(obj_xml)}
</object>
<process id="{pid}" name={q(PROC)} xmlns="http://www.blueprism.co.uk/product/process">
{body(proc_xml)}
</process>
{f'<process id="{gid("id", PROC2)}" name={q(PROC2)} xmlns="http://www.blueprism.co.uk/product/process">' + chr(10) + body(proc2_xml) + chr(10) + '</process>' if proc2_xml else ''}
</bpr:contents>
</bpr:release>
'''

if __name__ == '__main__':
    o, p, p2 = build_object(), build_process(), build_process(PROC2, cola=True)
    open(f'blueprism/{PROC2}.bpprocess', 'w', encoding='utf-8').write('<?xml version="1.0" encoding="utf-8"?>\n' + p2)
    open(f'blueprism/{OBJ}.bpobject', 'w', encoding='utf-8').write('<?xml version="1.0" encoding="utf-8"?>\n' + o)
    open(f'blueprism/{PROC}.bpprocess', 'w', encoding='utf-8').write('<?xml version="1.0" encoding="utf-8"?>\n' + p)
    open('blueprism/Teleton - Cada hora cuenta.bprelease', 'w', encoding='utf-8').write(release(o, p, p2))
    print('ok')
