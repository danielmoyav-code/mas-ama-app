// ═══════════════════════════════════════════════════════════════════════
//  MAS AMA PWA v3 — app.js
//  PIN Lock + Registro Nuevos Pacientes + Export Excel + Sync Sheets
// ═══════════════════════════════════════════════════════════════════════
const { useState, useEffect, useCallback, useMemo, useRef } = React;

// ─────────────────────────────────────────────────────────────────────
// STORAGE
// ─────────────────────────────────────────────────────────────────────

// Inject btn-purple style if not present
(function(){
  if(!document.getElementById('masama-extra-styles')){
    const s=document.createElement('style');
    s.id='masama-extra-styles';
    s.textContent='.btn-purple{background:#7030A0;color:#fff}';
    document.head.appendChild(s);
  }
})();

const DB = {
  get:(k,d=null)=>{ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):d; }catch{return d;} },
  set:(k,v)=>{ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){ console.error(e); } },
  del:(k)=>localStorage.removeItem(k),
};

// ─────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────
const DEFAULT_PIN = '1234';
const TALLERES = ['UV19 AM27','VILLA MACUL M-J','CUMBRES ANDINAS','UV18','VM 2.0',
  'VILLA EL SALITRE','LA FUNDACIÓN','MANUAL','NUEVA VIDA','UV19 PM',
  'SAN SEBASTIAN','EXPERIENCIA Y JUVENTUD'];
const EMPAM_CODES = {
  ASR:'Autovalente Sin Riesgo', ACR:'Autovalente Con Riesgo',
  'EMPA/CV':'EMPAM Cardiovascular', DP:'Dependiente Parcial',
  RD:'Riesgo Dependencia', PEND:'Pendiente'
};
const RESULT_LABELS = {
  MEJ:'✅ Mejorado', MAN:'➡️ Mantenido', E:'📋 Estable', A:'⚠️ Alterado', PEND:'⏳ Pendiente'
};
const CICLOS = ['C1','C2','C3'];
const ESTADOS = ['TALLER','MANUAL +','LLAMAR','RECHAZA','EGRESO'];
const TODAY = new Date();

// ─────────────────────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────────────────────
function todayISO(){ return TODAY.toISOString().split('T')[0]; }
function formatDate(d){
  if(!d||d==='—') return '—';
  try{ return new Date(d).toLocaleDateString('es-CL'); }catch{ return String(d); }
}
function empamColor(estado){
  if(!estado) return 'pendiente';
  const s=String(estado).toUpperCase();
  if(s.includes('VENCIDO')) return 'vencido';
  if(s.includes('PRONTO'))  return 'pronto';
  if(s.includes('VIGENTE')) return 'vigente';
  return 'pendiente';
}
function genId(nombre,rut){
  const base=rut?String(rut).replace(/[\.\-\s]/g,'').toUpperCase().replace(/\.0$/,'')
               :String(nombre||'').replace(/\s/g,'').toUpperCase().slice(0,12);
  return base||`PAC_${Date.now()}`;
}
function calcEmpamEstado(fecha){
  if(!fecha) return 'PENDIENTE';
  try{
    const d=new Date(fecha); if(isNaN(d)) return 'PENDIENTE';
    const dias=Math.round((d-TODAY)/86400000);
    if(dias<0) return 'VENCIDO';
    if(dias<=30) return 'VENCE PRONTO';
    return 'VIGENTE';
  }catch{ return 'PENDIENTE'; }
}
function calcDias(fecha){
  if(!fecha) return null;
  try{ return Math.round((new Date(fecha)-TODAY)/86400000); }catch{ return null; }
}

// ─────────────────────────────────────────────────────────────────────
// EXCEL IMPORT
// ─────────────────────────────────────────────────────────────────────
function parseMaestroExcel(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=e=>{
      try{
        const wb=XLSX.read(e.target.result,{type:'array',cellDates:true});
        const wsName=wb.SheetNames.find(n=>n.includes('MAESTRO'))||wb.SheetNames[0];
        const ws=wb.Sheets[wsName];
        const raw=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:false});
        if(raw.length<2){ reject('Archivo vacío'); return; }
        const headers=raw[0];
        const patients=[];
        for(let i=1;i<raw.length;i++){
          const row=raw[i];
          if(!row[1]&&!row[0]) continue;
          const o={};
          headers.forEach((h,ci)=>{ if(h) o[h]=row[ci]??''; });
          const rut=String(o['RUT']||o['RUT_PLANILLA']||'').trim();
          const nombre=String(o['NOMBRE']||o['NOMBRE_PLANILLA']||'').trim().toUpperCase();
          if(!nombre) continue;
          const empamFecha=String(o['Fecha Venc EMPAM']||'').trim();
          patients.push({
            id:genId(nombre,rut), nombre, rut,
            fono:String(o['FONO']||'').trim(),
            sexo:String(o['SEXO']||'').trim().toUpperCase(),
            edad:o['EDAD']!==''?String(o['EDAD']):'',
            rango:String(o['RANGO ETARIO']||'').trim(),
            pais:String(o['PAÍS']||'Chile').trim(),
            prevision:String(o['PREVISIÓN']||'FONASA').trim(),
            taller:String(o['TALLER ASIGNADO']||'').trim(),
            ciclo:String(o['CICLO']||'').trim(),
            estado:String(o['ESTADO']||'').trim(),
            detalle:String(o['DETALLE ESTADO']||'').trim(),
            hta:o['HTA']?'SI':'', ecv:o['ECV']?'SI':'',
            dm:o['DM']?'SI':'', dmir:o['DMIR']?'SI':'',
            resp:o['RESP']?'SI':'', caid:o['CAID']?'SI':'',
            empamPre:String(o['EMPAM (Pre)']||'').trim(),
            empamPost:String(o['EMPAM (Post)']||'').trim(),
            empamEstado:String(o['Estado EMPAM']||calcEmpamEstado(empamFecha)).trim(),
            empamFecha, empamDias:calcDias(empamFecha),
            tugPre:o['TUG Pre (seg)']!==''?o['TUG Pre (seg)']:'',
            eupDerPre:o['EUP Der Pre (seg)']!==''?o['EUP Der Pre (seg)']:'',
            eupIzqPre:o['EUP Izq Pre (seg)']!==''?o['EUP Izq Pre (seg)']:'',
            velDerPre:o['Velocidad Der Pre']||'', velIzqPre:o['Velocidad Izq Pre']||'',
            haqPre:o['HAQ Pre']!==''?o['HAQ Pre']:'',
            dolorDPre:o['Dolor D° Pre']||'', dolorIPre:o['Dolor I° Pre']||'',
            catInt:o['CAT Interna']||'', catExt:o['CAT Externa']||'',
            tugPost:o['TUG Post (seg)']!==''?o['TUG Post (seg)']:'',
            eupDerPost:o['EUP Der Post (seg)']!==''?o['EUP Der Post (seg)']:'',
            eupIzqPost:o['EUP Izq Post (seg)']!==''?o['EUP Izq Post (seg)']:'',
            haqPost:o['HAQ Post']!==''?o['HAQ Post']:'',
            dolorDPost:o['Dolor D° Post']||'', dolorIPost:o['Dolor I° Post']||'',
            resTug:o['Resultado TUG']||'', resEupDer:o['Resultado EUP Der']||'',
            resEupIzq:o['Resultado EUP Izq']||'', estadoFunc:o['Estado Funcional']||'',
            alertaAsist:String(o['Alerta Asistencia']||'').trim(),
            totalPresencias:o['Total Presencias']!==''?Number(o['Total Presencias'])||0:0,
            totalSesiones:o['Total Sesiones Realizadas']!==''?Number(o['Total Sesiones Realizadas'])||0:0,
            pctAsistencia:o['% Asistencia']!==''?Number(o['% Asistencia'])||0:0,
            isNew:false, createdAt:new Date().toISOString(),
          });
        }
        resolve(patients);
      }catch(err){ reject(err.message||'Error al leer'); }
    };
    reader.onerror=()=>reject('Error al leer archivo');
    reader.readAsArrayBuffer(file);
  });
}

// ─────────────────────────────────────────────────────────────────────
// EXCEL EXPORT
// ─────────────────────────────────────────────────────────────────────
function exportToExcel(patients,attendanceLog,month){
  const wb=XLSX.utils.book_new();
  const headers=['NOMBRE','RUT','TALLER ASIGNADO','CICLO','ESTADO','DETALLE ESTADO',
    'SEXO','EDAD','FONO','PREVISIÓN','HTA','ECV','DM','DMIR','RESP','CAID',
    'EMPAM (Pre)','EMPAM (Post)','Estado EMPAM','Fecha Venc EMPAM','Dias Vigencia',
    'TUG Pre','EUP Der Pre','EUP Izq Pre','HAQ Pre',
    'TUG Post','EUP Der Post','EUP Izq Post','HAQ Post',
    'Resultado TUG','Resultado EUP Der','Resultado EUP Izq','Estado Funcional',
    'Total Presencias','Total Sesiones','% Asistencia','Alerta Asistencia',
    'NUEVO','Fecha Registro'];
  const rows=[headers];
  patients.forEach(p=>rows.push([
    p.nombre,p.rut,p.taller,p.ciclo,p.estado,p.detalle,
    p.sexo,p.edad,p.fono,p.prevision,p.hta,p.ecv,p.dm,p.dmir,p.resp,p.caid,
    p.empamPre,p.empamPost,p.empamEstado,p.empamFecha,p.empamDias,
    p.tugPre,p.eupDerPre,p.eupIzqPre,p.haqPre,
    p.tugPost,p.eupDerPost,p.eupIzqPost,p.haqPost,
    p.resTug,p.resEupDer,p.resEupIzq,p.estadoFunc,
    p.totalPresencias,p.totalSesiones,p.pctAsistencia,p.alertaAsist,
    p.isNew?'SI':'',p.createdAt||''
  ]));
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),'MAESTRO');

  if(attendanceLog&&Object.keys(attendanceLog).length>0){
    const ah=[['FECHA','TALLER','RUT','NOMBRE','ASISTENCIA','CICLO']];
    Object.entries(attendanceLog).forEach(([key,val])=>{
      const [date,taller,rut]=key.split('||');
      const p=patients.find(x=>x.rut===rut||x.id===rut);
      ah.push([date,taller,rut,p?p.nombre:'—',val==='P'?'Presente':'Ausente',p?p.ciclo:'']);
    });
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(ah),`ASISTENCIA ${month}`);
  }

  const alh=[['NOMBRE','RUT','TALLER','FONO','Estado EMPAM','Fecha Venc','Días',
               'Alerta Asistencia','Presencias','%']];
  patients.filter(p=>p.empamEstado?.includes('VENCIDO')||p.empamEstado?.includes('PRONTO')||
    p.alertaAsist?.includes('BAJO')||p.isNew)
    .forEach(p=>alh.push([p.nombre,p.rut,p.taller,p.fono,p.empamEstado,
      p.empamFecha,p.empamDias,p.alertaAsist,p.totalPresencias,p.pctAsistencia]));
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(alh),'ALERTAS');

  const newPats=patients.filter(p=>p.isNew);
  if(newPats.length>0){
    const nh=[['FECHA','NOMBRE','RUT','TALLER','CICLO','SEXO','EDAD','FONO',
               'EMPAM','TUG Pre','HAQ Pre','EUP Der','EUP Izq','HTA','DM','ECV']];
    newPats.forEach(p=>nh.push([p.createdAt,p.nombre,p.rut,p.taller,p.ciclo,
      p.sexo,p.edad,p.fono,p.empamPre,p.tugPre,p.haqPre,p.eupDerPre,p.eupIzqPre,
      p.hta,p.dm,p.ecv]));
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(nh),'NUEVOS PACIENTES');
  }

  const fn=`MAS_AMA_${(month||'Export').replace('-','_')}_${todayISO()}.xlsx`;
  XLSX.writeFile(wb,fn);
}

// ─────────────────────────────────────────────────────────────────────
// UI ATOMS
// ─────────────────────────────────────────────────────────────────────
function Toast({msg,onDone}){
  useEffect(()=>{ const t=setTimeout(onDone,2500); return()=>clearTimeout(t); },[]);
  return React.createElement('div',{className:'toast'},msg);
}
function Chip({color='gray',children}){
  return React.createElement('span',{className:`chip chip-${color}`},children);
}
function EmpamChip({estado}){
  const c=empamColor(estado||'');
  const map={vencido:'red',pronto:'yellow',vigente:'green',pendiente:'gray'};
  const label={vencido:'🔴 Vencido',pronto:'🟡 Vence Pronto',vigente:'🟢 Vigente',pendiente:'⏳ Pend.'};
  return React.createElement(Chip,{color:map[c]},label[c]||estado||'—');
}
function AsistChip({alerta,presencias,total}){
  const bajo=String(alerta).includes('BAJO');
  return React.createElement('span',{className:`chip chip-${bajo?'red':'green'}`},
    `${bajo?'🔴':'🟢'} ${presencias||0}/${total||24} ses.`);
}
function Avatar({sexo,nombre,isNew}){
  const isMujer=String(sexo).toUpperCase()==='M';
  const ini=(nombre||'?').split(' ').map(w=>w[0]||'').slice(0,2).join('');
  const cls=isNew?'avatar-new':isMujer?'avatar-f':'avatar-m';
  return React.createElement('div',{className:`avatar ${cls}`},ini||'?');
}
function SectionHdr({children}){
  return React.createElement('div',{className:'section-hdr'},children);
}
function Field({label,children}){
  return React.createElement('div',{className:'field'},
    React.createElement('label',null,label),children);
}
function DetailItem({label,value,color}){
  return React.createElement('div',{className:'detail-item'},
    React.createElement('div',{className:'d-label'},label),
    React.createElement('div',{className:'d-val',style:color?{color}:{}},
      value===''||value===null||value===undefined?'—':String(value)));
}
function ProgressBar({value,max,color='#375623'}){
  const pct=max>0?Math.min(100,(value/max)*100):0;
  return React.createElement('div',{className:'progress-bar'},
    React.createElement('div',{className:'progress-fill',style:{width:`${pct}%`,background:color}}));
}
function PatientRow({patient,onClick}){
  return React.createElement('div',{className:'patient-row',onClick},
    React.createElement(Avatar,{sexo:patient.sexo,nombre:patient.nombre,isNew:patient.isNew}),
    React.createElement('div',{className:'p
