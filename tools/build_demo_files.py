"""Genera archivos de demo: BUK de agosto con novedades + errores, y SIC simulado ene–jul."""
import json, random, sys, datetime as dt
import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
random.seed(2026)
BUK = sys.argv[1]
seed = json.load(open('server/seed/seed.json'))
b = pd.read_excel(BUK, header=1)
b = b.loc[:, ~b.columns.astype(str).str.startswith('Unnamed')]
b = b[b.PersonaId.notna()]
cols = list(b.columns)

def write(path, header, rows, sheet):
    wb = Workbook(); ws = wb.active; ws.title = sheet
    ws.append([None] * len(header))  # fila 1 vacía, como el reporte BUK original
    ws.append(header)
    for c in ws[2]: c.font = Font(bold=True, color='FFFFFF'); c.fill = PatternFill('solid', fgColor='1F4E78')
    for r in rows: ws.append(r)
    for i, h in enumerate(header):
        ws.column_dimensions[ws.cell(2, i + 1).column_letter].width = max(10, min(28, len(str(h)) + 4))
    wb.save(path)

# ---------- BUK agosto ----------
jul = b[pd.to_datetime(b.Periodo).dt.month == 7].copy()
jul['Periodo'] = dt.datetime(2026, 8, 1)
jul = jul[jul['Fecha Término'].isna() | (pd.to_datetime(jul['Fecha Término'], errors='coerce') >= dt.datetime(2026, 8, 1)) | (jul['Fecha Término'] == '')]
jul = jul.reset_index(drop=True)
header = cols + ['PersonaId Reemplazado']
rows = [list(r) + [None] for r in jul.itertuples(index=False)]
ix = {c: i for i, c in enumerate(header)}
log = []
def find(cargo, horas=None, it=None, skip=()):
    for k, r in enumerate(rows):
        if r[ix['Cargo']] == cargo and (horas is None or r[ix['Horas Semanales']] == horas) and (it is None or r[ix['IT']] == it) and k not in skip:
            # evitar profesionales multi-instituto
            pid = r[ix['PersonaId']]
            if sum(1 for f in seed['filas'] if f['persona_id'] == pid) == 1:
                return k
    return None
used = set()
# 1) disminución de jornada 42 -> 33 (kinesiólogo Valparaíso)
k = find('KINESIOLOGO', 42, 51); used.add(k); rows[k][ix['Horas Semanales']] = 33; log.append(('DISMINUCION_JORNADA', rows[k][ix['PersonaId']], '42→33'))
# 2) aumento de jornada 22 -> 33
k = find('TERAPEUTA OCUPACIONAL', 22, skip=used) or find('PSICOLOGO', 22, skip=used); used.add(k); rows[k][ix['Horas Semanales']] = 33; log.append(('AUMENTO_JORNADA', rows[k][ix['PersonaId']], '22→33'))
# 3) aumento 30 -> 42 fonoaudiólogo
k = find('FONOAUDIOLOGO', 30, skip=used) or find('FONOAUDIOLOGO', None, skip=used); used.add(k); old = rows[k][ix['Horas Semanales']]; rows[k][ix['Horas Semanales']] = 42; log.append(('AUMENTO_JORNADA', rows[k][ix['PersonaId']], f'{old}→42'))
# 4) cambio de cargo KINESIOLOGO -> JEFE KINESIOLOGIA (Santiago)
k = find('KINESIOLOGO', 42, 131, skip=used); used.add(k); rows[k][ix['Cargo']] = 'JEFE KINESIOLOGIA'; log.append(('CAMBIO_CARGO', rows[k][ix['PersonaId']], 'KINESIOLOGO→JEFE KINESIOLOGIA'))
# 5) término de contrato a mitad de mes
k = find('PSICOLOGO', None, 81, skip=used); used.add(k); rows[k][ix['Fecha Término']] = dt.datetime(2026, 8, 15); log.append(('TERMINO_CONTRATO', rows[k][ix['PersonaId']], '15-08-2026'))
# 6) bajas: dos profesionales que ya no vienen en el reporte
bajas = []
for cargo, it in [('EDUCADOR', 91), ('TERAPEUTA OCUPACIONAL', 141)]:
    k = find(cargo, None, it, skip=used)
    if k is not None: used.add(k); bajas.append(k); log.append(('BAJA', rows[k][ix['PersonaId']], 'no informado'))
titular = rows[bajas[0]][ix['PersonaId']] if bajas else None
tmpl = rows[bajas[0]][:] if bajas else rows[0][:]
rows = [r for i, r in enumerate(rows) if i not in bajas]
# 7) altas
def alta(pid, it, inst, area, sub, cc, cargo, horas, cod, tipo='Indefinido', tt='Titular', ingreso=dt.datetime(2026, 8, 3), termino=None, reemplaza=None, nac=dt.datetime(1994, 10, 2)):
    r = [None] * len(header)
    vals = {'IT': it, 'Instituto': inst, 'PersonaId': pid, 'Área': area, 'Nombre Sub-área': sub, 'Centro de Costo': cc, 'Fecha de Nacimiento': nac,
            'Periodo': dt.datetime(2026, 8, 1), 'Tipo de Contrato': tipo, 'Tipo_Trab_161225': None, 'Fecha Ingreso Compañía': ingreso, 'Fecha Término': termino,
            'Horas Semanales': horas, 'Cargo': cargo, 'Tipo_Trabajador': tt, 'Días de la Jornada': 'lmwjv', 'Reg_SIC': 'D - SIC', 'Cod_Esp': cod, 'Ndias': 5,
            'PersonaId Reemplazado': reemplaza}
    for k2, v in vals.items(): r[ix[k2]] = v
    rows.append(r); log.append(('ALTA' if tt == 'Titular' else 'ALTA_REEMPLAZO', pid, f'{cargo} {horas}h IT {it}'))
alta(150001, 51, 'Val', 'Valparaíso', 'Kinesiología', '300501', 'KINESIOLOGO', 42, 'KI')
alta(150002, 131, 'San', 'Santiago', 'Fonoaudiología', '300507', 'FONOAUDIOLOGO', 33, 'FO', ingreso=dt.datetime(2026, 8, 17))
alta(150003, 91, 'Tem', 'Temuco', 'Educación', '300510', 'EDUCADOR', 40, 'ED', tipo='Plazo fijo', tt='Reemplazo', termino=dt.datetime(2026, 12, 31), reemplaza=titular)
# 8) errores intencionales (los detecta el bot y la API)
e = rows[5][:]; e[ix['PersonaId']] = None; rows.append(e); log.append(('ERROR', None, 'PersonaId vacío'))
e = rows[6][:]; e[ix['Horas Semanales']] = 50; rows.append(e); log.append(('ERROR', e[ix['PersonaId']], '50 h > jornada legal'))
e = rows[7][:]; e[ix['PersonaId']] = 150010; e[ix['Cargo']] = 'TERAPEUTA DE REALIDAD VIRTUAL'; rows.append(e); log.append(('ERROR', 150010, 'cargo no homologado'))
e = rows[8][:]; e[ix['PersonaId']] = 150011; e[ix['Fecha Ingreso Compañía']] = dt.datetime(2026, 8, 20); e[ix['Fecha Término']] = dt.datetime(2026, 8, 1); rows.append(e); log.append(('ERROR', 150011, 'término < ingreso'))
rows.append(rows[10][:]); log.append(('ERROR', rows[10][ix['PersonaId']], 'duplicado'))
e = rows[11][:]; e[ix['PersonaId']] = 150012; e[ix['Horas Semanales']] = 'cuarenta'; rows.append(e); log.append(('ERROR', 150012, 'horas no numéricas'))
write('data/BUK_2026-08_novedades.xlsx', header, rows, 'Dotacion_2026')
json.dump(log, open('data/BUK_2026-08_novedades_esperado.json', 'w'), ensure_ascii=False, indent=1, default=str)
print('BUK agosto filas', len(rows)); [print(x) for x in log]

# ---------- SIC ene–jul ----------
srows = []
for f in seed['filas']:
    perf = random.gauss(0.93, 0.09)
    if random.random() < 0.06: perf = random.uniform(0.55, 0.75)   # bajo rendimiento → alerta
    if random.random() < 0.03: perf = random.uniform(1.2, 1.35)    # sobre plan → alerta
    for m in range(1, 8):
        plan = f['esperado']['dir'][m - 1]; plant = f['esperado']['tot'][m - 1]
        if plan <= 0: continue
        d = max(0, round(plan * perf * random.uniform(0.95, 1.05)))
        ind = max(0, round((plant - plan) * random.uniform(0.7, 1.05)))
        srows.append([f['persona_id'], f['it'], dt.datetime(2026, m, 1), d, ind])
srows.append([999999, 51, dt.datetime(2026, 7, 1), 40, 5])   # profesional inexistente
srows.append([srows[3][0], srows[3][1], dt.datetime(2026, 7, 1), -3, 0])  # negativo
wb = Workbook(); ws = wb.active; ws.title = 'Atenciones_SIC'
ws.append(['PersonaId', 'IT', 'Periodo', 'Atenciones Directas', 'Atenciones Indirectas'])
for c in ws[1]: c.font = Font(bold=True, color='FFFFFF'); c.fill = PatternFill('solid', fgColor='7B2C83')
for r in srows: ws.append(r)
for col in 'ABCDE': ws.column_dimensions[col].width = 20
wb.save('data/SIC_atenciones_2026_ene-jul.xlsx')
print('SIC filas', len(srows))
