// ════════════════════════════════════════════════════════════════════════
// GANTT
// ════════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════════
// GANTT (com filtros)
// ════════════════════════════════════════════════════════════════════════
// Filtros: null = todos selecionados (default); Set = só os que estão no set
const ganttFilters = { workers: null, projects: null };

function populateMultiSelect(containerId, items, selected) {
  const c = document.getElementById(containerId);
  c.innerHTML = items.map(it => {
    const isOn = selected ? selected.has(it) : true;
    return `<label><input type="checkbox" value="${String(it).replace(/"/g,'&quot;')}" ${isOn?'checked':''}><span>${it}</span></label>`;
  }).join('') || '<div style="padding:12px; font-size:12px; color:var(--ink-faint)">Sem opções</div>';
}

function readMultiSelect(containerId) {
  const boxes = document.querySelectorAll('#' + containerId + ' input[type="checkbox"]');
  const all = boxes.length;
  const checked = [...boxes].filter(b => b.checked).map(b => b.value);
  if (checked.length === all) return null;       // todos = sem filtro
  return new Set(checked);
}

function updateMsSummary(containerId, totalItems, kind) {
  const sel = readMultiSelect(containerId);
  const wrapper = document.querySelector(`.multiselect[data-target="${containerId}"]`);
  if (!wrapper) return;
  const span = wrapper.querySelector('.ms-summary');
  if (sel === null) span.textContent = kind === 'workers' ? 'todas' : 'todos';
  else if (sel.size === 0) span.textContent = 'nenhum';
  else if (sel.size === 1) span.textContent = [...sel][0];
  else span.textContent = sel.size + ' selecionados';
}

// ────────── DRAG / RESIZE das barras Gantt ──────────
// Estado do drag (apenas durante a interação)
const dragState = {
  active: false,
  mode: null,           // 'move' | 'resize-left' | 'resize-right'
  recordId: null,
  bar: null,
  track: null,          // pista DOM da pessoa atual
  trackRect: null,
  monthWidthPx: 0,
  startX: 0,
  startLeftPct: 0,
  startWidthPct: 0,
  origStartIdx: 0,
  origEndIdx: 0,
  curStartIdx: 0,
  curEndIdx: 0,
  ymsYear: null,
  year: 0,
  origWorker: null,
  curWorker: null,
  origTotalPM: 0,
  origTotalH: 0,
  movedThreshold: false,
  redrawFn: null,
};

function attachBarInteractions(bar, ymsRange, _yearUnused, redrawFn) {
  bar.addEventListener('pointerdown', (e) => onBarPointerDown(e, bar, ymsRange, redrawFn));
}

function onBarPointerDown(e, bar, ymsRange, redrawFn) {
  if (e.button !== 0) return;
  if (!guardEdit()) return;
  if (e.target.closest('input, .gb-month-cell')) return; // month inputs handle themselves
  const handle = e.target.closest('.gb-handle');
  const isMonthlyMode = !!bar.closest('.gantt.monthly-mode');
  const mode = handle ? (handle.dataset.handle === 'left' ? 'resize-left' : 'resize-right') : 'move';
  if (isMonthlyMode && mode !== 'resize-right') return; // monthly mode: only right-resize via handle
  const recordId = bar.dataset.id;
  const rec = state.records.find(r => r.id === recordId);
  if (!rec) return;
  const track = bar.parentElement;
  const trackRect = track.getBoundingClientRect();
  const nCols = ymsRange.length;

  dragState.active = true;
  dragState.mode = mode;
  dragState.recordId = recordId;
  dragState.bar = bar;
  dragState.track = track;
  dragState.trackRect = trackRect;
  dragState.monthWidthPx = trackRect.width / nCols;
  dragState.startX = e.clientX;
  dragState.startLeftPct = parseFloat(bar.style.left) || 0;
  dragState.startWidthPct = parseFloat(bar.style.width) || 0;
  dragState.ymsRange = ymsRange;
  dragState.nCols = nCols;
  dragState.origWorker = rec.worker;
  dragState.curWorker = rec.worker;
  dragState.movedThreshold = false;
  dragState.redrawFn = redrawFn;

  // Indexes iniciais a partir do pct (relativos ao range visível)
  dragState.origStartIdx = Math.round((dragState.startLeftPct / 100) * nCols);
  dragState.origEndIdx = Math.round(((dragState.startLeftPct + dragState.startWidthPct) / 100) * nCols) - 1;
  dragState.curStartIdx = dragState.origStartIdx;
  dragState.curEndIdx = dragState.origEndIdx;

  let totalPM = 0, totalH = 0;
  for (const [ym, h] of Object.entries(rec.monthsHours)) {
    const cap = getCapacity(rec.worker, ym);
    if (cap > 0) totalPM += h / cap;
    totalH += h;
  }
  dragState.origTotalPM = totalPM;
  dragState.origTotalH = totalH;

  bar.classList.add('dragging');
  bar.setPointerCapture(e.pointerId);
  e.preventDefault();
  e.stopPropagation();

  document.addEventListener('pointermove', onBarPointerMove);
  document.addEventListener('pointerup', onBarPointerUp, {once: true});
  document.addEventListener('pointercancel', onBarPointerUp, {once: true});
}

function onBarPointerMove(e) {
  if (!dragState.active) return;
  const dx = e.clientX - dragState.startX;
  if (Math.abs(dx) > 3) dragState.movedThreshold = true;
  const nCols = dragState.nCols;

  // Drop target (outra pista)
  if (dragState.mode === 'move') {
    const elBelow = document.elementFromPoint(e.clientX, e.clientY);
    const trackBelow = elBelow ? elBelow.closest('.gantt-track[data-worker]') : null;
    document.querySelectorAll('.gantt-track.drop-target').forEach(t => t.classList.remove('drop-target'));
    if (trackBelow && trackBelow !== dragState.track) {
      trackBelow.classList.add('drop-target');
      dragState.curWorker = trackBelow.dataset.worker;
    } else {
      dragState.curWorker = dragState.origWorker;
    }
  }

  const deltaMonths = Math.round(dx / dragState.monthWidthPx);

  let newStartIdx = dragState.origStartIdx;
  let newEndIdx = dragState.origEndIdx;
  if (dragState.mode === 'move') {
    newStartIdx = dragState.origStartIdx + deltaMonths;
    newEndIdx = dragState.origEndIdx + deltaMonths;
  } else if (dragState.mode === 'resize-left') {
    newStartIdx = Math.min(dragState.origEndIdx, dragState.origStartIdx + deltaMonths);
  } else if (dragState.mode === 'resize-right') {
    newEndIdx = Math.max(dragState.origStartIdx, dragState.origEndIdx + deltaMonths);
  }
  // Permitir extravasar (clamp suave: até nCols+3 de cada lado)
  newStartIdx = Math.max(-3, Math.min(nCols + 2, newStartIdx));
  newEndIdx = Math.max(newStartIdx, Math.min(nCols + 2, newEndIdx));

  dragState.curStartIdx = newStartIdx;
  dragState.curEndIdx = newEndIdx;

  // Visual clamped à pista (0..nCols-1)
  const clampStart = Math.max(0, newStartIdx);
  const clampEnd = Math.min(nCols - 1, newEndIdx);
  if (clampEnd < 0 || clampStart > nCols - 1) {
    dragState.bar.style.display = 'none';
  } else {
    dragState.bar.style.display = '';
    const leftPct = (clampStart / nCols) * 100;
    const widthPct = ((clampEnd - clampStart + 1) / nCols) * 100;
    dragState.bar.style.left = leftPct + '%';
    dragState.bar.style.width = widthPct + '%';
  }

  const newDurationTotal = newEndIdx - newStartIdx + 1;
  const previewPM = dragState.origTotalPM;
  const previewH = dragState.origTotalH;

  const pmBadge = dragState.bar.querySelector('.gb-pm');
  if (pmBadge) pmBadge.textContent = previewPM.toFixed(2) + ' PM';

  // Tooltip flutuante
  const tip = document.getElementById('drag-tip');
  const newStartYM = idxToYMRange(newStartIdx, dragState.ymsRange);
  const newEndYM = idxToYMRange(newEndIdx, dragState.ymsRange);
  const modeLabel = dragState.mode === 'move' ? 'Mover' : (dragState.mode === 'resize-left' ? 'Início' : 'Fim');
  const workerLabel = dragState.curWorker !== dragState.origWorker ? `<br><strong>→ ${dragState.curWorker}</strong>` : '';
  tip.innerHTML = `${modeLabel}: <strong>${ymLabel(newStartYM)}</strong> → <strong>${ymLabel(newEndYM)}</strong><br>${newDurationTotal} ${newDurationTotal===1?'mês':'meses'} · ${previewPM.toFixed(2)} PM · ${round2(previewH)}h${workerLabel}`;
  tip.style.left = (e.clientX + 14) + 'px';
  tip.style.top = (e.clientY - 8) + 'px';
  tip.classList.add('show');
}

// Resolver idx (pode ser fora do range visível) para YYYY-MM, com base no início do range
function idxToYMRange(idx, ymsRange) {
  if (idx >= 0 && idx < ymsRange.length) return ymsRange[idx];
  // Fora do range: extrapolar a partir de ymsRange[0]
  return ymAddMonths(ymsRange[0], idx);
}

// Manter idxToYM antigo apenas para compatibilidade (não usado)
function idxToYM(idx, year) {
  let m = idx + 1, y = year;
  while (m < 1) { m += 12; y--; }
  while (m > 12) { m -= 12; y++; }
  return ymKey(y, m);
}

async function onBarPointerUp(e) {
  if (!dragState.active) return;
  document.removeEventListener('pointermove', onBarPointerMove);
  document.querySelectorAll('.gantt-track.drop-target').forEach(t => t.classList.remove('drop-target'));
  document.getElementById('drag-tip').classList.remove('show');
  if (dragState.bar) dragState.bar.classList.remove('dragging');

  const wasActive = dragState.active;
  const moved = dragState.movedThreshold;
  const recordId = dragState.recordId;
  const newStartIdx = dragState.curStartIdx;
  const newEndIdx = dragState.curEndIdx;
  const origStartIdx = dragState.origStartIdx;
  const origEndIdx = dragState.origEndIdx;
  const ymsRange = dragState.ymsRange;
  const origWorker = dragState.origWorker;
  const curWorker = dragState.curWorker;
  const redrawFn = dragState.redrawFn;

  dragState.active = false;
  if (!wasActive) return;

  // Click sem movimento real → abrir modal
  if (!moved && curWorker === origWorker) {
    const rec = state.records.find(r => r.id === recordId);
    if (rec) openModal(rec);
    return;
  }

  // Sem alteração
  if (newStartIdx === origStartIdx && newEndIdx === origEndIdx && curWorker === origWorker) {
    return;
  }

  const rec = state.records.find(r => r.id === recordId);
  if (!rec) return;

  const newStartYM = idxToYMRange(newStartIdx, ymsRange);
  const newEndYM = idxToYMRange(newEndIdx, ymsRange);

  const origDuration = origEndIdx - origStartIdx + 1;
  const newDuration = newEndIdx - newStartIdx + 1;
  const sameDuration = origDuration === newDuration;

  if (sameDuration) {
    // Calcular shift em meses (diferença entre origStart e newStart, em meses absolutos)
    const origStartYM = idxToYMRange(origStartIdx, ymsRange);
    const shiftMonths = monthsDiff(origStartYM, newStartYM);
    applyShiftByMonths(rec, shiftMonths, curWorker);
    redrawFn();
    toast(curWorker !== origWorker ? `Movido para ${curWorker}` : 'Período movido');
  } else {
    openRedistDialog(rec, newStartYM, newEndYM, curWorker, redrawFn);
  }
}

// Shift por N meses (substitui applyShiftAndSave que dependia de year)
function applyShiftByMonths(rec, shiftMonths, newWorker) {
  if (shiftMonths === 0 && newWorker === rec.worker) return;
  const newMonths = {};
  const entries = Object.entries(rec.monthsHours).sort((a,b) => a[0].localeCompare(b[0]));
  for (const [ym, h] of entries) {
    newMonths[ymAddMonths(ym, shiftMonths)] = h;
  }
  rec.monthsHours = newMonths;
  const yms = Object.keys(newMonths).sort();
  rec.start = yms[0];
  rec.end = yms[yms.length - 1];
  rec.totalHours = round2(Object.values(newMonths).reduce((s,v) => s+v, 0));
  if (newWorker && newWorker !== rec.worker) rec.worker = newWorker;
  markUpdated(rec);
  saveState();
}

// Modal de redistribuição quando duração muda
function openRedistDialog(rec, newStartYM, newEndYM, newWorker, redrawFn) {
  const modal = document.getElementById('modal-redist');
  const origDuration = ymList(rec.start, rec.end).length;
  const newDuration = ymList(newStartYM, newEndYM).length;

  let totalPM = 0, totalH = 0;
  for (const [ym, h] of Object.entries(rec.monthsHours)) {
    const cap = getCapacity(rec.worker, ym);
    if (cap > 0) totalPM += h / cap;
    totalH += h;
  }

  const workerChange = newWorker !== rec.worker
    ? `<div style="color:var(--accent); margin-top:6px"><strong>Pessoa:</strong> ${rec.worker} → ${newWorker}</div>` : '';

  document.getElementById('redist-info').innerHTML = `
    <div><strong>${rec.project}${rec.wp ? ' · '+rec.wp : ''}</strong></div>
    <div style="margin-top:6px; color:var(--ink-soft)">
      Período: <span class="mono">${ymLabel(rec.start)} → ${ymLabel(rec.end)}</span> (${origDuration} ${origDuration===1?'mês':'meses'})<br>
      Novo: <span class="mono">${ymLabel(newStartYM)} → ${ymLabel(newEndYM)}</span> (${newDuration} ${newDuration===1?'mês':'meses'})<br>
      Esforço atual: <strong>${totalPM.toFixed(2)} PM</strong> · ${round2(totalH)}h
    </div>
    ${workerChange}
  `;

  modal.classList.add('active');

  const cleanup = () => {
    modal.classList.remove('active');
    document.getElementById('redist-auto').onclick = null;
    document.getElementById('redist-manual').onclick = null;
    document.getElementById('redist-cancel').onclick = null;
  };

  document.getElementById('redist-auto').onclick = () => {
    // Distribuir total preservando PM:
    // Como capacidades variam por mês, usamos o total H atual e distribuímos
    // proporcionalmente às capacidades dos novos meses (mantém o esforço relativo)
    const newYms = ymList(newStartYM, newEndYM);
    const targetWorker = newWorker || rec.worker;
    const caps = newYms.map(ym => getCapacity(targetWorker, ym));
    const capSum = caps.reduce((s,v) => s+v, 0);
    // Distribuir totalPM por mês = (cap_mes/capSum) * totalPM, depois converter para horas
    // h_mes = pm_mes * cap_mes = (cap_mes/capSum) * totalPM * cap_mes
    // Mas o que faz mais sentido é manter PM total constante e que cada mês fique com horas
    // proporcionais à sua capacidade (mais robusto a férias):
    // h_mes / cap_mes = totalPM / nMeses (PM por mês uniforme)
    const pmPerMonth = totalPM / newYms.length;
    const newMonths = {};
    for (let i = 0; i < newYms.length; i++) {
      const h = pmPerMonth * caps[i];
      newMonths[newYms[i]] = round2(h);
    }
    rec.start = newStartYM;
    rec.end = newEndYM;
    rec.monthsHours = newMonths;
    rec.totalHours = round2(Object.values(newMonths).reduce((s,v) => s+v, 0));
    if (newWorker && newWorker !== rec.worker) rec.worker = newWorker;
    markUpdated(rec);
    saveState();
    cleanup();
    redrawFn();
    toast('Distribuído automaticamente (PM preservado)');
  };

  document.getElementById('redist-manual').onclick = () => {
    // Aplicar mudança de pessoa primeiro se houver, depois truncar/expandir intervalo e abrir modal
    if (newWorker && newWorker !== rec.worker) rec.worker = newWorker;
    rec.start = newStartYM;
    rec.end = newEndYM;
    // Manter horas nos meses que coincidem; expandir com 0 para os novos
    const newYms = ymList(newStartYM, newEndYM);
    const oldMonths = {...rec.monthsHours};
    const newMonths = {};
    for (const ym of newYms) {
      newMonths[ym] = oldMonths[ym] !== undefined ? oldMonths[ym] : 0;
    }
    rec.monthsHours = newMonths;
    rec.totalHours = round2(Object.values(newMonths).reduce((s,v) => s+v, 0));
    markUpdated(rec);
    saveState();
    cleanup();
    openModal(rec);
    // Após fechar o modal, a re-renderização acontece pelo submit handler
  };

  document.getElementById('redist-cancel').onclick = () => {
    cleanup();
    redrawFn();  // reverte visual ao estado guardado
    toast('Operação cancelada');
  };
}

// Estado do range mensal da Timeline (persistente entre re-renders)
const ganttRange = { from: null, to: null };
// Modo de visualização da timeline: 'compact' (default) ou 'monthly' (com inputs por mês)
const ganttView = { mode: 'compact', unit: 'pm' };  // unit: 'pm' | 'h'

function defaultGanttRange() {
  // Se há registos, range = min/max dos meses com horas, limitado a ~24 meses
  const allYMs = new Set();
  for (const r of state.records) {
    for (const ym of Object.keys(r.monthsHours || {})) allYMs.add(ym);
  }
  if (allYMs.size > 0) {
    const sorted = [...allYMs].sort();
    const minYM = sorted[0];
    const maxYM = sorted[sorted.length - 1];
    // Se o intervalo é maior que 24 meses, foca-se a partir de hoje
    const monthsBetween = ymList(minYM, maxYM).length;
    if (monthsBetween > 24) {
      const now = new Date();
      const start = ymKey(now.getFullYear(), now.getMonth() + 1);
      const end = ymAddMonths(start, 11);  // 12 meses
      return { from: start, to: end };
    }
    return { from: minYM, to: maxYM };
  }
  // Sem registos: próximos 12 meses
  const now = new Date();
  const start = ymKey(now.getFullYear(), now.getMonth() + 1);
  return { from: start, to: ymAddMonths(start, 11) };
}

// Atualiza a célula da linha-sumário para um (worker, mês) com base nos inputs visíveis
function updateSumCell(worker, ym) {
  const safeW = (worker || '').replace(/"/g, '&quot;');
  const cell = document.querySelector(`.gb-sum-cell[data-worker-sum="${safeW}"][data-ym="${ym}"]`);
  if (!cell) return;
  const cap = getCapacity(worker, ym);
  let hSum = 0;
  const visibleRecIds = new Set();
  document.querySelectorAll(`.gb-month-cell input[data-ym="${ym}"]`).forEach(inp => {
    const recId = inp.dataset.rec;
    const rec = state.records.find(x => x.id === recId);
    if (!rec || rec.worker !== worker) return;
    visibleRecIds.add(recId);
    const v = parseFloat(inp.value) || 0;
    hSum += ganttView.unit === 'pm' ? v * cap : v;
  });
  for (const r of state.records) {
    if (r.worker !== worker || visibleRecIds.has(r.id)) continue;
    if (r.monthsHours[ym]) hSum += r.monthsHours[ym];
  }
  const pm = cap > 0 ? hSum / cap : 0;
  const isOver = pm > 1.001;
  cell.classList.toggle('over', isOver);
  cell.classList.toggle('empty', hSum === 0);
  cell.textContent = hSum === 0 ? '–' : (ganttView.unit === 'pm' ? pm.toFixed(2) : round2(hSum));
  cell.title = hSum === 0 ? `${ymLabel(ym)} · sem alocação` :
    `${ymLabel(ym)} · ${round2(hSum)}h / ${cap}h · ${pm.toFixed(2)} PM${isOver ? '\n⚠ SOBREALOCALÇÃO' : ''}`;
}

// Bind dos inputs mensais inline na barra (modo "Mostrar mensais")
function bindMonthlyInputs(redrawFn) {
  let saveDebounce = null;
  document.querySelectorAll('#gantt-wrap .gb-month-cell input').forEach(inp => {
    inp.addEventListener('focus', () => inp.select());
    inp.addEventListener('input', () => {
      const bar = inp.closest('.gantt-bar');
      if (!bar) return;
      let pmSum = 0;
      bar.querySelectorAll('.gb-month-cell input').forEach(i => {
        const v = parseFloat(i.value) || 0;
        if (ganttView.unit === 'pm') {
          pmSum += v;
        } else {
          const rec = state.records.find(x => x.id === i.dataset.rec);
          if (rec) { const cap = getCapacity(rec.worker, i.dataset.ym); if (cap > 0) pmSum += v / cap; }
        }
      });
      const badge = bar.querySelector('.gb-pm');
      if (badge) badge.textContent = pmSum.toFixed(2) + ' PM';
      const cell = inp.closest('.gb-month-cell');
      const rec = state.records.find(x => x.id === inp.dataset.rec);
      if (cell && rec) {
        const v = parseFloat(inp.value) || 0;
        const cap = getCapacity(rec.worker, inp.dataset.ym);
        const pm = ganttView.unit === 'pm' ? v : (cap > 0 ? v / cap : 0);
        cell.classList.toggle('over', pm > 1.001);
        updateSumCell(rec.worker, inp.dataset.ym);
      }
    });
    const commit = async () => {
      if (!guardEdit()) return;
      const recId = inp.dataset.rec;
      const ym = inp.dataset.ym;
      const rec = state.records.find(x => x.id === recId);
      if (!rec) return;
      const v = parseFloat(inp.value);
      let hours;
      if (isNaN(v) || v < 0) {
        hours = 0;
      } else if (ganttView.unit === 'pm') {
        hours = v * getCapacity(rec.worker, ym);
      } else {
        hours = v;
      }
      hours = round2(hours);
      const prev = round2(rec.monthsHours[ym] || 0);
      if (prev === hours) return;
      if (hours === 0) delete rec.monthsHours[ym];
      else rec.monthsHours[ym] = hours;
      const yms = Object.keys(rec.monthsHours).sort();
      if (yms.length > 0) { rec.start = yms[0]; rec.end = yms[yms.length - 1]; }
      rec.totalHours = round2(Object.values(rec.monthsHours).reduce((s, v) => s + v, 0));
      markUpdated(rec);
      const entityName = [rec.worker, rec.project, rec.task].filter(Boolean).join(' / ');
      logChange('update', 'record', rec.id, entityName, `${ymLabel(ym)}: ${prev}h → ${hours}h`);
      if (saveDebounce) clearTimeout(saveDebounce);
      saveDebounce = setTimeout(() => saveState(), 250);
    };
    inp.addEventListener('change', commit);
    inp.addEventListener('blur', commit);
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); inp.blur(); }
      else if (e.key === 'Escape') inp.blur();
    });
  });
}

// ── Drag-to-create state (module-level para evitar listener leaks) ──
const _gdc = { active: false, worker: null, startYm: null, endYm: null, el: null, track: null, yms: [], nCols: 0 };

function setupGanttDragCreate(ymsRange, nCols) {
  _gdc.yms = ymsRange;
  _gdc.nCols = nCols;

  document.querySelectorAll('#gantt-wrap .gantt-row:not(.sum-row):not(.header)').forEach(row => {
    const track = row.querySelector('.gantt-track[data-worker]');
    if (!track) return;
    track.addEventListener('mousedown', _gdcMousedown);
  });
}

function _gdcMonthFromX(track, clientX) {
  const rect = track.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(0.9999, (clientX - rect.left) / rect.width));
  const idx = Math.floor(ratio * _gdc.nCols);
  return _gdc.yms[idx] || _gdc.yms[_gdc.nCols - 1];
}

function _gdcMousedown(e) {
  if (e.button !== 0) return;
  if (e.target.closest('.gantt-bar')) return;
  if (!guardEdit()) return;
  const track = e.currentTarget;
  _gdc.active = true;
  _gdc.worker = track.dataset.worker;
  _gdc.track = track;
  _gdc.startYm = _gdcMonthFromX(track, e.clientX);
  _gdc.endYm = _gdc.startYm;
  _gdc.el = document.createElement('div');
  _gdc.el.style.cssText = 'position:absolute;top:4px;bottom:4px;background:rgba(196,84,29,0.2);border:2px dashed var(--accent);border-radius:4px;pointer-events:none;z-index:10;transition:none';
  track.style.position = 'relative';
  track.appendChild(_gdc.el);
  e.preventDefault();
}

document.addEventListener('mousemove', e => {
  if (!_gdc.active || !_gdc.el) return;
  _gdc.endYm = _gdcMonthFromX(_gdc.track, e.clientX);
  const s = _gdc.startYm <= _gdc.endYm ? _gdc.startYm : _gdc.endYm;
  const en = _gdc.startYm <= _gdc.endYm ? _gdc.endYm : _gdc.startYm;
  const si = _gdc.yms.indexOf(s), ei = _gdc.yms.indexOf(en);
  if (si >= 0 && ei >= 0) {
    _gdc.el.style.left = `${(si / _gdc.nCols) * 100}%`;
    _gdc.el.style.width = `${((ei - si + 1) / _gdc.nCols) * 100}%`;
  }
  const tip = document.getElementById('drag-tip');
  tip.textContent = si === ei ? ymLabel(s) : `${ymLabel(s)} → ${ymLabel(en)}`;
  tip.style.cssText = `position:fixed;top:${e.clientY - 36}px;left:${e.clientX + 8}px;display:block`;
});

document.addEventListener('mouseup', e => {
  if (!_gdc.active) return;
  _gdc.active = false;
  document.getElementById('drag-tip').style.display = 'none';
  if (_gdc.el) { _gdc.el.remove(); _gdc.el = null; }
  const s = _gdc.startYm <= _gdc.endYm ? _gdc.startYm : _gdc.endYm;
  const en = _gdc.startYm <= _gdc.endYm ? _gdc.endYm : _gdc.startYm;
  const worker = _gdc.worker;
  _gdc.worker = null; _gdc.track = null; _gdc.startYm = null; _gdc.endYm = null;
  if (!s || !en || !worker) return;
  // Threshold: ignorar cliques simples (sem drag) — exige arrastar pelo menos 1 mês
  if (s === en) return;
  // Abrir modal
  openModal({ id: null, worker, project:'', wp:'', task:'', start:s, end:en, totalHours:0, monthsHours:{} });
  document.getElementById('f-id').value = '';
  document.getElementById('modal-title').textContent = 'Nova alocação';
  document.getElementById('modal-delete').style.display = 'none';
});

function renderGantt() {
  const fromInput = document.getElementById('gantt-from');
  const toInput = document.getElementById('gantt-to');
  const quickSel = document.getElementById('gantt-quick');

  // Inicializar range se necessário
  if (!ganttRange.from || !ganttRange.to) {
    const def = defaultGanttRange();
    ganttRange.from = def.from;
    ganttRange.to = def.to;
  }
  fromInput.value = ganttRange.from;
  toInput.value = ganttRange.to;

  // Universos de filtros
  const allWorkers = [...new Set(state.records.map(r => r.worker))].sort();
  for (const w of state.workers) if (!allWorkers.includes(w)) allWorkers.push(w);
  allWorkers.sort();
  const allProjects = [...new Set(state.records.map(r => r.project))].sort();

  populateMultiSelect('gantt-workers', allWorkers, ganttFilters.workers);
  populateMultiSelect('gantt-projects', allProjects, ganttFilters.projects);
  updateMsSummary('gantt-workers', allWorkers.length, 'workers');
  updateMsSummary('gantt-projects', allProjects.length, 'projects');

  const draw = () => {
    let from = ganttRange.from, to = ganttRange.to;
    // validação: from <= to
    if (from > to) { to = from; ganttRange.to = to; toInput.value = to; }
    const ymsRange = ymList(from, to);
    const nCols = ymsRange.length;

    const projColors = {};
    let hueIdx = 0;
    const PALETTE = ['#c4541d', '#4a6741', '#b8860b', '#6b7c8e', '#8e6b3a', '#a64b76', '#7a5f4a', '#5d8c7e', '#9c6b2f', '#445f7a', '#6f4a5e', '#7a7e3c'];
    function colorFor(p) {
      if (!projColors[p]) projColors[p] = PALETTE[hueIdx++ % PALETTE.length];
      return projColors[p];
    }

    const fw = ganttFilters.workers;
    const fp = ganttFilters.projects;
    const filtered = state.records.filter(r => {
      if (fw && !fw.has(r.worker)) return false;
      if (fp && !fp.has(r.project)) return false;
      return ymsRange.some(ym => r.monthsHours[ym]);
    });

    // Info do filtro
    const totalInRange = state.records.filter(r => ymsRange.some(ym => r.monthsHours[ym])).length;
    const rangeLabel = nCols === 1 ? ymLabel(from) : `${ymLabel(from)} → ${ymLabel(to)} · ${nCols} meses`;
    document.getElementById('gantt-filter-info').textContent =
      filtered.length === totalInRange
        ? `${filtered.length} alocações · ${rangeLabel}`
        : `${filtered.length} de ${totalInRange} alocações · ${rangeLabel}`;

    // Cabeçalho dinâmico: se range cruza anos, mostrar "Mês/Ano slim"
    const yearsInRange = new Set(ymsRange.map(ym => ymParse(ym).y));
    const showYearInHeader = yearsInRange.size > 1;
    const headerCells = ymsRange.map(ym => {
      const {y, m} = ymParse(ym);
      const label = showYearInHeader
        ? `${MONTHS_PT[m-1]}<span style="opacity:0.5; font-size:9px; margin-left:3px">${String(y).slice(2)}</span>`
        : MONTHS_PT[m-1];
      return `<div>${label}</div>`;
    }).join('');

    const isMonthly = ganttView.mode === 'monthly';
    let html = `<div class="gantt${isMonthly ? ' monthly-mode' : ''}" style="--cols:${nCols}">`;
    html += `<div class="gantt-row header"><div class="gantt-label">Pessoa / Atividade</div>
      <div class="gantt-axis" style="display:grid; grid-template-columns:repeat(${nCols},1fr)">${headerCells}</div>
    </div>`;

    const byWorker = {};
    for (const r of filtered) {
      if (!byWorker[r.worker]) byWorker[r.worker] = [];
      byWorker[r.worker].push(r);
    }

    if (Object.keys(byWorker).length === 0) {
      html += `<div class="empty-state"><div class="display">Sem atividades</div><div>Ajusta o intervalo de datas ou os filtros</div></div>`;
    }

    const workerOrder = [...state.workers];
    for (const w of Object.keys(byWorker)) if (!workerOrder.includes(w)) workerOrder.push(w);

    for (const w of workerOrder) {
      if (!byWorker[w]) continue;
      let workerPM = 0;
      for (const r of byWorker[w]) {
        const monthsActive = ymsRange.filter(ym => r.monthsHours[ym]);
        for (const ym of monthsActive) {
          const cap = getCapacity(r.worker, ym);
          if (cap > 0) workerPM += r.monthsHours[ym] / cap;
        }
      }
      const safeW = w.replace(/"/g,'&quot;');
      html += `<div class="gantt-row"><div class="gantt-label worker">${w} <span style="font-family:'JetBrains Mono',monospace; font-size:10px; color:var(--ink-faint); font-weight:400">· ${workerPM.toFixed(2)} PM</span></div><div class="gantt-track" data-worker="${safeW}" style="--cols:${nCols}"></div></div>`;

      // Linha-sumário mensal (só em modo monthly)
      if (isMonthly) {
        const sumCells = ymsRange.map(ym => {
          let hSum = 0;
          for (const r of byWorker[w]) { if (r.monthsHours[ym]) hSum += r.monthsHours[ym]; }
          const cap = getCapacity(w, ym);
          const pm = cap > 0 ? hSum / cap : 0;
          const isOver = pm > 1.001;
          const value = hSum === 0 ? '–' : (ganttView.unit === 'pm' ? pm.toFixed(2) : round2(hSum));
          const tip = hSum === 0 ? `${ymLabel(ym)} · sem alocação` :
            `${ymLabel(ym)} · ${round2(hSum)}h / ${cap}h · ${pm.toFixed(2)} PM${isOver ? '\n⚠ SOBREALOCALÇÃO' : ''}`;
          return `<div class="gb-sum-cell${isOver ? ' over' : ''}${hSum === 0 ? ' empty' : ''}" data-worker-sum="${safeW}" data-ym="${ym}" title="${tip}">${value}</div>`;
        }).join('');
        html += `<div class="gantt-row sum-row">
          <div class="gantt-label sum-label">Σ ${ganttView.unit === 'pm' ? 'PM' : 'horas'}/mês</div>
          <div class="gantt-track sum-track" style="--cols:${nCols}">
            <div class="gb-sum-grid" style="grid-template-columns:repeat(${nCols}, 1fr)">${sumCells}</div>
          </div>
        </div>`;
      }

      for (const r of byWorker[w]) {
        const monthsActive = ymsRange.filter(ym => r.monthsHours[ym]);
        if (monthsActive.length === 0) continue;
        const firstIdx = ymsRange.indexOf(monthsActive[0]);
        const lastIdx = ymsRange.indexOf(monthsActive[monthsActive.length-1]);
        const left = (firstIdx / nCols) * 100;
        const width = ((lastIdx - firstIdx + 1) / nCols) * 100;

        let totalPM = 0, totalH = 0;
        for (const [ym, h] of Object.entries(r.monthsHours)) {
          const cap = getCapacity(r.worker, ym);
          if (cap > 0) totalPM += h / cap;
          totalH += h;
        }
        let pmRange = 0, hRange = 0;
        for (const ym of monthsActive) {
          const cap = getCapacity(r.worker, ym);
          if (cap > 0) pmRange += r.monthsHours[ym] / cap;
          hRange += r.monthsHours[ym];
        }
        const pmDisplay = pmRange.toFixed(2);
        const label = `${r.project}${r.wp ? ' · '+r.wp : ''}`;
        const tipBase = `${r.project}${r.wp?' / '+r.wp:''}${r.task?'\n'+r.task:''}\n${ymLabel(monthsActive[0])} → ${ymLabel(monthsActive[monthsActive.length-1])}\n${round2(hRange)}h no intervalo · ${pmDisplay} PM\nTotal registo: ${round2(totalH)}h · ${totalPM.toFixed(2)} PM`;
        const tip = isMonthly
          ? tipBase + '\n\nEdita os valores diretamente em cada mês'
          : tipBase + '\n\nArrasta para mover/redimensionar · clica para editar';
        const hideName = width < 8;
        const safeWr = r.worker.replace(/"/g,'&quot;');

        let barInner;
        if (isMonthly) {
          const cells = monthsActive.map(ym => {
            const h = r.monthsHours[ym] || 0;
            const cap = getCapacity(r.worker, ym);
            const pm = cap > 0 ? h / cap : 0;
            const isOver = pm > 1.001;
            const value = ganttView.unit === 'pm' ? pm.toFixed(2) : round2(h);
            return `<div class="gb-month-cell${isOver ? ' over' : ''}" title="${ymLabel(ym)} · ${round2(h)}h · ${pm.toFixed(2)} PM (cap. ${cap}h)">
              <input type="number" step="${ganttView.unit === 'pm' ? 'any' : '1'}" min="0" value="${value}" data-rec="${r.id}" data-ym="${ym}" />
            </div>`;
          }).join('');
          barInner = `<div class="gb-month-grid" style="grid-template-columns:repeat(${monthsActive.length}, 1fr)">${cells}</div>
            ${hideName ? '' : `<span class="gb-name">${label}</span>`}
            <span class="gb-pm">${pmDisplay} PM</span>
            <div class="gb-handle gb-h-right gb-month-resize" data-handle="right" title="Arrastar para alterar data de fim"></div>`;
        } else {
          const compactLabel = ganttView.unit === 'h' ? `${round2(hRange)}h` : `${pmDisplay} PM`;
          barInner = `<div class="gb-handle gb-h-left" data-handle="left"></div>
            ${hideName ? '' : `<span class="gb-name">${label}</span>`}
            <span class="gb-pm">${compactLabel}</span>
            <div class="gb-handle gb-h-right" data-handle="right"></div>`;
        }

        html += `<div class="gantt-row"><div class="gantt-label">${r.project}${r.wp ? ' · ' + r.wp : ''}</div>
          <div class="gantt-track" data-worker="${safeWr}" style="--cols:${nCols}">
            <div class="gantt-bar" data-id="${r.id}" style="left:${left}%; width:${width}%; background:${colorFor(r.project)}" title="${tip.replace(/"/g,'&quot;')}">
              ${barInner}
            </div>
          </div>
        </div>`;
      }
    }
    html += '</div>';
    document.getElementById('gantt-wrap').innerHTML = html;
    if (isMonthly) {
      bindMonthlyInputs(draw);
      document.querySelectorAll('#gantt-wrap .gantt-bar').forEach(bar => {
        attachBarInteractions(bar, ymsRange, null, draw); // enables right-resize via gb-month-resize
        bar.addEventListener('click', e => {
          if (e.target.closest('input, .gb-month-cell, .gb-month-resize')) return;
          const rec = state.records.find(x => x.id === bar.dataset.id);
          if (rec) openModal(rec);
        });
      });
    } else {
      document.querySelectorAll('#gantt-wrap .gantt-bar').forEach(bar => {
        attachBarInteractions(bar, ymsRange, null, draw);
      });
    }

    // ── Drag-to-create (#5): arrastar na área vazia cria nova alocação ──
    if (!isMonthly) {
      setupGanttDragCreate(ymsRange, nCols);
    }
  };
  draw();

  // Bind inputs de range
  fromInput.onchange = () => {
    if (!fromInput.value) return;
    ganttRange.from = fromInput.value;
    if (ganttRange.from > ganttRange.to) {
      ganttRange.to = ganttRange.from;
      toInput.value = ganttRange.to;
    }
    draw();
  };
  toInput.onchange = () => {
    if (!toInput.value) return;
    ganttRange.to = toInput.value;
    if (ganttRange.to < ganttRange.from) {
      ganttRange.from = ganttRange.to;
      fromInput.value = ganttRange.from;
    }
    draw();
  };

  // Atalhos rápidos
  quickSel.onchange = () => {
    const v = quickSel.value;
    if (!v) return;
    const now = new Date();
    const thisYM = ymKey(now.getFullYear(), now.getMonth() + 1);
    if (v === 'next-12') {
      ganttRange.from = thisYM;
      ganttRange.to = ymAddMonths(thisYM, 11);
    } else if (v === 'next-6') {
      ganttRange.from = thisYM;
      ganttRange.to = ymAddMonths(thisYM, 5);
    } else if (v === 'ytd') {
      ganttRange.from = ymKey(now.getFullYear(), 1);
      ganttRange.to = ymKey(now.getFullYear(), 12);
    }
    fromInput.value = ganttRange.from;
    toInput.value = ganttRange.to;
    quickSel.value = '';
    draw();
  };

  function bindMs(containerId, kind) {
    document.querySelectorAll('#' + containerId + ' input[type="checkbox"]').forEach(cb => {
      cb.onchange = () => {
        ganttFilters[kind === 'workers' ? 'workers' : 'projects'] = readMultiSelect(containerId);
        const total = kind === 'workers' ? allWorkers.length : allProjects.length;
        updateMsSummary(containerId, total, kind);
        draw();
      };
    });
  }
  bindMs('gantt-workers', 'workers');
  bindMs('gantt-projects', 'projects');

  // Toggle "Mostrar mensais"
  const monthlyToggle = document.getElementById('gantt-show-monthly');
  monthlyToggle.checked = ganttView.mode === 'monthly';
  monthlyToggle.onchange = () => {
    ganttView.mode = monthlyToggle.checked ? 'monthly' : 'compact';
    draw();
  };

  // Segmented unit toggle (PM / Horas)
  const unitSeg = document.getElementById('gantt-unit-seg');
  unitSeg.querySelectorAll('button').forEach(b => {
    b.classList.toggle('active', b.dataset.unit === ganttView.unit);
    b.onclick = () => {
      if (b.dataset.unit === ganttView.unit) return;
      ganttView.unit = b.dataset.unit;
      unitSeg.querySelectorAll('button').forEach(x => x.classList.toggle('active', x.dataset.unit === ganttView.unit));
      draw();
    };
  });
}

// Comportamento global do multi-select (toggle do painel + Todos/Nenhum)
document.addEventListener('click', (e) => {
  // Toggle abrir/fechar
  const trigger = e.target.closest('.ms-trigger');
  if (trigger) {
    const ms = trigger.closest('.multiselect');
    const wasOpen = ms.classList.contains('open');
    document.querySelectorAll('.multiselect.open').forEach(x => x.classList.remove('open'));
    if (!wasOpen) ms.classList.add('open');
    return;
  }
  // Botões Todos / Nenhum
  const allBtn = e.target.closest('.ms-all');
  const noneBtn = e.target.closest('.ms-none');
  if (allBtn || noneBtn) {
    const ms = e.target.closest('.multiselect');
    const checked = !!allBtn;
    ms.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.checked = checked;
      cb.dispatchEvent(new Event('change'));
    });
    return;
  }
  // Click fora -> fechar
  if (!e.target.closest('.multiselect')) {
    document.querySelectorAll('.multiselect.open').forEach(x => x.classList.remove('open'));
  }
});

// Limpar filtros
document.getElementById('gantt-clear-filters').onclick = () => {
  ganttFilters.workers = null;
  ganttFilters.projects = null;
  renderGantt();
};

