// Marcar registo como modificado (chamar antes de saveState quando se alteram campos)
function markUpdated(rec) {
  if (rec) rec.updatedAt = new Date().toISOString();
}

// Hash determinístico para detetar alterações materiais a um registo
function recordContentHash(r) {
  const months = Object.keys(r.monthsHours || {}).sort()
    .map(k => `${k}:${round2(r.monthsHours[k])}`).join('|');
  return [
    r.worker || '', r.project || '', r.wp || '', r.task || '', r.team || '',
    r.start  || '', r.end     || '', round2(r.totalHours || 0), months,
  ].join('§');
}

// ════════════════════════════════════════════════════════════════════════
// UTILS
// ════════════════════════════════════════════════════════════════════════
const MONTHS_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

function ymKey(y, m) { return `${y}-${String(m).padStart(2,'0')}`; }
function ymParse(ym) { const [y,m] = ym.split('-').map(Number); return {y, m}; }
function ymList(start, end) {
  const out = [];
  const s = ymParse(start), e = ymParse(end);
  let y = s.y, m = s.m;
  while (y < e.y || (y === e.y && m <= e.m)) {
    out.push(ymKey(y, m));
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}
function ymLabel(ym) {
  const {y, m} = ymParse(ym);
  return `${MONTHS_PT[m-1]} ${String(y).slice(2)}`;
}
function ymShort(ym) {
  const {y, m} = ymParse(ym);
  return MONTHS_PT[m-1].toLowerCase();
}
function uuid() { return `rec_${Date.now()}_${Math.random().toString(36).slice(2,8)}`; }
function round2(n) { return Math.round(n * 100) / 100; }

function getCapacity(worker, ym) {
  let base;
  if (state.capacity[worker] && state.capacity[worker][ym] !== undefined) {
    base = state.capacity[worker][ym];
  } else {
    base = state.defaultCapacity;
  }
  // Deduzir ausências registadas
  const absence = state.absences?.[worker]?.[ym];
  if (absence && absence.hours > 0) {
    base = Math.max(0, base - absence.hours);
  }
  return base;
}

function getAllYears() {
  const years = new Set();
  for (const r of state.records) {
    for (const ym of Object.keys(r.monthsHours || {})) {
      years.add(ymParse(ym).y);
    }
  }
  // Include years from capacity and absence entries so the cap table always shows relevant years
  for (const wCap of Object.values(state.capacity || {})) {
    for (const ym of Object.keys(wCap)) years.add(ymParse(ym).y);
  }
  for (const wAbs of Object.values(state.absences || {})) {
    for (const ym of Object.keys(wAbs)) years.add(ymParse(ym).y);
  }
  if (years.size === 0) {
    const now = new Date();
    years.add(now.getFullYear());
  }
  return [...years].sort();
}

// Diferença em meses entre dois YMs (b - a)
function monthsDiff(a, b) {
  const A = ymParse(a), B = ymParse(b);
  return (B.y * 12 + B.m) - (A.y * 12 + A.m);
}

function ymAddMonths(ym, n) {
  const {y, m} = ymParse(ym);
  let total = y * 12 + (m - 1) + n;
  return ymKey(Math.floor(total / 12), (total % 12) + 1);
}

// ────────── Helpers para nome de ficheiro ──────────
// Timestamp local com fuso (não UTC) → "2026-05-12_14-37"
function fileTimestamp(d = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
}

// Sanitizar iniciais: ASCII uppercase, sem acentos, sem caracteres inválidos para nome de ficheiro
function sanitizeInitials(raw) {
  if (!raw) return '';
  // remover acentos
  const noAccents = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // só A-Z e dígitos, uppercase, máx 4
  return noAccents.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
}
