// ═══════════════════════════════════════════════════════════════
//  COMPONENTS
// ═══════════════════════════════════════════════════════════════

// ── TOAST ─────────────────────────────────────────────────────
function Toast({ msg, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2200); return () => clearTimeout(t); }, []);
  return React.createElement('div', { className: 'toast' }, msg);
}

// ── CHIP ──────────────────────────────────────────────────────
function Chip({ color = 'gray', children }) {
  return React.createElement('span', { className: `chip chip-${color}` }, children);
}

// ── EMPAM STATUS CHIP ─────────────────────────────────────────
function EmpamChip({ estado }) {
  if (!estado) return React.createElement(Chip, { color: 'gray' }, '⏳ Sin datos');
  const color = empamColor(estado);
  const colorMap = { red: 'red', yellow: 'yellow', green: 'green', gray: 'gray' };
  return React.createElement(Chip, { color: colorMap[color] || 'gray' }, estado);
}

// ── ASISTENCIA CHIP ───────────────────────────────────────────
function AsistChip({ alerta, presencias, total }) {
  const bajo = String(alerta).includes('BAJO');
  return React.createElement('span', { className: `chip chip-${bajo ? 'red' : 'green'}` },
    `${bajo ? '🔴' : '🟢'} ${presencias || 0}${total ? `/${total}` : ''} ses.`
  );
}

// ── AVATAR ────────────────────────────────────────────────────
function Avatar({ sexo, nombre }) {
  const isM = String(sexo).toUpperCase() === 'M';
  const initials = (nombre || '?').split(' ').map(w => w[0]).slice(0,2).join('');
  return React.createElement('div', { className: `avatar ${isM ? 'avatar-f' : 'avatar-m'}` },
    initials || (isM ? '♀' : '♂')
  );
}

// ── PATIENT ROW ───────────────────────────────────────────────
function PatientRow({ patient, onClick, attendanceToday }) {
  const empColor = empamColor(patient.empamEstado);
  const attVal = attendanceToday;

  return React.createElement('div', { className: 'patient-row', onClick },
    React.createElement(Avatar, { sexo: patient.sexo, nombre: patient.nombre }),
    React.createElement('div', { className: 'patient-info' },
      React.createElement('div', { className: 'patient-name' }, patient.nombre),
      React.createElement('div', { className: 'patient-sub' },
        `${patient.edad ? patient.edad + ' años' : ''} · ${patient.taller || '—'}`),
      React.createElement('div', { className: 'patient-chips' },
        React.createElement(EmpamChip, { estado: patient.empamEstado }),
        attVal && React.createElement(Chip, { color: attVal === 'P' ? 'green' : 'red' },
          attVal === 'P' ? '✅ Presente' : '❌ Ausente')
      )
    ),
    React.createElement('span', { style: { fontSize: 20, color: '#ccc' } }, '›')
  );
}

// ── DETAIL ITEM ───────────────────────────────────────────────
function DetailItem({ label, value, color }) {
  const style = color ? { color } : {};
  return React.createElement('div', { className: 'detail-item' },
    React.createElement('div', { className: 'd-label' }, label),
    React.createElement('div', { className: 'd-val', style }, value || '—')
  );
}

// ── SECTION HEADER ────────────────────────────────────────────
function SectionHdr({ children }) {
  return React.createElement('div', { className: 'section-hdr' }, children);
}

// ── PROGRESS BAR ─────────────────────────────────────────────
function ProgressBar({ value, max, color = '#2E75B6' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return React.createElement('div', { className: 'progress-bar' },
    React.createElement('div', { className: 'progress-fill',
      style: { width: `${pct}%`, background: color } })
  );
}

// ── FIELD ─────────────────────────────────────────────────────
function Field({ label, children }) {
  return React.createElement('div', { className: 'field' },
    React.createElement('label', null, label),
    children
  );
}

// ── TALLER SELECTOR ───────────────────────────────────────────
function TallerSelector({ selected, onSelect, talleres }) {
  return React.createElement('div', { className: 'taller-grid' },
    talleres.map(t => React.createElement('div', {
      key: t, className: `taller-btn ${selected === t ? 'selected' : ''}`,
      onClick: () => onSelect(t)
    }, t))
  );
}
