/* ==========================================
   SEO Cikk Generáló – Frontend logika
   ========================================== */

// Állapot
const state = {
  rows: [],
  columns: [],
  jobId: null,
  isGenerating: false,
  eventSource: null
};

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

  // Sorok
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

  // Görgetés az új sorhoz
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
      body: JSON.stringify({ rows: state.rows })
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
      // Sor státusz frissítése
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

  // Státusz cella (utolsó előtti td)
  const cells = tr.querySelectorAll('td');
  const statusCell = cells[cells.length - 2];
  if (statusCell) {
    statusCell.innerHTML = `
      <div>${renderStatusBadge(row.status)}</div>
      ${row.message ? `<div class="status-message">${escapeHtml(row.message)}</div>` : ''}
    `;
  }

  // Sor kiemelése aktív generálásnál
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
