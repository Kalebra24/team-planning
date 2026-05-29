// ════════════════════════════════════════════════════════════════════════
// VIEWS / NAV
// ════════════════════════════════════════════════════════════════════════
document.getElementById('tabs').addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const view = btn.dataset.view;
  document.getElementById('view-' + view).classList.add('active');
  renderView(view);
});

function renderView(name) {
  switch (name) {
    case 'dashboard': renderDashboard(); break;
    case 'alocacoes': renderRecords(); break;
    case 'heatmap': renderHeatmap(); break;
    case 'gantt': renderGantt(); break;
    case 'projetos': renderProjects(); break;
    case 'equipa': renderEquipa(); break;
    case 'arquivo': renderArquivo(); break;
  }
}


// ════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════════════════════
function renderDashboard() {
  const now = new Date();
  const curYM = ymKey(now.getFullYear(), now.getMonth() + 1);
  let nYear = now.getFullYear(), nMonth = now.getMonth() + 2;
  if (nMonth > 12) { nMonth = 1; nYear++; }
  const nextYM = ymKey(nYear, nMonth);

  // Build utilByMonth: worker -> ym -> hours
  const utilByMonth = {};
  for (const r of state.records) {
    for (const [ym, h] of Object.entries(r.monthsHours)) {
      if (!utilByMonth[r.worker]) utilByMonth[r.worker] = {};
      utilByMonth[r.worker][ym] = (utilByMonth[r.worker][ym] || 0) + h;
    }
  }

  // Overallocations >110%
  let overCount = 0;
  const overDetails = [];
  for (const [w, months] of Object.entries(utilByMonth)) {
    for (const [ym, hours] of Object.entries(months)) {
      const cap = getCapacity(w, ym);
      const pct = cap > 0 ? hours / cap : 0;
      if (pct > 1.10) { overCount++; overDetails.push({w, ym, pct, hours, cap}); }
    }
  }

  // Stat 1: avg utilization current month
  let totalUtil = 0, utilCount = 0;
  for (const w of state.workers) {
    const cap = getCapacity(w, curYM);
    const h = utilByMonth[w]?.[curYM] || 0;
    if (cap > 0) { totalUtil += h / cap; utilCount++; }
  }
  const avgUtil = utilCount > 0 ? Math.round(totalUtil / utilCount * 100) : 0;
  const utilCls = avgUtil > 105 ? 'danger' : avgUtil > 90 ? 'warn' : avgUtil > 30 ? 'ok' : '';

  // Stat 2: gap risk — people with <20% in any of next 3 months
  const next3 = [];
  for (let i = 1; i <= 3; i++) {
    let mm = now.getMonth() + 1 + i, yy = now.getFullYear();
    if (mm > 12) { mm -= 12; yy++; }
    next3.push(ymKey(yy, mm));
  }
  const gapWorkers = state.workers.filter(w =>
    next3.some(ym => {
      const cap = getCapacity(w, ym);
      const h = utilByMonth[w]?.[ym] || 0;
      return cap > 0 && (h / cap) < 0.20;
    })
  );

  // Stat 3: projects with allocations
  const totalProjects = new Set(state.records.map(r => r.project)).size;

  document.getElementById('stats').innerHTML = `
    <div class="stat">
      <div class="stat-label">Utilização média — ${ymLabel(curYM)}</div>
      <div class="stat-value ${utilCls}">${avgUtil}%</div>
      <div class="stat-sub">${utilCount} pessoa(s) com capacidade definida</div>
    </div>
    <div class="stat">
      <div class="stat-label">Em risco de lacuna (próx. 3 meses)</div>
      <div class="stat-value ${gapWorkers.length > 0 ? 'warn' : 'ok'}">${gapWorkers.length}</div>
      <div class="stat-sub">${gapWorkers.length > 0 ? gapWorkers.slice(0,2).join(', ') + (gapWorkers.length > 2 ? ` +${gapWorkers.length-2}` : '') : 'equipa coberta'}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Projetos com alocação</div>
      <div class="stat-value">${totalProjects}</div>
      <div class="stat-sub">de ${state.projects.length} no catálogo</div>
    </div>
    <div class="stat">
      <div class="stat-label">Sobrealocações &gt;110%</div>
      <div class="stat-value ${overCount > 0 ? 'danger' : 'ok'}">${overCount}</div>
      <div class="stat-sub">meses · ${new Set(overDetails.map(d => d.w)).size} pessoa(s)</div>
    </div>
  `;

  // Alertas
  if (overDetails.length > 0) {
    const grouped = {};
    for (const d of overDetails) { if (!grouped[d.w]) grouped[d.w] = []; grouped[d.w].push(d); }
    const items = Object.entries(grouped).slice(0, 5).map(([w, arr]) => {
      const top = arr.sort((a,b) => b.pct - a.pct)[0];
      return `<strong>${w}</strong>: ${arr.length} mês(es) em sobrealocação · pico ${Math.round(top.pct*100)}% em ${ymLabel(top.ym)}`;
    });
    document.getElementById('alerts-container').innerHTML = `
      <div class="alerts">
        <div class="alerts-title">⚠ Sobrealocações detetadas</div>
        <div class="alerts-list">${items.join('<br>')}${Object.keys(grouped).length > 5 ? '<br><em>… e mais ' + (Object.keys(grouped).length - 5) + ' pessoa(s)</em>' : ''}</div>
      </div>`;
  } else {
    document.getElementById('alerts-container').innerHTML = '';
  }

  // Next-month panel
  renderNextMonthPanel(nextYM, utilByMonth);

  // Bar chart
  const yearSel = document.getElementById('bar-year');
  const monthSel = document.getElementById('bar-month');
  const years = getAllYears();
  const curYear = parseInt(yearSel.value) || now.getFullYear();
  const targetYear = years.includes(curYear) ? curYear
    : (years.includes(now.getFullYear()) ? now.getFullYear()
    : (years.find(y => y >= now.getFullYear()) || years[years.length - 1] || years[0]));
  yearSel.innerHTML = years.map(y => `<option value="${y}" ${y===targetYear?'selected':''}>${y}</option>`).join('');

  // Default bar-month to current month on first render
  if (!monthSel._initialized) {
    monthSel.value = now.getMonth() + 1;
    monthSel._initialized = true;
  }

  const doBarChart = () => renderBarChart(parseInt(yearSel.value), parseInt(monthSel.value));
  yearSel.onchange = doBarChart;
  monthSel.onchange = doBarChart;
  doBarChart();
}

function renderNextMonthPanel(ym, utilByMonth) {
  const panel = document.getElementById('next-month-panel');
  if (!panel) return;

  const cells = state.workers.map(w => {
    const cap = getCapacity(w, ym);
    const h = utilByMonth[w]?.[ym] || 0;
    const pct = cap > 0 ? h / cap : 0;
    const cls = cap === 0 ? 'empty' : pct > 1.05 ? 'danger' : pct > 0.90 ? 'warn' : pct > 0.05 ? 'ok' : 'empty';
    const pctLabel = cap === 0 ? '—' : `${Math.round(pct * 100)}%`;
    const hoursLabel = cap === 0 ? 'sem cap.' : `${Math.round(h)}h / ${Math.round(cap)}h`;
    return `
      <div class="nm-cell ${cls}">
        <div class="nm-name">${w}</div>
        <div class="nm-pct ${cls}">${pctLabel}</div>
        <div class="nm-hours">${hoursLabel}</div>
      </div>`;
  }).join('');

  panel.innerHTML = `
    <div class="nm-card">
      <div class="nm-head">
        <div>
          <span class="card-title" style="font-size:16px">Próximo mês — ${ymLabel(ym)}</span>
          <span class="card-sub" style="margin-left:10px">carga planeada por pessoa</span>
        </div>
        <div style="display:flex; gap:10px; font-size:11px; color:var(--ink-faint)">
          <span style="color:var(--ok)">■</span> normal
          <span style="color:var(--warn)">■</span> &gt;90%
          <span style="color:var(--danger)">■</span> &gt;105%
        </div>
      </div>
      <div class="nm-grid">${cells}</div>
    </div>`;
}

function renderBarChart(year, month = 0) {
  const MONTHS_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const label = month === 0 ? `${year} — média anual` : `${MONTHS_FULL[month-1]} ${year}`;
  document.getElementById('bar-period').textContent = label;

  const yms = month === 0
    ? Array.from({length: 12}, (_, i) => ymKey(year, i + 1))
    : [ymKey(year, month)];

  const rows = state.workers.map(w => {
    let totalH = 0, totalC = 0;
    for (const ym of yms) {
      totalC += getCapacity(w, ym);
      for (const r of state.records) {
        if (r.worker === w && r.monthsHours[ym]) totalH += r.monthsHours[ym];
      }
    }
    return {worker: w, alloc: totalH, cap: totalC, pct: totalC > 0 ? totalH / totalC : 0};
  }).sort((a,b) => b.pct - a.pct);

  const container = document.getElementById('bar-chart');
  if (rows.every(r => r.alloc === 0)) {
    container.innerHTML = '<div class="empty-state"><div class="display">Sem alocações neste período</div></div>';
    return;
  }
  container.innerHTML = rows.map(r => {
    const width = Math.min(r.pct * 100, 130);
    const cls = r.pct > 1.05 ? 'danger' : r.pct > 0.90 ? 'warn' : '';
    return `
      <div class="bar-row">
        <div class="bar-name">${r.worker}</div>
        <div class="bar-track"><div class="bar-fill ${cls}" style="width:${width}%"></div></div>
        <div class="bar-val">${Math.round(r.pct*100)}%</div>
      </div>`;
  }).join('');
}


// ════════════════════════════════════════════════════════════════════════
// RECORDS TABLE
// ════════════════════════════════════════════════════════════════════════
function renderRecords() {
  const search = document.getElementById('search').value.toLowerCase();
  const fw = document.getElementById('filter-worker').value;
  const fp = document.getElementById('filter-project').value;

  // Popular filtros (uma vez)
  const fwSel = document.getElementById('filter-worker');
  if (fwSel.options.length <= 1) {
    state.workers.forEach(w => fwSel.add(new Option(w, w)));
  }
  const fpSel = document.getElementById('filter-project');
  if (fpSel.options.length <= 1) {
    const projs = [...new Set(state.records.map(r => r.project))].sort();
    projs.forEach(p => fpSel.add(new Option(p, p)));
  }

  let rows = state.records;
  if (fw) rows = rows.filter(r => r.worker === fw);
  if (fp) rows = rows.filter(r => r.project === fp);
  if (search) {
    rows = rows.filter(r =>
      (r.worker||'').toLowerCase().includes(search) ||
      (r.project||'').toLowerCase().includes(search) ||
      (r.task||'').toLowerCase().includes(search) ||
      (r.wp||'').toString().toLowerCase().includes(search)
    );
  }

  rows = rows.sort((a,b) => (a.worker+a.project+a.start).localeCompare(b.worker+b.project+b.start));

  document.getElementById('rec-count').textContent = rows.length;
  const tbody = document.querySelector('#table-records tbody');
  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="display">Sem registos</div><div>Clica em + Nova Alocação para começar</div></div></td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td><strong>${r.worker}</strong></td>
      <td>${r.project}</td>
      <td>${r.wp || '—'}</td>
      <td style="max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap" title="${r.task||''}">${r.task || '—'}</td>
      <td class="mono">${ymLabel(r.start)}</td>
      <td class="mono">${ymLabel(r.end)}</td>
      <td class="num">${round2(r.totalHours)}</td>
      <td class="actions">
        <button class="btn btn-sm" onclick="editRecord('${r.id}')">Editar</button>
        <button class="btn btn-sm" onclick="duplicateRecord('${r.id}')" title="Duplicar esta alocação">⧉</button>
      </td>
    </tr>
  `).join('');
}

document.getElementById('search').addEventListener('input', renderRecords);
document.getElementById('filter-worker').addEventListener('change', renderRecords);
document.getElementById('filter-project').addEventListener('change', renderRecords);


// ════════════════════════════════════════════════════════════════════════
// HEATMAP
// ════════════════════════════════════════════════════════════════════════
const heatmapRange = { from: null, to: null };

function renderHeatmap() {
  const fromInput = document.getElementById('heatmap-from');
  const toInput = document.getElementById('heatmap-to');
  const quickSel = document.getElementById('heatmap-quick');

  // Inicializar com mesmo default da timeline
  if (!heatmapRange.from || !heatmapRange.to) {
    const def = defaultGanttRange();
    heatmapRange.from = def.from;
    heatmapRange.to = def.to;
  }
  fromInput.value = heatmapRange.from;
  toInput.value = heatmapRange.to;

  const drawHm = () => {
    let from = heatmapRange.from, to = heatmapRange.to;
    if (from > to) { to = from; heatmapRange.to = to; toInput.value = to; }
    const ymsRange = ymList(from, to);
    const nCols = ymsRange.length;

    // Info do range
    document.getElementById('heatmap-range-info').textContent =
      nCols === 1 ? ymLabel(from) : `${ymLabel(from)} → ${ymLabel(to)} · ${nCols} meses`;

    // Utilização
    const util = {};
    for (const w of state.workers) {
      util[w] = {};
      for (const ym of ymsRange) {
        let h = 0;
        for (const r of state.records) {
          if (r.worker === w && r.monthsHours[ym]) h += r.monthsHours[ym];
        }
        const cap = getCapacity(w, ym);
        util[w][ym] = {h, cap, pct: cap > 0 ? h / cap : 0};
      }
    }

    function levelFor(pct) {
      if (pct === 0) return 'empty';
      if (pct <= 0.25) return 'lvl-0';
      if (pct <= 0.75) return 'lvl-1';
      if (pct <= 0.95) return 'lvl-2';
      if (pct <= 1.10) return 'lvl-3';
      if (pct <= 1.30) return 'lvl-4';
      return 'lvl-5';
    }

    // Agrupar por ano para o cabeçalho superior
    const yearGroups = [];  // [{year, count}]
    for (const ym of ymsRange) {
      const y = ymParse(ym).y;
      const last = yearGroups[yearGroups.length - 1];
      if (last && last.year === y) last.count++;
      else yearGroups.push({ year: y, count: 1 });
    }

    const yearHeader = yearGroups.map(g =>
      `<th class="year-h" colspan="${g.count}">${g.year}</th>`
    ).join('');

    const monthHeader = ymsRange.map(ym => {
      const {m} = ymParse(ym);
      return `<th class="month-h">${MONTHS_PT[m-1]}</th>`;
    }).join('');

    let html = `<table class="heatmap">
      <thead>
        <tr><th></th>${yearHeader}</tr>
        <tr><th class="worker-h"></th>${monthHeader}</tr>
      </thead>
      <tbody>`;
    for (const w of state.workers) {
      html += `<tr><th class="worker-h">${w}</th>`;
      for (const ym of ymsRange) {
        const u = util[w][ym];
        const lvl = levelFor(u.pct);
        const pctTxt = u.pct === 0 ? '—' : Math.round(u.pct*100)+'%';
        html += `<td class="cell ${lvl}" title="${w} · ${ymLabel(ym)}\n${round2(u.h)}h / ${u.cap}h (${Math.round(u.pct*100)}%)">${pctTxt}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    document.getElementById('heatmap-wrap').innerHTML = html;
  };
  drawHm();

  fromInput.onchange = () => {
    if (!fromInput.value) return;
    heatmapRange.from = fromInput.value;
    if (heatmapRange.from > heatmapRange.to) {
      heatmapRange.to = heatmapRange.from;
      toInput.value = heatmapRange.to;
    }
    drawHm();
  };
  toInput.onchange = () => {
    if (!toInput.value) return;
    heatmapRange.to = toInput.value;
    if (heatmapRange.to < heatmapRange.from) {
      heatmapRange.from = heatmapRange.to;
      fromInput.value = heatmapRange.from;
    }
    drawHm();
  };
  quickSel.onchange = () => {
    const v = quickSel.value;
    if (!v) return;
    const now = new Date();
    const thisYM = ymKey(now.getFullYear(), now.getMonth() + 1);
    if (v === 'next-12') {
      heatmapRange.from = thisYM;
      heatmapRange.to = ymAddMonths(thisYM, 11);
    } else if (v === 'next-6') {
      heatmapRange.from = thisYM;
      heatmapRange.to = ymAddMonths(thisYM, 5);
    } else if (v === 'ytd') {
      heatmapRange.from = ymKey(now.getFullYear(), 1);
      heatmapRange.to = ymKey(now.getFullYear(), 12);
    }
    fromInput.value = heatmapRange.from;
    toInput.value = heatmapRange.to;
    quickSel.value = '';
    drawHm();
  };
}

// ════════════════════════════════════════════════════════════════════════
// PROJETOS (donut + matriz)
// ════════════════════════════════════════════════════════════════════════
function renderProjects() {
  const yearSel = document.getElementById('proj-year');
  const years = getAllYears();
  if (!yearSel.options.length || yearSel.options.length !== years.length) {
    const cur = yearSel.value;
    yearSel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
    if (cur && years.includes(parseInt(cur))) yearSel.value = cur;
    else {
      const now = new Date().getFullYear();
      yearSel.value = years.includes(now) ? now : (years.find(y => y >= now) || years[years.length - 1] || now);
    }
  }

  const draw = () => {
    const year = parseInt(yearSel.value);
    document.getElementById('proj-period').textContent = year;

    // Total horas por projeto
    const byProj = {};
    for (const r of state.records) {
      for (const [ym, h] of Object.entries(r.monthsHours)) {
        if (ymParse(ym).y !== year) continue;
        byProj[r.project] = (byProj[r.project] || 0) + h;
      }
    }
    const entries = Object.entries(byProj).filter(([_,v]) => v > 0).sort((a,b) => b[1] - a[1]);
    const total = entries.reduce((s, [_,v]) => s + v, 0);

    const PALETTE = ['#c4541d', '#4a6741', '#b8860b', '#6b7c8e', '#8e6b3a', '#a64b76', '#7a5f4a', '#5d8c7e', '#9c6b2f', '#445f7a', '#6f4a5e', '#7a7e3c', '#9e8045', '#6e4d5b', '#4a6e6b'];

    // Donut
    const svg = document.getElementById('donut');
    svg.innerHTML = '';
    const cx = 140, cy = 140, r = 110, rIn = 65;
    let angle = -Math.PI / 2;
    entries.forEach(([p, v], i) => {
      const frac = v / total;
      const a1 = angle, a2 = angle + frac * Math.PI * 2;
      const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
      const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
      const x3 = cx + rIn * Math.cos(a2), y3 = cy + rIn * Math.sin(a2);
      const x4 = cx + rIn * Math.cos(a1), y4 = cy + rIn * Math.sin(a1);
      const large = frac > 0.5 ? 1 : 0;
      const d = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${rIn} ${rIn} 0 ${large} 0 ${x4} ${y4} Z`;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('fill', PALETTE[i % PALETTE.length]);
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = `${p}: ${round2(v)}h (${(frac*100).toFixed(1)}%)`;
      path.appendChild(title);
      svg.appendChild(path);
      angle = a2;
    });
    // Centro
    const centerLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    centerLabel.setAttribute('x', cx);
    centerLabel.setAttribute('y', cy - 5);
    centerLabel.setAttribute('text-anchor', 'middle');
    centerLabel.setAttribute('font-family', 'Fraunces, serif');
    centerLabel.setAttribute('font-size', '28');
    centerLabel.setAttribute('font-weight', '500');
    centerLabel.textContent = Math.round(total).toLocaleString();
    svg.appendChild(centerLabel);
    const subLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    subLabel.setAttribute('x', cx);
    subLabel.setAttribute('y', cy + 18);
    subLabel.setAttribute('text-anchor', 'middle');
    subLabel.setAttribute('font-family', 'Inter Tight, sans-serif');
    subLabel.setAttribute('font-size', '11');
    subLabel.setAttribute('fill', '#908a7d');
    subLabel.setAttribute('letter-spacing', '0.1em');
    subLabel.textContent = 'HORAS · ' + year;
    svg.appendChild(subLabel);

    // Legenda
    document.getElementById('donut-legend').innerHTML = entries.map(([p,v], i) => `
      <div class="legend-item">
        <div class="legend-swatch" style="background:${PALETTE[i % PALETTE.length]}"></div>
        <div>${p}</div>
        <div class="legend-val">${round2(v)}h</div>
      </div>
    `).join('') || '<div class="empty-state">Sem dados</div>';

    // Matriz pessoa × projeto
    const matrix = {};
    const projSet = new Set();
    for (const r of state.records) {
      for (const [ym, h] of Object.entries(r.monthsHours)) {
        if (ymParse(ym).y !== year) continue;
        if (!matrix[r.worker]) matrix[r.worker] = {};
        matrix[r.worker][r.project] = (matrix[r.worker][r.project] || 0) + h;
        projSet.add(r.project);
      }
    }
    const projs = [...projSet].sort();
    let html = '<table class="data"><thead><tr><th>Pessoa</th>';
    projs.forEach(p => html += `<th style="text-align:right; font-size:10px">${p}</th>`);
    html += '<th class="num" style="border-left:1px solid var(--line)">Total</th></tr></thead><tbody>';
    for (const w of state.workers) {
      if (!matrix[w]) continue;
      let total = 0;
      html += `<tr><td><strong>${w}</strong></td>`;
      projs.forEach(p => {
        const v = matrix[w][p] || 0;
        total += v;
        html += `<td class="num">${v > 0 ? round2(v) : '—'}</td>`;
      });
      html += `<td class="num" style="border-left:1px solid var(--line); font-weight:600">${round2(total)}</td></tr>`;
    }
    html += '</tbody></table>';
    document.getElementById('matrix-wrap').innerHTML = html;
  };
  draw();
  yearSel.onchange = draw;
  renderProjectsCatalog();
}

function renderProjectsCatalog() {
  const list = document.getElementById('projects-list');
  if (!list) return;
  const sorted = [...state.projects].sort((a, b) => a.name.localeCompare(b.name));
  document.getElementById('proj-count').textContent = sorted.length;

  const usedProjects = new Set(state.records.map(r => r.project));

  list.innerHTML = sorted.map(p => {
    const active = p.active !== false;
    const used = usedProjects.has(p.name);
    return `
      <div class="person-card">
        <div style="flex:1; min-width:0">
          <div class="name" style="cursor:pointer; display:flex; align-items:center; gap:8px" onclick="toggleProject('${p.name.replace(/'/g, "\\'")}')">
            ${p.name}
            <span class="badge ${active ? 'ok' : ''}" style="${active ? '' : 'color:var(--ink-faint)'}">
              ${active ? 'ativo' : 'inativo'}
            </span>
          </div>
          ${used ? `<div class="stats-mini">${state.records.filter(r=>r.project===p.name).length} alocação(ões)</div>` : '<div class="stats-mini" style="color:var(--ink-faint)">sem alocações</div>'}
        </div>
        <button class="x" onclick="deleteProject('${p.name.replace(/'/g, "\\'")}')" title="Remover projeto">×</button>
      </div>
    `;
  }).join('') || '<p style="color:var(--ink-faint); font-size:13px; padding:8px 0">Sem projetos no catálogo.</p>';
}

window.toggleProject = async (name) => {
  if (!guardEdit()) return;
  const p = state.projects.find(x => x.name === name);
  if (!p) return;
  p.active = p.active === false ? true : false;
  await saveState();
  renderProjectsCatalog();
};

window.deleteProject = async (name) => {
  if (!guardEdit()) return;
  const inUse = state.records.some(r => r.project === name);
  if (inUse) {
    if (!confirm(`O projeto "${name}" tem alocações. Eliminar mesmo assim? As alocações não serão apagadas mas ficarão sem projeto no catálogo.`)) return;
  } else {
    if (!confirm(`Eliminar o projeto "${name}"?`)) return;
  }
  state.projects = state.projects.filter(p => p.name !== name);
  await saveState();
  renderProjectsCatalog();
  toast(`Projeto "${name}" removido`);
};

document.getElementById('btn-add-project').onclick = async () => {
  if (!guardEdit()) return;
  const inp = document.getElementById('new-project-name');
  const name = inp.value.trim();
  if (!name) return;
  if (state.projects.find(p => p.name === name)) {
    toast('Projeto já existe no catálogo', 'error');
    return;
  }
  state.projects.push({ name, active: true });
  state.projects.sort((a, b) => a.name.localeCompare(b.name));
  await saveState();
  inp.value = '';
  renderProjectsCatalog();
  toast(`Projeto "${name}" adicionado`);
};

document.getElementById('new-project-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); document.getElementById('btn-add-project').click(); }
});

// ════════════════════════════════════════════════════════════════════════
// EQUIPA (gestão de pessoas)
// ════════════════════════════════════════════════════════════════════════
function renderEquipa() {
  // Contar alocações por pessoa
  const counts = {};
  const totalH = {};
  for (const r of state.records) {
    counts[r.worker] = (counts[r.worker] || 0) + 1;
    totalH[r.worker] = (totalH[r.worker] || 0) + r.totalHours;
  }
  document.getElementById('people-count').textContent = state.workers.length;
  document.getElementById('people-list').innerHTML = state.workers.map(w => `
    <div class="person-card">
      <div>
        <div class="name">${w}</div>
        <div class="stats-mini">${counts[w] || 0} alocações · ${round2(totalH[w] || 0)}h totais</div>
      </div>
      <button class="x" title="Remover" onclick="removePerson('${w.replace(/'/g, "\\'")}')">×</button>
    </div>
  `).join('') || '<div class="empty-state"><div class="display">Sem pessoas</div></div>';

  // Capacity year
  const yearSel = document.getElementById('cap-year');
  const years = getAllYears();
  if (!yearSel.options.length || yearSel.options.length !== years.length) {
    const cur = yearSel.value;
    yearSel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
    if (cur && years.includes(parseInt(cur))) yearSel.value = cur;
    else {
      const now = new Date().getFullYear();
      yearSel.value = years.includes(now) ? now : (years.find(y => y >= now) || years[years.length - 1] || now);
    }
  }
  const drawCap = () => {
    const year = parseInt(yearSel.value);
    let html = '<table class="data"><thead><tr><th>Pessoa</th>';
    MONTHS_PT.forEach(m => html += `<th style="text-align:right; min-width:68px">${m}</th>`);
    html += '<th class="num" style="border-left:1px solid var(--line)">Total disp.</th></tr></thead><tbody>';
    for (const w of state.workers) {
      let totalEff = 0;
      html += `<tr><td><strong>${w}</strong></td>`;
      for (let m = 1; m <= 12; m++) {
        const ym = ymKey(year, m);
        const rawV   = state.capacity[w]?.[ym] ?? '';  // valor armazenado (já líquido se importado do mapa de férias)
        const base   = rawV === '' ? state.defaultCapacity : parseFloat(rawV);
        const absence = state.absences?.[w]?.[ym];

        // Ausências de Férias já estão incorporadas no valor de capacidade (deduzidas no import).
        // Só deduzir ausências manuais (reason !== 'Férias') para não duplicar a dedução.
        const deducaoManual = absence && absence.hours > 0 && absence.reason !== 'Férias'
          ? absence.hours : 0;
        const effV = Math.max(0, base - deducaoManual);
        totalEff += effV;

        const safeW = w.replace(/"/g,'&quot;');
        const isVac = absence?.reason === 'Férias' && absence.hours > 0;

        if (isVac) {
          // Férias já deduzidas: mostrar fundo âmbar subtil com tooltip, mas o valor no input é o líquido
          const tip = `Capacidade líquida após férias (−${absence.hours}h). Editável se necessário.`;
          html += `<td class="num" style="padding:2px; background:var(--warn-bg)" title="${tip}">
            <input type="number" min="0" step="0.5" value="${rawV}" placeholder="${state.defaultCapacity}"
              data-worker="${safeW}" data-ym="${ym}" class="cap-input"
              style="width:58px; padding:4px 5px; text-align:right; font-family:'JetBrains Mono',monospace; font-size:11px; background:transparent">
            <div style="font-size:9px; color:var(--warn); text-align:right; line-height:1; padding-bottom:2px">🏖 −${absence.hours}h</div>
          </td>`;
        } else if (deducaoManual > 0) {
          // Ausência manual: mostrar dedução
          const motivo = absence.reason ? ` (${absence.reason})` : '';
          const tip = `Base: ${base}h − Ausência: ${deducaoManual}h${motivo} = ${effV}h disponíveis`;
          html += `<td class="num" style="padding:2px; background:var(--warn-bg)" title="${tip}">
            <input type="number" min="0" step="0.5" value="${rawV}" placeholder="${state.defaultCapacity}"
              data-worker="${safeW}" data-ym="${ym}" class="cap-input"
              style="width:58px; padding:4px 5px; text-align:right; font-family:'JetBrains Mono',monospace; font-size:11px; background:transparent">
            <div style="font-size:9px; color:var(--warn); text-align:right; line-height:1; padding-bottom:2px">→ ${effV}h</div>
          </td>`;
        } else {
          html += `<td class="num" style="padding:2px">
            <input type="number" min="0" step="0.5" value="${rawV}" placeholder="${state.defaultCapacity}"
              data-worker="${safeW}" data-ym="${ym}" class="cap-input"
              style="width:58px; padding:4px 5px; text-align:right; font-family:'JetBrains Mono',monospace; font-size:11px">
          </td>`;
        }
      }
      html += `<td class="num" style="border-left:1px solid var(--line); font-weight:600">${round2(totalEff)}h</td></tr>`;
    }
    html += '</tbody></table>';
    document.getElementById('cap-wrap').innerHTML = html;
    document.querySelectorAll('.cap-input').forEach(inp => {
      inp.onchange = async () => {
        if (!guardEdit()) { inp.value = inp.defaultValue; return; }
        const w = inp.dataset.worker, ym = inp.dataset.ym;
        const v = inp.value === '' ? null : parseFloat(inp.value);
        if (!state.capacity[w]) state.capacity[w] = {};
        if (v === null || isNaN(v)) delete state.capacity[w][ym];
        else state.capacity[w][ym] = v;
        await saveState();
        drawCap(); // re-render para actualizar os totais e as células com ausência
      };
    });
  };
  drawCap();
  yearSel.onchange = drawCap;
  renderAbsences();
}

document.getElementById('btn-add-person').onclick = async () => {
  if (!guardEdit()) return;
  const name = document.getElementById('new-person-name').value.trim();
  const cap = parseFloat(document.getElementById('new-person-cap').value) || 140;
  if (!name) { toast('Indica um nome', 'error'); return; }
  if (state.workers.includes(name)) { toast('Pessoa já existe', 'error'); return; }
  state.workers.push(name);
  state.workers.sort();
  // Definir capacidade default para os próximos 24 meses
  if (!state.capacity[name]) state.capacity[name] = {};
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    state.capacity[name][ymKey(d.getFullYear(), d.getMonth()+1)] = cap;
  }
  await saveState();
  document.getElementById('new-person-name').value = '';
  toast(`${name} adicionado`);
  renderEquipa();
  // Reset filtros para refletir nova pessoa
  document.getElementById('filter-worker').innerHTML = '<option value="">Todas as pessoas</option>';
};

window.removePerson = async (name) => {
  if (!guardEdit()) return;
  const allocCount = state.records.filter(r => r.worker === name).length;
  let msg = `Remover ${name} da equipa?`;
  if (allocCount > 0) msg += `\n\nEliminará também ${allocCount} alocação(ões) associada(s).`;
  if (!confirm(msg)) return;
  state.workers = state.workers.filter(w => w !== name);
  state.records = state.records.filter(r => r.worker !== name);
  delete state.capacity[name];
  await saveState();
  toast(`${name} removido`);
  renderEquipa();
  document.getElementById('filter-worker').innerHTML = '<option value="">Todas as pessoas</option>';
};

// ════════════════════════════════════════════════════════════════════════
// MODAL: NOVA / EDITAR
// ════════════════════════════════════════════════════════════════════════
const modal = document.getElementById('modal');
let _openedRecordHash = null;

function openModal(record) {
  // Reset to hours mode
  _allocUnit = 'h';
  document.querySelectorAll('.unit-btn').forEach(b => b.classList.toggle('active', b.dataset.unit === 'h'));
  document.getElementById('f-hours').step = '0.5';
  document.getElementById('months-unit-label').textContent = 'Horas';

  document.getElementById('modal-title').textContent = record ? 'Editar alocação' : 'Nova alocação';
  document.getElementById('modal-delete').style.display = record ? 'inline-flex' : 'none';
  _openedRecordHash = record ? recordContentHash(record) : null;

  // populate selects — use new Option() to avoid innerHTML encoding issues
  const ws = document.getElementById('f-worker');
  ws.innerHTML = '';
  ws.add(new Option('— Selecionar —', ''));
  state.workers.forEach(w => ws.add(new Option(w, w)));

  const ps = document.getElementById('f-project');
  ps.innerHTML = '';
  ps.add(new Option('— Selecionar —', ''));
  state.projects.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach(p => {
    const opt = new Option(p.name, p.name);
    if (p.active === false) opt.style.color = '#aaa';
    ps.add(opt);
  });

  if (record) {
    document.getElementById('f-id').value = record.id;
    document.getElementById('f-worker').value = record.worker;
    // If project was removed from catalog, add it back as an option so it stays visible
    if (record.project && !ps.querySelector(`option[value="${CSS.escape(record.project)}"]`)) {
      const orphan = new Option(record.project + ' (removido)', record.project);
      orphan.style.color = '#aaa';
      ps.add(orphan);
    }
    document.getElementById('f-project').value = record.project;
    document.getElementById('f-wp').value = record.wp || '';
    document.getElementById('f-task').value = record.task || '';
    document.getElementById('f-start').value = record.start;
    document.getElementById('f-end').value = record.end;
    document.getElementById('f-hours').value = record.totalHours;
  } else {
    document.getElementById('form-alloc').reset();
    document.getElementById('f-id').value = '';
    // Default: mês atual
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    document.getElementById('f-start').value = ym;
    document.getElementById('f-end').value = ym;
  }
  buildMonthsEditor(record ? record.monthsHours : null);
  modal.classList.add('active');
}

function closeModal() {
  modal.classList.remove('active');
}

document.getElementById('btn-new').onclick = () => { if (guardEdit()) openModal(null); };
document.getElementById('modal-close').onclick = closeModal;
document.getElementById('modal-cancel').onclick = closeModal;
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

let _allocUnit = 'h'; // 'h' or 'pm'

function avgCapForPeriod() {
  const worker = document.getElementById('f-worker').value;
  const start  = document.getElementById('f-start').value;
  const end    = document.getElementById('f-end').value;
  if (!start || !end || start > end) return state.defaultCapacity || 140;
  const months = ymList(start, end);
  if (!months.length) return state.defaultCapacity || 140;
  const total = months.reduce((s, ym) => s + getCapacity(worker, ym), 0);
  return total / months.length;
}

function getFormTotalHours() {
  const v = parseFloat(document.getElementById('f-hours').value) || 0;
  return _allocUnit === 'pm' ? round2(v * avgCapForPeriod()) : v;
}

function buildMonthsEditor(existing) {
  const start = document.getElementById('f-start').value;
  const end = document.getElementById('f-end').value;
  if (!start || !end || start > end) {
    document.getElementById('months-editor').innerHTML = '<div style="color:var(--ink-faint); font-size:12px">Define um período válido.</div>';
    document.getElementById('hours-sum').textContent = '';
    return;
  }
  const yms = ymList(start, end);
  const worker = document.getElementById('f-worker').value;
  const totalH = getFormTotalHours();
  const perMonth = yms.length > 0 ? totalH / yms.length : 0;
  const isPM = _allocUnit === 'pm';

  const html = yms.map(ym => {
    const cap = getCapacity(worker, ym);
    // existing values are always stored in hours; convert to PM for display if needed
    const hVal = existing && existing[ym] !== undefined ? existing[ym] : round2(perMonth);
    const v = isPM ? (cap > 0 ? round2(hVal / cap) : 0) : hVal;
    return `<div class="month-cell">
      <label>${ymLabel(ym)}</label>
      <input type="number" min="0" step="${isPM ? 'any' : '0.5'}" data-ym="${ym}" value="${v}" class="month-input">
    </div>`;
  }).join('');
  document.getElementById('months-editor').innerHTML = html;
  document.querySelectorAll('.month-input').forEach(inp => inp.oninput = updateHoursSum);
  updateHoursSum();
}

function updateHoursSum() {
  let sum = 0;
  document.querySelectorAll('.month-input').forEach(i => sum += parseFloat(i.value) || 0);
  const badge = document.getElementById('hours-sum');
  if (_allocUnit === 'pm') {
    const target = parseFloat(document.getElementById('f-hours').value) || 0;
    badge.textContent = `Σ ${round2(sum)} / ${round2(target)} PM`;
    badge.className = 'badge mono ' + (Math.abs(sum - target) < 0.005 ? 'ok' : 'warn');
  } else {
    const target = getFormTotalHours();
    badge.textContent = `Σ ${round2(sum)} / ${round2(target)} h`;
    badge.className = 'badge mono ' + (Math.abs(sum - target) < 0.05 ? 'ok' : 'warn');
  }
}

document.getElementById('f-start').oninput = () => buildMonthsEditor(null);
document.getElementById('f-end').oninput = () => buildMonthsEditor(null);
document.getElementById('f-hours').oninput = () => buildMonthsEditor(null);

document.getElementById('btn-redistribute').onclick = () => {
  buildMonthsEditor(null);
  toast('Distribuição uniformizada');
};

document.querySelectorAll('.unit-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const newUnit = btn.dataset.unit;
    if (newUnit === _allocUnit) return;
    const oldV = parseFloat(document.getElementById('f-hours').value) || 0;
    const cap  = avgCapForPeriod();
    document.querySelectorAll('.unit-btn').forEach(b => b.classList.toggle('active', b.dataset.unit === newUnit));
    _allocUnit = newUnit;
    if (newUnit === 'pm') {
      document.getElementById('f-hours').value = cap > 0 ? round2(oldV / cap) : 0;
      document.getElementById('f-hours').step = 'any';
      document.getElementById('months-unit-label').textContent = 'PM';
    } else {
      document.getElementById('f-hours').value = round2(oldV * cap);
      document.getElementById('f-hours').step = '0.5';
      document.getElementById('months-unit-label').textContent = 'Horas';
    }
    buildMonthsEditor(null);
  });
});

document.getElementById('form-alloc').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!guardEdit()) return;
  const id = document.getElementById('f-id').value;
  const worker = document.getElementById('f-worker').value;
  const project = document.getElementById('f-project').value;
  const wp = document.getElementById('f-wp').value.trim();
  const task = document.getElementById('f-task').value.trim();
  const start = document.getElementById('f-start').value;
  const end = document.getElementById('f-end').value;
  const totalHours = getFormTotalHours();

  if (!worker || !project || !start || !end || isNaN(totalHours)) {
    toast('Preenche os campos obrigatórios', 'error');
    return;
  }
  if (start > end) { toast('Fim antes do início', 'error'); return; }

  const monthsHours = {};
  document.querySelectorAll('.month-input').forEach(i => {
    const v = parseFloat(i.value);
    if (!isNaN(v) && v > 0) {
      // cells show PM when in PM mode — convert back to hours for storage
      monthsHours[i.dataset.ym] = _allocUnit === 'pm'
        ? round2(v * getCapacity(worker, i.dataset.ym))
        : v;
    }
  });
  const realSum = Object.values(monthsHours).reduce((s,v) => s+v, 0);

  // Optimistic locking: if another user saved this record since we opened it, warn before overwriting
  if (id) {
    const current = state.records.find(r => r.id === id);
    if (current && recordContentHash(current) !== _openedRecordHash) {
      if (!confirm('Esta alocacao foi alterada por outro utilizador enquanto editavas.\n\nGuardar mesmo assim (sobrescrever)?')) return;
    }
  }

  const record = {
    id: id || uuid(),
    team: 'Processos',
    worker, project, wp, task, start, end,
    totalHours: round2(realSum),
    monthsHours,
    updatedAt: new Date().toISOString(),
  };
  const isNew = !id;
  if (id) {
    const idx = state.records.findIndex(r => r.id === id);
    if (idx >= 0) state.records[idx] = record;
  } else {
    state.records.push(record);
  }
  const entityName = [worker, project, task].filter(Boolean).join(' / ');
  await logChange(isNew ? 'create' : 'update', 'record', record.id, entityName,
    `${round2(realSum)}h · ${start} → ${end}`);
  await saveState();
  closeModal();
  toast(id ? 'Alocação atualizada' : 'Alocação criada');
  renderView(currentView());
});

document.getElementById('modal-delete').onclick = async () => {
  if (!guardEdit()) return;
  const id = document.getElementById('f-id').value;
  if (!id) return;
  if (!confirm('Eliminar esta alocação?')) return;
  const rec = state.records.find(r => r.id === id);
  const entityName = rec ? [rec.worker, rec.project, rec.task].filter(Boolean).join(' / ') : id;
  state.records = state.records.filter(r => r.id !== id);
  await logChange('delete', 'record', id, entityName, null);
  await saveState();
  closeModal();
  toast('Alocação eliminada');
  renderView(currentView());
};

window.editRecord = (id) => {
  if (!guardEdit()) return;
  const r = state.records.find(x => x.id === id);
  if (r) openModal(r);
};

// ════════════════════════════════════════════════════════════════════════
// DUPLICAR ALOCAÇÃO (#3)
// ════════════════════════════════════════════════════════════════════════
window.duplicateRecord = (id) => {
  if (!guardEdit()) return;
  const r = state.records.find(x => x.id === id);
  if (!r) return;
  // Abre modal pré-preenchido mas sem id (cria novo)
  const copy = { ...r, id: null, monthsHours: { ...(r.monthsHours || {}) } };
  openModal(copy);
  // Sobrescrever f-id para garantir que é criação nova
  document.getElementById('f-id').value = '';
  document.getElementById('modal-title').textContent = 'Duplicar alocação';
  document.getElementById('modal-delete').style.display = 'none';
};


// ════════════════════════════════════════════════════════════════════════
// SYNC INDICATOR (#11)
// ════════════════════════════════════════════════════════════════════════
let _lastSaveError = ''; // detalhe do último erro de save (para diagnóstico)

function updateSyncIndicator(status, errorDetail) {
  const el = document.getElementById('sync-indicator');
  if (!el) return;
  el.className = '';
  el.onclick = null;
  el.style.cursor = '';
  if (status === 'saving') {
    el.className = 'saving';
    el.textContent = 'A guardar…';
    el.title = '';
  } else if (status === 'ok') {
    el.textContent = 'Guardado';
    el.title = state._lastSavedAt ? new Date(state._lastSavedAt).toLocaleTimeString('pt-PT') : '';
    // Actualizar para "há X min" após delay
    setTimeout(updateSyncRelative, 5000);
  } else if (status === 'conflict') {
    el.className = 'conflict';
    el.textContent = '⚠ Conflito';
    el.title = 'Clica para resolver o conflito';
  } else if (status === 'error') {
    el.className = 'error';
    // Mostrar código HTTP se disponível (e.g. "Erro [403]") para diagnóstico imediato
    const code = errorDetail || ((_lastSaveError.match(/\[HTTP (\d+)\]/) || [])[1]);
    el.textContent = code ? `Erro ao guardar [${code}]` : 'Erro ao guardar';
    el.title = _lastSaveError
      ? `${_lastSaveError}\n\nClica para copiar o detalhe do erro.`
      : 'Erro de gravação — clica para ver detalhes';
    el.onclick = () => {
      const msg = _lastSaveError || 'Sem detalhe disponível';
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(msg).then(() => toast('Detalhe do erro copiado'));
      } else {
        alert(`Detalhe do erro:\n\n${msg}`);
      }
    };
  }
}

function updateSyncRelative() {
  const el = document.getElementById('sync-indicator');
  if (!el || !state._lastSavedAt) return;
  if (el.classList.contains('saving') || el.classList.contains('conflict')) return;
  const mins = Math.floor((Date.now() - state._lastSavedAt) / 60000);
  if (mins < 1) el.textContent = 'Guardado agora';
  else if (mins === 1) el.textContent = 'Guardado há 1 min';
  else el.textContent = `Guardado há ${mins} min`;
}

// Actualizar o indicador relativo a cada minuto
setInterval(updateSyncRelative, 60000);

// ════════════════════════════════════════════════════════════════════════
// ARQUIVO MENSAL (plan snapshots)
// ════════════════════════════════════════════════════════════════════════

async function loadPlanSnapshots() {
  // Snapshots are embedded in the main state file — already loaded by loadState()
  if (state.planSnapshots !== null) return state.planSnapshots;
  state.planSnapshots = [];
  return state.planSnapshots;
}

async function savePlanSnapshots() {
  // Snapshots are persisted as part of saveState()
  await saveState();
}

function openSubmitPlanModal() {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  document.getElementById('f-plan-month').value = defaultMonth;
  document.getElementById('f-plan-note').value = '';
  const nProj = new Set(state.records.map(r => r.project)).size;
  document.getElementById('plan-submit-stats').innerHTML = `
    <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px; text-align:center">
      <div><div style="font-size:28px; font-family:'Fraunces',serif; font-weight:500; line-height:1">${state.records.length}</div><div style="font-size:11px; color:var(--ink-faint); margin-top:4px; text-transform:uppercase; letter-spacing:0.08em">alocações</div></div>
      <div><div style="font-size:28px; font-family:'Fraunces',serif; font-weight:500; line-height:1">${state.workers.length}</div><div style="font-size:11px; color:var(--ink-faint); margin-top:4px; text-transform:uppercase; letter-spacing:0.08em">pessoas</div></div>
      <div><div style="font-size:28px; font-family:'Fraunces',serif; font-weight:500; line-height:1">${nProj}</div><div style="font-size:11px; color:var(--ink-faint); margin-top:4px; text-transform:uppercase; letter-spacing:0.08em">projetos</div></div>
    </div>
  `;
  document.getElementById('modal-submit-plan').classList.add('active');
}

function closeSubmitPlanModal() {
  document.getElementById('modal-submit-plan').classList.remove('active');
}

document.getElementById('btn-submit-plan').onclick = openSubmitPlanModal;
document.getElementById('btn-submit-plan-2').onclick = openSubmitPlanModal;
document.getElementById('modal-submit-plan-close').onclick = closeSubmitPlanModal;
document.getElementById('sp-cancel').onclick = closeSubmitPlanModal;
document.getElementById('modal-submit-plan').addEventListener('click', e => {
  if (e.target.id === 'modal-submit-plan') closeSubmitPlanModal();
});
document.getElementById('btn-menu-submit-plan').onclick = openSubmitPlanModal;
document.getElementById('btn-menu-arquivo').onclick = () => {
  document.querySelector('#tabs button[data-view="arquivo"]').click();
};

document.getElementById('form-submit-plan').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!guardEdit()) return;
  const planMonth = document.getElementById('f-plan-month').value;
  const label = document.getElementById('f-plan-note').value.trim();
  if (!planMonth) return;

  let initials = sessionCtx.checkedIn ? sessionCtx.initials : state.editorInitials;
  if (!initials) {
    initials = await askInitials('plan');
    if (!initials) return;
  }

  await loadPlanSnapshots();

  const snap = {
    id: `snap_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
    submittedAt: new Date().toISOString(),
    submittedBy: initials,
    planMonth,
    label: label || null,
    stats: {
      records: state.records.length,
      workers: state.workers.length,
      projects: new Set(state.records.map(r => r.project)).size,
    },
    workers: [...state.workers],
    projects: state.projects.map(p => ({...p})),
    capacity: JSON.parse(JSON.stringify(state.capacity)),
    records: state.records.map(r => ({...r, monthsHours: {...(r.monthsHours || {})}})),
  };

  state.planSnapshots.unshift(snap);
  try {
    await savePlanSnapshots();
    closeSubmitPlanModal();
    toast(`Plano de ${ymLabel(planMonth)} guardado no arquivo`);
    if (currentView() === 'arquivo') renderArquivo();
  } catch (err) {
    console.error(err);
    state.planSnapshots.shift();
    toast('Erro ao guardar plano no arquivo', 'error');
  }
});

function renderArquivo() {
  if (state.planSnapshots === null) {
    document.getElementById('archive-empty').style.display = 'none';
    document.getElementById('archive-table-wrap').style.display = '';
    document.getElementById('archive-tbody').innerHTML =
      '<tr><td colspan="8" style="text-align:center; color:var(--ink-faint); padding:40px">A carregar...</td></tr>';
    loadPlanSnapshots().then(() => renderArquivo());
    return;
  }

  renderTrendChart();
  const snaps = state.planSnapshots;
  document.getElementById('archive-count').textContent = snaps.length;

  if (snaps.length === 0) {
    document.getElementById('archive-empty').style.display = '';
    document.getElementById('archive-table-wrap').style.display = 'none';
    return;
  }

  document.getElementById('archive-empty').style.display = 'none';
  document.getElementById('archive-table-wrap').style.display = '';

  const fmtTs = iso => new Date(iso).toLocaleString('pt-PT', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  document.getElementById('archive-tbody').innerHTML = snaps.map(s => `
    <tr>
      <td><strong>${ymLabel(s.planMonth)}</strong></td>
      <td style="color:var(--ink-soft)">${fmtTs(s.submittedAt)}</td>
      <td><span class="badge">${s.submittedBy}</span></td>
      <td style="color:var(--ink-soft)">${s.label || '—'}</td>
      <td class="num">${s.stats.records}</td>
      <td class="num">${s.stats.workers}</td>
      <td class="num">${s.stats.projects}</td>
      <td class="actions">
        <button class="btn btn-sm" onclick="viewSnapshot('${s.id}')">Ver</button>
      </td>
    </tr>
  `).join('');
}

let _currentSnapshotId = null;

window.viewSnapshot = function(id) {
  const s = (state.planSnapshots || []).find(x => x.id === id);
  if (!s) return;
  _currentSnapshotId = id;

  const fmtTs = iso => new Date(iso).toLocaleString('pt-PT', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  document.getElementById('snapshot-modal-title').textContent = `Plano de ${ymLabel(s.planMonth)}`;
  document.getElementById('snapshot-modal-meta').innerHTML =
    `Submetido em ${fmtTs(s.submittedAt)} por <strong>${s.submittedBy}</strong>${s.label ? ` · <em>${s.label}</em>` : ''}`;

  const workerSummary = {};
  for (const r of (s.records || [])) {
    if (!workerSummary[r.worker]) workerSummary[r.worker] = { projects: new Set(), totalHours: 0 };
    workerSummary[r.worker].projects.add(r.project);
    workerSummary[r.worker].totalHours += r.totalHours || 0;
  }

  const rows = Object.entries(workerSummary)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([w, d]) => `
      <tr>
        <td>${w}</td>
        <td style="color:var(--ink-soft)">${[...d.projects].sort().join(', ')}</td>
        <td class="num">${Math.round(d.totalHours)}h</td>
      </tr>
    `).join('');

  document.getElementById('snapshot-modal-body').innerHTML = `
    <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:20px">
      <div class="stat"><div class="stat-label">Alocações</div><div class="stat-value">${s.stats.records}</div></div>
      <div class="stat"><div class="stat-label">Pessoas</div><div class="stat-value">${s.stats.workers}</div></div>
      <div class="stat"><div class="stat-label">Projetos</div><div class="stat-value">${s.stats.projects}</div></div>
    </div>
    <div class="table-wrap" style="max-height:380px; overflow-y:auto; border:1px solid var(--line); border-radius:6px">
      <table class="data">
        <thead><tr><th>Pessoa</th><th>Projetos</th><th style="text-align:right">Total horas</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="3" style="text-align:center;color:var(--ink-faint);padding:20px">Sem alocações neste plano</td></tr>'}</tbody>
      </table>
    </div>
  `;

  document.getElementById('modal-snapshot').classList.add('active');
};

document.getElementById('modal-snapshot-close').onclick = () =>
  document.getElementById('modal-snapshot').classList.remove('active');
document.getElementById('snapshot-close-btn').onclick = () =>
  document.getElementById('modal-snapshot').classList.remove('active');
document.getElementById('modal-snapshot').addEventListener('click', e => {
  if (e.target.id === 'modal-snapshot') document.getElementById('modal-snapshot').classList.remove('active');
});

document.getElementById('snapshot-delete-btn').onclick = async () => {
  if (!guardEdit()) return;
  if (!confirm('Eliminar este plano do arquivo? Esta ação não pode ser revertida.')) return;
  state.planSnapshots = state.planSnapshots.filter(s => s.id !== _currentSnapshotId);
  await savePlanSnapshots();
  document.getElementById('modal-snapshot').classList.remove('active');
  toast('Plano eliminado do arquivo');
  renderArquivo();
};

document.getElementById('snapshot-restore-btn').onclick = async () => {
  if (!guardEdit()) return;
  const s = (state.planSnapshots || []).find(x => x.id === _currentSnapshotId);
  if (!s) return;
  if (!confirm(`Restaurar o estado do plano de ${ymLabel(s.planMonth)}?\nO estado atual será substituído.`)) return;
  autoBackup('Antes de Restaurar');
  state.workers = [...s.workers];
  state.projects = s.projects.map(p => ({...p}));
  state.capacity = JSON.parse(JSON.stringify(s.capacity));
  state.records = s.records.map(r => ({...r, monthsHours: {...(r.monthsHours || {})}}));
  await saveState();
  document.getElementById('modal-snapshot').classList.remove('active');
  toast(`Estado de ${ymLabel(s.planMonth)} restaurado`);
  resetUIFilters();
  renderView(currentView());
};

