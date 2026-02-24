/* =============================================================================
   FACTURIFY · app.js
   Módulos: Config → Estado → Cuota → Archivos → UI → DropZone → Envío → Toast
============================================================================= */

/* ── 1. CONFIGURACIÓN ────────────────────────────────────────────────────── */
const CONFIG = {
  webhookUrl:      'https://TU-INSTANCIA.n8n.io/webhook/facturas', // 🔧 Cambia aquí tu URL de ngrok o n8n Cloud
  maxFilesPerDay:  10,
  maxFileSizeMB:   10,
  storageKey:      'facturify_quota',
};

/* ── 2. ESTADO GLOBAL ────────────────────────────────────────────────────── */
const state = {
  selectedFiles: [],
};

/* ── 3. MÓDULO: CUOTA DIARIA ─────────────────────────────────────────────── */
const Quota = {

  /** Devuelve la fecha de hoy en formato YYYY-MM-DD */
  today() {
    return new Date().toISOString().slice(0, 10);
  },

  /** Lee la cuota almacenada; la reinicia si es de otro día */
  get() {
    try {
      const raw = localStorage.getItem(CONFIG.storageKey);
      if (!raw) return { date: this.today(), count: 0 };
      const q = JSON.parse(raw);
      return q.date === this.today() ? q : { date: this.today(), count: 0 };
    } catch {
      return { date: this.today(), count: 0 };
    }
  },

  /** Persiste el nuevo contador */
  set(count) {
    localStorage.setItem(
      CONFIG.storageKey,
      JSON.stringify({ date: this.today(), count })
    );
  },

  /** Archivos que aún se pueden subir hoy */
  remaining() {
    return CONFIG.maxFilesPerDay - this.get().count;
  },

  /** Incrementa el contador tras un envío exitoso */
  increment(amount) {
    this.set(this.get().count + amount);
  },

  /** Actualiza la barra visual de cuota */
  updateUI() {
    const used = this.get().count;
    const pct  = (used / CONFIG.maxFilesPerDay) * 100;

    document.getElementById('quotaUsed').textContent = used;

    const fill = document.getElementById('quotaBarFill');
    fill.style.width = pct + '%';
    fill.style.background =
      pct >= 100 ? '#f87171' :
      pct >= 70  ? '#fbbf24' :
      'linear-gradient(90deg, #4f8ef7, #a78bfa)';
  },
};

/* ── 4. MÓDULO: HELPERS DE ARCHIVO ───────────────────────────────────────── */
const FileUtils = {

  /** Formatea bytes a unidad legible */
  formatBytes(bytes) {
    if (bytes < 1024)           return bytes + ' B';
    if (bytes < 1024 * 1024)    return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  },

  /** Valida y filtra una lista de archivos según las reglas de negocio */
  sanitize(files) {
    const remaining = Quota.remaining();
    const valid     = [];
    const errors    = [];

    Array.from(files).forEach(f => {
      // Solo PDFs
      if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
        errors.push(`"${f.name}" no es un PDF válido.`);
        return;
      }
      // Tamaño máximo
      if (f.size > CONFIG.maxFileSizeMB * 1024 * 1024) {
        errors.push(`"${f.name}" supera ${CONFIG.maxFileSizeMB} MB.`);
        return;
      }
      // Sin duplicados
      if (state.selectedFiles.some(s => s.name === f.name && s.size === f.size)) {
        errors.push(`"${f.name}" ya está en la lista.`);
        return;
      }
      valid.push(f);
    });

    // Respetar cuota diaria
    if (valid.length + state.selectedFiles.length > remaining) {
      const allowed = Math.max(0, remaining - state.selectedFiles.length);
      const extra   = valid.splice(allowed);
      errors.push(`Límite diario: solo puedes subir ${remaining} archivo(s) más hoy.`);
      extra.forEach(f => errors.push(`"${f.name}" no se agregó.`));
    }

    errors.forEach(msg => Toast.show(msg, 'error'));
    return valid;
  },
};

/* ── 5. MÓDULO: INTERFAZ DE ARCHIVOS ─────────────────────────────────────── */
const FileUI = {

  /** Renderiza la lista completa de archivos seleccionados */
  render() {
    const list = document.getElementById('fileList');
    list.innerHTML = '';

    state.selectedFiles.forEach((file, i) => {
      const item = document.createElement('div');
      item.className  = 'file-item';
      item.id         = `file-${i}`;
      item.innerHTML  = `
        <div class="file-icon">PDF</div>
        <div class="file-meta">
          <div class="file-name" title="${file.name}">${file.name}</div>
          <div class="file-size">${FileUtils.formatBytes(file.size)}</div>
        </div>
        <div class="file-status pending" id="status-${i}"></div>
        <button class="file-remove" data-index="${i}" title="Eliminar" aria-label="Eliminar ${file.name}">
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      `;
      list.appendChild(item);
    });

    // Delegación de eventos para los botones de eliminar
    list.querySelectorAll('.file-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index, 10);
        state.selectedFiles.splice(idx, 1);
        this.render();
      });
    });

    this.updateSummary();
    this.updateSubmitBtn();
  },

  /** Actualiza el texto resumen debajo de la lista */
  updateSummary() {
    const el    = document.getElementById('fileSummary');
    const n     = state.selectedFiles.length;
    const total = state.selectedFiles.reduce((acc, f) => acc + f.size, 0);

    el.innerHTML = n === 0
      ? 'No hay archivos seleccionados'
      : `<strong>${n}</strong> archivo${n > 1 ? 's' : ''} · ${FileUtils.formatBytes(total)}`;
  },

  /** Habilita o deshabilita el botón de envío */
  updateSubmitBtn() {
    document.getElementById('submitBtn').disabled = state.selectedFiles.length === 0;
  },

  /** Cambia el estado visual de un ítem (uploading | done | err) */
  setItemStatus(index, status) {
    const itemEl   = document.getElementById(`file-${index}`);
    const statusEl = document.getElementById(`status-${index}`);

    itemEl.classList.remove('uploading', 'success', 'error');

    switch (status) {
      case 'uploading':
        itemEl.classList.add('uploading');
        statusEl.className   = 'file-status uploading';
        statusEl.textContent = '';
        break;
      case 'done':
        itemEl.classList.add('success');
        statusEl.className   = 'file-status done';
        statusEl.textContent = '✓';
        break;
      case 'err':
        itemEl.classList.add('error');
        statusEl.className   = 'file-status err';
        statusEl.textContent = '✕';
        break;
    }
  },
};

/* ── 6. MÓDULO: DROP ZONE ─────────────────────────────────────────────────── */
const DropZone = {

  init() {
    const dz = document.getElementById('dropzone');
    const fi = document.getElementById('fileInput');

    dz.addEventListener('dragover', e => {
      e.preventDefault();
      dz.classList.add('dragover');
    });

    dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));

    dz.addEventListener('drop', e => {
      e.preventDefault();
      dz.classList.remove('dragover');
      const newFiles = FileUtils.sanitize(e.dataTransfer.files);
      state.selectedFiles.push(...newFiles);
      FileUI.render();
      fi.value = '';
    });

    fi.addEventListener('change', () => {
      const newFiles = FileUtils.sanitize(fi.files);
      state.selectedFiles.push(...newFiles);
      FileUI.render();
      fi.value = '';
    });
  },
};

/* ── 7. MÓDULO: ENVÍO AL WEBHOOK N8N ─────────────────────────────────────── */
const Uploader = {

  /** Construye el FormData para un archivo individual */
  buildPayload(file, index, meta) {
    const fd = new FormData();
    fd.append('file',        file, file.name);
    fd.append('fileName',    file.name);
    fd.append('fileSize',    file.size);
    fd.append('email',       meta.email);
    fd.append('category',    meta.category);
    fd.append('notes',       meta.notes);
    fd.append('uploadDate',  new Date().toISOString());
    fd.append('fileIndex',   index + 1);
    fd.append('totalFiles',  state.selectedFiles.length);
    return fd;
  },

  /** Envía todos los archivos de forma secuencial */
  async uploadAll() {
    const btn = document.getElementById('submitBtn');

    // Validar formulario
    const email    = document.getElementById('email').value.trim();
    const category = document.getElementById('category').value;
    const notes    = document.getElementById('notes').value.trim();

    if (!email || !email.includes('@')) {
      Toast.show('Correo electrónico inválido.', 'warning');
      return;
    }
    if (state.selectedFiles.length === 0) {
      Toast.show('No hay archivos para enviar.', 'warning');
      return;
    }

    // Bloquear UI
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Enviando…';

    let successCount = 0;
    let failCount    = 0;
    const meta       = { email, category, notes };

    for (let i = 0; i < state.selectedFiles.length; i++) {
      const file = state.selectedFiles[i];
      FileUI.setItemStatus(i, 'uploading');

      try {
        const res = await fetch(CONFIG.webhookUrl, {
          method: 'POST',
          body:   this.buildPayload(file, i, meta),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        FileUI.setItemStatus(i, 'done');
        successCount++;

      } catch (err) {
        console.error(`[Facturify] Error al enviar "${file.name}":`, err);
        FileUI.setItemStatus(i, 'err');
        failCount++;
      }
    }

    // Actualizar cuota y UI
    Quota.increment(successCount);
    Quota.updateUI();

    // Mostrar panel de resultado
    this.showResult(successCount, failCount);

    // Notificaciones
    if (successCount > 0)
      Toast.show(`${successCount} factura${successCount > 1 ? 's' : ''} enviada${successCount > 1 ? 's' : ''} con éxito 🎉`, 'success');
    if (failCount > 0)
      Toast.show(`${failCount} archivo${failCount > 1 ? 's' : ''} fallaron`, 'error');

    // Resetear estado
    btn.querySelector('span').textContent = 'Enviar facturas';

    if (Quota.remaining() > 0) {
      state.selectedFiles = [];
      FileUI.render();
      btn.disabled = true;
    } else {
      btn.disabled = true;
      btn.querySelector('span').textContent = 'Cuota agotada';
      Toast.show('Has alcanzado el límite de 10 facturas por día.', 'warning');
    }
  },

  /** Muestra el panel de resultado con el resumen */
  showResult(successCount, failCount) {
    const panel = document.getElementById('resultPanel');
    const body  = document.getElementById('resultBody');

    panel.classList.add('show');
    body.innerHTML = [
      successCount > 0
        ? `✅ <strong>${successCount}</strong> factura${successCount > 1 ? 's' : ''} enviada${successCount > 1 ? 's' : ''} correctamente al flujo n8n.`
        : '',
      failCount > 0
        ? `<br>⚠️ <strong>${failCount}</strong> archivo${failCount > 1 ? 's' : ''} con error — revisa la consola para más detalles.`
        : '',
      `<br>Cuota restante hoy: <strong>${Quota.remaining()}</strong> / ${CONFIG.maxFilesPerDay}.`,
    ].join('');
  },
};

/* ── 8. MÓDULO: TOAST ────────────────────────────────────────────────────── */
const Toast = {

  /** Muestra una notificación temporal en la esquina inferior derecha */
  show(msg, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast     = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<div class="toast-dot"></div>${msg}`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideIn 0.3s ease reverse';
      toast.addEventListener('animationend', () => toast.remove(), { once: true });
    }, 4000);
  },
};

/* ── 9. INICIALIZACIÓN ───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {

  // Inicializar zona de arrastre
  DropZone.init();

  // Botón de envío
  document.getElementById('submitBtn')
    .addEventListener('click', () => Uploader.uploadAll());

  // Sincronizar cuota visual
  Quota.updateUI();

  // Bloquear dropzone si la cuota está agotada
  if (Quota.remaining() === 0) {
    const dz = document.getElementById('dropzone');
    dz.style.opacity       = '0.4';
    dz.style.pointerEvents = 'none';
    Toast.show('Has alcanzado el límite diario de 10 facturas.', 'warning');
  }
});
