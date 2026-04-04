// ═══════════════════════════════════════════════════════════════
//  APP SHELL — root component, routing, layout
// ═══════════════════════════════════════════════════════════════

function App() {
  const [view, setView]         = useState('inicio');
  const [patients, setPatients] = useState(() => DB.get('patients', []));
  const [attendanceLog, setAL]  = useState(() => DB.get('attendanceLog', {}));
  const [selPatient, setSel]    = useState(null);
  const [toastMsg, setToast]    = useState('');

  function toast(msg) { setToast(msg); setTimeout(() => setToast(''), 2500); }

  function openPatient(p) { setSel(p); setView('ficha'); }
  function goBack() {
    if (view === 'ficha') { setSel(null); setView('pacientes'); }
    else setView('inicio');
  }

  const hasData = patients.length > 0;

  const navItems = [
    { id:'inicio',   icon:'🏠', label:'Inicio' },
    { id:'lista',    icon:'📋', label:'Lista' },
    { id:'pacientes',icon:'👥', label:'Pacientes' },
    { id:'alertas',  icon:'🚨', label:'Alertas' },
    { id:'config',   icon:'⚙️', label:'Config' },
  ];

  const alertCount = patients.filter(p =>
    p.empamEstado?.includes('VENCIDO') || p.empamEstado?.includes('PRONTO') ||
    p.alertaAsist?.includes('BAJO')
  ).length;

  const titles = {
    inicio:'MAS AMA 2026', lista:'Pasar Lista', pacientes:'Pacientes',
    ficha: selPatient?.nombre || 'Ficha', alertas:'Alertas',
    exportar:'Exportar', config:'Configuración'
  };

  return React.createElement('div', { id: 'app' },
    // TOP BAR
    React.createElement('div', { className: 'top-bar' },
      (view === 'ficha') && React.createElement('button', {
        className: 'back-btn', onClick: goBack }, '←'),
      React.createElement('h1', null, titles[view] || 'MAS AMA'),
      view !== 'ficha' && alertCount > 0 &&
        React.createElement('span', { className: 'badge', onClick: () => setView('alertas') },
          alertCount),
      view !== 'ficha' && React.createElement('span', {
        style:{ fontSize:20, cursor:'pointer' },
        onClick: () => setView('exportar') }, '📤')
    ),

    // MAIN CONTENT
    !hasData && view !== 'config'
      ? React.createElement('div', { className:'page', style:{textAlign:'center',paddingTop:40} },
          React.createElement('div', { style:{fontSize:56} }, '📊'),
          React.createElement('h2', { style:{margin:'16px 0 8px', fontSize:20} }, 'Bienvenido a MAS AMA'),
          React.createElement('p', { style:{color:'#666', fontSize:15, marginBottom:24} },
            'Para comenzar, importa el archivo\nMAESTRO_MAS_AMA_PRO_2026.xlsx'),
          React.createElement('button', { className:'btn btn-primary',
            onClick: () => setView('config') }, '📂 Importar Maestro')
        )
      : view === 'inicio'    ? React.createElement(ViewInicio, { patients, attendanceLog, onNav: setView, onPatient: openPatient })
      : view === 'lista'     ? React.createElement(ViewLista, { patients, attendanceLog, setAttendanceLog: setAL, toast, talleres: TALLERES })
      : view === 'pacientes' ? React.createElement(ViewPacientes, { patients, onPatient: openPatient })
      : view === 'ficha'     ? React.createElement(ViewFicha, { patient: selPatient, patients, setPatients, onBack: goBack, toast })
      : view === 'alertas'   ? React.createElement(ViewAlertas, { patients, onPatient: openPatient })
      : view === 'exportar'  ? React.createElement(ViewExportar, { patients, attendanceLog, toast })
      : view === 'config'    ? React.createElement(ViewConfig, { patients, setPatients, toast })
      : null,

    // BOTTOM NAV
    React.createElement('nav', { className: 'bottom-nav' },
      navItems.map(item => React.createElement('button', {
        key: item.id,
        className: `nav-item ${view === item.id ? 'active' : ''}`,
        onClick: () => setView(item.id)
      },
        React.createElement('span', { className: 'icon' }, item.icon),
        React.createElement('span', { className: 'label' }, item.label)
      ))
    ),

    // TOAST
    toastMsg && React.createElement(Toast, { msg: toastMsg, onDone: () => setToast('') })
  );
}

// Mount
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(App));

// Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
