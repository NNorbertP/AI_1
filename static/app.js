/* ==========================================
   SEO Cikk Generáló – app.js v6
   ========================================== */

// ==========================================
// GLOBÁLIS ÁLLAPOT
// ==========================================
let tableData = [];
let tableColumns = [];
let currentJobId = null;
let eventSource = null;
let pipelineSteps = [];
let pipelineVersions = [];
let nextStepId = 100;

// ==========================================
// INICIALIZÁLÁS
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  setupFileInput();
  loadPipeline();
  loadToneGuide();
});

// ==========================================
// TOAST ÉRTESÍTÉSEK
// ==========================================
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

// ==========================================
// ACCORDION
// ==========================================
function toggleAccordion(name) {
  const body = document.getElementById(`${name}AccordionBody`);
  const arrow = document.getElementById(`${name}Arrow`);
  const header = document.getElementById(`${name}AccordionHeader`);

  const isOpen = body.classList.contains('open');
  body.classList.toggle('open', !isOpen);
  arrow.classList.toggle('open', !isOpen);
  header.classList.toggle('open', !isOpen);
}

// ==========================================
// FÁJL FELTÖLTÉS
// ==========================================
function setupFileInput() {
  const fileInput = document.getElementById('fileInput');
  const uploadZone = document.getElementById('uploadZone');

  fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) handleFileUpload(e.target.files[0]);
  });

  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
  });

  uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('drag-over');
  });

  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.xlsx')) handleFileUpload(file);
    else showToast('Csak .xlsx fájl tölthető fel!', 'error');
  });
}

async function handleFileUpload(file) {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch('/upload', { method: 'POST', body: formData });
    const data = await res.json();

    if (data.error) {
      showToast(data.error, 'error');
      return;
    }

    tableColumns = data.columns;
    tableData = data.rows;

    // Fájlnév megjelenítése
    const fnEl = document.getElementById('uploadFilename');
    fnEl.textContent = '📄 ' + file.name;
    fnEl.classList.remove('hidden');

    renderTable();
    document.getElementById('tableContainer').classList.remove('hidden');
    document.getElementById('startBtn').disabled = false;

    showToast(`${tableData.length} sor betöltve`, 'success');
  } catch (err) {
    showToast('Hiba a feltöltés során: ' + err.message, 'error');
  }
}

// ==========================================
// TÁBLÁZAT RENDERELÉS
// ==========================================
const DISPLAY_COLUMNS = [
  'ceg_url', 'cikk_cim',
  'link_1_kulcsszo', 'link_1_url',
  'link_2_kulcsszo', 'link_2_url',
  'link_3_kulcsszo', 'link_3_url',
  'link_4_kulcsszo', 'link_4_url',
  'link_5_kulcsszo', 'link_5_url',
  'korabbi_cikk_url_1', 'korabbi_cikk_url_2',
  'megjegyzes'
];

function renderTable() {
  const thead = document.getElementById('tableHead');
  const tbody = document.getElementById('tableBody');

  // Megjelenítendő oszlopok: az Excelből jövők + státusz + törlés
  const cols = tableColumns.filter(c => DISPLAY_COLUMNS.includes(c));
  if (cols.length === 0) {
    // Ha nincs egyezés, mutassuk az első 6 oszlopot
    cols.push(...tableColumns.slice(0, 6));
  }

  // Fejléc
  thead.innerHTML = `<tr>
    <th>#</th>
    ${cols.map(c => `<th>${formatColName(c)}</th>`).join('')}
    <th>Státusz</th>
    <th>Üzenet</th>
    <th></th>
  </tr>`;

  // Sorok
  tbody.innerHTML = '';
  tableData.forEach((row, idx) => {
    const tr = document.createElement('tr');
    tr.id = `row-${idx}`;

    let cells = `<td style="color:#718096;font-size:12px;text-align:center">${idx + 1}</td>`;

    cols.forEach(col => {
      const val = row[col] || '';
      cells += `<td><input type="text" value="${escHtml(String(val))}"
        onchange="updateCell(${idx}, '${col}', this.value)"
        placeholder="${formatColName(col)}"></td>`;
    });

    const statusClass = getStatusClass(row.status || 'Várakozik');
    cells += `<td><span class="status-badge ${statusClass}" id="status-${idx}">${row.status || 'Várakozik'}</span></td>`;
    cells += `<td style="font-size:11px;color:#718096;max-width:200px;word-break:break-word" id="msg-${idx}">${escHtml(row.message || '')}</td>`;
    cells += `<td><button class="btn-row-delete" onclick="deleteRow(${idx})" title="Sor törlése">✕</button></td>`;

    tr.innerHTML = cells;
    tbody.appendChild(tr);
  });
}

function formatColName(col) {
  return col.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function getStatusClass(status) {
  if (status === 'Várakozik') return 'status-waiting';
  if (status === 'Folyamatban') return 'status-running';
  if (status === 'Kész') return 'status-done';
  if (status === 'Hiba') return 'status-error';
  return 'status-waiting';
}

function updateCell(rowIdx, col, value) {
  tableData[rowIdx][col] = value;
}

function deleteRow(idx) {
  tableData.splice(idx, 1);
  renderTable();
}

function addEmptyRow() {
  const newRow = { status: 'Várakozik', message: '' };
  tableColumns.forEach(col => { newRow[col] = ''; });
  if (tableColumns.length === 0) {
    DISPLAY_COLUMNS.forEach(col => { newRow[col] = ''; });
    tableColumns = [...DISPLAY_COLUMNS];
  }
  tableData.push(newRow);
  renderTable();
}

// ==========================================
// GENERÁLÁS
// ==========================================
async function startGeneration() {
  if (!tableData.length) {
    showToast('Nincs adat a generáláshoz!', 'error');
    return;
  }

  const model = document.getElementById('modelSelect').value;

  // Reset státuszok
  tableData.forEach(row => {
    if (row.status !== 'Kész') {
      row.status = 'Várakozik';
      row.message = '';
    }
  });
  renderTable();

  document.getElementById('startBtn').disabled = true;
  document.getElementById('progressSection').classList.remove('hidden');
  document.getElementById('downloadSection').classList.remove('visible');

  updateProgress(0, tableData.length);

  try {
    const res = await fetch('/start-generation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: tableData, model })
    });
    const data = await res.json();

    if (data.error) {
      showToast(data.error, 'error');
      document.getElementById('startBtn').disabled = false;
      return;
    }

    currentJobId = data.job_id;
    listenToSSE(currentJobId);
  } catch (err) {
    showToast('Hiba a generálás indításakor: ' + err.message, 'error');
    document.getElementById('startBtn').disabled = false;
  }
}

function listenToSSE(jobId) {
  if (eventSource) eventSource.close();

  eventSource = new EventSource(`/stream/${jobId}`);

  eventSource.onmessage = (e) => {
    const event = JSON.parse(e.data);

    if (event.type === 'row_update') {
      const idx = event.row_index;
      if (tableData[idx]) {
        tableData[idx].status = event.status;
        tableData[idx].message = event.message || '';
      }
      // Státusz badge frissítése
      const statusEl = document.getElementById(`status-${idx}`);
      if (statusEl) {
        statusEl.textContent = event.status;
        statusEl.className = `status-badge ${getStatusClass(event.status)}`;
      }
      const msgEl = document.getElementById(`msg-${idx}`);
      if (msgEl) msgEl.textContent = event.message || '';
    }

    if (event.type === 'progress') {
      updateProgress(event.completed, event.total);
    }

    if (event.type === 'complete') {
      eventSource.close();
      document.getElementById('startBtn').disabled = false;

      if (event.download_url) {
        const dlSection = document.getElementById('downloadSection');
        const dlBtn = document.getElementById('downloadBtn');
        dlBtn.href = event.download_url;
        dlSection.classList.add('visible');
        showToast('Generálás kész! A Word dokumentum letölthető.', 'success');
      } else {
        showToast('Generálás befejezve (nincs letölthető fájl).', 'info');
      }
    }
  };

  eventSource.onerror = () => {
    eventSource.close();
    document.getElementById('startBtn').disabled = false;
    showToast('SSE kapcsolat megszakadt.', 'error');
  };
}

function updateProgress(completed, total) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  document.getElementById('progressText').textContent = `${completed} / ${total} cikk kész`;
  document.getElementById('progressPct').textContent = `${pct}%`;
  document.getElementById('progressBar').style.width = `${pct}%`;
}

// ==========================================
// PIPELINE BETÖLTÉS ÉS RENDERELÉS
// ==========================================
async function loadPipeline() {
  try {
    const res = await fetch('/pipeline');
    const data = await res.json();
    pipelineSteps = (data.steps || []).map(s => ({ ...s }));
    pipelineVersions = data.versions || [];
    renderPipelineSteps();
    renderPipelineVersions();
    // nextStepId = max id + 1
    if (pipelineSteps.length > 0) {
      nextStepId = Math.max(...pipelineSteps.map(s => s.id || 0)) + 1;
    }
  } catch (err) {
    showToast('Hiba a pipeline betöltésekor: ' + err.message, 'error');
  }
}

function renderPipelineSteps() {
  const container = document.getElementById('pipelineStepsList');
  container.innerHTML = '';

  pipelineSteps.forEach((step, idx) => {
    const div = document.createElement('div');
    div.className = `pipeline-step${step.enabled === false ? ' disabled' : ''}`;
    div.id = `pipeline-step-${idx}`;

    const isFirst = idx === 0;
    const isLast = idx === pipelineSteps.length - 1;
    const enabled = step.enabled !== false;

    div.innerHTML = `
      <div class="step-header">
        <div class="step-header-left">
          <span class="step-number">${idx + 1}</span>
          <input class="step-name-input" type="text" value="${escHtml(step.name || '')}"
            onchange="updateStepName(${idx}, this.value)" placeholder="Lépés neve">
          <label class="toggle-label">
            <input type="checkbox" class="step-enabled-toggle" ${enabled ? 'checked' : ''}
              onchange="toggleStep(${idx}, this.checked)">
            <span class="toggle-text">${enabled ? 'Aktív' : 'Inaktív'}</span>
          </label>
        </div>
        <div class="step-header-right">
          <button class="btn btn-ghost btn-xs" onclick="moveStep(${idx}, -1)" ${isFirst ? 'disabled' : ''} title="Fel">↑</button>
          <button class="btn btn-ghost btn-xs" onclick="moveStep(${idx}, 1)"  ${isLast  ? 'disabled' : ''} title="Le">↓</button>
          <button class="btn btn-danger btn-xs" onclick="deleteStep(${idx})" title="Törlés">✕</button>
        </div>
      </div>
      <div class="step-body">
        <textarea class="step-prompt-textarea" rows="8"
          onchange="updateStepPrompt(${idx}, this.value)"
          placeholder="Prompt szövege... Használj {változó} formátumot.">${escHtml(step.prompt || '')}</textarea>
      </div>
    `;

    container.appendChild(div);
  });
}

function renderPipelineVersions() {
  const sel = document.getElementById('pipelineVersionSelect');
  sel.innerHTML = '<option value="">– Verzióelőzmények –</option>';
  pipelineVersions.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.version;
    opt.textContent = `${v.version}. verzió – ${v.saved_at ? v.saved_at.replace('T', ' ') : ''}`;
    sel.appendChild(opt);
  });
}

function updateStepName(idx, value) {
  pipelineSteps[idx].name = value;
}

function updateStepPrompt(idx, value) {
  pipelineSteps[idx].prompt = value;
}

function toggleStep(idx, enabled) {
  pipelineSteps[idx].enabled = enabled;
  const stepEl = document.getElementById(`pipeline-step-${idx}`);
  if (stepEl) stepEl.classList.toggle('disabled', !enabled);
  // Toggle text frissítése
  const toggleText = stepEl.querySelector('.toggle-text');
  if (toggleText) toggleText.textContent = enabled ? 'Aktív' : 'Inaktív';
}

function moveStep(idx, direction) {
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= pipelineSteps.length) return;
  const tmp = pipelineSteps[idx];
  pipelineSteps[idx] = pipelineSteps[newIdx];
  pipelineSteps[newIdx] = tmp;
  renderPipelineSteps();
}

function deleteStep(idx) {
  if (pipelineSteps.length <= 1) {
    showToast('Legalább egy lépésnek kell maradnia!', 'error');
    return;
  }
  if (confirm(`Biztosan törlöd a(z) "${pipelineSteps[idx].name}" lépést?`)) {
    pipelineSteps.splice(idx, 1);
    renderPipelineSteps();
  }
}

function addPipelineStep() {
  pipelineSteps.push({
    id: nextStepId++,
    name: `${pipelineSteps.length + 1}. lépés`,
    enabled: true,
    prompt: ''
  });
  renderPipelineSteps();
  // Scroll to new step
  setTimeout(() => {
    const last = document.querySelector('#pipelineStepsList .pipeline-step:last-child');
    if (last) last.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 100);
}

async function savePipeline() {
  // Collect current textarea values (in case onchange didn't fire)
  document.querySelectorAll('#pipelineStepsList .pipeline-step').forEach((el, idx) => {
    const textarea = el.querySelector('.step-prompt-textarea');
    const nameInput = el.querySelector('.step-name-input');
    if (textarea && pipelineSteps[idx]) pipelineSteps[idx].prompt = textarea.value;
    if (nameInput && pipelineSteps[idx]) pipelineSteps[idx].name = nameInput.value;
  });

  try {
    const res = await fetch('/pipeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ steps: pipelineSteps })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Pipeline mentve!', 'success');
      // Reload to get updated versions
      await loadPipeline();
    } else {
      showToast(data.error || 'Hiba a mentésnél', 'error');
    }
  } catch (err) {
    showToast('Hiba: ' + err.message, 'error');
  }
}

function onVersionSelectChange() {
  const sel = document.getElementById('pipelineVersionSelect');
  const btn = document.getElementById('restoreVersionBtn');
  btn.disabled = !sel.value;
}

async function restorePipelineVersion() {
  const sel = document.getElementById('pipelineVersionSelect');
  const version = sel.value;
  if (!version) return;

  if (!confirm(`Biztosan visszaállítod a ${version}. verziót? A jelenlegi pipeline felülíródik.`)) return;

  try {
    const res = await fetch(`/pipeline/restore/${version}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
      await loadPipeline();
    } else {
      showToast(data.error || 'Hiba', 'error');
    }
  } catch (err) {
    showToast('Hiba: ' + err.message, 'error');
  }
}

// ==========================================
// VÁLTOZÓK MODAL
// ==========================================
async function openVariablesModal() {
  const modal = document.getElementById('variablesModal');
  const body = document.getElementById('variablesModalBody');
  modal.classList.add('open');

  try {
    const res = await fetch('/variables');
    const data = await res.json();
    body.innerHTML = '';

    Object.entries(data).forEach(([groupName, vars]) => {
      const groupDiv = document.createElement('div');
      groupDiv.className = 'var-group';
      groupDiv.innerHTML = `<h4>${groupName}</h4>`;

      const table = document.createElement('table');
      table.className = 'var-table';

      Object.entries(vars).forEach(([varName, desc]) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><code title="Kattints a másoláshoz" onclick="copyToClipboard('${varName}')">${escHtml(varName)}</code></td>
          <td style="color:#4a5568">${escHtml(desc)}</td>
        `;
        table.appendChild(tr);
      });

      groupDiv.appendChild(table);
      body.appendChild(groupDiv);
    });
  } catch (err) {
    body.innerHTML = `<p style="color:#e53e3e">Hiba a változók betöltésekor: ${err.message}</p>`;
  }
}

function closeVariablesModal(event) {
  if (!event || event.target === document.getElementById('variablesModal') || event.target.classList.contains('modal-close')) {
    document.getElementById('variablesModal').classList.remove('open');
  }
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast(`Másolva: ${text}`, 'info');
  });
}

// ==========================================
// TONE GUIDE
// ==========================================
async function loadToneGuide() {
  try {
    const res = await fetch('/prompts/tone_guide');
    const data = await res.json();
    const textarea = document.getElementById('toneGuideTextarea');
    if (textarea) textarea.value = data.text || '';
  } catch (err) {
    console.error('Tone guide betöltési hiba:', err);
  }
}

async function saveToneGuide() {
  const textarea = document.getElementById('toneGuideTextarea');
  const text = textarea ? textarea.value.trim() : '';

  if (!text) {
    showToast('A Tone Guide nem lehet üres!', 'error');
    return;
  }

  try {
    const res = await fetch('/prompts/tone_guide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Tone Guide mentve!', 'success');
    } else {
      showToast(data.error || 'Hiba a mentésnél', 'error');
    }
  } catch (err) {
    showToast('Hiba: ' + err.message, 'error');
  }
}
