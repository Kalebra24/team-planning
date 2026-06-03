// ════════════════════════════════════════════════════════════════════════
// TENDÊNCIA HISTÓRICA (#7)
// ════════════════════════════════════════════════════════════════════════
function renderTrendChart() {
  const snaps = (state.planSnapshots || []).slice().sort((a, b) => a.planMonth.localeCompare(b.planMonth));
  const card = document.getElementById('trend-card');
  if (!card) return;
  if (snaps.length < 2) { card.style.display = 'none'; return; }
  card.style.display = '';

  // Calcular utilização média por snapshot
  const points = snaps.map(s => {
    const util = {};
    for (const r of (s.records || [])) {
      for (const [ym, h] of Object.entries(r.monthsHours || {})) {
        if (!util[r.worker]) util[r.worker] = {};
        util[r.worker][ym] = (util[r.worker][ym] || 0) + h;
      }
    }
    const cap = s.capacity || {};
    let total = 0, count = 0;
    for (const w of (s.workers || [])) {
      const ym = s.planMonth;
      const h = util[w]?.[ym] || 0;
      const c = cap[w]?.[ym] ?? 140;
      if (c > 0) { total += h / c; count++; }
    }
    return { label: ymLabel(s.planMonth), pct: count > 0 ? Math.round(total / count * 100) : 0 };
  });

  const W = Math.max(400, points.length * 60);
  const H = 180;
  const PAD = { top: 20, right: 20, bottom: 30, left: 40 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const maxPct = Math.max(110, ...points.map(p => p.pct));
  const xStep = chartW / Math.max(points.length - 1, 1);
  const yScale = v => chartH - (v / maxPct) * chartH;

  const wrap = document.getElementById('trend-wrap');
  const svg = document.getElementById('trend-svg');
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  // Grid lines at 0%, 50%, 100%
  let grid = '';
  [0, 50, 100].forEach(v => {
    const y = PAD.top + yScale(v);
    grid += `<line x1="${PAD.left}" x2="${W - PAD.right}" y1="${y}" y2="${y}" stroke="var(--line)" stroke-width="1"/>`;
    grid += `<text x="${PAD.left - 4}" y="${y + 4}" text-anchor="end" font-size="10" fill="var(--ink-faint)">${v}%</text>`;
  });

  // Line + area
  const pts = points.map((p, i) => [PAD.left + i * xStep, PAD.top + yScale(p.pct)]);
  const linePath = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
  const areaPath = `${linePath} L${pts[pts.length-1][0]},${PAD.top + chartH} L${pts[0][0]},${PAD.top + chartH} Z`;

  // Danger zone (>110%)
  const dangerY = PAD.top + yScale(110);
  const dangerFill = `<rect x="${PAD.left}" y="${PAD.top}" width="${chartW}" height="${Math.max(0, dangerY - PAD.top)}" fill="rgba(163,45,31,0.05)"/>`;

  // X labels
  const labels = points.map((p, i) => {
    const x = PAD.left + i * xStep;
    return `<text x="${x}" y="${H - 6}" text-anchor="middle" font-size="9" fill="var(--ink-faint)">${p.label}</text>`;
  }).join('');

  // Dots
  const dots = pts.map((p, i) => {
    const pct = points[i].pct;
    const color = pct > 110 ? 'var(--danger)' : pct > 95 ? 'var(--warn)' : 'var(--ok)';
    return `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="${color}" stroke="white" stroke-width="1.5" data-i="${i}" class="trend-dot"/>`;
  }).join('');

  svg.innerHTML = `
    ${dangerFill}
    ${grid}
    <path d="${areaPath}" fill="rgba(74,103,65,0.08)"/>
    <path d="${linePath}" fill="none" stroke="var(--ok)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${labels}
    ${dots}
  `;

  // Tooltip on hover
  const tip = document.getElementById('trend-tip');
  svg.querySelectorAll('.trend-dot').forEach((dot, i) => {
    dot.addEventListener('mousemove', ev => {
      tip.style.display = 'block';
      tip.style.left = (ev.offsetX + 12) + 'px';
      tip.style.top  = (ev.offsetY - 28) + 'px';
      tip.textContent = `${points[i].label}: ${points[i].pct}%`;
    });
    dot.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
  });
}


// ════════════════════════════════════════════════════════════════════════
// EXPORTAR PNG (#8)
// ════════════════════════════════════════════════════════════════════════
async function exportSectionPNG(elementId, filename) {
  const el = document.getElementById(elementId);
  if (!el) { toast('Elemento não encontrado', 'error'); return; }
  if (typeof html2canvas === 'undefined') { toast('html2canvas não disponível', 'error'); return; }
  toast('A gerar imagem…');
  try {
    const canvas = await html2canvas(el, {
      backgroundColor: '#fbfaf6',
      scale: 2,
      useCORS: true,
      logging: false,
    });
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = filename;
    a.click();
    toast('Imagem exportada');
  } catch (e) {
    toast('Erro ao exportar imagem', 'error');
    console.error(e);
  }
}

window.exportHeatmapPNG = () => {
  const now = new Date().toISOString().slice(0,10);
  exportSectionPNG('heatmap-wrap', `heatmap-${now}.png`);
};

window.exportGanttPNG = () => {
  const now = new Date().toISOString().slice(0,10);
  exportSectionPNG('gantt-wrap', `timeline-${now}.png`);
};


// ════════════════════════════════════════════════════════════════════════
// RELATÓRIO VISUAL (#9)
// ════════════════════════════════════════════════════════════════════════

function _rptCheckboxList(containerId, toggleBtnId, items, labelFn) {
  const list = document.getElementById(containerId);
  list.innerHTML = '';
  items.forEach(item => {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 10px;cursor:pointer;font-size:13px;font-weight:400';
    const val = typeof item === 'object' ? String(item.value) : String(item);
    const lbl = labelFn ? labelFn(item) : val;
    row.innerHTML = '<input type="checkbox" value="' + val.replace(/"/g, '&quot;') + '" style="accent-color:var(--accent);width:14px;height:14px;flex-shrink:0"> ' + lbl;
    row.addEventListener('mouseenter', () => { row.style.background = 'var(--line-soft)'; });
    row.addEventListener('mouseleave', () => { row.style.background = ''; });
    list.appendChild(row);
  });
  const btn = document.getElementById(toggleBtnId);
  if (!btn) return;
  btn.onclick = () => {
    const boxes = list.querySelectorAll('input[type="checkbox"]');
    const allChecked = [...boxes].every(b => b.checked);
    boxes.forEach(b => { b.checked = !allChecked; });
    btn.textContent = allChecked ? 'Selecionar todos' : 'Limpar seleção';
  };
  list.addEventListener('change', () => {
    const boxes = list.querySelectorAll('input[type="checkbox"]');
    btn.textContent = [...boxes].every(b => b.checked) ? 'Limpar seleção' : 'Selecionar todos';
  });
}

let _rptType  = 'project';
let _rptGroup = 'project'; // 'project' | 'wp' | 'task'

function openReportModal() {
  try {
  const curY = new Date().getFullYear();
  const allYears = getAllYears().length ? getAllYears() : [curY];

  // Project report: year checkboxes
  _rptCheckboxList('rpt-proj-years-list', 'rpt-proj-years-toggle-all',
    allYears.slice().reverse().map(y => ({ value: y })),
    item => String(item.value)
  );
  // pre-check current year
  const curYBox = document.querySelector('#rpt-proj-years-list input[value="' + curY + '"]');
  if (curYBox) curYBox.checked = true;

  // Project checkboxes — value must be the project name
  _rptCheckboxList('rpt-project-list', 'rpt-project-toggle-all',
    [...state.projects].sort((a, b) => a.name.localeCompare(b.name)).map(p => ({ value: p.name, hidden: p.hidden })),
    item => item.value + (item.hidden ? ' <span style="font-size:10px;color:var(--ink-faint)">· oculto</span>' : '')
  );

  // Years checkboxes (person report)
  _rptCheckboxList('rpt-years-list', 'rpt-years-toggle-all',
    allYears.slice().reverse().map(y => ({ value: y })),
    item => String(item.value)
  );
  // pre-check current year
  const firstYearBox = document.querySelector('#rpt-years-list input[value="' + curY + '"]');
  if (firstYearBox) firstYearBox.checked = true;

  // People checkboxes (person report)
  _rptCheckboxList('rpt-person-list', 'rpt-person-toggle-all',
    [...state.workers].sort(),
    w => w
  );

  // Type toggle wiring
  const switchType = (type) => {
    _rptType = type;
    document.getElementById('rpt-opts-project').style.display = type === 'project' ? 'flex' : 'none';
    document.getElementById('rpt-opts-person').style.display  = type === 'person'  ? 'flex' : 'none';
    document.getElementById('rpt-type-project').classList.toggle('active', type === 'project');
    document.getElementById('rpt-type-person').classList.toggle('active',  type === 'person');
    document.getElementById('rpt-level-full-lbl').textContent = type === 'project'
      ? 'Completo — 3 páginas (resumo, heatmap, projectos)'
      : 'Completo — resumo + tabela por pessoa (1 página por pessoa)';
    document.getElementById('rpt-level-exec-lbl').textContent = type === 'project'
      ? 'Executivo — 1 página (resumo + tendência)'
      : 'Resumo — 1 página (cartões por pessoa)';
  };
  document.getElementById('rpt-type-project').onclick = () => switchType('project');
  document.getElementById('rpt-type-person').onclick  = () => switchType('person');
  switchType(_rptType);

  // GroupBy toggle wiring
  const switchGroup = (g) => {
    _rptGroup = g;
    ['project', 'wp', 'task'].forEach(id =>
      document.getElementById('rpt-group-' + id).classList.toggle('active', id === g)
    );
  };
  document.getElementById('rpt-group-project').onclick = () => switchGroup('project');
  document.getElementById('rpt-group-wp').onclick      = () => switchGroup('wp');
  document.getElementById('rpt-group-task').onclick    = () => switchGroup('task');
  switchGroup(_rptGroup);

  document.getElementById('modal-report').classList.add('active');
  } catch(err) { console.error('openReportModal:', err); toast('Erro ao abrir relatório: ' + err.message, 'error'); }
}

function exportMonthlyReport({ years: filterYears = [], filterProjects = [], fullReport = true } = {}) {
  const now    = new Date();
  const ML     = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const curM   = now.getMonth() + 1;
  const curYM  = ymKey(now.getFullYear(), curM);
  const allDataYears = getAllYears().length ? getAllYears() : [now.getFullYear()];
  const years  = (filterYears.length ? filterYears : [now.getFullYear()]).slice().sort((a, b) => a - b);
  const yms    = years.flatMap(y => Array.from({length: 12}, (_, i) => ymKey(y, i + 1)));
  const curY   = years[0]; // used for display labels when single year

  // Filter records by selected projects (empty = all visible)
  const records = filterProjects.length
    ? state.records.filter(r => filterProjects.includes(r.project))
    : visibleRecords();

  // Utilization per person x month
  const util = {};
  for (const w of state.workers) {
    util[w] = {};
    for (const ym of yms) {
      const cap   = getCapacity(w, ym);
      const alloc = records.reduce((s, r) => r.worker === w ? s + (r.monthsHours?.[ym] || 0) : s, 0);
      util[w][ym] = { cap, alloc, pct: cap > 0 ? alloc / cap : 0 };
    }
  }

  // KPIs
  const refYM   = yms.includes(curYM) ? curYM : yms[0];
  const withCap = state.workers.filter(w => util[w][refYM].cap > 0);
  const avgUtil = withCap.length
    ? Math.round(withCap.reduce((s, w) => s + util[w][refYM].pct, 0) / withCap.length * 100) : 0;

  let atRisk = 0;
  for (const w of state.workers) {
    let hasWork = false;
    for (let i = 1; i <= 3; i++) {
      const nxt = ymAddMonths(curYM, i);
      if (records.some(r => r.worker === w && (r.monthsHours?.[nxt] || 0) > 0)) { hasWork = true; break; }
    }
    if (!hasWork) atRisk++;
  }

  let overMths = 0;
  for (const w of state.workers)
    for (const ym of yms)
      if (util[w][ym].pct > 1.10) overMths++;

  // Project matrix
  const projs = [...new Set(
    records.filter(r => yms.some(ym => (r.monthsHours?.[ym] || 0) > 0)).map(r => r.project)
  )].sort();
  const projH = {};
  for (const w of state.workers) projH[w] = {};
  for (const r of records) {
    const h = yms.reduce((s, ym) => s + (r.monthsHours?.[ym] || 0), 0);
    if (h > 0) projH[r.worker][r.project] = (projH[r.worker][r.project] || 0) + h;
  }
  const projTot    = {};
  for (const p of projs) projTot[p] = state.workers.reduce((s, w) => s + (projH[w]?.[p] || 0), 0);
  const workerTot  = {};
  for (const w of state.workers) workerTot[w] = projs.reduce((s, p) => s + (projH[w]?.[p] || 0), 0);
  const grandTotal = projs.reduce((s, p) => s + projTot[p], 0);
  const maxProjH   = Math.max(...Object.values(projTot), 1);

  // Color helpers — INEGI brand
  const hc = p => p === 0 ? '#f2f0eb'
    : p < 0.26  ? '#d4eadb'
    : p < 0.76  ? '#a3c8ad'
    : p < 0.96  ? '#4a8f5e'
    : p <= 1.10 ? '#d97c10'
    : '#8B2638';
  const tc = p => p >= 0.76 ? '#fff' : '#1a1917';
  const kpiColor = p => p >= 1.10 ? '#8B2638' : p >= 0.96 ? '#d97c10' : p >= 0.76 ? '#2d7a4a' : '#444';

  // Trend SVG: demand vs capacity — next 12 months from today
  const trendYMs  = Array.from({length: 12}, (_, i) => ymAddMonths(curYM, i));
  const tDemand   = trendYMs.map(ym => records.reduce((s, r) => s + (r.monthsHours?.[ym] || 0), 0));
  const tCapacity = trendYMs.map(ym => state.workers.reduce((s, w) => s + getCapacity(w, ym), 0));
  const tMax      = Math.max(1, ...tDemand, ...tCapacity);
  const TW = 560, TH = 150;
  const TP = { top: 18, right: 16, bottom: 32, left: 46 };
  const tcW = TW - TP.left - TP.right;
  const tcH = TH - TP.top - TP.bottom;
  const txStep  = tcW / Math.max(trendYMs.length - 1, 1);
  const tyScale = v => tcH * (1 - v / (tMax * 1.05));
  const dPts = tDemand.map((v, i)   => [TP.left + i * txStep, TP.top + tyScale(v)]);
  const cPts = tCapacity.map((v, i) => [TP.left + i * txStep, TP.top + tyScale(v)]);
  const svgPath = pts => pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const gridStep = Math.ceil(tMax * 1.05 / 4 / 50) * 50 || 100;
  let tGrid = '';
  for (let v = 0; v <= tMax * 1.1; v += gridStep) {
    const gy = TP.top + tyScale(v);
    if (gy < TP.top) break;
    tGrid += '<line x1="' + TP.left + '" x2="' + (TW - TP.right) + '" y1="' + gy.toFixed(1) + '" y2="' + gy.toFixed(1) + '" stroke="#e8e4dc" stroke-width="1"/>';
    tGrid += '<text x="' + (TP.left - 4) + '" y="' + (gy + 3.5).toFixed(1) + '" text-anchor="end" font-size="8.5" fill="#8C8E8F">' + Math.round(v) + 'h</text>';
  }
  const tLabels = trendYMs.map((ym, i) => {
    const parsed = ymParse(ym);
    const ml = ML[parsed.m - 1];
    const x  = (TP.left + i * txStep).toFixed(1);
    const showYear = parsed.m === 1 || i === 0;
    return (i % 2 === 0) ? '<text x="' + x + '" y="' + (TH - 4) + '" text-anchor="middle" font-size="8.5" fill="#8C8E8F">' + ml + (showYear ? ' \'' + String(parsed.y).slice(2) : '') + '</text>' : '';
  }).join('');
  const trendSVG = '<svg viewBox="0 0 ' + TW + ' ' + TH + '" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:' + TW + 'px;height:auto">'
    + tGrid
    + '<path d="' + svgPath(cPts) + '" fill="none" stroke="#8C8E8F" stroke-width="1.5" stroke-dasharray="5,4"/>'
    + '<path d="' + svgPath(dPts) + '" fill="none" stroke="#8B2638" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
    + dPts.map(p => '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3" fill="#8B2638"/>').join('')
    + tLabels
    + '<rect x="' + (TP.left + 4) + '" y="' + (TP.top + 4) + '" width="70" height="16" fill="white" opacity="0.85" rx="2"/>'
    + '<line x1="' + (TP.left + 7) + '" x2="' + (TP.left + 18) + '" y1="' + (TP.top + 12) + '" y2="' + (TP.top + 12) + '" stroke="#8B2638" stroke-width="2"/>'
    + '<text x="' + (TP.left + 21) + '" y="' + (TP.top + 15) + '" font-size="8" fill="#8B2638" font-weight="600">Procura</text>'
    + '<line x1="' + (TP.left + 40) + '" x2="' + (TP.left + 51) + '" y1="' + (TP.top + 12) + '" y2="' + (TP.top + 12) + '" stroke="#8C8E8F" stroke-width="1.5" stroke-dasharray="4,3"/>'
    + '<text x="' + (TP.left + 54) + '" y="' + (TP.top + 15) + '" font-size="8" fill="#8C8E8F">Cap.</text>'
    + '</svg>';

  // Metadata
  const genDate = now.toLocaleDateString('pt-PT', {day:'2-digit', month:'long', year:'numeric'});
  const genTime = now.toLocaleTimeString('pt-PT', {hour:'2-digit', minute:'2-digit'});
  const genUser = (typeof sessionCtx !== 'undefined' && sessionCtx)
    ? (sessionCtx.displayName || sessionCtx.initials || '—') : '—';
  const periodLbl = years.length === 1
    ? 'Jan – Dez ' + years[0]
    : ML[0] + ' ' + years[0] + ' – ' + ML[11] + ' ' + years[years.length - 1];

  // INEGI logo (inline SVG)
  const logoSVG = '<svg width="108" height="40" viewBox="0 0 108 40" xmlns="http://www.w3.org/2000/svg">'
    + '<rect width="5" height="40" fill="#8B2638"/>'
    + '<text x="12" y="26" font-family="\'DIN Next LT Pro\',\'Segoe UI\',Arial,sans-serif" font-size="21" font-weight="800" fill="#8B2638" letter-spacing="-0.3">INEGI</text>'
    + '<text x="12" y="37" font-family="\'Segoe UI\',Arial,sans-serif" font-size="5.8" fill="#8C8E8F" letter-spacing="0.09em">INSTITUTO · ENGENHARIA</text>'
    + '</svg>';

  // Page header helper
  const pageHeader = (title) => ''
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid #8B2638;padding-bottom:10px;margin-bottom:18px">'
    + '<div style="display:flex;align-items:center;gap:14px">'
    + logoSVG
    + '<div><div style="font-size:14.5px;font-weight:800;color:#1a1917;letter-spacing:-0.3px">' + title + '</div>'
    + '<div style="font-size:9px;color:#8C8E8F;margin-top:2px">' + (filterProjects.length ? 'Projectos: ' + filterProjects.join(', ') : 'Todos os projectos') + ' &nbsp;·&nbsp; ' + periodLbl + '</div></div></div>'
    + '<div style="text-align:right;font-size:9px;color:#8C8E8F;line-height:1.75">'
    + '<div>Gerado por <strong style="color:#444">' + genUser + '</strong></div>'
    + '<div>' + genDate + ', ' + genTime + '</div>'
    + '<div>Período: ' + periodLbl + '</div>'
    + '</div></div>';

  // Section heading helper
  const h2 = label => '<div style="font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.13em;color:#8C8E8F;margin:20px 0 8px;padding-bottom:5px;border-bottom:1px solid #e8e4dc">' + label + '</div>';

  // KPI card helper
  const kpiCard = (label, value, sub, color) => '<div style="background:#f6f3ec;border-radius:8px;padding:13px;border-top:3px solid ' + color + '">'
    + '<div style="font-size:7.5px;text-transform:uppercase;letter-spacing:.1em;color:#8C8E8F;font-weight:700;margin-bottom:5px">' + label + '</div>'
    + '<div style="font-size:27px;font-weight:900;color:' + color + ';line-height:1">' + value + '</div>'
    + '<div style="font-size:9px;color:#aaa;margin-top:4px">' + sub + '</div>'
    + '</div>';

  // Utilization bars
  const refLabel = ML[ymParse(refYM).m - 1] + ' ' + ymParse(refYM).y;
  const barsHTML = state.workers.map(w => {
    const d    = util[w][refYM];
    const pct  = Math.round(d.pct * 100);
    const barW = Math.min(100, pct);
    const lbl  = d.cap > 0 ? pct + '%  ·  ' + Math.round(d.alloc) + 'h / ' + d.cap + 'h' : '—';
    const vac  = state.absences?.[w]?.[refYM] ? ' <span title="Férias" style="font-size:10px">✈</span>' : '';
    return '<tr>'
      + '<td style="width:140px;padding:4px 10px 4px 0;font-size:11.5px;font-weight:500;white-space:nowrap">' + w + vac + '</td>'
      + '<td style="padding:4px 0"><div style="position:relative;height:20px;background:#f2f0eb;border-radius:3px">'
      + '<div style="position:absolute;left:0;top:0;height:100%;width:' + barW + '%;background:' + hc(d.pct) + ';border-radius:3px;min-width:' + (d.alloc > 0 ? 2 : 0) + 'px"></div>'
      + (d.pct > 1 ? '<div style="position:absolute;left:100%;top:0;height:100%;width:' + Math.min(20, Math.round((d.pct - 1) * 100)) + '%;background:#8B2638;opacity:.45;border-radius:0 3px 3px 0"></div>' : '')
      + '</div></td>'
      + '<td style="width:160px;padding:4px 0 4px 10px;font-size:10px;color:#666;white-space:nowrap;font-family:\'Courier New\',monospace">' + lbl + '</td>'
      + '</tr>';
  }).join('');

  // Heatmap rows
  const hmHead = ML.map(m => '<th style="padding:5px 3px;text-align:center;font-size:9px;font-weight:700;color:#8C8E8F;background:#f2f0eb;min-width:38px">' + m + '</th>').join('');
  const hmRows = state.workers.map(w => {
    const cells = yms.map(ym => {
      const d    = util[w][ym];
      const vac  = state.absences?.[w]?.[ym] ? '<br><span style="font-size:8px;opacity:.85">✈</span>' : '';
      const txt  = d.cap === 0 ? '—' : Math.round(d.pct * 100) + '%';
      return '<td style="padding:5px 2px;text-align:center;font-size:9.5px;background:' + hc(d.pct) + ';color:' + tc(d.pct) + ';font-weight:' + (d.pct >= 0.76 ? 700 : 400) + '">' + txt + vac + '</td>';
    }).join('');
    const avg = yms.reduce((s, ym) => s + util[w][ym].pct, 0) / 12;
    return '<tr>'
      + '<td style="padding:5px 10px 5px 0;font-size:10.5px;font-weight:500;white-space:nowrap">' + w + '</td>'
      + cells
      + '<td style="padding:5px;text-align:center;font-size:9.5px;background:' + hc(avg) + ';color:' + tc(avg) + ';font-weight:700;border-left:2px solid #ccc">' + Math.round(avg * 100) + '%</td>'
      + '</tr>';
  }).join('');

  // Project matrix
  const truncP   = p => p.length > 12 ? p.slice(0, 11) + '…' : p;
  const projHead = projs.map(p => '<th title="' + p + '" style="padding:4px 5px;text-align:right;font-size:9px;font-weight:700;color:#666;max-width:75px;white-space:nowrap">' + truncP(p) + '</th>').join('');
  const projRows = state.workers.map(w => {
    const cells = projs.map(p => {
      const h  = projH[w]?.[p] || 0;
      const al = h > 0 ? 0.12 + 0.70 * (h / maxProjH) : 0;
      const bg = h > 0 ? 'rgba(139,38,56,' + al.toFixed(2) + ')' : 'transparent';
      const fg = al > 0.5 ? '#fff' : '#333';
      return '<td style="padding:4px 7px;text-align:right;font-size:9.5px;background:' + bg + ';color:' + fg + '">' + (h > 0 ? Math.round(h) + 'h' : '') + '</td>';
    }).join('');
    return '<tr>'
      + '<td style="padding:4px 10px 4px 0;font-size:10.5px;font-weight:500;white-space:nowrap;position:sticky;left:0;background:#fff;z-index:2">' + w + '</td>'
      + cells
      + '<td style="padding:4px 7px;text-align:right;font-size:10.5px;font-weight:700;border-left:2px solid #ccc">' + (workerTot[w] > 0 ? Math.round(workerTot[w]) + 'h' : '—') + '</td>'
      + '</tr>';
  }).join('');
  const totRow = projs.map(p => '<td style="padding:5px 7px;text-align:right;font-size:9.5px;font-weight:700;border-top:2px solid #ccc">' + Math.round(projTot[p]) + 'h</td>').join('');

  // Color legend
  const legend = '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">'
    + [['#f2f0eb','0%'],['#d4eadb','1–25%'],['#a3c8ad','26–75%'],['#4a8f5e','76–95%'],['#d97c10','96–110%'],['#8B2638','>110%']].map(
      ([c, l]) => '<div style="display:flex;align-items:center;gap:4px;font-size:9px;color:#777"><div style="width:11px;height:11px;border-radius:2px;background:' + c + ';flex-shrink:0"></div>' + l + '</div>'
    ).join('')
    + '<div style="display:flex;align-items:center;gap:4px;font-size:9px;color:#777"><span>✈</span>Férias registadas</div>'
    + '</div>';

  // Assumptions box
  const assumptionsBox = '<div style="background:#f6f3ec;border-left:3px solid #8C8E8F;padding:10px 14px;margin-top:16px;border-radius:0 6px 6px 0">'
    + '<div style="font-size:7.5px;text-transform:uppercase;letter-spacing:.12em;color:#8C8E8F;font-weight:700;margin-bottom:6px">Pressupostos do relatório</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 20px;font-size:9.5px;color:#555">'
    + '<div>⚠ Sobrealocado: &gt;110% da capacidade</div>'
    + '<div>📊 Capacidade padrão: 140h/mês</div>'
    + '<div>⚠ Em risco: sem trabalho nos próximos 3 meses</div>'
    + '<div>✈ Férias: capacidade reduzida por ausências SIGEI</div>'
    + '</div></div>';

  // Page 1 — Executive Summary
  const page1 = '<div class="page">'
    + pageHeader('Planeamento de Recursos — Resumo Executivo')
    + h2('Indicadores — ' + refLabel)
    + '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">'
    + kpiCard('Utilização média', avgUtil + '%', withCap.length + ' pessoa(s) com capacidade', kpiColor(avgUtil / 100))
    + kpiCard('Em risco', atRisk, 'sem trabalho nos próx. 3 meses', atRisk > 0 ? '#d97c10' : '#2d7a4a')
    + kpiCard('Sobrealoções >110%', overMths, 'mês×pessoa em ' + periodLbl, overMths > 0 ? '#8B2638' : '#2d7a4a')
    + kpiCard('Equipa', state.workers.length, state.projects.filter(p => p.active !== false).length + ' projecto(s) activos', '#444')
    + '</div>'
    + h2('Utilização por pessoa — ' + refLabel)
    + '<table style="table-layout:fixed;width:100%;border-collapse:collapse"><tbody>' + barsHTML + '</tbody></table>'
    + legend
    + h2('Tendência — Procura vs Capacidade (próximos 12 meses)')
    + '<div style="margin-bottom:4px">' + trendSVG + '</div>'
    + '<div style="font-size:9px;color:#8C8E8F">Procura: horas alocadas totais &nbsp;·&nbsp; Capacidade: soma das capacidades mensais de toda a equipa</div>'
    + assumptionsBox
    + '</div>';

  // Page 2 — Heatmap
  const page2 = fullReport ? '<div class="page">'
    + pageHeader('Heatmap de Utilização')
    + h2('Pessoa × Mês — ' + periodLbl)
    + '<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%">'
    + '<thead><tr><th style="padding:5px 10px 5px 0;font-size:9px;color:#8C8E8F"></th>' + hmHead
    + '<th style="padding:5px;text-align:center;font-size:9px;font-weight:700;color:#8C8E8F;background:#f2f0eb;border-left:2px solid #ccc">Média</th>'
    + '</tr></thead><tbody>' + hmRows + '</tbody></table></div>'
    + legend
    + '</div>' : '';

  // Page 3 — Project matrix
  const page3 = fullReport ? '<div class="page">'
    + pageHeader('Distribuição por Projecto')
    + h2('Matriz Pessoa × Projecto — ' + periodLbl)
    + '<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%">'
    + '<thead><tr>'
    + '<th style="padding:4px 10px 4px 0;font-size:10px;color:#8C8E8F;position:sticky;left:0;background:#fff;z-index:3">Pessoa</th>'
    + projHead
    + '<th style="padding:4px 7px;text-align:right;font-size:9px;font-weight:700;color:#8C8E8F;border-left:2px solid #ccc">Total</th>'
    + '</tr></thead>'
    + '<tbody>' + projRows + '</tbody>'
    + '<tfoot><tr>'
    + '<td style="padding:6px 10px 4px 0;font-size:10.5px;font-weight:700;border-top:2px solid #ccc;position:sticky;left:0;background:#fff;z-index:2">Total</td>'
    + totRow
    + '<td style="padding:6px 7px;text-align:right;font-size:10.5px;font-weight:800;border-left:2px solid #ccc;border-top:2px solid #ccc">' + Math.round(grandTotal) + 'h</td>'
    + '</tr></tfoot></table></div>'
    + '</div>' : '';

  const html = '<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8">'
    + '<title>Planeamento de Recursos · ' + periodLbl + '</title>'
    + '<style>'
    + '*{box-sizing:border-box;margin:0;padding:0}'
    + 'body{font-family:\'DIN Next LT Pro\',\'Segoe UI\',system-ui,Arial,sans-serif;color:#1a1917;background:#f0ede6;print-color-adjust:exact;-webkit-print-color-adjust:exact}'
    + '.page{width:210mm;max-width:210mm;margin:0 auto 24px;background:#fff;padding:13mm 15mm;min-height:270mm}'
    + 'table{border-collapse:collapse}'
    + '.print-btn{position:fixed;bottom:24px;right:24px;background:#8B2638;color:#fff;border:none;padding:11px 22px;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 4px 16px rgba(139,38,56,.35);z-index:99;letter-spacing:.02em}'
    + '.print-btn:hover{background:#6e1f2c}'
    + '@media print{'
    + 'body{background:#fff}'
    + '.print-btn{display:none!important}'
    + '.page{margin:0;padding:10mm 14mm;page-break-after:always;min-height:unset}'
    + '.page:last-child{page-break-after:auto}'
    + '}'
    + '</style></head><body>'
    + '<button class="print-btn" onclick="window.print()">🖨 Imprimir / Guardar PDF</button>'
    + page1 + page2 + page3
    + '</body></html>';

  const win = window.open('', '_blank');
  if (!win) { toast('Permite popups para este site e tenta novamente', 'error'); return; }
  win.document.write(html);
  win.document.close();
  document.getElementById('modal-report').classList.remove('active');
  toast('Relatório gerado — usa Ctrl+P para guardar PDF');
}

function exportPersonReport({ workers: filterWorkers = [], years: filterYears = [], fullReport = true, groupBy = 'project' } = {}) {
  const now = new Date();
  const ML  = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  const workers = filterWorkers.length ? filterWorkers : [...state.workers];
  const curY    = now.getFullYear();
  const allDataYears = getAllYears().length ? getAllYears() : [curY];
  const years   = (filterYears.length ? filterYears : [curY]).slice().sort((a, b) => a - b);

  // All months across selected years
  const yms = years.flatMap(y => Array.from({length: 12}, (_, i) => ymKey(y, i + 1)));

  // Visible records for selected workers
  const records = visibleRecords().filter(r => workers.includes(r.worker));

  // Utilization per person × month
  const util = {};
  for (const w of workers) {
    util[w] = {};
    for (const ym of yms) {
      const cap   = getCapacity(w, ym);
      const alloc = records.reduce((s, r) => r.worker === w ? s + (r.monthsHours?.[ym] || 0) : s, 0);
      util[w][ym] = { cap, alloc, pct: cap > 0 ? alloc / cap : 0 };
    }
  }

  // Key function based on grouping level
  const groupKey = r => {
    const base = r.project;
    if (groupBy === 'project') return base;
    const withWP = base + (r.wp   ? ' · ' + r.wp   : '');
    if (groupBy === 'wp')      return withWP;
    return withWP + (r.task ? ' · ' + r.task : '');
  };

  // Breakdown per person: {worker: {key: {ym: hours}}}
  const ppProj = {};
  for (const w of workers) {
    ppProj[w] = {};
    for (const r of records.filter(r => r.worker === w)) {
      const key = groupKey(r);
      if (!ppProj[w][key]) ppProj[w][key] = {};
      for (const ym of yms) {
        const h = r.monthsHours?.[ym] || 0;
        if (h > 0) ppProj[w][key][ym] = (ppProj[w][key][ym] || 0) + h;
      }
    }
  }

  // Color helpers
  const hc = p => p === 0 ? '#f2f0eb'
    : p < 0.26  ? '#d4eadb'
    : p < 0.76  ? '#a3c8ad'
    : p < 0.96  ? '#4a8f5e'
    : p <= 1.10 ? '#d97c10'
    : '#8B2638';
  const tc = p => p >= 0.76 ? '#fff' : '#1a1917';
  const kpiColor = p => p >= 1.10 ? '#8B2638' : p >= 0.96 ? '#d97c10' : p >= 0.76 ? '#2d7a4a' : '#444';

  // Metadata
  const genDate  = now.toLocaleDateString('pt-PT', {day:'2-digit', month:'long', year:'numeric'});
  const genTime  = now.toLocaleTimeString('pt-PT', {hour:'2-digit', minute:'2-digit'});
  const genUser  = (typeof sessionCtx !== 'undefined' && sessionCtx)
    ? (sessionCtx.displayName || sessionCtx.initials || '—') : '—';
  const periodLbl = years.length === 1 ? String(years[0])
    : years[0] + '–' + years[years.length - 1];

  // INEGI logo
  const logoSVG = '<svg width="108" height="40" viewBox="0 0 108 40" xmlns="http://www.w3.org/2000/svg">'
    + '<rect width="5" height="40" fill="#8B2638"/>'
    + '<text x="12" y="26" font-family="\'DIN Next LT Pro\',\'Segoe UI\',Arial,sans-serif" font-size="21" font-weight="800" fill="#8B2638" letter-spacing="-0.3">INEGI</text>'
    + '<text x="12" y="37" font-family="\'Segoe UI\',Arial,sans-serif" font-size="5.8" fill="#8C8E8F" letter-spacing="0.09em">INSTITUTO · ENGENHARIA</text>'
    + '</svg>';

  // Page header helper
  const pageHeader = (title) => ''
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid #8B2638;padding-bottom:10px;margin-bottom:18px">'
    + '<div style="display:flex;align-items:center;gap:14px">'
    + logoSVG
    + '<div><div style="font-size:14.5px;font-weight:800;color:#1a1917;letter-spacing:-0.3px">' + title + '</div>'
    + '<div style="font-size:9px;color:#8C8E8F;margin-top:2px">Relatório por pessoa &nbsp;·&nbsp; ' + periodLbl + ' &nbsp;·&nbsp; detalhe: ' + ({project:'projecto',wp:'WP',task:'tarefa'}[groupBy]) + '</div></div></div>'
    + '<div style="text-align:right;font-size:9px;color:#8C8E8F;line-height:1.75">'
    + '<div>Gerado por <strong style="color:#444">' + genUser + '</strong></div>'
    + '<div>' + genDate + ', ' + genTime + '</div>'
    + '</div></div>';

  const h2 = label => '<div style="font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.13em;color:#8C8E8F;margin:20px 0 8px;padding-bottom:5px;border-bottom:1px solid #e8e4dc">' + label + '</div>';

  // ── Allocation vs capacity bars per month ────────────────────────────
  const allocCapBars = (w) => {
    // Group months by year so we can add a year label when multiple years
    const rows = years.flatMap(y => {
      const ymsY = yms.filter(ym => ymParse(ym).y === y);
      const yearHdr = years.length > 1
        ? '<tr><td colspan="4" style="padding:4px 0 1px;font-size:7.5px;font-weight:800;color:#8B2638;letter-spacing:.08em;text-transform:uppercase">' + y + '</td></tr>'
        : '';
      const mthRows = ymsY.map(ym => {
        const parsed = ymParse(ym);
        const d = util[w][ym];
        const vac = state.absences?.[w]?.[ym];
        const barPct = d.cap > 0 ? Math.min(100, Math.round(d.pct * 100)) : 0;
        const over   = d.cap > 0 && d.pct > 1;
        const color  = hc(d.pct);
        const pctLbl = d.cap > 0 ? Math.round(d.pct * 100) + '%' : '—';
        const hrsLbl = d.cap > 0 ? Math.round(d.alloc) + '/' + d.cap + 'h' : (vac ? '✈' : '');
        return '<tr>'
          // Month label
          + '<td style="padding:2px 5px 2px 0;font-size:8.5px;color:#555;white-space:nowrap">' + ML[parsed.m - 1] + '</td>'
          // Bar track
          + '<td style="width:100%;padding:2px 0">'
          +   '<div style="position:relative;height:10px;background:#f2f0eb;border-radius:2px;overflow:visible">'
          +     '<div style="position:absolute;left:0;top:0;height:100%;width:' + barPct + '%;background:' + color + ';border-radius:2px;min-width:' + (d.alloc > 0 ? 2 : 0) + 'px"></div>'
          +     (over ? '<div style="position:absolute;left:100%;top:0;height:100%;width:' + Math.min(15, Math.round((d.pct - 1) * 100)) + '%;background:#8B2638;opacity:.5;border-radius:0 2px 2px 0"></div>' : '')
          +   '</div>'
          + '</td>'
          // % label
          + '<td style="padding:2px 0 2px 5px;font-size:8px;font-weight:700;color:' + (d.pct >= 1.10 ? '#8B2638' : d.pct >= 0.96 ? '#d97c10' : d.pct >= 0.76 ? '#2d7a4a' : '#8C8E8F') + ';white-space:nowrap;text-align:right">' + pctLbl + '</td>'
          // hours label
          + '<td style="padding:2px 0 2px 4px;font-size:7.5px;color:#8C8E8F;white-space:nowrap;text-align:right">' + hrsLbl + (vac && d.cap > 0 ? ' ✈' : '') + '</td>'
          + '</tr>';
      }).join('');
      return yearHdr + mthRows;
    }).join('');
    return '<table style="width:100%;border-collapse:collapse;margin-top:8px">' + rows + '</table>';
  };

  // ── Page 1: person summary cards ─────────────────────────────────────
  const cols = Math.min(workers.length, 3);
  const cards = workers.map(w => {
    const totalH = yms.reduce((s, ym) => s + util[w][ym].alloc, 0);
    const mthsWithCap = yms.filter(ym => util[w][ym].cap > 0);
    const avgPct = mthsWithCap.length
      ? mthsWithCap.reduce((s, ym) => s + util[w][ym].pct, 0) / mthsWithCap.length : 0;
    const projs = Object.keys(ppProj[w]).sort();
    const color = kpiColor(avgPct);
    return '<div style="border:1px solid #e8e4dc;border-radius:8px;padding:14px;break-inside:avoid;border-top:3px solid ' + (avgPct >= 1.10 ? '#8B2638' : avgPct >= 0.96 ? '#d97c10' : '#4a8f5e') + '">'
      + '<div style="font-size:13px;font-weight:700;color:#1a1917;margin-bottom:10px">' + w + '</div>'
      + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-bottom:10px">'
      + '<div style="text-align:center"><div style="font-size:20px;font-weight:900;color:' + color + ';line-height:1">' + Math.round(avgPct * 100) + '%</div><div style="font-size:7.5px;color:#8C8E8F;text-transform:uppercase;letter-spacing:.08em;margin-top:2px">Util. média</div></div>'
      + '<div style="text-align:center"><div style="font-size:20px;font-weight:900;color:#1a1917;line-height:1">' + Math.round(totalH) + 'h</div><div style="font-size:7.5px;color:#8C8E8F;text-transform:uppercase;letter-spacing:.08em;margin-top:2px">Total horas</div></div>'
      + '<div style="text-align:center"><div style="font-size:20px;font-weight:900;color:#1a1917;line-height:1">' + projs.length + '</div><div style="font-size:7.5px;color:#8C8E8F;text-transform:uppercase;letter-spacing:.08em;margin-top:2px">Projectos</div></div>'
      + '</div>'
      + allocCapBars(w)
      + (projs.length ? '<div style="font-size:8.5px;color:#8C8E8F;margin-top:8px;line-height:1.5">' + projs.slice(0, 4).join(', ') + (projs.length > 4 ? ' +' + (projs.length - 4) + ' …' : '') + '</div>' : '')
      + '</div>';
  }).join('');

  const page1 = '<div class="page">'
    + pageHeader('Relatório por Pessoa — ' + periodLbl)
    + h2('Visão global')
    + '<div style="display:grid;grid-template-columns:repeat(' + cols + ',1fr);gap:12px">' + cards + '</div>'
    + '<div style="margin-top:18px;font-size:9px;color:#8C8E8F;display:flex;gap:14px;flex-wrap:wrap">'
    + [['#f2f0eb','0%'],['#a3c8ad','≤75%'],['#4a8f5e','76–95%'],['#d97c10','96–110%'],['#8B2638','>110%']].map(
        ([c, l]) => '<span style="display:flex;align-items:center;gap:3px"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + c + '"></span>' + l + '</span>'
      ).join('')
    + '</div>'
    + '</div>';

  // ── Pages 2+: detail per person (transposed: rows=months, cols=projects) ─
  let detailPages = '';
  if (fullReport) {
    detailPages = workers.map(w => {
      const projs = Object.keys(ppProj[w]).sort();
      if (!projs.length) return '';

      const totalH    = yms.reduce((s, ym) => s + util[w][ym].alloc, 0);
      const mthsCap   = yms.filter(ym => util[w][ym].cap > 0);
      const avgPct    = mthsCap.length ? mthsCap.reduce((s, ym) => s + util[w][ym].pct, 0) / mthsCap.length : 0;

      // Abbreviated project names for column headers (max 11 chars)
      const abbr = p => p.length > 11 ? p.slice(0, 10) + '…' : p;

      // Column headers: one per project + Total + Util
      const projThs = projs.map(p =>
        '<th style="padding:4px 3px;text-align:right;font-size:8.5px;font-weight:700;color:#8C8E8F;background:#f2f0eb;min-width:36px;max-width:60px;white-space:nowrap" title="' + p + '">'
        + abbr(p) + '</th>'
      ).join('');

      // Grand total per project (for tfoot)
      const projTotals = projs.map(p => yms.reduce((s, ym) => s + (ppProj[w][p]?.[ym] || 0), 0));

      // Build rows grouped by year
      const yearSections = years.map(y => {
        const ymsY = yms.filter(ym => ymParse(ym).y === y);

        // Year header row (only when multiple years selected)
        const yearHdr = years.length > 1
          ? '<tr><td colspan="' + (projs.length + 3) + '" style="background:#f2f0eb;font-size:9px;font-weight:800;color:#8B2638;padding:5px 8px;letter-spacing:.06em">' + y + '</td></tr>'
          : '';

        // Month rows
        const monthRows = ymsY.map(ym => {
          const parsed = ymParse(ym);
          const d      = util[w][ym];
          const vac    = state.absences?.[w]?.[ym];
          const mthTotal = projs.reduce((s, p) => s + (ppProj[w][p]?.[ym] || 0), 0);
          const projCells = projs.map(p => {
            const h = ppProj[w][p]?.[ym] || 0;
            return '<td style="padding:3px 4px;text-align:right;font-size:9px;color:#333">' + (h > 0 ? Math.round(h) + 'h' : '') + '</td>';
          }).join('');
          const utilCell = d.cap > 0
            ? '<td style="padding:3px 5px;text-align:right;font-size:9px;font-weight:600;background:' + hc(d.pct) + ';color:' + tc(d.pct) + '">'
              + Math.round(d.pct * 100) + '%' + (vac ? ' ✈' : '') + '</td>'
            : '<td style="padding:3px 5px;text-align:right;font-size:9px;color:#ccc">—' + (vac ? ' ✈' : '') + '</td>';
          return '<tr>'
            + '<td style="padding:3px 8px 3px 0;font-size:9.5px;white-space:nowrap;color:#444">' + ML[parsed.m - 1] + '</td>'
            + projCells
            + '<td style="padding:3px 5px;text-align:right;font-size:9.5px;font-weight:700;border-left:1px solid #e8e4dc">' + (mthTotal > 0 ? Math.round(mthTotal) + 'h' : '') + '</td>'
            + utilCell
            + '</tr>';
        }).join('');

        // Year subtotal row
        const yTotals = projs.map(p => ymsY.reduce((s, ym) => s + (ppProj[w][p]?.[ym] || 0), 0));
        const yTotal  = ymsY.reduce((s, ym) => s + util[w][ym].alloc, 0);
        const yCapMths = ymsY.filter(ym => util[w][ym].cap > 0);
        const yAvg    = yCapMths.length ? yCapMths.reduce((s, ym) => s + util[w][ym].pct, 0) / yCapMths.length : 0;
        const yTotalCells = yTotals.map(h =>
          '<td style="padding:4px 4px;text-align:right;font-size:9px;font-weight:700;background:#f6f3ec;border-top:1px solid #ccc">' + (h > 0 ? Math.round(h) + 'h' : '') + '</td>'
        ).join('');
        const ySubtotal = '<tr>'
          + '<td style="padding:4px 8px 4px 0;font-size:9px;font-weight:800;background:#f6f3ec;border-top:1px solid #ccc;color:#555">Total ' + (years.length > 1 ? y : '') + '</td>'
          + yTotalCells
          + '<td style="padding:4px 5px;text-align:right;font-size:9.5px;font-weight:800;background:#f6f3ec;border-left:1px solid #e8e4dc;border-top:1px solid #ccc">' + Math.round(yTotal) + 'h</td>'
          + '<td style="padding:4px 5px;text-align:right;font-size:9.5px;font-weight:800;background:#f6f3ec;border-top:1px solid #ccc;color:' + kpiColor(yAvg) + '">' + Math.round(yAvg * 100) + '%</td>'
          + '</tr>';

        return yearHdr + monthRows + ySubtotal;
      }).join('');

      // Grand total row (only when multiple years)
      const grandTotalRow = years.length > 1
        ? '<tr>'
          + '<td style="padding:5px 8px 5px 0;font-size:9.5px;font-weight:800;border-top:2px solid #8B2638;color:#1a1917">Total</td>'
          + projTotals.map(h => '<td style="padding:5px 4px;text-align:right;font-size:9.5px;font-weight:800;border-top:2px solid #8B2638">' + (h > 0 ? Math.round(h) + 'h' : '') + '</td>').join('')
          + '<td style="padding:5px 5px;text-align:right;font-size:10px;font-weight:900;border-left:1px solid #e8e4dc;border-top:2px solid #8B2638">' + Math.round(totalH) + 'h</td>'
          + '<td style="padding:5px 5px;text-align:right;font-size:10px;font-weight:900;border-top:2px solid #8B2638;color:' + kpiColor(avgPct) + '">' + Math.round(avgPct * 100) + '%</td>'
          + '</tr>'
        : '';

      // Project legend (full names, in case they were truncated)
      const needsLegend = projs.some(p => p.length > 11);
      const legend = needsLegend
        ? '<div style="margin-top:14px;font-size:8px;color:#8C8E8F;line-height:1.8">'
          + '<strong style="font-size:7.5px;text-transform:uppercase;letter-spacing:.1em">Legenda</strong><br>'
          + projs.map(p => abbr(p) + ' → ' + p).filter((_, i) => projs[i].length > 11).join(' &nbsp;·&nbsp; ')
          + '</div>'
        : '';

      return '<div class="page">'
        + pageHeader(w)
        + h2('Alocação por projecto · ' + periodLbl)
        + '<table style="border-collapse:collapse;width:100%">'
        + '<thead><tr>'
        + '<th style="padding:4px 8px 4px 0;font-size:9px;color:#8C8E8F;text-align:left;min-width:28px">Mês</th>'
        + projThs
        + '<th style="padding:4px 5px;font-size:8.5px;font-weight:700;color:#8C8E8F;border-left:1px solid #e8e4dc;text-align:right">Total</th>'
        + '<th style="padding:4px 5px;font-size:8.5px;font-weight:700;color:#8C8E8F;background:#f2f0eb;text-align:right">Util.</th>'
        + '</tr></thead>'
        + '<tbody>' + yearSections + grandTotalRow + '</tbody>'
        + '</table>'
        + legend
        + '</div>';
    }).join('');
  }

  const html = '<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8">'
    + '<title>Relatório por Pessoa · ' + periodLbl + '</title>'
    + '<style>'
    + '*{box-sizing:border-box;margin:0;padding:0}'
    + 'body{font-family:\'DIN Next LT Pro\',\'Segoe UI\',system-ui,Arial,sans-serif;color:#1a1917;background:#f0ede6;print-color-adjust:exact;-webkit-print-color-adjust:exact}'
    + '.page{width:210mm;max-width:210mm;margin:0 auto 24px;background:#fff;padding:13mm 15mm;min-height:270mm}'
    + 'table{border-collapse:collapse}'
    + '.print-btn{position:fixed;bottom:24px;right:24px;background:#8B2638;color:#fff;border:none;padding:11px 22px;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 4px 16px rgba(139,38,56,.35);z-index:99;letter-spacing:.02em}'
    + '.print-btn:hover{background:#6e1f2c}'
    + '@media print{body{background:#fff}.print-btn{display:none!important}.page{margin:0;padding:10mm 14mm;page-break-after:always;min-height:unset}.page:last-child{page-break-after:auto}}'
    + '</style></head><body>'
    + '<button class="print-btn" onclick="window.print()">🖨 Imprimir / Guardar PDF</button>'
    + page1 + detailPages
    + '</body></html>';

  const win = window.open('', '_blank');
  if (!win) { toast('Permite popups para este site e tenta novamente', 'error'); return; }
  win.document.write(html);
  win.document.close();
  document.getElementById('modal-report').classList.remove('active');
  toast('Relatório por pessoa gerado — usa Ctrl+P para guardar PDF');
}

// ════════════════════════════════════════════════════════════════════════
// DOWNLOAD / UPLOAD JSON
// ════════════════════════════════════════════════════════════════════════
const DATA_FORMAT_VERSION = 1;

function buildBaselineSnapshot() {
  // Snapshot do estado actual: { recordId: {hash, updatedAt} }
  const snap = {};
  for (const r of state.records) {
    snap[r.id] = {
      hash: recordContentHash(r),
      updatedAt: r.updatedAt || null,
    };
  }
  return snap;
}


// ────────── Modal de iniciais (promise-based) ──────────
let pendingInitialsResolve = null;

function askInitials(purposeLabel) {
  return new Promise((resolve) => {
    pendingInitialsResolve = resolve;
    const modal = document.getElementById('modal-initials');
    const inp = document.getElementById('f-initials');
    inp.value = state.editorInitials || '';
    // Mostrar preview do nome do ficheiro
    updateInitialsPreview(purposeLabel);
    inp.oninput = () => {
      inp.value = sanitizeInitials(inp.value);
      updateInitialsPreview(purposeLabel);
    };
    modal.classList.add('active');
    setTimeout(() => inp.focus(), 50);
  });
}

function updateInitialsPreview(purposeLabel) {
  const inp = document.getElementById('f-initials');
  const init = sanitizeInitials(inp.value) || '____';
  const ts = fileTimestamp();
  if (purposeLabel === 'check-in') {
    document.getElementById('initials-preview').textContent =
      `Sessão iniciada como: ${init}`;
    return;
  }
  if (purposeLabel === 'plan') {
    document.getElementById('initials-preview').textContent =
      `Plano submetido por: ${init}`;
    return;
  }
  const ext = purposeLabel === 'excel' ? 'xlsx' : (purposeLabel === 'report' ? 'md' : 'json');
  const prefix = purposeLabel === 'excel' ? 'planeamento_processos' :
                 purposeLabel === 'report' ? 'sync_report' : 'planeamento_processos';
  document.getElementById('initials-preview').textContent =
    `Nome: ${prefix}_${ts}_${init}.${ext}`;
}

function resolveInitialsModal(value) {
  document.getElementById('modal-initials').classList.remove('active');
  if (pendingInitialsResolve) {
    const r = pendingInitialsResolve;
    pendingInitialsResolve = null;
    r(value);
  }
}

document.getElementById('modal-initials-close').onclick = () => resolveInitialsModal(null);
document.getElementById('initials-cancel').onclick = () => resolveInitialsModal(null);
document.getElementById('modal-initials').addEventListener('click', (e) => {
  if (e.target.id === 'modal-initials') resolveInitialsModal(null);
});
document.getElementById('form-initials').addEventListener('submit', async (e) => {
  e.preventDefault();
  const raw = document.getElementById('f-initials').value;
  const clean = sanitizeInitials(raw);
  if (!clean) {
    toast('Indica pelo menos uma letra', 'error');
    return;
  }
  // Persistir se mudou
  if (state.editorInitials !== clean) {
    state.editorInitials = clean;
    await saveState();
  }
  resolveInitialsModal(clean);
});

document.getElementById('btn-download-json').onclick = async () => {
  // Pedir iniciais primeiro (cancela = aborta)
  const initials = await askInitials('json');
  if (!initials) return;

  // Garantir que todos os records têm updatedAt antes de exportar
  await saveState();

  const baselineSnapshot = buildBaselineSnapshot();
  const exportedAt = new Date().toISOString();
  const payload = {
    format: 'planeamento-processos',
    version: DATA_FORMAT_VERSION,
    exportedAt,
    exportedBy: initials,
    workers: state.workers,
    projects: state.projects,
    capacity: state.capacity,
    records: state.records,
    baselineSnapshot,  // estado de referência no momento do download
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `planeamento_processos_${fileTimestamp()}_${initials}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);

  // Guardar a baseline localmente para futuros merges
  state.lastSyncBaseline = {
    timestamp: exportedAt,
    recordsById: baselineSnapshot,
  };
  await saveState();

  toast(`JSON descarregado (${initials}) · baseline registada`);
};

document.getElementById('btn-upload-json').onclick = () => {
  document.getElementById('file-input-json').click();
};

document.getElementById('file-input-json').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);

    // Validação básica
    if (!data || typeof data !== 'object') throw new Error('Formato inválido');
    if (!Array.isArray(data.records) || !Array.isArray(data.workers)) {
      throw new Error('Estrutura inválida: faltam campos "records" ou "workers"');
    }

    // Sanitizar records (garantir IDs)
    const cleanedRecords = data.records.map((r, i) => ({
      id: r.id || `imp_${Date.now()}_${i}`,
      team: r.team || 'Processos',
      worker: r.worker,
      project: r.project,
      wp: r.wp || '',
      task: r.task || '',
      start: r.start,
      end: r.end,
      totalHours: typeof r.totalHours === 'number' ? r.totalHours : 0,
      monthsHours: r.monthsHours && typeof r.monthsHours === 'object' ? r.monthsHours : {},
    })).filter(r => r.worker && r.project && r.start && r.end);

    // Apresentar info no modal
    const exportedLabel = data.exportedAt ? new Date(data.exportedAt).toLocaleString('pt-PT') : 'desconhecida';
    const byLabel = data.exportedBy ? ` por <strong>${data.exportedBy}</strong>` : '';
    document.getElementById('import-json-info').innerHTML = `
      <div><strong>${file.name}</strong></div>
      <div style="color:var(--ink-soft); margin-top:6px; font-size:12px">
        Exportado em: <span class="mono">${exportedLabel}</span>${byLabel}<br>
        ${cleanedRecords.length} alocações · ${(data.workers || []).length} pessoas · ${(data.projects || []).length} projetos
      </div>
      <div style="color:var(--ink-soft); margin-top:6px; font-size:12px">
        Estado atual: ${state.records.length} alocações · ${state.workers.length} pessoas · ${state.projects.length} projetos
      </div>
    `;

    // Guardar payload sanitizado para uso pelos handlers
    pendingImport.value = {
      workers: Array.isArray(data.workers) ? data.workers : [],
      projects: Array.isArray(data.projects) ? data.projects : [],
      capacity: data.capacity && typeof data.capacity === 'object' ? data.capacity : {},
      records: cleanedRecords,
    };

    document.getElementById('modal-import-json').classList.add('active');
  } catch (err) {
    console.error(err);
    toast('Erro a ler JSON: ' + err.message, 'error');
  }
  e.target.value = '';  // permitir reimportar mesmo ficheiro
});

const pendingImport = { value: null };

function closeImportJsonModal() {
  document.getElementById('modal-import-json').classList.remove('active');
  pendingImport.value = null;
}

document.getElementById('modal-import-json-close').onclick = closeImportJsonModal;
document.getElementById('impj-cancel').onclick = closeImportJsonModal;
document.getElementById('modal-import-json').addEventListener('click', (e) => {
  if (e.target.id === 'modal-import-json') closeImportJsonModal();
});

document.getElementById('impj-replace').onclick = async () => {
  if (!guardEdit()) return;
  const p = pendingImport.value;
  if (!p) return;
  autoBackup('Antes de Substituir JSON');
  state.workers = [...p.workers];
  state.projects = [...p.projects];
  state.capacity = {...p.capacity};
  state.records = [...p.records];
  await saveState();
  closeImportJsonModal();
  // Reset filtros e re-render
  resetUIFilters();
  renderView(currentView());
  toast(`Estado substituído (${p.records.length} alocações)`);
};

document.getElementById('impj-merge').onclick = async () => {
  if (!guardEdit()) return;
  const p = pendingImport.value;
  if (!p) return;

  // Workers: união
  const wSet = new Set([...state.workers, ...p.workers]);
  state.workers = [...wSet].sort();

  // Projects: mesclar por nome
  const pMap = new Map(state.projects.map(x => [x.name, x]));
  for (const np of p.projects) {
    if (!pMap.has(np.name)) pMap.set(np.name, np);
  }
  state.projects = [...pMap.values()];

  // Capacity: o novo sobrepõe o velho por (worker, ym)
  for (const [w, months] of Object.entries(p.capacity)) {
    if (!state.capacity[w]) state.capacity[w] = {};
    Object.assign(state.capacity[w], months);
  }

  // Records: por id, novos substituem velhos; sem id → novo registo
  const rMap = new Map(state.records.map(r => [r.id, r]));
  let added = 0, updated = 0;
  for (const nr of p.records) {
    if (rMap.has(nr.id)) {
      rMap.set(nr.id, nr);
      updated++;
    } else {
      rMap.set(nr.id, nr);
      added++;
    }
  }
  state.records = [...rMap.values()];

  await saveState();
  closeImportJsonModal();
  resetUIFilters();
  renderView(currentView());
  toast(`Mesclado: ${added} novos, ${updated} atualizados`);
};


// ════════════════════════════════════════════════════════════════════════
// MESCLAR INTELIGENTE (3-way diff)
// ════════════════════════════════════════════════════════════════════════
// Modelo: cada registo tem id + updatedAt + conteúdo. O ficheiro vem com baselineSnapshot
// que representa o estado original (referência comum). Classificamos cada id:
//   - novo: existe no ficheiro mas não no local
//   - alterado: existe em ambos; hash diferente; só um lado mudou face à baseline → ganha o lado que mudou
//   - conflito: ambos mudaram face à baseline → mais recente ganha (por updatedAt)
//   - removido: existe localmente mas não no ficheiro (e na baseline → significa que foi eliminado no ficheiro)
// Capacidades, workers, projects: união simples; ficheiro tem precedência em capacidade por (worker, ym)

let pendingDiff = null;  // resultado do computeDiff guardado para uso em diff-apply

function computeDiff(incoming) {
  const fileBaseline = incoming.baselineSnapshot || {};
  const fileRecords = new Map(incoming.records.map(r => [r.id, r]));
  const localRecords = new Map(state.records.map(r => [r.id, r]));

  const result = {
    newRecords: [],          // estão no ficheiro, não em local
    changedRecords: [],      // mudaram só de um lado (sem conflito)
    conflictRecords: [],     // ambos mudaram → mais recente ganha
    removedLocal: [],        // local existe, ficheiro não, baseline tinha → eliminar local
    onlyLocal: [],            // local existe, ficheiro não, baseline também NÃO tinha → ignorar (mantém)
    capacityChanges: 0,
    workersAdded: [],
    projectsAdded: [],
  };

  const allIds = new Set([...fileRecords.keys(), ...localRecords.keys()]);
  for (const id of allIds) {
    const f = fileRecords.get(id);
    const l = localRecords.get(id);
    if (f && !l) {
      result.newRecords.push({ id, file: f });
      continue;
    }
    if (!f && l) {
      const wasInBaseline = !!fileBaseline[id];
      if (wasInBaseline) result.removedLocal.push({ id, local: l });
      else result.onlyLocal.push({ id, local: l });
      continue;
    }
    // ambos existem
    const fHash = recordContentHash(f);
    const lHash = recordContentHash(l);
    if (fHash === lHash) continue;  // sem alteração
    const baseHash = fileBaseline[id]?.hash;
    const localChanged = baseHash !== undefined ? baseHash !== lHash : true;
    const fileChanged = baseHash !== undefined ? baseHash !== fHash : true;
    if (localChanged && fileChanged) {
      // Conflito → mais recente ganha
      const lTime = l.updatedAt ? Date.parse(l.updatedAt) : 0;
      const fTime = f.updatedAt ? Date.parse(f.updatedAt) : 0;
      result.conflictRecords.push({
        id,
        file: f, local: l,
        winner: fTime >= lTime ? 'file' : 'local',
        fTime, lTime,
      });
    } else if (fileChanged) {
      // Só o ficheiro mudou → aplicar ficheiro
      result.changedRecords.push({ id, file: f, local: l, side: 'file' });
    } else if (localChanged) {
      // Só o local mudou → manter local (não aparece como mudança para o utilizador)
      // mas vamos registar para o resumo
      result.changedRecords.push({ id, file: f, local: l, side: 'local' });
    }
  }

  // Workers / projects
  const lWset = new Set(state.workers);
  for (const w of incoming.workers) if (!lWset.has(w)) result.workersAdded.push(w);
  const lPset = new Set(state.projects.map(p => p.name));
  for (const p of incoming.projects) if (!lPset.has(p.name)) result.projectsAdded.push(p.name);

  // Capacity: contar entradas que vão mudar
  for (const [w, months] of Object.entries(incoming.capacity || {})) {
    for (const [ym, v] of Object.entries(months)) {
      const cur = state.capacity[w]?.[ym];
      if (cur !== v) result.capacityChanges++;
    }
  }

  return result;
}

function describeRecord(r) {
  return `${r.worker} · ${r.project}${r.wp ? ' · ' + r.wp : ''}${r.task ? ' (' + r.task + ')' : ''}`;
}

function describeChange(file, local) {
  const parts = [];
  if (file.worker !== local.worker) parts.push(`pessoa: ${local.worker} → ${file.worker}`);
  if (file.project !== local.project) parts.push(`projeto: ${local.project} → ${file.project}`);
  if (file.wp !== local.wp) parts.push(`WP: ${local.wp || '—'} → ${file.wp || '—'}`);
  if (file.task !== local.task) parts.push(`tarefa: ${local.task || '—'} → ${file.task || '—'}`);
  if (file.start !== local.start || file.end !== local.end) parts.push(`período: ${local.start}→${local.end} → ${file.start}→${file.end}`);
  if (round2(file.totalHours) !== round2(local.totalHours)) parts.push(`horas: ${round2(local.totalHours)} → ${round2(file.totalHours)}`);
  // Detalhe de meses (só conta divergências)
  const ymsAll = new Set([...Object.keys(file.monthsHours || {}), ...Object.keys(local.monthsHours || {})]);
  let monthsDiff = 0;
  for (const ym of ymsAll) {
    if (round2(file.monthsHours?.[ym] || 0) !== round2(local.monthsHours?.[ym] || 0)) monthsDiff++;
  }
  if (monthsDiff > 0 && parts.every(p => !p.startsWith('horas'))) parts.push(`${monthsDiff} mês(es) com horas alteradas`);
  return parts.length > 0 ? parts.join(' · ') : 'sem detalhes';
}

function openDiffModal(incoming) {
  const diff = computeDiff(incoming);
  pendingDiff = { incoming, diff };

  const totalChanges = diff.newRecords.length + diff.changedRecords.filter(c => c.side === 'file').length + diff.conflictRecords.length + diff.removedLocal.length;
  const localChanges = diff.changedRecords.filter(c => c.side === 'local').length;

  document.getElementById('diff-summary').innerHTML = `
    <strong>${incoming.records.length}</strong> alocações no ficheiro · estado local tem <strong>${state.records.length}</strong><br>
    <span style="color:var(--ink-soft); font-size:12px">
      ${totalChanges} alterações a aplicar · ${diff.conflictRecords.length} conflito(s) ${diff.conflictRecords.length > 0 ? '(resolvidos por timestamp)' : ''}${localChanges > 0 ? ` · ${localChanges} registo(s) só com edições locais (preservados)` : ''}
    </span>
  `;

  const sections = [];

  // Novos
  sections.push(diffSection('new', '🆕', 'Novos registos', diff.newRecords.length,
    diff.newRecords.map(x => `<div class="diff-item"><div class="di-title">${describeRecord(x.file)}</div><div class="di-changes">${ymLabel(x.file.start)} → ${ymLabel(x.file.end)} · ${round2(x.file.totalHours)}h</div></div>`).join('')
  ));

  // Alterados (só os que vêm do ficheiro)
  const changedFromFile = diff.changedRecords.filter(c => c.side === 'file');
  sections.push(diffSection('changed', '✏️', 'Alterados (ficheiro tem novidades)', changedFromFile.length,
    changedFromFile.map(x => `<div class="diff-item"><div class="di-title">${describeRecord(x.file)}</div><div class="di-changes">${describeChange(x.file, x.local)}</div></div>`).join('')
  ));

  // Conflitos
  sections.push(diffSection('conflict', '⚠️', 'Conflitos (mais recente ganha)', diff.conflictRecords.length,
    diff.conflictRecords.map(x => {
      const win = x.winner === 'file' ? 'ficheiro' : 'local';
      const fTime = x.fTime ? new Date(x.fTime).toLocaleString('pt-PT') : '?';
      const lTime = x.lTime ? new Date(x.lTime).toLocaleString('pt-PT') : '?';
      return `<div class="diff-item">
        <div class="di-title">${describeRecord(x.file)}</div>
        <div class="di-changes">${describeChange(x.file, x.local)}</div>
        <div class="di-conflict-note">Ganha: ${win} · ficheiro: ${fTime} · local: ${lTime}</div>
      </div>`;
    }).join('')
  ));

  // Removidos
  sections.push(diffSection('removed', '🗑️', 'Eliminados (existem só localmente, foram apagados no ficheiro)', diff.removedLocal.length,
    diff.removedLocal.map(x => `<div class="diff-item"><div class="di-title">${describeRecord(x.local)}</div><div class="di-changes">${ymLabel(x.local.start)} → ${ymLabel(x.local.end)} · ${round2(x.local.totalHours)}h</div></div>`).join('')
  ));

  document.getElementById('diff-sections').innerHTML = sections.join('');
  // Bind expandir/colapsar
  document.querySelectorAll('#diff-sections .diff-section-head').forEach(h => {
    h.onclick = () => h.parentElement.classList.toggle('open');
  });

  document.getElementById('modal-diff').classList.add('active');
}

function diffSection(kind, icon, title, count, body) {
  if (count === 0) {
    return `<div class="diff-section">
      <div class="diff-section-head ${kind}">
        <div class="ds-icon">${icon}</div>
        <div class="ds-title" style="color:var(--ink-faint)">${title}</div>
        <div class="ds-count">0</div>
      </div>
    </div>`;
  }
  return `<div class="diff-section">
    <div class="diff-section-head ${kind}">
      <div class="ds-icon">${icon}</div>
      <div class="ds-title">${title}</div>
      <div class="ds-count">${count}</div>
      <div class="ds-toggle">▾</div>
    </div>
    <div class="diff-section-body">${body}</div>
  </div>`;
}

function closeDiffModal() {
  document.getElementById('modal-diff').classList.remove('active');
  pendingDiff = null;
}

document.getElementById('modal-diff-close').onclick = closeDiffModal;
document.getElementById('diff-cancel').onclick = () => {
  closeDiffModal();
  toast('Operação cancelada');
};
document.getElementById('modal-diff').addEventListener('click', (e) => {
  if (e.target.id === 'modal-diff') closeDiffModal();
});

document.getElementById('diff-apply').onclick = async () => {
  if (!guardEdit()) return;
  if (!pendingDiff) return;
  const { incoming, diff } = pendingDiff;

  // Aplicar workers/projects/capacity (união e overlay)
  const wSet = new Set([...state.workers, ...incoming.workers]);
  state.workers = [...wSet].sort();
  const pMap = new Map(state.projects.map(x => [x.name, x]));
  for (const np of incoming.projects) if (!pMap.has(np.name)) pMap.set(np.name, np);
  state.projects = [...pMap.values()];
  for (const [w, months] of Object.entries(incoming.capacity || {})) {
    if (!state.capacity[w]) state.capacity[w] = {};
    Object.assign(state.capacity[w], months);
  }

  // Aplicar records
  const rMap = new Map(state.records.map(r => [r.id, r]));
  let applied = { new: 0, changed: 0, conflicts: 0, removed: 0 };

  for (const x of diff.newRecords) {
    rMap.set(x.id, x.file);
    applied.new++;
  }
  for (const x of diff.changedRecords) {
    if (x.side === 'file') {
      rMap.set(x.id, x.file);
      applied.changed++;
    }
    // 'local' → manter (nada a fazer)
  }
  for (const x of diff.conflictRecords) {
    if (x.winner === 'file') {
      rMap.set(x.id, x.file);
    }
    // Se local ganha, fica como está
    applied.conflicts++;
  }
  for (const x of diff.removedLocal) {
    rMap.delete(x.id);
    applied.removed++;
  }

  state.records = [...rMap.values()];

  // Atualizar baseline para o estado pós-merge (próximo merge usa isto)
  state.lastSyncBaseline = {
    timestamp: new Date().toISOString(),
    recordsById: buildBaselineSnapshot(),  // chamado depois de aplicar mudanças
  };

  await saveState();
  closeDiffModal();
  resetUIFilters();
  renderView(currentView());

  toast(`Aplicadas ${applied.new + applied.changed + applied.conflicts + applied.removed} alterações`);

  // Oferecer relatório
  setTimeout(() => offerChangeReport(incoming, diff, applied), 600);
};

function offerChangeReport(incoming, diff, applied) {
  if (!confirm('Aplicado com sucesso. Queres descarregar um relatório markdown das alterações?')) return;
  const now = new Date();
  const lines = [];
  lines.push(`# Relatório de sincronização`);
  lines.push('');
  lines.push(`**Data:** ${now.toLocaleString('pt-PT')}`);
  lines.push(`**Ficheiro origem:** exportado em ${incoming.exportedAt ? new Date(incoming.exportedAt).toLocaleString('pt-PT') : 'desconhecida'}${incoming.exportedBy ? ' por **' + incoming.exportedBy + '**' : ''}`);
  if (state.editorInitials) lines.push(`**Sincronizado por:** ${state.editorInitials}`);
  lines.push('');
  lines.push(`## Resumo`);
  lines.push('');
  lines.push(`- 🆕 Novos: **${applied.new}**`);
  lines.push(`- ✏️ Alterados: **${applied.changed}**`);
  lines.push(`- ⚠️ Conflitos resolvidos: **${applied.conflicts}**`);
  lines.push(`- 🗑️ Eliminados localmente: **${applied.removed}**`);
  if (diff.workersAdded.length) lines.push(`- 👤 Pessoas adicionadas: ${diff.workersAdded.join(', ')}`);
  if (diff.projectsAdded.length) lines.push(`- 📁 Projetos adicionados: ${diff.projectsAdded.join(', ')}`);
  if (diff.capacityChanges) lines.push(`- ⏱ Entradas de capacidade alteradas: ${diff.capacityChanges}`);
  lines.push('');

  if (diff.newRecords.length) {
    lines.push(`## Novos registos (${diff.newRecords.length})`);
    lines.push('');
    for (const x of diff.newRecords) {
      lines.push(`- **${describeRecord(x.file)}** · ${ymLabel(x.file.start)} → ${ymLabel(x.file.end)} · ${round2(x.file.totalHours)}h`);
    }
    lines.push('');
  }

  const changedFromFile = diff.changedRecords.filter(c => c.side === 'file');
  if (changedFromFile.length) {
    lines.push(`## Alterados (${changedFromFile.length})`);
    lines.push('');
    for (const x of changedFromFile) {
      lines.push(`- **${describeRecord(x.file)}**`);
      lines.push(`  - ${describeChange(x.file, x.local)}`);
    }
    lines.push('');
  }

  if (diff.conflictRecords.length) {
    lines.push(`## Conflitos resolvidos (${diff.conflictRecords.length})`);
    lines.push('');
    lines.push('Quando ambos os lados editaram após a baseline comum, prevalece o mais recente.');
    lines.push('');
    for (const x of diff.conflictRecords) {
      const win = x.winner === 'file' ? 'ficheiro' : 'local';
      const fT = x.fTime ? new Date(x.fTime).toLocaleString('pt-PT') : '?';
      const lT = x.lTime ? new Date(x.lTime).toLocaleString('pt-PT') : '?';
      lines.push(`- **${describeRecord(x.file)}** · venceu: \`${win}\``);
      lines.push(`  - ficheiro: ${fT} · local: ${lT}`);
      lines.push(`  - ${describeChange(x.file, x.local)}`);
    }
    lines.push('');
  }

  if (diff.removedLocal.length) {
    lines.push(`## Eliminados (${diff.removedLocal.length})`);
    lines.push('');
    for (const x of diff.removedLocal) {
      lines.push(`- **${describeRecord(x.local)}** · ${ymLabel(x.local.start)} → ${ymLabel(x.local.end)}`);
    }
    lines.push('');
  }

  const md = lines.join('\n');
  const blob = new Blob([md], {type: 'text/markdown'});
  const url = URL.createObjectURL(blob);
  const initSuffix = state.editorInitials ? `_${state.editorInitials}` : '';
  const a = document.createElement('a');
  a.href = url;
  a.download = `sync_report_${fileTimestamp(now)}${initSuffix}.md`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
}

// Botão "Mesclar inteligente"
document.getElementById('impj-smart').onclick = () => {
  if (!guardEdit()) return;
  const p = pendingImport.value;
  if (!p) return;
  // Fechar o modal anterior, abrir diff
  document.getElementById('modal-import-json').classList.remove('active');
  openDiffModal(p);
};

function resetUIFilters() {
  document.getElementById('filter-worker').innerHTML = '<option value="">Todas as pessoas</option>';
  document.getElementById('filter-project').innerHTML = '<option value="">Todos os projetos</option>';
  ganttFilters.workers = null;
  ganttFilters.projects = null;
}


// ════════════════════════════════════════════════════════════════════════
// IMPORT/EXPORT EXCEL
// ════════════════════════════════════════════════════════════════════════
document.getElementById('btn-import').onclick = () => { if (guardEdit()) document.getElementById('file-input').click(); };

document.getElementById('file-input').addEventListener('change', async (e) => {
  if (!guardEdit()) { e.target.value = ''; return; }
  const file = e.target.files[0];
  if (!file) return;
  if (!confirm('Importar substitui as alocações atuais. Continuar?')) {
    e.target.value = '';
    return;
  }
  try {
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, {type:'array', cellDates:true});
    importFromWorkbook(wb);
  } catch (err) {
    console.error(err);
    toast('Erro a ler ficheiro: ' + err.message, 'error');
  }
  e.target.value = '';
});

function importFromWorkbook(wb) {
  // Procurar folha Worker Assignment (INPUT)
  const inputSheet = wb.SheetNames.find(n => n.toLowerCase().includes('worker assignment')) || wb.SheetNames[0];
  const ws = wb.Sheets[inputSheet];
  if (!ws) { toast('Folha "Worker Assignment" não encontrada', 'error'); return; }
  const rows = XLSX.utils.sheet_to_json(ws, {header: 1, raw: true, defval: null});

  // Header está tipicamente em row index 3 (linha 4)
  let headerIdx = -1;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const row = rows[i] || [];
    if (row.includes('WORKER') && row.includes('PROJECT')) { headerIdx = i; break; }
  }
  if (headerIdx === -1) { toast('Cabeçalho WORKER/PROJECT não encontrado', 'error'); return; }
  const header = rows[headerIdx];

  // Mapear colunas de meses
  const monthMap = {};  // colIdx -> "YYYY-MM"
  const PT_MONTHS = {jan:1,fev:2,mar:3,abr:4,mai:5,jun:6,jul:7,ago:8,set:9,out:10,nov:11,dez:12};
  header.forEach((h, idx) => {
    if (typeof h === 'string' && h.includes('/')) {
      const parts = h.split('/');
      const m = PT_MONTHS[parts[0].toLowerCase()];
      if (m && parts[1]) {
        const y = 2000 + parseInt(parts[1]);
        monthMap[idx] = ymKey(y, m);
      }
    }
  });
  const wkIdx = header.indexOf('WORKER');
  const prIdx = header.indexOf('PROJECT');
  const tmIdx = header.indexOf('TEAM');
  const wpIdx = header.indexOf('WP');
  const tkIdx = header.indexOf('TASK');

  // Tentar ler capacidades também
  const newCapacity = {};
  const capSheet = wb.SheetNames.find(n => n.toLowerCase().includes('horas dispon'));
  if (capSheet) {
    const capRows = XLSX.utils.sheet_to_json(wb.Sheets[capSheet], {header:1, raw:true});
    for (const row of capRows) {
      if (!row || row.length < 5) continue;
      const name = row[1], year = row[2], month = row[3], hours = row[4];
      if (typeof name === 'string' && typeof year === 'number' && typeof month === 'number' && typeof hours === 'number') {
        if (!newCapacity[name]) newCapacity[name] = {};
        newCapacity[name][ymKey(year, month)] = hours;
      }
    }
  }

  // Construir registos
  const newRecords = [];
  const workersSet = new Set();
  const projectsSet = new Set();

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const worker = row[wkIdx];
    const project = row[prIdx];
    if (!worker || !project) continue;
    workersSet.add(String(worker).trim());
    projectsSet.add(String(project).trim());

    const monthsHours = {};
    let firstYM = null, lastYM = null;
    for (const [idx, ym] of Object.entries(monthMap)) {
      const v = row[idx];
      if (typeof v === 'number' && v > 0) {
        const cap = newCapacity[worker]?.[ym] || 140;
        const h = v <= 1.5 ? v * cap : v;  // se < 1.5 assumimos %, caso contrário já horas
        monthsHours[ym] = round2(h);
        if (!firstYM || ym < firstYM) firstYM = ym;
        if (!lastYM || ym > lastYM) lastYM = ym;
      }
    }
    if (Object.keys(monthsHours).length === 0) continue;

    const total = Object.values(monthsHours).reduce((s,v) => s+v, 0);
    newRecords.push({
      id: uuid(),
      team: row[tmIdx] || 'Processos',
      worker: String(worker).trim(),
      project: String(project).trim(),
      wp: row[wpIdx] != null ? String(row[wpIdx]).trim() : '',
      task: row[tkIdx] != null ? String(row[tkIdx]).trim() : '',
      start: firstYM,
      end: lastYM,
      totalHours: round2(total),
      monthsHours,
    });
  }

  state.records = newRecords;
  state.workers = [...new Set([...state.workers, ...workersSet])].sort();
  // Projetos: merge com existentes
  for (const p of projectsSet) {
    if (!state.projects.find(x => x.name === p)) state.projects.push({name: p, active: true});
  }
  if (Object.keys(newCapacity).length > 0) state.capacity = newCapacity;

  saveState();
  toast(`Importado: ${newRecords.length} alocações, ${workersSet.size} pessoas`);
  renderView(currentView());
  // reset filtros
  document.getElementById('filter-worker').innerHTML = '<option value="">Todas as pessoas</option>';
  document.getElementById('filter-project').innerHTML = '<option value="">Todos os projetos</option>';
}

// EXPORT - formato "Assignment Table (OUTPUT)"
document.getElementById('btn-export').onclick = async () => {
  const initials = await askInitials('excel');
  if (!initials) return;

  const rows = [['TEAM','WORKER','PROJECT','WP','TASK','MONTH','ASSIGNMENT','Horas disponiveis','horas reais planedas']];
  for (const r of state.records) {
    const ymsOrdered = Object.keys(r.monthsHours).sort();
    for (const ym of ymsOrdered) {
      const h = r.monthsHours[ym];
      const cap = getCapacity(r.worker, ym);
      const pct = cap > 0 ? h / cap : 0;
      const {y, m} = ymParse(ym);
      const monthDate = new Date(Date.UTC(y, m-1, 1));
      rows.push([
        r.team || 'Processos',
        r.worker,
        r.project,
        r.wp || '',
        r.task || '',
        monthDate,
        round2(pct),
        cap,
        round2(h),
      ]);
    }
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  // Aplicar formato de data à coluna F
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let R = 1; R <= range.e.r; R++) {
    const cell = ws[XLSX.utils.encode_cell({r:R, c:5})];
    if (cell && cell.v instanceof Date) {
      cell.t = 'd';
      cell.z = 'yyyy-mm-dd';
    }
  }
  ws['!cols'] = [{wch:12},{wch:22},{wch:30},{wch:8},{wch:40},{wch:12},{wch:11},{wch:14},{wch:18}];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Assignment Table (OUTPUT)');

  // Adicionar também o INPUT (matriz pessoa-projeto × mês em %)
  const yearsList = getAllYears();
  const allYMs = [];
  for (const y of yearsList) for (let m = 1; m <= 12; m++) allYMs.push(ymKey(y, m));
  const inputRows = [
    [null, 'TEAM','WORKER','PROJECT','WP','TASK', ...allYMs.map(ym => ymShort(ym)+'/'+String(ymParse(ym).y).slice(2))]
  ];
  // Grupo: por linha original
  for (const r of state.records) {
    const row = [null, r.team || 'Processos', r.worker, r.project, r.wp || '', r.task || ''];
    for (const ym of allYMs) {
      const h = r.monthsHours[ym];
      if (h) {
        const cap = getCapacity(r.worker, ym);
        row.push(cap > 0 ? round2(h / cap) : 0);
      } else {
        row.push(null);
      }
    }
    inputRows.push(row);
  }
  const ws2 = XLSX.utils.aoa_to_sheet(inputRows);
  XLSX.utils.book_append_sheet(wb, ws2, 'Worker Assignment (INPUT)');

  XLSX.writeFile(wb, `planeamento_processos_${fileTimestamp()}_${initials}.xlsx`);
  toast(`Excel exportado (${initials})`);
};


// ════════════════════════════════════════════════════════════════════════
// IMPORTAR MAPA DE FÉRIAS (SIGEI)
// ════════════════════════════════════════════════════════════════════════
let _mapaFeriasEntries = null; // [{name, m, nextYear, days}]

function _mfGetMonthNum(text) {
  const t = (text || '').toLowerCase().trim();
  if (t.startsWith('jan')) return 1;
  if (t.startsWith('fev')) return 2;
  if (t.startsWith('mar')) return 3;
  if (t.startsWith('abr')) return 4;
  if (t.startsWith('mai')) return 5;
  if (t.startsWith('jun')) return 6;
  if (t.startsWith('jul')) return 7;
  if (t.startsWith('ago')) return 8;
  if (t.startsWith('set')) return 9;
  if (t.startsWith('out')) return 10;
  if (t.startsWith('nov')) return 11;
  if (t.startsWith('dez')) return 12;
  return 0;
}

function _mfNormName(n) {
  return (n || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

function _mfMatchWorker(parsedName) {
  const norm = _mfNormName(parsedName);
  // 1. Exact normalized match
  let w = state.workers.find(x => _mfNormName(x) === norm);
  if (w) return w;
  // 2. Token-subset match: all tokens of the shorter name appear in the longer name
  //    Handles middle names (e.g. "João Miguel Machado" → "João Machado"):
  //    ["joao","machado"] ⊆ ["joao","miguel","machado"] → match
  const parsedTokens = norm.split(' ').filter(Boolean);
  w = state.workers.find(x => {
    const wn = _mfNormName(x);
    const wnTokens = wn.split(' ').filter(Boolean);
    const shorter = parsedTokens.length <= wnTokens.length ? parsedTokens : wnTokens;
    const longer  = parsedTokens.length <= wnTokens.length ? wnTokens  : parsedTokens;
    // Require at least 2 tokens and full containment
    return shorter.length >= 2 && shorter.every(t => longer.includes(t));
  });
  return w || null;
}

function _parseMapaFeriasHTML(htmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlText, 'text/html');

  // Identify data tables: first direct cell text === 'Nome'
  const allTables = [...doc.querySelectorAll('table')];
  const dataTables = allTables.filter(t => {
    const firstCell =
      t.querySelector(':scope > tbody > tr:first-child > td:first-child') ||
      t.querySelector(':scope > tr:first-child > td:first-child');
    return firstCell && firstCell.textContent.trim() === 'Nome';
  });

  if (dataTables.length === 0) return null;

  const entries = []; // {name, m, nextYear, days}

  dataTables.forEach((table, tableIdx) => {
    // Extract month sequence from first header row
    const headerRow =
      table.querySelector(':scope > tbody > tr:first-child') ||
      table.querySelector(':scope > tr:first-child');
    if (!headerRow) return;
    const headerCells = [...headerRow.querySelectorAll(':scope > td')];

    const monthSeq = []; // {m, nextYear}
    let lastM = 0;
    for (let i = 2; i < headerCells.length; i++) {
      const m = _mfGetMonthNum(headerCells[i].textContent);
      if (!m) continue;
      // Detect year wrap: Jan appearing after Jul-Dec in table 2
      const nextYear = tableIdx === 1 && m <= lastM;
      lastM = m;
      monthSeq.push({ m, nextYear });
    }

    // Get all direct tbody rows
    const allRows = [
      ...(table.querySelectorAll(':scope > tbody > tr').length
        ? table.querySelectorAll(':scope > tbody > tr')
        : table.querySelectorAll(':scope > tr'))
    ];

    // Process rows from index 2 (skip the two header rows)
    for (let ri = 2; ri < allRows.length; ri++) {
      const row = allRows[ri];
      const cells = [...row.querySelectorAll(':scope > td')];
      if (cells.length < 3) continue;

      // Person row detection: first cell has a <span> child with text
      const nameSpan = cells[0].querySelector('span');
      if (!nameSpan) continue;
      const name = nameSpan.textContent.trim();
      if (!name) continue;

      // Count vacation days per month (red cells: bgcolor=#FF7171)
      for (let mi = 0; mi < monthSeq.length; mi++) {
        const ci = mi + 2;
        if (ci >= cells.length) break;
        const vacCount = [...cells[ci].querySelectorAll('td')].filter(td => {
          const bg = (td.getAttribute('bgcolor') || '').toUpperCase();
          return bg === '#FF7171';
        }).length;

        if (vacCount > 0) {
          entries.push({ name, m: monthSeq[mi].m, nextYear: monthSeq[mi].nextYear, days: vacCount });
        }
      }
    }
  });

  return entries;
}

function _renderMapaFeriasPreview() {
  const entries = _mapaFeriasEntries;
  const previewEl = document.getElementById('mf-preview');
  const confirmBtn = document.getElementById('mf-confirm');
  if (!entries || !previewEl) return;

  const baseYear = parseInt(document.getElementById('mf-year').value) || new Date().getFullYear();
  const hoursPerDay = parseFloat(document.getElementById('mf-hours').value) || 7;

  if (entries.length === 0) {
    previewEl.innerHTML = '<p style="color:var(--warn); padding:12px 0">Nenhum dia de férias encontrado no ficheiro.</p>';
    if (confirmBtn) confirmBtn.disabled = true;
    return;
  }

  // Group by person (preserving order of first appearance)
  const order = [];
  const byPerson = {};
  for (const e of entries) {
    if (!byPerson[e.name]) { byPerson[e.name] = []; order.push(e.name); }
    byPerson[e.name].push(e);
  }

  let hasMatched = false;
  let html = `<table style="width:100%;border-collapse:collapse;font-size:12px">
    <thead><tr style="background:var(--neutral-bg);text-align:left">
      <th style="padding:5px 8px;border-bottom:1px solid var(--line)">Nome SIGEI</th>
      <th style="padding:5px 8px;border-bottom:1px solid var(--line)">Equipa</th>
      <th style="padding:5px 8px;border-bottom:1px solid var(--line);text-align:center">Mês</th>
      <th style="padding:5px 8px;border-bottom:1px solid var(--line);text-align:center">Dias</th>
      <th style="padding:5px 8px;border-bottom:1px solid var(--line);text-align:center">Horas</th>
    </tr></thead><tbody>`;

  for (const parsedName of order) {
    const monthEntries = byPerson[parsedName];
    const matched = _mfMatchWorker(parsedName);
    if (matched) hasMatched = true;

    const rowStyle = matched ? '' : 'opacity:0.55';
    const matchLabel = matched
      ? `<span style="color:var(--ok)">✅ ${matched}</span>`
      : '<span style="color:var(--danger)">❌ sem correspondência</span>';

    const sorted = monthEntries.slice().sort((a, b) => {
      const ya = baseYear + (a.nextYear ? 1 : 0), yb = baseYear + (b.nextYear ? 1 : 0);
      return ya !== yb ? ya - yb : a.m - b.m;
    });

    sorted.forEach((e, idx) => {
      const year = baseYear + (e.nextYear ? 1 : 0);
      const ym = ymKey(year, e.m);
      const hours = Math.round(e.days * hoursPerDay);
      html += `<tr style="border-bottom:1px solid var(--line-soft);${rowStyle}">
        <td style="padding:5px 8px;font-weight:${idx===0?500:400}">${idx === 0 ? parsedName : ''}</td>
        <td style="padding:5px 8px">${idx === 0 ? matchLabel : ''}</td>
        <td style="padding:5px 8px;text-align:center">${ymLabel(ym)}</td>
        <td style="padding:5px 8px;text-align:center">${e.days}</td>
        <td style="padding:5px 8px;text-align:center;font-weight:500">${hours}h</td>
      </tr>`;
    });
  }

  html += '</tbody></table>';

  if (!hasMatched) {
    html += '<p style="color:var(--danger);margin-top:10px;font-size:12px">⚠️ Nenhuma pessoa coincide com a equipa. Verifica os nomes em <strong>Equipa</strong>.</p>';
  } else {
    const total = entries.filter(e => _mfMatchWorker(e.name)).length;
    html += `<p style="color:var(--ink-faint);margin-top:8px;font-size:11px">${total} registo(s) de férias com correspondência · ${entries.length - total} sem correspondência</p>`;
  }

  previewEl.innerHTML = html;
  if (confirmBtn) confirmBtn.disabled = !hasMatched;
}

document.getElementById('btn-import-ferias').onclick = () => {
  document.getElementById('file-input-ferias').click();
};

document.getElementById('file-input-ferias').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';
  const reader = new FileReader();
  reader.onload = evt => {
    const entries = _parseMapaFeriasHTML(evt.target.result);
    if (!entries) {
      toast('Ficheiro inválido — tabelas de férias não encontradas', 'error');
      return;
    }
    _mapaFeriasEntries = entries;
    // Infer year from filename (e.g. "mapa_ferias 23-05-2026.html" → 2026)
    const m = file.name.match(/(\d{4})/);
    const guessYear = m ? parseInt(m[1]) : new Date().getFullYear();
    document.getElementById('mf-year').value = guessYear;
    document.getElementById('mf-hours').value = '7';
    _renderMapaFeriasPreview();
    document.getElementById('modal-mapa-ferias').classList.add('active');
  };
  // Read as windows-1252 (SIGEI HTML encoding) for correct Portuguese accented names
  reader.readAsText(file, 'windows-1252');
});

document.getElementById('mf-year').addEventListener('input', _renderMapaFeriasPreview);
document.getElementById('mf-hours').addEventListener('input', _renderMapaFeriasPreview);

document.getElementById('mf-cancel').onclick =
document.getElementById('modal-mapa-ferias-close').onclick = () => {
  document.getElementById('modal-mapa-ferias').classList.remove('active');
};

document.getElementById('mf-confirm').onclick = async () => {
  if (!guardEdit()) return;
  const entries = _mapaFeriasEntries;
  if (!entries || !entries.length) return;

  const baseYear = parseInt(document.getElementById('mf-year').value) || new Date().getFullYear();
  const hoursPerDay = parseFloat(document.getElementById('mf-hours').value) || 7;

  if (!state.absences) state.absences = {};
  if (!state.capacity) state.capacity = {};
  let applied = 0;

  for (const e of entries) {
    const worker = _mfMatchWorker(e.name);
    if (!worker) continue;
    const year = baseYear + (e.nextYear ? 1 : 0);
    const ym = ymKey(year, e.m);
    const absHours = Math.round(e.days * hoursPerDay);

    if (!state.absences[worker]) state.absences[worker] = {};
    if (!state.capacity[worker]) state.capacity[worker] = {};

    // Recuperar capacidade base: se já existia uma importação de férias anterior,
    // desfazer essa dedução para obter o valor original antes de recalcular.
    const prevVacHours = state.absences[worker][ym]?.reason === 'Férias'
      ? (state.absences[worker][ym].hours || 0) : 0;
    const storedCap = state.capacity[worker][ym];
    const capBase = storedCap !== undefined
      ? parseFloat(storedCap) + prevVacHours          // recuperar base original
      : state.defaultCapacity;                         // nunca editada → usar default

    // Guardar o valor líquido directamente na tabela de capacidade
    state.capacity[worker][ym] = Math.max(0, Math.round(capBase - absHours));
    // Manter registo de ausência como referência (usado em re-importações e na aba Ausências)
    state.absences[worker][ym] = { hours: absHours, reason: 'Férias' };
    applied++;
  }

  if (!applied) {
    toast('Nenhuma ausência registada — sem correspondências na equipa', 'error');
    return;
  }

  // Fechar o modal ANTES de guardar — se houver conflito, o modal de conflito
  // fica visível em vez de ficar escondido atrás deste modal
  document.getElementById('modal-mapa-ferias').classList.remove('active');

  const saveResult = await saveState();

  if (saveResult === 'conflict' || saveResult === 'error') {
    // saveState já mostrou o modal de conflito ou toast de erro —
    // não mostrar toast de sucesso enganador
    return;
  }

  // Sucesso: actualizar vistas
  // 1. Render equipa primeiro — reconstrói as opções do <select> de ano
  //    (getAllYears inclui agora os anos das ausências, então baseYear aparece na lista)
  renderEquipa();
  // 2. Agora que <option value="baseYear"> existe, definir o selector e
  //    disparar 'change' para que drawCap() seja chamado com o ano correcto
  const _capYSel = document.getElementById('cap-year');
  if (_capYSel && [..._capYSel.options].some(o => o.value === String(baseYear))) {
    _capYSel.value = String(baseYear);
    _capYSel.dispatchEvent(new Event('change'));  // acciona drawCap() via yearSel.onchange
  }
  renderView(currentView());
  toast(`${applied} ausência(s) de férias importada(s)`);
};


// ════════════════════════════════════════════════════════════════════════
// CLEAR
// ════════════════════════════════════════════════════════════════════════
document.getElementById('btn-clear').onclick = async () => {
  if (!guardEdit()) return;
  if (!confirm('Eliminar TODAS as alocações? (mantém pessoas, projetos e capacidades)')) return;
  autoBackup('Antes de Limpar Tudo');
  state.records = [];
  await saveState();
  toast('Alocações removidas');
  renderView(currentView());
};

// ════════════════════════════════════════════════════════════════════════

// IMPORTAR CSV DE ALOCAÇÕES
// ════════════════════════════════════════════════════════════════════════
let _csvParsed = null;

function _parseAllocCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
  if (lines.length < 2) throw new Error('Ficheiro vazio ou sem dados');
  const firstLine = lines[0];
  const sep = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length - 1 ? ';' : ',';
  const headers = firstLine.split(sep).map(h => h.trim().replace(/"/g,'').toLowerCase());
  const ci = k => headers.findIndex(h => h === k || h.includes(k));
  const iWorker = ci('worker'); const iProject = ci('project');
  const iWP = ci('wp'); const iTask = ci('task');
  const iMonth = ci('month'); const iAssign = ci('assignment');
  if ([iWorker, iProject, iMonth, iAssign].some(i => i < 0))
    throw new Error('Colunas obrigatórias em falta: worker, project, month, assignment');

  const groups = new Map();
  const projectsFound = new Set(), workersFound = new Set();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim(); if (!line) continue;
    const parts = line.split(sep).map(p => p.trim().replace(/^"|"$/g,''));
    const worker = parts[iWorker] || ''; const project = parts[iProject] || '';
    const wp = iWP >= 0 ? (parts[iWP] || '') : '';
    const task = iTask >= 0 ? (parts[iTask] || '') : '';
    const month = parts[iMonth] || ''; const assign = parseFloat(parts[iAssign]) || 0;
    if (!worker || !project || !month || !/^\d{4}-\d{2}$/.test(month)) continue;
    projectsFound.add(project); workersFound.add(worker);
    const key = `${worker}||${project}||${wp}||${task}`;
    if (!groups.has(key)) groups.set(key, { worker, project, wp, task, months: {} });
    groups.get(key).months[month] = round2((groups.get(key).months[month] || 0) + assign);
  }

  const warnings = [];
  const unmatchedWorkers  = new Set([...workersFound].filter(w => !state.workers.includes(w)));
  const unmatchedProjects = new Set([...projectsFound].filter(p => !state.projects.find(pr => pr.name === p)));
  if (unmatchedWorkers.size)  warnings.push('Pessoas não encontradas (serão adicionadas): ' + [...unmatchedWorkers].join(', '));
  if (unmatchedProjects.size) warnings.push('Projectos não encontrados (serão adicionados): ' + [...unmatchedProjects].join(', '));
  return { groups: [...groups.values()], warnings, projects: projectsFound, workers: workersFound, unmatchedWorkers, unmatchedProjects };
}

function _csvGroupToRecord(g) {
  const yms = Object.keys(g.months).sort();
  const monthsHours = {}; let totalH = 0;
  for (const ym of yms) {
    const h = round2(g.months[ym] * getCapacity(g.worker, ym));
    monthsHours[ym] = h; totalH += h;
  }
  return { id: uuid(), team: 'Processos', worker: g.worker, project: g.project,
    wp: g.wp, task: g.task, start: yms[0], end: yms[yms.length-1],
    totalHours: round2(totalH), monthsHours, updatedAt: new Date().toISOString() };
}

function _renderCSVPreview(parsed) {
  const { groups, warnings, projects, workers } = parsed;
  document.getElementById('csv-preview').style.display = 'block';
  const allYMs = groups.flatMap(g => Object.keys(g.months)).sort();
  const range = allYMs.length ? `${ymLabel(allYMs[0])} → ${ymLabel(allYMs[allYMs.length-1])}` : '—';
  document.getElementById('csv-preview-stats').innerHTML =
    `<div style="background:var(--row-alt);border-radius:8px;padding:12px 16px;margin-bottom:12px;font-size:13px">
      <strong>${groups.length}</strong> registos agrupados &nbsp;·&nbsp;
      Projecto${projects.size>1?'s':''}: <strong>${[...projects].join(', ')}</strong><br>
      Período: <strong>${range}</strong><br>
      Pessoas: ${[...workers].join(', ')}
    </div>`;
  document.getElementById('csv-warnings').innerHTML = warnings.map(w =>
    `<div class="warn-note" style="margin-bottom:8px">⚠️ ${w}</div>`).join('');
  const rows = groups.map(g => {
    const yms = Object.keys(g.months).sort();
    const pmTot = round2(Object.values(g.months).reduce((s,v)=>s+v,0));
    const taskShort = g.task.length > 40 ? g.task.slice(0,39)+'…' : g.task;
    return `<tr>
      <td style="font-size:12px;white-space:nowrap">${g.worker}</td>
      <td style="font-size:11px">${g.wp||'—'}</td>
      <td style="font-size:11px;max-width:200px" title="${g.task}">${taskShort||'—'}</td>
      <td style="font-size:11px;white-space:nowrap">${ymLabel(yms[0])} → ${ymLabel(yms[yms.length-1])}</td>
      <td style="font-size:12px;text-align:right;font-weight:600">${pmTot} PM</td>
    </tr>`;
  }).join('');
  document.getElementById('csv-preview-table').innerHTML =
    `<div style="overflow-x:auto;max-height:220px;overflow-y:auto;border:1px solid var(--line-soft);border-radius:6px;margin-bottom:14px">
      <table><thead><tr><th>Pessoa</th><th>WP</th><th>Tarefa</th><th>Período</th><th>PM</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
}

document.getElementById('btn-import-csv').onclick = () => {
  document.getElementById('data-menu-panel').classList.remove('show');
  _csvParsed = null;
  document.getElementById('csv-file-name').textContent = 'Nenhum ficheiro seleccionado';
  document.getElementById('csv-preview').style.display = 'none';
  document.getElementById('csv-confirm').disabled = true;
  document.getElementById('csv-file-input').value = '';
  document.getElementById('modal-import-csv').classList.add('active');
};

document.getElementById('csv-file-input').onchange = (e) => {
  const file = e.target.files[0]; if (!file) return;
  document.getElementById('csv-file-name').textContent = file.name;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      _csvParsed = _parseAllocCSV(ev.target.result);
      _renderCSVPreview(_csvParsed);
      document.getElementById('csv-confirm').disabled = _csvParsed.groups.length === 0;
    } catch (err) {
      document.getElementById('csv-preview').style.display = 'block';
      document.getElementById('csv-preview-stats').innerHTML = `<div class="warn-note">❌ ${err.message}</div>`;
      document.getElementById('csv-warnings').innerHTML = '';
      document.getElementById('csv-preview-table').innerHTML = '';
      document.getElementById('csv-confirm').disabled = true;
    }
  };
  reader.readAsText(file, 'utf-8');
  e.target.value = '';
};

document.getElementById('csv-cancel').onclick =
document.getElementById('modal-import-csv-close').onclick = () =>
  document.getElementById('modal-import-csv').classList.remove('active');

document.getElementById('csv-confirm').onclick = async () => {
  if (!guardEdit()) return;
  if (!_csvParsed || !_csvParsed.groups.length) return;
  const mode = document.querySelector('input[name="csv-mode"]:checked')?.value || 'add';
  const { groups, unmatchedWorkers, unmatchedProjects } = _csvParsed;

  // Auto-add missing workers and projects
  for (const w of unmatchedWorkers) state.workers.push(w);
  for (const p of unmatchedProjects) state.projects.push({ name: p, active: true });

  if (mode === 'replace') {
    const projectsToReplace = new Set(groups.map(g => g.project));
    state.records = state.records.filter(r => !projectsToReplace.has(r.project));
  }

  const newRecords = groups.map(_csvGroupToRecord);
  state.records.push(...newRecords);

  for (const rec of newRecords) {
    await logChange('create', 'record', rec.id, `${rec.worker} / ${rec.project}`,
      `${round2(rec.totalHours)}h · ${rec.start} → ${rec.end} [CSV]`);
  }

  document.getElementById('modal-import-csv').classList.remove('active');
  if (unmatchedWorkers.size || unmatchedProjects.size) renderEquipa();
  renderView(currentView());
  toast(`${newRecords.length} alocações importadas`);

  const saveResult = await saveState();
  if (saveResult === 'ok') toast(`${newRecords.length} alocações guardadas no servidor`);
};


// ════════════════════════════════════════════════════════════════════════
// RECUPERAR BACKUP AUTOMATICO
// ════════════════════════════════════════════════════════════════════════
window.recoverAutoBackup = async () => {
  if (!guardEdit()) return;
  const bk = getAutoBackup();
  if (!bk) { toast('Sem backup automatico disponivel', 'error'); return; }
  const ts = new Date(bk.ts).toLocaleString('pt-PT');
  const msg = `Recuperar backup automatico?\n${bk.label} -- ${ts}\n\n${bk.records.length} alocacoes · ${bk.workers.length} pessoas`;
  if (!confirm(msg)) return;
  autoBackup('Antes de Recuperar Backup');
  state.workers  = bk.workers;
  state.projects = bk.projects;
  state.records  = bk.records;
  state.capacity = bk.capacity;
  if (bk.absences) state.absences = bk.absences;
  await saveState();
  resetUIFilters();
  renderView(currentView());
  toast('Backup automatico recuperado');
};
