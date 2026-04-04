// ═══════════════════════════════════════════════════════════════════════
//  MAS AMA PWA v3 — app.js
//  PIN Lock + Registro Nuevos Pacientes + Export Excel + Sync Sheets
// ═══════════════════════════════════════════════════════════════════════
const { useState, useEffect, useCallback, useMemo, useRef } = React;

// ─────────────────────────────────────────────────────────────────────
// STORAGE
// ─────────────────────────────────────────────────────────────────────
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
function ViewInicio({patients,attendanceLog,onNav}){
  const total    =patients.length;
  const vencidos =patients.filter(p=>p.empamEstado?.includes('VENCIDO')).length;
  const prontos  =patients.filter(p=>p.empamEstado?.includes('PRONTO')).length;
  const bajo     =patients.filter(p=>p.alertaAsist?.includes('BAJO')).length;
  const nuevos   =patients.filter(p=>p.isNew).length;
  const hoyReg   =Object.keys(attendanceLog).filter(k=>k.startsWith(todayISO())).length;

  const tallerStats={};
  patients.forEach(p=>{
    if(!p.taller) return;
    if(!tallerStats[p.taller]) tallerStats[p.taller]={n:0,bajo:0};
    tallerStats[p.taller].n++;
    if(p.alertaAsist?.includes('BAJO')) tallerStats[p.taller].bajo++;
  });

  return React.createElement('div',{className:'page'},
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

    React.createElement('div',{className:'card'},
      React.createElement('div',{className:'card-title'},'⚡ Acceso rápido'),
      React.createElement('div',{className:'btn-row',style:{marginBottom:8}},
        React.createElement('button',{className:'btn btn-primary',onClick:()=>onNav('lista')},'📋 Pasar Lista'),
        React.createElement('button',{className:'btn btn-red',onClick:()=>onNav('alertas')},
          `🚨 Alertas (${vencidos+prontos})`)
      ),
      React.createElement('div',{className:'btn-row'},
        React.createElement('button',{className:'btn btn-ghost',onClick:()=>onNav('nuevo')},'➕ Nuevo Paciente'),
        React.createElement('button',{className:'btn btn-ghost',onClick:()=>onNav('exportar')},'📤 Exportar Excel')
      )
    ),

    hoyReg>0&&React.createElement('div',{className:'card'},
      React.createElement('div',{className:'card-title'},'✅ Registros de hoy'),
      React.createElement('div',{style:{fontSize:16,fontWeight:800,color:'#375623'}},
        `${hoyReg} asistencias marcadas hoy`)),

    Object.keys(tallerStats).length>0&&React.createElement('div',{className:'card'},
      React.createElement('div',{className:'card-title'},'🏃 Resumen por Taller'),
      Object.entries(tallerStats).map(([t,s])=>
        React.createElement('div',{key:t,style:{marginBottom:12}},
          React.createElement('div',{style:{display:'flex',justifyContent:'space-between',marginBottom:4}},
            React.createElement('span',{style:{fontWeight:700,fontSize:13}},t),
            React.createElement('span',{style:{fontSize:12,color:'#777'}},
              `${s.n} pac.${s.bajo>0?` · ${s.bajo} bajo mín.`:''}`)),
          React.createElement(ProgressBar,{value:s.n-s.bajo,max:s.n,
            color:s.bajo>0?'#C00000':'#375623'})))
    )
  );
}

// ─────────────────────────────────────────────────────────────────────
// VIEW: PASAR LISTA
// ─────────────────────────────────────────────────────────────────────
function ViewLista({patients,attendanceLog,setAttendanceLog,toast}){
  const [step,setStep]=useState('taller');
  const [selTaller,setTaller]=useState('');
  const [selFecha,setFecha]=useState(todayISO());
  const [search,setSearch]=useState('');

  const tallerPacs=useMemo(()=>
    patients.filter(p=>p.taller===selTaller&&
      (!search||p.nombre.toLowerCase().includes(search.toLowerCase())||p.rut.includes(search))),
    [patients,selTaller,search]);

  function attKey(rut){ return `${selFecha}||${selTaller}||${rut}`; }
  function getAtt(rut){ return attendanceLog[attKey(rut)]||null; }
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

  const present=tallerPacs.filter(p=>getAtt(p.rut||p.id)==='P').length;
  const absent =tallerPacs.filter(p=>getAtt(p.rut||p.id)==='A').length;
  const sin    =tallerPacs.length-present-absent;

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
        React.createElement('button',{className:'btn btn-primary',onClick:()=>setStep('lista'),disabled:!selFecha},
          `Ver lista`)
      )
    )
  );

  return React.createElement('div',{className:'page'},
    React.createElement('div',{className:'card',style:{marginBottom:10}},
      React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center'}},
        React.createElement('div',null,
          React.createElement('div',{style:{fontWeight:800,fontSize:15}},selTaller),
          React.createElement('div',{style:{fontSize:13,color:'#777'}},selFecha)),
        React.createElement('div',{style:{fontWeight:700,fontSize:14}},
          React.createElement('span',{style:{color:'#375623'}},`✅${present} `),
          React.createElement('span',{style:{color:'#C00000'}},`❌${absent} `),
          React.createElement('span',{style:{color:'#aaa'}},`○${sin}`)
        )
      )
    ),
    React.createElement('div',{className:'btn-row',style:{marginBottom:10}},
      React.createElement('button',{className:'btn btn-ghost btn-sm',onClick:()=>setStep('taller')},'← Taller'),
      React.createElement('button',{className:'btn btn-green btn-sm',onClick:()=>marcarTodos('P')},'✅ Todos Pres.'),
      React.createElement('button',{className:'btn btn-red btn-sm',onClick:()=>marcarTodos('A')},'❌ Todos Aus.')
    ),
    React.createElement('div',{className:'search-wrap'},
      React.createElement('span',{className:'search-icon'},'🔍'),
      React.createElement('input',{type:'text',placeholder:'Buscar...',value:search,onChange:e=>setSearch(e.target.value)})
    ),
    tallerPacs.length===0
      ?React.createElement('div',{className:'empty-state'},
          React.createElement('div',{className:'emoji'},'👥'),
          React.createElement('p',null,'Sin pacientes para este taller'))
      :tallerPacs.map(p=>{
        const key=p.rut||p.id; const att=getAtt(key);
        return React.createElement('div',{key:p.id,className:'att-row'},
          React.createElement(Avatar,{sexo:p.sexo,nombre:p.nombre}),
          React.createElement('div',{style:{flex:1,minWidth:0}},
            React.createElement('div',{className:'att-name'},p.nombre),
            React.createElement('div',{className:'att-sub'},
              `${p.edad?p.edad+' años · ':''}${p.empamEstado||''}`)
          ),
          React.createElement('div',{className:'att-toggle'},
            React.createElement('button',{className:`att-btn ${att==='P'?'p-on':'p-off'}`,onClick:()=>setAtt(key,'P')},att==='P'?'✅':'P'),
            React.createElement('button',{className:`att-btn ${att==='A'?'a-on':'a-off'}`,onClick:()=>setAtt(key,'A')},att==='A'?'❌':'A')
          )
        );
      }),
    React.createElement('div',{style:{marginTop:14}},
      React.createElement('button',{className:'btn btn-green',
        onClick:()=>toast(`💾 Lista guardada — ${present} presentes, ${absent} ausentes`)},
        '💾 Confirmar Lista'))
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
      )
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
      React.createElement(SectionHdr,null,'Evaluación PRE'),
      React.createElement('div',{className:'detail-grid'},
        React.createElement(DetailItem,{label:'TUG Pre (seg)',value:patient.tugPre}),
        React.createElement(DetailItem,{label:'HAQ Pre',value:patient.haqPre}),
        React.createElement(DetailItem,{label:'EUP Der Pre',value:patient.eupDerPre}),
        React.createElement(DetailItem,{label:'EUP Izq Pre',value:patient.eupIzqPre}),
        React.createElement(DetailItem,{label:'Vel. Derecha',value:patient.velDerPre}),
        React.createElement(DetailItem,{label:'Vel. Izquierda',value:patient.velIzqPre}),
        React.createElement(DetailItem,{label:'CAT Interna',value:patient.catInt}),
        React.createElement(DetailItem,{label:'CAT Externa',value:patient.catExt})
      ),
      React.createElement(SectionHdr,null,'Evaluación POST'),
      React.createElement('div',{className:'detail-grid'},
        React.createElement(DetailItem,{label:'TUG Post',value:patient.tugPost}),
        React.createElement(DetailItem,{label:'HAQ Post',value:patient.haqPost}),
        React.createElement(DetailItem,{label:'EUP Der Post',value:patient.eupDerPost}),
        React.createElement(DetailItem,{label:'EUP Izq Post',value:patient.eupIzqPost})
      ),
      React.createElement(SectionHdr,null,'Resultados'),
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
function ViewConfig({patients,setPatients,toast}){
  const [loading,setLoading]=useState(false);
  const [pinActual,setPinActual]=useState('');
  const [pinNuevo,setPinNuevo]=useState('');
  const [pinConf,setPinConf]=useState('');
  const fileRef=useRef();

  async function handleFile(e){
    const file=e.target.files[0]; if(!file) return;
    setLoading(true);
    try{
      const parsed=await parseMaestroExcel(file);
      setPatients(parsed); DB.set('patients',parsed);
      toast(`✅ ${parsed.length} pacientes importados`);
    }catch(err){ toast(`❌ ${err}`); }
    setLoading(false); e.target.value='';
  }

  function cambiarPin(){
    const saved=DB.get('appPin',DEFAULT_PIN);
    if(pinActual!==saved){ toast('❌ PIN actual incorrecto'); return; }
    if(pinNuevo.length!==4||!/^\d{4}$/.test(pinNuevo)){ toast('❌ El nuevo PIN debe tener 4 dígitos'); return; }
    if(pinNuevo!==pinConf){ toast('❌ Los PINs no coinciden'); return; }
    DB.set('appPin',pinNuevo);
    setPinActual(''); setPinNuevo(''); setPinConf('');
    toast('✅ PIN cambiado correctamente');
  }

  function clearAll(){
    if(!confirm('¿Borrar todos los datos? No se puede deshacer.')) return;
    DB.del('patients'); DB.del('attendanceLog');
    setPatients([]); toast('🗑️ Datos eliminados');
  }

  return React.createElement('div',{className:'page'},
    // Import
    React.createElement('div',{className:'card'},
      React.createElement('div',{className:'card-title'},'📂 Importar Maestro Excel'),
      React.createElement('p',{style:{fontSize:13,color:'#777',marginBottom:14}},
        'Importa el MAESTRO_MAS_AMA_PRO_2026.xlsx. Los datos quedan guardados en el celular para usarse sin internet.'),
      loading
        ?React.createElement('div',{className:'spinner'})
        :React.createElement('div',{className:'import-zone',onClick:()=>fileRef.current?.click()},
            React.createElement('div',{className:'import-icon'},'📊'),
            React.createElement('p',null,'Toca para seleccionar el archivo Excel')),
      React.createElement('input',{ref:fileRef,type:'file',accept:'.xlsx,.xls',
        style:{display:'none'},onChange:handleFile}),
      patients.length>0&&React.createElement('div',{style:{marginTop:12,padding:'10px 14px',
        background:'#E2EFDA',borderRadius:10,fontSize:14,fontWeight:700,color:'#375623'}},
        `✅ ${patients.length} pacientes · ${[...new Set(patients.map(p=>p.taller).filter(Boolean))].length} talleres cargados`)
    ),

    // Cambiar PIN
    React.createElement('div',{className:'card'},
      React.createElement('div',{className:'card-title'},'🔒 Cambiar PIN de Acceso'),
      React.createElement('p',{style:{fontSize:13,color:'#777',marginBottom:12}},
        'PIN actual por defecto: 1234. Comparte el PIN con tu equipo de trabajo.'),
      React.createElement(Field,{label:'PIN actual (4 dígitos)'},
        React.createElement('input',{type:'password',inputMode:'numeric',maxLength:4,
          value:pinActual,onChange:e=>setPinActual(e.target.value),placeholder:'••••'})),
      React.createElement(Field,{label:'Nuevo PIN (4 dígitos)'},
        React.createElement('input',{type:'password',inputMode:'numeric',maxLength:4,
          value:pinNuevo,onChange:e=>setPinNuevo(e.target.value),placeholder:'••••'})),
      React.createElement(Field,{label:'Confirmar nuevo PIN'},
        React.createElement('input',{type:'password',inputMode:'numeric',maxLength:4,
          value:pinConf,onChange:e=>setPinConf(e.target.value),placeholder:'••••'})),
      React.createElement('button',{className:'btn btn-primary btn-sm',onClick:cambiarPin},'🔒 Cambiar PIN')
    ),

    // Peligro
    patients.length>0&&React.createElement('div',{className:'card'},
      React.createElement('div',{className:'card-title'},'⚠️ Zona de peligro'),
      React.createElement('p',{style:{fontSize:13,color:'#777',marginBottom:10}},
        'Esto borra todos los datos del celular. Los datos del Excel original no se modifican.'),
      React.createElement('button',{className:'btn btn-red',onClick:clearAll},'🗑️ Borrar todos los datos')
    )
  );
}

// ─────────────────────────────────────────────────────────────────────
// APP SHELL
// ─────────────────────────────────────────────────────────────────────
function App(){
  // PIN: use sessionStorage so it always asks on fresh browser open
  const [unlocked,setUnlocked] = useState(()=>{
    try{ return sessionStorage.getItem('masama_unlocked')==='1'; }catch{ return false; }
  });
  const [view,setView]         = useState('inicio');
  const [patients,setPatients] = useState(()=>DB.get('patients',[]));
  const [attendanceLog,setAL]  = useState(()=>DB.get('attendanceLog',{}));
  const [selPatient,setSel]    = useState(null);
  const [toastMsg,setToast]    = useState('');

  // Store unlock in sessionStorage (clears when browser/tab closes)
  useEffect(()=>{
    try{ if(unlocked) sessionStorage.setItem('masama_unlocked','1');
         else sessionStorage.removeItem('masama_unlocked'); }catch{}
  },[unlocked]);

  function toast(msg){ setToast(msg); setTimeout(()=>setToast(''),2600); }
  function openPatient(p){ setSel(p); setView('ficha'); }
  function goBack(){
    if(view==='ficha'){ setSel(null); setView('pacientes'); }
    else if(view==='nuevo'){ setView('pacientes'); }
    else setView('inicio');
  }

  const hasData=patients.length>0;
  const alertCount=patients.filter(p=>
    p.empamEstado?.includes('VENCIDO')||p.empamEstado?.includes('PRONTO')||p.alertaAsist?.includes('BAJO')
  ).length;
  const hasBack=['ficha','nuevo'].includes(view);
  const titles={inicio:'MAS AMA 2026',lista:'Pasar Lista',pacientes:'Pacientes',
    nuevo:'Nuevo Paciente',ficha:selPatient?.nombre?.split(' ').slice(0,2).join(' ')||'Ficha',
    alertas:'Alertas',exportar:'Exportar Excel',config:'Configuración'};

  const navItems=[
    {id:'inicio',icon:'🏠',label:'Inicio'},
    {id:'lista',icon:'📋',label:'Lista'},
    {id:'pacientes',icon:'👥',label:'Pacientes'},
    {id:'alertas',icon:'🚨',label:'Alertas',dot:alertCount>0},
    {id:'config',icon:'⚙️',label:'Config'},
  ];

  if(!unlocked) return React.createElement(PinScreen,{onUnlock:()=>setUnlocked(true)});

  return React.createElement('div',{id:'app'},
    React.createElement('div',{className:'top-bar'},
      hasBack&&React.createElement('button',{className:'back-btn',onClick:goBack},'←'),
      React.createElement('h1',null,titles[view]||'MAS AMA'),
      !hasBack&&alertCount>0&&
        React.createElement('span',{className:'badge',onClick:()=>setView('alertas')},alertCount),
      !hasBack&&React.createElement('button',{className:'top-icon-btn',onClick:()=>setView('exportar')},'📤')
    ),

    !hasData&&view!=='config'
      ?React.createElement('div',{className:'page',style:{textAlign:'center',paddingTop:50}},
          React.createElement('div',{style:{fontSize:64,marginBottom:16}},'🏃'),
          React.createElement('h2',{style:{fontWeight:900,fontSize:22,marginBottom:8}},'MAS AMA'),
          React.createElement('p',{style:{color:'#777',fontSize:15,marginBottom:24,lineHeight:1.5}},
            'Importa el Maestro Excel para comenzar.'),
          React.createElement('button',{className:'btn btn-primary',
            style:{maxWidth:280,margin:'0 auto'},onClick:()=>setView('config')},
            '📂 Importar Maestro'))
      :view==='inicio'   ?React.createElement(ViewInicio,{patients,attendanceLog,onNav:setView})
      :view==='lista'    ?React.createElement(ViewLista,{patients,attendanceLog,setAttendanceLog:setAL,toast})
      :view==='pacientes'?React.createElement(ViewPacientes,{patients,onPatient:openPatient,onNuevo:()=>setView('nuevo')})
      :view==='nuevo'    ?React.createElement(ViewNuevo,{patients,setPatients,toast,onBack:goBack})
      :view==='ficha'    ?React.createElement(ViewFicha,{patient:selPatient,patients,setPatients,toast})
      :view==='alertas'  ?React.createElement(ViewAlertas,{patients,onPatient:openPatient})
      :view==='exportar' ?React.createElement(ViewExportar,{patients,attendanceLog,toast})
      :view==='config'   ?React.createElement(ViewConfig,{patients,setPatients,toast})
      :null,

    React.createElement('nav',{className:'bottom-nav'},
      navItems.map(item=>React.createElement('button',{key:item.id,
        className:`nav-item ${view===item.id?'active':''}`,onClick:()=>setView(item.id)},
        React.createElement('span',{className:'icon'},item.icon),
        React.createElement('span',{className:'label'},item.label),
        item.dot&&React.createElement('span',{className:'nav-dot'})
      ))
    ),
    toastMsg&&React.createElement(Toast,{msg:toastMsg,onDone:()=>setToast('')})
  );
}

const root=ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(App));
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{ navigator.serviceWorker.register('/sw.js').catch(()=>{}); });
}
