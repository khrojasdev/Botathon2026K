import sys; sys.path.insert(0, 'tools')
from bp_code import GLOBAL, ACTIONS
T = {'text': 'string', 'number': 'decimal', 'flag': 'bool', 'collection': 'DataTable', 'password': 'string'}
D = {'text': '""', 'number': '0', 'flag': 'false', 'collection': 'null', 'password': '""'}
out = ['using System;', 'using System.Data;', 'using System.Drawing;', 'public class TeletonApiConector {', GLOBAL]
for name, desc, ins, outs, body in ACTIONS:
    m = name.replace(' ', '_')
    params = [f"{T[t]} {n}" for n, t, _ in ins] + [f"out {T[o[1]]} {o[0]}" for o in outs]
    out.append(f"public void {m}({', '.join(params)}) {{")
    for o in outs: out.append(f"  {o[0]} = {D[o[1]]};")
    out.append(body)
    out.append('}')
out.append('}')
open('blueprism/csharp/TeletonApiConector.cs', 'w').write('\n'.join(out))
