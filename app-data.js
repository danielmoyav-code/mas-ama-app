// ═══════════════════════════════════════════════════════════════
//  MAS AMA PWA — app.js
//  React 18 via CDN + SheetJS for Excel
// ═══════════════════════════════════════════════════════════════
const { useState, useEffect, useCallback, useMemo, useRef } = React;

// ── DB: localStorage helpers ──────────────────────────────────
const DB = {
  get: (k, def = null) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) { console.error('Storage full', e); } },
  del: (k) => localStorage.removeItem(k),
};

// ── CONSTANTS ─────────────────────────────────────────────────
const TALLERES = ['UV19 AM27','VILLA MACUL M-J','CUMBRES ANDINAS','UV18','VM 2.0',
                  'VILLA EL SALITRE','LA FUNDACIÓN','MANUAL','NUEVA VIDA','UV19 PM',
                  'SAN SEBASTIAN','EXPERIENCIA Y JUVENTUD'];

const EMPAM_CODES = { ASR:'Autovalente Sin Riesgo', ACR:'Autovalente Con Riesgo',
                      'EMPA/CV':'EMPAM Cardiovascular', DP:'Dependiente Parcial',
                      RD:'Riesgo Dependencia', PEND:'Pendiente' };

const RESULT_LABELS = { MEJ:'✅ Mejorado', MAN:'➡️ Mantenido', E:'📋 Estable',
                        A:'⚠️ Alterado', PEND:'⏳ Pendiente' };

const TODAY = new Date();

// ── UTILS ─────────────────────────────────────────────────────
function empamColor(estado) {
  if (!estado) return 'gray';
  if (estado.includes('VENCIDO'))  return 'red';
  if (estado.includes('PRONTO'))   return 'yellow';
  if (estado.includes('VIGENTE'))  return 'green';
  return 'gray';
}

function formatDate(d) {
  if (!d) return '—';
  if (d instanceof Date) return d.toLocaleDateString('es-CL');
  try { return new Date(d).toLocaleDateString('es-CL'); } catch { return String(d); }
}

function todayISO() {
  return TODAY.toISOString().split('T')[0];
}

function calcDaysUntil(dateStr) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    const diff = Math.round((d - TODAY) / 86400000);
    return diff;
  } catch { return null; }
}

// ── EXCEL PARSER ──────────────────────────────────────────────
function parseMaestroExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
        const ws = wb.Sheets['MAESTRO'] || wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });

        if (raw.length < 2) { reject('Archivo vacío'); return; }
        const headers = raw[0];
        const patients = [];

        for (let i = 1; i < raw.length; i++) {
          const row = raw[i];
          if (!row[1] && !row[0]) continue; // skip empty
          const obj = {};
          headers.forEach((h, ci) => { if (h) obj[h] = row[ci] ?? ''; });

          // Build clean patient record
          const p = {
            id: String(obj['RUT'] || obj['NOMBRE_PLANILLA'] || i).trim().replace(/[\.\-\s]/g,'').replace(/\.0$/,'').toUpperCase(),
            nombre: String(obj['NOMBRE'] || obj['NOMBRE_PLANILLA'] || '').trim().toUpperCase(),
            rut: String(obj['RUT'] || obj['RUT_PLANILLA'] || '').trim(),
            fono: String(obj['FONO'] || '').trim(),
            sexo: String(obj['SEXO'] || '').trim().toUpperCase(),
            edad: obj['EDAD'] || '',
            rango: String(obj['RANGO ETARIO'] || '').trim(),
            taller: String(obj['TALLER ASIGNADO'] || '').trim(),
            ciclo: String(obj['CICLO'] || '').trim(),
            estado: String(obj['ESTADO'] || '').trim(),
            detalle: String(obj['DETALLE ESTADO'] || '').trim(),
            // Diagnósticos
            hta: obj['HTA'] ? 'SI' : '',
            ecv: obj['ECV'] ? 'SI' : '',
            dm: obj['DM'] ? 'SI' : '',
            dmir: obj['DMIR'] ? 'SI' : '',
            resp: obj['RESP'] ? 'SI' : '',
            // EMPAM
            empamPre: String(obj['EMPAM (Pre)'] || '').trim(),
            empamPost: String(obj['EMPAM (Post)'] || '').trim(),
            empamEstado: String(obj['Estado EMPAM'] || '').trim(),
            empamFecha: String(obj['Fecha Venc EMPAM'] || '').trim(),
            empamDias: obj['Dias Vigencia EMPAM'] !== '' ? Number(obj['Dias Vigencia EMPAM']) : null,
            // Clínico Pre
            tugPre: obj['TUG Pre (seg)'] !== '' ? obj['TUG Pre (seg)'] : '',
            eupDerPre: obj['EUP Der Pre (seg)'] !== '' ? obj['EUP Der Pre (seg)'] : '',
            eupIzqPre: obj['EUP Izq Pre (seg)'] !== '' ? obj['EUP Izq Pre (seg)'] : '',
            haqPre: obj['HAQ Pre'] !== '' ? obj['HAQ Pre'] : '',
            dolorDPre: obj['Dolor D° Pre'] || '',
            dolorIPre: obj['Dolor I° Pre'] || '',
            catInt: obj['CAT Interna'] || '',
            catExt: obj['CAT Externa'] || '',
            // Clínico Post
            tugPost: obj['TUG Post (seg)'] !== '' ? obj['TUG Post (seg)'] : '',
            eupDerPost: obj['EUP Der Post (seg)'] !== '' ? obj['EUP Der Post (seg)'] : '',
            eupIzqPost: obj['EUP Izq Post (seg)'] !== '' ? obj['EUP Izq Post (seg)'] : '',
            haqPost: obj['HAQ Post'] !== '' ? obj['HAQ Post'] : '',
            dolorDPost: obj['Dolor D° Post'] || '',
            dolorIPost: obj['Dolor I° Post'] || '',
            // Resultados
            resTug: obj['Resultado TUG'] || '',
            resEupDer: obj['Resultado EUP Der'] || '',
            resEupIzq: obj['Resultado EUP Izq'] || '',
            estadoFunc: obj['Estado Funcional'] || '',
            // Asistencia
            alertaAsist: String(obj['Alerta Asistencia'] || '').trim(),
            totalPresencias: obj['Total Presencias'] !== '' ? Number(obj['Total Presencias']) : 0,
            totalSesiones: obj['Total Sesiones Realizadas'] !== '' ? Number(obj['Total Sesiones Realizadas']) : 0,
            pctAsistencia: obj['% Asistencia'] !== '' ? Number(obj['% Asistencia']) : 0,
          };
          if (p.nombre) patients.push(p);
        }
        resolve(patients);
      } catch(err) { reject(err.message || 'Error al leer archivo'); }
    };
    reader.onerror = () => reject('Error al leer archivo');
    reader.readAsArrayBuffer(file);
  });
}

// ── EXPORT EXCEL ──────────────────────────────────────────────
function exportToExcel(patients, attendanceLog, month) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Maestro actualizado
  const rows = [
    ['NOMBRE','RUT','TALLER','CICLO','ESTADO','SEXO','EDAD','EMPAM (Pre)','Estado EMPAM',
     'Fecha Venc EMPAM','TUG Pre','EUP Der Pre','EUP Izq Pre','HAQ Pre','TUG Post','EUP Der Post',
     'EUP Izq Post','HAQ Post','Resultado TUG','Resultado EUP Der','Resultado EUP Izq',
     'Estado Funcional','Total Presencias','Total Sesiones','% Asistencia','Alerta Asistencia',
     'HTA','ECV','DM','DMIR']
  ];
  patients.forEach(p => rows.push([
    p.nombre, p.rut, p.taller, p.ciclo, p.estado, p.sexo, p.edad,
    p.empamPre, p.empamEstado, p.empamFecha,
    p.tugPre, p.eupDerPre, p.eupIzqPre, p.haqPre,
    p.tugPost, p.eupDerPost, p.eupIzqPost, p.haqPost,
    p.resTug, p.resEupDer, p.resEupIzq, p.estadoFunc,
    p.totalPresencias, p.totalSesiones, p.pctAsistencia,
    p.alertaAsist, p.hta, p.ecv, p.dm, p.dmir
  ]));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'MAESTRO');

  // Sheet 2: Registro de asistencia del mes
  if (attendanceLog && Object.keys(attendanceLog).length > 0) {
    const attRows = [['FECHA','TALLER','RUT','NOMBRE','ASISTENCIA']];
    Object.entries(attendanceLog).forEach(([key, val]) => {
      const [date, taller, rut] = key.split('||');
      const p = patients.find(x => x.rut === rut || x.id === rut);
      attRows.push([date, taller, rut, p ? p.nombre : '—', val === 'P' ? 'Presente' : 'Ausente']);
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(attRows), `ASISTENCIA ${month}`);
  }

  // Sheet 3: Alertas
  const alertRows = [['NOMBRE','RUT','TALLER','Estado EMPAM','Fecha Venc EMPAM','Días','Alerta Asistencia','Presencias','%']];
  patients.forEach(p => {
    if (p.empamEstado.includes('VENCIDO') || p.empamEstado.includes('PRONTO') ||
        p.alertaAsist.includes('BAJO') || p.empamEstado.includes('PEND')) {
      alertRows.push([p.nombre,p.rut,p.taller,p.empamEstado,p.empamFecha,
                       p.empamDias,p.alertaAsist,p.totalPresencias,p.pctAsistencia]);
    }
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(alertRows), 'ALERTAS');

  const fname = `MAS_AMA_${month || 'Export'}_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, fname);
}
