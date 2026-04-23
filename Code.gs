// ══════════════════════════════════════════════════════════════════
//  MAS AMA Pro — Google Apps Script
//  Solo lectura. NUNCA modifica los archivos de Drive.
//  Despliega como Web App: Ejecutar como "Yo", Acceso "Cualquier persona"
// ══════════════════════════════════════════════════════════════════

var GESTION_ID    = '1ibqTB2gfe-E5s2ceeg8Hak_hhVxnJNjtUE0111qiso0';
var ASISTENCIA_ID = '15w4ljtG_blkgbgpjjMLQMp2rRP29uV33iQOyCPss9yM';

function doGet(e) {
  try {
    var result = construirDatos();
    result.status    = 'ok';
    result.timestamp = new Date().toISOString();

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── Función de prueba — ejecuta esto primero para verificar columnas ──
function testScript() {
  var result = construirDatos();
  Logger.log('Pacientes leídos: ' + result.pacientes.length);
  Logger.log('Columnas gestión: ' + result._debug.colsGestion.join(', '));
  Logger.log('Columnas asistencia: ' + result._debug.colsAsistencia.join(', '));
  Logger.log('Primer paciente: ' + JSON.stringify(result.pacientes[0]));
}

// ── Lógica principal ──────────────────────────────────────────────
function construirDatos() {

  // ── 1. Leer hoja Gestión ────────────────────────────────────────
  var ssGestion  = SpreadsheetApp.openById(GESTION_ID);
  var hGestion   = ssGestion.getSheets()[0];
  var rawGestion = hGestion.getDataRange().getValues();

  var headersG = rawGestion[0].map(function(h){ return limpiar(h); });

  function colG(opciones) { return buscarCol(headersG, opciones); }

  var iNombre   = colG(['NOMBRE','NOMBRES','NOMBRE COMPLETO','APELLIDOS Y NOMBRE']);
  var iRut      = colG(['RUT','RUN','RUT/RUN']);
  var iTaller   = colG(['TALLER','TALLER ASIGNADO','GRUPO','TALLER PROGRAMA']);
  var iCiclo    = colG(['CICLO']);
  var iEstado   = colG(['ESTADO','ESTADO PROGRAMA']);
  var iSexo     = colG(['SEXO','GÉNERO','GENERO']);
  var iEdad     = colG(['EDAD','EDAD AÑOS']);
  var iFono     = colG(['FONO','TELÉFONO','TELEFONO','FONO CONTACTO','CELULAR']);
  var iPrev     = colG(['PREVISIÓN','PREVISION','ISAPRE/FONASA']);
  var iHta      = colG(['HTA']);
  var iDm       = colG(['DM','DIABETES']);
  var iEcv      = colG(['ECV']);
  var iDmir     = colG(['DMIR']);
  var iResp     = colG(['RESP','RESPIRATORIO']);
  var iCaid     = colG(['CAID','CAÍDA','CAIDAS']);
  var iEmpamPre = colG(['EMPAM PRE','PRE EMPAM','RESULTADO PRE']);
  var iEmpamPost= colG(['EMPAM POST','POST EMPAM','RESULTADO POST']);
  var iEstEmpam = colG(['ESTADO EMPAM','EMPAM ESTADO','ESTADO DEL EMPAM']);
  var iFechaEmp = colG(['FECHA VENC EMPAM','VENCIMIENTO EMPAM','FECHA EMPAM','FECHA VEC EMPAM','FECHA VENCIMIENTO']);
  var iDiasEmp  = colG(['DIAS VIGENCIA','DÍAS VIGENCIA','DIAS EMPAM']);
  var iTugPre   = colG(['TUG PRE']);
  var iTugPost  = colG(['TUG POST']);
  var iEupDPre  = colG(['EUP DER PRE','EUP D PRE','EUP DERECHO PRE']);
  var iEupDPost = colG(['EUP DER POST','EUP D POST','EUP DERECHO POST']);
  var iEupIPre  = colG(['EUP IZQ PRE','EUP I PRE','EUP IZQUIERDO PRE']);
  var iEupIPost = colG(['EUP IZQ POST','EUP I POST','EUP IZQUIERDO POST']);
  var iHaqPre   = colG(['HAQ PRE']);
  var iHaqPost  = colG(['HAQ POST']);
  var iResTug   = colG(['RES TUG','RESULTADO TUG','TUG RESULTADO']);
  var iResEupD  = colG(['RES EUP DER','RESULTADO EUP DER']);
  var iResEupI  = colG(['RES EUP IZQ','RESULTADO EUP IZQ']);
  var iFunc     = colG(['FUNCIONAL','ESTADO FUNCIONAL','FUNC']);
  var iIsNew    = colG(['NUEVO','INGRESO','NUEVO INGRESO']);

  var pacientes = [];

  for (var i = 1; i < rawGestion.length; i++) {
    var r = rawGestion[i];
    var nombre = v(r, iNombre);
    var rut    = v(r, iRut);
    if (!nombre && !rut) continue; // fila vacía

    pacientes.push({
      id:        'p' + i,
      nombre:    nombre,
      rut:       normRut(rut),
      taller:    v(r, iTaller),
      ciclo:     v(r, iCiclo),
      estado:    v(r, iEstado),
      sexo:      v(r, iSexo),
      edad:      v(r, iEdad),
      fono:      normFono(v(r, iFono)),
      prevision: v(r, iPrev),
      hta:       v(r, iHta),
      dm:        v(r, iDm),
      ecv:       v(r, iEcv),
      dmir:      v(r, iDmir),
      resp:      v(r, iResp),
      caid:      v(r, iCaid),
      empamPre:  v(r, iEmpamPre),
      empamPost: v(r, iEmpamPost),
      empamEstado: calcEmpamEstado(v(r, iEstEmpam), v(r, iFechaEmp)),
      empamFecha:  normFecha(v(r, iFechaEmp)),
      empamDias:   v(r, iDiasEmp),
      tugPre:    v(r, iTugPre),
      tugPost:   v(r, iTugPost),
      eupDerPre: v(r, iEupDPre),
      eupDerPost:v(r, iEupDPost),
      eupIzqPre: v(r, iEupIPre),
      eupIzqPost:v(r, iEupIPost),
      haqPre:    v(r, iHaqPre),
      haqPost:   v(r, iHaqPost),
      resTug:    v(r, iResTug),
      resEupDer: v(r, iResEupD),
      resEupIzq: v(r, iResEupI),
      estadoFunc:v(r, iFunc),
      isNew:     v(r, iIsNew),
    });
  }

  // ── 2. Leer hoja Asistencia ─────────────────────────────────────
  var ssAsist  = SpreadsheetApp.openById(ASISTENCIA_ID);
  var hAsist   = ssAsist.getSheets()[0];
  var rawAsist = hAsist.getDataRange().getValues();

  var headersA = rawAsist[0].map(function(h){ return limpiar(h); });

  function colA(opciones) { return buscarCol(headersA, opciones); }

  var iARut    = colA(['RUT','RUN','RUT/RUN']);
  var iATaller = colA(['TALLER','TALLER ASIGNADO','GRUPO']);
  var iAPres   = colA(['PRESENCIAS','ASISTENCIA N°','N° SESIONES','SESIONES ASISTIDAS','TOTAL PRESENCIAS']);
  var iATot    = colA(['TOTAL SESIONES','SESIONES TOTALES','TOTAL']);
  var iAPct    = colA(['% ASISTENCIA','PORCENTAJE','ASISTENCIA %','PCT']);

  var talleresPorRut  = {};
  var presenciasPorRut = {};
  var totalPorRut     = {};
  var pctPorRut       = {};

  for (var j = 1; j < rawAsist.length; j++) {
    var ra  = rawAsist[j];
    var rut = normRut(v(ra, iARut));
    if (!rut) continue;

    talleresPorRut[rut]   = v(ra, iATaller);
    presenciasPorRut[rut] = Number(v(ra, iAPres)) || 0;
    totalPorRut[rut]      = Number(v(ra, iATot))  || 24;
    pctPorRut[rut]        = Number(v(ra, iAPct))  || 0;
  }

  // ── 3. Cruzar datos ─────────────────────────────────────────────
  pacientes = pacientes.map(function(p) {
    var rut = p.rut;
    var pres  = presenciasPorRut[rut] || 0;
    var total = totalPorRut[rut]      || 24;
    var pct   = pctPorRut[rut]        || (total > 0 ? Math.round(pres/total*100) : 0);
    return Object.assign({}, p, {
      taller:          talleresPorRut[rut] || p.taller || 'SIN ASIGNAR',
      totalPresencias: pres,
      totalSesiones:   total,
      pctAsistencia:   pct,
      alertaAsist:     pres < 20 ? 'BAJO' : 'OK',
    });
  });

  return {
    pacientes: pacientes,
    asistencia: {
      talleresPorRut:  talleresPorRut,
      presenciasPorRut: presenciasPorRut,
    },
    _debug: {
      colsGestion:    headersG,
      colsAsistencia: headersA,
      totalPacientes: pacientes.length,
    }
  };
}

// ── Helpers ───────────────────────────────────────────────────────

function buscarCol(headers, opciones) {
  for (var k = 0; k < opciones.length; k++) {
    var idx = headers.indexOf(limpiar(opciones[k]));
    if (idx >= 0) return idx;
  }
  // Búsqueda parcial como fallback
  for (var k = 0; k < opciones.length; k++) {
    var needle = limpiar(opciones[k]);
    for (var h = 0; h < headers.length; h++) {
      if (headers[h].indexOf(needle) >= 0 || needle.indexOf(headers[h]) >= 0) return h;
    }
  }
  return -1;
}

function limpiar(s) {
  return String(s || '').trim().toUpperCase()
    .replace(/[áàä]/g,'A').replace(/[éèë]/g,'E')
    .replace(/[íìï]/g,'I').replace(/[óòö]/g,'O')
    .replace(/[úùü]/g,'U').replace(/Ñ/g,'N');
}

function v(row, idx) {
  if (idx < 0 || idx >= row.length) return '';
  var val = row[idx];
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function normRut(s) {
  return String(s || '').trim().replace(/\s/g,'').toUpperCase();
}

function normFono(s) {
  var clean = String(s || '').replace(/\D/g,'');
  if (clean.length === 8) clean = '9' + clean;      // sin el 9 inicial
  if (clean.startsWith('56')) clean = clean.slice(2); // quitar código país
  return clean.length >= 8 ? clean : s;
}

function normFecha(s) {
  if (!s) return '';
  // Si es Date de Sheets
  if (s instanceof Date) return Utilities.formatDate(s, 'America/Santiago', 'yyyy-MM-dd');
  // Si es número serial de Excel
  var n = Number(s);
  if (!isNaN(n) && n > 40000) {
    var d = new Date((n - 25569) * 86400000);
    return Utilities.formatDate(d, 'America/Santiago', 'yyyy-MM-dd');
  }
  return s;
}

function calcEmpamEstado(estadoCol, fechaCol) {
  // Si la hoja ya tiene el estado calculado, usarlo
  var est = String(estadoCol || '').toUpperCase();
  if (est.includes('VENCIDO') || est.includes('VENC')) return 'VENCIDO';
  if (est.includes('PRONTO') || est.includes('PRÓXIMO')) return 'VENCE PRONTO';
  if (est.includes('VIGENTE')) return 'VIGENTE';
  if (est.includes('PEND') || est === '') {
    // Calcular desde la fecha
    if (!fechaCol) return 'PENDIENTE';
    var fecha = normFecha(fechaCol);
    if (!fecha) return 'PENDIENTE';
    // Manejo "Prox. ENE/FEB/..."
    var proxMatch = String(fechaCol).match(/Prox\.?\s*(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)/i);
    if (proxMatch) {
      var meses = {ENE:1,FEB:2,MAR:3,ABR:4,MAY:5,JUN:6,JUL:7,AGO:8,SEP:9,OCT:10,NOV:11,DIC:12};
      var mes = meses[proxMatch[1].toUpperCase()];
      var f = new Date(2026, mes-1, 1);
      var dias = Math.round((f - new Date()) / 86400000);
      if (dias < 0) return 'VENCIDO';
      if (dias <= 30) return 'VENCE PRONTO';
      return 'VIGENTE';
    }
    var d = new Date(fecha);
    if (isNaN(d)) return 'PENDIENTE';
    var dias = Math.round((d - new Date()) / 86400000);
    if (dias < 0) return 'VENCIDO';
    if (dias <= 30) return 'VENCE PRONTO';
    return 'VIGENTE';
  }
  return 'PENDIENTE';
}
