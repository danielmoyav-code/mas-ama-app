// ═══════════════════════════════════════════════════════════════
//  VIEWS
// ═══════════════════════════════════════════════════════════════

// ── VIEW: INICIO / DASHBOARD ─────────────────────────────────
function ViewInicio({ patients, attendanceLog, onNav, onPatient }) {
  const total   = patients.length;
  const vencido = patients.filter(p => p.empamEstado?.includes('VENCIDO')).length;
  const pronto  = patients.filter(p => p.empamEstado?.includes('PRONTO')).length;
  const pendiente= patients.filter(p => p.empamEstado?.includes('PEND')).length;
  const bajo    = patients.filter(p => p.alertaAsist?.includes('BAJO')).length;

  const hoySesion = Object.keys(attendanceLog).filter(k => k.startsWith(todayISO())).length;

  const tallerStats = {};
  patients.forEach(p => {
    if (!p.taller) return;
    if (!tallerStats[p.taller]) tallerStats[p.taller] = { n: 0, bajo: 0 };
    tallerStats[p.taller].n++;
    if (p.alertaAsist?.includes('BAJO')) tallerStats[p.taller].bajo++;
  });

  return React.createElement('div', { className: 'page' },
    // KPIs
    React.createElement('div', { className: 'kpi-grid' },
      React.createElement('div', { className: 'kpi-card info' },
        React.createElement('div', { className: 'kpi-val' }, total),
        React.createElement('div', { className: 'kpi-lbl' }, 'Total Pacientes')),
      React.createElement('div', { className: 'kpi-card danger' },
        React.createElement('div', { className: 'kpi-val' }, vencido),
        React.createElement('div', { className: 'kpi-lbl' }, 'EMPAM Vencido')),
      React.createElement('div', { className: 'kpi-card warn' },
        React.createElement('div', { className: 'kpi-val' }, pronto),
        React.createElement('div', { className: 'kpi-lbl' }, 'Vence Pronto')),
      React.createElement('div', { className: 'kpi-card danger' },
        React.createElement('div', { className: 'kpi-val' }, bajo),
        React.createElement('div', { className: 'kpi-lbl' }, 'Bajo Mín. Asist'))
    ),

    // Acceso rápido
    React.createElement('div', { className: 'card' },
      React.createElement('div', { className: 'card-title' }, '⚡ Acceso Rápido'),
      React.createElement('div', { style: { display:'flex', flexDirection:'column', gap:8 } },
        React.createElement('button', { className: 'btn btn-primary', onClick: () => onNav('lista') },
          '📋 Pasar Lista Hoy'),
        React.createElement('button', { className: 'btn btn-red', onClick: () => onNav('alertas') },
          `🚨 Ver Alertas EMPAM (${vencido + pronto})`)
      )
    ),

    // Hoy
    hoySesion > 0 && React.createElement('div', { className: 'card' },
      React.createElement('div', { className: 'card-title' }, '✅ Registros de hoy'),
      React.createElement('div', null, `${hoySesion} asistencias marcadas hoy`),
    ),

    // Resumen talleres
    React.createElement('div', { className: 'card' },
      React.createElement('div', { className: 'card-title' }, '🏃 Resumen por Taller'),
      Object.entries(tallerStats).map(([t, s]) =>
        React.createElement('div', { key: t, style:{ marginBottom:10 } },
          React.createElement('div', { style:{ display:'flex', justifyContent:'space-between', marginBottom:4 } },
            React.createElement('span', { style:{ fontWeight:700, fontSize:13 } }, t),
            React.createElement('span', { style:{ fontSize:12, color:'#666' } },
              `${s.n} pac${s.bajo > 0 ? ` · ${s.bajo} bajo mín.` : ''}`)
          ),
          React.createElement(ProgressBar, { value: s.n - s.bajo, max: s.n,
            color: s.bajo > 0 ? '#C00000' : '#375623' })
        )
      )
    )
  );
}

// ── VIEW: PASAR LISTA ─────────────────────────────────────────
function ViewLista({ patients, attendanceLog, setAttendanceLog, toast, talleres }) {
  const [step, setStep]         = useState('taller'); // taller → fecha → lista
  const [selTaller, setTaller]  = useState('');
  const [selFecha, setFecha]    = useState(todayISO());
  const [search, setSearch]     = useState('');
  const [saved, setSaved]       = useState(false);

  const tallerPacientes = useMemo(() =>
    patients.filter(p => p.taller === selTaller &&
      (search === '' || p.nombre.toLowerCase().includes(search.toLowerCase()) ||
       p.rut.includes(search))),
    [patients, selTaller, search]);

  function attKey(rut) { return `${selFecha}||${selTaller}||${rut}`; }
  function getAtt(rut) { return attendanceLog[attKey(rut)] || null; }
  function setAtt(rut, val) {
    const k = attKey(rut);
    const next = { ...attendanceLog };
    if (next[k] === val) { delete next[k]; } else { next[k] = val; }
    setAttendanceLog(next);
    DB.set('attendanceLog', next);
  }

  const present = tallerPacientes.filter(p => getAtt(p.rut || p.id) === 'P').length;
  const absent  = tallerPacientes.filter(p => getAtt(p.rut || p.id) === 'A').length;
  const sin     = tallerPacientes.length - present - absent;

  function marcarTodos(val) {
    const next = { ...attendanceLog };
    tallerPacientes.forEach(p => { next[attKey(p.rut || p.id)] = val; });
    setAttendanceLog(next);
    DB.set('attendanceLog', next);
  }

  function guardar() {
    DB.set('attendanceLog', attendanceLog);
    setSaved(true);
    toast(`✅ Lista guardada — ${selFecha}`);
    setTimeout(() => setSaved(false), 2000);
  }

  if (step === 'taller') return React.createElement('div', { className: 'page' },
    React.createElement('div', { className: 'card' },
      React.createElement('div', { className: 'card-title' }, '1 — Selecciona el Taller'),
      React.createElement(TallerSelector, { selected: selTaller, onSelect: (t) => {
        setTaller(t); setStep('fecha');
      }, talleres })
    )
  );

  if (step === 'fecha') return React.createElement('div', { className: 'page' },
    React.createElement('div', { className: 'card' },
      React.createElement('div', { className: 'card-title' }, `2 — Fecha de Sesión`),
      React.createElement('div', { className: 'field' },
        React.createElement('label', null, 'Fecha'),
        React.createElement('input', { type: 'date', value: selFecha,
          onChange: e => setFecha(e.target.value) })
      ),
      React.createElement('div', { style:{ display:'flex', gap:8 } },
        React.createElement('button', { className:'btn btn-ghost btn-sm', style:{flex:1},
          onClick: () => setStep('taller') }, '← Volver'),
        React.createElement('button', { className:'btn btn-primary', style:{flex:2},
          onClick: () => setStep('lista'), disabled: !selFecha },
          `Ver lista de ${selTaller}`)
      )
    )
  );

  // step === 'lista'
  return React.createElement('div', { className: 'page' },
    // Header info
    React.createElement('div', { className: 'card', style:{marginBottom:10} },
      React.createElement('div', { style:{display:'flex', justifyContent:'space-between', alignItems:'center'} },
        React.createElement('div', null,
          React.createElement('div', { style:{fontWeight:800, fontSize:15} }, selTaller),
          React.createElement('div', { style:{fontSize:13, color:'#666'} }, selFecha)
        ),
        React.createElement('div', { style:{textAlign:'right', fontSize:13} },
          React.createElement('span', { style:{color:'#375623', fontWeight:700} }, `✅ ${present}`),
          React.createElement('span', { style:{color:'#999', margin:'0 4px'} }, '·'),
          React.createElement('span', { style:{color:'#C00000', fontWeight:700} }, `❌ ${absent}`),
          React.createElement('span', { style:{color:'#999', margin:'0 4px'} }, '·'),
          React.createElement('span', { style:{color:'#888'} }, `○ ${sin}`)
        )
      )
    ),

    // Actions
    React.createElement('div', { style:{display:'flex', gap:6, marginBottom:10} },
      React.createElement('button', { className:'btn btn-ghost btn-sm', style:{flex:1},
        onClick: () => setStep('taller') }, '← Taller'),
      React.createElement('button', { className:'btn btn-green btn-sm', style:{flex:2},
        onClick: () => marcarTodos('P') }, '✅ Todos Presente'),
      React.createElement('button', { className:'btn btn-red btn-sm', style:{flex:1},
        onClick: () => marcarTodos('A') }, '❌ Todos Aus.')
    ),

    // Search
    React.createElement('div', { className: 'search-bar' },
      React.createElement('span', { className: 'search-icon' }, '🔍'),
      React.createElement('input', { type:'text', placeholder:'Buscar paciente...',
        value: search, onChange: e => setSearch(e.target.value),
        style:{ width:'100%', padding:'10px 12px 10px 38px', border:'1.5px solid #ddd',
                borderRadius:10, fontSize:15, background:'#fff' }})
    ),

    // Patient list
    tallerPacientes.length === 0
      ? React.createElement('div', { className:'empty-state' },
          React.createElement('div', { className:'emoji' }, '👥'),
          React.createElement('p', null, 'No hay pacientes para este taller'))
      : React.createElement('div', null,
          tallerPacientes.map(p => {
            const key = p.rut || p.id;
            const att = getAtt(key);
            return React.createElement('div', { key: p.id, className: 'att-row' },
              React.createElement(Avatar, { sexo: p.sexo, nombre: p.nombre }),
              React.createElement('div', { className: 'att-name' }, p.nombre),
              React.createElement('div', { className: 'att-toggle' },
                React.createElement('button', {
                  className: `att-btn presente ${att === 'P' ? 'selected-p' : ''}`,
                  onClick: () => setAtt(key, 'P')
                }, att === 'P' ? '✅' : 'P'),
                React.createElement('button', {
                  className: `att-btn ausente ${att === 'A' ? 'selected-a' : ''}`,
                  onClick: () => setAtt(key, 'A')
                }, att === 'A' ? '❌' : 'A')
              )
            );
          })
        ),

    // Save btn
    React.createElement('div', { style:{marginTop:16} },
      React.createElement('button', { className:`btn ${saved ? 'btn-ghost' : 'btn-green'}`,
        onClick: guardar }, saved ? '✅ Guardado' : '💾 Guardar Lista')
    )
  );
}

// ── VIEW: PACIENTES ───────────────────────────────────────────
function ViewPacientes({ patients, onPatient }) {
  const [search, setSearch]   = useState('');
  const [filterTaller, setFT] = useState('');
  const [filterEmpam, setFE]  = useState('');
  const [tab, setTab]         = useState('todos');

  const filtered = useMemo(() => {
    return patients.filter(p => {
      const matchSearch = !search || p.nombre.toLowerCase().includes(search.toLowerCase()) ||
                          p.rut.includes(search);
      const matchTaller = !filterTaller || p.taller === filterTaller;
      const matchEmpam  = !filterEmpam  || p.empamEstado?.includes(filterEmpam);
      const matchTab = tab === 'todos' || tab === 'alertas'
        ? (!filterEmpam || matchEmpam) && (!filterTaller || matchTaller)
        : true;
      if (tab === 'alertas')
        return matchSearch && (p.empamEstado?.includes('VENCIDO') ||
          p.empamEstado?.includes('PRONTO') || p.alertaAsist?.includes('BAJO'));
      return matchSearch && matchTaller && matchEmpam;
    });
  }, [patients, search, filterTaller, filterEmpam, tab]);

  const talleres = [...new Set(patients.map(p => p.taller).filter(Boolean))].sort();

  return React.createElement('div', { className: 'page' },
    // Tabs
    React.createElement('div', { className: 'tabs' },
      [['todos','Todos'],['alertas','🚨 Alertas']].map(([v,l]) =>
        React.createElement('div', { key:v, className:`tab ${tab===v?'active':''}`,
          onClick: () => { setTab(v); setFT(''); setFE(''); } }, l)
      )
    ),

    // Search
    React.createElement('div', { className: 'search-bar' },
      React.createElement('span', { className: 'search-icon' }, '🔍'),
      React.createElement('input', { type:'text', placeholder:'Nombre o RUT...',
        value: search, onChange: e => setSearch(e.target.value),
        style:{ width:'100%', padding:'10px 12px 10px 38px', border:'1.5px solid #ddd',
                borderRadius:10, fontSize:15 }})
    ),

    // Filters
    tab === 'todos' && React.createElement('div', { style:{display:'flex', gap:8, marginBottom:12} },
      React.createElement('select', {
        style:{ flex:1, padding:'9px 12px', border:'1.5px solid #ddd', borderRadius:10, fontSize:13, background:'#fff' },
        value: filterTaller, onChange: e => setFT(e.target.value) },
        React.createElement('option', { value:'' }, 'Todos los talleres'),
        talleres.map(t => React.createElement('option', { key:t, value:t }, t))
      ),
      React.createElement('select', {
        style:{ flex:1, padding:'9px 12px', border:'1.5px solid #ddd', borderRadius:10, fontSize:13, background:'#fff' },
        value: filterEmpam, onChange: e => setFE(e.target.value) },
        React.createElement('option', { value:'' }, 'Todos EMPAM'),
        React.createElement('option', { value:'VENCIDO' }, '🔴 Vencido'),
        React.createElement('option', { value:'PRONTO' }, '🟡 Vence Pronto'),
        React.createElement('option', { value:'VIGENTE' }, '🟢 Vigente'),
        React.createElement('option', { value:'PEND' }, '⏳ Pendiente')
      )
    ),

    React.createElement('div', { style:{fontSize:12, color:'#888', marginBottom:10} },
      `${filtered.length} paciente${filtered.length !== 1 ? 's' : ''}`),

    filtered.length === 0
      ? React.createElement('div', { className:'empty-state' },
          React.createElement('div', { className:'emoji' }, '🔍'),
          React.createElement('p', null, 'No se encontraron pacientes'))
      : React.createElement('div', { className: 'patient-list' },
          filtered.map(p =>
            React.createElement(PatientRow, { key: p.id, patient: p,
              onClick: () => onPatient(p) })
          )
        )
  );
}

// ── VIEW: FICHA PACIENTE ──────────────────────────────────────
function ViewFicha({ patient, patients, setPatients, onBack, toast }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm]       = useState({ ...patient });
  const [tab, setTab]         = useState('general');

  function save() {
    const updated = patients.map(p => p.id === form.id ? { ...form } : p);
    setPatients(updated);
    DB.set('patients', updated);
    setEditing(false);
    toast('✅ Ficha actualizada');
  }

  function field(key, label, type = 'text') {
    return React.createElement(Field, { label },
      React.createElement('input', { type, value: form[key] || '',
        onChange: e => setForm(f => ({ ...f, [key]: e.target.value })) })
    );
  }

  const empColor = { red:'#C00000', yellow:'#7A5C00', green:'#375623', gray:'#555' };
  const ec = empamColor(patient.empamEstado);

  return React.createElement('div', { className: 'page' },
    // Header card
    React.createElement('div', { className: 'card', style:{textAlign:'center', paddingTop:24} },
      React.createElement(Avatar, { sexo: patient.sexo, nombre: patient.nombre }),
      React.createElement('h2', { style:{fontWeight:800, fontSize:18, marginTop:10} }, patient.nombre),
      React.createElement('div', { style:{fontSize:14, color:'#666', marginBottom:10} },
        `RUT: ${patient.rut} · ${patient.edad} años · ${patient.sexo === 'M' ? '♀ Mujer' : '♂ Hombre'}`),
      React.createElement('div', { style:{display:'flex', gap:6, justifyContent:'center', flexWrap:'wrap'} },
        React.createElement(EmpamChip, { estado: patient.empamEstado }),
        React.createElement(AsistChip, { alerta: patient.alertaAsist,
          presencias: patient.totalPresencias, total: patient.totalSesiones })
      )
    ),

    // Tabs
    React.createElement('div', { className: 'tabs' },
      [['general','General'],['clinico','Clínico'],['asistencia','Asistencia'],['editar','✏️ Editar']].map(([v,l]) =>
        React.createElement('div', { key:v, className:`tab ${tab===v?'active':''}`,
          onClick: () => setTab(v) }, l)
      )
    ),

    // ── Tab: GENERAL ──
    tab === 'general' && React.createElement('div', null,
      React.createElement(SectionHdr, null, 'Datos del Programa'),
      React.createElement('div', { className: 'detail-grid' },
        React.createElement(DetailItem, { label:'Taller', value: patient.taller }),
        React.createElement(DetailItem, { label:'Ciclo', value: patient.ciclo }),
        React.createElement(DetailItem, { label:'Estado', value: patient.estado }),
        React.createElement(DetailItem, { label:'Detalle', value: patient.detalle }),
        React.createElement(DetailItem, { label:'Fono', value: patient.fono }),
        React.createElement(DetailItem, { label:'Previsión', value: patient.prevision })
      ),
      React.createElement(SectionHdr, null, 'Comorbilidades'),
      React.createElement('div', { className: 'detail-grid' },
        React.createElement(DetailItem, { label:'HTA', value: patient.hta || '—' }),
        React.createElement(DetailItem, { label:'DM', value: patient.dm || '—' }),
        React.createElement(DetailItem, { label:'ECV', value: patient.ecv || '—' }),
        React.createElement(DetailItem, { label:'DMIR', value: patient.dmir || '—' }),
        React.createElement(DetailItem, { label:'RESP', value: patient.resp || '—' }),
        React.createElement(DetailItem, { label:'CAID', value: patient.caid || '—' })
      ),
      React.createElement(SectionHdr, null, 'EMPAM'),
      React.createElement('div', { className: 'card' },
        React.createElement('div', { className: 'empam-meter' },
          React.createElement('div', { className: 'empam-dot',
            style:{ background: ec === 'red' ? '#C00000' : ec === 'yellow' ? '#FFD966' :
                    ec === 'green' ? '#70AD47' : '#ccc' } }),
          React.createElement('div', null,
            React.createElement('div', { style:{fontWeight:700, color: empColor[ec] || '#555'} },
              patient.empamEstado || 'Sin datos'),
            React.createElement('div', { style:{fontSize:13, color:'#666'} },
              `Resultado: ${patient.empamPre || '—'} → ${patient.empamPost || '—'}`),
            patient.empamFecha && React.createElement('div', { style:{fontSize:12, color:'#888'} },
              `Vence: ${formatDate(patient.empamFecha)}${patient.empamDias !== null ?
               ` (${patient.empamDias > 0 ? patient.empamDias + ' días' : 'VENCIDO'})` : ''}`)
          )
        )
      )
    ),

    // ── Tab: CLÍNICO ──
    tab === 'clinico' && React.createElement('div', null,
      React.createElement(SectionHdr, null, 'Evaluación PRE'),
      React.createElement('div', { className: 'detail-grid' },
        React.createElement(DetailItem, { label:'TUG Pre (seg)', value: patient.tugPre }),
        React.createElement(DetailItem, { label:'HAQ Pre', value: patient.haqPre }),
        React.createElement(DetailItem, { label:'EUP Der Pre (seg)', value: patient.eupDerPre }),
        React.createElement(DetailItem, { label:'EUP Izq Pre (seg)', value: patient.eupIzqPre }),
        React.createElement(DetailItem, { label:'Dolor D° Pre', value: patient.dolorDPre }),
        React.createElement(DetailItem, { label:'Dolor I° Pre', value: patient.dolorIPre }),
        React.createElement(DetailItem, { label:'CAT Interna', value: patient.catInt }),
        React.createElement(DetailItem, { label:'CAT Externa', value: patient.catExt })
      ),
      React.createElement(SectionHdr, null, 'Evaluación POST'),
      React.createElement('div', { className: 'detail-grid' },
        React.createElement(DetailItem, { label:'TUG Post (seg)', value: patient.tugPost }),
        React.createElement(DetailItem, { label:'HAQ Post', value: patient.haqPost }),
        React.createElement(DetailItem, { label:'EUP Der Post', value: patient.eupDerPost }),
        React.createElement(DetailItem, { label:'EUP Izq Post', value: patient.eupIzqPost }),
        React.createElement(DetailItem, { label:'Dolor D° Post', value: patient.dolorDPost }),
        React.createElement(DetailItem, { label:'Dolor I° Post', value: patient.dolorIPost })
      ),
      React.createElement(SectionHdr, null, 'Resultados Finales'),
      React.createElement('div', { className: 'detail-grid' },
        React.createElement(DetailItem, { label:'TUG', value: RESULT_LABELS[patient.resTug] || patient.resTug }),
        React.createElement(DetailItem, { label:'EUP Derecho', value: RESULT_LABELS[patient.resEupDer] || patient.resEupDer }),
        React.createElement(DetailItem, { label:'EUP Izquierdo', value: RESULT_LABELS[patient.resEupIzq] || patient.resEupIzq }),
        React.createElement(DetailItem, { label:'Estado Funcional', value: patient.estadoFunc })
      )
    ),

    // ── Tab: ASISTENCIA ──
    tab === 'asistencia' && React.createElement('div', null,
      React.createElement('div', { className: 'card', style:{textAlign:'center'} },
        React.createElement('div', { style:{fontSize:36, fontWeight:800,
          color: patient.alertaAsist?.includes('BAJO') ? '#C00000' : '#375623'} },
          `${patient.totalPresencias || 0} / ${patient.totalSesiones || 24}`),
        React.createElement('div', { style:{fontSize:14, color:'#666', marginBottom:10} }, 'Sesiones asistidas'),
        React.createElement(ProgressBar, {
          value: patient.totalPresencias || 0,
          max: patient.totalSesiones || 24,
          color: patient.alertaAsist?.includes('BAJO') ? '#C00000' : '#375623'
        }),
        React.createElement('div', { style:{marginTop:8, fontSize:13, color:'#888'} },
          `Mínimo requerido: 20 de 24 sesiones`),
        React.createElement('div', { style:{marginTop:8} },
          React.createElement(AsistChip, { alerta: patient.alertaAsist,
            presencias: patient.totalPresencias, total: patient.totalSesiones })
        )
      )
    ),

    // ── Tab: EDITAR ──
    tab === 'editar' && React.createElement('div', null,
      React.createElement(SectionHdr, null, 'Datos del Programa'),
      field('fono', 'Teléfono', 'tel'),
      field('ciclo', 'Ciclo'),
      field('estado', 'Estado'),
      React.createElement(SectionHdr, null, 'Evaluación Clínica Post'),
      field('tugPost', 'TUG Post (seg)', 'number'),
      field('eupDerPost', 'EUP Derecho Post (seg)', 'number'),
      field('eupIzqPost', 'EUP Izquierdo Post (seg)', 'number'),
      field('haqPost', 'HAQ Post', 'number'),
      React.createElement(Field, { label: 'Resultado TUG' },
        React.createElement('select', { value: form.resTug || '',
          onChange: e => setForm(f => ({ ...f, resTug: e.target.value })) },
          React.createElement('option', { value:'' }, '— Seleccionar —'),
          Object.entries(RESULT_LABELS).map(([k,v]) => React.createElement('option', { key:k, value:k }, v))
        )
      ),
      React.createElement(Field, { label: 'Estado Funcional Final' },
        React.createElement('select', { value: form.estadoFunc || '',
          onChange: e => setForm(f => ({ ...f, estadoFunc: e.target.value })) },
          React.createElement('option', { value:'' }, '— Seleccionar —'),
          ['ASR','ACR','EMPA/CV','DP','RD','PEND'].map(k =>
            React.createElement('option', { key:k, value:k }, `${k} — ${EMPAM_CODES[k] || k}`)
          )
        )
      ),
      React.createElement(SectionHdr, null, 'EMPAM'),
      React.createElement(Field, { label: 'EMPAM Post' },
        React.createElement('select', { value: form.empamPost || '',
          onChange: e => setForm(f => ({ ...f, empamPost: e.target.value })) },
          React.createElement('option', { value:'' }, '— Seleccionar —'),
          Object.entries(EMPAM_CODES).map(([k,v]) => React.createElement('option', { key:k, value:k }, `${k} — ${v}`))
        )
      ),
      field('empamFecha', 'Fecha Vencimiento EMPAM', 'date'),
      React.createElement('div', { style:{marginTop:16, display:'flex', gap:8} },
        React.createElement('button', { className:'btn btn-ghost', style:{flex:1},
          onClick: () => setTab('general') }, 'Cancelar'),
        React.createElement('button', { className:'btn btn-green', style:{flex:2},
          onClick: save }, '💾 Guardar Cambios')
      )
    )
  );
}

// ── VIEW: ALERTAS ─────────────────────────────────────────────
function ViewAlertas({ patients, onPatient }) {
  const [tab, setTab] = useState('empam');

  const vencidos = patients.filter(p => p.empamEstado?.includes('VENCIDO'));
  const prontos  = patients.filter(p => p.empamEstado?.includes('PRONTO'));
  const pendientes= patients.filter(p => p.empamEstado?.includes('PEND'));
  const bajoMin  = patients.filter(p => p.alertaAsist?.includes('BAJO'));

  function AlertList({ list, type }) {
    if (list.length === 0) return React.createElement('div', { className:'empty-state' },
      React.createElement('div', { className:'emoji' }, '✅'),
      React.createElement('p', null, 'Sin alertas en esta categoría'));

    return React.createElement('div', { className:'patient-list' },
      list.map(p => React.createElement('div', { key: p.id, className:'patient-row',
        onClick: () => onPatient(p) },
        React.createElement(Avatar, { sexo: p.sexo, nombre: p.nombre }),
        React.createElement('div', { className:'patient-info' },
          React.createElement('div', { className:'patient-name' }, p.nombre),
          React.createElement('div', { className:'patient-sub' }, p.taller),
          React.createElement('div', { className:'patient-chips', style:{marginTop:4} },
            type === 'empam'
              ? React.createElement(EmpamChip, { estado: p.empamEstado })
              : React.createElement(AsistChip, { alerta: p.alertaAsist,
                  presencias: p.totalPresencias, total: p.totalSesiones }),
            type === 'empam' && p.empamFecha &&
              React.createElement('span', { style:{fontSize:12, color:'#888'} },
                ` Vence: ${formatDate(p.empamFecha)}`)
          )
        ),
        React.createElement('span', { style:{fontSize:20, color:'#ccc'} }, '›')
      ))
    );
  }

  return React.createElement('div', { className: 'page' },
    React.createElement('div', { className: 'tabs' },
      [['empam',`🔴 EMPAM (${vencidos.length+prontos.length})`],
       ['asist', `👣 Asistencia (${bajoMin.length})`],
       ['pend',  `⏳ Pendientes (${pendientes.length})`]
      ].map(([v,l]) =>
        React.createElement('div', { key:v, className:`tab ${tab===v?'active':''}`,
          onClick: () => setTab(v) }, l)
      )
    ),

    tab === 'empam' && React.createElement('div', null,
      vencidos.length > 0 && React.createElement('div', null,
        React.createElement(SectionHdr, null, `🔴 EMPAM Vencido — ${vencidos.length} pacientes`),
        React.createElement(AlertList, { list: vencidos, type:'empam' })
      ),
      prontos.length > 0 && React.createElement('div', null,
        React.createElement(SectionHdr, null, `🟡 Vence en 30 días — ${prontos.length} pacientes`),
        React.createElement(AlertList, { list: prontos, type:'empam' })
      ),
      vencidos.length === 0 && prontos.length === 0 &&
        React.createElement('div', { className:'empty-state' },
          React.createElement('div', { className:'emoji' }, '✅'),
          React.createElement('p', null, 'Sin alertas EMPAM urgentes'))
    ),

    tab === 'asist' && React.createElement('div', null,
      React.createElement(SectionHdr, null, `🔴 Bajo mínimo (< 20 sesiones) — ${bajoMin.length} pacientes`),
      React.createElement(AlertList, { list: bajoMin, type:'asist' })
    ),

    tab === 'pend' && React.createElement('div', null,
      React.createElement(SectionHdr, null, `⏳ EMPAM Pendiente — ${pendientes.length} pacientes`),
      React.createElement(AlertList, { list: pendientes, type:'empam' })
    )
  );
}

// ── VIEW: EXPORTAR ────────────────────────────────────────────
function ViewExportar({ patients, attendanceLog, toast }) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0,7));

  const attCount = Object.keys(attendanceLog).length;
  const attByTaller = {};
  Object.keys(attendanceLog).forEach(k => {
    const parts = k.split('||');
    const t = parts[1] || 'Sin taller';
    attByTaller[t] = (attByTaller[t] || 0) + 1;
  });

  function doExport() {
    exportToExcel(patients, attendanceLog, month.replace('-','_'));
    toast('📥 Exportando Excel...');
  }

  return React.createElement('div', { className: 'page' },
    React.createElement('div', { className: 'card' },
      React.createElement('div', { className: 'card-title' }, '📊 Resumen de datos'),
      React.createElement('div', { className: 'detail-grid' },
        React.createElement(DetailItem, { label:'Total Pacientes', value: patients.length }),
        React.createElement(DetailItem, { label:'Registros asistencia', value: attCount }),
      )
    ),

    React.createElement('div', { className: 'card' },
      React.createElement('div', { className: 'card-title' }, '📅 Mes del reporte'),
      React.createElement(Field, { label:'Mes' },
        React.createElement('input', { type:'month', value: month,
          onChange: e => setMonth(e.target.value) })
      )
    ),

    attCount > 0 && React.createElement('div', { className: 'card' },
      React.createElement('div', { className: 'card-title' }, '📋 Asistencia registrada'),
      Object.entries(attByTaller).map(([t, n]) =>
        React.createElement('div', { key:t, style:{display:'flex',justifyContent:'space-between',
          padding:'6px 0', borderBottom:'1px solid #eee', fontSize:14} },
          React.createElement('span', null, t),
          React.createElement('span', { style:{fontWeight:700, color:'#2E75B6'} }, `${n} registros`)
        )
      )
    ),

    React.createElement('button', { className: 'btn btn-green', style:{marginBottom:10},
      onClick: doExport },
      '📥 Exportar Excel Completo'),

    React.createElement('div', { className: 'card' },
      React.createElement('div', { className: 'card-title' }, 'ℹ️ El Excel incluye'),
      ['Hoja MAESTRO — todos los pacientes actualizados',
       `Hoja ASISTENCIA ${month} — registros del mes`,
       'Hoja ALERTAS — EMPAM + asistencia'].map((txt, i) =>
        React.createElement('div', { key:i, style:{padding:'6px 0', fontSize:14,
          borderBottom:'1px solid #eee', display:'flex', gap:8} },
          React.createElement('span', null, '📄'),
          React.createElement('span', null, txt)
        )
      )
    )
  );
}

// ── VIEW: CONFIGURACION ───────────────────────────────────────
function ViewConfig({ patients, setPatients, toast }) {
  const [loading, setLoading] = useState(false);
  const fileRef = useRef();

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    try {
      const parsed = await parseMaestroExcel(file);
      setPatients(parsed);
      DB.set('patients', parsed);
      toast(`✅ ${parsed.length} pacientes importados`);
    } catch (err) {
      toast(`❌ Error: ${err}`);
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  }

  function clearAll() {
    if (!confirm('¿Borrar todos los datos? Esta acción no se puede deshacer.')) return;
    DB.del('patients'); DB.del('attendanceLog');
    setPatients([]);
    toast('🗑️ Datos eliminados');
  }

  return React.createElement('div', { className: 'page' },
    React.createElement('div', { className: 'card' },
      React.createElement('div', { className: 'card-title' }, '📂 Importar Maestro'),
      React.createElement('p', { style:{fontSize:14, color:'#666', marginBottom:14} },
        'Importa el archivo MAESTRO_MAS_AMA_PRO_2026.xlsx. Los datos se guardan en el celular para uso sin internet.'),
      loading
        ? React.createElement('div', { className: 'spinner' })
        : React.createElement('div', {
            className: 'import-zone',
            onClick: () => fileRef.current?.click() },
            React.createElement('div', { className: 'import-icon' }, '📊'),
            React.createElement('p', null,
              React.createElement('strong', null, 'Toca para seleccionar archivo')),
            React.createElement('p', null, 'MAESTRO_MAS_AMA_PRO_2026.xlsx')
          ),
      React.createElement('input', { ref: fileRef, type:'file',
        accept:'.xlsx,.xls', style:{display:'none'}, onChange: handleFile })
    ),

    patients.length > 0 && React.createElement('div', { className: 'card' },
      React.createElement('div', { className: 'card-title' }, '✅ Datos cargados'),
      React.createElement('div', { className: 'detail-grid' },
        React.createElement(DetailItem, { label:'Pacientes', value: patients.length }),
        React.createElement(DetailItem, { label:'Talleres',
          value: [...new Set(patients.map(p=>p.taller).filter(Boolean))].length })
      )
    ),

    React.createElement('div', { className: 'card' },
      React.createElement('div', { className: 'card-title' }, 'ℹ️ Instrucciones'),
      ['1. Descarga el MAESTRO_MAS_AMA_PRO_2026.xlsx a tu celular.',
       '2. Toca "Seleccionar archivo" y elige el Excel.',
       '3. La app lee y guarda los datos localmente.',
       '4. Trabaja sin internet en los talleres.',
       '5. Exporta el Excel actualizado cuando quieras.'].map((s,i) =>
        React.createElement('p', { key:i, style:{fontSize:13, color:'#555',
          padding:'5px 0', borderBottom:'1px solid #eee'} }, s)
      )
    ),

    patients.length > 0 && React.createElement('button', {
      className: 'btn btn-red', style:{marginTop:8},
      onClick: clearAll }, '🗑️ Borrar todos los datos')
  );
}
