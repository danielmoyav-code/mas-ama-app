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
  if(!fecha||fecha==='PEND') return 'PENDIENTE';
  try{
    // Manejar "Prox. ENE/FEB/..." — mes aproximado año 2026
    const proxMatch = String(fecha).match(/Prox\.?\s*(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)/i);
    if(proxMatch){
      const meses={ENE:1,FEB:2,MAR:3,ABR:4,MAY:5,JUN:6,JUL:7,AGO:8,SEP:9,OCT:10,NOV:11,DIC:12};
      const mesNum=meses[proxMatch[1].toUpperCase()];
      const f=new Date(2026,mesNum-1,1);
      const dias=Math.round((f-TODAY)/86400000);
      if(dias<0) return 'VENCIDO';
      if(dias<=30) return 'VENCE PRONTO';
      return 'VIGENTE';
    }
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
    React.createElement('div',{className:'p-info'},
      React.createElement('div',{className:'p-name'},patient.nombre),
      React.createElement('div',{className:'p-sub'},
        `${patient.edad?patient.edad+' años':''}${patient.edad&&patient.taller?' · ':''}${patient.taller||''}`),
      React.createElement('div',{className:'p-chips'},
        React.createElement(EmpamChip,{estado:patient.empamEstado}),
        patient.isNew&&React.createElement(Chip,{color:'green'},'✨ Nuevo')
      )
    ),
    React.createElement('span',{style:{fontSize:20,color:'#ccc'}},'›')
  );
}

// ─────────────────────────────────────────────────────────────────────
// PIN LOCK SCREEN
// ─────────────────────────────────────────────────────────────────────
function PinScreen({onUnlock}){
  const [pin,setPin]=useState('');
  const [error,setError]=useState('');
  const [shake,setShake]=useState(false);
  const savedPin=DB.get('appPin',DEFAULT_PIN);

  function press(d){
    if(pin.length>=4) return;
    const next=pin+d;
    setPin(next);
    setError('');
    if(next.length===4){
      if(next===savedPin){
        setTimeout(()=>onUnlock(),150);
      } else {
        setShake(true);
        setTimeout(()=>{ setPin(''); setError('PIN incorrecto'); setShake(false); },600);
      }
    }
  }
  function del(){ setPin(p=>p.slice(0,-1)); setError(''); }

  const dots=[0,1,2,3].map(i=>React.createElement('div',{key:i,style:{
    width:18,height:18,borderRadius:'50%',margin:'0 10px',
    background:pin.length>i?'#fff':'rgba(255,255,255,0.3)',
    transition:'background .15s',
  }}));

  const keys=['1','2','3','4','5','6','7','8','9','','0','⌫'];

  return React.createElement('div',{style:{
    position:'fixed',inset:0,background:'linear-gradient(160deg,#1F3864,#2E75B6)',
    display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
    color:'#fff',fontFamily:'Segoe UI,Arial,sans-serif',zIndex:999,
  }},
    React.createElement('div',{style:{fontSize:56,marginBottom:8}},'🏃'),
    React.createElement('div',{style:{fontSize:24,fontWeight:900,letterSpacing:1,marginBottom:4}},'MAS AMA'),
    React.createElement('div',{style:{fontSize:14,opacity:.7,marginBottom:40}},'CESFAM Félix de Amesti'),

    // Dots
    React.createElement('div',{style:{display:'flex',marginBottom:8,
      animation:shake?'shake .5s ease':'none'},
      className:shake?'pin-shake':''},dots),

    error&&React.createElement('div',{style:{fontSize:13,color:'#FFD966',marginBottom:8,height:20}},error),
    !error&&React.createElement('div',{style:{height:28}}),

    // Keypad
    React.createElement('div',{style:{
      display:'grid',gridTemplateColumns:'repeat(3,80px)',gap:14,marginTop:8
    }},
      keys.map((k,i)=>React.createElement('button',{
        key:i,
        onClick:()=>k==='⌫'?del():k?press(k):null,
        style:{
          width:80,height:80,borderRadius:'50%',border:'none',
          background:k?'rgba(255,255,255,0.15)':'transparent',
          color:'#fff',fontSize:k==='⌫'?22:28,fontWeight:700,
          cursor:k?'pointer':'default',
          transition:'background .1s',
          visibility:k===''?'hidden':'visible',
        }
      },k))
    ),

    React.createElement('div',{style:{position:'absolute',bottom:30,fontSize:12,opacity:.5}},
      'PIN por defecto: 1234')
  );
}

// ─────────────────────────────────────────────────────────────────────
// VIEW: INICIO
// ─────────────────────────────────────────────────────────────────────



// ─────────────────────────────────────────────────────────────────────
// MINI CHART COMPONENTS (SVG, no external libs)
// ─────────────────────────────────────────────────────────────────────
function BarChart({data, color='#2E75B6', height=120, showValues=true, horizontal=false}){
  if(!data||!data.length) return null;
  const max=Math.max(...data.map(d=>d.value),1);

  if(horizontal){
    // Horizontal bar chart — avoids label overlap
    const rowH=28; const labelW=110; const barAreaW=160; const valW=30;
    const totalW=labelW+barAreaW+valW;
    const totalH=data.length*rowH+8;
    return React.createElement('svg',{
      viewBox:`0 0 ${totalW} ${totalH}`,style:{width:'100%',display:'block'}
    },
      data.map((d,i)=>{
        const bw=Math.max(4,Math.round((d.value/max)*(barAreaW-8)));
        const y=i*rowH+4;
        const lbl=d.label.length>16?d.label.slice(0,15)+'…':d.label;
        return React.createElement('g',{key:i},
          React.createElement('text',{x:labelW-6,y:y+rowH/2+4,textAnchor:'end',fontSize:10,fill:'#444'},lbl),
          React.createElement('rect',{x:labelW,y:y+4,width:bw,height:rowH-10,rx:4,fill:d.color||color,opacity:.85}),
          React.createElement('text',{x:labelW+bw+4,y:y+rowH/2+4,fontSize:10,fontWeight:700,fill:d.color||color},d.value)
        );
      })
    );
  }

  // Vertical bar chart (for smaller datasets like age)
  const barW=Math.min(36, Math.floor(260/data.length)-6);
  const totalW=data.length*(barW+6)+6;
  const labelH=32;
  return React.createElement('svg',{
    viewBox:`0 0 ${Math.max(totalW,200)} ${height+labelH}`,
    style:{width:'100%',overflow:'visible',display:'block'}
  },
    data.map((d,i)=>{
      const bh=Math.max(4,Math.round((d.value/max)*(height-14)));
      const x=i*(barW+6)+3;
      const y=height-bh;
      return React.createElement('g',{key:i},
        React.createElement('rect',{x,y,width:barW,height:bh,rx:4,fill:d.color||color,opacity:.85}),
        showValues&&d.value>0&&React.createElement('text',{
          x:x+barW/2,y:y-3,textAnchor:'middle',fontSize:10,fontWeight:700,fill:'#333'
        },d.value),
        React.createElement('text',{
          x:x+barW/2,y:height+13,textAnchor:'middle',fontSize:9,fill:'#555'
        },d.label)
      );
    })
  );
}

function DonutChart({slices, size=120}){
  const total=slices.reduce((s,d)=>s+d.value,0);
  if(!total) return null;
  const r=46; const cx=size/2; const cy=size/2;
  let angle=-Math.PI/2;
  const paths=slices.map(d=>{
    const sweep=(d.value/total)*Math.PI*2;
    const x1=cx+r*Math.cos(angle); const y1=cy+r*Math.sin(angle);
    angle+=sweep;
    const x2=cx+r*Math.cos(angle); const y2=cy+r*Math.sin(angle);
    const large=sweep>Math.PI?1:0;
    return {path:`M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z`,
            color:d.color, label:d.label, value:d.value};
  });
  return React.createElement('svg',{viewBox:`0 0 ${size} ${size}`,style:{width:size,height:size}},
    paths.map((p,i)=>React.createElement('path',{key:i,d:p.path,fill:p.color,stroke:'#fff',strokeWidth:2})),
    React.createElement('circle',{cx,cy,r:28,fill:'#fff'}),
    React.createElement('text',{x:cx,y:cy+4,textAnchor:'middle',fontSize:12,fontWeight:800,fill:'#333'},total)
  );
}

// ─────────────────────────────────────────────────────────────────────
// CLINICAL COMPARE COMPONENT
// ─────────────────────────────────────────────────────────────────────
function ClinicalCompare({label, pre, post, unit='', lowerIsBetter=true}){
  const preN=parseFloat(pre); const postN=parseFloat(post);
  const hasData=!isNaN(preN)&&!isNaN(postN);
  let arrow='', arrowColor='#777', trend='';
  if(hasData){
    const improved=lowerIsBetter?(postN<preN):(postN>preN);
    const same=postN===preN;
    if(same){ arrow='→'; arrowColor='#ED7D31'; trend='Sin cambio'; }
    else if(improved){ arrow='↓'; arrowColor='#375623'; trend='Mejoró'; }
    else { arrow='↑'; arrowColor='#C00000'; trend='Empeoró'; }
    if(!lowerIsBetter&&improved){ arrow='↑'; }
    if(!lowerIsBetter&&!improved&&!same){ arrow='↓'; }
  }
  return React.createElement('div',{style:{
    background:'#F8F9FA',borderRadius:10,padding:'10px 12px',marginBottom:8,
    borderLeft:`4px solid ${hasData?(arrowColor==='#375623'?'#70AD47':arrowColor==='#C00000'?'#C00000':'#ED7D31'):'#ddd'}`
  }},
    React.createElement('div',{style:{fontSize:11,fontWeight:700,color:'#777',textTransform:'uppercase',marginBottom:4}},label),
    React.createElement('div',{style:{display:'flex',alignItems:'center',gap:10}},
      React.createElement('div',{style:{textAlign:'center',flex:1}},
        React.createElement('div',{style:{fontSize:11,color:'#999'}}, 'PRE'),
        React.createElement('div',{style:{fontSize:20,fontWeight:900,color:'#333'}},pre||'—',
          pre&&React.createElement('span',{style:{fontSize:11,color:'#888',marginLeft:2}},unit))
      ),
      hasData&&React.createElement('div',{style:{fontSize:28,fontWeight:900,color:arrowColor}},arrow),
      React.createElement('div',{style:{textAlign:'center',flex:1}},
        React.createElement('div',{style:{fontSize:11,color:'#999'}},'POST'),
        React.createElement('div',{style:{fontSize:20,fontWeight:900,color:postN&&arrowColor||'#333'}},post||'—',
          post&&React.createElement('span',{style:{fontSize:11,color:'#888',marginLeft:2}},unit))
      ),
      hasData&&React.createElement('div',{style:{
        fontSize:11,fontWeight:700,color:arrowColor,
        background:arrowColor+'20',borderRadius:6,padding:'3px 7px'
      }},trend)
    )
  );
}




function ViewInicio({patients,attendanceLog,onNav,currentUser,autoSync,syncStatus,lastSync,doSync}){
  const esJefe = currentUser?.rol === ROLES.JEFE;
  const total    =patients.length;
  const vencidos =patients.filter(p=>p.empamEstado?.includes('VENCIDO')).length;
  const prontos  =patients.filter(p=>p.empamEstado?.includes('PRONTO')).length;
  const bajo     =patients.filter(p=>p.alertaAsist?.includes('BAJO')).length;
  const nuevos   =patients.filter(p=>p.isNew||p.isNew==='SI').length;
  const hoyReg   =Object.keys(attendanceLog).filter(k=>k.startsWith(todayISO())).length;
  const vigente  =patients.filter(p=>p.empamEstado?.includes('VIGENTE')).length;
  const pendiente=patients.filter(p=>p.empamEstado?.includes('PEND')).length;

  // Taller stats for bar chart
  const tallerStats={};
  patients.forEach(p=>{
    if(!p.taller) return;
    if(!tallerStats[p.taller]) tallerStats[p.taller]={n:0,bajo:0};
    tallerStats[p.taller].n++;
    if(p.alertaAsist?.includes('BAJO')) tallerStats[p.taller].bajo++;
  });

  // Age distribution
  const ageRanges={'60-64':0,'65-69':0,'70-74':0,'75-79':0,'80+':0};
  patients.forEach(p=>{
    const e=Number(p.edad);
    if(e>=60&&e<=64) ageRanges['60-64']++;
    else if(e>=65&&e<=69) ageRanges['65-69']++;
    else if(e>=70&&e<=74) ageRanges['70-74']++;
    else if(e>=75&&e<=79) ageRanges['75-79']++;
    else if(e>=80) ageRanges['80+']++;
  });

  const empamSlices=[
    {label:'Vencido',value:vencidos,color:'#C00000'},
    {label:'Pronto',value:prontos,color:'#ED7D31'},
    {label:'Vigente',value:vigente,color:'#70AD47'},
    {label:'Pendiente',value:pendiente,color:'#BBBBC0'},
  ].filter(s=>s.value>0);

  const tallerBarData=Object.entries(tallerStats)
    .map(([t,s])=>({label:t,value:s.n,color:s.bajo>s.n*0.5?'#C00000':'#2E75B6'}))
    .sort((a,b)=>b.value-a.value);

  const ageBarData=Object.entries(ageRanges).map(([l,v])=>({label:l,value:v,color:'#7030A0'}));

  const mujeres=patients.filter(p=>p.sexo==='M').length;
  const hombres=patients.filter(p=>p.sexo==='H').length;

  const hora = new Date().getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';

  return React.createElement('div',{className:'page'},
    // Welcome banner con figura
    React.createElement('div',{className:'welcome-banner'},

      // Kanjis decorativos
      React.createElement('div',{className:'welcome-kanji'},
        React.createElement('span',null,'健'),
        React.createElement('span',null,'康'),
        React.createElement('span',null,'力')
      ),

      // SVG abuelito con polera MAS AMA
      React.createElement('div',{className:'welcome-figure'},
        React.createElement('svg',{viewBox:'0 0 100 100',xmlns:'http://www.w3.org/2000/svg'},
          // Sombra suave
          React.createElement('ellipse',{cx:50,cy:96,rx:20,ry:4,fill:'rgba(0,0,0,0.2)'}),
          // Piernas
          React.createElement('rect',{x:38,y:72,width:10,height:22,rx:5,fill:'#1A3A5C'}),
          React.createElement('rect',{x:52,y:72,width:10,height:22,rx:5,fill:'#1A3A5C'}),
          // Zapatos
          React.createElement('ellipse',{cx:43,cy:94,rx:7,ry:4,fill:'#111'}),
          React.createElement('ellipse',{cx:57,cy:94,rx:7,ry:4,fill:'#111'}),
          // Cuerpo - polera roja MAS AMA
          React.createElement('rect',{x:34,y:48,width:32,height:28,rx:6,fill:'#C00000'}),
          // Texto MAS AMA en la polera
          React.createElement('text',{x:50,y:59,textAnchor:'middle',fill:'#fff',
            fontSize:5.5,fontWeight:'900',fontFamily:'Arial,sans-serif',letterSpacing:.5},'MAS AMA'),
          React.createElement('text',{x:50,y:67,textAnchor:'middle',fill:'rgba(255,255,255,0.7)',
            fontSize:4,fontFamily:'Arial,sans-serif'},'2026'),
          // Brazos
          React.createElement('rect',{x:20,y:50,width:14,height:8,rx:4,fill:'#C00000',transform:'rotate(20 20 50)'}),
          React.createElement('rect',{x:66,y:50,width:14,height:8,rx:4,fill:'#C00000',transform:'rotate(-20 80 50)'}),
          // Manos
          React.createElement('circle',{cx:19,cy:62,r:5,fill:'#F4C187'}),
          React.createElement('circle',{cx:81,cy:62,r:5,fill:'#F4C187'}),
          // Cuello
          React.createElement('rect',{x:45,y:40,width:10,height:10,rx:3,fill:'#F4C187'}),
          // Cabeza
          React.createElement('circle',{cx:50,cy:32,r:16,fill:'#F4C187'}),
          // Cabello blanco (adulto mayor)
          React.createElement('path',{d:'M34 26 Q50 14 66 26 Q64 18 50 16 Q36 18 34 26Z',fill:'#E8E8E8'}),
          // Ojos expresivos shonen
          React.createElement('ellipse',{cx:44,cy:31,rx:3,ry:3.5,fill:'#1A3A5C'}),
          React.createElement('ellipse',{cx:56,cy:31,rx:3,ry:3.5,fill:'#1A3A5C'}),
          React.createElement('circle',{cx:45,cy:30,r:1,fill:'#fff'}),
          React.createElement('circle',{cx:57,cy:30,r:1,fill:'#fff'}),
          // Brillo en ojos
          React.createElement('circle',{cx:46,cy:29,r:.8,fill:'#fff',opacity:.8}),
          React.createElement('circle',{cx:58,cy:29,r:.8,fill:'#fff',opacity:.8}),
          // Sonrisa
          React.createElement('path',{d:'M44 37 Q50 42 56 37',stroke:'#1A3A5C',strokeWidth:1.5,fill:'none',strokeLinecap:'round'}),
          // Rubor en mejillas
          React.createElement('ellipse',{cx:40,cy:35,rx:4,ry:2.5,fill:'#FFB3B3',opacity:.5}),
          React.createElement('ellipse',{cx:60,cy:35,rx:4,ry:2.5,fill:'#FFB3B3',opacity:.5}),
          // Bastón
          React.createElement('line',{x1:81,y1:62,x2:88,y2:94,stroke:'#8B6914',strokeWidth:3,strokeLinecap:'round'}),
          React.createElement('ellipse',{cx:88,cy:94,rx:4,ry:2,fill:'#8B6914'}),
          // Líneas de energía shonen (velocidad)
          React.createElement('line',{x1:2,y1:40,x2:18,y2:40,stroke:'#FFD700',strokeWidth:1.5,opacity:.6,strokeLinecap:'round'}),
          React.createElement('line',{x1:2,y1:50,x2:15,y2:50,stroke:'#C00000',strokeWidth:1,opacity:.5,strokeLinecap:'round'}),
          React.createElement('line',{x1:2,y1:60,x2:18,y2:60,stroke:'#FFD700',strokeWidth:1.5,opacity:.4,strokeLinecap:'round'})
        )
      ),

      React.createElement('h2',null,`${saludo}, Daniel 👋`),
      React.createElement('p',null,`${total} pacientes · ${new Date().toLocaleDateString('es-CL',{weekday:'long',day:'numeric',month:'long'})}`),

      // Barra de energía animada
      React.createElement('div',{className:'energy-bar'})
    ),

    // Sync indicator
    React.createElement(SyncIndicator,{
      status:syncStatus, lastSync, onSync:()=>doSync(false),
      hasUrl:!!DB.get('scriptUrl','')
    }),

    // KPIs
    React.createElement('div',{className:'kpi-grid'},
      React.createElement('div',{className:'kpi-card info'},
        React.createElement('div',{className:'kpi-val'},total),
        React.createElement('div',{className:'kpi-lbl'},'Pacientes')),
      React.createElement('div',{className:'kpi-card danger'},
        React.createElement('div',{className:'kpi-val'},vencidos+prontos),
        React.createElement('div',{className:'kpi-lbl'},'Alertas EMPAM')),
      React.createElement('div',{className:'kpi-card danger'},
        React.createElement('div',{className:'kpi-val'},bajo),
        React.createElement('div',{className:'kpi-lbl'},'Bajo Mín.')),
      React.createElement('div',{className:`kpi-card ${nuevos>0?'ok':'info'}`},
        React.createElement('div',{className:'kpi-val'},nuevos),
        React.createElement('div',{className:'kpi-lbl'},'Nuevos'))
    ),

    // Acceso rápido
    React.createElement('div',{className:'card'},
      React.createElement('div',{className:'card-title'},'⚡ Acceso rápido'),
      React.createElement('div',{className:'btn-row',style:{marginBottom:8}},
        React.createElement('button',{className:'btn btn-primary',onClick:()=>onNav('lista')},'📋 Pasar Lista'),
        React.createElement('button',{className:'btn btn-red',onClick:()=>onNav('alertas')},`🚨 Alertas (${vencidos+prontos})`)
      ),
      React.createElement('div',{className:'btn-row'},

        React.createElement('button',{className:'btn btn-ghost',onClick:()=>onNav('exportar')},'📤 Exportar Excel')
      ),
      React.createElement('div',{className:'btn-row'},
        React.createElement('button',{className:'btn btn-ghost',onClick:()=>onNav('rem')},'📊 Generar REM'),
        React.createElement('button',{className:'btn btn-ghost',onClick:()=>onNav('agenda')},'📅 Ver Agenda')
      )
    ),

    // Hoy
    hoyReg>0&&React.createElement('div',{className:'card'},
      React.createElement('div',{className:'card-title'},'✅ Actividad de hoy'),
      React.createElement('div',{style:{fontSize:18,fontWeight:800,color:'#375623'}},
        `${hoyReg} asistencias marcadas`)),

    // EMPAM donut + stats
    React.createElement('div',{className:'card'},
      React.createElement('div',{className:'card-title'},'⚠️ Estado EMPAM'),
      React.createElement('div',{style:{display:'flex',gap:16,alignItems:'center'}},
        React.createElement(DonutChart,{slices:empamSlices,size:110}),
        React.createElement('div',{style:{flex:1}},
          [['🔴 Vencido',vencidos,'#C00000'],['🟡 Vence Pronto',prontos,'#ED7D31'],
           ['🟢 Vigente',vigente,'#375623'],['⏳ Pendiente',pendiente,'#888']]
            .map(([l,v,c])=>React.createElement('div',{key:l,style:{
              display:'flex',justifyContent:'space-between',padding:'3px 0',
              borderBottom:'1px solid #f0f0f0',fontSize:13
            }},
              React.createElement('span',{style:{color:c,fontWeight:600}},l),
              React.createElement('span',{style:{fontWeight:800}},v)
            ))
        )
      )
    ),

    // Sexo
    React.createElement('div',{className:'card'},
      React.createElement('div',{className:'card-title'},'👥 Distribución por Sexo'),
      React.createElement('div',{style:{display:'flex',gap:12}},
        React.createElement('div',{style:{flex:1,background:'#EDE0F7',borderRadius:10,padding:'12px',textAlign:'center'}},
          React.createElement('div',{style:{fontSize:28,fontWeight:900,color:'#7030A0'}},mujeres),
          React.createElement('div',{style:{fontSize:12,color:'#7030A0',fontWeight:700}},'♀ Mujeres'),
          React.createElement('div',{style:{fontSize:12,color:'#999'}},`${total?Math.round(mujeres/total*100):0}%`)
        ),
        React.createElement('div',{style:{flex:1,background:'#DDEEFF',borderRadius:10,padding:'12px',textAlign:'center'}},
          React.createElement('div',{style:{fontSize:28,fontWeight:900,color:'#2E75B6'}},hombres),
          React.createElement('div',{style:{fontSize:12,color:'#2E75B6',fontWeight:700}},'♂ Hombres'),
          React.createElement('div',{style:{fontSize:12,color:'#999'}},`${total?Math.round(hombres/total*100):0}%`)
        )
      )
    ),

    // Talleres bar chart
    React.createElement('div',{className:'card'},
      React.createElement('div',{className:'card-title'},'🏃 Pacientes por Taller'),
      React.createElement(BarChart,{data:tallerBarData,horizontal:true}),
      React.createElement('div',{style:{fontSize:11,color:'#999',marginTop:4}},
        '🔵 Azul = OK  ·  🔴 Rojo = más del 50% bajo el mínimo')
    ),

    // Edad bar chart
    React.createElement('div',{className:'card'},
      React.createElement('div',{className:'card-title'},'🎂 Distribución por Edad'),
      React.createElement(BarChart,{data:ageBarData,height:90,color:'#7030A0'})
    )
  );
}




// ─────────────────────────────────────────────────────────────────────
// VIEW: PASAR LISTA
// ─────────────────────────────────────────────────────────────────────
function ViewLista({patients,attendanceLog,setAttendanceLog,toast,sessionNotes,setSessionNotes}){
  const [step,setStep]=useState('taller');
  const [selTaller,setTaller]=useState('');
  const [selFecha,setFecha]=useState(todayISO());
  const [search,setSearch]=useState('');
  const [notePatient,setNotePatient]=useState(null);
  const [noteText,setNoteText]=useState('');
  const [colaCitacion,setCola]=useState([]);
  const [showCola,setShowCola]=useState(false);
  const [colaIdx,setColaIdx]=useState(0);

  const tallerPacs=useMemo(()=>
    patients.filter(p=>p.taller===selTaller&&
      (!search||p.nombre.toLowerCase().includes(search.toLowerCase())||p.rut.includes(search))),
    [patients,selTaller,search]);

  function attKey(rut){ return `${selFecha}||${selTaller}||${rut}`; }
  function noteKey(rut){ return `nota||${selFecha}||${selTaller}||${rut}`; }
  function getAtt(rut){ return attendanceLog[attKey(rut)]||null; }
  function getNote(rut){ return (sessionNotes||{})[noteKey(rut)]||''; }

  function setAtt(rut,val){
    const k=attKey(rut); const next={...attendanceLog};
    if(next[k]===val) delete next[k]; else next[k]=val;
    setAttendanceLog(next); DB.set('attendanceLog',next);
  }
  function marcarTodos(val){
    const next={...attendanceLog};
    tallerPacs.forEach(p=>{ next[attKey(p.rut||p.id)]=val; });
    setAttendanceLog(next); DB.set('attendanceLog',next);
    toast(val==='P'?'✅ Todos marcados Presente':'❌ Todos marcados Ausente');
  }
  function saveNote(){
    const k=noteKey(notePatient.rut||notePatient.id);
    const next={...(sessionNotes||{}),[k]:noteText};
    setSessionNotes(next); DB.set('sessionNotes',next);
    setNotePatient(null); setNoteText('');
    toast('📝 Nota guardada');
  }

  const present=tallerPacs.filter(p=>getAtt(p.rut||p.id)==='P').length;
  const absent =tallerPacs.filter(p=>getAtt(p.rut||p.id)==='A').length;
  const sin    =tallerPacs.length-present-absent;
  const conNota=tallerPacs.filter(p=>getNote(p.rut||p.id)).length;

  if(step==='taller') return React.createElement('div',{className:'page'},
    React.createElement('div',{className:'card'},
      React.createElement('div',{className:'card-title'},'Selecciona el Taller'),
      React.createElement('div',{className:'taller-grid'},
        TALLERES.map(t=>React.createElement('div',{
          key:t,className:`taller-btn ${selTaller===t?'selected':''}`,
          onClick:()=>{ setTaller(t); setStep('fecha'); }},t))
      )
    )
  );

  if(step==='fecha') return React.createElement('div',{className:'page'},
    React.createElement('div',{className:'card'},
      React.createElement('div',{className:'card-title'},'Fecha de la Sesión'),
      React.createElement(Field,{label:'Fecha'},
        React.createElement('input',{type:'date',value:selFecha,onChange:e=>setFecha(e.target.value)})),
      React.createElement('div',{className:'btn-row'},
        React.createElement('button',{className:'btn btn-ghost',onClick:()=>setStep('taller')},'← Volver'),
        React.createElement('button',{className:'btn btn-primary',onClick:()=>setStep('lista'),disabled:!selFecha},'Ver lista')
      )
    )
  );

  return React.createElement('div',{className:'page'},
    // Header
    React.createElement('div',{className:'card',style:{marginBottom:10}},
      React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}},
        React.createElement('div',null,
          React.createElement('div',{style:{fontWeight:800,fontSize:15}},selTaller),
          React.createElement('div',{style:{fontSize:12,color:'#777'}},selFecha)),
        React.createElement('div',{style:{fontWeight:700,fontSize:14,textAlign:'right'}},
          React.createElement('span',{style:{color:'#375623'}},`✅${present} `),
          React.createElement('span',{style:{color:'#C00000'}},`❌${absent} `),
          React.createElement('span',{style:{color:'#aaa'}},`○${sin}`)
        )
      ),
      conNota>0&&React.createElement('div',{style:{fontSize:12,color:'#7030A0',fontWeight:600}},
        `📝 ${conNota} nota${conNota>1?'s':''} de sesión`)
    ),
    // Actions
    React.createElement('div',{className:'btn-row',style:{marginBottom:6}},
      React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>setStep('taller')},'← Taller'),
      React.createElement('button',{className:'btn btn-green btn-sm',onClick:()=>marcarTodos('P')},'✅ Todos Pres.'),
      React.createElement('button',{className:'btn btn-red btn-sm',onClick:()=>marcarTodos('A')},'❌ Todos Aus.')
    ),
    // Cola citación helper
    React.createElement('div',{style:{
      display:'flex',alignItems:'center',gap:8,marginBottom:10,
      padding:'8px 12px',background:'#EBF4FF',borderRadius:10,fontSize:12,
    }},
      React.createElement('span',{style:{color:'#1A3A5C',fontWeight:700}},'🏥 Cola Citación:'),
      React.createElement('span',{style:{color:'#555'}},
        colaCitacion.length > 0
          ? `${colaCitacion.length} paciente(s) seleccionado(s)`
          : 'Marca ☑ para agregar a la cola'),
      colaCitacion.length > 0 && React.createElement('button',{
        onClick:()=>setCola([]),
        style:{marginLeft:'auto',background:'none',border:'none',
               color:'#C00000',fontSize:11,cursor:'pointer',fontWeight:700}
      },'✕ Limpiar')
    ),
    // Search
    React.createElement('div',{className:'search-wrap'},
      React.createElement('span',{className:'search-icon'},'🔍'),
      React.createElement('input',{type:'text',placeholder:'Buscar...',value:search,onChange:e=>setSearch(e.target.value)})
    ),
    // List
    tallerPacs.length===0
      ?React.createElement('div',{className:'empty-state'},
          React.createElement('div',{className:'emoji'},'👥'),
          React.createElement('p',null,'Sin pacientes para este taller'))
      :tallerPacs.map(p=>{
        const key=p.rut||p.id; const att=getAtt(key); const nota=getNote(key);
        return React.createElement('div',{key:p.id,className:'att-row',style:{flexWrap:'wrap',gap:6}},
          React.createElement(Avatar,{sexo:p.sexo,nombre:p.nombre}),
          React.createElement('div',{style:{flex:1,minWidth:0}},
            React.createElement('div',{className:'att-name'},p.nombre),
            React.createElement('div',{style:{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap',marginTop:2}},
              p.edad&&React.createElement('span',{style:{fontSize:11,color:'#888'}},p.edad+' años'),
              React.createElement(EmpamChip,{estado:p.empamEstado}),
              p.empamFecha&&(p.empamEstado?.includes('VENCIDO')||p.empamEstado?.includes('PRONTO'))&&
                React.createElement('span',{style:{fontSize:11,color:'#C00000',fontWeight:700}},
                  p.empamDias!=null?(p.empamDias<0?`Vencido hace ${Math.abs(p.empamDias)}d`:`Vence en ${p.empamDias}d`):'')
            ),
            nota&&React.createElement('div',{style:{fontSize:11,color:'#7030A0',marginTop:2}},`📝 ${nota.slice(0,40)}${nota.length>40?'...':''}`)
          ),
          React.createElement('div',{style:{display:'flex',alignItems:'center',gap:4,flexWrap:'wrap',justifyContent:'flex-end'}},
            // Checkbox cola citación
            React.createElement('div',{
              onClick:e=>{
                e.stopPropagation();
                setCola(prev=>prev.includes(p.id)
                  ? prev.filter(x=>x!==p.id)
                  : [...prev, p.id]);
              },
              style:{
                width:24,height:24,borderRadius:6,border:'2px solid',
                borderColor:colaCitacion.includes(p.id)?'#1A3A5C':'#ccc',
                background:colaCitacion.includes(p.id)?'#1A3A5C':'#fff',
                display:'flex',alignItems:'center',justifyContent:'center',
                cursor:'pointer',flexShrink:0,fontSize:14,color:'#fff',fontWeight:800,
              }
            }, colaCitacion.includes(p.id)?'✓':''),
            // Botón nota
            React.createElement('button',{
              onClick:()=>{ setNotePatient(p); setNoteText(getNote(key)); },
              style:{background:'none',border:'none',fontSize:18,cursor:'pointer',
                     color:nota?'#7030A0':'#ccc',padding:'4px'}
            },'📝'),
            // WhatsApp EMPAM inline (solo si urgente y tiene teléfono)
            (p.empamEstado?.includes('VENCIDO')||p.empamEstado?.includes('PRONTO'))&&p.fono&&
              React.createElement('a',{
                href:`https://wa.me/56${p.fono.replace(/\D/g,'')}?text=${buildWspMsg(p,p.empamEstado?.includes('VENCIDO')?'VENCIDO':'PRONTO')}`,
                target:'_blank', rel:'noopener noreferrer',
                onClick:e=>e.stopPropagation(),
                style:{
                  background:'#25D366',color:'#fff',borderRadius:8,
                  padding:'6px 10px',fontSize:11,fontWeight:700,
                  textDecoration:'none',whiteSpace:'nowrap'
                }
              },'💬'),
            // Botón copiar RUT + abrir Rayen
            React.createElement('button',{
              onClick:e=>{
                e.stopPropagation();
                const rut = p.rut;
                const btn = e.currentTarget;
                // Copiar RUT
                navigator.clipboard.writeText(rut).catch(()=>{
                  const el=document.createElement('textarea');
                  el.value=rut; document.body.appendChild(el);
                  el.select(); document.execCommand('copy');
                  document.body.removeChild(el);
                });
                // Feedback
                btn.textContent='✅ Copiado';
                btn.style.background='#375623';
                setTimeout(()=>{ btn.textContent='🏥 Citar'; btn.style.background='#1A3A5C'; },1500);
                // Abrir Rayen
                window.open('https://administrativo.rayenaps.cl/#/mantenedor-citas','_blank');
              },
              style:{background:'#1A3A5C',color:'#fff',border:'none',borderRadius:8,
                     padding:'6px 10px',fontSize:11,fontWeight:700,cursor:'pointer',
                     whiteSpace:'nowrap'}
            },'🏥 Citar'),
            // Toggle asistencia
            React.createElement('div',{className:'att-toggle'},
              React.createElement('button',{className:`att-btn ${att==='P'?'p-on':'p-off'}`,onClick:()=>setAtt(key,'P')},att==='P'?'✅':'P'),
              React.createElement('button',{className:`att-btn ${att==='A'?'a-on':'a-off'}`,onClick:()=>setAtt(key,'A')},att==='A'?'❌':'A')
            )
          )
        );
      }),
    // ── Resumen EMPAM de la sesión ─────────────────────────────────
    (() => {
      const presentes = tallerPacs.filter(p => getAtt(p.rut||p.id)==='P');
      const empamUrg  = presentes.filter(p =>
        (p.empamEstado?.includes('VENCIDO')||p.empamEstado?.includes('PRONTO')) && p.fono);
      if (empamUrg.length === 0) return null;
      return React.createElement('div',{style:{
        marginTop:10, background:'linear-gradient(90deg,#128C7E11,#25D36622)',
        border:'1.5px solid #25D366', borderRadius:12, padding:'10px 14px',
        display:'flex', justifyContent:'space-between', alignItems:'center'
      }},
        React.createElement('div',null,
          React.createElement('div',{style:{fontWeight:800,fontSize:13,color:'#128C7E'}},
            `⚠️ ${empamUrg.length} presente${empamUrg.length>1?'s':''} con EMPAM urgente`),
          React.createElement('div',{style:{fontSize:11,color:'#555'}},
            'Con teléfono registrado')
        ),
        React.createElement('button',{
          onClick:()=>{
            empamUrg.forEach((p,i) => {
              setTimeout(()=>{
                window.open(`https://wa.me/56${p.fono.replace(/\D/g,'')}?text=${buildWspMsg(p,p.empamEstado?.includes('VENCIDO')?'VENCIDO':'PRONTO')}`, '_blank');
              }, i*600);
            });
          },
          style:{
            background:'#25D366',color:'#fff',border:'none',borderRadius:10,
            padding:'8px 14px',fontSize:13,fontWeight:800,cursor:'pointer',whiteSpace:'nowrap'
          }
        },'💬 WS todos')
      );
    })(),
    // Save + Cola de citación
    React.createElement('div',{style:{marginTop:10,display:'flex',flexDirection:'column',gap:8}},
      React.createElement('button',{className:'btn btn-green',
        onClick:()=>toast(`💾 Lista guardada — ${present} presentes, ${absent} ausentes`)},
        '💾 Confirmar Lista'),
      colaCitacion.length > 0 && React.createElement('button',{
        className:'btn btn-primary',
        onClick:()=>setShowCola(true),
        style:{background:'#1A3A5C'}
      },`🏥 Iniciar Cola de Citación (${colaCitacion.length} pacientes)`)
    ),

    // ── MODAL: COLA DE CITACIÓN ──────────────────────────────────────
    showCola && (() => {
      const colaIds = colaCitacion;
      const pacientesCola = tallerPacs.filter(p => colaIds.includes(p.id));
      const actual = pacientesCola[colaIdx];
      if (!actual) return React.createElement('div',{className:'overlay',
        onClick:()=>{ setShowCola(false); setColaIdx(0); }
      },
        React.createElement('div',{className:'sheet'},
          React.createElement('div',{className:'sheet-handle'}),
          React.createElement('div',{style:{textAlign:'center',padding:24}},
            React.createElement('div',{style:{fontSize:48,marginBottom:12}},'🎉'),
            React.createElement('div',{style:{fontWeight:900,fontSize:20,marginBottom:8}},'¡Cola completada!'),
            React.createElement('div',{style:{fontSize:14,color:'#777',marginBottom:20}},
              `Citaste a ${colaIds.length} paciente(s)`),
            React.createElement('button',{className:'btn btn-primary',
              onClick:()=>{ setShowCola(false); setColaIdx(0); setCola([]); }
            },'✅ Terminar')
          )
        )
      );

      // Auto-copiar RUT del paciente actual
      if (actual?.rut) {
        navigator.clipboard.writeText(actual.rut).catch(()=>{
          const el=document.createElement('textarea');
          el.value=actual.rut; document.body.appendChild(el);
          el.select(); document.execCommand('copy');
          document.body.removeChild(el);
        });
      }

      return React.createElement('div',{className:'overlay',
        onClick:e=>{ if(e.target===e.currentTarget) setShowCola(false); }
      },
        React.createElement('div',{className:'sheet'},
          React.createElement('div',{className:'sheet-handle'}),

          // Progreso
          React.createElement('div',{style:{
            background:'#1A3A5C',borderRadius:12,padding:'12px 16px',marginBottom:14
          }},
            React.createElement('div',{style:{
              display:'flex',justifyContent:'space-between',
              color:'rgba(255,255,255,.7)',fontSize:12,marginBottom:6
            }},
              React.createElement('span',null,'COLA DE CITACIÓN'),
              React.createElement('span',null,`${colaIdx+1} de ${pacientesCola.length}`)
            ),
            React.createElement('div',{style:{
              background:'rgba(255,255,255,.2)',borderRadius:20,height:6,overflow:'hidden'
            }},
              React.createElement('div',{style:{
                background:'#58D68D',height:'100%',borderRadius:20,
                width:`${((colaIdx+1)/pacientesCola.length)*100}%`,
                transition:'width .3s'
              }})
            )
          ),

          // Paciente actual
          React.createElement('div',{style:{textAlign:'center',marginBottom:20}},
            React.createElement(Avatar,{sexo:actual.sexo,nombre:actual.nombre}),
            React.createElement('div',{style:{fontWeight:900,fontSize:18,marginTop:8}},actual.nombre),
            React.createElement('div',{style:{
              fontSize:24,fontWeight:900,color:'#1A3A5C',
              letterSpacing:2,marginTop:4,background:'#EBF4FF',
              borderRadius:10,padding:'8px 20px',display:'inline-block'
            }},actual.rut),
            React.createElement('div',{style:{fontSize:12,color:'#58D68D',fontWeight:700,marginTop:4}},
              '✅ RUT copiado automáticamente')
          ),

          // Instrucción
          React.createElement('div',{style:{
            background:'#FFF9E6',borderRadius:10,padding:'10px 14px',
            fontSize:13,color:'#7A5C00',marginBottom:16,lineHeight:1.5
          }},
            '1. Pega el RUT en Rayen → 2. Cita al paciente → 3. Vuelve aquí → 4. Presiona "Siguiente"'
          ),

          // Botones
          React.createElement('div',{style:{display:'flex',flexDirection:'column',gap:8}},
            React.createElement('button',{
              onClick:()=>{
                window.open('https://administrativo.rayenaps.cl/#/mantenedor-citas','_blank');
              },
              style:{
                background:'#2471A3',color:'#fff',border:'none',borderRadius:12,
                padding:'14px',fontSize:15,fontWeight:800,cursor:'pointer'
              }
            },'🏥 Abrir Rayen'),
            React.createElement('div',{className:'btn-row'},
              React.createElement('button',{
                className:'btn btn-ghost',style:{flex:1},
                onClick:()=>setShowCola(false)
              },'⏸ Pausar'),
              React.createElement('button',{
                className:'btn btn-green',style:{flex:2},
                onClick:()=>{
                  const next = colaIdx + 1;
                  setColaIdx(next);
                  // Pre-copiar RUT del siguiente
                  const siguiente = pacientesCola[next];
                  if (siguiente?.rut) {
                    setTimeout(()=>{
                      navigator.clipboard.writeText(siguiente.rut).catch(()=>{});
                    }, 500);
                  }
                }
              }, colaIdx < pacientesCola.length - 1
                ? `Siguiente → (${pacientesCola.length - colaIdx - 1} restantes)`
                : '✅ Finalizar Cola'
              )
            )
          )
        )
      );
    })(),

    // Note modal
    notePatient&&React.createElement('div',{className:'overlay',onClick:e=>{ if(e.target===e.currentTarget) setNotePatient(null); }},
      React.createElement('div',{className:'sheet'},
        React.createElement('div',{className:'sheet-handle'}),
        React.createElement('div',{style:{fontWeight:800,fontSize:16,marginBottom:4}},`📝 Nota — ${notePatient.nombre.split(' ').slice(0,2).join(' ')}`),
        React.createElement('div',{style:{fontSize:12,color:'#777',marginBottom:12}},`Sesión: ${selFecha}`),
        React.createElement('textarea',{
          value:noteText, onChange:e=>setNoteText(e.target.value),
          placeholder:'Observaciones de la sesión, comportamiento, dolor, limitaciones...',
          style:{width:'100%',minHeight:120,padding:12,border:'1.5px solid #E0E0E0',
                 borderRadius:12,fontSize:14,resize:'none',outline:'none'}
        }),
        React.createElement('div',{className:'btn-row',style:{marginTop:12}},
          React.createElement('button',{className:'btn btn-ghost',style:{flex:1},onClick:()=>setNotePatient(null)},'Cancelar'),
          React.createElement('button',{className:'btn btn-purple',style:{flex:2},onClick:saveNote},'💾 Guardar Nota')
        )
      )
    )
  );
}




// ─────────────────────────────────────────────────────────────────────
// VIEW: NUEVO PACIENTE (wizard 4 pasos)
// ─────────────────────────────────────────────────────────────────────
const EMPTY_P={
  nombre:'',rut:'',fono:'',sexo:'M',edad:'',pais:'Chile',prevision:'FONASA',
  taller:'',ciclo:'C1',estado:'TALLER',detalle:'',
  hta:'',ecv:'',dm:'',dmir:'',resp:'',caid:'',
  empamPre:'',empamFecha:'',
  tugPre:'',eupDerPre:'',eupIzqPre:'',velDerPre:'N',velIzqPre:'N',
  haqPre:'',dolorDPre:'',dolorIPre:'',catInt:'N',catExt:'P',observaciones:'',
};

function ViewNuevo({patients,setPatients,toast,onBack,doSync,autoSync}){
  const [step,setStep]=useState(0);
  const [form,setForm]=useState({...EMPTY_P});
  const [errors,setErrors]=useState({});
  const [saving,setSaving]=useState(false);
  const steps=['👤 Datos','🏃 Taller','🏥 Diagnóst.','📏 Evaluación'];

  function upd(k,v){ setForm(f=>({...f,[k]:v})); setErrors(e=>({...e,[k]:''})); }

  function inp(k,type='text',placeholder=''){
    return React.createElement('input',{type,placeholder,
      value:form[k]||'',onChange:e=>upd(k,e.target.value),
      style:{borderColor:errors[k]?'#C00000':''}});
  }

  function nextStep(){
    if(step===0){
      const e={};
      if(!form.nombre.trim()) e.nombre='Requerido';
      if(!form.rut.trim())    e.rut='Requerido';
      if(Object.keys(e).length){ setErrors(e); toast('❌ Nombre y RUT son obligatorios'); return; }
    }
    if(step===1&&!form.taller){ setErrors({taller:'Requerido'}); toast('❌ Selecciona un taller'); return; }
    setStep(s=>s+1);
  }

  async function guardar(){
    setSaving(true);
    const vencFecha=form.empamFecha
      ?new Date(new Date(form.empamFecha).setFullYear(new Date(form.empamFecha).getFullYear()+1))
          .toISOString().split('T')[0]:'';
    const newP={
      ...form, id:genId(form.nombre,form.rut),
      nombre:form.nombre.trim().toUpperCase(), rut:form.rut.trim(),
      empamEstado:calcEmpamEstado(vencFecha), empamFecha:vencFecha,
      empamDias:calcDias(vencFecha),
      alertaAsist:'OK', totalPresencias:0, totalSesiones:0, pctAsistencia:0,
      isNew:true, createdAt:new Date().toISOString(),
    };
    const existing=patients.find(p=>p.rut===newP.rut&&newP.rut!=='');
    const updated=existing
      ?patients.map(p=>p.rut===newP.rut?{...p,...newP,isNew:p.isNew}:p)
      :[...patients,newP];
    // Marcar como dirty para sync inteligente
    const updatedDirty = updated.map(p =>
      p.rut === newP.rut ? SYNC2.markDirty(p) : p
    );
    setPatients(updatedDirty); DB.set('patients', updatedDirty);
    toast(existing?'✅ Paciente actualizado':'✅ Paciente registrado correctamente');
    if(autoSync?.url) setTimeout(()=>doSync(true), 1500);
    setSaving(false); onBack();
  }

  const stepContent=[
    // Paso 0: Datos
    React.createElement('div',{key:'s0'},
      React.createElement('div',{className:'field-row'},
        React.createElement(Field,{label:'Nombre completo *'},inp('nombre','text','Apellido Apellido Nombre')),
        React.createElement(Field,{label:'RUT *'},inp('rut','text','12345678-9'))
      ),
      React.createElement('div',{className:'field-row'},
        React.createElement(Field,{label:'Teléfono'},inp('fono','tel','+56 9 XXXX XXXX')),
        React.createElement(Field,{label:'Sexo *'},
          React.createElement('select',{value:form.sexo,onChange:e=>upd('sexo',e.target.value)},
            React.createElement('option',{value:'M'},'♀ Mujer'),
            React.createElement('option',{value:'H'},'♂ Hombre')))
      ),
      React.createElement('div',{className:'field-row'},
        React.createElement(Field,{label:'Edad'},inp('edad','number','70')),
        React.createElement(Field,{label:'Previsión'},
          React.createElement('select',{value:form.prevision,onChange:e=>upd('prevision',e.target.value)},
            ['FONASA','ISAPRE','SIN PREVISIÓN'].map(v=>React.createElement('option',{key:v,value:v},v)))
        )
      )
    ),
    // Paso 1: Taller
    React.createElement('div',{key:'s1'},
      React.createElement(SectionHdr,null,'Taller asignado *'),
      errors.taller&&React.createElement('p',{style:{color:'#C00000',fontSize:13,marginBottom:8}},errors.taller),
      React.createElement('div',{className:'taller-grid'},
        TALLERES.map(t=>React.createElement('div',{
          key:t,className:`taller-btn ${form.taller===t?'selected':''}`,onClick:()=>upd('taller',t)},t))
      ),
      React.createElement('div',{className:'field-row'},
        React.createElement(Field,{label:'Ciclo'},
          React.createElement('select',{value:form.ciclo,onChange:e=>upd('ciclo',e.target.value)},
            CICLOS.map(c=>React.createElement('option',{key:c,value:c},c)))),
        React.createElement(Field,{label:'Estado'},
          React.createElement('select',{value:form.estado,onChange:e=>upd('estado',e.target.value)},
            ESTADOS.map(s=>React.createElement('option',{key:s,value:s},s))))
      ),
      React.createElement(Field,{label:'Fecha EMPAM (realización)'},
        React.createElement('input',{type:'date',value:form.empamFecha,onChange:e=>upd('empamFecha',e.target.value)})),
      React.createElement(Field,{label:'Resultado EMPAM'},
        React.createElement('select',{value:form.empamPre,onChange:e=>upd('empamPre',e.target.value)},
          React.createElement('option',{value:''},'— Seleccionar —'),
          Object.entries(EMPAM_CODES).map(([k,v])=>React.createElement('option',{key:k,value:k},`${k} — ${v}`))))
    ),
    // Paso 2: Diagnósticos
    React.createElement('div',{key:'s2'},
      React.createElement(SectionHdr,null,'Comorbilidades (marca las que aplican)'),
      React.createElement('div',{className:'check-grid'},
        [['hta','HTA','Hipertensión Arterial'],['dm','DM','Diabetes Mellitus'],
         ['ecv','ECV','Enf. Cardio-Vascular'],['dmir','DMIR','DM Insulino-Req.'],
         ['resp','RESP','Enf. Respiratoria'],['caid','CAID','Riesgo de Caídas']]
          .map(([k,lbl,desc])=>
            React.createElement('div',{key:k,className:`check-item ${form[k]?'checked':''}`,
              onClick:()=>upd(k,form[k]?'':'SI')},
              React.createElement('span',{style:{fontSize:20}},form[k]?'☑️':'☐'),
              React.createElement('div',null,
                React.createElement('span',null,lbl),
                React.createElement('small',null,desc))))
      )
    ),
    // Paso 3: Evaluación Pre
    React.createElement('div',{key:'s3'},
      React.createElement(SectionHdr,null,'Evaluación Kinesiológica PRE'),
      React.createElement('div',{className:'field-row'},
        React.createElement(Field,{label:'TUG Pre (seg)'},inp('tugPre','number','15')),
        React.createElement(Field,{label:'HAQ Pre (0-3)'},inp('haqPre','number','1.2'))
      ),
      React.createElement('div',{className:'field-row'},
        React.createElement(Field,{label:'EUP Derecho Pre (seg)'},inp('eupDerPre','number','5')),
        React.createElement(Field,{label:'EUP Izquierdo Pre (seg)'},inp('eupIzqPre','number','5'))
      ),
      React.createElement('div',{className:'field-row'},
        React.createElement(Field,{label:'Vel. Derecha'},
          React.createElement('select',{value:form.velDerPre,onChange:e=>upd('velDerPre',e.target.value)},
            [['N','Normal'],['LR','Leve Red.'],['R','Reducida'],['A','Alterada']]
              .map(([v,l])=>React.createElement('option',{key:v,value:v},l)))),
        React.createElement(Field,{label:'Vel. Izquierda'},
          React.createElement('select',{value:form.velIzqPre,onChange:e=>upd('velIzqPre',e.target.value)},
            [['N','Normal'],['LR','Leve Red.'],['R','Reducida'],['A','Alterada']]
              .map(([v,l])=>React.createElement('option',{key:v,value:v},l))))
      ),
      React.createElement('div',{className:'field-row'},
        React.createElement(Field,{label:'CAT Interna'},
          React.createElement('select',{value:form.catInt,onChange:e=>upd('catInt',e.target.value)},
            [['N','Normal'],['LR','Leve Riesgo'],['R','Riesgo'],['A','Alto Riesgo']]
              .map(([v,l])=>React.createElement('option',{key:v,value:v},l)))),
        React.createElement(Field,{label:'CAT Externa'},
          React.createElement('select',{value:form.catExt,onChange:e=>upd('catExt',e.target.value)},
            [['P','Presente'],['A','Ausente']]
              .map(([v,l])=>React.createElement('option',{key:v,value:v},l))))
      ),
      React.createElement(Field,{label:'Observaciones'},
        React.createElement('textarea',{value:form.observaciones||'',
          onChange:e=>upd('observaciones',e.target.value),
          placeholder:'Notas clínicas adicionales...'}))
    )
  ];

  return React.createElement('div',{className:'page'},
    React.createElement('div',{className:'steps'},
      steps.map((s,i)=>React.createElement('div',{key:i,
        className:`step ${i===step?'active':i<step?'done':''}`,
        onClick:()=>{ if(i<step) setStep(i); }},
        `${i<step?'✓ ':''}${s}`))
    ),
    stepContent[step],
    React.createElement('div',{className:'btn-row',style:{marginTop:16}},
      step>0
        ?React.createElement('button',{className:'btn btn-ghost',style:{flex:1},onClick:()=>setStep(s=>s-1)},'← Atrás')
        :React.createElement('button',{className:'btn btn-ghost',style:{flex:1},onClick:onBack},'Cancelar'),
      step<3
        ?React.createElement('button',{className:'btn btn-primary',style:{flex:2},onClick:nextStep},'Siguiente →')
        :React.createElement('button',{className:'btn btn-green',style:{flex:2},onClick:guardar,disabled:saving},
            saving?'Guardando...':'💾 Registrar Paciente')
    )
  );
}

// ─────────────────────────────────────────────────────────────────────
// VIEW: PACIENTES
// ─────────────────────────────────────────────────────────────────────
function ViewPacientes({patients,onPatient,onNuevo}){
  const [search,setSearch]=useState('');
  const [filterTaller,setFT]=useState('');
  const [filterEmpam,setFE]=useState('');
  const [filterSexo,setFS]=useState('');
  const [sortBy,setSort]=useState('nombre');
  const [showFilters,setShowFilters]=useState(false);
  const [tab,setTab]=useState('todos');
  const talleres=[...new Set(patients.map(p=>p.taller).filter(Boolean))].sort();
  const nuevos=patients.filter(p=>p.isNew).length;
  const alertas=patients.filter(p=>p.empamEstado?.includes('VENCIDO')||p.empamEstado?.includes('PRONTO')||p.alertaAsist?.includes('BAJO')).length;

  function matchSearch(p,q){
    if(!q) return true;
    const terms=q.toLowerCase().trim().split(/\s+/);
    const hay=`${p.nombre} ${p.rut} ${p.fono||''}`.toLowerCase();
    return terms.every(t=>hay.includes(t));
  }

  const filtered=useMemo(()=>{
    let list=patients.filter(p=>{
      const ms=matchSearch(p,search);
      const mt=!filterTaller||p.taller===filterTaller;
      const me=!filterEmpam||p.empamEstado?.includes(filterEmpam);
      const msx=!filterSexo||p.sexo===filterSexo;
      if(tab==='alertas') return ms&&(p.empamEstado?.includes('VENCIDO')||p.empamEstado?.includes('PRONTO')||p.alertaAsist?.includes('BAJO'));
      if(tab==='nuevos') return ms&&(p.isNew||p.isNew==='SI');
      return ms&&mt&&me&&msx;
    });
    return [...list].sort((a,b)=>{
      if(sortBy==='nombre') return a.nombre.localeCompare(b.nombre,'es');
      if(sortBy==='edad') return (Number(b.edad)||0)-(Number(a.edad)||0);
      if(sortBy==='empam'){const o={'VENCIDO':0,'VENCE PRONTO':1,'VIGENTE':2,'PENDIENTE':3};return (o[a.empamEstado]??4)-(o[b.empamEstado]??4);}
      if(sortBy==='taller') return (a.taller||'').localeCompare(b.taller||'','es');
      return 0;
    });
  },[patients,search,filterTaller,filterEmpam,filterSexo,sortBy,tab]);

  const activeFilters=[filterTaller,filterEmpam,filterSexo].filter(Boolean).length;
  function clearAll(){ setFT(''); setFE(''); setFS(''); setSearch(''); }

  return React.createElement('div',{className:'page',style:{paddingBottom:90}},
    React.createElement('div',{className:'tabs'},
      [['todos',`Todos (${patients.length})`],['alertas',`Alertas (${alertas})`],['nuevos',`Nuevos (${nuevos})`]]
        .map(([v,l])=>React.createElement('div',{key:v,className:`tab ${tab===v?'active':''}`,onClick:()=>{ setTab(v); clearAll(); }},l))
    ),
    React.createElement('div',{className:'search-wrap',style:{marginBottom:8}},
      React.createElement('span',{className:'search-icon'},'🔍'),
      React.createElement('input',{type:'text',placeholder:'Nombre, RUT o teléfono...',
        value:search,onChange:e=>setSearch(e.target.value),autoComplete:'off',autoCorrect:'off',spellCheck:false}),
      search&&React.createElement('span',{onClick:()=>setSearch(''),
        style:{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',fontSize:18,cursor:'pointer',color:'#aaa'}},'✕')
    ),
    React.createElement('div',{style:{display:'flex',gap:8,marginBottom:8,alignItems:'center'}},
      React.createElement('button',{className:`btn btn-sm ${activeFilters>0?'btn-primary':'btn-ghost'}`,
        style:{flex:'none',width:'auto',padding:'8px 14px'},onClick:()=>setShowFilters(f=>!f)},
        `Filtros${activeFilters>0?` (${activeFilters})`:''}`),
      React.createElement('select',{style:{flex:1,padding:'9px 10px',border:'1.5px solid #E0E0E0',borderRadius:10,fontSize:12,background:'#fff'},
        value:sortBy,onChange:e=>setSort(e.target.value)},
        React.createElement('option',{value:'nombre'},'A→Z'),
        React.createElement('option',{value:'edad'},'Mayor edad'),
        React.createElement('option',{value:'empam'},'EMPAM urgente'),
        React.createElement('option',{value:'taller'},'Por Taller')
      ),
      activeFilters>0&&React.createElement('button',{className:'btn btn-ghost btn-sm',
        style:{flex:'none',width:'auto',padding:'8px 10px',fontSize:12},onClick:clearAll},'✕ Limpiar')
    ),
    showFilters&&React.createElement('div',{className:'card',style:{marginBottom:10,padding:12}},
      React.createElement('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}},
        React.createElement('div',null,
          React.createElement('label',{style:{fontSize:11,fontWeight:700,color:'#777',textTransform:'uppercase',display:'block',marginBottom:4}},'Taller'),
          React.createElement('select',{style:{width:'100%',padding:'9px 8px',border:'1.5px solid #E0E0E0',borderRadius:10,fontSize:12,background:'#fff'},
            value:filterTaller,onChange:e=>setFT(e.target.value)},
            React.createElement('option',{value:''},'Todos'),
            talleres.map(t=>React.createElement('option',{key:t,value:t},t.length>16?t.slice(0,16)+'...':t))
          )
        ),
        React.createElement('div',null,
          React.createElement('label',{style:{fontSize:11,fontWeight:700,color:'#777',textTransform:'uppercase',display:'block',marginBottom:4}},'EMPAM'),
          React.createElement('select',{style:{width:'100%',padding:'9px 8px',border:'1.5px solid #E0E0E0',borderRadius:10,fontSize:12,background:'#fff'},
            value:filterEmpam,onChange:e=>setFE(e.target.value)},
            React.createElement('option',{value:''},'Todos'),
            React.createElement('option',{value:'VENCIDO'},'🔴 Vencido'),
            React.createElement('option',{value:'PRONTO'},'🟡 Vence Pronto'),
            React.createElement('option',{value:'VIGENTE'},'🟢 Vigente'),
            React.createElement('option',{value:'PEND'},'⏳ Pendiente')
          )
        ),
        React.createElement('div',null,
          React.createElement('label',{style:{fontSize:11,fontWeight:700,color:'#777',textTransform:'uppercase',display:'block',marginBottom:4}},'Sexo'),
          React.createElement('select',{style:{width:'100%',padding:'9px 8px',border:'1.5px solid #E0E0E0',borderRadius:10,fontSize:12,background:'#fff'},
            value:filterSexo,onChange:e=>setFS(e.target.value)},
            React.createElement('option',{value:''},'Todos'),
            React.createElement('option',{value:'M'},'♀ Mujer'),
            React.createElement('option',{value:'H'},'♂ Hombre')
          )
        )
      )
    ),
    React.createElement('div',{style:{fontSize:12,color:'#888',marginBottom:8}},`${filtered.length} de ${patients.length} pacientes`),
    filtered.length===0
      ?React.createElement('div',{className:'empty-state'},
          React.createElement('div',{className:'emoji'},'🔍'),
          React.createElement('p',{style:{marginBottom:12}},search?`Sin resultados para "${search}"`:'Sin pacientes aquí'),
          (search||activeFilters>0)&&React.createElement('button',{className:'btn btn-ghost btn-sm',
            style:{width:'auto',margin:'0 auto'},onClick:clearAll},'Limpiar filtros'))
      :React.createElement('div',{className:'patient-list'},
          filtered.map(p=>React.createElement(PatientRow,{key:p.id,patient:p,onClick:()=>onPatient(p)}))),

  );
}


// ─────────────────────────────────────────────────────────────────────
// VIEW: FICHA PACIENTE
// ─────────────────────────────────────────────────────────────────────
function ViewFicha({patient,patients,setPatients,toast}){
  const [tab,setTab]=useState('general');
  const [form,setForm]=useState({...patient});
  const [saving,setSaving]=useState(false);

  function upd(k,v){ setForm(f=>({...f,[k]:v})); }
  async function save(){
    setSaving(true);
    const updated=patients.map(p=>p.id===form.id?{...form}:p);
    setPatients(updated); DB.set('patients',updated);
    toast('✅ Ficha actualizada'); setSaving(false);
  }

  const ec=empamColor(patient.empamEstado||'');
  const ecColors={vencido:'#C00000',pronto:'#7A5C00',vigente:'#375623',pendiente:'#555'};

  return React.createElement('div',{className:'page'},
    React.createElement('div',{className:'card',style:{textAlign:'center',paddingTop:22}},
      React.createElement(Avatar,{sexo:patient.sexo,nombre:patient.nombre,isNew:patient.isNew}),
      React.createElement('h2',{style:{fontWeight:900,fontSize:18,margin:'10px 0 4px'}},patient.nombre),
      React.createElement('div',{style:{fontSize:13,color:'#777',marginBottom:10}},
        `RUT: ${patient.rut} · ${patient.edad||'—'} años`),
      React.createElement('div',{style:{display:'flex',gap:6,justifyContent:'center',flexWrap:'wrap'}},
        React.createElement(EmpamChip,{estado:patient.empamEstado}),
        React.createElement(AsistChip,{alerta:patient.alertaAsist,
          presencias:patient.totalPresencias,total:patient.totalSesiones}),
        React.createElement('button',{
          onClick:e=>{
            e.stopPropagation();
            const rut=patient.rut;
            navigator.clipboard.writeText(rut).catch(()=>{
              const el=document.createElement('textarea');
              el.value=rut; document.body.appendChild(el);
              el.select(); document.execCommand('copy');
              document.body.removeChild(el);
            });
            // Feedback visual en el botón
            e.target.textContent='✅ Copiado';
            setTimeout(()=>{ e.target.textContent='📋 RUT'; },1500);
          },
          style:{background:'#1A3A5C',color:'#fff',border:'none',borderRadius:8,
                 padding:'4px 10px',fontSize:11,fontWeight:700,cursor:'pointer',
                 marginTop:4,alignSelf:'flex-start'}
        },'📋 RUT'),
        patient.isNew&&React.createElement(Chip,{color:'green'},'✨ Nuevo')
      ),
      // Botones de acción rápida
      React.createElement('div',{style:{display:'flex',gap:8,justifyContent:'center',flexWrap:'wrap',marginTop:12}},

        // Copiar RUT
        React.createElement('button',{
          onClick:()=>{
            navigator.clipboard.writeText(patient.rut).then(()=>{
              toast('✅ RUT copiado — pégalo en Rayen');
            }).catch(()=>{
              // Fallback para móvil
              const el = document.createElement('textarea');
              el.value = patient.rut;
              document.body.appendChild(el);
              el.select();
              document.execCommand('copy');
              document.body.removeChild(el);
              toast('✅ RUT copiado — pégalo en Rayen');
            });
          },
          style:{background:'#1A3A5C',color:'#fff',border:'none',borderRadius:10,
                 padding:'10px 16px',fontSize:13,fontWeight:700,cursor:'pointer'}
        },'📋 Copiar RUT'),

        // Abrir Rayen
        React.createElement('button',{
          onClick:()=>{
            window.open('https://administrativo.rayenaps.cl/#/mantenedor-citas','_blank');
          },
          style:{background:'#2471A3',color:'#fff',border:'none',borderRadius:10,
                 padding:'10px 16px',fontSize:13,fontWeight:700,cursor:'pointer'}
        },'🏥 Abrir Rayen'),

        // WhatsApp
        React.createElement('button',{
          onClick:()=>{
            const txt=`*MAS AMA — Resumen Paciente*%0A` +
              `Nombre: ${patient.nombre}%0A` +
              `RUT: ${patient.rut}%0A` +
              `Taller: ${patient.taller}%0A` +
              `EMPAM: ${patient.empamEstado||'—'}%0A` +
              `Asistencia: ${patient.totalPresencias||0} sesiones`;
            window.open(`https://wa.me/?text=${txt}`,'_blank');
          },
          style:{background:'#25D366',color:'#fff',border:'none',borderRadius:10,
                 padding:'10px 16px',fontSize:13,fontWeight:700,cursor:'pointer'}
        },'📲 WhatsApp')
      )
    ),
    React.createElement('div',{className:'card',style:{
      background:'#EBF5FB',border:'1px solid #AED6F1',
      padding:'8px 14px',fontSize:12,color:'#2471A3',marginBottom:4
    }},
      '📖 Datos en solo lectura — se actualizan automáticamente desde Drive'
    ),
    React.createElement('div',{className:'tabs'},
      [['general','General'],['clinico','Clínico'],['asistencia','Asistencia']]
        .map(([v,l])=>React.createElement('div',{key:v,className:`tab ${tab===v?'active':''}`,onClick:()=>setTab(v)},l))
    ),

    // GENERAL
    tab==='general'&&React.createElement('div',null,
      React.createElement(SectionHdr,null,'Datos del Programa'),
      React.createElement('div',{className:'detail-grid'},
        React.createElement(DetailItem,{label:'Taller',value:patient.taller}),
        React.createElement(DetailItem,{label:'Ciclo',value:patient.ciclo}),
        React.createElement(DetailItem,{label:'Estado',value:patient.estado}),
        React.createElement(DetailItem,{label:'Fono',value:patient.fono}),
        React.createElement(DetailItem,{label:'Previsión',value:patient.prevision})
      ),
      React.createElement(SectionHdr,null,'Comorbilidades'),
      React.createElement('div',{className:'detail-grid'},
        [['HTA',patient.hta],['DM',patient.dm],['ECV',patient.ecv],
         ['DMIR',patient.dmir],['RESP',patient.resp],['CAID',patient.caid]]
          .map(([l,v])=>React.createElement(DetailItem,{key:l,label:l,
            value:v||'—',color:v==='SI'?'#C00000':undefined}))
      ),
      React.createElement(SectionHdr,null,'EMPAM'),
      React.createElement('div',{className:`empam-card ${ec}`},
        React.createElement('div',{style:{fontWeight:800,fontSize:16,color:ecColors[ec]||'#555',marginBottom:4}},
          patient.empamEstado||'Sin datos'),
        React.createElement('div',{style:{fontSize:13,color:'#555'}},
          `Resultado: ${patient.empamPre||'—'} → ${patient.empamPost||'—'}`),
        patient.empamFecha&&React.createElement('div',{style:{fontSize:12,color:'#777',marginTop:4}},
          `Vence: ${formatDate(patient.empamFecha)}${patient.empamDias!==null?
           ` (${patient.empamDias>0?patient.empamDias+' días':'VENCIDO'})`:''}`))
    ),

    // CLÍNICO
    tab==='clinico'&&React.createElement('div',null,
      React.createElement(SectionHdr,null,'Comparación PRE → POST'),
      React.createElement(ClinicalCompare,{label:'TUG (Timed Up and Go)',pre:patient.tugPre,post:patient.tugPost,unit:'seg',lowerIsBetter:true}),
      React.createElement(ClinicalCompare,{label:'HAQ (Cuestionario)',pre:patient.haqPre,post:patient.haqPost,unit:'pts',lowerIsBetter:true}),
      React.createElement(ClinicalCompare,{label:'EUP Derecho',pre:patient.eupDerPre,post:patient.eupDerPost,unit:'seg',lowerIsBetter:false}),
      React.createElement(ClinicalCompare,{label:'EUP Izquierdo',pre:patient.eupIzqPre,post:patient.eupIzqPost,unit:'seg',lowerIsBetter:false}),
      React.createElement(SectionHdr,null,'Datos adicionales PRE'),
      React.createElement('div',{className:'detail-grid'},
        React.createElement(DetailItem,{label:'Vel. Derecha',value:patient.velDerPre}),
        React.createElement(DetailItem,{label:'Vel. Izquierda',value:patient.velIzqPre}),
        React.createElement(DetailItem,{label:'CAT Interna',value:patient.catInt}),
        React.createElement(DetailItem,{label:'CAT Externa',value:patient.catExt}),
        React.createElement(DetailItem,{label:'Dolor D° Pre',value:patient.dolorDPre}),
        React.createElement(DetailItem,{label:'Dolor I° Pre',value:patient.dolorIPre})
      ),
      React.createElement(SectionHdr,null,'Resultados Finales'),
      React.createElement('div',{className:'detail-grid'},
        [['TUG',patient.resTug],['EUP Der.',patient.resEupDer],
         ['EUP Izq.',patient.resEupIzq],['Funcional',patient.estadoFunc]]
          .map(([l,v])=>React.createElement(DetailItem,{key:l,label:l,
            value:RESULT_LABELS[v]||v||'—',
            color:v==='MEJ'?'#375623':v==='A'?'#C00000':undefined}))
      )
    ),


    // ASISTENCIA
    tab==='asistencia'&&React.createElement('div',null,
      React.createElement('div',{className:'card',style:{textAlign:'center'}},
        React.createElement('div',{style:{fontSize:42,fontWeight:900,
          color:patient.alertaAsist?.includes('BAJO')?'#C00000':'#375623'}},
          `${patient.totalPresencias||0} / ${patient.totalSesiones||24}`),
        React.createElement('div',{style:{color:'#777',marginBottom:12}},
          `${patient.pctAsistencia||0}% de asistencia`),
        React.createElement(ProgressBar,{value:patient.totalPresencias||0,max:patient.totalSesiones||24,
          color:patient.alertaAsist?.includes('BAJO')?'#C00000':'#375623'}),
        React.createElement('div',{style:{marginTop:8,fontSize:13,color:'#888'}},
          'Mínimo requerido: 20 de 24 sesiones'),
        React.createElement('div',{style:{marginTop:10}},
          React.createElement(AsistChip,{alerta:patient.alertaAsist,
            presencias:patient.totalPresencias,total:patient.totalSesiones}))
      )
    ),

    // EDITAR
    tab==='editar'&&React.createElement('div',null,
      React.createElement(SectionHdr,null,'Datos de Contacto'),
      React.createElement(Field,{label:'Teléfono'},
        React.createElement('input',{type:'tel',value:form.fono||'',onChange:e=>upd('fono',e.target.value)})),
      React.createElement(SectionHdr,null,'Estado Programa'),
      React.createElement('div',{className:'field-row'},
        React.createElement(Field,{label:'Ciclo'},
          React.createElement('select',{value:form.ciclo||'',onChange:e=>upd('ciclo',e.target.value)},
            CICLOS.map(c=>React.createElement('option',{key:c,value:c},c)))),
        React.createElement(Field,{label:'Estado'},
          React.createElement('select',{value:form.estado||'',onChange:e=>upd('estado',e.target.value)},
            ESTADOS.map(s=>React.createElement('option',{key:s,value:s},s))))
      ),
      React.createElement(Field,{label:'Taller'},
        React.createElement('select',{value:form.taller||'',onChange:e=>upd('taller',e.target.value)},
          React.createElement('option',{value:''},'— Seleccionar —'),
          TALLERES.map(t=>React.createElement('option',{key:t,value:t},t))
        )
      ),
      React.createElement(SectionHdr,null,'Evaluación POST'),
      React.createElement('div',{className:'field-row'},
        React.createElement(Field,{label:'TUG Post (seg)'},
          React.createElement('input',{type:'number',value:form.tugPost||'',onChange:e=>upd('tugPost',e.target.value)})),
        React.createElement(Field,{label:'HAQ Post'},
          React.createElement('input',{type:'number',value:form.haqPost||'',onChange:e=>upd('haqPost',e.target.value)}))
      ),
      React.createElement('div',{className:'field-row'},
        React.createElement(Field,{label:'EUP Der Post'},
          React.createElement('input',{type:'number',value:form.eupDerPost||'',onChange:e=>upd('eupDerPost',e.target.value)})),
        React.createElement(Field,{label:'EUP Izq Post'},
          React.createElement('input',{type:'number',value:form.eupIzqPost||'',onChange:e=>upd('eupIzqPost',e.target.value)}))
      ),
      React.createElement(SectionHdr,null,'Resultados Finales'),
      React.createElement('div',{className:'field-row'},
        React.createElement(Field,{label:'Resultado TUG'},
          React.createElement('select',{value:form.resTug||'',onChange:e=>upd('resTug',e.target.value)},
            React.createElement('option',{value:''},'—'),
            Object.entries(RESULT_LABELS).map(([k,v])=>React.createElement('option',{key:k,value:k},v)))),
        React.createElement(Field,{label:'Resultado EUP Der'},
          React.createElement('select',{value:form.resEupDer||'',onChange:e=>upd('resEupDer',e.target.value)},
            React.createElement('option',{value:''},'—'),
            Object.entries(RESULT_LABELS).map(([k,v])=>React.createElement('option',{key:k,value:k},v))))
      ),
      React.createElement(Field,{label:'Estado Funcional'},
        React.createElement('select',{value:form.estadoFunc||'',onChange:e=>upd('estadoFunc',e.target.value)},
          React.createElement('option',{value:''},'—'),
          Object.entries(EMPAM_CODES).map(([k,v])=>React.createElement('option',{key:k,value:k},`${k} — ${v}`))
        )
      ),
      React.createElement(SectionHdr,null,'EMPAM Post'),
      React.createElement(Field,{label:'Resultado EMPAM Post'},
        React.createElement('select',{value:form.empamPost||'',onChange:e=>upd('empamPost',e.target.value)},
          React.createElement('option',{value:''},'—'),
          Object.entries(EMPAM_CODES).map(([k,v])=>React.createElement('option',{key:k,value:k},`${k} — ${v}`))
        )
      ),
      React.createElement('div',{style:{marginTop:16,display:'flex',gap:8}},
        React.createElement('button',{className:'btn btn-ghost',style:{flex:1},onClick:()=>setTab('general')},'Cancelar'),
        React.createElement('button',{className:'btn btn-green',style:{flex:2},onClick:save,disabled:saving},
          saving?'Guardando...':'💾 Guardar Cambios')
      )
    )
  );
}

// ─────────────────────────────────────────────────────────────────────
// VIEW: ALERTAS
// ─────────────────────────────────────────────────────────────────────
function buildWspMsg(p, tipo) {
  const nombre = p.nombre?.split(' ').slice(0,2).join(' ') || 'estimado/a';
  const intro = tipo === 'VENCIDO'
    ? `Hola ${nombre}, le informamos que su EMPAM se encuentra VENCIDO.`
    : `Hola ${nombre}, su EMPAM vence pronto (${formatDate(p.empamFecha)||'próximamente'}).`;
  return encodeURIComponent(
    `${intro}\n\nPor favor solicite su hora lo antes posible mediante:\n` +
    `📱 App *Hora Salud*: Descárguela y busque CESFAM Félix de Amesti.\n` +
    `💻 Web: horasalud.cl\n` +
    `O llame directamente al CESFAM para agendar.\n\n` +
    `Programa MAS AMA · CESFAM Félix de Amesti`
  );
}

function ViewAlertas({patients,onPatient}){
  const [showInfo, setShowInfo] = useState(false);
  const [showWsp, setShowWsp]   = useState(false);

  // Modal info App Hora Salud / Telesalud
  const modalInfo = showInfo && React.createElement('div',{className:'overlay',
    onClick:e=>{ if(e.target===e.currentTarget) setShowInfo(false); }
  },
    React.createElement('div',{className:'sheet'},
      React.createElement('div',{className:'sheet-handle'}),
      React.createElement('div',{style:{fontWeight:900,fontSize:17,marginBottom:14}},
        '📱 Cómo pedir hora para EMPAM'),
      React.createElement('div',{style:{
        background:'#D5F5E3',borderRadius:12,padding:'14px 16px',marginBottom:12
      }},
        React.createElement('div',{style:{fontWeight:800,fontSize:15,color:'#1E8449',marginBottom:6}},
          '📲 App Hora Salud'),
        React.createElement('div',{style:{fontSize:13,color:'#555',lineHeight:1.6}},
          '1. El paciente descarga la app "Hora Salud" en su teléfono',React.createElement('br'),
          '2. Busca CESFAM Félix de Amesti',React.createElement('br'),
          '3. Solicita hora para EMPAM / Evaluación Adulto Mayor',React.createElement('br'),
          React.createElement('strong',null,'Disponible para: '), 'Android e iOS'
        )
      ),
      React.createElement('div',{style:{
        background:'#D6EAF8',borderRadius:12,padding:'14px 16px',marginBottom:12
      }},
        React.createElement('div',{style:{fontWeight:800,fontSize:15,color:'#2471A3',marginBottom:6}},
          '💻 Telesalud'),
        React.createElement('div',{style:{fontSize:13,color:'#555',lineHeight:1.6}},
          '1. Llamar directamente al CESFAM',React.createElement('br'),
          '2. Solicitar teleconsulta o atención presencial para EMPAM',React.createElement('br'),
          '3. Informar que es usuario del programa MAS AMA'
        )
      ),
      React.createElement('div',{style:{
        background:'#FEF9E7',borderRadius:12,padding:'12px 14px',fontSize:13,
        color:'#7A5C00',lineHeight:1.5,marginBottom:14
      }},
        '💡 ', React.createElement('strong',null,'Recuerda informar al paciente: '),
        'el EMPAM debe renovarse antes de su vencimiento. Con 30 días de anticipación es el momento ideal.'
      ),
      React.createElement('button',{className:'btn btn-ghost',onClick:()=>setShowInfo(false)},'Cerrar')
    )
  );

  const [tab,setTab]=useState('empam');
  const vencidos  =patients.filter(p=>p.empamEstado?.includes('VENCIDO'));
  const prontos   =patients.filter(p=>p.empamEstado?.includes('PRONTO'));
  const pendientes=patients.filter(p=>p.empamEstado?.includes('PEND'));
  const bajo      =patients.filter(p=>p.alertaAsist?.includes('BAJO'));

  const urgentes  =[...vencidos,...prontos].filter(p=>p.fono);

  const modalWsp = showWsp && React.createElement('div',{className:'overlay',
    onClick:e=>{ if(e.target===e.currentTarget) setShowWsp(false); }
  },
    React.createElement('div',{className:'sheet',style:{maxHeight:'85vh',overflowY:'auto'}},
      React.createElement('div',{className:'sheet-handle'}),
      React.createElement('div',{style:{fontWeight:900,fontSize:17,marginBottom:4}},
        '💬 WhatsApp Masivo EMPAM'),
      React.createElement('div',{style:{fontSize:13,color:'#777',marginBottom:16}},
        `${urgentes.length} pacientes con teléfono · Vencido o próximo a vencer`),
      urgentes.length === 0
        ? React.createElement('div',{className:'empty-state'},
            React.createElement('p',null,'Sin pacientes con teléfono registrado'))
        : urgentes.map(p => React.createElement('div',{key:p.id,style:{
            display:'flex',justifyContent:'space-between',alignItems:'center',
            padding:'10px 0',borderBottom:'1px solid #f0f0f0'
          }},
            React.createElement('div',null,
              React.createElement('div',{style:{fontWeight:700,fontSize:14}},
                p.nombre?.split(' ').slice(0,2).join(' ')),
              React.createElement('div',{style:{fontSize:12,color:'#777'}},
                `${p.fono} · `,
                React.createElement('span',{style:{
                  color: p.empamEstado?.includes('VENCIDO') ? '#C00000' : '#D68910',
                  fontWeight:700
                }}, p.empamEstado?.includes('VENCIDO') ? 'VENCIDO' : 'VENCE PRONTO')
              )
            ),
            React.createElement('a',{
              href:`https://wa.me/56${p.fono?.replace(/\D/g,'')}?text=${buildWspMsg(p, p.empamEstado?.includes('VENCIDO')?'VENCIDO':'PRONTO')}`,
              target:'_blank', rel:'noopener noreferrer',
              style:{
                background:'#25D366',color:'#fff',borderRadius:20,
                padding:'8px 14px',fontSize:13,fontWeight:700,
                textDecoration:'none',whiteSpace:'nowrap'
              }
            },'📲 Enviar')
          )),
      React.createElement('div',{style:{marginTop:16,fontSize:12,color:'#999',lineHeight:1.5}},
        '* Se abre WhatsApp con mensaje pre-escrito. No se envía automáticamente.'),
      React.createElement('button',{className:'btn btn-ghost',style:{marginTop:12},
        onClick:()=>setShowWsp(false)},'Cerrar')
    )
  );

  function AList({list,type}){
    if(!list.length) return React.createElement('div',{className:'empty-state'},
      React.createElement('div',{className:'emoji'},'✅'),
      React.createElement('p',null,'Sin alertas aquí'));
    return React.createElement('div',{className:'patient-list'},
      list.map(p=>React.createElement('div',{key:p.id,className:'patient-row',onClick:()=>onPatient(p)},
        React.createElement(Avatar,{sexo:p.sexo,nombre:p.nombre}),
        React.createElement('div',{className:'p-info'},
          React.createElement('div',{className:'p-name'},p.nombre),
          React.createElement('div',{className:'p-sub'},p.taller),
          React.createElement('div',{className:'p-chips'},
            type==='empam'
              ?React.createElement(EmpamChip,{estado:p.empamEstado})
              :React.createElement(AsistChip,{alerta:p.alertaAsist,presencias:p.totalPresencias,total:p.totalSesiones}),
            type==='empam'&&p.empamFecha&&
              React.createElement('span',{style:{fontSize:12,color:'#777'}},` Vence: ${formatDate(p.empamFecha)}`),
            type==='empam'&&(p.empamEstado?.includes('VENCIDO')||p.empamEstado?.includes('PRONTO'))&&
              React.createElement('span',{style:{
                background:'#FFF9E6',color:'#7A5C00',borderRadius:20,
                padding:'2px 8px',fontSize:11,fontWeight:700
              }},'📱 Pedir hora')
          )
        ),
        React.createElement('span',{style:{fontSize:20,color:'#ccc'}},'›')
      ))
    );
  }

  return React.createElement('div',{className:'page'},
    modalInfo,
    modalWsp,
    // Banner informativo
    React.createElement('div',{style:{
      background:'#1A3A5C',borderRadius:12,padding:'12px 14px',marginBottom:8,
      display:'flex',justifyContent:'space-between',alignItems:'center'
    }},
      React.createElement('div',null,
        React.createElement('div',{style:{color:'#fff',fontWeight:800,fontSize:13}},'⚠️ Alertas Clínicas'),
        React.createElement('div',{style:{color:'rgba(255,255,255,.7)',fontSize:12}},
          'Revisa antes de ir al taller')
      ),
      React.createElement('button',{
        onClick:()=>setShowInfo(true),
        style:{background:'rgba(255,255,255,.15)',color:'#fff',border:'none',
               borderRadius:10,padding:'8px 12px',fontSize:12,fontWeight:700,cursor:'pointer'}
      },'📱 Cómo pedir hora')
    ),
    React.createElement('div',{className:'tabs'},
      [['empam',`🔴 EMPAM (${vencidos.length+prontos.length})`],
       ['asist',`👣 Asistencia (${bajo.length})`],
       ['pend',`⏳ Pendientes (${pendientes.length})`]]
        .map(([v,l])=>React.createElement('div',{key:v,className:`tab ${tab===v?'active':''}`,onClick:()=>setTab(v)},l))
    ),
    tab==='empam'&&React.createElement('div',null,
      vencidos.length>0&&React.createElement('div',null,
        React.createElement(SectionHdr,null,`🔴 Vencido — ${vencidos.length} pacientes`),
        React.createElement(AList,{list:vencidos,type:'empam'})),
      prontos.length>0&&React.createElement('div',null,
        React.createElement(SectionHdr,null,`🟡 Vence en 30 días — ${prontos.length} pacientes`),
        React.createElement(AList,{list:prontos,type:'empam'})),
      vencidos.length===0&&prontos.length===0&&
        React.createElement('div',{className:'empty-state'},
          React.createElement('div',{className:'emoji'},'✅'),
          React.createElement('p',null,'Sin alertas EMPAM urgentes'))
    ),
    tab==='asist'&&React.createElement('div',null,
      React.createElement(SectionHdr,null,`< 20 sesiones — ${bajo.length} pacientes`),
      React.createElement(AList,{list:bajo,type:'asist'})),
    tab==='pend'&&React.createElement('div',null,
      React.createElement(SectionHdr,null,`EMPAM Pendiente — ${pendientes.length} pacientes`),
      React.createElement(AList,{list:pendientes,type:'empam'}))
  );
}

// ─────────────────────────────────────────────────────────────────────
// VIEW: EXPORTAR
// ─────────────────────────────────────────────────────────────────────
function ViewExportar({patients,attendanceLog,toast}){
  const [month,setMonth]=useState(new Date().toISOString().slice(0,7));
  const newPats=patients.filter(p=>p.isNew).length;
  const attCount=Object.keys(attendanceLog).length;

  return React.createElement('div',{className:'page'},
    React.createElement('div',{className:'kpi-grid'},
      React.createElement('div',{className:'kpi-card info'},
        React.createElement('div',{className:'kpi-val'},patients.length),
        React.createElement('div',{className:'kpi-lbl'},'Pacientes')),
      React.createElement('div',{className:'kpi-card ok'},
        React.createElement('div',{className:'kpi-val'},newPats),
        React.createElement('div',{className:'kpi-lbl'},'Nuevos')),
      React.createElement('div',{className:'kpi-card info'},
        React.createElement('div',{className:'kpi-val'},attCount),
        React.createElement('div',{className:'kpi-lbl'},'Asistencias'))
    ),

    React.createElement('div',{className:'card'},
      React.createElement('div',{className:'card-title'},'📥 Exportar Excel'),
      React.createElement('div',{style:{fontSize:14,color:'#555',marginBottom:14,lineHeight:1.6}},
        'Se descarga un Excel nuevo con toda la información actualizada. Puedes enviarlo por WhatsApp, Drive o correo.'),
      React.createElement(Field,{label:'Mes del reporte'},
        React.createElement('input',{type:'month',value:month,onChange:e=>setMonth(e.target.value)})),
      React.createElement('button',{className:'btn btn-green',style:{marginTop:4},
        onClick:()=>{ exportToExcel(patients,attendanceLog,month.replace('-','_')); toast('📥 Descargando Excel...'); }},
        '📥 Descargar Excel Completo')
    ),

    React.createElement('div',{className:'card'},
      React.createElement('div',{className:'card-title'},'📄 El Excel incluye estas hojas'),
      [['MAESTRO','Todos los pacientes actualizados con datos clínicos'],
       [`ASISTENCIA ${month}`,'Registro de presencias del mes seleccionado'],
       ['ALERTAS','EMPAM vencidos, próximos y bajo mínimo de sesiones'],
       newPats>0&&['NUEVOS PACIENTES',`${newPats} pacientes registrados desde la app`]]
        .filter(Boolean)
        .map((arr,i)=>React.createElement('div',{key:i,style:{
          padding:'10px 0',borderBottom:'1px solid #eee',
          display:'flex',gap:10,alignItems:'flex-start'}},
          React.createElement('span',{style:{fontSize:18}},'📄'),
          React.createElement('div',null,
            React.createElement('div',{style:{fontWeight:700,fontSize:14}},arr[0]),
            React.createElement('div',{style:{fontSize:12,color:'#777'}},arr[1]))
        ))
    )
  );
}

// ─────────────────────────────────────────────────────────────────────
// VIEW: CONFIGURACIÓN
// ─────────────────────────────────────────────────────────────────────
function ViewConfig({patients,setPatients,toast,syncConfig,setSyncConfig,userSession,onSync,scriptUrl,setScriptUrlProp}){
  const [tab,setTab]       = useState('general');
  const [urlInput,setUrl]  = useState(syncConfig?.url||'');
  const [testing,setTest]  = useState(false);

  function saveUrl(){
    const cfg = {...(syncConfig||{}), url:urlInput, enabled:!!urlInput};
    setSyncConfig(cfg);
    if(setScriptUrlProp) setScriptUrlProp(urlInput);
    toast(urlInput ? '✅ URL guardada — la app leerá tus archivos de Drive' : '⚠️ URL eliminada');
  }

  async function testConnection(){
    if(!urlInput){ toast('❌ Pega primero la URL del Apps Script'); return; }
    setTest(true);
    try{
      const r = await fetch(urlInput);
      const j = await r.json();
      if(j.status==='ok') toast('✅ Conexión exitosa con Google Sheets');
      else toast('⚠️ Respondió pero con error: ' + (j.message||''));
    } catch(e){ toast('❌ No se pudo conectar · Verifica la URL'); }
    setTest(false);
  }

  // Exportar Excel
  async function exportExcel(){
    const XLSX = window.XLSX;
    if(!XLSX){ toast('❌ Error: librería no cargada'); return; }
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(patients.map(p=>({
      NOMBRE:p.nombre, RUT:p.rut, TALLER:p.taller, CICLO:p.ciclo,
      ESTADO:p.estado, SEXO:p.sexo, EDAD:p.edad,
      EMPAM_ESTADO:p.empamEstado, EMPAM_FECHA:p.empamFecha,
      TUG_PRE:p.tugPre, HAQ_PRE:p.haqPre, FONO:p.fono,
    })));
    XLSX.utils.book_append_sheet(wb, ws1, 'MAESTRO');
    const fecha = new Date().toISOString().slice(0,10);
    XLSX.writeFile(wb, `MAS_AMA_Respaldo_${fecha}.xlsx`);
    toast('✅ Excel descargado — guárdalo en Drive');
  }

  // Reset data
  function resetData(){
    if(!window.confirm('¿Borrar TODOS los datos locales? Esto no afecta Google Sheets si está configurado.')) return;
    DB.del('patients'); DB.del('attendanceLog'); DB.del('sessionLog');
    DB.del('sessionNotes'); DB.del('agendaDuplas');
    toast('🗑️ Datos locales borrados');
  }

  return React.createElement('div',{className:'page'},
    React.createElement('div',{className:'tabs'},
      [['general','⚙️ General'],['sync','☁️ Sync'],['datos','🗄️ Datos']]
        .map(([v,l])=>React.createElement('div',{key:v,
          className:`tab ${tab===v?'active':''}`,onClick:()=>setTab(v)},l))
    ),

    // ── GENERAL ──────────────────────────────────────────────────────
    tab==='general' && React.createElement('div',null,
      React.createElement('div',{className:'card'},
        React.createElement('div',{className:'card-title'},'Usuario activo'),
        React.createElement('div',{style:{display:'flex',alignItems:'center',gap:12}},
          React.createElement('div',{style:{width:48,height:48,borderRadius:'50%',
            background:'linear-gradient(135deg,#C0392B,#922B21)',
            display:'flex',alignItems:'center',justifyContent:'center',
            color:'#fff',fontWeight:900,fontSize:20}},
            (userSession?.nombre||'D')[0]),
          React.createElement('div',null,
            React.createElement('div',{style:{fontWeight:800,fontSize:16}},
              userSession?.nombre||'DANIEL'),
            React.createElement('div',{style:{fontSize:13,color:'#777'}},
              userSession?.email||'daniel.moyav@gmail.com'),
            React.createElement('div',{style:{fontSize:12,marginTop:3}},
              React.createElement('span',{style:{background:'#FADBD8',color:'#C0392B',
                borderRadius:20,padding:'2px 8px',fontSize:11,fontWeight:700}},
                '👑 Jefe — Acceso total'))
          )
        )
      ),

      React.createElement('div',{className:'card'},
        React.createElement('div',{className:'card-title'},'Información del sistema'),
        [
          ['Versión','MAS AMA Pro v10'],
          ['Pacientes registrados', patients.length],
          ['Modo', syncConfig?.enabled ? '☁️ Google Sheets' : '📱 Local'],
        ].map(([l,v])=>React.createElement('div',{key:l,style:{
          display:'flex',justifyContent:'space-between',
          padding:'8px 0',borderBottom:'1px solid #f0f0f0',fontSize:14
        }},
          React.createElement('span',{style:{color:'#777'}},l),
          React.createElement('span',{style:{fontWeight:700}},v)
        ))
      ),

      React.createElement('button',{
        className:'btn btn-ghost',
        onClick:()=>{
          DB.del('userSession');
          sessionStorage.removeItem('masama_unlocked');
          window.location.reload();
        }
      },'🔒 Cerrar sesión')
    ),

    // ── SYNC ─────────────────────────────────────────────────────────
    tab==='sync' && React.createElement('div',null,

      // Info modo solo lectura
      React.createElement('div',{style:{
        background:'#D5F5E3',border:'1.5px solid #1E8449',
        borderRadius:12,padding:'14px 16px',marginBottom:12
      }},
        React.createElement('div',{style:{fontWeight:800,fontSize:15,color:'#1E8449',marginBottom:6}},
          '🔒 Modo Solo Lectura'),
        React.createElement('div',{style:{fontSize:13,color:'#555',lineHeight:1.6}},
          'La app lee tus archivos de Drive sin modificar nada. ',
          React.createElement('strong',null,'100% seguro — '),
          'tus colegas no verán ningún cambio.')
      ),

      // Estado
      React.createElement('div',{className:'card',style:{
        background: syncConfig?.enabled ? '#EBF5FB' : '#FEF9E7',
        border:`1.5px solid ${syncConfig?.enabled ? '#2471A3' : '#F4D03F'}`
      }},
        React.createElement('div',{style:{fontWeight:800,fontSize:14,marginBottom:4}},
          syncConfig?.enabled ? '✅ Script configurado' : '⚠️ Sin configurar'),
        React.createElement('div',{style:{fontSize:12,color:'#555',lineHeight:1.5}},
          syncConfig?.enabled
            ? 'La app leerá los datos actualizados de tus archivos en Drive.'
            : 'Configura el script para que la app lea tus archivos.')
      ),

      // Instrucciones claras
      React.createElement('div',{className:'card'},
        React.createElement('div',{className:'card-title'},'📋 Cómo configurar — 3 pasos'),
        [
          '1. Abre tu Google Apps Script (el que ya tienes configurado)',
          '2. Reemplaza el código con el nuevo apps_script_v8.js',
          '3. Implementa nueva versión → copia la URL y pégala abajo',
        ].map((s,i)=>React.createElement('div',{key:i,style:{
          fontSize:13,padding:'8px 0',borderBottom:'1px solid #f0f0f0',
          color:'#444',lineHeight:1.5
        }},`${i+1}. ${s.slice(3)}`)
      )),

      // URL input
      React.createElement('div',{className:'card'},
        React.createElement('div',{className:'card-title'},'URL del Apps Script'),
        React.createElement(Field,{label:'Pega aquí la URL'},
          React.createElement('input',{
            type:'url', value:urlInput,
            onChange:e=>setUrl(e.target.value),
            placeholder:'https://script.google.com/macros/s/...',
          })
        ),
        React.createElement('div',{className:'btn-row'},
          React.createElement('button',{
            className:'btn btn-ghost btn-sm',style:{flex:1},
            onClick:testConnection, disabled:testing
          }, testing?'Probando...':'🔌 Probar'),
          React.createElement('button',{
            className:'btn btn-primary btn-sm',style:{flex:2},
            onClick:saveUrl
          },'💾 Guardar URL')
        )
      ),

      // Botón actualizar datos
      syncConfig?.enabled && React.createElement('div',{className:'card'},
        React.createElement('div',{className:'card-title'},'📥 Actualizar datos'),
        React.createElement('p',{style:{fontSize:13,color:'#777',marginBottom:12,lineHeight:1.5}},
          'Lee los archivos de Gestión y Asistencia desde Drive y actualiza la app.'),
        React.createElement('button',{className:'btn btn-primary',
          onClick:()=>onSync&&onSync()
        },'🔄 Actualizar desde Drive ahora')
      )
    ),

    // ── DATOS ─────────────────────────────────────────────────────────
    tab==='datos' && React.createElement('div',null,

      React.createElement('div',{className:'card'},
        React.createElement('div',{className:'card-title'},'📂 Importar Maestro Excel'),
        React.createElement('div',{style:{fontSize:13,color:'#777',marginBottom:12,lineHeight:1.5}},
          'Importa el Excel MAESTRO para cargar todos los pacientes.'),
        React.createElement('label',{style:{
          display:'block',textAlign:'center',
          background:'#1A3A5C',color:'#fff',borderRadius:12,padding:'14px 20px',
          cursor:'pointer',fontWeight:800,fontSize:15,
        }},
          '📂 Seleccionar archivo Excel',
          React.createElement('input',{
            type:'file',accept:'.xlsx,.xls',style:{display:'none'},
            onChange: async e=>{
              const file=e.target.files[0];
              if(!file) return;
              toast('⏳ Procesando Excel...');
              try{
                const result=await parseMaestroExcel(file);
                setPatients(result);
                DB.set('patients',result);
                toast('✅ '+result.length+' pacientes importados');
              }catch(err){ toast('❌ Error: '+err); }
              e.target.value='';
            }
          })
        ),
        patients.length>0&&React.createElement('div',{style:{
          marginTop:10,padding:'8px 12px',background:'#D5F5E3',
          borderRadius:10,fontSize:13,color:'#1E8449',fontWeight:700
        }},'✅ '+patients.length+' pacientes cargados')
      ),

      React.createElement('div',{className:'card'},
        React.createElement('div',{className:'card-title'},'💾 Respaldo'),
        React.createElement('div',{style:{fontSize:13,color:'#777',marginBottom:12,lineHeight:1.5}},
          'Exporta un Excel con todos tus datos. Guárdalo en Google Drive semanalmente como respaldo.'),
        React.createElement('button',{className:'btn btn-green',onClick:exportExcel},
          '📥 Exportar Excel de respaldo')
      ),

      React.createElement('div',{className:'card'},
        React.createElement('div',{className:'card-title',style:{color:'#C0392B'}},'⚠️ Zona de peligro'),
        React.createElement('div',{style:{fontSize:13,color:'#777',marginBottom:12,lineHeight:1.5}},
          'Borrar los datos locales no afecta Google Sheets si está configurado. ' +
          'Podrás recuperarlos haciendo Pull.'),
        React.createElement('button',{
          className:'btn btn-red', onClick:resetData
        },'🗑️ Borrar datos locales del celular')
      )
    )
  );
}


// ═══════════════════════════════════════════════════════════════════════
//  MÓDULO RAYEN
// ═══════════════════════════════════════════════════════════════════════

// Textos oficiales extraídos del Excel de tus colegas
const RAYEN_TEXTOS = {
  diagnostico: 'Z71.9 Consulta, no especificada (Repetida y estado confirmado)',
  formulario_taller: 'Programa más adulto mayor autovalente',

  ingreso: {
    actividad: 'Ingreso programa MAS AMA\nConsejerías individuales actividad física - alimentación saludable',
    historia: 'Ingreso a programa Más Adultos Mayores Autovalentes.\nUsuario firma compromiso informado.',
    indicaciones: `- Participar de los talleres de estimulación funcional
- Ropa y calzado cómodo
- Contar con hidratación durante la sesión
- Contar con lentes ópticos y/o audífonos si corresponde
- Traer su banda elástica personal si tiene
- Asistir con cuaderno y lápiz
- Realizar actividades que se entreguen para el domicilio`,
    formulario: 'Programa más adulto mayor autovalente',
  },

  sesion: {
    actividad: 'Ingreso programa MAS AMA',
    descripcion: (taller, fecha) =>
      `Se realiza sesión grupal del programa MAS AMA en taller ${taller}.\nFecha: ${fecha}.\nSe realizan ejercicios de estimulación funcional física y cognitiva.\nUsuario presenta asistencia activa y participación en las actividades.`,
    indicaciones: `- Continuar realizando actividades físicas en el hogar
- Practicar los ejercicios cognitivos trabajados en sesión
- Mantener hidratación adecuada`,
  },

  grupal: {
    actividad: 'GRP_Taller MAS AMA - Estimulación funcional física y cognitiva',
    pasos: [
      'Rayen Clínico → ATENCIÓN → Registro de atención grupal',
      'Buscar agenda del taller correspondiente',
      'En PARTICIPANTES: marcar ✓ (presente) o ✗ (ausente/no contesta)',
      'En ACTIVIDAD ingresar el texto copiado',
      'Finalizar con "COMPLEMENTAR"',
    ],
  },

  manual: {
    actividad: 'Llamada Telefónica_Programa MAS Adulto Mayor Autovalente',
    historia: (mes) =>
      `Se realiza seguimiento telefónico con el objetivo de evaluar y acompañar la realización de ejercicios físicos y actividades cognitivas en el hogar, basándose en el uso del Manual de Estimulación previamente entregado.\nMes de seguimiento: ${mes}.`,
    preguntas: [
      '¿Ha realizado los ejercicios físicos?',
      '¿Ha realizado las actividades cognitivas?',
    ],
    indicaciones: `Se refuerzan indicaciones para la realización en el hogar de las actividades contenidas en el Manual de Estimulación.\nPróximo seguimiento: indicar mes.`,
    formulario: 'Programa más adulto mayor autovalente: ESTADO: SEGUIMIENTO',
  },

  egreso: {
    actividad: 'Egreso programa MAS AMA\nConsejerías individuales actividad física - alimentación saludable',
    historia: 'Egreso de programa Más Adultos Mayores Autovalentes.',
    formulario: 'Programa más adulto mayor autovalente: egreso completa ciclo',
    indicaciones: `- Continuar haciendo ejercicio físico en el hogar
- Continuar estimulando la mente con actividades cognitivas
- Mantener una alimentación saludable
- Mantener relaciones sociales creadas en el taller
- Mantener controles de salud al día
- Mantener contacto con equipo MAS AMA
- Participar en el MAS AMA próximo año`,
  },

  abandono: {
    actividad: 'Egreso programa MAS AMA',
    historia: 'Se realiza egreso de programa por abandono.',
    formulario: 'Programa más adulto mayor autovalente - egreso por abandono',
    nota: '⚠️ Antes de registrar abandono: ¿Se le ofreció el Manual de Estimulación?',
  },

  cognitivo: {
    moca: {
      actividad: 'Evaluación Cognitiva - Programa Más Adultos Mayores Autovalentes',
      historia: 'Evaluación cognitiva por queja subjetiva de memoria, alteración en pregunta N°9 de HAQ-8 y clínica observada.',
      diagnostico: 'Z01.9 Examen de pesquisa especial, no especificado. (Repetida y estado confirmado)',
    },
  },
};

const TIPO_LABELS = {
  sesion:    { icon:'🏃', label:'Sesión Taller', color:'#2E75B6' },
  grupal:    { icon:'👥', label:'Atención Grupal', color:'#00B0F0' },
  manual:    { icon:'📖', label:'Seguimiento Manual', color:'#7030A0' },
  ingreso:   { icon:'✅', label:'Ingreso Programa', color:'#375623' },
  egreso:    { icon:'🎓', label:'Egreso Programa', color:'#ED7D31' },
  abandono:  { icon:'⚠️', label:'Abandono', color:'#C00000' },
  cognitivo: { icon:'🧠', label:'Eval. Cognitiva', color:'#1F3864' },
};

// ── COPY TO CLIPBOARD ────────────────────────────────────────────────
function copyText(text, toast) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => toast('✅ Copiado al portapapeles'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta);
    ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
    toast('✅ Copiado');
  }
}

// ── RAYEN FIELD CARD ─────────────────────────────────────────────────
function RayenField({ label, value, toast, highlight }) {
  if (!value) return null;
  return React.createElement('div', {
    style: {
      background: highlight ? '#FFF9E6' : '#F8F9FA',
      borderRadius: 10, padding: '10px 12px', marginBottom: 8,
      border: highlight ? '1.5px solid #FFD966' : '1.5px solid #E0E0E0',
    }
  },
    React.createElement('div', {
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }
    },
      React.createElement('div', { style: { flex: 1 } },
        React.createElement('div', {
          style: { fontSize: 10, fontWeight: 800, color: '#888', textTransform: 'uppercase',
                   letterSpacing: '.5px', marginBottom: 4 }
        }, label),
        React.createElement('div', {
          style: { fontSize: 13, color: '#222', lineHeight: 1.5, whiteSpace: 'pre-wrap' }
        }, value)
      ),
      React.createElement('button', {
        onClick: () => copyText(value, toast),
        style: {
          background: '#2E75B6', color: '#fff', border: 'none', borderRadius: 8,
          padding: '6px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
          flexShrink: 0, whiteSpace: 'nowrap'
        }
      }, '📋 Copiar')
    )
  );
}

// ── RAYEN FICHA POR PACIENTE ─────────────────────────────────────────
function RayenFicha({ patient, tipo, taller, fecha, mes, toast, onClose }) {
  const today = fecha || todayISO();
  const fechaFmt = formatDate(today);

  function buildFields() {
    switch(tipo) {
      case 'ingreso': return [
        { label: 'ACTIVIDAD', value: RAYEN_TEXTOS.ingreso.actividad, highlight: true },
        { label: 'DIAGNÓSTICO', value: RAYEN_TEXTOS.diagnostico },
        { label: 'FORMULARIO', value: RAYEN_TEXTOS.ingreso.formulario },
        { label: 'HISTORIA DE LA ENFERMEDAD', value: RAYEN_TEXTOS.ingreso.historia },
        { label: 'HAQ-8', value: patient.haqPre ? `Resultado HAQ-8: ${patient.haqPre}` : 'Ingresar resultado HAQ-8' },
        { label: 'TUG (seg)', value: patient.tugPre ? `TUG: ${patient.tugPre} segundos` : 'Ingresar TUG' },
        { label: 'INDICACIONES', value: RAYEN_TEXTOS.ingreso.indicaciones },
      ];
      case 'sesion': return [
        { label: 'ACTIVIDAD', value: RAYEN_TEXTOS.sesion.actividad, highlight: true },
        { label: 'DIAGNÓSTICO', value: RAYEN_TEXTOS.diagnostico },
        { label: 'FORMULARIO', value: RAYEN_TEXTOS.formulario_taller },
        { label: 'HISTORIA DE LA ENFERMEDAD', value: RAYEN_TEXTOS.sesion.descripcion(taller || patient.taller, fechaFmt) },
        { label: 'INDICACIONES', value: RAYEN_TEXTOS.sesion.indicaciones },
      ];
      case 'manual': return [
        { label: 'ACTIVIDAD', value: RAYEN_TEXTOS.manual.actividad, highlight: true },
        { label: 'DIAGNÓSTICO', value: RAYEN_TEXTOS.diagnostico },
        { label: 'FORMULARIO', value: RAYEN_TEXTOS.manual.formulario },
        { label: 'HISTORIA DE LA ENFERMEDAD', value: RAYEN_TEXTOS.manual.historia(mes || 'indicar mes') },
        { label: 'PREGUNTAS A HACER', value: RAYEN_TEXTOS.manual.preguntas.join('\n') },
        { label: 'INDICACIONES', value: RAYEN_TEXTOS.manual.indicaciones },
      ];
      case 'egreso': return [
        { label: 'ACTIVIDAD', value: RAYEN_TEXTOS.egreso.actividad, highlight: true },
        { label: 'DIAGNÓSTICO', value: RAYEN_TEXTOS.diagnostico },
        { label: 'FORMULARIO', value: RAYEN_TEXTOS.egreso.formulario },
        { label: 'HISTORIA DE LA ENFERMEDAD', value: RAYEN_TEXTOS.egreso.historia },
        { label: 'TUG POST', value: patient.tugPost ? `TUG Post: ${patient.tugPost} seg → Resultado: ${patient.resTug||'—'}` : 'Ingresar TUG Post' },
        { label: 'HAQ POST', value: patient.haqPost ? `HAQ-8 Post: ${patient.haqPost} → Resultado: ${patient.resEupDer||'—'}` : 'Ingresar HAQ Post' },
        { label: 'INDICACIONES', value: RAYEN_TEXTOS.egreso.indicaciones },
      ];
      case 'abandono': return [
        { label: '⚠️ ATENCIÓN', value: RAYEN_TEXTOS.abandono.nota, highlight: true },
        { label: 'ACTIVIDAD', value: RAYEN_TEXTOS.abandono.actividad },
        { label: 'DIAGNÓSTICO', value: RAYEN_TEXTOS.diagnostico },
        { label: 'FORMULARIO', value: RAYEN_TEXTOS.abandono.formulario },
        { label: 'HISTORIA DE LA ENFERMEDAD', value: RAYEN_TEXTOS.abandono.historia },
      ];
      case 'cognitivo': return [
        { label: 'ACTIVIDAD', value: RAYEN_TEXTOS.cognitivo.moca.actividad, highlight: true },
        { label: 'DIAGNÓSTICO (diferente)', value: RAYEN_TEXTOS.cognitivo.moca.diagnostico, highlight: true },
        { label: 'HISTORIA DE LA ENFERMEDAD', value: RAYEN_TEXTOS.cognitivo.moca.historia },
      ];
      default: return [];
    }
  }

  const fields = buildFields();
  const t = TIPO_LABELS[tipo] || {};

  // Copy all button
  function copyAll() {
    const allText = fields.map(f => `[${f.label}]\n${f.value}`).join('\n\n');
    copyText(allText, toast);
  }

  return React.createElement('div', { className: 'overlay', onClick: e => { if(e.target===e.currentTarget) onClose(); } },
    React.createElement('div', { className: 'sheet', style: { maxHeight: '90dvh' } },
      React.createElement('div', { className: 'sheet-handle' }),

      // Header
      React.createElement('div', {
        style: { background: t.color || '#2E75B6', borderRadius: 12, padding: '12px 16px', marginBottom: 14 }
      },
        React.createElement('div', { style: { fontSize: 12, color: 'rgba(255,255,255,.7)', fontWeight: 700, marginBottom: 2 } },
          `${t.icon} ${t.label} — RAYEN`),
        React.createElement('div', { style: { fontSize: 16, fontWeight: 900, color: '#fff' } }, patient.nombre),
        React.createElement('div', { style: { fontSize: 12, color: 'rgba(255,255,255,.7)', marginTop: 2 } },
          `RUT: ${patient.rut} · ${patient.taller}`)
      ),

      // Guide note
      React.createElement('div', {
        style: { background: '#E8F4FD', borderRadius: 10, padding: '10px 12px', marginBottom: 12,
                 fontSize: 12, color: '#1F4E79', lineHeight: 1.5 }
      },
        React.createElement('strong', null, '📌 Pasos en RAYEN: '),
        'Busca al paciente por RUT → Abre su ficha → Copia y pega cada campo abajo'
      ),

      // Fields
      fields.map((f, i) => React.createElement(RayenField, { key: i, ...f, toast })),

      // Copy all + close
      React.createElement('div', { className: 'btn-row', style: { marginTop: 14 } },
        React.createElement('button', { className: 'btn btn-ghost', style: { flex: 1 }, onClick: onClose }, 'Cerrar'),
        React.createElement('button', { className: 'btn btn-primary', style: { flex: 2 }, onClick: copyAll },
          '📋 Copiar Todo')
      )
    )
  );
}

// ── RAYEN ATENCIÓN GRUPAL ─────────────────────────────────────────────
function RayenGrupal({ patients, taller, fecha, attendanceLog, toast, onClose }) {
  const fechaFmt = formatDate(fecha);
  const presentes = patients.filter(p => {
    const key = `${fecha}||${taller}||${p.rut||p.id}`;
    return attendanceLog[key] === 'P';
  });
  const ausentes = patients.filter(p => {
    const key = `${fecha}||${taller}||${p.rut||p.id}`;
    return attendanceLog[key] === 'A';
  });

  const textoGrupal = `GRP_Taller MAS AMA - Estimulación funcional física y cognitiva
Taller: ${taller}
Fecha: ${fechaFmt}
Total presentes: ${presentes.length}
Total ausentes: ${ausentes.length}`;

  const textoActividad = RAYEN_TEXTOS.sesion.descripcion(taller, fechaFmt);

  return React.createElement('div', { className: 'overlay', onClick: e => { if(e.target===e.currentTarget) onClose(); } },
    React.createElement('div', { className: 'sheet', style: { maxHeight: '90dvh' } },
      React.createElement('div', { className: 'sheet-handle' }),
      React.createElement('div', { style: { fontWeight: 900, fontSize: 17, marginBottom: 4 } }, '👥 Atención Grupal RAYEN'),
      React.createElement('div', { style: { fontSize: 13, color: '#777', marginBottom: 14 } }, `${taller} · ${fechaFmt}`),

      // Steps
      React.createElement('div', { className: 'card', style: { marginBottom: 12, padding: 12 } },
        React.createElement('div', { className: 'card-title' }, '📌 Pasos en RAYEN'),
        RAYEN_TEXTOS.grupal.pasos.map((p, i) =>
          React.createElement('div', { key: i, style: { fontSize: 13, padding: '4px 0', borderBottom: '1px solid #f0f0f0',
            display: 'flex', gap: 8 } },
            React.createElement('span', { style: { color: '#2E75B6', fontWeight: 800, flexShrink: 0 } }, `${i+1}.`),
            React.createElement('span', null, p)
          )
        )
      ),

      React.createElement(RayenField, { label: 'NOMBRE DE LA AGENDA / ACTIVIDAD', value: textoGrupal, toast, highlight: true }),
      React.createElement(RayenField, { label: 'HISTORIA DE LA ENFERMEDAD (para cada participante)', value: textoActividad, toast }),

      // Presentes list
      presentes.length > 0 && React.createElement('div', { className: 'card', style: { marginBottom: 10, padding: 12 } },
        React.createElement('div', { className: 'card-title' }, `✅ PRESENTES — ${presentes.length} pacientes`),
        React.createElement('div', {
          style: { fontSize: 12, color: '#375623', lineHeight: 1.8, fontFamily: 'monospace',
                   background: '#F0FAF0', borderRadius: 8, padding: 8 }
        }, presentes.map(p => `• ${p.nombre} (${p.rut})`).join('\n')),
        React.createElement('button', {
          onClick: () => copyText(presentes.map(p => `${p.nombre} — ${p.rut}`).join('\n'), toast),
          style: { marginTop: 8, background: '#375623', color: '#fff', border: 'none', borderRadius: 8,
                   padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', width: '100%' }
        }, '📋 Copiar lista de presentes')
      ),

      // Ausentes
      ausentes.length > 0 && React.createElement('div', { className: 'card', style: { marginBottom: 10, padding: 12 } },
        React.createElement('div', { className: 'card-title' }, `❌ AUSENTES — ${ausentes.length} pacientes`),
        React.createElement('div', { style: { fontSize: 12, color: '#C00000', lineHeight: 1.8, fontFamily: 'monospace',
                                               background: '#FFF0F0', borderRadius: 8, padding: 8 } },
          ausentes.map(p => `• ${p.nombre} (${p.rut})`).join('\n')
        )
      ),

      React.createElement('button', { className: 'btn btn-ghost', style: { marginTop: 8 }, onClick: onClose }, 'Cerrar')
    )
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  VIEW: RAYEN COMPLETO
// ═══════════════════════════════════════════════════════════════════════
function ViewRayen({ patients, attendanceLog, toast }) {
  const [tab, setTab]             = useState('grupal');
  const [selTaller, setTaller]    = useState('');
  const [selFecha, setFecha]      = useState(todayISO());
  const [selTipo, setTipo]        = useState('sesion');
  const [selMes, setMes]          = useState(new Date().toISOString().slice(0, 7));
  const [fichaPatient, setFicha]  = useState(null);
  const [showGrupal, setGrupal]   = useState(false);
  const [search, setSearch]       = useState('');

  const talleres = [...new Set(patients.map(p => p.taller).filter(Boolean))].sort();

  // Patients for individual tab
  const filtered = useMemo(() => {
    return patients.filter(p =>
      (!search || p.nombre.toLowerCase().includes(search.toLowerCase()) || p.rut.includes(search)) &&
      (!selTaller || p.taller === selTaller)
    );
  }, [patients, search, selTaller]);

  // Count presentes for selected taller+fecha
  const nPresentes = patients.filter(p => {
    if (!selTaller || p.taller !== selTaller) return false;
    return attendanceLog[`${selFecha}||${selTaller}||${p.rut||p.id}`] === 'P';
  }).length;

  return React.createElement('div', { className: 'page' },
    // Header info
    React.createElement('div', { className: 'card', style: { background: '#1F3864', marginBottom: 12 } },
      React.createElement('div', { style: { fontSize: 13, fontWeight: 900, color: '#00B0F0', marginBottom: 4 } }, '🏥 MODO RAYEN'),
      React.createElement('div', { style: { fontSize: 13, color: 'rgba(255,255,255,.8)', lineHeight: 1.5 } },
        'Genera los textos listos para copiar y pegar en RAYEN. Abre RAYEN en paralelo y pega campo por campo.')
    ),

    // Tabs
    React.createElement('div', { className: 'tabs' },
      [['grupal', '👥 Atención Grupal'], ['individual', '👤 Por Paciente'], ['manual', '📖 Manual']].map(([v, l]) =>
        React.createElement('div', { key: v, className: `tab ${tab === v ? 'active' : ''}`, onClick: () => setTab(v) }, l)
      )
    ),

    // ── TAB: ATENCIÓN GRUPAL ────────────────────────────────────────────
    tab === 'grupal' && React.createElement('div', null,
      React.createElement('div', { className: 'card' },
        React.createElement('div', { className: 'card-title' }, 'Selecciona el Taller y Fecha'),
        React.createElement(Field, { label: 'Taller' },
          React.createElement('select', { value: selTaller, onChange: e => setTaller(e.target.value) },
            React.createElement('option', { value: '' }, '— Seleccionar taller —'),
            talleres.map(t => React.createElement('option', { key: t, value: t }, t))
          )
        ),
        React.createElement(Field, { label: 'Fecha de la sesión' },
          React.createElement('input', { type: 'date', value: selFecha, onChange: e => setFecha(e.target.value) })
        ),
        selTaller && React.createElement('div', {
          style: { background: nPresentes > 0 ? '#E2EFDA' : '#FFF0F0', borderRadius: 10,
                   padding: '10px 14px', marginBottom: 12, fontSize: 14 }
        },
          nPresentes > 0
            ? `✅ ${nPresentes} presentes registrados para esta sesión`
            : '⚠️ No hay lista marcada para este taller/fecha. Ve a Lista primero.'
        ),
        React.createElement('button', {
          className: 'btn btn-primary',
          disabled: !selTaller || !selFecha,
          onClick: () => setGrupal(true)
        }, '👥 Generar Atención Grupal RAYEN')
      ),

      React.createElement('div', { className: 'card' },
        React.createElement('div', { className: 'card-title' }, '📌 ¿Qué es Atención Grupal?'),
        React.createElement('div', { style: { fontSize: 13, color: '#555', lineHeight: 1.6 } },
          'Es la forma más eficiente: registras a todos los pacientes del taller en un solo ingreso en RAYEN. ' +
          'Marcas ✓ a los presentes y ✗ a los ausentes. Mucho más rápido que uno por uno.')
      )
    ),

    // ── TAB: POR PACIENTE ──────────────────────────────────────────────
    tab === 'individual' && React.createElement('div', null,
      React.createElement('div', { className: 'card', style: { marginBottom: 10 } },
        React.createElement('div', { className: 'card-title' }, 'Tipo de Atención'),
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 } },
          Object.entries(TIPO_LABELS).filter(([k]) => k !== 'grupal').map(([k, v]) =>
            React.createElement('div', {
              key: k,
              onClick: () => setTipo(k),
              style: {
                background: selTipo === k ? v.color : '#fff',
                color: selTipo === k ? '#fff' : '#333',
                border: `2px solid ${selTipo === k ? v.color : '#E0E0E0'}`,
                borderRadius: 10, padding: '10px 12px', cursor: 'pointer',
                fontSize: 13, fontWeight: 700, textAlign: 'center', transition: 'all .15s'
              }
            }, `${v.icon} ${v.label}`)
          )
        )
      ),

      // Show abandono warning
      selTipo === 'abandono' && React.createElement('div', {
        style: { background: '#FFF2CC', border: '2px solid #FFD966', borderRadius: 12,
                 padding: 14, marginBottom: 12 }
      },
        React.createElement('div', { style: { fontWeight: 800, fontSize: 14, marginBottom: 6 } },
          '💡 Antes de registrar abandono:'),
        React.createElement('div', { style: { fontSize: 13, color: '#555', lineHeight: 1.6 } },
          '¿Le ofreciste el Manual de Estimulación al paciente? Si lo acepta, cambia su estado a MANUAL. ' +
          'Así evitas el abandono y mantienes mejores indicadores.')
      ),

      React.createElement('div', { className: 'search-wrap', style: { marginBottom: 8 } },
        React.createElement('span', { className: 'search-icon' }, '🔍'),
        React.createElement('input', { type: 'text', placeholder: 'Buscar paciente...',
          value: search, onChange: e => setSearch(e.target.value) })
      ),

      React.createElement('select', {
        style: { width: '100%', padding: '10px 12px', border: '1.5px solid #E0E0E0',
                 borderRadius: 12, fontSize: 13, background: '#fff', marginBottom: 10 },
        value: selTaller, onChange: e => setTaller(e.target.value)
      },
        React.createElement('option', { value: '' }, 'Todos los talleres'),
        talleres.map(t => React.createElement('option', { key: t, value: t }, t))
      ),

      React.createElement('div', { style: { fontSize: 12, color: '#888', marginBottom: 8 } },
        `${filtered.length} pacientes · Toca uno para generar su ficha RAYEN`),

      React.createElement('div', { className: 'patient-list' },
        filtered.map(p => React.createElement('div', {
          key: p.id, className: 'patient-row', onClick: () => setFicha(p)
        },
          React.createElement(Avatar, { sexo: p.sexo, nombre: p.nombre }),
          React.createElement('div', { className: 'p-info' },
            React.createElement('div', { className: 'p-name' }, p.nombre),
            React.createElement('div', { className: 'p-sub' }, `RUT: ${p.rut} · ${p.taller}`),
            React.createElement('div', { className: 'p-chips' },
              React.createElement(EmpamChip, { estado: p.empamEstado }),
              p.estado === 'MANUAL +' && React.createElement(Chip, { color: 'purple' }, '📖 Manual')
            )
          ),
          React.createElement('span', { style: { fontSize: 20, color: '#ccc' } }, '›')
        ))
      )
    ),

    // ── TAB: MANUAL ────────────────────────────────────────────────────
    tab === 'manual' && React.createElement('div', null,
      React.createElement('div', { className: 'card', style: { background: '#EDE0F7', marginBottom: 12 } },
        React.createElement('div', { style: { fontWeight: 800, fontSize: 15, color: '#7030A0', marginBottom: 6 } },
          '📖 Pacientes con Manual de Estimulación'),
        React.createElement('div', { style: { fontSize: 13, color: '#555', lineHeight: 1.6 } },
          'Estos pacientes reciben seguimiento telefónico mensual en vez de asistir al taller. ' +
          'Genera la ficha RAYEN para registrar el llamado.')
      ),

      React.createElement(Field, { label: 'Mes del seguimiento' },
        React.createElement('input', { type: 'month', value: selMes, onChange: e => setMes(e.target.value) })
      ),

      React.createElement('div', { className: 'patient-list' },
        patients.filter(p => p.estado === 'MANUAL +' || p.detalle?.includes('MANUAL')).map(p =>
          React.createElement('div', {
            key: p.id, className: 'patient-row', onClick: () => { setTipo('manual'); setFicha(p); }
          },
            React.createElement(Avatar, { sexo: p.sexo, nombre: p.nombre }),
            React.createElement('div', { className: 'p-info' },
              React.createElement('div', { className: 'p-name' }, p.nombre),
              React.createElement('div', { className: 'p-sub' }, `RUT: ${p.rut} · ${p.fono || 'Sin teléfono'}`),
              React.createElement('div', { className: 'p-chips' },
                React.createElement(Chip, { color: 'purple' }, '📖 Manual'),
                React.createElement(EmpamChip, { estado: p.empamEstado })
              )
            ),
            React.createElement('span', { style: { fontSize: 20, color: '#ccc' } }, '›')
          )
        )
      ),

      patients.filter(p => p.estado === 'MANUAL +' || p.detalle?.includes('MANUAL')).length === 0 &&
        React.createElement('div', { className: 'empty-state' },
          React.createElement('div', { className: 'emoji' }, '📖'),
          React.createElement('p', null, 'No hay pacientes con estado Manual')
        )
    ),

    // ── MODALS ─────────────────────────────────────────────────────────
    fichaPatient && React.createElement(RayenFicha, {
      patient: fichaPatient, tipo: selTipo,
      taller: selTaller || fichaPatient.taller,
      fecha: selFecha, mes: selMes, toast,
      onClose: () => setFicha(null)
    }),

    showGrupal && React.createElement(RayenGrupal, {
      patients: patients.filter(p => p.taller === selTaller),
      taller: selTaller, fecha: selFecha,
      attendanceLog, toast,
      onClose: () => setGrupal(false)
    })
  );
}



// ═══════════════════════════════════════════════════════════════════════
//  MÓDULO RUTINAS DE SESIÓN
// ═══════════════════════════════════════════════════════════════════════

// ── TEMÁTICAS CLÍNICAS DEL MANUAL DE BATALLA ──────────────────────────
const TEMATICAS = [
  {
    id: 'rodilla',
    icon: '🦵',
    nombre: 'Artrosis de Rodilla',
    color: '#C00000',
    objetivo: 'Preservar rango articular, fortalecer cuádriceps y glúteos, mejorar tolerancia funcional al dolor durante la marcha.',
    pildora: 'La artrosis mejora con movimiento controlado. El dolor leve (hasta 4/10) al ejercitar es aceptable; el dolor agudo es señal de sobrecarga.',
    doble_tarea: 'Sumar en voz alta de 2 en 2 mientras ejecuta las sentadillas con silla.',
    ejercicios: [
      { id:'r01', nombre:'Extensión de rodilla', desc:'Sentado, espalda apoyada. Extender una rodilla a la vez y mantener.', dos:'3 × 6-8 reps + última 10s iso' },
      { id:'r02', nombre:'Sentadillas con silla', desc:'Pararse y sentarse desde silla firme, sin dejarse caer. Tronco recto.', dos:'3 × 8 reps' },
      { id:'r03', nombre:'Elevaciones en puntillas', desc:'De pie, apoyo leve en silla. Subir y bajar talones controladamente.', dos:'3 × 15 reps' },
      { id:'r04', nombre:'Elevaciones laterales', desc:'De pie, apoyo leve. Elevar una pierna al costado controlando subida y bajada.', dos:'3 × 12 c/pierna' },
      { id:'r05', nombre:'Empuje acelerador', desc:'Sentado con banda en planta del pie. Empujar como acelerador de auto.', dos:'3 × 15 c/pierna' },
    ],
  },
  {
    id: 'lumbar',
    icon: '🔙',
    nombre: 'Lumbalgia / Dolor Lumbar',
    color: '#7030A0',
    objetivo: 'Disminuir rigidez lumbar, activar musculatura del core y mejorar la mecánica de carga en actividades del hogar.',
    pildora: 'El descanso prolongado empeora el dolor lumbar crónico. El movimiento graduado y el fortalecimiento del abdomen y glúteos son el mejor analgésico.',
    doble_tarea: 'Nombrar frutas por cada letra del abecedario mientras realiza la marcha estática.',
    ejercicios: [
      { id:'l01', nombre:'Movilidad de tronco – inclinación', desc:'De pie, pies al ancho de hombros. Elevar un brazo e inclinar al lado contrario.', dos:'3 × 10 c/lado' },
      { id:'l02', nombre:'Movilidad de tronco – rotación', desc:'De pie, pies al ancho de hombros. Girar el tronco de un lado al otro con control.', dos:'3 × 10 c/lado' },
      { id:'l03', nombre:'Remo con banda', desc:'Sentado, banda enganchada en los pies. Llevar codos atrás sin elevar hombros.', dos:'3 × 6-8 reps + última 10s iso' },
      { id:'l04', nombre:'Puente de glúteos en silla', desc:'Sentado al borde de la silla, apretar glúteos y empujar caderas hacia adelante.', dos:'3 × 8 reps' },
      { id:'l05', nombre:'Marcha estática', desc:'De pie, apoyo en silla. Elevar rodillas alternadamente hasta la altura de la cadera.', dos:'3 × 30 pasos' },
    ],
  },
  {
    id: 'hombro',
    icon: '💪',
    nombre: 'Hombro',
    color: '#2471A3',
    objetivo: 'Recuperar y mantener el rango funcional del hombro, con énfasis en rotación externa, flexión y fortalecimiento escapular.',
    pildora: 'El hombro se rigidiza rápido con la inmovilidad. Movilizar a diario, aunque sea con rangos pequeños, es clave para no perder funcionalidad.',
    doble_tarea: 'Contar hacia atrás desde 50 de 3 en 3 mientras realiza el ejercicio Terminator.',
    ejercicios: [
      { id:'h01', nombre:'Movilidad de hombros', desc:'De pie, codos doblados. Movimiento circular hacia atrás y luego adelante.', dos:'3 × 10 c/dirección' },
      { id:'h02', nombre:'Terminator', desc:'De pie, banda o botellas. Codos estirados a altura de hombros. Abrir brazos y cerrar.', dos:'3 × 6-8 reps + última 10s iso' },
      { id:'h03', nombre:'Empuje', desc:'De pie, manos a la altura del pecho. Extender los brazos al frente con la banda.', dos:'3 × 8 reps' },
      { id:'h04', nombre:'Popeye', desc:'De pie, codos pegados a las costillas. Llevar banda o botellas al pecho.', dos:'3 × 8 reps' },
      { id:'h05', nombre:'Martillo', desc:'De pie, codos doblados pegados al cuerpo. Extender brazos al costado sin despegar codos.', dos:'3 × 10 reps' },
      { id:'h06', nombre:'Bisagra', desc:'De pie, codos en 90° pegados al tronco. Abrir solo los antebrazos hacia afuera.', dos:'3 × 10 reps' },
    ],
  },
  {
    id: 'equilibrio',
    icon: '⚖️',
    nombre: 'Equilibrio / Prevención Caídas',
    color: '#375623',
    objetivo: 'Mejorar equilibrio estático y dinámico, reacción ante desestabilizaciones y confianza en la marcha para prevenir caídas.',
    pildora: '1 de cada 3 adultos mayores sufre una caída al año. El equilibrio se entrena con sobrecarga progresiva de desafío, no de peso. Menos apoyo = más estímulo.',
    doble_tarea: 'Mencionar nombres de ciudades de Chile mientras realiza el apoyo unipodal.',
    ejercicios: [
      { id:'e01', nombre:'Marcha estática', desc:'De pie con apoyo leve. Elevar rodillas alternadamente a la altura de la cadera.', dos:'3 × 30 pasos' },
      { id:'e02', nombre:'Elevaciones en puntillas', desc:'De pie con apoyo leve. Subir y bajar talones de forma controlada.', dos:'3 × 15 reps' },
      { id:'e03', nombre:'Apoyo unipodal', desc:'Un pie, apoyo silla si necesario. 30 seg cada lado.', dos:'3 × 30 seg c/lado' },
      { id:'e04', nombre:'Tándem estático', desc:'Un pie delante del otro. 30 seg ojos abiertos/cerrados.', dos:'3 × 30 seg' },
      { id:'e05', nombre:'Marcha en tándem', desc:'Caminar en línea recta talón-punta, 5 metros ida y vuelta.', dos:'3 × 5 metros' },
      { id:'e06', nombre:'Salto de estrella', desc:'De pie, piernas separadas. Pequeños saltos abriendo y cerrando piernas y brazos.', dos:'3 × 15 saltos (opcional)' },
    ],
  },
  {
    id: 'movilidad',
    icon: '🤸',
    nombre: 'Movilidad General',
    color: '#E67E22',
    objetivo: 'Mantener y mejorar el rango articular global, reducir la rigidez matinal y preparar el cuerpo para la actividad del día.',
    pildora: 'La flexibilidad disminuye con la edad, pero se conserva con práctica diaria. 10 minutos de movilidad al despertar pueden cambiar radicalmente la calidad del día.',
    doble_tarea: 'Respirar consciente 4 seg inhalar · 4 seg exhalar durante todo el bloque de movilidad.',
    ejercicios: [
      { id:'m01', nombre:'Movilidad cabeza – rotación', desc:"De pie, girar la cabeza a derecha e izquierda como diciendo 'NO'.", dos:'2 × 10 reps' },
      { id:'m02', nombre:'Movilidad cabeza – inclinación', desc:'De pie, llevar oreja al hombro sin elevar el hombro ni mover el tronco.', dos:'2 × 10 reps' },
      { id:'m03', nombre:'Movilidad de hombros', desc:'De pie, codos doblados. Círculos hacia atrás y luego hacia adelante.', dos:'2 × 10 c/dir' },
      { id:'m04', nombre:'Movilidad de cadera', desc:'De pie, manos en cintura. Círculos de cadera a la derecha y luego a la izquierda.', dos:'2 × 10 c/dir' },
      { id:'m05', nombre:'Flexión cadera-rodilla', desc:'De pie, elevar una rodilla hasta la altura de la cadera alternando piernas.', dos:'2 × 10 c/pierna' },
      { id:'m06', nombre:'Movilidad tobillo-pie', desc:'De pie, levantar talón de un pie y luego el contrario alternadamente.', dos:'2 × 10 c/pie' },
    ],
  },
  {
    id: 'complementario',
    icon: '🏋️',
    nombre: 'Complementario',
    color: '#1A3A5C',
    objetivo: 'Complementar la rutina base con ejercicios adicionales de fuerza, activación glútea y estabilidad para diversificar el estímulo.',
    pildora: 'Cambiar los ejercicios cada 4-6 semanas evita la meseta neuromuscular. El cuerpo se adapta rápido: si siempre haces lo mismo, deja de progresar.',
    doble_tarea: 'Progresión semanal: agregar 1-2 repeticiones por serie cada semana hasta completar 3 × 12, luego aumentar resistencia de la banda.',
    ejercicios: [
      { id:'c01', nombre:'Puente de glúteos en silla', desc:'Sentado al borde de la silla. Apretar glúteos y empujar cadera hacia el frente.', dos:'3 × 8 reps' },
      { id:'c02', nombre:'Abducción de cadera sentado', desc:'Sentado con banda rodeando las rodillas. Separar piernas contra la resistencia.', dos:'3 × 12 reps' },
      { id:'c03', nombre:'Press de pecho con banda', desc:'De pie, banda por la espalda. Empujar al frente extendiendo ambos brazos.', dos:'3 × 6-8 reps + última 10s iso' },
      { id:'c04', nombre:'Pull-down con banda', desc:'Banda sobre la cabeza con ambas manos. Tirar hacia abajo abriendo los brazos.', dos:'3 × 10 reps' },
      { id:'c05', nombre:'Marcha lateral con banda', desc:'Banda en los tobillos. Dar pasos laterales manteniendo tensión en la banda.', dos:'3 × 10 pasos' },
      { id:'c06', nombre:'Caminata en tándem', desc:'Caminar colocando un pie justo delante del otro, punta contra talón.', dos:'3 × 15 pasos' },
    ],
  },
  {
    id: 'cognitivo',
    icon: '🧠',
    nombre: 'Sesión Cognitiva',
    color: '#7D3C98',
    objetivo: 'Estimular memoria de trabajo, atención sostenida, velocidad de procesamiento y fluencia verbal a través de tareas cognitivas estructuradas.',
    pildora: 'El cerebro mantiene plasticidad a toda edad. Tareas nuevas generan nuevas conexiones neuronales. La clave es el desafío, no la dificultad extrema.',
    doble_tarea: 'Integra estas tareas como doble tarea durante los ejercicios físicos de baja demanda para potenciar la transferencia funcional.',
    ejercicios: [
      { id:'cog01', nombre:'Conteo regresivo 7 en 7', desc:'Contar en voz alta desde 100 restando 7 cada vez (100, 93, 86, 79...).', dos:'3 × 1 min' },
      { id:'cog02', nombre:'Fluencia verbal por letra', desc:"Nombrar todos los animales que se le ocurran con una letra dada (ej: 'A' → águila, avestruz...).", dos:'2 × 2 min' },
      { id:'cog03', nombre:'Memoria de 5 objetos', desc:'Mostrar 5 objetos por 30 segundos, ocultarlos y pedir que los recuerde en orden.', dos:'3 intentos' },
      { id:'cog04', nombre:'Meses del año al revés', desc:'Recitar los meses de diciembre a enero sin ayuda. Luego los días de la semana.', dos:'3 vueltas' },
      { id:'cog05', nombre:'Cálculo mental simple', desc:'Dictar operaciones cortas en serie (5+3, 12-4, 6×2...) para responder en voz alta.', dos:'2 × 1 min' },
      { id:'cog06', nombre:'Asociaciones cruzadas', desc:"Completar frases tipo 'Si el sol fuera un animal sería...' con respuestas creativas.", dos:'2 × 5 ítems' },
    ],
  },
];

// ── RUTINA SUGERIDA POR DEFECTO ──────────────────────────────────────────
// ── RUTINA SUGERIDA POR DEFECTO ──────────────────────────────────────
const RUTINA_SUGERIDA_FISICA = ['f01','f05','f11','f06','f16','f20'];
const RUTINA_SUGERIDA_COG    = ['c01','c09','c05'];

// ── HELPER: key de sesión ────────────────────────────────────────────
function sessionKey(taller, fecha) { return `sesion||${taller}||${fecha}`; }

// ── COMPONENTE: EJERCICIO CARD ───────────────────────────────────────
function EjercicioCard({ ej, selected, onToggle, compact }) {
  return React.createElement('div', {
    onClick: () => onToggle(ej.id),
    style: {
      background: selected ? '#EBF4FF' : '#fff',
      border: `2px solid ${selected ? '#2E75B6' : '#E0E0E0'}`,
      borderRadius: 12, padding: compact ? '10px 12px' : '12px 14px',
      marginBottom: 8, cursor: 'pointer', transition: 'all .15s',
    }
  },
    React.createElement('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 10 } },
      React.createElement('div', {
        style: {
          width: 24, height: 24, borderRadius: '50%', flexShrink: 0, marginTop: 1,
          background: selected ? '#2E75B6' : '#E0E0E0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, color: '#fff', fontWeight: 800,
        }
      }, selected ? '✓' : ''),
      React.createElement('div', { style: { flex: 1 } },
        React.createElement('div', { style: { fontWeight: 700, fontSize: 14, color: selected ? '#1F3864' : '#222' } },
          ej.nombre),
        !compact && React.createElement('div', { style: { fontSize: 12, color: '#666', marginTop: 3, lineHeight: 1.4 } },
          ej.desc),
        React.createElement('div', { style: { display: 'flex', gap: 8, marginTop: 4 } },
          React.createElement('span', { style: { fontSize: 11, color: '#888' } }, `⏱ ${ej.min} min`),
          ej.mat && React.createElement('span', { style: { fontSize: 11, color: '#888' } }, `📦 ${ej.mat}`)
        )
      )
    )
  );
}

// ── COMPONENTE: HISTORIAL CARD ───────────────────────────────────────
function SesionHistorialCard({ sesion, onPress }) {
  const nFis = sesion.fisicos?.length || 0;
  const nCog = sesion.cognitivos?.length || 0;
  const durTotal = [...(sesion.fisicos||[]), ...(sesion.cognitivos||[])]
    .reduce((s, id) => {
      const ej = [...EJERCICIOS_FISICOS, ...EJERCICIOS_COGNITIVOS].find(e => e.id === id);
      return s + (ej?.min || 0);
    }, 0);

  return React.createElement('div', {
    style: {
      background: '#fff', borderRadius: 12, padding: '12px 14px',
      boxShadow: '0 2px 10px rgba(0,0,0,.07)', marginBottom: 8,
      cursor: onPress ? 'pointer' : 'default', borderLeft: '4px solid #2E75B6',
    },
    onClick: onPress
  },
    React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 6 } },
      React.createElement('div', { style: { fontWeight: 800, fontSize: 14 } }, formatDate(sesion.fecha)),
      React.createElement('div', { style: { fontSize: 12, color: '#888' } }, `~${durTotal} min`)
    ),
    React.createElement('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
      nFis > 0 && React.createElement('span', {
        style: { background: '#EBF4FF', color: '#2E75B6', borderRadius: 20,
                 padding: '3px 10px', fontSize: 12, fontWeight: 700 }
      }, `💪 ${nFis} físicos`),
      nCog > 0 && React.createElement('span', {
        style: { background: '#EDE0F7', color: '#7030A0', borderRadius: 20,
                 padding: '3px 10px', fontSize: 12, fontWeight: 700 }
      }, `🧠 ${nCog} cognitivos`),
      sesion.notas && React.createElement('span', {
        style: { background: '#FFF9E6', color: '#7A5C00', borderRadius: 20,
                 padding: '3px 10px', fontSize: 12 }
      }, '📝 Con notas')
    ),
    sesion.notas && React.createElement('div', {
      style: { marginTop: 6, fontSize: 12, color: '#555', fontStyle: 'italic',
               borderTop: '1px solid #f0f0f0', paddingTop: 6 }
    }, `"${sesion.notas.slice(0, 80)}${sesion.notas.length > 80 ? '...' : ''}"`)
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  VIEW: RUTINAS (Registro por Taller - Uso Personal)
// ═══════════════════════════════════════════════════════════════════════
function ViewRutinas({ sessionLog, setSessionLog, toast }) {
  const [tab, setTab]          = useState('registrar');
  const [selTaller, setTaller] = useState('');
  const [selFecha, setFecha]   = useState(todayISO());
  const [selTematica, setTema] = useState(null);
  const [notas, setNotas]      = useState('');
  const [detailSesion, setDetail] = useState(null);

  const currentKey = selTaller && selFecha ? `sesion||${selTaller}||${selFecha}` : null;

  // Cargar sesión existente si hay
  useEffect(() => {
    if (currentKey && sessionLog?.[currentKey]) {
      const ex = sessionLog[currentKey];
      setTema(TEMATICAS.find(t => t.id === ex.tematicaId) || null);
      setNotas(ex.notas || '');
    } else {
      setTema(null); setNotas('');
    }
  }, [selTaller, selFecha]);

  // Historial ordenado
  const historial = Object.values(sessionLog || {})
    .filter(s => s.tematicaId)
    .sort((a,b) => b.fecha.localeCompare(a.fecha));

  // ¿Qué temática usó cada taller la última vez?
  const ultimaTemPorTaller = {};
  historial.forEach(s => {
    if (!ultimaTemPorTaller[s.taller]) ultimaTemPorTaller[s.taller] = s.tematicaId;
  });

  // ¿Cuántas veces usó cada temática este taller?
  function usosPorTaller(tallerId) {
    return historial
      .filter(s => s.taller === tallerId)
      .map(s => s.tematicaId);
  }

  function guardar() {
    if (!selTaller || !selFecha || !selTematica) {
      toast('❌ Selecciona taller, fecha y temática'); return;
    }
    const next = { ...(sessionLog||{}), [currentKey]: {
      taller: selTaller, fecha: selFecha,
      tematicaId: selTematica.id,
      tematicaNombre: selTematica.nombre,
      notas, savedAt: new Date().toISOString()
    }};
    setSessionLog(next); DB.set('sessionLog', next);
    toast(`💾 Sesión guardada — ${selTematica.icon} ${selTematica.nombre}`);
    setTab('historial');
  }

  // ── TAB: REGISTRAR ───────────────────────────────────────────────────
  const tabRegistrar = React.createElement('div', null,

    // Selector taller + fecha
    React.createElement('div', { className:'card' },
      React.createElement('div', { className:'card-title' }, '📅 Sesión nueva'),
      React.createElement(Field, { label:'Taller / Club' },
        React.createElement('select', { value:selTaller, onChange:e=>setTaller(e.target.value) },
          React.createElement('option', { value:'' }, '— Selecciona el taller —'),
          TALLERES.map(t => React.createElement('option', { key:t, value:t }, t))
        )
      ),
      React.createElement(Field, { label:'Fecha' },
        React.createElement('input', { type:'date', value:selFecha,
          onChange:e=>setFecha(e.target.value) })
      ),
      // Aviso de última temática usada en este taller
      selTaller && ultimaTemPorTaller[selTaller] && React.createElement('div', {
        style:{ background:'#FFF9E6', borderRadius:10, padding:'8px 12px',
                fontSize:13, color:'#7A5C00', lineHeight:1.5 }
      },
        `⚠️ Última temática en este taller: `,
        React.createElement('strong', null,
          TEMATICAS.find(t=>t.id===ultimaTemPorTaller[selTaller])?.nombre || '—')
      )
    ),

    // Selector temática
    selTaller && React.createElement('div', { className:'card' },
      React.createElement('div', { className:'card-title' }, '📋 Selecciona la temática de hoy'),
      React.createElement('p', { style:{ fontSize:13, color:'#777', marginBottom:12, lineHeight:1.5 } },
        'El historial muestra cuántas veces usaste cada temática en este taller.'),

      TEMATICAS.map(t => {
        const usos = usosPorTaller(selTaller).filter(id => id===t.id).length;
        const esUltima = ultimaTemPorTaller[selTaller] === t.id;
        const seleccionada = selTematica?.id === t.id;
        return React.createElement('div', {
          key: t.id,
          onClick: () => setTema(t),
          style:{
            display:'flex', alignItems:'center', gap:12,
            padding:'12px 14px', marginBottom:8, borderRadius:12,
            border:`2px solid ${seleccionada ? t.color : esUltima ? '#FFD966' : '#E0E0E0'}`,
            background: seleccionada ? t.color+'15' : esUltima ? '#FFF9E6' : '#fff',
            cursor:'pointer', transition:'all .15s',
          }
        },
          React.createElement('div', { style:{
            fontSize:28, width:44, textAlign:'center', flexShrink:0
          } }, t.icon),
          React.createElement('div', { style:{ flex:1 } },
            React.createElement('div', { style:{
              fontWeight:800, fontSize:14,
              color: seleccionada ? t.color : '#222'
            } }, t.nombre),
            React.createElement('div', { style:{ fontSize:12, color:'#888', marginTop:2 } },
              t.objetivo.slice(0,60)+'...')
          ),
          React.createElement('div', { style:{ textAlign:'right', flexShrink:0 } },
            React.createElement('div', { style:{
              fontWeight:800, fontSize:16,
              color: usos === 0 ? '#375623' : usos >= 3 ? '#C00000' : '#ED7D31'
            } }, usos),
            React.createElement('div', { style:{ fontSize:10, color:'#888' } }, 'veces'),
            esUltima && React.createElement('div', { style:{
              fontSize:10, color:'#7A5C00', fontWeight:700, marginTop:2
            } }, '⚠️ última')
          )
        );
      })
    ),

    // Preview temática seleccionada
    selTematica && React.createElement('div', { style:{
      background: selTematica.color+'15',
      border:`2px solid ${selTematica.color}`,
      borderRadius:14, padding:'14px 16px', marginBottom:12
    } },
      React.createElement('div', { style:{ fontWeight:900, fontSize:16,
        color:selTematica.color, marginBottom:8 } },
        `${selTematica.icon} ${selTematica.nombre}`),
      React.createElement('div', { style:{ fontSize:13, color:'#555',
        marginBottom:10, lineHeight:1.5 } }, selTematica.objetivo),

      // Píldora educativa
      React.createElement('div', { style:{
        background:'#fff', borderRadius:10, padding:'8px 12px',
        marginBottom:10, fontSize:12, color:'#555', lineHeight:1.5
      } },
        React.createElement('span', { style:{ fontWeight:800, color:'#E67E22' } }, '💊 Píldora: '),
        selTematica.pildora
      ),

      // Ejercicios
      React.createElement('div', { style:{ marginBottom:8 } },
        React.createElement('div', { style:{ fontWeight:800, fontSize:13,
          color:selTematica.color, marginBottom:6 } }, '💪 Ejercicios:'),
        selTematica.ejercicios.map(ej => React.createElement('div', { key:ej.id,
          style:{ padding:'6px 0', borderBottom:'1px solid rgba(0,0,0,.05)',
                  fontSize:13 }
        },
          React.createElement('div', { style:{ fontWeight:700 } }, ej.nombre),
          React.createElement('div', { style:{ fontSize:12, color:'#888',
            display:'flex', justifyContent:'space-between', marginTop:2 } },
            React.createElement('span', null, ej.desc.slice(0,50)+'...'),
            React.createElement('span', { style:{ color:selTematica.color,
              fontWeight:700, flexShrink:0, marginLeft:8 } }, ej.dos)
          )
        ))
      ),

      // Doble tarea
      React.createElement('div', { style:{
        background:'#7D3C98'+'20', borderRadius:10, padding:'8px 12px', fontSize:13
      } },
        React.createElement('span', { style:{ fontWeight:800, color:'#7D3C98' } }, '🧠 Doble tarea: '),
        selTematica.doble_tarea
      )
    ),

    // Notas
    selTematica && React.createElement(Field, { label:'📝 Notas de sesión (opcional)' },
      React.createElement('textarea', {
        value:notas, onChange:e=>setNotas(e.target.value),
        placeholder:'Observaciones del grupo, dificultades, logros...',
        style:{ minHeight:70, resize:'none' }
      })
    ),

    // Guardar
    selTematica && selTaller && React.createElement('button', {
      className:'btn btn-green', onClick:guardar
    }, `💾 Registrar — ${selTematica.icon} ${selTematica.nombre}`)
  );

  // ── TAB: HISTORIAL ───────────────────────────────────────────────────
  const tabHistorial = React.createElement('div', null,
    // Resumen por taller
    React.createElement('div', { className:'card' },
      React.createElement('div', { className:'card-title' }, '📊 Última temática por taller'),
      TALLERES.filter(t => ultimaTemPorTaller[t]).map(t => {
        const tem = TEMATICAS.find(x => x.id===ultimaTemPorTaller[t]);
        if (!tem) return null;
        return React.createElement('div', { key:t, style:{
          display:'flex', justifyContent:'space-between', alignItems:'center',
          padding:'8px 0', borderBottom:'1px solid #f0f0f0', fontSize:13
        } },
          React.createElement('span', { style:{ color:'#555' } }, t),
          React.createElement('span', { style:{
            background:tem.color+'20', color:tem.color,
            borderRadius:20, padding:'3px 10px', fontSize:12, fontWeight:700
          } }, `${tem.icon} ${tem.nombre}`)
        );
      })
    ),

    // Lista historial
    historial.length === 0
      ? React.createElement('div', { className:'empty-state' },
          React.createElement('div', { className:'emoji' }, '📚'),
          React.createElement('p', null, 'No hay sesiones registradas aún'))
      : historial.map((s,i) => {
          const tem = TEMATICAS.find(t => t.id===s.tematicaId);
          return React.createElement('div', { key:i,
            style:{
              background:'#fff', borderRadius:12, padding:'12px 14px',
              marginBottom:8, boxShadow:'0 2px 8px rgba(0,0,0,.06)',
              borderLeft:`4px solid ${tem?.color||'#ccc'}`,
              cursor:'pointer'
            },
            onClick:()=>setDetail(s)
          },
            React.createElement('div', { style:{
              display:'flex', justifyContent:'space-between', marginBottom:4
            } },
              React.createElement('div', { style:{ fontWeight:800, fontSize:14 } },
                `${tem?.icon||''} ${tem?.nombre||s.tematicaNombre}`),
              React.createElement('div', { style:{ fontSize:12, color:'#888' } },
                formatDate(s.fecha))
            ),
            React.createElement('div', { style:{ fontSize:12, color:'#777' } }, s.taller),
            s.notas && React.createElement('div', { style:{
              fontSize:12, color:'#555', marginTop:4, fontStyle:'italic'
            } }, `"${s.notas.slice(0,60)}${s.notas.length>60?'...':''}"`
            )
          );
        }),

    // Detail modal
    detailSesion && (() => {
      const tem = TEMATICAS.find(t => t.id===detailSesion.tematicaId);
      return React.createElement('div', { className:'overlay',
        onClick:e=>{ if(e.target===e.currentTarget) setDetail(null); }
      },
        React.createElement('div', { className:'sheet' },
          React.createElement('div', { className:'sheet-handle' }),
          React.createElement('div', { style:{
            fontWeight:900, fontSize:17, marginBottom:2,
            color:tem?.color||'#333'
          } }, `${tem?.icon||''} ${tem?.nombre||detailSesion.tematicaNombre}`),
          React.createElement('div', { style:{ fontSize:13, color:'#777', marginBottom:12 } },
            `${detailSesion.taller} · ${formatDate(detailSesion.fecha)}`),

          // Ejercicios
          tem?.ejercicios.map(ej => React.createElement('div', { key:ej.id,
            style:{ padding:'8px 0', borderBottom:'1px solid #f0f0f0', fontSize:13 }
          },
            React.createElement('div', { style:{ fontWeight:700 } }, ej.nombre),
            React.createElement('div', { style:{ fontSize:12, color:'#888',
              display:'flex', justifyContent:'space-between', marginTop:2 } },
              React.createElement('span', null, ej.desc),
              React.createElement('span', { style:{ color:tem.color, fontWeight:700 } }, ej.dos)
            )
          )),

          detailSesion.notas && React.createElement('div', { style:{
            marginTop:10, background:'#FFF9E6', borderRadius:10,
            padding:'10px 12px', fontSize:13, color:'#555'
          } },
            React.createElement('strong', null, '📝 Notas: '),
            detailSesion.notas
          ),

          React.createElement('button', { className:'btn btn-ghost',
            style:{ marginTop:14 }, onClick:()=>setDetail(null) }, 'Cerrar')
        )
      );
    })()
  );

  return React.createElement('div', { className:'page' },
    React.createElement('div', { className:'tabs' },
      [['registrar','📝 Registrar'],['historial','📚 Historial']]
        .map(([v,l]) => React.createElement('div', { key:v,
          className:`tab ${tab===v?'active':''}`, onClick:()=>setTab(v) }, l))
    ),
    tab==='registrar' ? tabRegistrar : tabHistorial
  );
}


// ═══════════════════════════════════════════════════════════════════════
//  MÓDULO REM + AGENDA DUPLAS
// ═══════════════════════════════════════════════════════════════════════

// ── DATOS BASE DUPLAS (del Excel CICLOS) ─────────────────────────────
const DUPLAS_DEFAULT = [
  { nombre: 'DANIEL',  color: '#C00000' },
  { nombre: 'SILVANA', color: '#2E75B6' },
  { nombre: 'JORGE',   color: '#375623' },
  { nombre: 'ANITA',   color: '#7030A0' },
  { nombre: 'GONZALO', color: '#ED7D31' },
];

const DIAS_SEMANA = ['Lunes','Martes','Miércoles','Jueves','Viernes'];

const MESES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// ── REM — CÓDIGOS PRESTACIONES ────────────────────────────────────────
// Basado en orientaciones técnicas MINSAL MAS AMA
const REM_PRESTACIONES = {
  ingreso_taller:    { codigo:'P4311', nombre:'Ingreso programa MAS AMA (Taller)', grupo:'Ingresos' },
  sesion_taller:     { codigo:'P4312', nombre:'Sesión taller estimulación funcional', grupo:'Sesiones' },
  egreso_completo:   { codigo:'P4313', nombre:'Egreso completa ciclo', grupo:'Egresos' },
  egreso_abandono:   { codigo:'P4314', nombre:'Egreso por abandono', grupo:'Egresos' },
  seguimiento_tel:   { codigo:'P4315', nombre:'Seguimiento telefónico (Manual)', grupo:'Seguimientos' },
  egreso_manual:     { codigo:'P4316', nombre:'Egreso Manual de Estimulación', grupo:'Egresos' },
  eval_cognitiva:    { codigo:'P4317', nombre:'Evaluación cognitiva (MOCA/RUDAS)', grupo:'Evaluaciones' },
  consejeria:        { codigo:'P4318', nombre:'Consejería individual activ. física', grupo:'Consejerías' },
};

// ── CALCULAR REM ───────────────────────────────────────────────────────
function calcularREM(patients, attendanceLog, mes) {
  // mes = "2026-04"
  const [anio, mesN] = mes.split('-').map(Number);

  // Asistencias del mes
  const attDelMes = Object.entries(attendanceLog).filter(([k]) => k.startsWith(mes));
  const presentes = attDelMes.filter(([, v]) => v === 'P');
  const ausentes  = attDelMes.filter(([, v]) => v === 'A');

  // Sesiones únicas del mes (por taller+fecha)
  const sesionesUnicas = new Set(
    attDelMes.map(([k]) => { const [f,,t] = k.split('||'); return `${f}||${t}`; })
  );

  // Pacientes en taller
  const enTaller  = patients.filter(p => p.estado === 'TALLER');
  const enManual  = patients.filter(p => p.estado === 'MANUAL +');
  const nuevos    = patients.filter(p => {
    if (!p.createdAt) return false;
    const d = new Date(p.createdAt);
    return d.getFullYear() === anio && (d.getMonth()+1) === mesN;
  });
  const egresos   = patients.filter(p =>
    p.estado === 'EGRESO' && p.ciclo
  );
  const abandonos = patients.filter(p => p.estado === 'RECHAZA');

  // Por taller
  const porTaller = {};
  enTaller.forEach(p => {
    if (!p.taller) return;
    if (!porTaller[p.taller]) porTaller[p.taller] = { pac: 0, pres: 0 };
    porTaller[p.taller].pac++;
  });
  presentes.forEach(([k]) => {
    const [, taller] = k.split('||');
    if (porTaller[taller]) porTaller[taller].pres++;
  });

  // Sexo
  const mujeres = enTaller.filter(p => p.sexo === 'M').length;
  const hombres = enTaller.filter(p => p.sexo === 'H').length;

  // Rango etario
  const rangos = {'60-64':0,'65-69':0,'70-74':0,'75-79':0,'80+':0};
  enTaller.forEach(p => {
    const e = Number(p.edad);
    if (e>=60&&e<=64) rangos['60-64']++;
    else if (e>=65&&e<=69) rangos['65-69']++;
    else if (e>=70&&e<=74) rangos['70-74']++;
    else if (e>=75&&e<=79) rangos['75-79']++;
    else if (e>=80) rangos['80+']++;
  });

  return {
    mes, anio, mesN,
    totalPacientes:    enTaller.length,
    nuevosIngreso:     nuevos.length,
    enManual:          enManual.length,
    egresos:           egresos.length,
    abandonos:         abandonos.length,
    sesionesRealizadas:sesionesUnicas.size,
    totalPresencias:   presentes.length,
    totalAusencias:    ausentes.length,
    pctAsistencia:     presentes.length > 0
      ? Math.round(presentes.length / (presentes.length + ausentes.length) * 100) : 0,
    mujeres, hombres,
    rangos, porTaller,
  };
}

// ── VIEW: REM ─────────────────────────────────────────────────────────
function ViewREM({ patients, attendanceLog, toast }) {
  const [mes, setMes]     = useState(new Date().toISOString().slice(0,7));
  const [copied, setCopied] = useState(false);

  const rem = calcularREM(patients, attendanceLog, mes);
  const [anio, mesN] = mes.split('-').map(Number);
  const mesLabel = `${MESES_ES[mesN-1]} ${anio}`;

  function copyREM() {
    const texto = generarTextoREM(rem, mesLabel);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(texto).then(() => {
        setCopied(true); setTimeout(() => setCopied(false), 2000);
        toast('✅ REM copiado — pega en el documento de tu jefa');
      });
    }
  }

  function generarTextoREM(r, label) {
    const lines = [
      `═══════════════════════════════`,
      `REPORTE REM — PROGRAMA MAS AMA`,
      `${label} · CESFAM Félix de Amesti`,
      `═══════════════════════════════`,
      ``,
      `COBERTURA`,
      `Total pacientes activos:  ${r.totalPacientes}`,
      `Nuevos ingresos del mes:  ${r.nuevosIngreso}`,
      `Pacientes con Manual:     ${r.enManual}`,
      `Egresos completos ciclo:  ${r.egresos}`,
      `Abandonos:                ${r.abandonos}`,
      ``,
      `SESIONES`,
      `Sesiones realizadas:      ${r.sesionesRealizadas}`,
      `Total presencias:         ${r.totalPresencias}`,
      `Total ausencias:          ${r.totalAusencias}`,
      `% Asistencia global:      ${r.pctAsistencia}%`,
      ``,
      `DISTRIBUCIÓN POR SEXO`,
      `Mujeres:  ${r.mujeres} (${r.totalPacientes ? Math.round(r.mujeres/r.totalPacientes*100) : 0}%)`,
      `Hombres:  ${r.hombres} (${r.totalPacientes ? Math.round(r.hombres/r.totalPacientes*100) : 0}%)`,
      ``,
      `DISTRIBUCIÓN POR EDAD`,
      ...Object.entries(r.rangos).map(([k,v]) => `${k} años:  ${v} pacientes`),
      ``,
      `ASISTENCIA POR TALLER`,
      ...Object.entries(r.porTaller).map(([t,s]) =>
        `${t}: ${s.pac} pacientes · ${s.pres} presencias`),
      ``,
      `Generado con MAS AMA Pro · ${new Date().toLocaleDateString('es-CL')}`,
    ];
    return lines.join('\n');
  }

  const kpiStyle = (color) => ({
    background: '#fff', borderRadius: 12, padding: '14px 12px',
    boxShadow: '0 2px 10px rgba(0,0,0,.07)', borderLeft: `4px solid ${color}`
  });

  return React.createElement('div', { className: 'page' },
    // Cabecera
    React.createElement('div', { style: { background: '#1F3864', borderRadius: 12,
      padding: '14px 16px', marginBottom: 14 } },
      React.createElement('div', { style: { color: '#00B0F0', fontWeight: 900, fontSize: 14, marginBottom: 2 } },
        '📊 GENERADOR REM'),
      React.createElement('div', { style: { color: 'rgba(255,255,255,.8)', fontSize: 13, lineHeight: 1.5 } },
        'Datos calculados automáticamente. Copia y pega en el documento de tu jefa o en el sistema REM.')
    ),

    // Selector de mes
    React.createElement('div', { className: 'card' },
      React.createElement(Field, { label: 'Mes del reporte' },
        React.createElement('input', { type: 'month', value: mes, onChange: e => setMes(e.target.value) })
      ),
      React.createElement('div', { style: { fontSize: 14, fontWeight: 800, color: '#1F3864', marginBottom: 4 } },
        `Reporte: ${mesLabel}`),
      React.createElement('div', { style: { fontSize: 12, color: '#888' } },
        'Los datos se calculan en base a la asistencia registrada en la app y los datos de pacientes.')
    ),

    // KPIs principales
    React.createElement('div', { className: 'kpi-grid', style: { marginBottom: 12 } },
      React.createElement('div', { style: kpiStyle('#2E75B6') },
        React.createElement('div', { className: 'kpi-val', style: { color: '#2E75B6' } }, rem.totalPacientes),
        React.createElement('div', { className: 'kpi-lbl' }, 'Pacientes Activos')),
      React.createElement('div', { style: kpiStyle('#375623') },
        React.createElement('div', { className: 'kpi-val', style: { color: '#375623' } }, rem.nuevosIngreso),
        React.createElement('div', { className: 'kpi-lbl' }, 'Nuevos Ingresos')),
      React.createElement('div', { style: kpiStyle('#00B0F0') },
        React.createElement('div', { className: 'kpi-val', style: { color: '#00B0F0' } }, rem.sesionesRealizadas),
        React.createElement('div', { className: 'kpi-lbl' }, 'Sesiones Realizadas')),
      React.createElement('div', { style: kpiStyle(rem.pctAsistencia >= 75 ? '#375623' : '#C00000') },
        React.createElement('div', { className: 'kpi-val',
          style: { color: rem.pctAsistencia >= 75 ? '#375623' : '#C00000' } }, `${rem.pctAsistencia}%`),
        React.createElement('div', { className: 'kpi-lbl' }, '% Asistencia'))
    ),

    // Detalle presencias
    React.createElement('div', { className: 'card' },
      React.createElement('div', { className: 'card-title' }, '📋 Detalle de Atenciones'),
      [
        ['Nuevos ingresos al programa', rem.nuevosIngreso, '#375623'],
        ['Sesiones de taller realizadas', rem.sesionesRealizadas, '#2E75B6'],
        ['Total presencias registradas', rem.totalPresencias, '#00B0F0'],
        ['Total ausencias', rem.totalAusencias, '#888'],
        ['Pacientes con Manual de Estimulación', rem.enManual, '#7030A0'],
        ['Egresos completos del ciclo', rem.egresos, '#ED7D31'],
        ['Abandonos', rem.abandonos, '#C00000'],
      ].map(([label, val, color]) =>
        React.createElement('div', { key: label, style: {
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '9px 0', borderBottom: '1px solid #f0f0f0'
        } },
          React.createElement('span', { style: { fontSize: 14, color: '#444' } }, label),
          React.createElement('span', { style: { fontWeight: 900, fontSize: 16, color } }, val)
        )
      )
    ),

    // Sexo
    React.createElement('div', { className: 'card' },
      React.createElement('div', { className: 'card-title' }, '👥 Distribución por Sexo'),
      React.createElement('div', { style: { display: 'flex', gap: 10 } },
        React.createElement('div', { style: { flex: 1, background: '#EDE0F7', borderRadius: 10,
          padding: 12, textAlign: 'center' } },
          React.createElement('div', { style: { fontSize: 28, fontWeight: 900, color: '#7030A0' } }, rem.mujeres),
          React.createElement('div', { style: { fontSize: 12, color: '#7030A0', fontWeight: 700 } }, '♀ Mujeres')
        ),
        React.createElement('div', { style: { flex: 1, background: '#DDEEFF', borderRadius: 10,
          padding: 12, textAlign: 'center' } },
          React.createElement('div', { style: { fontSize: 28, fontWeight: 900, color: '#2E75B6' } }, rem.hombres),
          React.createElement('div', { style: { fontSize: 12, color: '#2E75B6', fontWeight: 700 } }, '♂ Hombres')
        )
      )
    ),

    // Rangos etarios
    React.createElement('div', { className: 'card' },
      React.createElement('div', { className: 'card-title' }, '🎂 Distribución por Edad'),
      Object.entries(rem.rangos).map(([rango, n]) =>
        React.createElement('div', { key: rango, style: {
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '6px 0', borderBottom: '1px solid #f0f0f0'
        } },
          React.createElement('div', { style: { width: 60, fontSize: 13, fontWeight: 700, color: '#555' } }, rango),
          React.createElement('div', { style: { flex: 1, height: 10, background: '#EEF2F7', borderRadius: 5, overflow: 'hidden' } },
            React.createElement('div', { style: {
              height: '100%', borderRadius: 5, background: '#7030A0',
              width: `${rem.totalPacientes ? Math.round(n/rem.totalPacientes*100) : 0}%`
            } })
          ),
          React.createElement('div', { style: { width: 28, textAlign: 'right', fontWeight: 800, fontSize: 14 } }, n)
        )
      )
    ),

    // Por taller
    Object.keys(rem.porTaller).length > 0 && React.createElement('div', { className: 'card' },
      React.createElement('div', { className: 'card-title' }, '🏃 Asistencia por Taller'),
      Object.entries(rem.porTaller).map(([taller, s]) =>
        React.createElement('div', { key: taller, style: {
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '8px 0', borderBottom: '1px solid #f0f0f0'
        } },
          React.createElement('div', null,
            React.createElement('div', { style: { fontWeight: 700, fontSize: 13 } }, taller),
            React.createElement('div', { style: { fontSize: 11, color: '#888' } }, `${s.pac} pacientes`)
          ),
          React.createElement('div', { style: { textAlign: 'right' } },
            React.createElement('div', { style: { fontWeight: 900, fontSize: 15, color: '#2E75B6' } },
              `${s.pres} pres.`),
            React.createElement('div', { style: { fontSize: 11, color: '#888' } },
              s.pac > 0 ? `${Math.round(s.pres/s.pac*100)}%` : '—')
          )
        )
      )
    ),

    // Nota importante
    React.createElement('div', { style: { background: '#FFF9E6', border: '1.5px solid #FFD966',
      borderRadius: 12, padding: 14, marginBottom: 14 } },
      React.createElement('div', { style: { fontWeight: 800, fontSize: 13, marginBottom: 6 } },
        '⚠️ Importante antes de enviar'),
      React.createElement('div', { style: { fontSize: 13, color: '#555', lineHeight: 1.6 } },
        'Verifica que la asistencia del mes esté completamente registrada en la app antes de copiar el REM. ' +
        'Compara sesiones realizadas vs sesiones esperadas según tu calendario.')
    ),

    // Botón copiar
    React.createElement('button', {
      className: `btn ${copied ? 'btn-ghost' : 'btn-primary'}`,
      style: { marginBottom: 8 },
      onClick: copyREM
    }, copied ? '✅ ¡REM copiado!' : '📋 Copiar REM completo'),

    rem.totalPresencias === 0 && React.createElement('div', { style: {
      background: '#FFF0F0', borderRadius: 10, padding: 12, fontSize: 13, color: '#C00000'
    } },
      '⚠️ No hay asistencia registrada para este mes. Marca las listas primero en la sección Lista.')
  );
}

// ═══════════════════════════════════════════════════════════════════════
//  VIEW: AGENDA DE DUPLAS
// ═══════════════════════════════════════════════════════════════════════
function ViewAgenda({ toast }) {
  const [agenda, setAgenda]       = useState(() => DB.get('agendaDuplas', {}));
  const [duplas, setDuplas]       = useState(() => DB.get('agendaDuplasPersonas', DUPLAS_DEFAULT));
  const [semana, setSemana]       = useState(() => getISOWeek(new Date()));
  const [editMode, setEdit]       = useState(false);
  const [editCell, setEditCell]   = useState(null); // {dia, turno}
  const [showConfig, setConfig]   = useState(false);
  const [newDupla, setNewDupla]   = useState('');

  // Semana actual como label
  function getISOWeek(date) {
    const d = new Date(date);
    const day = d.getDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    return `${d.getUTCFullYear()}-W${String(Math.ceil((((d-yearStart)/86400000)+1)/7)).padStart(2,'0')}`;
  }

  function semanaLabel(isoWeek) {
    const [y, w] = isoWeek.split('-W').map(Number);
    const jan4 = new Date(y, 0, 4);
    const dayOfWeek = jan4.getDay() || 7;
    const weekStart = new Date(jan4);
    weekStart.setDate(jan4.getDate() - dayOfWeek + 1 + (w-1)*7);
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate()+4);
    return `${weekStart.getDate()} - ${weekEnd.getDate()} ${MESES_ES[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`;
  }

  function changeSemana(delta) {
    const [y, w] = semana.split('-W').map(Number);
    let newW = w + delta;
    let newY = y;
    if (newW > 52) { newW = 1; newY++; }
    if (newW < 1)  { newW = 52; newY--; }
    setSemana(`${newY}-W${String(newW).padStart(2,'0')}`);
  }

  const agendaKey = (dia, turno) => `${semana}||${dia}||${turno}`;

  function getCell(dia, turno) {
    return (agenda[agendaKey(dia, turno)] || { dupla1: '', dupla2: '', taller: '', hora: '' });
  }

  function setCell(dia, turno, val) {
    const next = { ...agenda, [agendaKey(dia, turno)]: val };
    setAgenda(next); DB.set('agendaDuplas', next);
  }

  function addDupla() {
    if (!newDupla.trim()) return;
    const colors = ['#C00000','#1F3864','#00B0F0','#375623','#ED7D31','#7030A0'];
    const next = [...duplas, { nombre: newDupla.trim().toUpperCase(),
                               color: colors[duplas.length % colors.length] }];
    setDuplas(next); DB.set('agendaDuplasPersonas', next);
    setNewDupla(''); toast(`✅ ${newDupla} agregado`);
  }

  function removeDupla(i) {
    const next = duplas.filter((_,j) => j!==i);
    setDuplas(next); DB.set('agendaDuplasPersonas', next);
  }

  const TURNOS = [
    { id: 'AM', label: '☀️ AM', color: '#2E75B6' },
    { id: 'PM', label: '🌙 PM', color: '#7030A0' },
  ];

  // Edit cell modal
  function EditModal({ dia, turno, onClose }) {
    const current = getCell(dia, turno);
    const [form, setForm] = useState({ ...current });
    function save() {
      setCell(dia, turno, form);
      toast('✅ Agenda actualizada');
      onClose();
    }
    return React.createElement('div', { className: 'overlay',
      onClick: e => { if(e.target===e.currentTarget) onClose(); }
    },
      React.createElement('div', { className: 'sheet' },
        React.createElement('div', { className: 'sheet-handle' }),
        React.createElement('div', { style: { fontWeight: 900, fontSize: 17, marginBottom: 14 } },
          `${dia} ${turno === 'AM' ? '☀️ Mañana' : '🌙 Tarde'}`),
        React.createElement(Field, { label: 'Taller / Lugar' },
          React.createElement('select', {
            value: form.taller || '',
            onChange: e => setForm(f => ({ ...f, taller: e.target.value }))
          },
            React.createElement('option', { value: '' }, '— Sin taller —'),
            TALLERES.map(t => React.createElement('option', { key: t, value: t }, t))
          )
        ),
        React.createElement(Field, { label: 'Hora' },
          React.createElement('input', { type: 'time', value: form.hora || '',
            onChange: e => setForm(f => ({ ...f, hora: e.target.value })) })
        ),
        React.createElement(Field, { label: 'Integrante 1' },
          React.createElement('select', {
            value: form.dupla1 || '',
            onChange: e => setForm(f => ({ ...f, dupla1: e.target.value }))
          },
            React.createElement('option', { value: '' }, '— Seleccionar —'),
            duplas.map(d => React.createElement('option', { key: d.nombre, value: d.nombre }, d.nombre))
          )
        ),
        React.createElement(Field, { label: 'Integrante 2' },
          React.createElement('select', {
            value: form.dupla2 || '',
            onChange: e => setForm(f => ({ ...f, dupla2: e.target.value }))
          },
            React.createElement('option', { value: '' }, '— Seleccionar —'),
            duplas.map(d => React.createElement('option', { key: d.nombre, value: d.nombre }, d.nombre))
          )
        ),
        React.createElement(Field, { label: 'Notas' },
          React.createElement('input', { type: 'text', value: form.notas || '',
            placeholder: 'Observaciones opcionales...',
            onChange: e => setForm(f => ({ ...f, notas: e.target.value })) })
        ),
        React.createElement('div', { className: 'btn-row', style: { marginTop: 14 } },
          React.createElement('button', { className: 'btn btn-ghost', style: { flex: 1 }, onClick: onClose }, 'Cancelar'),
          React.createElement('button', { className: 'btn btn-primary', style: { flex: 2 }, onClick: save }, '💾 Guardar')
        )
      )
    );
  }

  // Config modal — gestionar integrantes del equipo
  function ConfigModal({ onClose }) {
    return React.createElement('div', { className: 'overlay',
      onClick: e => { if(e.target===e.currentTarget) onClose(); }
    },
      React.createElement('div', { className: 'sheet' },
        React.createElement('div', { className: 'sheet-handle' }),
        React.createElement('div', { style: { fontWeight: 900, fontSize: 17, marginBottom: 14 } },
          '👥 Equipo MAS AMA — Agregar Profesional'),
        React.createElement('div', { className: 'card-title' }, 'Integrantes del equipo'),
        React.createElement('div', { style: { fontSize: 13, color: '#777', marginBottom: 10, lineHeight: 1.5 } },
          'Agrega o quita profesionales del equipo. Aparecerán en el selector de duplas.'),
        duplas.map((d, i) =>
          React.createElement('div', { key: i, style: {
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 0', borderBottom: '1px solid #f0f0f0'
          } },
            React.createElement('div', { style: {
              width: 32, height: 32, borderRadius: '50%', background: d.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 800, fontSize: 13
            } }, d.nombre[0]),
            React.createElement('span', { style: { flex: 1, fontWeight: 700 } }, d.nombre),
            React.createElement('button', {
              onClick: () => removeDupla(i),
              style: { background: '#FFF0F0', color: '#C00000', border: 'none',
                       borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }
            }, 'Quitar')
          )
        ),
        React.createElement('div', { style: { display: 'flex', gap: 8, marginTop: 14 } },
          React.createElement('input', {
            type: 'text', placeholder: 'Nombre del integrante',
            value: newDupla, onChange: e => setNewDupla(e.target.value),
            style: { flex: 1, padding: '11px 14px', border: '1.5px solid #E0E0E0',
                     borderRadius: 12, fontSize: 14, outline: 'none' },
            onKeyDown: e => e.key === 'Enter' && addDupla()
          }),
          React.createElement('button', {
            className: 'btn btn-primary btn-sm', style: { width: 'auto', flex: 'none' },
            onClick: addDupla
          }, '+ Agregar')
        ),
        React.createElement('button', {
          className: 'btn btn-ghost btn-sm',
          style: { marginTop: 8, fontSize: 12 },
          onClick: () => {
            setDuplas(DUPLAS_DEFAULT);
            DB.set('agendaDuplasPersonas', DUPLAS_DEFAULT);
            toast('✅ Equipo restaurado con todos los integrantes');
          }
        }, '🔄 Restaurar equipo completo (Daniel, Silvana, Jorge, Anita, Gonzalo)'),
        React.createElement('button', { className: 'btn btn-ghost', style: { marginTop: 14 },
          onClick: onClose }, 'Cerrar')
      )
    );
  }

  return React.createElement('div', { className: 'page' },
    // Header
    React.createElement('div', { style: { background: '#1F3864', borderRadius: 12,
      padding: '12px 14px', marginBottom: 14 } },
      React.createElement('div', { style: { color: '#00B0F0', fontWeight: 900, fontSize: 14, marginBottom: 2 } },
        '📅 AGENDA DE DUPLAS'),
      React.createElement('div', { style: { color: 'rgba(255,255,255,.8)', fontSize: 13 } },
        'Organiza quién va a qué taller cada semana.')
    ),

    // Semana navigator
    React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 } },
      React.createElement('button', {
        onClick: () => changeSemana(-1),
        style: { background: '#fff', border: '1.5px solid #E0E0E0', borderRadius: 10,
                 padding: '10px 14px', fontSize: 16, cursor: 'pointer', fontWeight: 700 }
      }, '←'),
      React.createElement('div', { style: { flex: 1, background: '#fff', borderRadius: 10,
        padding: '10px 12px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,.07)' } },
        React.createElement('div', { style: { fontWeight: 800, fontSize: 14 } }, semanaLabel(semana)),
        React.createElement('div', { style: { fontSize: 11, color: '#888', marginTop: 2 } }, semana)
      ),
      React.createElement('button', {
        onClick: () => changeSemana(1),
        style: { background: '#fff', border: '1.5px solid #E0E0E0', borderRadius: 10,
                 padding: '10px 14px', fontSize: 16, cursor: 'pointer', fontWeight: 700 }
      }, '→')
    ),

    // Semana actual button
    React.createElement('div', { style: { display: 'flex', gap: 8, marginBottom: 14 } },
      React.createElement('button', {
        className: 'btn btn-ghost btn-sm', style: { flex: 1 },
        onClick: () => setSemana(getISOWeek(new Date()))
      }, '📅 Esta semana'),
      React.createElement('button', {
        className: 'btn btn-ghost btn-sm', style: { flex: 1 },
        onClick: () => setConfig(true)
      }, '👥 Equipo / Agregar Profesional')
    ),

    // Equipo chips
    duplas.length > 0 && React.createElement('div', { style: {
      display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12
    } },
      duplas.map(d => React.createElement('span', { key: d.nombre, style: {
        background: d.color, color: '#fff', borderRadius: 20,
        padding: '4px 12px', fontSize: 12, fontWeight: 700
      } }, d.nombre))
    ),

    // Tabla de agenda — un día por día
    DIAS_SEMANA.map(dia =>
      React.createElement('div', { key: dia, className: 'card', style: { marginBottom: 10, padding: '12px 14px' } },
        React.createElement('div', { style: { fontWeight: 800, fontSize: 15, color: '#1F3864',
          marginBottom: 10, borderBottom: '2px solid #EEF2F7', paddingBottom: 8 } }, dia),
        TURNOS.map(turno => {
          const cell = getCell(dia, turno.id);
          const hasData = cell.taller || cell.dupla1;
          return React.createElement('div', { key: turno.id,
            style: {
              background: hasData ? '#F0F7FF' : '#F8F9FA',
              borderRadius: 10, padding: '10px 12px', marginBottom: 6,
              border: hasData ? '1.5px solid #BFDBFE' : '1.5px dashed #E0E0E0',
              cursor: 'pointer',
            },
            onClick: () => setEditCell({ dia, turno: turno.id })
          },
            React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between',
              alignItems: 'center' } },
              React.createElement('span', { style: { fontSize: 13, fontWeight: 700,
                color: turno.color } }, turno.label),
              hasData && cell.hora && React.createElement('span', { style: {
                fontSize: 12, color: '#888', fontWeight: 600
              } }, cell.hora)
            ),
            hasData
              ? React.createElement('div', { style: { marginTop: 6 } },
                  cell.taller && React.createElement('div', { style: { fontWeight: 700, fontSize: 14, color: '#1F3864' } },
                    cell.taller),
                  React.createElement('div', { style: { fontSize: 13, color: '#555', marginTop: 2 } },
                    [cell.dupla1, cell.dupla2].filter(Boolean).join(' · ')),
                  cell.notas && React.createElement('div', { style: { fontSize: 11, color: '#888', marginTop: 4,
                    fontStyle: 'italic' } }, cell.notas)
                )
              : React.createElement('div', { style: { fontSize: 13, color: '#bbb', marginTop: 4 } },
                  '+ Tocar para agregar taller')
          );
        })
      )
    ),

    // Modales
    editCell && React.createElement(EditModal, {
      dia: editCell.dia, turno: editCell.turno,
      onClose: () => setEditCell(null)
    }),
    showConfig && React.createElement(ConfigModal, { onClose: () => setConfig(false) })
  );
}



// ═══════════════════════════════════════════════════════════════════════
//  SISTEMA DE SYNC — Google Sheets + Roles de Usuario
// ═══════════════════════════════════════════════════════════════════════

// ── USUARIOS Y ROLES ─────────────────────────────────────────────────
const ROLES = { JEFE: 'jefe', KINE: 'kine' };

const USUARIOS_DEFAULT = [
  { nombre:'DANIEL',  email:'daniel.moyav@gmail.com', rol:ROLES.JEFE, color:'#C00000', pin:'1234', talleres:[] },
  { nombre:'SILVANA', email:'silvana@cesfam.cl',       rol:ROLES.KINE, color:'#8E44AD', pin:'2222',
    talleres:['VM 2.0','VILLA EL SALITRE','CUMBRES ANDINAS','NUEVA VIDA','LA FUNDACIÓN','SAN SEBASTIAN','EXPERIENCIA Y JUVENTUD'] },
  { nombre:'JORGE',   email:'jorge@cesfam.cl',         rol:ROLES.KINE, color:'#2471A3', pin:'3333',
    talleres:['UV19 AM27','UV18','VILLA MACUL M-J'] },
  { nombre:'ANITA',   email:'anita@cesfam.cl',         rol:ROLES.KINE, color:'#17A589', pin:'4444',
    talleres:['UV19 PM','VILLA EL SALITRE','LA FUNDACIÓN'] },
  { nombre:'GONZALO', email:'gonzalo@cesfam.cl',       rol:ROLES.KINE, color:'#D68910', pin:'5555',
    talleres:['UV19 PM'] },
  { nombre:'KINE1',   email:'kine1@cesfam.cl',         rol:ROLES.KINE, color:'#1A5276', pin:'6666',
    talleres:[] },
];

const TALLERES_POR_USUARIO = {
  'SILVANA': ['VM 2.0','VILLA EL SALITRE','CUMBRES ANDINAS','NUEVA VIDA','LA FUNDACIÓN','SAN SEBASTIAN','EXPERIENCIA Y JUVENTUD'],
  'JORGE':   ['UV19 AM27','UV18','VILLA MACUL M-J'],
  'ANITA':   ['UV19 PM','VILLA EL SALITRE','LA FUNDACIÓN'],
  'GONZALO': ['UV19 PM'],
};

// ═══════════════════════════════════════════════════════════════════════
//  SYNC ENGINE v2 — Token-based, Pull Autoritario
// ═══════════════════════════════════════════════════════════════════════

const SYNC2 = {

  // Marca un paciente como modificado
  markDirty: (patient) => ({ ...patient, _isDirty: true, _dirtyAt: Date.now() }),

  // Filtra solo los que cambiaron
  getDirty: (patients) => patients.filter(p => p._isDirty),

  // Limpia el flag después del pull
  cleanAll: (patients) => patients.map(({ _isDirty, _dirtyAt, ...p }) => p),

  // ── PUSH ─────────────────────────────────────────────────────────────
  // Envía solo pacientes sucios + asistencia de hoy. No-cors fire-and-forget.
  push: async (patients, attendanceLog, scriptUrl, userName) => {
    const token = `${userName}_${Date.now()}`;
    const today = new Date().toISOString().slice(0, 10);

    const dirty = SYNC2.getDirty(patients);
    const attHoy = Object.entries(attendanceLog || {})
      .filter(([k]) => k.startsWith(today))
      .map(([k, v]) => {
        const [date, taller, rut] = k.split('||');
        return { key: k, date, taller, rut, value: v };
      });

    if (dirty.length === 0 && attHoy.length === 0) {
      return { token: null, nPat: 0, nAtt: 0 }; // Nada que enviar
    }

    const payload = {
      action: 'smartSync',
      token,
      user: userName,
      timestamp: new Date().toISOString(),
      patients: dirty.map(({ _isDirty, _dirtyAt, ...p }) => p),
      attendance: attHoy,
    };

    // Fire-and-forget con no-cors
    await fetch(scriptUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload),
    });

    return { token, nPat: dirty.length, nAtt: attHoy.length };
  },

  // ── POLL ─────────────────────────────────────────────────────────────
  // Pregunta al servidor si ya procesó el token. Reintenta hasta 6 veces.
  waitForToken: async (scriptUrl, token, maxRetries = 6) => {
    if (!token) return true; // Sin token = nada que esperar
    for (let i = 0; i < maxRetries; i++) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const res = await fetch(
          `${scriptUrl}?action=checkToken&token=${encodeURIComponent(token)}&t=${Date.now()}`
        );
        const data = await res.json();
        if (data.processed) return true;
      } catch (e) {
        // Ignorar errores de red en el polling
      }
    }
    return false; // Timeout — igual hacer pull
  },

  // ── PULL ─────────────────────────────────────────────────────────────
  // Descarga datos frescos del servidor. Reemplaza localStorage completo.
  pull: async (scriptUrl, userName) => {
    const url = `${scriptUrl}?action=pull&user=${encodeURIComponent(userName)}&t=${Date.now()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Error de red en pull');
    const data = await res.json();
    if (data.status !== 'ok') throw new Error(data.message || 'Error del servidor');
    return data;
  },

  // ── SYNC COMPLETO (Push de todos los pacientes, para respaldo manual) ─
  pushAll: async (patients, scriptUrl, userName) => {
    const token = `${userName}_full_${Date.now()}`;
    const CHUNK = 30;
    const clean = patients.map(({ _isDirty, _dirtyAt, ...p }) => p);
    for (let i = 0; i < clean.length; i += CHUNK) {
      await fetch(scriptUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          action: 'smartSync',
          token: i === 0 ? token : null,
          user: userName,
          timestamp: new Date().toISOString(),
          patients: clean.slice(i, i + CHUNK),
          attendance: [],
        }),
      });
    }
    return token;
  },
};


// ── FILTRO POR ROL ────────────────────────────────────────────────────
function filtrarPorRol(patients, currentUser) {
  if (!currentUser || currentUser.rol === ROLES.JEFE) return patients;
  const misTalleres = TALLERES_POR_USUARIO[currentUser.nombre] || currentUser.talleres || [];
  if (misTalleres.length === 0) return patients;
  return patients.filter(p => misTalleres.includes(p.taller));
}

// ── SYNC STATUS INDICATOR ─────────────────────────────────────────────
// ── PIN SCREEN ────────────────────────────────────────────────────────
function PINScreen({ onUnlock }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const VALID_PIN = '1234';

  function check(p) {
    if (p.length < 4) return;
    if (p === VALID_PIN) {
      onUnlock();
    } else {
      setError(true);
      setTimeout(() => { setPin(''); setError(false); }, 800);
    }
  }

  function pressKey(k) {
    if (k === '←') { setPin(p => p.slice(0,-1)); return; }
    const next = pin + k;
    setPin(next);
    if (next.length === 4) check(next);
  }

  return React.createElement('div', {
    style: { display:'flex', flexDirection:'column', alignItems:'center',
             justifyContent:'center', minHeight:'100vh', background:'#1A3A5C', padding:24 }
  },
    React.createElement('div', { style:{fontSize:64, marginBottom:8} }, '🏃'),
    React.createElement('h2', { style:{color:'#fff', fontWeight:900, fontSize:26, marginBottom:4} }, 'MAS AMA Pro'),
    React.createElement('p', { style:{color:'rgba(255,255,255,.7)', marginBottom:32, fontSize:14} }, 'Ingresa tu PIN'),
    React.createElement('div', { style:{display:'flex', gap:12, marginBottom:24} },
      [0,1,2,3].map(i => React.createElement('div', { key:i, style:{
        width:16, height:16, borderRadius:'50%',
        background: pin.length > i ? '#fff' : 'rgba(255,255,255,.3)',
        transition:'background .15s'
      }}))
    ),
    error && React.createElement('p', { style:{color:'#FF6B6B', marginBottom:12, fontSize:13} }, 'PIN incorrecto'),
    React.createElement('div', { style:{display:'grid', gridTemplateColumns:'repeat(3,72px)', gap:10} },
      ['1','2','3','4','5','6','7','8','9','←','0','✓'].map(k =>
        React.createElement('button', {
          key:k, onClick:()=>pressKey(k),
          style:{
            height:72, borderRadius:16, border:'none', cursor:'pointer', fontSize:22, fontWeight:700,
            background: k==='✓' ? '#27AE60' : k==='←' ? 'rgba(255,255,255,.15)' : 'rgba(255,255,255,.1)',
            color:'#fff', transition:'background .1s'
          }
        }, k)
      )
    )
  );
}

function SyncIndicator({ status, lastSync, onSync, hasUrl }) {
  if (!hasUrl) return React.createElement('div',{
    style:{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',
      background:'#FEF9E7',borderRadius:10,marginBottom:10,
      boxShadow:'0 1px 6px rgba(0,0,0,.06)',cursor:'pointer'},
    onClick:onSync
  },
    React.createElement('span',{style:{fontSize:13}},'⚙️'),
    React.createElement('span',{style:{fontSize:12,color:'#7A5C00',flex:1}},
      'Configura el script en Config para ver datos en tiempo real'),
    React.createElement('span',{style:{fontSize:11,color:'#2471A3',fontWeight:700}},'Configurar')
  );

  const configs = {
    idle:    { dot:'ok',      text: lastSync ? `Actualizado: ${lastSync}` : 'Listo para actualizar', icon:'☁️' },
    syncing: { dot:'loading', text: 'Leyendo archivos de Drive...', icon:'🔄' },
    ok:      { dot:'ok',      text: `Actualizado: ${lastSync}`, icon:'✅' },
    error:   { dot:'err',     text: 'Error al leer Drive — toca para reintentar', icon:'⚠️' },
  };
  const cfg = configs[status] || configs.idle;
  return React.createElement('div', {
    style:{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',
      background:'#fff',borderRadius:10,marginBottom:10,
      boxShadow:'0 1px 6px rgba(0,0,0,.06)',cursor:'pointer'},
    onClick:onSync,
  },
    React.createElement('div',{className:`sync-dot ${cfg.dot}`}),
    React.createElement('span',{style:{fontSize:12,color:'#555',flex:1}},`${cfg.icon} ${cfg.text}`),
    React.createElement('span',{style:{fontSize:11,color:'#2471A3',fontWeight:700}},'Actualizar')
  );
}

// ── GESTIÓN DE USUARIOS (para Config) ────────────────────────────────
function UserManager({ usuarios, setUsuarios, currentUser, toast }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ nombre:'', email:'', rol:ROLES.KINE, talleres:[] });
  const [selTalleres, setSelTalleres] = useState([]);

  function addUser() {
    if (!form.nombre.trim() || !form.email.trim()) {
      toast('❌ Nombre y email son obligatorios'); return;
    }
    if (usuarios.find(u => u.email === form.email.trim())) {
      toast('❌ Ese email ya existe'); return;
    }
    const newUser = {
      nombre: form.nombre.trim().toUpperCase(),
      email: form.email.trim().toLowerCase(),
      rol: form.rol,
      color: ['#2471A3','#375623','#7D3C98','#E67E22','#17A589'][usuarios.length % 5],
      talleres: selTalleres,
    };
    const next = [...usuarios, newUser];
    setUsuarios(next); DB.set('usuarios', next);
    setShowAdd(false); setForm({nombre:'',email:'',rol:ROLES.KINE,talleres:[]});
    setSelTalleres([]);
    toast(`✅ ${newUser.nombre} agregado al equipo`);
  }

  function removeUser(email) {
    if (email === 'daniel.moyav@gmail.com') { toast('❌ No puedes eliminar al administrador'); return; }
    const next = usuarios.filter(u => u.email !== email);
    setUsuarios(next); DB.set('usuarios', next);
    toast('🗑️ Usuario eliminado');
  }

  function toggleTaller(t) {
    setSelTalleres(prev => prev.includes(t) ? prev.filter(x=>x!==t) : [...prev,t]);
  }

  return React.createElement('div', null,
    React.createElement('div', { className:'card-title' }, '👥 Equipo MAS AMA'),
    React.createElement('p', { style:{fontSize:13,color:'#777',marginBottom:12,lineHeight:1.5} },
      'Agrega a tus compañeros. Cuando configuren su Google Sheet y la misma URL de sync, compartirán todos los datos.'),

    // Lista usuarios
    usuarios.map(u => React.createElement('div', { key:u.email, style:{
      display:'flex', alignItems:'center', gap:10,
      padding:'10px 0', borderBottom:'1px solid #f0f0f0'
    } },
      React.createElement('div', { style:{
        width:36, height:36, borderRadius:'50%', background:u.color,
        display:'flex', alignItems:'center', justifyContent:'center',
        color:'#fff', fontWeight:800, fontSize:14, flexShrink:0,
      } }, u.nombre[0]),
      React.createElement('div', { style:{flex:1, minWidth:0} },
        React.createElement('div', { style:{fontWeight:700, fontSize:14} },
          u.nombre, u.rol===ROLES.JEFE && React.createElement('span',{
            style:{fontSize:11,background:'#D5F5E3',color:'#1E8449',
                   borderRadius:10,padding:'2px 8px',marginLeft:6,fontWeight:700}
          },'👑 Jefe')),
        React.createElement('div', { style:{fontSize:12,color:'#888'} }, u.email),
        u.talleres?.length > 0 && React.createElement('div',{
          style:{fontSize:11,color:'#555',marginTop:2}
        }, `Talleres: ${u.talleres.slice(0,2).join(', ')}${u.talleres.length>2?` +${u.talleres.length-2}`:''}`)
      ),
      u.email !== 'daniel.moyav@gmail.com' && React.createElement('button', {
        onClick: () => removeUser(u.email),
        style:{background:'#FFF0F0',color:'#C00000',border:'none',
               borderRadius:8,padding:'6px 10px',cursor:'pointer',fontSize:12,fontWeight:700}
      }, 'Quitar')
    )),

    // Botón agregar
    !showAdd
      ? React.createElement('button', {
          className:'btn btn-primary btn-sm', style:{marginTop:14},
          onClick:()=>setShowAdd(true)
        }, '+ Agregar compañero')
      : React.createElement('div', { style:{marginTop:14, background:'#F8F9FA', borderRadius:12, padding:14} },
          React.createElement('div',{style:{fontWeight:800,fontSize:15,marginBottom:12}},'Nuevo integrante'),
          React.createElement(Field,{label:'Nombre'},
            React.createElement('input',{type:'text',placeholder:'Ej: SILVANA',
              value:form.nombre, onChange:e=>setForm(f=>({...f,nombre:e.target.value}))})
          ),
          React.createElement(Field,{label:'Email Gmail'},
            React.createElement('input',{type:'email',placeholder:'silvana@gmail.com',
              value:form.email, onChange:e=>setForm(f=>({...f,email:e.target.value}))})
          ),
          React.createElement(Field,{label:'Rol'},
            React.createElement('select',{value:form.rol,onChange:e=>setForm(f=>({...f,rol:e.target.value}))},
              React.createElement('option',{value:ROLES.KINE},'Kinesiólogo/a'),
              React.createElement('option',{value:ROLES.JEFE},'Jefe (ve todo)')
            )
          ),
          form.rol === ROLES.KINE && React.createElement('div', null,
            React.createElement('div',{className:'card-title',style:{marginBottom:8}},'Talleres asignados'),
            React.createElement('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}},
              TALLERES.map(t => React.createElement('div',{
                key:t, onClick:()=>toggleTaller(t),
                style:{
                  background: selTalleres.includes(t) ? '#D5F5E3' : '#fff',
                  border:`2px solid ${selTalleres.includes(t)?'#1E8449':'#E0E0E0'}`,
                  borderRadius:8, padding:'8px 10px', cursor:'pointer',
                  fontSize:11, fontWeight:700, textAlign:'center',
                  color: selTalleres.includes(t) ? '#1E8449' : '#555',
                }
              }, t))
            )
          ),
          React.createElement('div',{className:'btn-row',style:{marginTop:12}},
            React.createElement('button',{className:'btn btn-ghost',style:{flex:1},
              onClick:()=>setShowAdd(false)},'Cancelar'),
            React.createElement('button',{className:'btn btn-green',style:{flex:2},
              onClick:addUser},'✅ Agregar')
          )
        )
  );
}



// ═══════════════════════════════════════════════════════════════════════
//  SISTEMA MULTI-USUARIO CON SYNC
// ═══════════════════════════════════════════════════════════════════════



// ── SYNC API ──────────────────────────────────────────────────────────
async function apiCall(scriptUrl, action, payload, userSession) {
  const body = JSON.stringify({
    action,
    email: userSession?.email,
    pin:   userSession?.pin,
    ...payload,
  });
  try {
    const res = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    return await res.json();
  } catch(e) {
    throw new Error('Sin conexión');
  }
}

async function doLogin(scriptUrl, email, pin) {
  return apiCall(scriptUrl, 'login', {}, { email, pin });
}

async function doPull(scriptUrl, userSession) {
  return apiCall(scriptUrl, 'sync_pull', {}, userSession);
}

async function doPush(scriptUrl, userSession, data) {
  return apiCall(scriptUrl, 'sync_push', data, userSession);
}

async function doAddUser(scriptUrl, userSession, newUser) {
  return apiCall(scriptUrl, 'add_user', { newUser }, userSession);
}

async function doGetUsers(scriptUrl, userSession) {
  return apiCall(scriptUrl, 'get_users', {}, userSession);
}

async function doUpdateUser(scriptUrl, userSession, targetEmail, updates) {
  return apiCall(scriptUrl, 'update_user', { targetEmail, updates }, userSession);
}

// ── LOGIN SCREEN MULTI-USUARIO ────────────────────────────────────────
function LoginScreen({ onLogin, usuarios }) {
  const [selUser, setSelUser] = useState(null);
  const [pin, setPin]         = useState('');
  const [error, setError]     = useState('');

  function handleKey(k) {
    if (!k) return;
    if (k === '⌫') { setPin(p => p.slice(0,-1)); setError(''); return; }
    const next = pin + k;
    setPin(next);
    setError('');
    if (next.length === 4) {
      setTimeout(() => {
        if (next === selUser.pin) {
          onLogin({ ...selUser, isLocal: true });
        } else {
          setError('PIN incorrecto');
          setPin('');
          setTimeout(() => setError(''), 1500);
        }
      }, 100);
    }
  }

  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  const dots = [0,1,2,3].map(i => React.createElement('div', { key: i, style: {
    width: 18, height: 18, borderRadius: '50%', margin: '0 10px',
    background: pin.length > i ? '#58D68D' : 'rgba(255,255,255,.25)',
    transition: 'background .15s',
  }}));

  const header = React.createElement('div', { style: {
    display:'flex', flexDirection:'column', alignItems:'center', marginBottom: 28
  } },
    React.createElement('div', { style: { fontSize: 56, marginBottom: 6 } }, '🏃'),
    React.createElement('div', { style: { fontSize: 24, fontWeight: 900, marginBottom: 2 } },
      'MAS ', React.createElement('span', { style: { color: '#58D68D' } }, 'AMA'), ' Pro'),
    React.createElement('div', { style: { fontSize: 12, opacity: .6 } },
      'CESFAM Félix de Amesti · Macul')
  );

  // ── Paso 1: Selector de usuario ─────────────────────────────────────
  if (!selUser) return React.createElement('div', { style: {
    position:'fixed', inset:0,
    background:'linear-gradient(160deg,#1A3A5C 0%,#1F4E79 50%,#17A589 100%)',
    display:'flex', flexDirection:'column', alignItems:'center',
    color:'#fff', fontFamily:"'Segoe UI',Arial,sans-serif",
    overflowY:'auto', padding:'32px 16px 40px',
  } },
    header,
    React.createElement('div', { style: { fontSize: 14, opacity: .75, marginBottom: 16 } },
      '¿Quién eres?'),
    React.createElement('div', { style: {
      display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12, width:'100%', maxWidth:320
    } },
      (usuarios || USUARIOS_DEFAULT).map(u => React.createElement('button', {
        key: u.nombre,
        onClick: () => { setSelUser(u); setPin(''); setError(''); },
        style: {
          background: u.color || '#2471A3',
          border: 'none', borderRadius: 16, padding: '18px 12px',
          display:'flex', flexDirection:'column', alignItems:'center', gap:8,
          cursor:'pointer', color:'#fff',
        }
      },
        React.createElement('div', { style: {
          width:44, height:44, borderRadius:'50%',
          background:'rgba(255,255,255,.2)',
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:20, fontWeight:900,
        } }, u.nombre[0]),
        React.createElement('div', { style: { fontWeight:800, fontSize:14 } }, u.nombre)
      ))
    )
  );

  // ── Paso 2: PIN ────────────────────────────────────────────────────
  return React.createElement('div', { style: {
    position:'fixed', inset:0,
    background:'linear-gradient(160deg,#1A3A5C 0%,#1F4E79 50%,#17A589 100%)',
    display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
    color:'#fff', fontFamily:"'Segoe UI',Arial,sans-serif", zIndex:999,
  } },
    header,
    React.createElement('div', { style: {
      display:'flex', alignItems:'center', gap:10, marginBottom:20,
      background:'rgba(255,255,255,.12)', borderRadius:40, padding:'8px 18px'
    } },
      React.createElement('div', { style: {
        width:32, height:32, borderRadius:'50%',
        background: selUser.color || '#2471A3',
        display:'flex', alignItems:'center', justifyContent:'center',
        fontWeight:900, fontSize:14,
      } }, selUser.nombre[0]),
      React.createElement('span', { style: { fontWeight:700 } }, selUser.nombre),
      React.createElement('button', {
        onClick: () => { setSelUser(null); setPin(''); setError(''); },
        style: { background:'none', border:'none', color:'rgba(255,255,255,.5)',
                 fontSize:18, cursor:'pointer', marginLeft:4, padding:0 }
      }, '✕')
    ),
    React.createElement('div', { style: { display:'flex', marginBottom:8,
      animation: error ? 'shake .4s ease' : 'none' } }, dots),
    React.createElement('div', { style: { height:20, fontSize:13,
      color: error ? '#FFD966' : 'transparent', marginBottom:8 } }, error || '.'),
    React.createElement('div', { style: {
      display:'grid', gridTemplateColumns:'repeat(3,80px)', gap:14
    } },
      keys.map((k,i) => React.createElement('button', {
        key: i, onClick: () => handleKey(k),
        style: {
          width:80, height:80, borderRadius:'50%', border:'none',
          background: k ? 'rgba(255,255,255,.12)' : 'transparent',
          color:'#fff', fontSize: k==='⌫' ? 22 : 28, fontWeight:700,
          cursor: k ? 'pointer' : 'default',
          visibility: k==='' ? 'hidden' : 'visible',
        }
      }, k))
    )
  );
}

// ── VIEW: GESTIÓN DE USUARIOS (solo jefe) ────────────────────────────
function ViewUsuarios({ userSession, syncConfig, toast }) {
  const [users, setUsers]         = useState([]);
  const [loading, setLoading]     = useState(false);
  const [showAdd, setShowAdd]     = useState(false);
  const [form, setForm]           = useState({
    email: '', nombre: '', rol: 'kinesiologo',
    talleres: [], pin: '1234',
  });

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    if (!syncConfig.url) return;
    setLoading(true);
    try {
      const r = await doGetUsers(syncConfig.url, userSession);
      if (r.ok) setUsers(r.users);
    } catch(e) {}
    setLoading(false);
  }

  async function addUser() {
    if (!form.email || !form.nombre) { toast('❌ Email y nombre son obligatorios'); return; }
    setLoading(true);
    try {
      const r = await doAddUser(syncConfig.url, userSession, form);
      if (r.ok) {
        toast(`✅ ${form.nombre} agregado al equipo`);
        setShowAdd(false);
        setForm({ email:'', nombre:'', rol:'kinesiologo', talleres:[], pin:'1234' });
        loadUsers();
      } else { toast(`❌ ${r.error}`); }
    } catch(e) { toast('❌ Sin conexión'); }
    setLoading(false);
  }

  async function toggleActive(u) {
    try {
      await doUpdateUser(syncConfig.url, userSession, u.email, { activo: !u.activo });
      toast(`✅ ${u.nombre} ${!u.activo ? 'activado' : 'desactivado'}`);
      loadUsers();
    } catch(e) { toast('❌ Error'); }
  }

  function toggleTaller(t) {
    setForm(f => ({
      ...f,
      talleres: f.talleres.includes(t)
        ? f.talleres.filter(x => x !== t)
        : [...f.talleres, t]
    }));
  }

  return React.createElement('div', { className: 'page' },
    // Info banner
    React.createElement('div', { style: { background: '#1A3A5C', borderRadius: 12,
      padding: '12px 14px', marginBottom: 14 } },
      React.createElement('div', { style: { color: '#58D68D', fontWeight: 900, fontSize: 14, marginBottom: 2 } },
        '👥 EQUIPO MAS AMA'),
      React.createElement('div', { style: { color: 'rgba(255,255,255,.8)', fontSize: 13 } },
        !syncConfig.url
          ? '⚠️ Configura la URL del Apps Script para gestionar usuarios'
          : 'Agrega y gestiona los accesos de tu equipo')
    ),

    !syncConfig.url && React.createElement('div', { style: {
      background: '#FEF9E7', border: '1.5px solid #F4D03F',
      borderRadius: 12, padding: 14, marginBottom: 14, fontSize: 13, color: '#7E5109'
    } },
      '⚙️ Primero configura la URL del Google Apps Script en Configuración → Sync Google Sheets'
    ),

    // Lista de usuarios
    loading
      ? React.createElement('div', { className: 'spinner' })
      : React.createElement('div', null,
          users.map((u, i) => React.createElement('div', { key: i, className: 'card',
            style: { padding: '12px 14px' } },
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } },
              React.createElement('div', { style: {
                width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
                background: u.rol === 'jefe'
                  ? 'linear-gradient(135deg,#C0392B,#922B21)'
                  : 'linear-gradient(135deg,#2471A3,#1A5276)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 800, fontSize: 16,
              } }, u.nombre?.[0] || '?'),
              React.createElement('div', { flex: 1, style: { flex: 1 } },
                React.createElement('div', { style: { fontWeight: 800, fontSize: 15 } }, u.nombre),
                React.createElement('div', { style: { fontSize: 12, color: '#777' } }, u.email),
                React.createElement('div', { style: { display: 'flex', gap: 6, marginTop: 4 } },
                  React.createElement('span', { style: {
                    background: u.rol === 'jefe' ? '#FADBD8' : '#D6EAF8',
                    color: u.rol === 'jefe' ? '#C0392B' : '#2471A3',
                    borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 700
                  } }, u.rol === 'jefe' ? '👑 Jefe' : '👤 Kinesiólogo'),
                  !u.activo && React.createElement('span', { style: {
                    background: '#EAECEE', color: '#777',
                    borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 700
                  } }, 'Inactivo')
                ),
                u.talleres?.length > 0 && React.createElement('div', { style: {
                  fontSize: 11, color: '#888', marginTop: 4
                } }, `Talleres: ${u.talleres.slice(0,2).join(', ')}${u.talleres.length > 2 ? '...' : ''}`)
              ),
              u.email !== userSession.email && React.createElement('button', {
                onClick: () => toggleActive(u),
                style: {
                  background: u.activo ? '#FADBD8' : '#D5F5E3',
                  color: u.activo ? '#C0392B' : '#1E8449',
                  border: 'none', borderRadius: 10, padding: '8px 12px',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer'
                }
              }, u.activo ? 'Desactivar' : 'Activar')
            )
          ))
        ),

    // Botón agregar
    syncConfig.url && React.createElement('button', {
      className: 'btn btn-primary', style: { marginTop: 8 },
      onClick: () => setShowAdd(true)
    }, '➕ Agregar miembro del equipo'),

    // Modal agregar usuario
    showAdd && React.createElement('div', { className: 'overlay',
      onClick: e => { if(e.target===e.currentTarget) setShowAdd(false); }
    },
      React.createElement('div', { className: 'sheet' },
        React.createElement('div', { className: 'sheet-handle' }),
        React.createElement('div', { style: { fontWeight: 900, fontSize: 17, marginBottom: 14 } },
          '➕ Agregar al Equipo'),

        React.createElement(Field, { label: 'Correo Gmail *' },
          React.createElement('input', { type: 'email', value: form.email,
            onChange: e => setForm(f => ({...f, email: e.target.value})),
            placeholder: 'silvana@gmail.com' })
        ),
        React.createElement(Field, { label: 'Nombre *' },
          React.createElement('input', { type: 'text', value: form.nombre,
            onChange: e => setForm(f => ({...f, nombre: e.target.value.toUpperCase()})),
            placeholder: 'SILVANA' })
        ),
        React.createElement(Field, { label: 'Rol' },
          React.createElement('select', { value: form.rol,
            onChange: e => setForm(f => ({...f, rol: e.target.value})) },
            React.createElement('option', { value: 'kinesiologo' }, '👤 Kinesiólogo'),
            React.createElement('option', { value: 'jefe' }, '👑 Jefe (ve todo)')
          )
        ),
        React.createElement(Field, { label: 'PIN de acceso' },
          React.createElement('input', { type: 'text', inputMode: 'numeric',
            maxLength: 4, value: form.pin,
            onChange: e => setForm(f => ({...f, pin: e.target.value})),
            placeholder: '1234' })
        ),

        form.rol !== 'jefe' && React.createElement('div', null,
          React.createElement(SectionHdr, null, 'Talleres asignados'),
          React.createElement('p', { style: { fontSize: 13, color: '#777', marginBottom: 10 } },
            'Selecciona los talleres que verá este usuario:'),
          React.createElement('div', { className: 'taller-grid' },
            TALLERES.map(t => React.createElement('div', {
              key: t,
              className: `taller-btn ${form.talleres.includes(t) ? 'selected' : ''}`,
              onClick: () => toggleTaller(t)
            }, t))
          )
        ),

        React.createElement('div', { className: 'btn-row', style: { marginTop: 14 } },
          React.createElement('button', { className: 'btn btn-ghost', style: { flex: 1 },
            onClick: () => setShowAdd(false) }, 'Cancelar'),
          React.createElement('button', { className: 'btn btn-primary', style: { flex: 2 },
            onClick: addUser, disabled: loading },
            loading ? 'Guardando...' : '✅ Agregar')
        )
      )
    )
  );
}

// ── SYNC STATUS BAR ───────────────────────────────────────────────────
function SyncStatusBar({ syncState, onSync }) {
  if (!syncState) return null;
  const colors = { syncing:'#2471A3', ok:'#1E8449', error:'#C0392B', offline:'#E67E22' };
  const labels = {
    syncing: '🔄 Sincronizando...',
    ok:      `✅ Sincronizado · ${syncState.lastSync || ''}`,
    error:   '❌ Error de sync · Toca para reintentar',
    offline: '📵 Sin internet · Datos guardados localmente',
  };
  return React.createElement('div', {
    onClick: syncState.status !== 'syncing' ? onSync : undefined,
    style: {
      background: colors[syncState.status] || '#888',
      color: '#fff', padding: '8px 14px', fontSize: 12, fontWeight: 700,
      display: 'flex', alignItems: 'center', gap: 8,
      cursor: syncState.status !== 'syncing' ? 'pointer' : 'default',
    }
  },
    React.createElement('div', { style: {
      width: 8, height: 8, borderRadius: '50%', background: 'rgba(255,255,255,.6)',
      animation: syncState.status === 'syncing' ? 'pulse .8s infinite' : 'none',
    } }),
    labels[syncState.status] || 'Sin estado'
  );
}



// ═══════════════════════════════════════════════════════════════════════
//  SISTEMA DE SYNC — Google Sheets + Roles de Usuario
// ═══════════════════════════════════════════════════════════════════════
// APP SHELL
// ─────────────────────────────────────────────────────────────────────
function App(){
  const [unlocked,setUnlocked] = useState(()=>{
    try{ return sessionStorage.getItem('masama_unlocked')==='1'; }catch{ return false; }
  });
  const [view,setView]         = useState('inicio');
  const [patients,setPatients] = useState(()=>DB.get('patients',[]));
  const [attendanceLog,setAL]  = useState(()=>DB.get('attendanceLog',{}));
  const [sessionNotes,setSN]   = useState(()=>DB.get('sessionNotes',{}));
  const [sessionLog,setSL]     = useState(()=>DB.get('sessionLog',{}));
  const [selPatient,setSel]    = useState(null);
  const [toastMsg,setToast]    = useState('');
  // Solo lectura desde Google Sheets
  const [syncStatus,setSyncSt] = useState('idle');
  const [lastSync,setLastSync] = useState(()=>DB.get('lastSync',''));
  const [scriptUrl,setScriptUrl] = useState(()=>DB.get('scriptUrl',''));
  const [autoSync]             = useState(()=>DB.get('autoSync',{url:DB.get('scriptUrl',''),enabled:!!DB.get('scriptUrl','')}));
  const [currentUser,setCurrentUser] = useState(()=>DB.get('currentUser',null));
  const [usuarios]                   = useState(USUARIOS_DEFAULT);

  useEffect(()=>{
    try{ if(unlocked) sessionStorage.setItem('masama_unlocked','1');
         else sessionStorage.removeItem('masama_unlocked'); }catch{}
  },[unlocked]);

  function toast(msg){ setToast(msg); setTimeout(()=>setToast(''),2600); }

  // ── ACTUALIZAR desde Google Sheets (solo lectura) ──────────────────
  async function doSync(silent=false) {
    const url = DB.get('scriptUrl','');
    if (!url) { if(!silent) toast('⚙️ Ve a Config y configura la URL del script'); return; }
    setSyncSt('syncing');
    if(!silent) toast('📥 Leyendo datos del equipo...');
    try {
      const res = await fetch(`${url}?action=all&t=${Date.now()}`);
      if(!res.ok) throw new Error('Error de red');
      const data = await res.json();
      if(data.status !== 'ok') throw new Error(data.message||'Error del servidor');

      // Procesar pacientes
      let pacs = data.pacientes || [];
      // Cruzar con asistencia para asignar taller y presencias
      if(data.asistencia) {
        const { talleresPorRut, presenciasPorRut } = data.asistencia;
        pacs = pacs.map(p => {
          const rut = p.rut;
          const taller = talleresPorRut[rut] || p.taller || 'SIN ASIGNAR';
          const pres = presenciasPorRut[rut] || 0;
          return {
            ...p,
            taller,
            totalPresencias: pres,
            alertaAsist: pres < 10 ? 'BAJO' : 'OK',
            empamDias: p.empamFecha ? Math.round((new Date(p.empamFecha)-new Date())/86400000) : null,
          };
        });
      }

      if(pacs.length > 0) {
        setPatients(pacs);
        DB.set('patients', pacs);
      }

      const now = new Date().toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'});
      setLastSync(now); DB.set('lastSync',now);
      setSyncSt('ok');
      if(!silent) toast(`✅ ${pacs.length} pacientes actualizados desde Drive`);
      setTimeout(()=>setSyncSt('idle'),3000);
    } catch(e) {
      setSyncSt('error');
      if(!silent) toast('❌ '+(e.message||'Error al leer los archivos'));
      setTimeout(()=>setSyncSt('idle'),5000);
    }
  }

  // Auto-sync al abrir
  useEffect(()=>{
    const url = DB.get('scriptUrl','');
    if(url) doSync(true);
  },[]);

  // Auto-sync cada 30 minutos
  useEffect(()=>{
    const url = DB.get('scriptUrl','');
    if(!url) return;
    const interval = setInterval(()=>{
      doSync(true);
    }, 30 * 60 * 1000); // 30 minutos
    return ()=>clearInterval(interval);
  },[]);

  // Auto-sync al volver al tab/app
  useEffect(()=>{
    function onVisible(){
      if(document.visibilityState==='visible'){
        const url = DB.get('scriptUrl','');
        const last = DB.get('lastSync','');
        if(!url) return;
        // Si pasaron más de 15 min desde el último sync, actualizar
        if(!last) { doSync(true); return; }
        const mins = (Date.now() - new Date(`${new Date().toDateString()} ${last}`).getTime()) / 60000;
        if(isNaN(mins)||mins>15) doSync(true);
      }
    }
    document.addEventListener('visibilitychange', onVisible);
    return ()=>document.removeEventListener('visibilitychange', onVisible);
  },[]);

  const visiblePatients = filtrarPorRol(patients, currentUser);
  const isJefe = currentUser?.rol === ROLES.JEFE;
  const isSyncing = syncStatus === 'syncing';

  function openPatient(p){ setSel(p); setView('ficha'); }
  function goBack(){
    if(view==='ficha'){ setSel(null); setView('pacientes'); }
    else setView('inicio');
  }

  const hasData = patients.length > 0;
  const alertCount = visiblePatients.filter(p=>
    p.empamEstado?.includes('VENCIDO')||p.empamEstado?.includes('PRONTO')||p.alertaAsist?.includes('BAJO')
  ).length;
  const hasBack = ['ficha','nuevo'].includes(view);
  const titles = {
    inicio:'MAS AMA 2026', lista:'Pasar Lista', pacientes:'Pacientes',
    rayen:'Modo RAYEN', rutinas:'Rutinas de Sesión', rem:'Generador REM',
    agenda:'Agenda Duplas', nuevo:'Nuevo Paciente',
    ficha: selPatient?.nombre?.split(' ').slice(0,2).join(' ')||'Ficha',
    alertas:'Alertas', exportar:'Exportar Excel', config:'Configuración',
  };

  const navItems = [
    {id:'inicio',   icon:'🏠', label:'Inicio'},
    {id:'pacientes',icon:'👥', label:'Pacientes'},
    {id:'alertas',  icon:'🚨', label:'Alertas', dot:alertCount>0},
    {id:'lista',    icon:'📋', label:'Lista'},
    {id:'rayen',    icon:'🏥', label:'RAYEN'},
    {id:'rutinas',  icon:'📚', label:'Rutinas'},
    {id:'agenda',   icon:'📅', label:'Agenda'},
    {id:'config',   icon:'⚙️', label:'Config'},
  ];

  // Login multi-usuario
  if(!currentUser) return React.createElement(LoginScreen,{
    usuarios,
    onLogin: (user) => {
      setCurrentUser(user);
      DB.set('currentUser', user);
      setUnlocked(true);
      try{ sessionStorage.setItem('masama_unlocked','1'); }catch{}
    },
    scriptUrl,
  });

  return React.createElement('div',{id:'app'},
    // Top bar
    React.createElement('div',{className:'top-bar'},
      hasBack && React.createElement('button',{className:'back-btn',onClick:goBack},'←'),
      React.createElement('h1',null,titles[view]||'MAS AMA'),
      !hasBack && isSyncing && React.createElement('div',{style:{
        width:18,height:18,borderRadius:'50%',
        border:'2px solid rgba(255,255,255,.3)',borderTopColor:'#fff',
        animation:'spin .7s linear infinite'
      }}),
      !hasBack && !isSyncing && autoSync.url && React.createElement('button',{
        className:'top-icon-btn', onClick:()=>doSync(true), title:'Sincronizar'
      },'🔄'),
      !hasBack && alertCount > 0 && React.createElement('span',{
        className:'badge', onClick:()=>setView('alertas')
      }, alertCount),
      !hasBack && React.createElement('div',{
        title:`${currentUser?.nombre||'?'} · Toca para salir`,
        onClick:()=>{ if(window.confirm(`¿Cerrar sesión de ${currentUser?.nombre}?`)){ DB.set('currentUser',null); setCurrentUser(null); try{sessionStorage.removeItem('masama_unlocked');}catch{} } },
        style:{
          width:28,height:28,borderRadius:'50%',
          background:currentUser?.color||'#C00000',
          display:'flex',alignItems:'center',justifyContent:'center',
          fontSize:13,fontWeight:800,color:'#fff',cursor:'pointer'
        }
      },currentUser?.nombre?.[0]||'?')
    ),

    // Contenido
    !hasData && view!=='config'
      ? React.createElement('div',{className:'page',style:{textAlign:'center',paddingTop:50}},
          React.createElement('div',{style:{fontSize:64,marginBottom:16}},'🏃'),
          React.createElement('h2',{style:{fontWeight:900,fontSize:22,marginBottom:8}},'MAS AMA'),
          React.createElement('p',{style:{color:'#777',fontSize:15,marginBottom:24,lineHeight:1.5}},
            'Importa el Maestro Excel para comenzar.'),
          React.createElement('button',{className:'btn btn-primary',
            style:{maxWidth:280,margin:'0 auto'},onClick:()=>setView('config')},
            '📂 Importar Maestro'))
      : view==='inicio'    ? React.createElement(ViewInicio,{patients:visiblePatients,attendanceLog,onNav:setView,currentUser,autoSync,syncStatus,lastSync,doSync})
      : view==='lista'     ? React.createElement(ViewLista,{patients:visiblePatients,attendanceLog,setAttendanceLog:setAL,toast,sessionNotes,setSessionNotes:setSN})
      : view==='pacientes' ? React.createElement(ViewPacientes,{patients:visiblePatients,onPatient:openPatient,onNuevo:()=>setView('nuevo')})
      : view==='nuevo'     ? React.createElement(ViewPacientes,{patients:visiblePatients,onPatient:openPatient,onNuevo:null})
      : view==='ficha'     ? React.createElement(ViewFicha,{patient:selPatient,patients,setPatients,toast})
      : view==='alertas'   ? React.createElement(ViewAlertas,{patients:visiblePatients,onPatient:openPatient})
      : view==='exportar'  ? React.createElement(ViewExportar,{patients,attendanceLog,toast})
      : view==='rayen'     ? React.createElement(ViewRayen,{patients:visiblePatients,attendanceLog,toast})
      : view==='rutinas'   ? React.createElement(ViewRutinas,{sessionLog,setSessionLog:setSL,toast})
      : view==='rem'       ? React.createElement(ViewREM,{patients:visiblePatients,attendanceLog,toast})
      : view==='agenda'    ? React.createElement(ViewAgenda,{toast})
      : view==='config'    ? React.createElement(ViewConfig,{patients,setPatients,toast,syncConfig:autoSync,setSyncConfig:(cfg)=>{DB.set('autoSync',cfg);},userSession:currentUser,onSync:()=>doSync(false),scriptUrl,setScriptUrlProp:(url)=>{setScriptUrl(url);DB.set('scriptUrl',url);DB.set('autoSync',{url,enabled:!!url});}})
      : null,

    // Nav
    React.createElement('nav',{className:'bottom-nav'},
      navItems.map(item=>React.createElement('button',{key:item.id,
        className:`nav-item ${view===item.id?'active':''}`,onClick:()=>setView(item.id)},
        React.createElement('span',{className:'icon'},item.icon),
        React.createElement('span',{className:'label'},item.label),
        item.dot && React.createElement('span',{className:'nav-dot'})
      ))
    ),

    toastMsg && React.createElement(Toast,{msg:toastMsg,onDone:()=>setToast('')})
  );
}


const root=ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(App));
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{ navigator.serviceWorker.register('/sw.js').catch(()=>{}); });
}
