// ════════════════════════════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════════════════════════════
const state = {
  workers: [],
  projects: [],
  records: [],      // {id, team, worker, project, wp, task, start, end, totalHours, monthsHours, updatedAt}
  capacity: {},     // {worker: {YYYY-MM: hours}}
  absences: {},     // {worker: {YYYY-MM: {hours, reason}}} — horas deduzidas da capacidade
  defaultCapacity: 140,
  overloadThreshold: 110, // percentage — cells above this are red
  warnThreshold: 95,      // percentage — cells between warn and overload are amber
  riskHorizonMonths: 3,   // months ahead to check for gap risk in dashboard
  lastSyncBaseline: null,  // {timestamp, recordsById: {id: {hash, updatedAt}}} - estado no último sync
  editorInitials: '',      // iniciais do autor (persistente, usadas no nome dos ficheiros)
  planSnapshots: null,     // null = not loaded yet; array once loaded
  changelog: [],           // últimas 200 entradas do diário de alterações
  sessions: [],            // historial de sessões (últimas 100)
  _undoStack: [],          // snapshots para undo (máx 20, apenas em memória)
  _lastSavedAt: null,      // ISO timestamp do último save bem-sucedido
  _remoteSha: null,        // SHA do ficheiro remoto na última leitura (para conflict detection)
};


// ════════════════════════════════════════════════════════════════════════
// PERSISTENCE — Supabase REST API
// ════════════════════════════════════════════════════════════════════════
// Supabase project URL + anon key hardcoded — dados em tabela app_state
// project_id separa dados de diferentes aplicações na mesma base de dados

const SB = {
  url:       'https://milzbgsbxshfhkyxkpvt.supabase.co',
  anonKey:   'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pbHpiZ3NieHNoZmhreXhrcHZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNTQzNjUsImV4cCI6MjA5NTYzMDM2NX0.n5l2JCXBdxZiqFXLSERgPldJoiLyjy1tm4OKorIlwfw',
  projectId: 'team-planning-processos',
  table:     'app_state',

  headers(extra = {}) {
    return {
      'Content-Type': 'application/json',
      'apikey': this.anonKey,
      'Authorization': `Bearer ${this.anonKey}`,
      ...extra,
    };
  },

  isConfigured() { return !this.url.includes('YOUR_PROJECT'); },

  // Lê a linha do projeto e captura a versão para conflict detection
  async readFile() {
    const url = `${this.url}/rest/v1/${this.table}?project_id=eq.${encodeURIComponent(this.projectId)}&select=data,version`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`Supabase read ${res.status}: ${await res.text()}`);
    const rows = await res.json();
    if (!rows.length) { state._remoteSha = null; return null; }
    state._remoteSha = String(rows[0].version);
    return rows[0].data;
  },

  // Verifica a versão remota atual (sem carregar o conteúdo completo)
  async fetchRemoteSha() {
    try {
      const url = `${this.url}/rest/v1/${this.table}?project_id=eq.${encodeURIComponent(this.projectId)}&select=version`;
      const res = await fetch(url, { headers: this.headers() });
      if (!res.ok) return null;
      const rows = await res.json();
      return rows.length ? String(rows[0].version) : null;
    } catch (_) { return null; }
  },

  async writeFile(data, _message, force = false) {
    // Conflict detection: verificar se a versão mudou desde o último read
    if (!force && state._remoteSha) {
      const currentSha = await this.fetchRemoteSha();
      if (currentSha && currentSha !== state._remoteSha) {
        await showConflictModal(data, _message);
        return 'conflict';
      }
    }

    const nextVersion = state._remoteSha ? parseInt(state._remoteSha, 10) + 1 : 1;
    const payload = JSON.stringify({
      data,
      version: nextVersion,
      updated_at: new Date().toISOString(),
    });

    // PATCH updates the existing row; POST inserts on first run (no row yet)
    const rowExists = !!state._remoteSha;
    const res = rowExists
      ? await fetch(`${this.url}/rest/v1/${this.table}?project_id=eq.${encodeURIComponent(this.projectId)}`, {
          method: 'PATCH',
          headers: this.headers({ 'Prefer': 'return=representation' }),
          body: payload,
        })
      : await fetch(`${this.url}/rest/v1/${this.table}`, {
          method: 'POST',
          headers: this.headers({ 'Prefer': 'return=representation' }),
          body: JSON.stringify({ project_id: this.projectId, data, version: nextVersion, updated_at: new Date().toISOString() }),
        });

    if (res.status === 403) {
      throw new Error('[HTTP 403] Permissões insuficientes — verifica a anon key do Supabase.');
    }
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const errMsg = Array.isArray(errBody) ? errBody[0]?.message : (errBody.message || errBody.error);
      throw new Error(`[HTTP ${res.status}] ${errMsg || 'Supabase write failed'}`);
    }

    // Actualizar SHA local com a versão confirmada pelo servidor
    try {
      const result = await res.json();
      const row = Array.isArray(result) ? result[0] : result;
      if (row?.version) state._remoteSha = String(row.version);
      else {
        const newSha = await this.fetchRemoteSha();
        if (newSha) state._remoteSha = newSha;
      }
    } catch (_) { /* não bloquear o save se este fetch falhar */ }
    return 'ok';
  },
};

const APP_ID = 'team-planning';

// Serialização de saves: apenas um save ativo de cada vez.
// Se chegar outro pedido durante um save, guarda-se novamente logo depois.
let _saveInProgress = false;
let _saveQueued     = false;

async function saveState(force = false) {
  if (!SB.isConfigured()) return 'not_configured';

  // Se já há um save em curso, marcar para re-save e sair
  if (_saveInProgress) {
    _saveQueued = true;
    return 'queued';
  }
  _saveInProgress = true;

  let result;
  try {
    result = await _saveStateOnce(force);
  } finally {
    _saveInProgress = false;
    // Se ocorreram alterações enquanto guardávamos, guardar de novo
    if (_saveQueued) {
      _saveQueued = false;
      setTimeout(() => saveState(), 100);
    }
  }
  return result;
}

async function _saveStateOnce(force = false) {
  updateSyncIndicator('saving');
  // Guardar snapshot para undo antes de qualquer write
  pushUndoSnapshot();
  try {
    const now = new Date().toISOString();
    for (const r of state.records) if (!r.updatedAt) r.updatedAt = now;
    const result = await SB.writeFile({
      workers:   state.workers,
      projects:  state.projects,
      records:   state.records,
      capacity:  state.capacity,
      absences:  state.absences  || {},
      config: {
        editorInitials:   state.editorInitials   || '',
        lastSyncBaseline: state.lastSyncBaseline || null,
        plan_snapshots:   state.planSnapshots    || [],
        overloadThreshold: state.overloadThreshold ?? 110,
        warnThreshold:     state.warnThreshold     ?? 95,
        riskHorizonMonths: state.riskHorizonMonths ?? 3,
        defaultCapacity:   state.defaultCapacity   ?? 140,
      },
      changelog: (state.changelog || []).slice(0, 200),
      sessions:  (state.sessions  || []).slice(0, 100),
    }, null, force);
    if (result === 'conflict') {
      updateSyncIndicator('conflict');
      return 'conflict';
    }
    state._lastSavedAt = Date.now();
    _lastSaveError = '';
    // Esconder banner de reauth se estava visível (save voltou a funcionar)
    const _rb = document.getElementById('reauth-banner');
    if (_rb) _rb.style.display = 'none';
    updateSyncIndicator('ok');
    return 'ok';
  } catch (e) {
    _lastSaveError = e.message || 'Erro desconhecido';
    console.error('Erro a guardar no Supabase:', e);
    if (_lastSaveError.includes('[HTTP 403]')) {
      // Scope insuficiente — mostrar banner persistente a pedir re-login
      const rb = document.getElementById('reauth-banner');
      if (rb) rb.style.display = 'flex';
      toast('Permissões insuficientes — faz Sair e Entrar novamente', 'error');
    } else {
      const msg = e.message ? `Erro ao guardar: ${e.message}` : 'Erro ao guardar no Supabase';
      toast(msg, 'error');
    }
    updateSyncIndicator('error');
    return 'error';
  }
}



async function loadState() {
  if (!SB.isConfigured()) return false;
  try {
    const data = await SB.readFile();
    if (!data || !data.workers || data.workers.length === 0) return false;

    state.workers   = data.workers  || [];
    state.projects  = data.projects || [];
    state.records   = (data.records || []).map(r => ({
      id:          r.id,
      team:        r.team,
      worker:      r.worker,
      project:     r.project,
      wp:          r.wp,
      task:        r.task,
      start:       r.start_date  ?? r.start,
      end:         r.end_date    ?? r.end,
      totalHours:  r.total_hours ?? r.totalHours,
      monthsHours: r.months_hours ?? r.monthsHours ?? {},
      updatedAt:   r.updated_at  ?? r.updatedAt,
    }));
    state.capacity  = data.capacity || {};
    state.absences  = data.absences || {};
    const cfg = data.config || {};
    state.editorInitials   = cfg.editorInitials   || '';
    state.lastSyncBaseline = cfg.lastSyncBaseline || null;
    state.planSnapshots    = cfg.plan_snapshots   || [];
    state.overloadThreshold = cfg.overloadThreshold ?? 110;
    state.warnThreshold     = cfg.warnThreshold     ?? 95;
    state.riskHorizonMonths = cfg.riskHorizonMonths ?? 3;
    state.defaultCapacity   = cfg.defaultCapacity   ?? 140;
    state.changelog        = data.changelog       || [];
    state.sessions         = data.sessions        || [];
    return true;
  } catch (e) {
    console.error('loadState error:', e);
    toast('Erro ao carregar dados do Supabase', 'error');
  }
  return false;
}

async function seedFromExcel() {
  state.workers   = [...SEED_DATA.workers];
  state.projects  = [...SEED_DATA.projects];
  state.capacity  = {...SEED_DATA.capacityByWorker};
  state.records   = SEED_DATA.records.map((r, i) => ({ id: `rec_${Date.now()}_${i}`, ...r }));
  await saveState();
}

// ════════════════════════════════════════════════════════════════════════
// UNDO (#10)
// ════════════════════════════════════════════════════════════════════════
function pushUndoSnapshot() {
  try {
    const snap = JSON.stringify({
      workers:  state.workers,
      projects: state.projects,
      records:  state.records,
      capacity: state.capacity,
      absences: state.absences || {},
    });
    state._undoStack.push(snap);
    if (state._undoStack.length > 20) state._undoStack.shift();
    document.getElementById('btn-undo').classList.add('active');
  } catch (_) {}
}

async function undoLast() {
  if (!state._undoStack.length) return;
  if (!confirm('Desfazer a última ação? Os dados serão revertidos para o estado anterior.')) return;
  try {
    const snap = JSON.parse(state._undoStack.pop());
    state.workers  = snap.workers;
    state.projects = snap.projects;
    state.records  = snap.records;
    state.capacity = snap.capacity;
    state.absences = snap.absences || {};
    // Guardar sem empurrar novo snapshot para não criar loop
    const origPush = pushUndoSnapshot;
    // eslint-disable-next-line no-global-assign
    window._skipUndoPush = true;
    await saveStateDirect();
    window._skipUndoPush = false;
    renderView(currentView());
    toast('Ação desfeita');
    if (!state._undoStack.length) document.getElementById('btn-undo').classList.remove('active');
  } catch (e) {
    toast('Erro ao desfazer', 'error');
  }
}

// saveState sem push de undo (usado pelo undo para evitar loop)
async function saveStateDirect() {
  if (!SB.isConfigured()) return;
  updateSyncIndicator('saving');
  try {
    const now = new Date().toISOString();
    for (const r of state.records) if (!r.updatedAt) r.updatedAt = now;
    await SB.writeFile({
      workers:   state.workers,
      projects:  state.projects,
      records:   state.records,
      capacity:  state.capacity,
      absences:  state.absences  || {},
      config: {
        editorInitials:   state.editorInitials   || '',
        lastSyncBaseline: state.lastSyncBaseline || null,
        plan_snapshots:   state.planSnapshots    || [],
        overloadThreshold: state.overloadThreshold ?? 110,
        warnThreshold:     state.warnThreshold     ?? 95,
        riskHorizonMonths: state.riskHorizonMonths ?? 3,
        defaultCapacity:   state.defaultCapacity   ?? 140,
      },
      changelog: (state.changelog || []).slice(0, 200),
      sessions:  (state.sessions  || []).slice(0, 100),
    }, null, true);
    state._lastSavedAt = Date.now();
    updateSyncIndicator('ok');
  } catch (e) {
    toast('Erro a guardar', 'error');
    updateSyncIndicator('error');
  }
}
