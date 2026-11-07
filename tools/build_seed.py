"""Genera server/seed/seed.json a partir de los Excel entregados por la organización.
Uso: python3 tools/build_seed.py <planificacion.xlsx> <base_contratos.xlsx>
"""
import sys, json, math, warnings, datetime as dt
import pandas as pd, numpy as np
from openpyxl.utils import get_column_letter as L, column_index_from_string as ci
warnings.filterwarnings('ignore')
PLAN, BUK = sys.argv[1], sys.argv[2]
OUT = sys.argv[3] if len(sys.argv) > 3 else 'server/seed/seed.json'

def C(s, m): return L(ci(s) + m)
def nz(v, d=0.0):
    try:
        f = float(v)
        return d if math.isnan(f) else f
    except Exception:
        return d
def sv(v):
    if v is None or v is pd.NaT: return None
    try:
        if pd.isna(v): return None
    except Exception: pass
    if isinstance(v, float) and math.isnan(v): return None
    if isinstance(v, (pd.Timestamp, dt.datetime)): return pd.Timestamp(v).strftime('%Y-%m-%d')
    s = str(v).strip()
    return s or None

# ---------------- BUK base (ene-jul) ----------------
b = pd.read_excel(BUK, header=1)
b = b.loc[:, ~b.columns.astype(str).str.startswith('Unnamed')]
b = b[b.PersonaId.notna()]
b['mes'] = pd.to_datetime(b.Periodo).dt.month
H = {(int(r.PersonaId), int(r.mes)): r for _, r in b.iterrows()}

# ---------------- Excepciones ----------------
ex = pd.read_excel(PLAN, sheet_name='Excepciones', header=1)
ex = ex[ex.PersonaId.notna()]
mcols = [c for c in ex.columns if isinstance(c, str) and c.startswith('01-')] or list(ex.columns[10:22])
EXC = {}
for _, r in ex.iterrows():
    EXC[(int(r.PersonaId), int(r.IT))] = [nz(r[c]) for c in ex.columns[10:22]]

# ---------------- Distribucion_NAC ----------------
t = pd.read_excel(PLAN, sheet_name='Distribucion_NAC', header=None, skiprows=6, nrows=86, usecols='A:N')
t.columns = ['esp','cargo','unidad','sd','si','d1','i1','n1','d2','i2','n2','d3','i3','n3']
t = t[t.cargo.notna()].drop_duplicates('cargo')
cargos = []
for _, r in t.iterrows():
    cargos.append(dict(cargo=r.cargo.strip(), cod_esp=sv(r.esp), unidad=sv(r.unidad), std_dir=nz(r.sd), std_ind=nz(r.si, 30),
        t1=[nz(r.d1), nz(r.i1), nz(r.n1)], t2=[nz(r.d2), nz(r.i2), nz(r.n2)], t3=[nz(r.d3), nz(r.i3), nz(r.n3)]))
# catálogo de asignaciones
ta = pd.read_excel(PLAN, sheet_name='Distribucion_NAC', header=None, skiprows=6, nrows=33, usecols='R:T')
ta.columns = ['nombre', 'horas', 'desc']
asig_cat = []
seen = set()
for _, r in ta.iterrows():
    n = sv(r.nombre)
    if not n or n.strip() in seen: continue
    seen.add(n.strip())
    desc = sv(r.desc) or ''
    asig_cat.append(dict(nombre=n.strip(), horas=(nz(r.horas) if not pd.isna(r.horas) else None), descripcion=desc,
                         requiere_autorizacion=('DMN' in desc)))

# ---------------- Parámetros: grupal + calendario + institutos ----------------
pw = pd.read_excel(PLAN, sheet_name='Parámetros', header=None)
grupal = []
for i in range(3, 8):
    grupal.append(dict(cod_esp=pw.iat[i, 5], pct=float(pw.iat[i, 6]), pac_sancon=float(pw.iat[i, 7]), pac_otros=float(pw.iat[i, 8])))
cal = []
for i in range(2, 14):
    cal.append(dict(mes=int(pw.iat[i, 18]), dias=int(pw.iat[i, 22]), inhabiles=int(pw.iat[i, 19]),
                    dias_habiles=int(pw.iat[i, 24]), semanas=float(pw.iat[i, 29])))
feriados = []
for i in range(105, 138):
    d, tipo = pw.iat[i, 10], pw.iat[i, 11]
    if isinstance(d, (dt.datetime, pd.Timestamp)) and tipo and 'Fin' not in str(tipo):
        feriados.append(dict(fecha=pd.Timestamp(d).strftime('%Y-%m-%d'), tipo=str(tipo).strip(), alcance='Nacional'))
feriados.append(dict(fecha='2026-06-07', tipo='Feriado regional Arica (Asalto y Toma del Morro)', alcance='Ari'))
feriados.append(dict(fecha='2026-08-20', tipo='Feriado regional Ñuble (Nacimiento del Prócer)', alcance='Nub'))

d = pd.read_excel(PLAN, sheet_name='Dotacion_Asistencial', header=3)
d = d[d['PersonaId'].notna()]
d.columns = [L(i + 1) for i in range(len(d.columns))]
inst = {}
for _, r in d.iterrows():
    inst[int(r.B)] = (r.C, r.D)
for _, r in b.iterrows():
    inst.setdefault(int(r.IT), (r.Instituto, r['Área']))
ZONA = {'Ari':'Norte','Iqu':'Norte','Ant':'Norte','Cal':'Norte','Cop':'Norte','Coq':'Norte','Val':'Centro','San':'Centro','OHi':'Centro',
        'Tal':'Centro-Sur','Con':'Centro-Sur','Nub':'Centro-Sur','Tem':'Sur','Vdv':'Sur','PMo':'Sur','Pmo':'Sur','Cas':'Sur','Coy':'Austral'}
institutos = []
for it, (code, name) in sorted(inst.items()):
    institutos.append(dict(it=it, codigo=code, nombre=name, zona=ZONA.get(code, 'Centro'),
                           grupo_grupal=('San-Con' if code in ('San', 'Con') else 'Otros'),
                           dias_adicionales_zona=(10 if code == 'Coy' else 5)))
for it, code, name in [(102, 'Cas', 'Castro'), (111, 'Coy', 'Coyhaique'), (161, 'Nub', 'Ñuble')]:
    if it not in inst:
        institutos.append(dict(it=it, codigo=code, nombre=name, zona=ZONA[code], grupo_grupal='Otros', dias_adicionales_zona=(10 if code=='Coy' else 5)))

# ---------------- Filas de planificación ----------------
num = lambda r, c: nz(r[c])
filas = []
for idx, (_, r) in enumerate(d.iterrows()):
    pid, it = int(r.K), int(r.B)
    T = pd.Timestamp(r['T']).month; U = pd.Timestamp(r['U']).month
    exc = EXC.get((pid, it))
    horas = []
    for m in range(1, 13):
        if m < T or m > U: horas.append(0.0); continue
        if exc is not None: horas.append(exc[m-1]); continue
        if m <= 7:
            hr = H.get((pid, m))
            horas.append(nz(hr['Horas Semanales']) if hr is not None else nz(r.W))
        else:
            horas.append(nz(r.W))
    base = [num(r, C('BI', m)) for m in range(12)]
    lic = [num(r, C('BV', m)) for m in range(12)]
    vac = [num(r, C('CH', m)) for m in range(12)]
    perm = [num(r, C('CT', m)) for m in range(12)]
    sem = [num(r, C('DZ', m)) for m in range(12)]
    otros = [base[m] - lic[m] - vac[m] - perm[m] - sem[m] for m in range(12)]
    asigs = []
    for (n, h, aut) in [('AL', 'AM', False), ('AN', 'AO', False), ('AP', 'AQ', True)]:
        if sv(r[n]):
            asigs.append(dict(nombre=sv(r[n]), horas=num(r, h), requiere_autorizacion=aut))
    if num(r, 'AR') > 0:
        asigs.append(dict(nombre='Otras asignaciones (Hrs. Asig. 4)', horas=num(r, 'AR'), requiere_autorizacion=False))
    hb = next((H[(pid, m)] for m in [7,6,5,4,3,2,1] if (pid, m) in H), None)
    filas.append(dict(
        id=idx + 1, persona_id=pid, it=it, cargo=str(r.M).strip(), cod_esp=sv(r.N), centro_costo=sv(r.O), desc_cc=sv(r.P),
        tipo_contrato=sv(r.Q), tipo_trabajador=(sv(hb['Tipo_Trabajador']) if hb is not None else sv(r.R)) or 'Titular',
        vacante=bool(sv(r.E)), excepcion=sv(r.F), licencia_extensa=(sv(r.S) == 'Si'),
        fecha_ingreso=sv(r.G), fecha_termino=sv(r.H), periodo_inicio=sv(r['T']), periodo_fin=sv(r['U']),
        colacion=(sv(r.AB) == 'S'), dias_semana=int(num(r, 'Z')), beneficio_colacion=num(r, 'AF') > 0,
        grupal_override=(num(r, 'BD') if num(r, 'BD') > 0 else None), mes_nacimiento=int(num(r, 'DH')) or None,
        dias_jornada=(sv(hb['Días de la Jornada']) if hb is not None else None),
        buk_ultimo=(dict(mes=int(hb['mes']), horas=nz(hb['Horas Semanales']), cargo=str(hb['Cargo']).strip().upper(), tipo_contrato=sv(hb['Tipo de Contrato']),
                         ndias=int(nz(hb['Ndias'])), fecha_termino=sv(hb['Fecha Término']), it=int(hb['IT'])) if hb is not None else None),
        horas=horas, base=base, lic=lic, vac=vac, perm=perm, otros=otros, asignaciones=asigs,
        esperado=dict(X=num(r, 'X'), AH=num(r, 'AH'), BA=num(r, 'BA'), BB=num(r, 'BB'), BF=num(r, 'BF'),
                      dir=[num(r, C('EN', m)) for m in range(12)], tot=[num(r, C('FA', m)) for m in range(12)],
                      mg_dir=[num(r, C('FN', m)) for m in range(12)], mg_tot=[num(r, C('GA', m)) for m in range(12)])
    ))

seed = dict(generado=dt.datetime.now().isoformat(timespec='seconds'), fuente=dict(plan=PLAN.split('/')[-1], buk=BUK.split('/')[-1]),
            institutos=institutos, cargos=cargos, grupal=grupal, asignaciones_catalogo=asig_cat, calendario=cal, feriados=feriados,
            filas=filas)
json.dump(seed, open(OUT, 'w'), ensure_ascii=False)
print('filas', len(filas), 'cargos', len(cargos), 'institutos', len(institutos), 'asig', len(asig_cat))
