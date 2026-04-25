// ══════════════════════════════════════════════════════════════════
//  MAS AMA Pro — Google Apps Script  v2
//  Solo lectura. NUNCA modifica los archivos de Drive.
//  Despliega: Web App · Ejecutar como "Yo" · Acceso "Cualquier persona"
// ══════════════════════════════════════════════════════════════════

var GESTION_ID    = '1ibqTB2gfe-E5s2ceeg8Hak_hhVxnJNjtUE0111qiso0';
var ASISTENCIA_ID = '15w4ljtG_blkgbgpjjMLQMp2rRP29uV33iQOyCPss9yM';

// Clave secreta para comandos de administración remota.
// Solo Daniel la conoce. No aparece en el código de la app.
// Puedes cambiarla por cualquier texto que solo tú sepas.
var ADMIN_SECRET  = 'MASAMA_CTRL_2026_DANIEL';

// ── Índices de columna en hoja PLANILLA (base 0) ─────────────────
var C = {
  CICLO:      3,
  ESTADO:     4,   // TALLER / LLAMAR / MANUAL+ / etc.
  TALLER:     5,   // DETALLE ESTADO → nombre del taller
  NOMBRE:     11,
  RUT:        12,
  FONO:       13,
  WSP:        15,
  SEXO:       16,
  EDAD:       17,
  HTA:        22,
  ECV:        23,
  DM:         24,
  DMIR:       25,
  RESP:       26,
  CAID:       27,
  PREVISION:  29,
  EMPAM_EST:  31,  // código interno (ASR/ACR/PEND/etc.)
  EMPAM_VIG:  32,  // fecha vencimiento o "Prox. MAY"
  TUG_PRE:    43,
  TUG_POST:   44,
  CAT_I:      45,
  CAT_E:      46,
  EUP_D_PRE:  47,
  EUP_I_PRE:  48,
  EUP_D_POST: 51,
  EUP_I_POST: 52,
  PRES_TOT:   65,  // TOTAL presencias (bloque 1)
  HAQ_PRE:    78,
  HAQ_POST:   83,
  RES_TUG:    88,
  RES_EUP_D:  89,
  RES_EUP_I:  90,
  EMPAM_RES:  91,  // resultado final EMPAM
};

// ── Entrada HTTP ──────────────────────────────────────────────────
function doGet(e) {
  var p = e.parameter || {};

  // ── Comandos de Control Maestro ───────────────────────────────────
  if (p.action === 'admin') {
    if (!ADMIN_SECRET || p.secret !== ADMIN_SECRET) {
      return output({ status: 'error', message: 'No autorizado' });
    }
    return handleAdminCommand(p.cmd, p.val);
  }

  // ── Datos normales ────────────────────────────────────────────────
  try {
    var result = construirDatos();
    result.status    = 'ok';
    result.timestamp = new Date().toISOString();
    return output(result);
  } catch (err) {
    return output({ status: 'error', message: err.toString() });
  }
}

function handleAdminCommand(cmd, val) {
  try {
    var ss  = SpreadsheetApp.openById(GESTION_ID);
    var seg = ss.getSheetByName('SEGURIDAD') || ss.insertSheet('SEGURIDAD');

    if (cmd === 'wipe') {
      seg.getRange('A1').setValue(val === '1' ? 'BORRAR' : '');
      return output({ status:'ok', msg: val==='1' ? '🚨 Wipe activado en todos los dispositivos' : '✅ Wipe desactivado' });
    }
    if (cmd === 'lock') {
      seg.getRange('A2').setValue(val === '1' ? 'BLOQUEAR' : '');
      return output({ status:'ok', msg: val==='1' ? '🔒 Bloqueo activado en todos los dispositivos' : '✅ Bloqueo desactivado' });
    }
    if (cmd === 'clear') {
      seg.getRange('A1').setValue('');
      seg.getRange('A2').setValue('');
      return output({ status:'ok', msg: '✅ Todos los flags borrados' });
    }
    if (cmd === 'status') {
      var w = String(seg.getRange('A1').getValue()).trim().toUpperCase();
      var l = String(seg.getRange('A2').getValue()).trim().toUpperCase();
      return output({ status:'ok', wipeActive: w==='BORRAR', lockActive: l==='BLOQUEAR' });
    }
    return output({ status:'error', message: 'Comando desconocido: ' + cmd });
  } catch(e) {
    return output({ status:'error', message: e.toString() });
  }
}

function output(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Función de prueba ─────────────────────────────────────────────
function testScript() {
  var result = construirDatos();
  Logger.log('✅ Pacientes leídos: ' + result.pacientes.length);
  Logger.log('📋 Primer paciente: ' + JSON.stringify(result.pacientes[0]));
  Logger.log('📋 Segundo paciente: ' + JSON.stringify(result.pacientes[1]));
  Logger.log('🏷️ Talleres únicos: ' + JSON.stringify(result._debug.talleres));
  Logger.log('💊 EMPAM estados: ' + JSON.stringify(result._debug.empamEstados));
  Logger.log('📊 Presencias muestra: ' + JSON.stringify(result._debug.presenciasMuestra));
}

// ── Lógica principal ──────────────────────────────────────────────
// Asistencia = fuente primaria de TALLER y LISTA DE PACIENTES
// Gestión    = fuente de DATOS CLÍNICOS (EMPAM, comorbilidades, evaluaciones)
function construirDatos() {

  var ssG = SpreadsheetApp.openById(GESTION_ID);
  var ssA = SpreadsheetApp.openById(ASISTENCIA_ID);

  // ── 1. Leer Gestión → mapa clínico por RUT ────────────────────────
  var hojaG  = ssG.getSheetByName('PLANILLA') || ssG.getSheets()[1];
  var datosG = hojaG.getDataRange().getValues();

  var gestionPorRut = {};   // RUT → fila completa de Gestión
  for (var i = 1; i < datosG.length; i++) {
    var rg = normRut(str(datosG[i], C.RUT));
    if (rg) gestionPorRut[rg] = datosG[i];
  }

  // ── 2. Leer Asistencia → lista primaria de pacientes + talleres ───
  var hojaA  = ssA.getSheets()[0];
  var datosA = hojaA.getDataRange().getValues();

  var pacientes   = [];
  var talleres    = {};
  var empamEst    = {};
  var presMuestra = [];
  var vistosRut   = {};

  if (datosA.length > 1) {
    var headA    = datosA[0].map(function(h){ return limpiar(h); });
    var iARut    = buscarCol(headA, ['RUT','RUN']);
    var iANombre = buscarCol(headA, ['NOMBRE','NOMBRE COMPLETO','PACIENTE','APELLIDOS Y NOMBRE']);
    var iATaller = buscarCol(headA, ['TALLER','TALLER ASIGNADO','DETALLE ESTADO','GRUPO','TALLER_ASIGNADO']);
    var iAPres   = buscarCol(headA, ['TOTAL','PRESENCIAS','SESIONES ASISTIDAS','TOTAL PRESENCIAS','N PRESENCIAS','ASISTENCIA N']);
    var iAFono   = buscarCol(headA, ['FONO','TELEFONO','TEL','CELULAR','FONO_CONTACTO']);
    var iASexo   = buscarCol(headA, ['SEXO']);
    var iAEdad   = buscarCol(headA, ['EDAD']);

    for (var j = 1; j < datosA.length; j++) {
      var ra   = datosA[j];
      var rut  = normRut(iARut >= 0 ? String(ra[iARut] || '') : '');
      var nombre = iANombre >= 0 ? String(ra[iANombre] || '').trim().toUpperCase() : '';

      if (!rut && !nombre) continue;
      if (rut && vistosRut[rut]) continue;   // evitar duplicados
      if (rut) vistosRut[rut] = true;

      // Taller desde Asistencia (fuente correcta para UV19 PM, etc.)
      var tallerRaw = iATaller >= 0 ? String(ra[iATaller] || '') : '';
      var taller    = normTaller(tallerRaw);

      // Presencias desde Asistencia
      var presRaw   = iAPres >= 0 ? ra[iAPres] : '';
      var presencias = (!isNaN(Number(presRaw)) && presRaw !== '') ? Math.round(Number(presRaw)) : 0;

      // Datos base de Asistencia (fallback si Gestión no tiene al paciente)
      var fonoAsis = iAFono >= 0 ? normFono(String(ra[iAFono] || '')) : '';
      var sexoAsis = iASexo >= 0 ? String(ra[iASexo] || '').trim().toUpperCase() : '';
      var edadAsis = iAEdad >= 0 ? String(ra[iAEdad] || '').trim() : '';

      // Datos clínicos de Gestión (enriquecimiento por RUT)
      var g          = rut ? gestionPorRut[rut] : null;
      var vigenciaRaw = g ? g[C.EMPAM_VIG] : '';
      var empamEstad  = calcEmpamEstado(g ? str(g, C.EMPAM_EST) : '', vigenciaRaw);
      var empamFecha  = normFecha(vigenciaRaw);
      var fono        = (g ? normFono(str(g, C.FONO)) : '') || fonoAsis;
      var estado      = g ? str(g, C.ESTADO) : 'TALLER';

      // Si Asistencia no tiene nombre, lo tomamos de Gestión
      if (!nombre && g) nombre = str(g, C.NOMBRE);
      if (!nombre) continue;

      talleres[taller]     = (talleres[taller] || 0) + 1;
      empamEst[empamEstad] = (empamEst[empamEstad] || 0) + 1;
      if (presMuestra.length < 5) presMuestra.push({ nombre: nombre, pres: presencias, raw: presRaw });

      pacientes.push({
        id:              'p' + j,
        nombre:          nombre,
        rut:             rut,
        taller:          taller,
        tallerRaw:       tallerRaw,
        ciclo:           g ? str(g, C.CICLO)      : '',
        estado:          estado,
        sexo:            (g ? str(g, C.SEXO)      : '') || sexoAsis,
        edad:            (g ? str(g, C.EDAD)      : '') || edadAsis,
        fono:            fono,
        prevision:       g ? str(g, C.PREVISION)  : 'FONASA',
        hta:             g ? str(g, C.HTA)        : '',
        ecv:             g ? str(g, C.ECV)        : '',
        dm:              g ? str(g, C.DM)         : '',
        dmir:            g ? str(g, C.DMIR)       : '',
        resp:            g ? str(g, C.RESP)       : '',
        caid:            g ? str(g, C.CAID)       : '',
        empamEstado:     empamEstad,
        empamFecha:      empamFecha,
        empamPre:        g ? str(g, C.EMPAM_EST)  : '',
        empamPost:       g ? str(g, C.EMPAM_RES)  : '',
        tugPre:          g ? str(g, C.TUG_PRE)    : '',
        tugPost:         g ? str(g, C.TUG_POST)   : '',
        catInt:          g ? str(g, C.CAT_I)      : '',
        catExt:          g ? str(g, C.CAT_E)      : '',
        eupDerPre:       g ? str(g, C.EUP_D_PRE)  : '',
        eupIzqPre:       g ? str(g, C.EUP_I_PRE)  : '',
        eupDerPost:      g ? str(g, C.EUP_D_POST) : '',
        eupIzqPost:      g ? str(g, C.EUP_I_POST) : '',
        haqPre:          g ? str(g, C.HAQ_PRE)    : '',
        haqPost:         g ? str(g, C.HAQ_POST)   : '',
        resTug:          g ? str(g, C.RES_TUG)    : '',
        resEupDer:       g ? str(g, C.RES_EUP_D)  : '',
        resEupIzq:       g ? str(g, C.RES_EUP_I)  : '',
        totalPresencias: presencias,
        totalSesiones:   20,
        pctAsistencia:   Math.round(presencias / 20 * 100),
        alertaAsist:     presencias < 20 ? 'BAJO' : 'OK',
        sinFichaClinica: !g,   // true si no está en Gestión
      });
    }
  }

  // ── 3. Fallback: si Asistencia estaba vacía, usar solo Gestión ────
  if (pacientes.length === 0) {
    Logger.log('⚠️ Asistencia vacía — usando solo Gestión como fallback');
    for (var k = 1; k < datosG.length; k++) {
      var r      = datosG[k];
      var nombre = str(r, C.NOMBRE);
      var rut    = normRut(str(r, C.RUT));
      if (!nombre && !rut) continue;
      var tallerRaw = str(r, C.TALLER);
      var taller    = normTaller(tallerRaw);
      var vigenciaRaw = r[C.EMPAM_VIG];
      var presRaw     = r[C.PRES_TOT];
      var presencias  = (!isNaN(Number(presRaw)) && presRaw !== '') ? Math.round(Number(presRaw)) : 0;
      var empamEstad  = calcEmpamEstado(str(r, C.EMPAM_EST), vigenciaRaw);
      talleres[taller]     = (talleres[taller] || 0) + 1;
      empamEst[empamEstad] = (empamEst[empamEstad] || 0) + 1;
      pacientes.push({
        id: 'g' + k, nombre: nombre, rut: rut, taller: taller, tallerRaw: tallerRaw,
        ciclo: str(r, C.CICLO), estado: str(r, C.ESTADO),
        sexo: str(r, C.SEXO), edad: str(r, C.EDAD),
        fono: normFono(str(r, C.FONO)), prevision: str(r, C.PREVISION),
        hta: str(r, C.HTA), ecv: str(r, C.ECV), dm: str(r, C.DM),
        dmir: str(r, C.DMIR), resp: str(r, C.RESP), caid: str(r, C.CAID),
        empamEstado: empamEstad, empamFecha: normFecha(vigenciaRaw),
        empamPre: str(r, C.EMPAM_EST), empamPost: str(r, C.EMPAM_RES),
        tugPre: str(r, C.TUG_PRE), tugPost: str(r, C.TUG_POST),
        catInt: str(r, C.CAT_I), catExt: str(r, C.CAT_E),
        eupDerPre: str(r, C.EUP_D_PRE), eupIzqPre: str(r, C.EUP_I_PRE),
        eupDerPost: str(r, C.EUP_D_POST), eupIzqPost: str(r, C.EUP_I_POST),
        haqPre: str(r, C.HAQ_PRE), haqPost: str(r, C.HAQ_POST),
        resTug: str(r, C.RES_TUG), resEupDer: str(r, C.RES_EUP_D), resEupIzq: str(r, C.RES_EUP_I),
        totalPresencias: presencias, totalSesiones: 20,
        pctAsistencia: Math.round(presencias / 20 * 100),
        alertaAsist: presencias < 20 ? 'BAJO' : 'OK',
      });
    }
  }

  // ── 4. Verificar flags de seguridad ──────────────────────────────
  var wipe = false, lock = false;
  try {
    var segSheet = ssG.getSheetByName('SEGURIDAD');
    if (segSheet) {
      wipe = String(segSheet.getRange('A1').getValue()).trim().toUpperCase() === 'BORRAR';
      lock = String(segSheet.getRange('A2').getValue()).trim().toUpperCase() === 'BLOQUEAR';
    }
  } catch(eWipe) {}

  return {
    pacientes: pacientes,
    wipe: wipe,
    lock: lock,
    _debug: {
      totalPacientes:   pacientes.length,
      talleres:         talleres,
      empamEstados:     empamEst,
      presenciasMuestra: presMuestra,
    }
  };
}

// ── Normalizar nombre de taller ───────────────────────────────────
function normTaller(raw) {
  var d = limpiar(raw);
  if (!d || d === 'PEND' || d.includes('MANUAL') || d.includes('CESFAM') || d.includes('ONLINE')) return 'SIN ASIGNAR';
  if (d.includes('V.M. 2') || d.includes('VM 2') || d === 'VM L-M') return 'VM 2.0';
  if (d.includes('SALITRE'))      return 'VILLA EL SALITRE';
  if (d.includes('CUMBRES'))      return 'CUMBRES ANDINAS';
  if (d.includes('NUEVA VIDA'))   return 'NUEVA VIDA';
  if (d.includes('FUNDACI'))      return 'LA FUNDACIÓN';
  if (d.includes('SAN SEBAS'))    return 'SAN SEBASTIAN';
  if (d.includes('EXPERIENCIA'))  return 'EXPERIENCIA Y JUVENTUD';
  if (d.includes('ETERNA') || d.includes('CAPILLA') || d.includes('JUVENTUD')) return 'EXPERIENCIA Y JUVENTUD';
  if (d.includes('UV19 AM') || d.includes('UV 19 AM')) return 'UV19 AM27';
  if (d.includes('UV19 PM') || d.includes('UV 19 PM')) return 'UV19 PM';
  if (d === 'UV 19' || d === 'UV19') return 'UV19 AM27';
  if (d.includes('UV18'))         return 'UV18';
  if (d.includes('VM M-J') || d.includes('MACUL M') || d.includes('MACUL M-J')) return 'VILLA MACUL M-J';
  return String(raw).trim();
}

// ── Calcular estado EMPAM desde fecha de vencimiento ─────────────
function calcEmpamEstado(codigoInterno, vigenciaRaw) {
  // Si no hay fecha, es pendiente
  if (vigenciaRaw === '' || vigenciaRaw === null || vigenciaRaw === undefined) return 'PENDIENTE';

  // Manejo "Prox. MAY" o "Prox. ENE" etc.
  var proxMatch = String(vigenciaRaw).match(/Prox\.?\s*(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)/i);
  if (proxMatch) {
    var meses = {ENE:1,FEB:2,MAR:3,ABR:4,MAY:5,JUN:6,JUL:7,AGO:8,SEP:9,OCT:10,NOV:11,DIC:12};
    var mes = meses[proxMatch[1].toUpperCase()];
    var fProxy = new Date(2026, mes - 1, 1);
    var diasProxy = Math.round((fProxy - new Date()) / 86400000);
    if (diasProxy < 0)   return 'VENCIDO';
    if (diasProxy <= 30) return 'VENCE PRONTO';
    return 'VIGENTE';
  }

  // Número serial de Excel (fecha como número)
  var n = Number(vigenciaRaw);
  if (!isNaN(n) && n > 40000) {
    var fecha = new Date((n - 25569) * 86400000);
    var dias  = Math.round((fecha - new Date()) / 86400000);
    if (dias < 0)   return 'VENCIDO';
    if (dias <= 30) return 'VENCE PRONTO';
    return 'VIGENTE';
  }

  // String de fecha (ISO o similar)
  if (typeof vigenciaRaw === 'string' && vigenciaRaw.length > 4) {
    var d = new Date(vigenciaRaw);
    if (!isNaN(d)) {
      var dias2 = Math.round((d - new Date()) / 86400000);
      if (dias2 < 0)   return 'VENCIDO';
      if (dias2 <= 30) return 'VENCE PRONTO';
      return 'VIGENTE';
    }
  }

  // Si la fecha es un objeto Date de Sheets
  if (vigenciaRaw instanceof Date) {
    var dias3 = Math.round((vigenciaRaw - new Date()) / 86400000);
    if (dias3 < 0)   return 'VENCIDO';
    if (dias3 <= 30) return 'VENCE PRONTO';
    return 'VIGENTE';
  }

  return 'PENDIENTE';
}

// ── Normalizar fecha a ISO string ─────────────────────────────────
function normFecha(raw) {
  if (!raw && raw !== 0) return '';
  if (raw instanceof Date) return Utilities.formatDate(raw, 'America/Santiago', 'yyyy-MM-dd');
  var n = Number(raw);
  if (!isNaN(n) && n > 40000) {
    var d = new Date((n - 25569) * 86400000);
    return Utilities.formatDate(d, 'America/Santiago', 'yyyy-MM-dd');
  }
  var proxMatch = String(raw).match(/Prox\.?\s*(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)/i);
  if (proxMatch) return String(raw);
  return String(raw);
}

// ── Normalizar RUT ────────────────────────────────────────────────
function normRut(raw) {
  var s = String(raw || '').trim();
  // Convertir notación científica: "3.8099833E7" → "38099833"
  if (/^\d+\.?\d*[Ee]\d+$/.test(s)) {
    s = String(Math.round(Number(s)));
  }
  return s.toUpperCase().replace(/\s/g, '');
}

// ── Normalizar teléfono ───────────────────────────────────────────
function normFono(raw) {
  var s = String(raw || '').trim();
  // Convertir notación científica: "9.48771738E8" → "948771738"
  if (/^\d+\.?\d*[Ee]\d+$/.test(s)) {
    s = String(Math.round(Number(s)));
  }
  var digits = s.replace(/\D/g, '');
  if (digits.startsWith('56') && digits.length === 11) digits = digits.slice(2);
  if (digits.length === 8) digits = '9' + digits;
  return digits.length >= 8 ? digits : s;
}

// ── Helpers ───────────────────────────────────────────────────────
function str(row, idx) {
  if (idx < 0 || idx >= row.length) return '';
  var val = row[idx];
  if (val === null || val === undefined) return '';
  if (val instanceof Date) return Utilities.formatDate(val, 'America/Santiago', 'yyyy-MM-dd');
  return String(val).trim();
}

function limpiar(s) {
  return String(s || '').trim().toUpperCase()
    .replace(/[áàäâ]/gi,'A').replace(/[éèëê]/gi,'E')
    .replace(/[íìïî]/gi,'I').replace(/[óòöô]/gi,'O')
    .replace(/[úùüû]/gi,'U').replace(/[ñ]/gi,'N');
}

function buscarCol(headers, opciones) {
  for (var k = 0; k < opciones.length; k++) {
    var needle = limpiar(opciones[k]);
    var idx = headers.indexOf(needle);
    if (idx >= 0) return idx;
  }
  // Búsqueda parcial
  for (var k = 0; k < opciones.length; k++) {
    var needle2 = limpiar(opciones[k]);
    for (var h = 0; h < headers.length; h++) {
      if (headers[h].indexOf(needle2) >= 0 || needle2.indexOf(headers[h]) >= 0) return h;
    }
  }
  return -1;
}
