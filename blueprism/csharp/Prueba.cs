using System; using System.Data;
public class Prueba {
  public static void Main(string[] a) {
    var o = new TeletonApiConector(); string url = a[0], carpeta = a[1];
    string tok; bool ok; string msg;
    o.Login(url, "bot@teleton.cl", "Teleton2026", out tok, out ok, out msg); Console.WriteLine("Login: " + ok + " " + msg);
    o.Latido(url, tok, "Inicio prueba mono", 0, out ok);
    DataTable arch; decimal n; o.Listar_Archivos(carpeta, "*.xlsx", out arch, out n); Console.WriteLine("Archivos: " + n);
    foreach (DataRow r in arch.Rows) {
      DataTable datos; decimal filas; string hoja; o.Leer_Excel((string)r["Ruta"], out datos, out filas, out hoja);
      Console.WriteLine(r["Nombre"] + " [" + r["Tipo"] + "] hoja=" + hoja + " filas=" + filas + " cols=" + datos.Columns.Count);
      if (datos.Rows.Count > 0) { var x = datos.Rows[0]; foreach (DataColumn c in datos.Columns) Console.Write(c.ColumnName + "=" + x[c] + "; "); Console.WriteLine(); }
      DataTable val, err; decimal cv, ce;
      if ((string)r["Tipo"] == "SIC") o.Validar_Reporte_SIC(datos, out val, out err, out cv, out ce); else o.Validar_Reporte_BUK(datos, 44, 42, out val, out err, out cv, out ce);
      Console.WriteLine("  válidos=" + cv + " errores=" + ce);
      foreach (DataRow e in err.Rows) Console.WriteLine("   ERR fila " + e["Fila"] + " " + e["Campo"] + " '" + e["Valor"] + "' " + e["Mensaje"]);
      bool g; o.Guardar_Errores_CSV(err, carpeta + "/salida/" + r["Nombre"] + "_errores.csv", out g);
      bool ex; decimal id, cam; string m2, resp; o.Enviar_Ingesta(url, tok, (string)r["Tipo"], (string)r["Nombre"], val, err, out ex, out id, out cam, out m2, out resp);
      Console.WriteLine("  envío: " + ex + " id=" + id + " cambios=" + cam + " " + m2);
    }
    DataTable inst; o.Obtener_Institutos(url, tok, out inst); Console.WriteLine("Institutos: " + inst.Rows.Count);
    var i0 = inst.Rows[0]; bool d; decimal b;
    o.Descargar_Archivo(url + "/api/reportes/instituto/" + i0["IT"] + ".pdf", tok, carpeta + "/salida/Planificacion_" + i0["Codigo"] + ".pdf", out d, out b);
    Console.WriteLine("PDF " + i0["Nombre"] + ": " + d + " " + b + " bytes");
    string nr; o.Mover_Archivo((string)arch.Rows[0]["Ruta"], carpeta + "/procesados", out nr); Console.WriteLine("Movido a " + nr);
    o.Latido(url, tok, "Fin prueba mono", n, out ok);
  }
}
