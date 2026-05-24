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

  // ── Diagnóstico EMPAM (para verificar que las fechas sean correctas) ─
  if (p.action === 'empam') {
    try {
      var r = diagnosticoEmpam();
      r.status = 'ok';
      return output(r);
    } catch(err) {
      return output({ status: 'error', message: err.toString() });
    }
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

// ── Detectar columnas de Gestión dinámicamente desde la cabecera ──
// Esto evita que se rompa si alguien mueve o inserta columnas en el Excel.
// Siempre fallback a los índices C hardcodeados si no se encuentra por nombre.
function detectarColumnasGestion(headers) {
  function col(opts, fallback) {
    var idx = buscarCol(headers, opts);
    return idx >= 0 ? idx : fallback;
  }
  return {
    CICLO:      col(['CICLO'],                                          C.CICLO),
    ESTADO:     col(['ESTADO','ESTADO PROGRAMA'],                       C.ESTADO),
    TALLER:     col(['DETALLE ESTADO','TALLER ASIGNADO','TALLER','GRUPO'], C.TALLER),
    NOMBRE:     col(['NOMBRE','NOMBRE COMPLETO','APELLIDOS Y NOMBRE'],  C.NOMBRE),
    RUT:        col(['RUT','RUN','RUT PACIENTE','RUT_PLANILLA'],         C.RUT),
    FONO:       col(['FONO','TELEFONO','CELULAR','TEL'],                 C.FONO),
    SEXO:       col(['SEXO'],                                           C.SEXO),
    EDAD:       col(['EDAD'],                                           C.EDAD),
    HTA:        col(['HTA','HIPERTENSION'],                             C.HTA),
    ECV:        col(['ECV'],                                            C.ECV),
    DM:         col(['DM','DIABETES'],                                  C.DM),
    DMIR:       col(['DMIR'],                                           C.DMIR),
    RESP:       col(['RESP','RESPIRATORIO'],                            C.RESP),
    CAID:       col(['CAID','CAIDA'],                                   C.CAID),
    PREVISION:  col(['PREVISION','PREVISIÓN'],                          C.PREVISION),
    // ── EMPAM — los más críticos ──────────────────────────────────────
    EMPAM_EST:  col(['EMPAM EST','EMPAM_EST','RESULTADO EMPAM','EMPAM PRE',
                     'CODIGO EMPAM','EMPAM (PRE)','CLASIFICACION EMPAM',
                     'ASR','EMPAM'],                                    C.EMPAM_EST),
    EMPAM_VIG:  col(['VENC EMPAM','FECHA VENC EMPAM','FECHA VENCIMIENTO EMPAM',
                     'VENCIMIENTO EMPAM','VIGENCIA EMPAM','FECHA EMPAM',
                     'PROX EMPAM','PROX. EMPAM','FECHA VIG','VIG EMPAM',
                     'FECHA RENOVACION EMPAM','FECHA PROX EMPAM'],      C.EMPAM_VIG),
    // ── Evaluaciones ─────────────────────────────────────────────────
    TUG_PRE:    col(['TUG PRE','TUG_PRE','TUG (PRE)'],                 C.TUG_PRE),
    TUG_POST:   col(['TUG POST','TUG_POST','TUG (POST)'],              C.TUG_POST),
    CAT_I:      col(['CAT INTERNA','CAT_I','CAT I'],                   C.CAT_I),
    CAT_E:      col(['CAT EXTERNA','CAT_E','CAT E'],                   C.CAT_E),
    EUP_D_PRE:  col(['EUP DER PRE','EUP D PRE','EUP_D_PRE'],          C.EUP_D_PRE),
    EUP_I_PRE:  col(['EUP IZQ PRE','EUP I PRE','EUP_I_PRE'],          C.EUP_I_PRE),
    EUP_D_POST: col(['EUP DER POST','EUP D POST','EUP_D_POST'],        C.EUP_D_POST),
    EUP_I_POST: col(['EUP IZQ POST','EUP I POST','EUP_I_POST'],        C.EUP_I_POST),
    HAQ_PRE:    col(['HAQ PRE','HAQ_PRE'],                             C.HAQ_PRE),
    HAQ_POST:   col(['HAQ POST','HAQ_POST'],                           C.HAQ_POST),
    RES_TUG:    col(['RES TUG','RESULTADO TUG','RES_TUG'],             C.RES_TUG),
    RES_EUP_D:  col(['RES EUP DER','RES_EUP_D'],                      C.RES_EUP_D),
    RES_EUP_I:  col(['RES EUP IZQ','RES_EUP_I'],                      C.RES_EUP_I),
    EMPAM_RES:  col(['EMPAM RES','EMPAM POST','EMPAM (POST)','RESULTADO FINAL EMPAM'], C.EMPAM_RES),
    PRES_TOT:   col(['TOTAL PRESENCIAS','PRESENCIAS TOTAL','TOTAL','N PRESENCIAS',
                     'ASISTENCIA TOTAL','PRES TOT'],                   C.PRES_TOT),
  };
}

// ── Diagnóstico EMPAM: muestra las primeras filas con sus fechas raw ─
// Llamar con: ?action=empam   (sin secreto, solo lectura)
function diagnosticoEmpam() {
  var ssG    = SpreadsheetApp.openById(GESTION_ID);
  var hojaG  = ssG.getSheetByName('PLANILLA') || ssG.getSheets()[1];
  var datosG = hojaG.getDataRange().getValues();
  var headG  = datosG[0].map(function(h){ return limpiar(h); });
  var GC     = detectarColumnasGestion(headG);

  // Cabecera completa para diagnóstico (primeras 100 cols)
  var cabecera = datosG[0].slice(0, 100).map(function(h, i){
    return { i: i, nombre: String(h || '').trim() };
  }).filter(function(x){ return x.nombre; });

  // Muestra de los primeros 10 pacientes con datos crudos
  var muestra = [];
  for (var i = 1; i < datosG.length && muestra.length < 10; i++) {
    var r      = datosG[i];
    var rut    = normRut(str(r, GC.RUT));
    var nombre = str(r, GC.NOMBRE);
    if (!nombre && !rut) continue;
    var vigRaw = r[GC.EMPAM_VIG];
    muestra.push({
      nombre:       nombre,
      rut:          rut,
      colEmpamVig:  GC.EMPAM_VIG,
      colEmpamEst:  GC.EMPAM_EST,
      empamEstRaw:  str(r, GC.EMPAM_EST),
      empamVigRaw:  vigRaw === null || vigRaw === undefined ? 'null' : String(vigRaw),
      empamFechaNorm: normFecha(vigRaw),
      empamEstado:  calcEmpamEstado(str(r, GC.EMPAM_EST), vigRaw),
      // Filas adyacentes para comparar si el índice está desplazado
      col30: r[30] !== null && r[30] !== undefined ? String(r[30]).slice(0,30) : '',
      col31: r[31] !== null && r[31] !== undefined ? String(r[31]).slice(0,30) : '',
      col32: r[32] !== null && r[32] !== undefined ? String(r[32]).slice(0,30) : '',
      col33: r[33] !== null && r[33] !== undefined ? String(r[33]).slice(0,30) : '',
    });
  }

  return {
    totalFilas:   datosG.length - 1,
    colDetectada: { EMPAM_VIG: GC.EMPAM_VIG, EMPAM_EST: GC.EMPAM_EST },
    colHardcoded: { EMPAM_VIG: C.EMPAM_VIG,  EMPAM_EST: C.EMPAM_EST  },
    cabecera:     cabecera,
    muestra:      muestra,
  };
}

// ── Lógica principal ──────────────────────────────────────────────
// Asistencia = fuente primaria de TALLER y LISTA DE PACIENTES
// Gestión    = fuente de DATOS CLÍNICOS (EMPAM, comorbilidades, evaluaciones)
function construirDatos() {

  var ssG = SpreadsheetApp.openById(GESTION_ID);
  var ssA = SpreadsheetApp.openById(ASISTENCIA_ID);

  // ── 1. Leer Gestión → mapa clínico por RUT (con detección dinámica) ─
  var hojaG  = ssG.getSheetByName('PLANILLA') || ssG.getSheets()[1];
  var datosG = hojaG.getDataRange().getValues();
  var headG  = datosG[0].map(function(h){ return limpiar(h); });
  var GC     = detectarColumnasGestion(headG);   // columnas detectadas por nombre

  var gestionPorRut = {};   // RUT → { fila, GC }
  for (var i = 1; i < datosG.length; i++) {
    var rg = normRut(str(datosG[i], GC.RUT));
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

      // Datos clínicos de Gestión (enriquecimiento por RUT, usando columnas detectadas dinámicamente)
      var g           = rut ? gestionPorRut[rut] : null;
      var vigenciaRaw = g ? g[GC.EMPAM_VIG] : '';
      var empamEstad  = calcEmpamEstado(g ? str(g, GC.EMPAM_EST) : '', vigenciaRaw);
      var empamFecha  = normFecha(vigenciaRaw);
      var fono        = (g ? normFono(str(g, GC.FONO)) : '') || fonoAsis;
      var estado      = g ? str(g, GC.ESTADO) : 'TALLER';

      // Si Asistencia no tiene nombre, lo tomamos de Gestión
      if (!nombre && g) nombre = str(g, GC.NOMBRE);
      if (!nombre) continue;

      talleres[taller]     = (talleres[taller] || 0) + 1;
      empamEst[empamEstad] = (empamEst[empamEstad] || 0) + 1;
      if (presMuestra.length < 5) presMuestra.push({ nombre: nombre, empamFecha: empamFecha, empamEstado: empamEstad });

      pacientes.push({
        id:              'p' + j,
        nombre:          nombre,
        rut:             rut,
        taller:          taller,
        tallerRaw:       tallerRaw,
        ciclo:           g ? str(g, GC.CICLO)      : '',
        estado:          estado,
        sexo:            (g ? str(g, GC.SEXO)      : '') || sexoAsis,
        edad:            (g ? str(g, GC.EDAD)      : '') || edadAsis,
        fono:            fono,
        prevision:       g ? str(g, GC.PREVISION)  : 'FONASA',
        hta:             g ? str(g, GC.HTA)        : '',
        ecv:             g ? str(g, GC.ECV)        : '',
        dm:              g ? str(g, GC.DM)         : '',
        dmir:            g ? str(g, GC.DMIR)       : '',
        resp:            g ? str(g, GC.RESP)       : '',
        caid:            g ? str(g, GC.CAID)       : '',
        empamEstado:     empamEstad,
        empamFecha:      empamFecha,
        empamPre:        g ? str(g, GC.EMPAM_EST)  : '',
        empamPost:       g ? str(g, GC.EMPAM_RES)  : '',
        tugPre:          g ? str(g, GC.TUG_PRE)    : '',
        tugPost:         g ? str(g, GC.TUG_POST)   : '',
        catInt:          g ? str(g, GC.CAT_I)      : '',
        catExt:          g ? str(g, GC.CAT_E)      : '',
        eupDerPre:       g ? str(g, GC.EUP_D_PRE)  : '',
        eupIzqPre:       g ? str(g, GC.EUP_I_PRE)  : '',
        eupDerPost:      g ? str(g, GC.EUP_D_POST) : '',
        eupIzqPost:      g ? str(g, GC.EUP_I_POST) : '',
        haqPre:          g ? str(g, GC.HAQ_PRE)    : '',
        haqPost:         g ? str(g, GC.HAQ_POST)   : '',
        resTug:          g ? str(g, GC.RES_TUG)    : '',
        resEupDer:       g ? str(g, GC.RES_EUP_D)  : '',
        resEupIzq:       g ? str(g, GC.RES_EUP_I)  : '',
        totalPresencias: presencias,
        totalSesiones:   20,
        pctAsistencia:   Math.round(presencias / 20 * 100),
        alertaAsist:     presencias < 20 ? 'BAJO' : 'OK',
        sinFichaClinica: !g,
      });
    }
  }

  // ── 3. Fallback: si Asistencia estaba vacía, usar solo Gestión ────
  if (pacientes.length === 0) {
    Logger.log('⚠️ Asistencia vacía — usando solo Gestión como fallback');
    for (var k = 1; k < datosG.length; k++) {
      var r      = datosG[k];
      var nombre = str(r, GC.NOMBRE);
      var rut    = normRut(str(r, GC.RUT));
      if (!nombre && !rut) continue;
      var tallerRaw = str(r, GC.TALLER);
      var taller    = normTaller(tallerRaw);
      var vigenciaRaw = r[GC.EMPAM_VIG];
      var presRaw     = r[GC.PRES_TOT];
      var presencias  = (!isNaN(Number(presRaw)) && presRaw !== '') ? Math.round(Number(presRaw)) : 0;
      var empamEstad  = calcEmpamEstado(str(r, GC.EMPAM_EST), vigenciaRaw);
      talleres[taller]     = (talleres[taller] || 0) + 1;
      empamEst[empamEstad] = (empamEst[empamEstad] || 0) + 1;
      pacientes.push({
        id: 'g' + k, nombre: nombre, rut: rut, taller: taller, tallerRaw: tallerRaw,
        ciclo: str(r, GC.CICLO), estado: str(r, GC.ESTADO),
        sexo: str(r, GC.SEXO), edad: str(r, GC.EDAD),
        fono: normFono(str(r, GC.FONO)), prevision: str(r, GC.PREVISION),
        hta: str(r, GC.HTA), ecv: str(r, GC.ECV), dm: str(r, GC.DM),
        dmir: str(r, GC.DMIR), resp: str(r, GC.RESP), caid: str(r, GC.CAID),
        empamEstado: empamEstad, empamFecha: normFecha(vigenciaRaw),
        empamPre: str(r, GC.EMPAM_EST), empamPost: str(r, GC.EMPAM_RES),
        tugPre: str(r, GC.TUG_PRE), tugPost: str(r, GC.TUG_POST),
        catInt: str(r, GC.CAT_I), catExt: str(r, GC.CAT_E),
        eupDerPre: str(r, GC.EUP_D_PRE), eupIzqPre: str(r, GC.EUP_I_PRE),
        eupDerPost: str(r, GC.EUP_D_POST), eupIzqPost: str(r, GC.EUP_I_POST),
        haqPre: str(r, GC.HAQ_PRE), haqPost: str(r, GC.HAQ_POST),
        resTug: str(r, GC.RES_TUG), resEupDer: str(r, GC.RES_EUP_D), resEupIzq: str(r, GC.RES_EUP_I),
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
      totalPacientes:    pacientes.length,
      talleres:          talleres,
      empamEstados:      empamEst,
      colDetectada:      { EMPAM_VIG: GC.EMPAM_VIG, EMPAM_EST: GC.EMPAM_EST, RUT: GC.RUT, NOMBRE: GC.NOMBRE, FONO: GC.FONO },
      colHardcoded:      { EMPAM_VIG: C.EMPAM_VIG,  EMPAM_EST: C.EMPAM_EST  },
      muestraEmpam:      presMuestra,
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
// Todas las comparaciones usan la fecha en zona América/Santiago para evitar
// desfases UTC que marquen VENCIDO un día antes del vencimiento real.
function calcEmpamEstado(codigoInterno, vigenciaRaw) {
  if (vigenciaRaw === '' || vigenciaRaw === null || vigenciaRaw === undefined) return 'PENDIENTE';

  // Hoy en zona Santiago como string "YYYY-MM-DD"
  var hoyStr = Utilities.formatDate(new Date(), 'America/Santiago', 'yyyy-MM-dd');

  // Convierte dos strings "YYYY-MM-DD" a días de diferencia (fecha - hoy), midnight local
  function diasEntre(fechaStr, hoyS) {
    var fp = fechaStr.split('-').map(Number);
    var hp = hoyS.split('-').map(Number);
    var fd = new Date(fp[0], fp[1]-1, fp[2]);
    var hd = new Date(hp[0], hp[1]-1, hp[2]);
    return Math.round((fd - hd) / 86400000);
  }

  function evalStr(fechaStr) {
    if (!fechaStr || fechaStr.length < 10) return 'PENDIENTE';
    var dias = diasEntre(fechaStr.slice(0,10), hoyStr);
    if (dias < 0)   return 'VENCIDO';
    if (dias <= 30) return 'VENCE PRONTO';
    return 'VIGENTE';
  }

  // "Prox. MAY" o similar
  var proxMatch = String(vigenciaRaw).match(/Prox\.?\s*(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)/i);
  if (proxMatch) {
    var meses = {ENE:1,FEB:2,MAR:3,ABR:4,MAY:5,JUN:6,JUL:7,AGO:8,SEP:9,OCT:10,NOV:11,DIC:12};
    var mes = meses[proxMatch[1].toUpperCase()];
    var s = '2026-' + String(mes).padStart(2,'0') + '-01';
    return evalStr(s);
  }

  // Serial Excel (número > 40000)
  var n = Number(vigenciaRaw);
  if (!isNaN(n) && n > 40000) {
    var fechaStr = Utilities.formatDate(new Date((n - 25569) * 86400000), 'America/Santiago', 'yyyy-MM-dd');
    return evalStr(fechaStr);
  }

  // Objeto Date de Sheets (caso más común — Sheets entrega Date para celdas de fecha)
  if (vigenciaRaw instanceof Date) {
    var fechaStr = Utilities.formatDate(vigenciaRaw, 'America/Santiago', 'yyyy-MM-dd');
    return evalStr(fechaStr);
  }

  // String ISO "YYYY-MM-DD" o similar
  if (typeof vigenciaRaw === 'string' && vigenciaRaw.length >= 10) {
    return evalStr(vigenciaRaw);
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

// ══════════════════════════════════════════════════════════════════
//  POST endpoints (backup, subscribe, push, REM)
//  Recibe URL-encoded form data desde la PWA con mode: 'no-cors'
// ══════════════════════════════════════════════════════════════════
function doPost(e) {
  try {
    var p = e.parameter || {};
    var action = p.action || '';

    if (action === 'backup')     return handleBackup(p);
    if (action === 'subscribe')  return handleSubscribe(p);
    if (action === 'unsubscribe')return handleUnsubscribe(p);
    if (action === 'rem')        return handleRemRequest(p);
    if (action === 'push')       return handleAdminPush(p);

    return output({ status: 'error', message: 'Acción desconocida: ' + action });
  } catch (err) {
    return output({ status: 'error', message: err.toString() });
  }
}

// ──────────────────────────────────────────────────────────────────
// BACKUP — guarda snapshot JSON en Drive
// ──────────────────────────────────────────────────────────────────
function handleBackup(p) {
  try {
    var user = p.user || 'anon';
    var snapshot = p.snapshot || '{}';
    var fechaIso = Utilities.formatDate(new Date(), 'America/Santiago', 'yyyy-MM-dd_HH-mm');
    var fileName = 'MAS_AMA_Backup_' + user + '_' + fechaIso + '.json';

    var folder = getOrCreateBackupFolder();
    var file = folder.createFile(fileName, snapshot, MimeType.PLAIN_TEXT);

    // Mantener solo los últimos 30 backups (LIFO)
    pruneOldBackups(folder, 30);

    return output({ status: 'ok', fileId: file.getId(), name: fileName });
  } catch (err) {
    return output({ status: 'error', message: err.toString() });
  }
}

function getOrCreateBackupFolder() {
  var name = 'MAS_AMA_Backups';
  var folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(name);
}

function pruneOldBackups(folder, keep) {
  try {
    var files = folder.getFiles();
    var arr = [];
    while (files.hasNext()) {
      var f = files.next();
      arr.push({ id: f.getId(), date: f.getDateCreated().getTime(), file: f });
    }
    arr.sort(function(a,b){ return b.date - a.date; });
    for (var i = keep; i < arr.length; i++) {
      arr[i].file.setTrashed(true);
    }
  } catch (e) { /* silent */ }
}

// ──────────────────────────────────────────────────────────────────
// PUSH SUBSCRIPTIONS — guarda en hoja SUBSCRIPTIONS
// ──────────────────────────────────────────────────────────────────
function handleSubscribe(p) {
  try {
    var ss = SpreadsheetApp.openById(GESTION_ID);
    var sh = ss.getSheetByName('SUBSCRIPTIONS') || ss.insertSheet('SUBSCRIPTIONS');
    if (sh.getLastRow() === 0) {
      sh.appendRow(['user', 'subscription', 'createdAt']);
    }
    var user = p.user || '?';
    var sub  = p.subscription || '';
    // Evitar duplicados: si ya existe la misma subscription, no agregamos
    var data = sh.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][1]) === sub) {
        return output({ status: 'ok', dup: true });
      }
    }
    sh.appendRow([user, sub, new Date().toISOString()]);
    return output({ status: 'ok' });
  } catch (err) {
    return output({ status: 'error', message: err.toString() });
  }
}

function handleUnsubscribe(p) {
  try {
    var ss = SpreadsheetApp.openById(GESTION_ID);
    var sh = ss.getSheetByName('SUBSCRIPTIONS');
    if (!sh) return output({ status: 'ok' });
    var sub = p.subscription || '';
    var data = sh.getDataRange().getValues();
    for (var i = data.length - 1; i >= 1; i--) {
      if (String(data[i][1]) === sub) sh.deleteRow(i + 1);
    }
    return output({ status: 'ok' });
  } catch (err) {
    return output({ status: 'error', message: err.toString() });
  }
}

// ──────────────────────────────────────────────────────────────────
// TRIGGER DIARIO — chequea EMPAM próximos y envía notificaciones
// Configurar trigger en Apps Script: Editor → Triggers → Add Trigger
//   Function: notifyEmpamProximos  ·  Time-based  ·  Daily  ·  08:00
// ──────────────────────────────────────────────────────────────────
function notifyEmpamProximos() {
  try {
    var datos = construirDatos();
    var hoy = new Date(); hoy.setHours(0,0,0,0);
    var alertas = (datos.pacientes || []).filter(function(p){
      var s = String(p.empamEstado || '').toUpperCase();
      return s.indexOf('VENCIDO') >= 0 || s === 'VENCE PRONTO';
    });

    // Construir mensaje
    var vencidos = alertas.filter(function(p){ return p.empamEstado.indexOf('VENCIDO') >= 0; }).length;
    var prontos  = alertas.filter(function(p){ return p.empamEstado === 'VENCE PRONTO';      }).length;

    var title = '🚨 EMPAM — ' + (vencidos + prontos) + ' pacientes requieren atención';
    var body  = vencidos + ' vencidos · ' + prontos + ' próximos a vencer. Toca para revisar.';

    sendPushToAll(title, body, { url: '/?view=alertas' });

    // Log para debugging
    Logger.log('[notifyEmpamProximos] vencidos=' + vencidos + ' prontos=' + prontos);
    return { status: 'ok', vencidos: vencidos, prontos: prontos };
  } catch (err) {
    Logger.log('[notifyEmpamProximos] ERROR: ' + err.toString());
    return { status: 'error', message: err.toString() };
  }
}

function sendPushToAll(title, body, extra) {
  var ss = SpreadsheetApp.openById(GESTION_ID);
  var sh = ss.getSheetByName('SUBSCRIPTIONS');
  if (!sh) return { count: 0 };

  var props = PropertiesService.getScriptProperties();
  var vapidPrivate = props.getProperty('VAPID_PRIVATE');
  var vapidPublic  = props.getProperty('VAPID_PUBLIC');
  var vapidSubject = props.getProperty('VAPID_SUBJECT') || 'mailto:daniel.moyav@gmail.com';

  if (!vapidPrivate || !vapidPublic) {
    Logger.log('[sendPushToAll] VAPID keys no configuradas');
    return { count: 0, reason: 'no-vapid-keys' };
  }

  var data = sh.getDataRange().getValues();
  var count = 0;
  var payload = JSON.stringify({ title: title, body: body, extra: extra || {} });

  for (var i = 1; i < data.length; i++) {
    try {
      var subStr = data[i][1];
      if (!subStr) continue;
      // El envío real requiere implementar el protocolo Web Push (VAPID + ECDH).
      // Apps Script no tiene libs nativas; opciones:
      //   1) Usar una Cloud Function intermediaria (más robusto)
      //   2) Usar servicio tipo Firebase Cloud Messaging via REST (FCM)
      // Para piloto: log a hoja, integración real cuando Daniel decida.
      var logSh = ss.getSheetByName('PUSH_LOG') || ss.insertSheet('PUSH_LOG');
      if (logSh.getLastRow() === 0) logSh.appendRow(['fecha','user','title','body']);
      logSh.appendRow([new Date(), data[i][0], title, body]);
      count++;
    } catch (e) { /* skip */ }
  }
  return { count: count };
}

// Endpoint manual para que la app dispare un push (vía admin secret)
function handleAdminPush(p) {
  if (p.secret !== ADMIN_SECRET) {
    return output({ status: 'error', message: 'No autorizado' });
  }
  var r = sendPushToAll(p.title || '🚨 MAS AMA', p.body || 'Notificación', null);
  return output({ status: 'ok', count: r.count });
}

// ──────────────────────────────────────────────────────────────────
// GENERACIÓN AUTOMÁTICA DE INFORME REM (Registro Estadístico Mensual)
// Devuelve URL del PDF generado.
// ──────────────────────────────────────────────────────────────────
function handleRemRequest(p) {
  try {
    var mes = parseInt(p.mes || (new Date().getMonth()+1));
    var anio = parseInt(p.anio || new Date().getFullYear());
    var r = generarREM(mes, anio);
    return output(r);
  } catch (err) {
    return output({ status: 'error', message: err.toString() });
  }
}

function generarREM(mes, anio) {
  var datos = construirDatos();
  var pacientes = datos.pacientes || [];

  var totalPacientes = pacientes.length;
  var mujeres   = pacientes.filter(function(p){ return p.sexo === 'M'; }).length;
  var hombres   = pacientes.filter(function(p){ return p.sexo === 'H'; }).length;
  var vencidos  = pacientes.filter(function(p){ return String(p.empamEstado||'').indexOf('VENCIDO')>=0; }).length;
  var vigentes  = pacientes.filter(function(p){ return String(p.empamEstado||'').indexOf('VIGENTE')>=0; }).length;
  var prontos   = pacientes.filter(function(p){ return String(p.empamEstado||'').indexOf('PRONTO')>=0; }).length;
  var nuevos    = pacientes.filter(function(p){ return p.isNew === true || p.isNew === 'SI'; }).length;

  // Distribución por taller
  var porTaller = {};
  pacientes.forEach(function(p){
    var t = p.taller || 'SIN ASIGNAR';
    porTaller[t] = (porTaller[t] || 0) + 1;
  });

  // Edades
  var edades = {'60-64':0,'65-69':0,'70-74':0,'75-79':0,'80+':0};
  pacientes.forEach(function(p){
    var e = parseInt(p.edad) || 0;
    if (e>=60 && e<=64) edades['60-64']++;
    else if (e>=65 && e<=69) edades['65-69']++;
    else if (e>=70 && e<=74) edades['70-74']++;
    else if (e>=75 && e<=79) edades['75-79']++;
    else if (e>=80) edades['80+']++;
  });

  // Crear Google Doc con plantilla
  var meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  var docName = 'REM_MAS_AMA_' + meses[mes-1] + '_' + anio;
  var doc = DocumentApp.create(docName);
  var body = doc.getBody();

  body.appendParagraph('INFORME REM — Programa MAS AMA').setHeading(DocumentApp.ParagraphHeading.TITLE);
  body.appendParagraph('CESFAM Félix de Amesti · Macul').setHeading(DocumentApp.ParagraphHeading.SUBTITLE);
  body.appendParagraph('Período: ' + meses[mes-1] + ' ' + anio);
  body.appendParagraph('Generado: ' + Utilities.formatDate(new Date(), 'America/Santiago', 'dd/MM/yyyy HH:mm'));
  body.appendHorizontalRule();

  body.appendParagraph('1. RESUMEN GENERAL').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  var t1 = body.appendTable([
    ['Indicador','Valor'],
    ['Total pacientes inscritos', String(totalPacientes)],
    ['Mujeres', String(mujeres)],
    ['Hombres', String(hombres)],
    ['Nuevos pacientes mes', String(nuevos)],
  ]);

  body.appendParagraph('2. ESTADO EMPAM').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendTable([
    ['Estado','Cantidad','%'],
    ['EMPAM vigente', String(vigentes), totalPacientes ? (vigentes*100/totalPacientes).toFixed(1) + '%' : '—'],
    ['Próximo a vencer (30d)', String(prontos), totalPacientes ? (prontos*100/totalPacientes).toFixed(1) + '%' : '—'],
    ['Vencido', String(vencidos), totalPacientes ? (vencidos*100/totalPacientes).toFixed(1) + '%' : '—'],
  ]);

  body.appendParagraph('3. DISTRIBUCIÓN POR TALLER').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  var tallerRows = [['Taller','N° pacientes']];
  Object.keys(porTaller).sort().forEach(function(t){ tallerRows.push([t, String(porTaller[t])]); });
  body.appendTable(tallerRows);

  body.appendParagraph('4. DISTRIBUCIÓN ETARIA').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendTable([
    ['Rango etario','Cantidad'],
    ['60-64', String(edades['60-64'])],
    ['65-69', String(edades['65-69'])],
    ['70-74', String(edades['70-74'])],
    ['75-79', String(edades['75-79'])],
    ['80 y más', String(edades['80+'])],
  ]);

  body.appendParagraph('5. ALERTAS DEL PERÍODO').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('Pacientes con EMPAM VENCIDO que requieren contacto inmediato:').setBold(true);
  var vencList = pacientes.filter(function(p){ return String(p.empamEstado||'').indexOf('VENCIDO')>=0; });
  if (vencList.length === 0) {
    body.appendParagraph('— Ninguno —');
  } else {
    vencList.slice(0,30).forEach(function(p){
      body.appendListItem(p.nombre + ' (' + p.rut + ') — ' + (p.taller||'sin taller'));
    });
  }

  body.appendHorizontalRule();
  body.appendParagraph('Informe generado automáticamente por MAS AMA Pro · Solo lectura · No reemplaza la revisión profesional.').setItalic(true);

  doc.saveAndClose();
  var docId = doc.getId();

  // Convertir a PDF y guardar en carpeta de REM
  var pdfBlob = DriveApp.getFileById(docId).getAs('application/pdf');
  pdfBlob.setName(docName + '.pdf');
  var folder = getOrCreateRemFolder();
  var pdfFile = folder.createFile(pdfBlob);

  return {
    status: 'ok',
    docUrl: 'https://docs.google.com/document/d/' + docId + '/edit',
    pdfUrl: pdfFile.getUrl(),
    docName: docName,
  };
}

function getOrCreateRemFolder() {
  var name = 'MAS_AMA_REM';
  var folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(name);
}

// Helper manual para ejecutar desde el Editor de Apps Script
function generarREMMesActual() {
  var hoy = new Date();
  var r = generarREM(hoy.getMonth()+1, hoy.getFullYear());
  Logger.log('REM generado: ' + r.docUrl);
  Logger.log('PDF: ' + r.pdfUrl);
}
