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
  const nuevos   =patients.filter(p=>p.isNew).length;
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
    // Sync bar
    React.createElement(SyncIndicator,{syncing,lastSync,error:syncError}),
    // Welcome banner con figura
    React.createElement('div',{className:'welcome-banner'},
      React.createElement('div',{className:'welcome-figure'},'🏃'),
      React.createElement('h2',null,`${saludo}, Daniel 👋`),
      React.createElement('p',null,`${total} pacientes activos · ${new Date().toLocaleDateString('es-CL',{weekday:'long',day:'numeric',month:'long'})}`)
    ),

    // Sync indicator
    autoSync?.url && React.createElement(SyncIndicator,{
      status:syncStatus, lastSync, onSync:doSync
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
        React.createElement('button',{className:'btn btn-ghost',onClick:()=>onNav('nuevo')},'➕ Nuevo Paciente'),
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
    React.createElement('div',{className:'btn-row',style:{marginBottom:10}},
      React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>setStep('taller')},'← Taller'),
      React.createElement('button',{className:'btn btn-green btn-sm',onClick:()=>marcarTodos('P')},'✅ Todos Pres.'),
      React.createElement('button',{className:'btn btn-red btn-sm',onClick:()=>marcarTodos('A')},'❌ Todos Aus.')
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
            React.createElement('div',{className:'att-sub'},
              `${p.edad?p.edad+' años · ':''}${p.empamEstado||''}`),
            nota&&React.createElement('div',{style:{fontSize:11,color:'#7030A0',marginTop:2}},`📝 ${nota.slice(0,40)}${nota.length>40?'...':''}`)
          ),
          React.createElement('div',{style:{display:'flex',alignItems:'center',gap:6}},
            React.createElement('button',{
              onClick:()=>{ setNotePatient(p); setNoteText(getNote(key)); },
              style:{background:'none',border:'none',fontSize:18,cursor:'pointer',
                     color:nota?'#7030A0':'#ccc',padding:'4px'}
            },'📝'),
            React.createElement('div',{className:'att-toggle'},
              React.createElement('button',{className:`att-btn ${att==='P'?'p-on':'p-off'}`,onClick:()=>setAtt(key,'P')},att==='P'?'✅':'P'),
              React.createElement('button',{className:`att-btn ${att==='A'?'a-on':'a-off'}`,onClick:()=>setAtt(key,'A')},att==='A'?'❌':'A')
            )
          )
        );
      }),
    // Save
    React.createElement('div',{style:{marginTop:14}},
      React.createElement('button',{className:'btn btn-green',
        onClick:()=>toast(`💾 Lista guardada — ${present} presentes, ${absent} ausentes`)},
        '💾 Confirmar Lista')),

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

function ViewNuevo({patients,setPatients,toast,onBack}){
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
    setPatients(updated); DB.set('patients',updated);
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
      if(tab==='nuevos') return ms&&p.isNew;
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
    React.createElement('button',{className:'fab',onClick:onNuevo,title:'Nuevo paciente'},'＋')
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
        patient.isNew&&React.createElement(Chip,{color:'green'},'✨ Nuevo')
      ),
      React.createElement('button',{
        onClick:()=>{
          const txt=`*MAS AMA — Resumen Paciente*%0A` +
            `Nombre: ${patient.nombre}%0A` +
            `RUT: ${patient.rut}%0A` +
            `Taller: ${patient.taller}%0A` +
            `EMPAM: ${patient.empamEstado||'—'}%0A` +
            `Vence: ${patient.empamFecha||'—'}%0A` +
            `TUG Pre: ${patient.tugPre||'—'} → Post: ${patient.tugPost||'—'}%0A` +
            `HAQ Pre: ${patient.haqPre||'—'} → Post: ${patient.haqPost||'—'}%0A` +
            `Asistencia: ${patient.totalPresencias||0}/${patient.totalSesiones||24} sesiones`;
          window.open(`https://wa.me/?text=${txt}`,'_blank');
        },
        style:{marginTop:10,background:'#25D366',color:'#fff',border:'none',borderRadius:10,
               padding:'8px 16px',fontSize:13,fontWeight:700,cursor:'pointer',width:'auto'}
      },'📲 Compartir por WhatsApp')
    ),
    React.createElement('div',{className:'tabs'},
      [['general','General'],['clinico','Clínico'],['asistencia','Asistencia'],['editar','✏️ Editar']]
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
function ViewAlertas({patients,onPatient}){
  const [tab,setTab]=useState('empam');
  const vencidos =patients.filter(p=>p.empamEstado?.includes('VENCIDO'));
  const prontos  =patients.filter(p=>p.empamEstado?.includes('PRONTO'));
  const pendientes=patients.filter(p=>p.empamEstado?.includes('PEND'));
  const bajo     =patients.filter(p=>p.alertaAsist?.includes('BAJO'));

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
              React.createElement('span',{style:{fontSize:12,color:'#777'}},` Vence: ${formatDate(p.empamFecha)}`)
          )
        ),
        React.createElement('span',{style:{fontSize:20,color:'#ccc'}},'›')
      ))
    );
  }

  return React.createElement('div',{className:'page'},
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
function ViewConfig({patients,setPatients,toast,syncConfig,setSyncConfig,userSession,onSync}){
  const [tab,setTab]       = useState('general');
  const [urlInput,setUrl]  = useState(syncConfig?.url||'');
  const [testing,setTest]  = useState(false);

  function saveUrl(){
    const cfg = {...(syncConfig||{}), url:urlInput, enabled:!!urlInput};
    setSyncConfig(cfg);
    toast(urlInput ? '✅ URL guardada · Sync activado' : '⚠️ Sync desactivado');
  }

  async function testConnection(){
    if(!urlInput){ toast('❌ Pega primero la URL del Apps Script'); return; }
    setTest(true);
    try{
      const r = await fetch(urlInput);
      const j = await r.json();
      if(j.ok) toast('✅ Conexión exitosa con Google Sheets');
      else toast('⚠️ Respondió pero con error');
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
      // Estado actual
      React.createElement('div',{className:'card',style:{
        background: syncConfig?.enabled ? '#D5F5E3' : '#FEF9E7',
        border:`1.5px solid ${syncConfig?.enabled ? '#1E8449' : '#F4D03F'}`
      }},
        React.createElement('div',{style:{fontWeight:800,fontSize:15,marginBottom:4}},
          syncConfig?.enabled ? '✅ Sync activo' : '⚠️ Sync no configurado'),
        React.createElement('div',{style:{fontSize:13,color:'#555',lineHeight:1.5}},
          syncConfig?.enabled
            ? 'Los datos se sincronizan con Google Sheets automáticamente.'
            : 'Configura la URL para compartir datos con tu equipo en tiempo real.')
      ),

      // Instrucciones
      React.createElement('div',{className:'card'},
        React.createElement('div',{className:'card-title'},'📋 Cómo configurar — 3 pasos'),
        [
          '1. Crea un Google Sheets nuevo en Drive',
          '2. Ve a Extensiones → Apps Script → pega el código del script',
          '3. Despliega como "Aplicación web" → copia la URL y pégala abajo',
        ].map((s,i)=>React.createElement('div',{key:i,style:{
          fontSize:13,padding:'8px 0',borderBottom:'1px solid #f0f0f0',
          display:'flex',gap:10,color:'#444',lineHeight:1.5
        }},s))
      ),

      // URL input
      React.createElement('div',{className:'card'},
        React.createElement('div',{className:'card-title'},'URL del Apps Script'),
        React.createElement(Field,{label:'Pega aquí la URL de tu script'},
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

      // Sync manual
      syncConfig?.enabled && React.createElement('div',{className:'btn-row'},
        React.createElement('button',{className:'btn btn-ghost',
          onClick:()=>onSync&&onSync('pull')
        },'⬇️ Recibir datos del equipo'),
        React.createElement('button',{className:'btn btn-primary',
          onClick:()=>onSync&&onSync('push')
        },'⬆️ Enviar mis datos')
      )
    ),

    // ── DATOS ─────────────────────────────────────────────────────────
    tab==='datos' && React.createElement('div',null,
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

// ── BIBLIOTECA DE EJERCICIOS MAS AMA ────────────────────────────────
const EJERCICIOS_FISICOS = [
  // CALENTAMIENTO
  { id:'f01', cat:'🔥 Calentamiento', nombre:'Marcha en el lugar', desc:'Levantando rodillas, brazos alternos', min:3, mat:'' },
  { id:'f02', cat:'🔥 Calentamiento', nombre:'Rotación de hombros', desc:'Circular hacia adelante y atrás, 10 rep cada sentido', min:2, mat:'' },
  { id:'f03', cat:'🔥 Calentamiento', nombre:'Flexión y extensión de tobillo', desc:'Sentado, punta-talón alternado, 15 rep', min:2, mat:'' },
  { id:'f04', cat:'🔥 Calentamiento', nombre:'Rotación de cuello', desc:'Suave, media luna de hombro a hombro, 5 rep', min:2, mat:'' },
  // FUERZA
  { id:'f05', cat:'💪 Fuerza', nombre:'Sentadilla en silla', desc:'Pararse y sentarse con apoyo de silla, 3×10', min:5, mat:'Silla' },
  { id:'f06', cat:'💪 Fuerza', nombre:'Press de hombros con banda', desc:'Banda elástica, empuje hacia arriba, 3×12', min:5, mat:'Banda elástica' },
  { id:'f07', cat:'💪 Fuerza', nombre:'Curl de bíceps con banda', desc:'Flexión de codo con banda, 3×12', min:5, mat:'Banda elástica' },
  { id:'f08', cat:'💪 Fuerza', nombre:'Extensión de rodilla sentado', desc:'Extender pierna, sostener 3 seg, 3×10 cada lado', min:5, mat:'Silla' },
  { id:'f09', cat:'💪 Fuerza', nombre:'Elevación de talones de pie', desc:'Apoyo en silla, subir talones, 3×15', min:4, mat:'Silla' },
  { id:'f10', cat:'💪 Fuerza', nombre:'Abducción de cadera con banda', desc:'De pie, separar pierna lateral, 3×10', min:5, mat:'Banda elástica' },
  // EQUILIBRIO
  { id:'f11', cat:'⚖️ Equilibrio', nombre:'Apoyo unipodal', desc:'Un pie, apoyo silla si necesario, 30 seg cada lado', min:3, mat:'Silla' },
  { id:'f12', cat:'⚖️ Equilibrio', nombre:'Tándem estático', desc:'Un pie delante del otro, 30 seg, ojos abiertos/cerrados', min:3, mat:'' },
  { id:'f13', cat:'⚖️ Equilibrio', nombre:'Marcha en tándem', desc:'Caminar en línea recta talón-punta, 5 metros ida y vuelta', min:4, mat:'' },
  { id:'f14', cat:'⚖️ Equilibrio', nombre:'Transferencia de peso lateral', desc:'Desplazar peso de pie a pie, lento y controlado, 10 rep', min:3, mat:'' },
  { id:'f15', cat:'⚖️ Equilibrio', nombre:'Alcance funcional', desc:'Alcanzar objeto al frente sin mover pies, 10 rep', min:3, mat:'Objeto' },
  // FLEXIBILIDAD
  { id:'f16', cat:'🧘 Flexibilidad', nombre:'Estiramiento isquiotibiales', desc:'Sentado, extender pierna, inclinar tronco, 30 seg cada lado', min:3, mat:'Silla' },
  { id:'f17', cat:'🧘 Flexibilidad', nombre:'Estiramiento de cuádriceps', desc:'De pie con apoyo, talón al glúteo, 30 seg cada lado', min:3, mat:'Silla' },
  { id:'f18', cat:'🧘 Flexibilidad', nombre:'Rotación de tronco sentado', desc:'Manos en hombros, girar tronco, 10 rep cada lado', min:3, mat:'Silla' },
  { id:'f19', cat:'🧘 Flexibilidad', nombre:'Estiramiento de pantorrilla', desc:'Un pie atrás, talón al suelo, 30 seg cada lado', min:3, mat:'Pared' },
  // VUELTA A LA CALMA
  { id:'f20', cat:'🌿 Vuelta a la calma', nombre:'Respiración diafragmática', desc:'Mano en abdomen, inhalar 4s / exhalar 6s, 5 rep', min:3, mat:'' },
  { id:'f21', cat:'🌿 Vuelta a la calma', nombre:'Estiramiento cervical', desc:'Inclinar cabeza lateral suave, 30 seg cada lado', min:2, mat:'' },
  { id:'f22', cat:'🌿 Vuelta a la calma', nombre:'Estiramiento de brazos y espalda', desc:'Entrelazar manos, empujar al frente, 30 seg', min:2, mat:'' },
];

const EJERCICIOS_COGNITIVOS = [
  // MEMORIA
  { id:'c01', cat:'🧠 Memoria', nombre:'Secuencia de palabras', desc:'Leer 5 palabras, esperar 2 min, recordar. Aumentar dificultad', min:5, mat:'Cuaderno' },
  { id:'c02', cat:'🧠 Memoria', nombre:'Historia con detalles', desc:'Contar historia breve, preguntar detalles específicos', min:7, mat:'' },
  { id:'c03', cat:'🧠 Memoria', nombre:'Recuerdo de lista de compras', desc:'Memorizar 8 productos, distractores, recordar', min:5, mat:'Cuaderno' },
  { id:'c04', cat:'🧠 Memoria', nombre:'Memoria episódica', desc:'¿Qué hicieron el fin de semana? Detalles: lugar, personas, hora', min:5, mat:'' },
  // ATENCIÓN
  { id:'c05', cat:'🎯 Atención', nombre:'Búsqueda de letras', desc:'Tachar letra específica en texto, contar errores y tiempo', min:5, mat:'Hoja, lápiz' },
  { id:'c06', cat:'🎯 Atención', nombre:'Secuencia numérica', desc:'Contar de 3 en 3 desde 1 hasta 30, luego al revés', min:4, mat:'' },
  { id:'c07', cat:'🎯 Atención', nombre:'Cancelación de símbolos', desc:'Marcar símbolo específico entre varios, contra el tiempo', min:5, mat:'Hoja preparada' },
  { id:'c08', cat:'🎯 Atención', nombre:'Dígitos directo e inverso', desc:'Repetir secuencia de números, luego en orden inverso', min:4, mat:'' },
  // LENGUAJE
  { id:'c09', cat:'💬 Lenguaje', nombre:'Fluidez verbal semántica', desc:'Nombrar animales en 1 minuto. Normal: >12 palabras', min:3, mat:'Cronómetro' },
  { id:'c10', cat:'💬 Lenguaje', nombre:'Denominación de objetos', desc:'Mostrar imágenes, nombrar correctamente', min:5, mat:'Imágenes' },
  { id:'c11', cat:'💬 Lenguaje', nombre:'Completar refranes', desc:'Iniciar refrán conocido, completar. Ej: "No por mucho madrugar..."', min:5, mat:'' },
  { id:'c12', cat:'💬 Lenguaje', nombre:'Categorías y ejemplos', desc:'Decir 3 frutas, 3 países, 3 animales marinos, etc.', min:5, mat:'' },
  // FUNCIONES EJECUTIVAS
  { id:'c13', cat:'⚙️ Funciones Ejecutivas', nombre:'Stroop color-palabra', desc:'Leer color de tinta (no la palabra). Versión básica adaptada', min:5, mat:'Hoja preparada' },
  { id:'c14', cat:'⚙️ Funciones Ejecutivas', nombre:'Torre de bloques', desc:'Construir torre siguiendo modelo de 5 pasos', min:7, mat:'Bloques o fichas' },
  { id:'c15', cat:'⚙️ Funciones Ejecutivas', nombre:'Planificación de actividad', desc:'Organizar pasos para hacer un sándwich/ir al banco', min:5, mat:'' },
  // HABILIDADES VISOESPACIALES
  { id:'c16', cat:'🗺️ Visoespacial', nombre:'Copia de figura', desc:'Copiar figura geométrica compleja, evaluar planificación', min:5, mat:'Hoja, lápiz' },
  { id:'c17', cat:'🗺️ Visoespacial', nombre:'Reloj', desc:'Dibujar reloj marcando una hora específica (ej: 11:10)', min:5, mat:'Hoja, lápiz' },
  { id:'c18', cat:'🗺️ Visoespacial', nombre:'Rompecabezas verbal', desc:'Describir objeto, adivinar cuál es (adivinanzas)', min:5, mat:'' },
  // CÁLCULO
  { id:'c19', cat:'🔢 Cálculo', nombre:'Operaciones simples', desc:'Sumas y restas de 2 cifras, adaptado al nivel del grupo', min:5, mat:'Cuaderno' },
  { id:'c20', cat:'🔢 Cálculo', nombre:'Problemas cotidianos', desc:'¿Cuánto vueldo de $1000 si compro X? Situaciones reales', min:5, mat:'' },
];

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
        e
