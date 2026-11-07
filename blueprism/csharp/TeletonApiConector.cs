using System;
using System.Data;
using System.Drawing;
public class TeletonApiConector {

// ===== Utilidades compartidas (Cada hora cuenta · Botathon 2026) =====
static string JsonEsc(string s)
{
    if (s == null) return "";
    var sb = new System.Text.StringBuilder();
    foreach (char c in s)
    {
        switch (c)
        {
            case '"': sb.Append("\\\""); break;
            case '\\': sb.Append("\\\\"); break;
            case '\n': sb.Append("\\n"); break;
            case '\r': sb.Append("\\r"); break;
            case '\t': sb.Append("\\t"); break;
            default:
                if (c < 32) sb.Append("\\u" + ((int)c).ToString("x4")); else sb.Append(c);
                break;
        }
    }
    return sb.ToString();
}

static string TablaAJson(System.Data.DataTable t)
{
    var sb = new System.Text.StringBuilder("[");
    if (t != null)
    {
        for (int i = 0; i < t.Rows.Count; i++)
        {
            if (i > 0) sb.Append(",");
            sb.Append("{");
            for (int j = 0; j < t.Columns.Count; j++)
            {
                if (j > 0) sb.Append(",");
                object v = t.Rows[i][j];
                string s = (v == null || v == System.DBNull.Value) ? "" : System.Convert.ToString(v, System.Globalization.CultureInfo.InvariantCulture);
                sb.Append("\"").Append(JsonEsc(t.Columns[j].ColumnName)).Append("\":\"").Append(JsonEsc(s)).Append("\"");
            }
            sb.Append("}");
        }
    }
    return sb.Append("]").ToString();
}

static string Http(string metodo, string url, string token, string cuerpo, out int status)
{
    System.Net.ServicePointManager.SecurityProtocol = (System.Net.SecurityProtocolType)3072; // TLS 1.2
    var req = (System.Net.HttpWebRequest)System.Net.WebRequest.Create(url);
    req.Method = metodo;
    req.Timeout = 180000;
    req.Accept = "application/json";
    req.UserAgent = "BluePrism-CadaHoraCuenta/1.0";
    if (!string.IsNullOrEmpty(token)) req.Headers["Authorization"] = "Bearer " + token;
    if (cuerpo != null)
    {
        byte[] data = System.Text.Encoding.UTF8.GetBytes(cuerpo);
        req.ContentType = "application/json; charset=utf-8";
        req.ContentLength = data.Length;
        using (var s = req.GetRequestStream()) s.Write(data, 0, data.Length);
    }
    try
    {
        using (var resp = (System.Net.HttpWebResponse)req.GetResponse())
        using (var r = new System.IO.StreamReader(resp.GetResponseStream(), System.Text.Encoding.UTF8))
        { status = (int)resp.StatusCode; return r.ReadToEnd(); }
    }
    catch (System.Net.WebException ex)
    {
        if (ex.Response == null) { status = 0; return "{\"error\":\"" + JsonEsc(ex.Message) + "\"}"; }
        var resp = (System.Net.HttpWebResponse)ex.Response;
        status = (int)resp.StatusCode;
        using (var r = new System.IO.StreamReader(resp.GetResponseStream(), System.Text.Encoding.UTF8)) return r.ReadToEnd();
    }
}

static string JsonCampo(string json, string campo)
{
    var m = System.Text.RegularExpressions.Regex.Match(json ?? "", "\"" + campo + "\"\\s*:\\s*(\"((?:\\\\.|[^\"\\\\])*)\"|(-?[0-9.]+)|true|false|null)");
    if (!m.Success) return "";
    if (m.Groups[2].Success && m.Groups[1].Value.StartsWith("\"")) return System.Text.RegularExpressions.Regex.Unescape(m.Groups[2].Value);
    if (m.Groups[3].Success) return m.Groups[3].Value;
    return m.Groups[1].Value;
}

static string UrlUnir(string baseUrl, string ruta) { return (baseUrl ?? "").TrimEnd('/') + ruta; }

static decimal Num(string s)
{
    decimal d;
    if (string.IsNullOrWhiteSpace(s)) return -1;
    if (decimal.TryParse(s.Trim().Replace(",", "."), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out d)) return d;
    return -1;
}

static System.DateTime? Fecha(string s)
{
    if (string.IsNullOrWhiteSpace(s)) return null;
    s = s.Trim();
    System.DateTime d;
    string[] f = { "yyyy-MM-dd", "yyyy-MM-ddTHH:mm:ss", "dd-MM-yyyy", "dd/MM/yyyy", "d-M-yyyy", "d/M/yyyy", "yyyy/MM/dd", "dd-MM-yyyy HH:mm:ss", "dd/MM/yyyy HH:mm:ss" };
    if (System.DateTime.TryParseExact(s, f, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out d)) return d;
    double oa;
    if (double.TryParse(s, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out oa) && oa > 30000 && oa < 80000) return System.DateTime.FromOADate(oa);
    if (System.DateTime.TryParse(s, new System.Globalization.CultureInfo("es-CL"), System.Globalization.DateTimeStyles.None, out d)) return d;
    return null;
}

static string Col(System.Data.DataRow r, params string[] nombres)
{
    foreach (var n in nombres)
        foreach (System.Data.DataColumn c in r.Table.Columns)
            if (Norm(c.ColumnName) == Norm(n))
            {
                object v = r[c];
                return (v == null || v == System.DBNull.Value) ? "" : System.Convert.ToString(v, System.Globalization.CultureInfo.InvariantCulture).Trim();
            }
    return "";
}

static string Norm(string s)
{
    var sb = new System.Text.StringBuilder();
    foreach (char ch in (s ?? "").Normalize(System.Text.NormalizationForm.FormD).ToLowerInvariant())
        if (System.Globalization.CharUnicodeInfo.GetUnicodeCategory(ch) != System.Globalization.UnicodeCategory.NonSpacingMark && char.IsLetterOrDigit(ch)) sb.Append(ch);
    return sb.ToString();
}

static System.Data.DataTable NuevaTablaErrores()
{
    var t = new System.Data.DataTable("Errores");
    t.Columns.Add("Fila", typeof(decimal));
    t.Columns.Add("Campo", typeof(string));
    t.Columns.Add("Valor", typeof(string));
    t.Columns.Add("Mensaje", typeof(string));
    t.Columns.Add("Severidad", typeof(string));
    t.Columns.Add("PersonaId", typeof(string));
    return t;
}

// ---- Lector .xlsx sin Microsoft Office (OpenXML con System.IO.Compression) ----
static int ColIndex(string celda)
{
    int n = 0;
    foreach (char c in celda) { if (char.IsLetter(c)) n = n * 26 + (char.ToUpperInvariant(c) - 'A' + 1); else break; }
    return n - 1;
}

static System.Xml.XmlDocument LeerXml(System.IO.Compression.ZipArchive zip, string ruta)
{
    var e = zip.GetEntry(ruta);
    if (e == null) return null;
    var doc = new System.Xml.XmlDocument();
    using (var s = e.Open()) doc.Load(s);
    return doc;
}

static System.Data.DataTable LeerXlsx(string ruta, out string hoja)
{
    hoja = "";
    var tabla = new System.Data.DataTable("Datos");
    using (var fs = new System.IO.FileStream(ruta, System.IO.FileMode.Open, System.IO.FileAccess.Read, System.IO.FileShare.ReadWrite))
    using (var zip = new System.IO.Compression.ZipArchive(fs, System.IO.Compression.ZipArchiveMode.Read))
    {
        const string NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
        var ns = new System.Xml.XmlNamespaceManager(new System.Xml.NameTable());
        ns.AddNamespace("x", NS);
        ns.AddNamespace("r", "http://schemas.openxmlformats.org/officeDocument/2006/relationships");
        ns.AddNamespace("p", "http://schemas.openxmlformats.org/package/2006/relationships");
        // textos compartidos
        var compartidos = new System.Collections.Generic.List<string>();
        var ss = LeerXml(zip, "xl/sharedStrings.xml");
        if (ss != null)
        {
            ns.AddNamespace("s", ss.DocumentElement.NamespaceURI);
            foreach (System.Xml.XmlNode si in ss.SelectNodes("//s:si", ns))
            {
                var sb = new System.Text.StringBuilder();
                foreach (System.Xml.XmlNode tn in si.SelectNodes(".//s:t", ns)) sb.Append(tn.InnerText);
                compartidos.Add(sb.ToString());
            }
        }
        // primera hoja del libro
        var wb = LeerXml(zip, "xl/workbook.xml");
        var sheet = wb.SelectSingleNode("//x:sheets/x:sheet", ns);
        hoja = sheet.Attributes["name"].Value;
        string rid = sheet.Attributes["id", "http://schemas.openxmlformats.org/officeDocument/2006/relationships"].Value;
        var rels = LeerXml(zip, "xl/_rels/workbook.xml.rels");
        string destino = "worksheets/sheet1.xml";
        foreach (System.Xml.XmlNode rel in rels.SelectNodes("//p:Relationship", ns))
            if (rel.Attributes["Id"].Value == rid) destino = rel.Attributes["Target"].Value;
        destino = destino.StartsWith("/") ? destino.TrimStart('/') : "xl/" + destino;
        var ws = LeerXml(zip, destino);
        var filas = new System.Collections.Generic.List<System.Collections.Generic.KeyValuePair<int, string[]>>();
        int maxCol = 0;
        foreach (System.Xml.XmlNode row in ws.SelectNodes("//x:sheetData/x:row", ns))
        {
            int rnum = int.Parse(row.Attributes["r"].Value);
            var celdas = new System.Collections.Generic.Dictionary<int, string>();
            foreach (System.Xml.XmlNode c in row.SelectNodes("x:c", ns))
            {
                int ci = ColIndex(c.Attributes["r"].Value);
                string t = c.Attributes["t"] != null ? c.Attributes["t"].Value : "";
                string val = "";
                var v = c.SelectSingleNode("x:v", ns);
                if (t == "s" && v != null) val = compartidos[int.Parse(v.InnerText)];
                else if (t == "inlineStr") { var isn = c.SelectSingleNode(".//x:t", ns); val = isn != null ? isn.InnerText : ""; }
                else if (v != null) val = v.InnerText;
                celdas[ci] = val;
                if (ci + 1 > maxCol) maxCol = ci + 1;
            }
            var arr = new string[System.Math.Max(maxCol, 1)];
            foreach (var kv in celdas) { if (kv.Key >= arr.Length) System.Array.Resize(ref arr, kv.Key + 1); arr[kv.Key] = kv.Value; }
            filas.Add(new System.Collections.Generic.KeyValuePair<int, string[]>(rnum, arr));
        }
        // encabezado: primera fila que contiene "PersonaId"
        int h = filas.FindIndex(f => System.Array.Exists(f.Value, x => Norm(x) == "personaid"));
        if (h < 0) h = 0;
        if (filas.Count == 0) return tabla;
        string[] enc = filas[h].Value;
        var usadas = new System.Collections.Generic.List<int>();
        tabla.Columns.Add("Fila", typeof(decimal));
        for (int j = 0; j < enc.Length; j++)
        {
            string nom = (enc[j] ?? "").Trim();
            if (nom.Length == 0 || tabla.Columns.Contains(nom)) continue;
            tabla.Columns.Add(nom, typeof(string));
            usadas.Add(j);
        }
        for (int i = h + 1; i < filas.Count; i++)
        {
            string[] f = filas[i].Value;
            bool vacia = true;
            var dr = tabla.NewRow();
            dr["Fila"] = (decimal)filas[i].Key;
            foreach (int j in usadas)
            {
                string val = j < f.Length ? (f[j] ?? "") : "";
                string nom = enc[j].Trim();
                string nn = Norm(nom);
                // fechas: Excel las guarda como número de serie
                if ((nn.Contains("fecha") || nn == "periodo") && val.Length > 0)
                {
                    double oa;
                    if (double.TryParse(val, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out oa) && oa > 1000 && oa < 100000)
                        val = System.DateTime.FromOADate(oa).ToString("yyyy-MM-dd");
                }
                if (val.Length > 0) vacia = false;
                dr[nom] = val;
            }
            if (!vacia) tabla.Rows.Add(dr);
        }
    }
    return tabla;
}

public void Login(string UrlBase, string Email, string Password, out string Token, out bool Exito, out string Mensaje) {
  Token = "";
  Exito = false;
  Mensaje = "";

int status;
string resp = Http("POST", UrlUnir(UrlBase, "/api/auth/login"), null,
    "{\"email\":\"" + JsonEsc(Email) + "\",\"password\":\"" + JsonEsc(Password) + "\"}", out status);
Token = JsonCampo(resp, "token");
Exito = status == 200 && Token.Length > 0;
Mensaje = Exito ? "Autenticado como " + Email : ("Error " + status + ": " + JsonCampo(resp, "error"));

}
public void Listar_Archivos(string Carpeta, string Patron, out DataTable Archivos, out decimal Cantidad) {
  Archivos = null;
  Cantidad = 0;

Archivos = new DataTable("Archivos");
Archivos.Columns.Add("Nombre", typeof(string));
Archivos.Columns.Add("Ruta", typeof(string));
Archivos.Columns.Add("Tipo", typeof(string));
if (!System.IO.Directory.Exists(Carpeta)) System.IO.Directory.CreateDirectory(Carpeta);
string patron = string.IsNullOrEmpty(Patron) ? "*.xlsx" : Patron;
var lista = new System.IO.DirectoryInfo(Carpeta).GetFiles(patron);
System.Array.Sort(lista, (a, b) => a.LastWriteTime.CompareTo(b.LastWriteTime));
foreach (var f in lista)
{
    if (f.Name.StartsWith("~$")) continue; // archivo temporal de Excel abierto
    string n = Norm(f.Name);
    string tipo = n.Contains("sic") ? "SIC" : (n.Contains("buk") || n.Contains("contrato") || n.Contains("dotacion")) ? "BUK" : "DESCONOCIDO";
    Archivos.Rows.Add(f.Name, f.FullName, tipo);
}
Cantidad = Archivos.Rows.Count;

}
public void Leer_Excel(string Ruta, out DataTable Datos, out decimal Filas, out string Hoja) {
  Datos = null;
  Filas = 0;
  Hoja = "";

string h;
Datos = LeerXlsx(Ruta, out h);
Hoja = h;
Filas = Datos.Rows.Count;

}
public void Validar_Reporte_BUK(DataTable Datos, decimal JornadaMaxEneAbr, decimal JornadaMaxMayDic, out DataTable Validos, out DataTable Errores, out decimal CantValidos, out decimal CantErrores) {
  Validos = null;
  Errores = null;
  CantValidos = 0;
  CantErrores = 0;

Validos = Datos.Clone();
Errores = NuevaTablaErrores();
decimal maxA = JornadaMaxEneAbr > 0 ? JornadaMaxEneAbr : 44;
decimal maxB = JornadaMaxMayDic > 0 ? JornadaMaxMayDic : 42;
var vistos = new System.Collections.Generic.Dictionary<string, decimal>();
foreach (DataRow r in Datos.Rows)
{
    decimal fila = Datos.Columns.Contains("Fila") ? System.Convert.ToDecimal(r["Fila"]) : Datos.Rows.IndexOf(r) + 2;
    var errs = new System.Collections.Generic.List<string[]>();
    string pid = Col(r, "PersonaId"), it = Col(r, "IT"), per = Col(r, "Periodo"), hs = Col(r, "Horas Semanales"), cargo = Col(r, "Cargo");
    string fi = Col(r, "Fecha Ingreso Compañía", "Fecha Ingreso"), ft = Col(r, "Fecha Término", "Fecha Termino"), nd = Col(r, "Ndias");
    decimal npid = Num(pid);
    if (npid <= 0 || npid != System.Math.Floor(npid)) errs.Add(new[] { "PersonaId", pid, "PersonaId vacío o no numérico" });
    if (Num(it) <= 0) errs.Add(new[] { "IT", it, "Código de instituto vacío o inválido" });
    var dper = Fecha(per);
    if (dper == null) errs.Add(new[] { "Periodo", per, "Periodo vacío o con formato inválido" });
    decimal h = Num(hs);
    if (h < 0) errs.Add(new[] { "Horas Semanales", hs, "Horas semanales vacías o no numéricas" });
    else if (h == 0) errs.Add(new[] { "Horas Semanales", hs, "Horas semanales deben ser mayores a 0" });
    else if (dper != null)
    {
        decimal max = dper.Value.Month <= 4 ? maxA : maxB;
        if (h > max) errs.Add(new[] { "Horas Semanales", hs, "Supera la jornada legal vigente (" + max + " h)" });
    }
    if (cargo.Length == 0) errs.Add(new[] { "Cargo", cargo, "Cargo vacío" });
    var dfi = Fecha(fi); var dft = Fecha(ft);
    if (fi.Length > 0 && dfi == null) errs.Add(new[] { "Fecha Ingreso", fi, "Fecha de ingreso inválida" });
    if (ft.Length > 0 && dft == null) errs.Add(new[] { "Fecha Término", ft, "Fecha de término inválida" });
    if (dfi != null && dft != null && dft < dfi) errs.Add(new[] { "Fecha Término", ft, "Fecha de término anterior a la fecha de ingreso" });
    if (nd.Length > 0 && (Num(nd) < 1 || Num(nd) > 7)) errs.Add(new[] { "Ndias", nd, "Días de jornada fuera de rango (1-7)" });
    if (errs.Count == 0)
    {
        string key = pid + "|" + it + "|" + dper.Value.ToString("yyyy-MM");
        if (vistos.ContainsKey(key)) errs.Add(new[] { "PersonaId", pid, "Registro duplicado (igual a la fila " + vistos[key] + ")" });
        else vistos[key] = fila;
    }
    foreach (var e in errs) Errores.Rows.Add(fila, e[0], e[1], e[2], "error", pid);
    if (errs.Count == 0) Validos.ImportRow(r);
}
CantValidos = Validos.Rows.Count;
CantErrores = Errores.Rows.Count;

}
public void Validar_Reporte_SIC(DataTable Datos, out DataTable Validos, out DataTable Errores, out decimal CantValidos, out decimal CantErrores) {
  Validos = null;
  Errores = null;
  CantValidos = 0;
  CantErrores = 0;

Validos = Datos.Clone();
Errores = NuevaTablaErrores();
var vistos = new System.Collections.Generic.HashSet<string>();
foreach (DataRow r in Datos.Rows)
{
    decimal fila = Datos.Columns.Contains("Fila") ? System.Convert.ToDecimal(r["Fila"]) : Datos.Rows.IndexOf(r) + 2;
    var errs = new System.Collections.Generic.List<string[]>();
    string pid = Col(r, "PersonaId"), it = Col(r, "IT"), per = Col(r, "Periodo");
    string d = Col(r, "Atenciones Directas", "Directas"), ind = Col(r, "Atenciones Indirectas", "Indirectas");
    if (Num(pid) <= 0) errs.Add(new[] { "PersonaId", pid, "PersonaId vacío o no numérico" });
    if (Num(it) <= 0) errs.Add(new[] { "IT", it, "Instituto inválido" });
    var dp = Fecha(per);
    if (dp == null) errs.Add(new[] { "Periodo", per, "Periodo inválido" });
    decimal dv, iv;
    if (!decimal.TryParse(d.Replace(",", "."), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out dv)) errs.Add(new[] { "Atenciones Directas", d, "Valor vacío o no numérico" });
    else if (dv < 0) errs.Add(new[] { "Atenciones Directas", d, "Atenciones negativas" });
    if (ind.Length > 0 && (!decimal.TryParse(ind.Replace(",", "."), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out iv) || iv < 0)) errs.Add(new[] { "Atenciones Indirectas", ind, "Atenciones negativas o no numéricas" });
    if (errs.Count == 0)
    {
        string key = pid + "|" + it + "|" + dp.Value.ToString("yyyy-MM");
        if (!vistos.Add(key)) errs.Add(new[] { "PersonaId", pid, "Registro duplicado" });
    }
    foreach (var e in errs) Errores.Rows.Add(fila, e[0], e[1], e[2], "error", pid);
    if (errs.Count == 0) Validos.ImportRow(r);
}
CantValidos = Validos.Rows.Count;
CantErrores = Errores.Rows.Count;

}
public void Enviar_Ingesta(string UrlBase, string Token, string Tipo, string Archivo, DataTable Validos, DataTable Errores, out bool Exito, out decimal IngestaId, out decimal Cambios, out string Mensaje, out string Respuesta) {
  Exito = false;
  IngestaId = 0;
  Cambios = 0;
  Mensaje = "";
  Respuesta = "";

string body = "{\"tipo\":\"" + JsonEsc(Tipo) + "\",\"archivo\":\"" + JsonEsc(Archivo) + "\",\"filas\":" + TablaAJson(Validos) + ",\"errores\":" + TablaAJson(Errores) + "}";
int status;
Respuesta = Http("POST", UrlUnir(UrlBase, "/api/bot/ingesta"), Token, body, out status);
Exito = status == 200;
decimal n;
IngestaId = decimal.TryParse(JsonCampo(Respuesta, "ingesta_id"), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out n) ? n : 0;
Cambios = decimal.TryParse(JsonCampo(Respuesta, "cambios"), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out n) ? n : 0;
Mensaje = Exito ? JsonCampo(Respuesta, "mensaje") : ("Error " + status + ": " + JsonCampo(Respuesta, "error"));

}
public void Guardar_Errores_CSV(DataTable Errores, string Ruta, out bool Exito) {
  Exito = false;

string dir = System.IO.Path.GetDirectoryName(Ruta);
if (!string.IsNullOrEmpty(dir) && !System.IO.Directory.Exists(dir)) System.IO.Directory.CreateDirectory(dir);
var sb = new System.Text.StringBuilder();
for (int j = 0; j < Errores.Columns.Count; j++) { if (j > 0) sb.Append(";"); sb.Append(Errores.Columns[j].ColumnName); }
sb.AppendLine();
foreach (DataRow r in Errores.Rows)
{
    for (int j = 0; j < Errores.Columns.Count; j++)
    {
        if (j > 0) sb.Append(";");
        string v = System.Convert.ToString(r[j]) ?? "";
        sb.Append("\"").Append(v.Replace("\"", "\"\"")).Append("\"");
    }
    sb.AppendLine();
}
System.IO.File.WriteAllText(Ruta, sb.ToString(), new System.Text.UTF8Encoding(true));
Exito = true;

}
public void Mover_Archivo(string Origen, string CarpetaDestino, out string NuevaRuta) {
  NuevaRuta = "";

if (!System.IO.Directory.Exists(CarpetaDestino)) System.IO.Directory.CreateDirectory(CarpetaDestino);
string nombre = System.IO.Path.GetFileNameWithoutExtension(Origen) + "_" + System.DateTime.Now.ToString("yyyyMMdd_HHmmss") + System.IO.Path.GetExtension(Origen);
NuevaRuta = System.IO.Path.Combine(CarpetaDestino, nombre);
System.IO.File.Move(Origen, NuevaRuta);

}
public void Latido(string UrlBase, string Token, string Mensaje, decimal Archivos, out bool Exito) {
  Exito = false;

int status;
string body = "{\"mensaje\":\"" + JsonEsc(Mensaje) + "\",\"maquina\":\"" + JsonEsc(System.Environment.MachineName) + "\",\"ejecucion\":{\"archivos\":" + System.Convert.ToString(Archivos, System.Globalization.CultureInfo.InvariantCulture) + "}}";
Http("POST", UrlUnir(UrlBase, "/api/bot/heartbeat"), Token, body, out status);
Exito = status == 200;

}
public void Obtener_Institutos(string UrlBase, string Token, out DataTable Institutos) {
  Institutos = null;

int status;
string resp = Http("GET", UrlUnir(UrlBase, "/api/bot/institutos"), Token, null, out status);
Institutos = new DataTable("Institutos");
Institutos.Columns.Add("IT", typeof(decimal));
Institutos.Columns.Add("Codigo", typeof(string));
Institutos.Columns.Add("Nombre", typeof(string));
Institutos.Columns.Add("Correo", typeof(string));
Institutos.Columns.Add("Resumen", typeof(string));
foreach (System.Text.RegularExpressions.Match m in System.Text.RegularExpressions.Regex.Matches(resp, "\\{[^{}]*\\}"))
{
    string o = m.Value;
    decimal it;
    if (decimal.TryParse(JsonCampo(o, "IT"), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out it))
        Institutos.Rows.Add(it, JsonCampo(o, "Codigo"), JsonCampo(o, "Nombre"), JsonCampo(o, "Correo"), JsonCampo(o, "Resumen"));
}

}
public void Descargar_Archivo(string Url, string Token, string Ruta, out bool Exito, out decimal Bytes) {
  Exito = false;
  Bytes = 0;

System.Net.ServicePointManager.SecurityProtocol = (System.Net.SecurityProtocolType)3072;
string dir = System.IO.Path.GetDirectoryName(Ruta);
if (!string.IsNullOrEmpty(dir) && !System.IO.Directory.Exists(dir)) System.IO.Directory.CreateDirectory(dir);
using (var wc = new System.Net.WebClient())
{
    wc.Headers["Authorization"] = "Bearer " + Token;
    wc.DownloadFile(Url, Ruta);
}
var fi = new System.IO.FileInfo(Ruta);
Bytes = fi.Length;
Exito = fi.Length > 0;

}
public void Preparar_Correo(string Para, string Asunto, string Cuerpo, string Adjunto, string Carpeta, out string RutaEml) {
  RutaEml = "";

if (!System.IO.Directory.Exists(Carpeta)) System.IO.Directory.CreateDirectory(Carpeta);
var enc = System.Text.Encoding.UTF8;
string limite = "----=_ChC_" + System.Guid.NewGuid().ToString("N");
var sb = new System.Text.StringBuilder();
sb.Append("X-Unsent: 1\r\n");
sb.Append("To: " + Para + "\r\n");
sb.Append("Subject: =?utf-8?B?" + System.Convert.ToBase64String(enc.GetBytes(Asunto ?? "")) + "?=\r\n");
sb.Append("MIME-Version: 1.0\r\n");
sb.Append("Content-Type: multipart/mixed; boundary=\"" + limite + "\"\r\n\r\n");
sb.Append("--" + limite + "\r\n");
sb.Append("Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n");
sb.Append(System.Convert.ToBase64String(enc.GetBytes(Cuerpo ?? ""), System.Base64FormattingOptions.InsertLineBreaks) + "\r\n");
if (!string.IsNullOrEmpty(Adjunto) && System.IO.File.Exists(Adjunto))
{
    string nombre = System.IO.Path.GetFileName(Adjunto);
    sb.Append("--" + limite + "\r\n");
    sb.Append("Content-Type: application/pdf; name=\"" + nombre + "\"\r\nContent-Transfer-Encoding: base64\r\n");
    sb.Append("Content-Disposition: attachment; filename=\"" + nombre + "\"\r\n\r\n");
    sb.Append(System.Convert.ToBase64String(System.IO.File.ReadAllBytes(Adjunto), System.Base64FormattingOptions.InsertLineBreaks) + "\r\n");
}
sb.Append("--" + limite + "--\r\n");
string baseNombre = string.IsNullOrEmpty(Adjunto) ? "Correo" : System.IO.Path.GetFileNameWithoutExtension(Adjunto);
RutaEml = System.IO.Path.Combine(Carpeta, baseNombre + ".eml");
System.IO.File.WriteAllText(RutaEml, sb.ToString(), new System.Text.UTF8Encoding(false));

}
}