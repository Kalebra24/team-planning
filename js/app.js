// ════════════════════════════════════════════════════════════════════════
// AUTO-REFRESH (#2)
// ════════════════════════════════════════════════════════════════════════
let _autoRefreshPending = null;

async function checkRemoteChanges() {
  if (!SB.isConfigured() || !state._remoteSha) return;
  try {
    const currentSha = await SB.fetchRemoteSha();
    if (currentSha && currentSha !== state._remoteSha) {
      // Há alterações remotas — carregar dados novos mas não aplicar ainda
      const remoteData = await SB.readFile();
      if (remoteData) {
        _autoRefreshPending = remoteData;
        document.getElementById('refresh-banner').classList.add('show');
      }
    }
  } catch (_) { /* ignorar erros de rede silenciosamente */ }
}

function applyRemoteRefresh() {
  if (!_autoRefreshPending) return;
  const data = _autoRefreshPending;
  _autoRefreshPending = null;
  document.getElementById('refresh-banner').classList.remove('show');
  // Aplicar dados remotos (mesma lógica que loadState mas sem re-fetch)
  state.workers   = data.workers  || [];
  state.projects  = data.projects || [];
  state.records   = (data.records || []).map(r => ({
    id: r.id, team: r.team, worker: r.worker, project: r.project,
    wp: r.wp, task: r.task,
    start: r.start_date ?? r.start, end: r.end_date ?? r.end,
    totalHours: r.total_hours ?? r.totalHours,
    monthsHours: r.months_hours ?? r.monthsHours ?? {},
    updatedAt: r.updated_at ?? r.updatedAt,
  }));
  state.capacity  = data.capacity || {};
  state.absences  = data.absences || {};
  const cfg = data.config || {};
  state.planSnapshots = cfg.plan_snapshots || [];
  state.changelog = data.changelog || [];
  state.sessions  = data.sessions  || [];
  renderView(currentView());
  renderEquipa();
  toast('Dados actualizados');
}

// Poll a cada 2 minutos
setInterval(checkRemoteChanges, 120000);

// ════════════════════════════════════════════════════════════════════════
// CONFLICT MODAL (#1)
// ════════════════════════════════════════════════════════════════════════
let _conflictPendingData = null;
let _conflictPendingMsg = null;

async function showConflictModal(data, message) {
  _conflictPendingData = data;
  _conflictPendingMsg = message;
  const localCount = (data.records || []).length;
  const remoteData = _autoRefreshPending || await SB.readFile().catch(() => null);
  const remoteCount = (remoteData?.records || []).length;
  document.getElementById('conflict-diff').innerHTML = `
    <div>Versão local: <strong>${localCount}</strong> alocações</div>
    <div>Versão remota: <strong>${remoteCount}</strong> alocações</div>
    <div style="margin-top:8px; color:var(--ink-faint); font-size:11px">O ficheiro foi alterado por outro utilizador após o teu último carregamento.</div>
  `;
  document.getElementById('modal-conflict').classList.add('active');
}

document.getElementById('modal-conflict-close').onclick = () =>
  document.getElementById('modal-conflict').classList.remove('active');

document.getElementById('conflict-overwrite').onclick = async () => {
  document.getElementById('modal-conflict').classList.remove('active');
  if (!_conflictPendingData) return;
  updateSyncIndicator('saving');
  try {
    await SB.writeFile(_conflictPendingData, _conflictPendingMsg, true); // force=true
    state._lastSavedAt = Date.now();
    updateSyncIndicator('ok');
    toast('Guardado (sobrescrito)');
  } catch (e) {
    toast('Erro ao guardar', 'error');
  }
  _conflictPendingData = null; _conflictPendingMsg = null;
};

document.getElementById('conflict-reload').onclick = () => {
  document.getElementById('modal-conflict').classList.remove('active');
  _conflictPendingData = null; _conflictPendingMsg = null;
  applyRemoteRefresh();
};


// ════════════════════════════════════════════════════════════════════════
// AUSÊNCIAS (#4)
// ════════════════════════════════════════════════════════════════════════
function renderAbsences() {
  const sel = document.getElementById('abs-worker');
  if (sel) {
    const cur = sel.value;
    sel.innerHTML = '<option value="">— selecionar —</option>' +
      state.workers.map(w => `<option ${w === cur ? 'selected' : ''}>${w}</option>`).join('');
  }
  const list = document.getElementById('abs-list');
  if (!list) return;
  const absences = state.absences || {};
  const chips = [];
  for (const [worker, months] of Object.entries(absences)) {
    for (const [ym, info] of Object.entries(months)) {
      chips.push({ worker, ym, ...info });
    }
  }
  chips.sort((a, b) => (a.worker + a.ym).localeCompare(b.worker + b.ym));
  if (!chips.length) {
    list.innerHTML = '<div style="color:var(--ink-faint); font-size:12px; padding:8px 0">Sem ausências registadas.</div>';
    return;
  }
  list.innerHTML = chips.map(c => `
    <div class="absence-chip">
      <span><strong>${c.worker}</strong> · ${ymLabel(c.ym)} · −${c.hours}h${c.reason ? ` (${c.reason})` : ''}</span>
      <button class="x" onclick="removeAbsence('${c.worker.replace(/'/g,"\\'")}','${c.ym}')" title="Remover">×</button>
    </div>
  `).join('');
}

window.addAbsence = async () => {
  if (!guardEdit()) return;
  const worker = document.getElementById('abs-worker').value;
  const ym = document.getElementById('abs-month').value;
  const hours = parseFloat(document.getElementById('abs-hours').value);
  const reason = document.getElementById('abs-reason').value.trim();
  if (!worker) { toast('Seleciona uma pessoa', 'error'); return; }
  if (!ym) { toast('Seleciona um mês', 'error'); return; }
  if (isNaN(hours) || hours <= 0) { toast('Indica horas válidas (> 0)', 'error'); return; }
  if (!state.absences) state.absences = {};
  if (!state.absences[worker]) state.absences[worker] = {};
  state.absences[worker][ym] = { hours, reason };
  await saveState();
  renderEquipa();   // re-render completo: actualiza tabela de capacidade + lista de ausências
  toast(`Ausência registada — ${worker} em ${ymLabel(ym)}`);
};

window.removeAbsence = async (worker, ym) => {
  if (!guardEdit()) return;
  if (state.absences?.[worker]) {
    delete state.absences[worker][ym];
    if (!Object.keys(state.absences[worker]).length) delete state.absences[worker];
  }
  await saveState();
  renderEquipa();   // re-render completo: actualiza tabela de capacidade + lista de ausências
  renderView(currentView() !== 'equipa' ? currentView() : 'equipa');
  toast('Ausência removida');
};


// ════════════════════════════════════════════════════════════════════════
// DRAG-TO-CREATE NO GANTT (#5)
// ════════════════════════════════════════════════════════════════════════
// Implementado via listener nos row-spacers do gantt-wrap (ver renderGantt)
// A flag abaixo é usada pelo renderGantt para injectar a zona de criação
const GANTT_DRAG_CREATE = true;

function currentView() {
  return document.querySelector('#tabs button.active').dataset.view;
}

// ════════════════════════════════════════════════════════════════════════
// MENU DADOS (dropdown)
// ════════════════════════════════════════════════════════════════════════
document.getElementById('btn-data-menu').onclick = (e) => {
  e.stopPropagation();
  document.querySelector('.data-menu').classList.toggle('open');
};
document.addEventListener('click', (e) => {
  const menu = document.querySelector('.data-menu');
  if (menu && menu.classList.contains('open') && !e.target.closest('.data-menu')) {
    menu.classList.remove('open');
  }
});
// Fechar menu ao clicar num item (todos os dm-item)
document.querySelectorAll('.dm-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelector('.data-menu').classList.remove('open');
  });
});

document.getElementById('btn-show-changelog').onclick = () => showChangelogModal(null, sessionCtx.initials);
document.getElementById('btn-checkin').onclick = checkIn;
document.getElementById('btn-export-report').onclick = exportMonthlyReport;

// Ctrl+Z global para undo
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    const active = document.activeElement;
    // Só ativar se não estiver a editar um campo de texto
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) return;
    e.preventDefault();
    undoLast();
  }
});

// ════════════════════════════════════════════════════════════════════════
// TOAST
// ════════════════════════════════════════════════════════════════════════
function toast(msg, kind='ok') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + (kind === 'error' ? 'error' : '');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ════════════════════════════════════════════════════════════════════════
// HELP MODAL
// ════════════════════════════════════════════════════════════════════════
function helpGo(id) {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // highlight active nav link
    document.querySelectorAll('.help-nav a').forEach(a => a.classList.remove('hn-active'));
    const active = [...document.querySelectorAll('.help-nav a')]
      .find(a => a.getAttribute('onclick')?.includes(id));
    if (active) active.classList.add('hn-active');
  }
}

(function wireHelp() {
  const modal   = document.getElementById('modal-help');
  const content = document.getElementById('help-content');

  document.getElementById('btn-help').onclick = () => modal.classList.add('active');
  document.getElementById('modal-help-close').onclick = () => modal.classList.remove('active');
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('active'); });

  // Highlight nav on scroll
  if (content) {
    content.addEventListener('scroll', () => {
      const headers = content.querySelectorAll('h2[id]');
      let current = null;
      headers.forEach(h => {
        if (h.offsetTop - content.scrollTop <= 40) current = h.id;
      });
      document.querySelectorAll('.help-nav a').forEach(a => {
        const match = a.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
        a.classList.toggle('hn-active', match === current);
      });
    });
  }
})();

// ════════════════════════════════════════════════════════════════════════
// CHANGELOG MODAL WIRING
// ════════════════════════════════════════════════════════════════════════
document.getElementById('modal-changelog-close').onclick = () =>
  document.getElementById('modal-changelog').classList.remove('active');
document.getElementById('btn-changelog-ok').onclick = () =>
  document.getElementById('modal-changelog').classList.remove('active');
document.getElementById('modal-changelog').addEventListener('click', e => {
  if (e.target.id === 'modal-changelog') document.getElementById('modal-changelog').classList.remove('active');
});

// ════════════════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════════════════
(async function init() {
  // 1. Tratar callback OAuth (código na URL após redirect do GitLab)
  if (new URLSearchParams(window.location.search).has('code')) {
    const ok = await OAUTH.handleCallback();
    if (!ok) { toast('Erro no login GitLab', 'error'); }
  }

  // 2. Carregar dados
  updateSyncIndicator('saving');
  const had = await loadState();
  if (!had) {
    await seedFromExcel();
    toast('Dados iniciais carregados');
  }
  state._lastSavedAt = Date.now();
  updateSyncIndicator('ok');

  // 3. Auto-login se já houver token OAuth válido
  if (!sessionCtx.checkedIn) {
    const user = await OAUTH.getUser();
    if (user) await doCheckIn(user.username, user.name);
  }

  updateCheckinUI();
  renderDashboard();
})();
