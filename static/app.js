/* ==========================================
   SEO Cikk Generáló – Frontend logika v5 (pipeline)
   ========================================== */

// Állapot
const state = {
  rows: [],
  columns: [],
  jobId: null,
  isGenerating: false,
  eventSource: null,
  toneGuideEditing: false,
  pipelineVersions: [],
  previewingPipelineVersion: null
};

// Megjelenítendő oszlopok a táblázatban (szerkeszthető)
const DISPLAY_COLUMNS = [
  { key: 'cikk_cim',           label: 'Cikk cím',          width: '200px', type: 'textarea' },
  { key: 'ceg_url',            label: 'Cég URL',            width: '140px', type: 'input' },
  { key: 'link_1_kulcsszo',    label: 'Link 1 kulcsszó',   width: '130px', type: 'input' },
  { key: 'link_1_url',         label: 'Link 1 URL',         width: '140px', type: 'input' },
  { key: 'link_2_kulcsszo',    label: 'Link 2 kulcsszó',   width: '130px', type: 'input' },
  { key: 'link_2_url',         label: 'Link 2 URL',         width: '140px', type: 'input' },
  { key: 'link_3_kulcsszo',    label: 'Link 3 kulcsszó',   width: '130px', type: 'input' },
  { key: 'link_3_url',         label: 'Link 3 URL',         width: '140px', type: 'input' },
  { key: 'link_4_kulcsszo',    label: 'Link 4 kulcsszó',   width: '130px', type: 'input' },
  { key: 'link_4_url',         label: 'Link 4 URL',         width: '140px', type: 'input' },
  { key: 'link_5_kulcsszo',    label: 'Link 5 kulcsszó',   width: '130px', type: 'input' },
  { key: 'link_5_url',         label: 'Link 5 URL',         width: '140px', type: 'input' },
  { key: 'korabbi_cikk_url_1', label: 'Korábbi cikk 1',    width: '140px', type: 'input' },
  { key: 'korabbi_cikk_url_2', label: 'Korábbi cikk 2',    width: '140px', type: 'input' },
  { key: 'megjegyzes',         label: 'Megjegyzés',         width: '160px', type: 'textarea' },
];

// ==========================================
// INICIALIZÁLÁS
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  setupUploadZone();
  setupFileInput();
  setupGenerateButton();
  setupAddRowButton();
  loadPipeline();
  loadToneGuide();
  loadPipelineVersions();
});

// ==========================================
// FELTÖLTÉSI ZÓNA
// ==========================================
function setupUploadZone() {
  const zone = document.getElementById('uploadZone');
  const input = document.getElementById('fileInput');

  zone.addEventListener('click', () => input.click());

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragover');
  });

  zone.addEventListener('dragleave', () => {
    zone.classList.remove('dragover');
  });

  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  });
}

function setupFileInput() {
  const input = document.getElementById('fileInput');
  input.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFileUpload(file);
  });
}

async function handleFileUpload(file) {
  if (!file.name.endsWith('.xlsx')) {
    showToast('Csak .xlsx fájl tölthető fel!', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('file', file);

  showUploadLoading(true);

  try {
    const res = await fetch('/upload', { method: 'POST', body: formData });
    const data = await res.json();

    if (data.error) {
      showToast(data.error, 'error');
      showUploadLoading(false);
      return;
    }

    state.columns = data.columns;
    state.rows = data.rows.map(row => ({
      ...row,
      status: 'Várakozik',
      message: ''
    }));

    showUploadSuccess(file.name, state.rows.length);
    renderTable();
    showSection('tableSection');
    hideSection('progressSection');
    hideSection('downloadSection');
    updateStats();

    showToast(`${state.rows.length} sor sikeresen betöltve`, 'success');
  } catch (err) {
    showToast('Hiba a feltöltés során: ' + err.message, 'error');
    showUploadLoading(false);
  }
}

function showUploadLoading(show) {
  const zone = document.getElementById('uploadZone');
  if (show) {
    zone.innerHTML = `<span class="upload-icon">⏳</span><p>Feldolgozás...</p>`;
  } else {
    resetUploadZone();
  }
}

function showUploadSuccess(filename, count) {
  const successDiv = document.getElementById('uploadSuccess');
  successDiv.innerHTML = `
    <span>✅</span>
    <span><strong>${filename}</strong> sikeresen feltöltve – <strong>${count} sor</strong> betöltve</span>
    <button class="btn btn-secondary btn-sm" onclick="resetUpload()">Másik fájl</button>
  `;
  successDiv.style.display = 'flex';
  resetUploadZone();
}

function resetUploadZone() {
  const zone = document.getElementById('uploadZone');
  zone.innerHTML = `
    <span class="upload-icon">📂</span>
    <p>Húzd ide az Excel fájlt, vagy kattints a feltöltéshez</p>
    <p class="hint">Csak .xlsx formátum támogatott</p>
    <button class="btn-upload" onclick="document.getElementById('fileInput').click()">Fájl kiválasztása</button>
  `;
}

function resetUpload() {
  document.getElementById('uploadSuccess').style.display = 'none';
  document.getElementById('fileInput').value = '';
  state.rows = [];
  state.columns = [];
  hideSection('tableSection');
  hideSection('progressSection');
  hideSection('downloadSection');
}

// ==========================================
// TÁBLÁZAT MEGJELENÍTÉS
// ==========================================
function renderTable() {
  const thead = document.getElementById('tableHead');
  const tbody = document.getElementById('tableBody');

  thead.innerHTML = `
    <tr>
      <th style="width:40px">#</th>
      ${DISPLAY_COLUMNS.map(col => `<th style="min-width:${col.width}">${col.label}</th>`).join('')}
      <th style="min-width:130px">Státusz</th>
      <th style="width:40px"></th>
    </tr>
  `;

  renderTableRows();
}

function renderTableRows() {
  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = '';

  state.rows.forEach((row, idx) => {
    const tr = document.createElement('tr');
    tr.id = `row-${idx}`;

    let cells = `<td style="color:#718096;font-weight:600;text-align:center">${idx + 1}</td>`;

    DISPLAY_COLUMNS.forEach(col => {
      const value = row[col.key] || '';
      if (col.type === 'textarea') {
        cells += `<td>
          <textarea class="editable" rows="2"
            data-row="${idx}" data-col="${col.key}"
            onchange="updateCell(${idx}, '${col.key}', this.value)"
          >${escapeHtml(value)}</textarea>
        </td>`;
      } else {
        cells += `<td>
          <input type="text" class="editable"
            data-row="${idx}" data-col="${col.key}"
            value="${escapeHtml(value)}"
            onchange="updateCell(${idx}, '${col.key}', this.value)"
          />
        </td>`;
      }
    });

    cells += `<td>
      <div>${renderStatusBadge(row.status)}</div>
      ${row.message ? `<div class="status-message">${escapeHtml(row.message)}</div>` : ''}
    </td>`;

    cells += `<td>
      <button class="btn-row-delete" onclick="deleteRow(${idx})" title="Sor törlése">✕</button>
    </td>`;

    tr.innerHTML = cells;
    tbody.appendChild(tr);
  });
}

function renderStatusBadge(status) {
  const map = {
    'Várakozik':   { cls: 'status-waiting', icon: '○' },
    'Folyamatban': { cls: 'status-running', icon: '●' },
    'Kész':        { cls: 'status-done',    icon: '✓' },
    'Hiba':        { cls: 'status-error',   icon: '✕' },
  };
  const s = map[status] || map['Várakozik'];
  return `<span class="status-badge ${s.cls}"><span class="status-dot"></span>${status}</span>`;
}

function updateCell(rowIdx, colKey, value) {
  state.rows[rowIdx][colKey] = value;
}

function deleteRow(idx) {
  if (state.isGenerating) {
    showToast('Generálás közben nem törölhető sor', 'error');
    return;
  }
  state.rows.splice(idx, 1);
  renderTable();
  updateStats();
}

function addNewRow() {
  if (state.isGenerating) {
    showToast('Generálás közben nem adható hozzá sor', 'error');
    return;
  }
  const emptyRow = { status: 'Várakozik', message: '' };
  DISPLAY_COLUMNS.forEach(col => { emptyRow[col.key] = ''; });
  state.rows.push(emptyRow);
  renderTable();
  updateStats();

  const tbody = document.getElementById('tableBody');
  const lastRow = tbody.lastElementChild;
  if (lastRow) lastRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function setupAddRowButton() {
  const btn = document.getElementById('addRowBtn');
  if (btn) btn.addEventListener('click', addNewRow);
}

function updateStats() {
  const total = state.rows.length;
  const done = state.rows.filter(r => r.status === 'Kész').length;
  const errors = state.rows.filter(r => r.status === 'Hiba').length;
  const waiting = state.rows.filter(r => r.status === 'Várakozik').length;

  setEl('statTotal', total);
  setEl('statDone', done);
  setEl('statErrors', errors);
  setEl('statWaiting', waiting);
}

// ==========================================
// GENERÁLÁS
// ==========================================
function setupGenerateButton() {
  const btn = document.getElementById('startGenerationBtn');
  if (btn) btn.addEventListener('click', startGeneration);
}

async function startGeneration() {
  if (state.rows.length === 0) {
    showToast('Nincs feltöltött adat a generáláshoz', 'error');
    return;
  }

  if (state.isGenerating) {
    showToast('Generálás már folyamatban van', 'error');
    return;
  }

  state.rows.forEach(row => {
    if (row.status !== 'Kész') {
      row.status = 'Várakozik';
      row.message = '';
    }
  });
  renderTable();
  updateStats();

  const modelSelect = document.getElementById('modelSelect');
  const selectedModel = modelSelect ? modelSelect.value : 'gpt-5.4-mini';

  const btn = document.getElementById('startGenerationBtn');
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Generálás folyamatban...`;

  state.isGenerating = true;
  hideSection('downloadSection');
  showSection('progressSection');
  updateProgress(0, state.rows.length);

  try {
    const res = await fetch('/start-generation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: state.rows, model: selectedModel })
    });
    const data = await res.json();

    if (data.error) {
      showToast(data.error, 'error');
      resetGenerationButton();
      return;
    }

    state.jobId = data.job_id;
    listenToSSE(data.job_id);

  } catch (err) {
    showToast('Hiba a generálás indításakor: ' + err.message, 'error');
    resetGenerationButton();
  }
}

function listenToSSE(jobId) {
  if (state.eventSource) {
    state.eventSource.close();
  }

  const es = new EventSource(`/stream/${jobId}`);
  state.eventSource = es;

  es.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'row_update') {
      if (state.rows[data.row_index]) {
        state.rows[data.row_index].status = data.status;
        state.rows[data.row_index].message = data.message || '';
      }
      updateRowInTable(data.row_index);
      updateStats();
    }

    if (data.type === 'progress') {
      updateProgress(data.completed, data.total);
    }

    if (data.type === 'complete') {
      es.close();
      state.isGenerating = false;
      resetGenerationButton();
      updateStats();

      if (data.download_url) {
        showDownloadSection(data.download_url);
      }

      const done = state.rows.filter(r => r.status === 'Kész').length;
      showToast(`Generálás befejezve! ${done} cikk elkészült.`, 'success');
    }
  };

  es.onerror = () => {
    es.close();
    state.isGenerating = false;
    resetGenerationButton();
    showToast('Kapcsolat megszakadt a szerverrel', 'error');
  };
}

function updateRowInTable(rowIdx) {
  const row = state.rows[rowIdx];
  const tr = document.getElementById(`row-${rowIdx}`);
  if (!tr) return;

  const cells = tr.querySelectorAll('td');
  const statusCell = cells[cells.length - 2];
  if (statusCell) {
    statusCell.innerHTML = `
      <div>${renderStatusBadge(row.status)}</div>
      ${row.message ? `<div class="status-message">${escapeHtml(row.message)}</div>` : ''}
    `;
  }

  tr.style.background = row.status === 'Folyamatban' ? '#fffbeb' : '';
}

function updateProgress(completed, total) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const fill = document.getElementById('progressBarFill');
  const count = document.getElementById('progressCount');
  const text = document.getElementById('progressStatusText');

  if (fill) fill.style.width = pct + '%';
  if (count) count.textContent = `${completed} / ${total} cikk kész`;
  if (text) text.textContent = completed < total
    ? `Folyamatban... ${pct}% befejezve`
    : 'Minden cikk elkészült';
}

function resetGenerationButton() {
  const btn = document.getElementById('startGenerationBtn');
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = `▶ Generálás indítása`;
  }
}

// ==========================================
// LETÖLTÉS
// ==========================================
function showDownloadSection(downloadUrl) {
  const section = document.getElementById('downloadSection');
  const link = document.getElementById('downloadLink');
  if (link) link.href = downloadUrl;
  showSection('downloadSection');
  section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ==========================================
// PIPELINE PANEL – ACCORDION
// ==========================================
function togglePipelinePanel() {
  const panel = document.getElementById('pipelinePanel');
  const arrow = document.getElementById('pipelineAccordionArrow');
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  arrow.classList.toggle('open', !isOpen);
}

// ==========================================
// PIPELINE BETÖLTÉS
// ==========================================
async function loadPipeline() {
  try {
    const res = await fetch('/pipeline');
    const data = await res.json();
    renderPipelineSteps(data.steps || []);
  } catch (e) {
    console.error('Pipeline betöltési hiba:', e);
  }
}

async function loadPipelineVersions() {
  try {
    const res = await fetch('/pipeline/versions');
    const data = await res.json();
    state.pipelineVersions = data.versions || [];
    renderPipelineVersionSelect();
  } catch (e) {
    console.error('Pipeline verziók betöltési hiba:', e);
  }
}

function renderPipelineVersionSelect() {
  const sel = document.getElementById('pipelineVersionsSelect');
  if (!sel) return;
  sel.innerHTML = '<option value="">-- Válassz verziót --</option>';
  [...state.pipelineVersions].reverse().forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.version;
    opt.textContent = `v${v.version} – ${v.saved_at ? v.saved_at.replace('T', ' ') : ''}`;
    sel.appendChild(opt);
  });
}

function previewPipelineVersion(versionNum) {
  const btn = document.getElementById('restorePipelineBtn');
  if (!versionNum) {
    state.previewingPipelineVersion = null;
    if (btn) btn.style.display = 'none';
    loadPipeline();
    return;
  }
  const v = state.pipelineVersions.find(x => x.version == versionNum);
  if (v) {
    state.previewingPipelineVersion = versionNum;
    renderPipelineSteps(v.steps);
    if (btn) btn.style.display = 'inline-flex';
    showToast(`v${versionNum} előnézet – kattints Visszaállításra a mentéshez`, 'info');
  }
}

async function restorePipelineVersion() {
  if (!state.previewingPipelineVersion) return;
  try {
    const res = await fetch(`/pipeline/restore/${state.previewingPipelineVersion}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      state.previewingPipelineVersion = null;
      const btn = document.getElementById('restorePipelineBtn');
      if (btn) btn.style.display = 'none';
      const sel = document.getElementById('pipelineVersionsSelect');
      if (sel) sel.value = '';
      await loadPipeline();
      await loadPipelineVersions();
    }
  } catch (e) {
    showToast('Visszaállítási hiba', 'error');
  }
}

async function savePipeline() {
  const steps = collectPipelineStepsFromDOM();
  try {
    const res = await fetch('/pipeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ steps })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Pipeline sikeresen mentve!', 'success');
      await loadPipelineVersions();
    } else {
      showToast('Hiba: ' + (data.error || 'Ismeretlen hiba'), 'error');
    }
  } catch (e) {
    showToast('Mentési hiba', 'error');
  }
}

function collectPipelineStepsFromDOM() {
  const list = document.getElementById('pipelineStepsList');
  const stepEls = list.querySelectorAll('.pipeline-step');
  const steps = [];
  stepEls.forEach((el, i) => {
    steps.push({
      id: parseInt(el.dataset.stepId) || (i + 1),
      name: el.querySelector('.step-name-input').value,
      type: el.querySelector('.step-type-select').value,
      enabled: el.querySelector('.step-enabled-toggle').checked,
      prompt: el.querySelector('.step-prompt-textarea').value
    });
  });
  return steps;
}

// ==========================================
// PIPELINE LÉPÉSEK RENDERELÉS
// ==========================================
function renderPipelineSteps(steps) {
  const list = document.getElementById('pipelineStepsList');
  if (!list) return;
  list.innerHTML = '';
  steps.forEach((step, idx) => {
    const el = createStepElement(step, idx);
    list.appendChild(el);
  });
}

function createStepElement(step, idx) {
  const div = document.createElement('div');
  div.className = `pipeline-step type-step-${step.type}`;
  div.dataset.stepId = step.id;

  div.innerHTML = `
    <div class="step-header">
      <div class="step-header-left">
        <span class="step-number">${idx + 1}</span>
        <input type="text" class="step-name-input" value="${escapeHtml(step.name)}" placeholder="Lépés neve" />
        <select class="step-type-select">
          <option value="generate" ${step.type === 'generate' ? 'selected' : ''}>generate</option>
          <option value="check" ${step.type === 'check' ? 'selected' : ''}>check</option>
          <option value="fix" ${step.type === 'fix' ? 'selected' : ''}>fix</option>
        </select>
        <label class="toggle-label" title="Engedélyezve">
          <input type="checkbox" class="step-enabled-toggle" ${step.enabled ? 'checked' : ''} />
          <span class="toggle-text">${step.enabled ? 'Engedélyezve' : 'Letiltva'}</span>
        </label>
      </div>
      <div class="step-header-right">
        <button class="btn btn-secondary btn-xs" onclick="moveStepUp(this)" title="Fel">↑</button>
        <button class="btn btn-secondary btn-xs" onclick="moveStepDown(this)" title="Le">↓</button>
        <button class="btn btn-danger btn-xs" onclick="deleteStep(this)" title="Törlés">🗑</button>
      </div>
    </div>
    <div class="step-body">
      <textarea class="step-prompt-textarea" rows="8" placeholder="Prompt szövege...">${escapeHtml(step.prompt)}</textarea>
    </div>
  `;

  const toggle = div.querySelector('.step-enabled-toggle');
  const toggleText = div.querySelector('.toggle-text');
  toggle.addEventListener('change', () => {
    toggleText.textContent = toggle.checked ? 'Engedélyezve' : 'Letiltva';
  });

  const typeSelect = div.querySelector('.step-type-select');
  typeSelect.addEventListener('change', () => {
    div.className = `pipeline-step type-step-${typeSelect.value}`;
  });

  return div;
}

function addPipelineStep() {
  const list = document.getElementById('pipelineStepsList');
  const currentCount = list.querySelectorAll('.pipeline-step').length;
  const newStep = {
    id: Date.now(),
    name: 'Új lépés',
    type: 'check',
    enabled: true,
    prompt: ''
  };
  const el = createStepElement(newStep, currentCount);
  list.appendChild(el);
  el.scrollIntoView({ behavior: 'smooth' });
}

function moveStepUp(btn) {
  const step = btn.closest('.pipeline-step');
  const prev = step.previousElementSibling;
  if (prev) {
    step.parentNode.insertBefore(step, prev);
    renumberSteps();
  }
}

function moveStepDown(btn) {
  const step = btn.closest('.pipeline-step');
  const next = step.nextElementSibling;
  if (next) {
    step.parentNode.insertBefore(next, step);
    renumberSteps();
  }
}

function deleteStep(btn) {
  const step = btn.closest('.pipeline-step');
  if (confirm('Biztosan törlöd ezt a lépést?')) {
    step.remove();
    renumberSteps();
  }
}

function renumberSteps() {
  const list = document.getElementById('pipelineStepsList');
  const steps = list.querySelectorAll('.pipeline-step');
  steps.forEach((el, i) => {
    el.querySelector('.step-number').textContent = i + 1;
  });
}

// ==========================================
// VÁLTOZÓK SÚGÓ
// ==========================================
async function toggleVariablesPanel() {
  const panel = document.getElementById('variablesPanel');
  const isOpen = panel.style.display !== 'none';

  if (isOpen) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';

  const content = document.getElementById('variablesContent');
  if (content && content.textContent.trim() === 'Betöltés...') {
    try {
      const res = await fetch('/variables');
      const data = await res.json();
      renderVariables(data);
    } catch (e) {
      content.textContent = 'Hiba a változók betöltésekor';
    }
  }
}

function renderVariables(data) {
  const container = document.getElementById('variablesContent');
  let html = '';
  for (const [group, vars] of Object.entries(data)) {
    html += `<div class="var-group"><h4>${escapeHtml(group)}</h4><table class="var-table">`;
    for (const [name, desc] of Object.entries(vars)) {
      html += `<tr><td><code>${escapeHtml(name)}</code></td><td>${escapeHtml(desc)}</td></tr>`;
    }
    html += '</table></div>';
  }
  container.innerHTML = html;
}

// ==========================================
// TONE GUIDE PANEL – ACCORDION
// ==========================================
function toggleToneGuidePanel() {
  const panel = document.getElementById('toneGuidePanel');
  const arrow = document.getElementById('toneGuideAccordionArrow');
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  arrow.classList.toggle('open', !isOpen);
}

async function loadToneGuide() {
  try {
    const res = await fetch('/prompts/tone_guide');
    const data = await res.json();
    const ta = document.getElementById('toneGuideTextarea');
    if (ta) ta.value = data.text || '';
  } catch (e) {
    console.error('Tone guide betöltési hiba:', e);
  }
}

function toggleToneGuideEdit() {
  const ta = document.getElementById('toneGuideTextarea');
  const editBtn = document.getElementById('editToneGuideBtn');
  const saveBtn = document.getElementById('saveToneGuideBtn');

  if (!state.toneGuideEditing) {
    ta.removeAttribute('readonly');
    ta.focus();
    editBtn.textContent = '✕ Mégse';
    saveBtn.style.display = 'inline-flex';
    state.toneGuideEditing = true;
    ta.dataset.original = ta.value;
  } else {
    ta.setAttribute('readonly', true);
    ta.value = ta.dataset.original || ta.value;
    editBtn.textContent = '✏ Szerkesztés';
    saveBtn.style.display = 'none';
    state.toneGuideEditing = false;
  }
}

async function saveToneGuide() {
  const ta = document.getElementById('toneGuideTextarea');
  const newText = ta.value.trim();

  if (!newText) {
    showToast('A tone guide szövege nem lehet üres', 'error');
    return;
  }

  try {
    const res = await fetch('/prompts/tone_guide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: newText })
    });
    const data = await res.json();

    if (data.error) {
      showToast(data.error, 'error');
      return;
    }

    const editBtn = document.getElementById('editToneGuideBtn');
    const saveBtn = document.getElementById('saveToneGuideBtn');
    ta.setAttribute('readonly', true);
    editBtn.textContent = '✏ Szerkesztés';
    saveBtn.style.display = 'none';
    state.toneGuideEditing = false;

    showToast('Tone Guide sikeresen mentve', 'success');
  } catch (err) {
    showToast('Mentési hiba: ' + err.message, 'error');
  }
}

// ==========================================
// SEGÉDFÜGGVÉNYEK
// ==========================================
function showSection(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'block';
}

function hideSection(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

function setEl(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
