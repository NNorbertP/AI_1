/* ==========================================
   SEO Cikk Generáló – Frontend logika v4
   ========================================== */

// Állapot
const state = {
  rows: [],
  columns: [],
  jobId: null,
  isGenerating: false,
  eventSource: null,
  // Prompt szerkesztő állapot (tone_guide külön kezelt)
  promptEditing: { main: false, fact_check: false, link_check: false, format_check: false, fix: false },
  promptVersions: { main: [], fact_check: [], link_check: [], format_check: [], fix: [] },
  promptPreviewVersion: { main: null, fact_check: null, link_check: null, format_check: null, fix: null },
  toneGuideEditing: false
};

// Prompt nevek (verziókövetéssel)
const VERSIONED_PROMPTS = ['main', 'fact_check', 'link_check', 'format_check', 'fix'];

// Megjelenítendő oszlopok a táblázatban (szerkeszthető)
const DISPLAY_COLUMNS = [
  { key: 'cikk_cim',         label: 'Cikk cím',          width: '200px', type: 'textarea' },
  { key: 'ceg_url',          label: 'Cég URL',            width: '140px', type: 'input' },
  { key: 'link_1_kulcsszo',  label: 'Link 1 kulcsszó',   width: '130px', type: 'input' },
  { key: 'link_1_url',       label: 'Link 1 URL',         width: '140px', type: 'input' },
  { key: 'link_2_kulcsszo',  label: 'Link 2 kulcsszó',   width: '130px', type: 'input' },
  { key: 'link_2_url',       label: 'Link 2 URL',         width: '140px', type: 'input' },
  { key: 'link_3_kulcsszo',  label: 'Link 3 kulcsszó',   width: '130px', type: 'input' },
  { key: 'link_3_url',       label: 'Link 3 URL',         width: '140px', type: 'input' },
  { key: 'link_4_kulcsszo',  label: 'Link 4 kulcsszó',   width: '130px', type: 'input' },
  { key: 'link_4_url',       label: 'Link 4 URL',         width: '140px', type: 'input' },
  { key: 'link_5_kulcsszo',  label: 'Link 5 kulcsszó',   width: '130px', type: 'input' },
  { key: 'link_5_url',       label: 'Link 5 URL',         width: '140px', type: 'input' },
  { key: 'korabbi_cikk_url_1', label: 'Korábbi cikk 1',  width: '140px', type: 'input' },
  { key: 'korabbi_cikk_url_2', label: 'Korábbi cikk 2',  width: '140px', type: 'input' },
  { key: 'megjegyzes',       label: 'Megjegyzés',         width: '160px', type: 'textarea' },
];

// ==========================================
// INICIALIZÁLÁS
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  setupUploadZone();
  setupFileInput();
  setupGenerateButton();
  setupAddRowButton();
  loadPrompts();
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

  // Fejléc
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

    // Státusz
    cells += `<td>
      <div>${renderStatusBadge(row.status)}</div>
      ${row.message ? `<div class="status-message">${escapeHtml(row.message)}</div>` : ''}
    </td>`;

    // Törlés
    cells += `<td>
      <button class="btn-row-delete" onclick="deleteRow(${idx})" title="Sor törlése">✕</button>
    </td>`;

    tr.innerHTML = cells;
    tbody.appendChild(tr);
  });
}

function renderStatusBadge(status) {
  const map = {
    'Várakozik':    { cls: 'status-waiting', icon: '○' },
    'Folyamatban':  { cls: 'status-running', icon: '●' },
    'Kész':         { cls: 'status-done',    icon: '✓' },
    'Hiba':         { cls: 'status-error',   icon: '✕' },
  };
  const s = map[status] || map['Várakozik'];
  return `<span class="status-badge ${s.cls}">
    <span class="status-dot"></span>
    ${status}
  </span>`;
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

  // Visszaállítjuk a státuszokat
  state.rows.forEach(row => {
    if (row.status !== 'Kész') {
      row.status = 'Várakozik';
      row.message = '';
    }
  });
  renderTable();
  updateStats();

  // Kiválasztott modell
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
// PROMPT PANEL – ACCORDION
// ==========================================
function togglePromptPanel() {
  const panel = document.getElementById('promptPanel');
  const arrow = document.getElementById('accordionArrow');
  const isOpen = panel.style.display !== 'none';

  if (isOpen) {
    panel.style.display = 'none';
    arrow.classList.remove('open');
  } else {
    panel.style.display = 'block';
    arrow.classList.add('open');
  }
}

// ==========================================
// PROMPT PANEL – FÜLEK
// ==========================================
function switchPromptTab(tabName, btnEl) {
  // Összes tartalom elrejtése
  document.querySelectorAll('.prompt-content').forEach(el => {
    el.style.display = 'none';
    el.classList.remove('active');
  });
  // Összes fül inaktív
  document.querySelectorAll('.prompt-tab').forEach(el => el.classList.remove('active'));

  // Kiválasztott megjelenítése
  const content = document.getElementById(`tab-${tabName}`);
  if (content) {
    content.style.display = 'block';
    content.classList.add('active');
  }
  if (btnEl) btnEl.classList.add('active');
}

// ==========================================
// PROMPT BETÖLTÉS
// ==========================================
async function loadPrompts() {
  try {
    const res = await fetch('/prompts');
    const data = await res.json();

    // Verziókövetett promptok
    VERSIONED_PROMPTS.forEach(name => {
      const ta = document.getElementById(`prompt-${name}`);
      if (ta && data[name]) {
        ta.value = data[name];
      }
    });

    // Tone guide (külön kezelt)
    const tgTa = document.getElementById('prompt-tone_guide');
    if (tgTa && data['tone_guide']) {
      tgTa.value = data['tone_guide'];
    }

    // Verzióelőzmények betöltése
    await loadAllVersions();

  } catch (err) {
    console.error('Prompt betöltési hiba:', err);
  }
}

async function loadAllVersions() {
  for (const name of VERSIONED_PROMPTS) {
    await loadVersionsForPrompt(name);
  }
}

async function loadVersionsForPrompt(promptName) {
  try {
    const res = await fetch(`/prompts/${promptName}/versions`);
    const data = await res.json();
    state.promptVersions[promptName] = data.versions || [];
    renderVersionSelect(promptName);
  } catch (err) {
    console.error(`Verzió betöltési hiba (${promptName}):`, err);
  }
}

function renderVersionSelect(promptName) {
  const sel = document.getElementById(`versions-${promptName}`);
  if (!sel) return;

  const versions = state.promptVersions[promptName];
  sel.innerHTML = `<option value="">Verzióelőzmények (${versions.length} db)</option>`;

  // Fordított sorrendben (legújabb elöl)
  [...versions].reverse().forEach(v => {
    const date = v.saved_at ? v.saved_at.replace('T', ' ') : '';
    const opt = document.createElement('option');
    opt.value = v.version;
    opt.textContent = `v${v.version} – ${date}`;
    sel.appendChild(opt);
  });
}

// ==========================================
// PROMPT SZERKESZTÉS (verziókövetett)
// ==========================================
function toggleEdit(promptName) {
  const ta = document.getElementById(`prompt-${promptName}`);
  const editBtn = document.getElementById(`edit-btn-${promptName}`);
  const saveBtn = document.getElementById(`save-btn-${promptName}`);

  const isEditing = state.promptEditing[promptName];

  if (!isEditing) {
    ta.removeAttribute('readonly');
    ta.focus();
    editBtn.textContent = '✕ Mégse';
    saveBtn.style.display = 'inline-flex';
    state.promptEditing[promptName] = true;
    ta.dataset.original = ta.value;
  } else {
    ta.setAttribute('readonly', true);
    ta.value = ta.dataset.original || ta.value;
    editBtn.textContent = '✏ Szerkesztés';
    saveBtn.style.display = 'none';
    state.promptEditing[promptName] = false;
  }
}

async function savePrompt(promptName) {
  const ta = document.getElementById(`prompt-${promptName}`);
  const newText = ta.value.trim();

  if (!newText) {
    showToast('A prompt szövege nem lehet üres', 'error');
    return;
  }

  try {
    const res = await fetch(`/prompts/${promptName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: newText })
    });
    const data = await res.json();

    if (data.error) {
      showToast(data.error, 'error');
      return;
    }

    const editBtn = document.getElementById(`edit-btn-${promptName}`);
    const saveBtn = document.getElementById(`save-btn-${promptName}`);
    ta.setAttribute('readonly', true);
    editBtn.textContent = '✏ Szerkesztés';
    saveBtn.style.display = 'none';
    state.promptEditing[promptName] = false;

    await loadVersionsForPrompt(promptName);
    showToast('Prompt sikeresen mentve', 'success');
  } catch (err) {
    showToast('Mentési hiba: ' + err.message, 'error');
  }
}

// ==========================================
// TONE GUIDE SZERKESZTÉS (nincs verziókövetés)
// ==========================================
function toggleToneGuideEdit() {
  const ta = document.getElementById('prompt-tone_guide');
  const editBtn = document.getElementById('edit-btn-tone_guide');
  const saveBtn = document.getElementById('save-btn-tone_guide');

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
  const ta = document.getElementById('prompt-tone_guide');
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

    const editBtn = document.getElementById('edit-btn-tone_guide');
    const saveBtn = document.getElementById('save-btn-tone_guide');
    ta.setAttribute('readonly', true);
    editBtn.textContent = '✏ Szerkesztés';
    saveBtn.style.display = 'none';
    state.toneGuideEditing = false;

    showToast('Tone guide sikeresen mentve', 'success');
  } catch (err) {
    showToast('Mentési hiba: ' + err.message, 'error');
  }
}

// ==========================================
// VERZIÓELŐZMÉNYEK
// ==========================================
function previewVersion(promptName, versionNumber) {
  if (!versionNumber) {
    const restoreBtn = document.getElementById(`restore-${promptName}`);
    if (restoreBtn) restoreBtn.style.display = 'none';
    state.promptPreviewVersion[promptName] = null;
    loadCurrentPrompt(promptName);
    return;
  }

  const version = state.promptVersions[promptName].find(
    v => v.version === parseInt(versionNumber)
  );

  if (!version) return;

  const ta = document.getElementById(`prompt-${promptName}`);
  if (ta) {
    ta.value = version.text;
    if (state.promptEditing[promptName]) {
      toggleEdit(promptName);
    }
  }

  const restoreBtn = document.getElementById(`restore-${promptName}`);
  if (restoreBtn) restoreBtn.style.display = 'inline-flex';

  state.promptPreviewVersion[promptName] = parseInt(versionNumber);
}

async function loadCurrentPrompt(promptName) {
  try {
    const res = await fetch('/prompts');
    const data = await res.json();
    const ta = document.getElementById(`prompt-${promptName}`);
    if (ta && data[promptName]) ta.value = data[promptName];
  } catch (err) {
    console.error('Prompt újratöltési hiba:', err);
  }
}

async function restoreVersion(promptName) {
  const versionNumber = state.promptPreviewVersion[promptName];
  if (!versionNumber) return;

  try {
    const res = await fetch(`/prompts/${promptName}/restore/${versionNumber}`, {
      method: 'POST'
    });
    const data = await res.json();

    if (data.error) {
      showToast(data.error, 'error');
      return;
    }

    const restoreBtn = document.getElementById(`restore-${promptName}`);
    if (restoreBtn) restoreBtn.style.display = 'none';

    const sel = document.getElementById(`versions-${promptName}`);
    if (sel) sel.value = '';

    state.promptPreviewVersion[promptName] = null;

    await loadCurrentPrompt(promptName);
    await loadVersionsForPrompt(promptName);

    showToast(`v${versionNumber} sikeresen visszaállítva`, 'success');
  } catch (err) {
    showToast('Visszaállítási hiba: ' + err.message, 'error');
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
