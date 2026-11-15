/**
 * CONTROLADOR DE LA CONSOLA EDITORIAL (/admin)
 * Seguridad: HttpOnly Session + CSRF Token + Inactividad 20 min + Auditoría
 * UX: Edición guiada, vista previa en vivo, selector visual 3D, Drag & Drop y diagnóstico rápido
 */

(function () {
  let portalData = null;
  let serverFiles = { pdfs: [], zips: [] };
  let auditLogs = [];
  let csrfToken = '';
  let currentUsername = '';
  let mustChangePassword = false;
  let activePracticeIdx = 0;
  let activePracticeCategory = 'ALL';
  let activeYoutubeIdx = -1;
  let activeRepoFolderFilter = 'ALL';
  let isDirty = false;
  let idleTimer = null;

  const IDLE_LOCK_MS = 20 * 60 * 1000;

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el && val !== undefined && val !== null) el.textContent = String(val);
  }

  function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val !== undefined && val !== null ? String(val) : '';
  }

  function markDirty(dirty) {
    isDirty = dirty;
    const statusEl = document.getElementById('adminSyncStatus');
    if (!statusEl) return;
    if (dirty) {
      statusEl.textContent = '● Cambios sin guardar';
      statusEl.classList.add('dirty');
    } else {
      statusEl.textContent = '● Todo guardado';
      statusEl.classList.remove('dirty');
    }
  }

  function showToast(msg) {
    const el = document.getElementById('adminToast');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(window.__adminToastTimer);
    window.__adminToastTimer = setTimeout(() => el.classList.add('hidden'), 3600);
  }

  function resetIdleTimer() {
    clearTimeout(idleTimer);
    if (document.getElementById('adminWorkspace')?.classList.contains('hidden')) return;
    idleTimer = setTimeout(async () => {
      await fetch('/api/admin/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {}
      }).catch(() => {});
      showAuthGate('Sesión bloqueada automáticamente tras 20 minutos de inactividad.');
    }, IDLE_LOCK_MS);
  }

  function showAuthGate(message = '') {
    clearTimeout(idleTimer);
    csrfToken = '';
    markDirty(false);
    document.getElementById('adminWorkspace')?.classList.add('hidden');
    document.getElementById('adminAuthGate')?.classList.remove('hidden');
    const errEl = document.getElementById('loginErrorBanner');
    if (errEl) {
      if (message) {
        errEl.textContent = message;
        errEl.classList.remove('hidden');
      } else {
        errEl.classList.add('hidden');
      }
    }
  }

  function showWorkspace(username, token, mustChange) {
    currentUsername = username || 'admin';
    csrfToken = token || '';
    mustChangePassword = Boolean(mustChange);
    document.getElementById('adminAuthGate')?.classList.add('hidden');
    document.getElementById('adminWorkspace')?.classList.remove('hidden');
    setText('topbarUsernamePill', `👤 ${currentUsername}`);
    setVal('secNewUsername', currentUsername);

    const banner = document.getElementById('mustChangeBanner');
    if (banner) banner.classList.toggle('hidden', !mustChangePassword);
    markDirty(false);
    resetIdleTimer();
  }

  function switchSection(targetId) {
    document.querySelectorAll('.nav-item-btn').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-section') === targetId);
    });
    document.querySelectorAll('.admin-section').forEach((s) => {
      s.classList.toggle('active', s.id === targetId);
    });
  }

  async function apiFetch(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.method && options.method.toUpperCase() !== 'GET' && csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
    const res = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      showAuthGate('Tu sesión expiró o fue cerrada. Inicia sesión nuevamente.');
      throw new Error(data.error || 'No autenticado');
    }
    return { res, data };
  }

  async function savePortalData(toastMsg = 'Cambios guardados y publicados en el blog') {
    setText('adminSyncStatus', '⏳ Guardando...');
    const { res, data } = await apiFetch('/api/data', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(portalData)
    });
    if (!res.ok || !data.ok) {
      markDirty(true);
      throw new Error(data.error || 'No se pudo guardar');
    }
    markDirty(false);
    showToast('✅ ' + toastMsg);
    await Promise.all([refreshOverviewMetrics(), refreshAuditLogs(), refreshServerFiles()]);
    renderAllAdminViews();
  }

  function convertWatchUrlToEmbed(url) {
    if (!url) return '';
    try {
      const u = new URL(url.trim());
      if (u.searchParams.get('list')) {
        return `https://www.youtube.com/embed/videoseries?list=${u.searchParams.get('list')}`;
      }
      if (u.searchParams.get('v')) {
        return `https://www.youtube.com/embed/${u.searchParams.get('v')}`;
      }
      if (u.hostname.includes('youtu.be')) {
        return `https://www.youtube.com/embed/${u.pathname.replace('/', '')}`;
      }
      if (u.pathname.includes('/embed/')) return url;
    } catch (_) {
      return url;
    }
    return url;
  }

  function extractYoutubeThumbnail(url) {
    if (!url) return '/img/schematics/circuito_01_mando_directo.png';
    try {
      const u = new URL(url.trim());
      let vid = u.searchParams.get('v') || '';
      if (!vid && u.hostname.includes('youtu.be')) vid = u.pathname.replace('/', '');
      if (!vid && u.pathname.includes('/embed/')) {
        const seg = u.pathname.split('/embed/')[1];
        if (seg && seg !== 'videoseries') vid = seg.split('/')[0];
      }
      if (vid) return `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
    } catch (_) {}
    return '/img/schematics/circuito_01_mando_directo.png';
  }

  // ==========================================================================
  // CARGA INICIAL Y DATOS DEL SERVIDOR
  // ==========================================================================
  async function bootstrapAdmin() {
    try {
      const res = await fetch('/api/admin/session', { credentials: 'same-origin', cache: 'no-store' });
      const sess = await res.json();
      if (sess && sess.authenticated) {
        showWorkspace(sess.username, sess.csrfToken, sess.mustChangePassword);
        await loadAdminData();
      } else {
        showAuthGate('');
      }
    } catch (err) {
      showAuthGate('No se pudo conectar con el servidor local.');
    }
  }

  async function loadAdminData() {
    const [portalRes] = await Promise.all([
      fetch('/api/data', { cache: 'no-store' }).then((r) => r.json()),
      refreshOverviewMetrics(),
      refreshServerFiles(),
      refreshAuditLogs()
    ]);
    portalData = portalRes;
    if (activePracticeIdx >= (portalData.practices?.length || 0)) activePracticeIdx = 0;
    renderAllAdminViews();
    if ((portalData.practices || []).length > 0) {
      populatePracticeForm(activePracticeIdx);
    }
    if ((portalData.youtubeVideos || []).length > 0 && activeYoutubeIdx < 0) {
      populateYoutubeForm(0);
    }
    markDirty(false);
  }

  async function refreshOverviewMetrics() {
    try {
      const { res, data } = await apiFetch('/api/admin/overview', { cache: 'no-store' });
      if (res.ok && data.ok) {
        setText('kpiDiskFilesCount', (data.pdfFilesCount || 0) + (data.zipFilesCount || 0));
        setText('kpiDiskBreakdown', `${data.pdfFilesCount || 0} PDFs + ${data.zipFilesCount || 0} Paquetes .ZIP`);
        setText('activeSessionsBadge', `💻 Sesiones Activas: ${data.activeSessionsCount || 1}`);
        const kb = ((data.dataBytes || 0) / 1024).toFixed(1);
        const dt = data.dataUpdatedAt ? new Date(data.dataUpdatedAt).toLocaleString('es-CO') : 'Reciente';
        setText('overviewDataMeta', `Archivo: data/iub_portal_data.json • Tamaño: ${kb} KB • Última modificación: ${dt}`);
      }
    } catch (_) {}
  }

  async function refreshServerFiles() {
    try {
      const { res, data } = await apiFetch('/api/admin/files', { cache: 'no-store' });
      if (res.ok && data.ok) {
        serverFiles = { pdfs: data.pdfs || [], zips: data.zips || [] };
      }
    } catch (_) {}
  }

  async function refreshAuditLogs() {
    try {
      const { res, data } = await apiFetch('/api/admin/audit', { cache: 'no-store' });
      if (res.ok && data.ok) {
        auditLogs = data.logs || [];
        setText('activeSessionsBadge', `💻 Sesiones Activas: ${data.activeSessionsCount || 1}`);
        renderAuditTable();
      }
    } catch (_) {}
  }

  // ==========================================================================
  // RENDERIZADO GENERAL
  // ==========================================================================
  function renderAllAdminViews() {
    if (!portalData) return;
    renderOverviewKpis();
    renderHealthDiagnosis();
    renderPracticesCategoryBar();
    renderPracticesList();
    renderFilePickers();
    renderYoutubeList();
    renderRepositoryManager();
    populateInstitutionForm();
    renderAuditTable();
  }

  function renderOverviewKpis() {
    const practices = portalData.practices || [];
    const videos = portalData.youtubeVideos || [];
    const repo = portalData.resourcesInventory || [];
    const folders = new Set(repo.map((r) => r.category || 'General'));

    setText('kpiPracticesCount', practices.length);
    setText('kpiVideosCount', videos.length);
    setText('kpiRepoCount', repo.length);
    setText('kpiFoldersSub', `Agrupados en ${folders.size} carpetas temáticas`);
  }

  function renderHealthDiagnosis() {
    const el = document.getElementById('overviewHealthList');
    if (!el) return;
    const practices = portalData.practices || [];
    const warnings = [];

    practices.forEach((p, idx) => {
      const missing = [];
      if (!p.pdfFile) missing.push('PDF');
      if (!p.zipFile) missing.push('.ZIP');
      if (missing.length > 0) {
        warnings.push({ idx, id: p.id, title: p.title, msg: `Falta asignar: ${missing.join(' y ')}` });
      }
    });

    if (warnings.length === 0) {
      el.innerHTML = `<div class="health-row ok"><span>✅ Todos los ${practices.length} circuitos cuentan con guía PDF y paquete FluidSIM .ZIP asignados.</span></div>`;
      return;
    }

    el.innerHTML = warnings
      .slice(0, 8)
      .map(
        (w) => `
        <div class="health-row">
          <span>⚠️ <strong>[${escapeHtml(w.id)}]</strong> ${escapeHtml(w.title)} — ${escapeHtml(w.msg)}</span>
          <button type="button" class="btn-outline" style="padding:5px 10px;font-size:12px;" data-fix-practice="${w.idx}">✏️ Corregir</button>
        </div>
      `
      )
      .join('');

    el.querySelectorAll('[data-fix-practice]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-fix-practice'), 10);
        switchSection('sec-practices');
        populatePracticeForm(idx);
      });
    });
  }

  // 1. CIRCUITOS Y CASOS (CON CATEGORÍAS, PICKERS Y VISTA PREVIA)
  function renderPracticesCategoryBar() {
    const bar = document.getElementById('adminPracticeCategoryBar');
    if (!bar) return;
    const practices = portalData.practices || [];
    const cats = Array.from(new Set(practices.map((p) => p.category || 'Otros')));
    bar.innerHTML = [
      `<button type="button" class="chip-filter-btn ${activePracticeCategory === 'ALL' ? 'active' : ''}" data-pcat="ALL">Todos (${practices.length})</button>`,
      ...cats.map((c) => `<button type="button" class="chip-filter-btn ${activePracticeCategory === c ? 'active' : ''}" data-pcat="${escapeHtml(c)}">${escapeHtml(c)}</button>`)
    ].join('');

    bar.querySelectorAll('[data-pcat]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activePracticeCategory = btn.getAttribute('data-pcat') || 'ALL';
        renderPracticesCategoryBar();
        renderPracticesList();
      });
    });
  }

  function renderPracticesList() {
    const listEl = document.getElementById('adminPracticesList');
    const q = (document.getElementById('adminPracticeSearch')?.value || '').trim().toLowerCase();
    const idSuggestions = document.getElementById('circuitIdSuggestions');
    const practices = portalData.practices || [];

    if (idSuggestions) {
      idSuggestions.innerHTML = practices.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.title)}</option>`).join('');
    }

    if (listEl) {
      const filtered = practices
        .map((p, idx) => ({ p, idx }))
        .filter(({ p }) => {
          const catOk = activePracticeCategory === 'ALL' || (p.category || 'Otros') === activePracticeCategory;
          const qOk = !q || `${p.id} ${p.code} ${p.title} ${p.category}`.toLowerCase().includes(q);
          return catOk && qOk;
        });

      listEl.innerHTML = filtered
        .map(
          ({ p, idx }) => `
          <button type="button" class="item-select-btn ${idx === activePracticeIdx ? 'active' : ''}" data-select-practice="${idx}">
            <div class="item-id">${escapeHtml(p.id)} • ${escapeHtml(p.code || '')}</div>
            <div class="item-title">${escapeHtml(p.title)}</div>
            <div class="item-meta">${escapeHtml(p.category)}</div>
          </button>
        `
        )
        .join('');

      listEl.querySelectorAll('[data-select-practice]').forEach((btn) => {
        btn.addEventListener('click', () => {
          populatePracticeForm(parseInt(btn.getAttribute('data-select-practice'), 10));
        });
      });
    }

    const linkSelect = document.getElementById('uploadLinkPracticeSelect');
    if (linkSelect) {
      linkSelect.innerHTML =
        '<option value="">-- Solo publicar en la carpeta del Repositorio --</option>' +
        practices.map((p, idx) => `<option value="${idx}">Vincular a [${escapeHtml(p.id)}] ${escapeHtml(p.title)}</option>`).join('');
    }
  }

  function renderFilePickers() {
    const pdfSelect = document.getElementById('pickerPracticePdf');
    const zipSelect = document.getElementById('pickerPracticeZip');
    const ytSuggestions = document.getElementById('youtubeUrlSuggestions');

    if (pdfSelect) {
      pdfSelect.innerHTML =
        '<option value="">-- Elegir PDF guardado en servidor --</option>' +
        serverFiles.pdfs.map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p.split('/').pop())}</option>`).join('');
    }
    if (zipSelect) {
      zipSelect.innerHTML =
        '<option value="">-- Elegir .ZIP guardado en servidor --</option>' +
        serverFiles.zips.map((z) => `<option value="${escapeHtml(z)}">${escapeHtml(z.split('/').pop())}</option>`).join('');
    }
    if (ytSuggestions) {
      ytSuggestions.innerHTML = (portalData.youtubeVideos || [])
        .map((v) => `<option value="${escapeHtml(v.watchUrl || v.url)}">${escapeHtml(v.title)}</option>`)
        .join('');
    }
  }

  function syncVisual3dSelection(val) {
    setVal('fieldPracticeHologram', val || 'double_cylinder');
    document.querySelectorAll('#visual3dPicker .visual-3d-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-3d-val') === (val || 'double_cylinder'));
    });
  }

  function updatePracticeLivePreview() {
    const code = document.getElementById('fieldPracticeCode')?.value || '';
    const cat = document.getElementById('fieldPracticeCategory')?.value || '';
    const title = document.getElementById('fieldPracticeTitle')?.value || 'Sin título';
    const pdf = document.getElementById('fieldPracticePdf')?.value || '';
    const zip = document.getElementById('fieldPracticeZip')?.value || '';
    const pressure = document.getElementById('fieldPracticePressure')?.value || '6';
    const scene = document.getElementById('fieldPracticeHologram')?.value || 'double_cylinder';

    setText('previewPracticeMeta', `VISTA PREVIA EN EL BLOG • ${code} • ${cat}`);
    setText('previewPracticeTitle', title);

    const linkPdf = document.getElementById('linkTestPdf');
    if (linkPdf) linkPdf.href = pdf || '#';
    const linkZip = document.getElementById('linkTestZip');
    if (linkZip) linkZip.href = zip || '#';

    const tagsEl = document.getElementById('previewPracticeStatusTags');
    if (tagsEl) {
      tagsEl.innerHTML = `
        <span class="preview-status-tag">${pdf ? '✅ Guía PDF lista' : '⚠️ Falta PDF'}</span>
        <span class="preview-status-tag ${zip ? '' : 'warn'}">${zip ? '✅ FluidSIM .ZIP listo' : '⚠️ Falta .ZIP'}</span>
        <span class="preview-status-tag">🧊 3D: ${escapeHtml(scene)} (${escapeHtml(pressure)} bar)</span>
      `;
    }
  }

  function populatePracticeForm(index) {
    const p = (portalData.practices || [])[index];
    if (!p) return;
    activePracticeIdx = index;
    setVal('editPracticeIndex', index);
    setText('practiceFormHeading', `Editando [${p.id}]`);
    setVal('fieldPracticeId', p.id);
    setVal('fieldPracticeCode', p.code || p.id);
    setVal('fieldPracticeTitle', p.title);
    setVal('fieldPracticeCategory', p.category);
    syncVisual3dSelection(p.hologramPreset || 'double_cylinder');
    setVal('fieldPracticePressure', p.pressureBar ?? 6);
    setVal('fieldPracticeVoltage', p.voltage || '24V DC');
    setVal('fieldPracticeEquation', p.motionEquation || '');
    setVal('fieldPracticeSummary', p.summary || '');
    setVal('fieldPracticePdf', p.pdfFile || '');
    setVal('fieldPracticeZip', p.zipFile || '');
    setVal('fieldPracticeVideoUrl', p.videoUrl || p.youtubeUrl || '');
    setVal('fieldPracticeObjectives', (p.objectives || []).join('\n'));
    setVal('fieldPracticeSteps', (p.steps || []).join('\n'));
    updatePracticeLivePreview();
    renderPracticesList();
  }

  // 2. VIDEOTECA YOUTUBE
  function renderYoutubeList() {
    const listEl = document.getElementById('adminYoutubeList');
    const q = (document.getElementById('adminYoutubeSearch')?.value || '').trim().toLowerCase();
    const videos = portalData.youtubeVideos || [];

    const catSuggest = document.getElementById('ytCategorySuggestions');
    if (catSuggest) {
      const cats = Array.from(new Set(videos.map((v) => v.category).filter(Boolean)));
      catSuggest.innerHTML = cats.map((c) => `<option value="${escapeHtml(c)}"></option>`).join('');
    }

    if (!listEl) return;
    const filtered = videos
      .map((v, idx) => ({ v, idx }))
      .filter(({ v }) => !q || `${v.id} ${v.title} ${v.category} ${v.relatedCircuit || ''}`.toLowerCase().includes(q));

    listEl.innerHTML = filtered
      .map(
        ({ v, idx }) => `
        <button type="button" class="item-select-btn ${idx === activeYoutubeIdx ? 'active' : ''}" data-select-yt="${idx}">
          <div class="item-id">${escapeHtml(v.id)} • ${escapeHtml(v.relatedCircuit || 'General')}</div>
          <div class="item-title">${escapeHtml(v.title)}</div>
          <div class="item-meta">${escapeHtml(v.category)}</div>
        </button>
      `
      )
      .join('');

    listEl.querySelectorAll('[data-select-yt]').forEach((btn) => {
      btn.addEventListener('click', () => {
        populateYoutubeForm(parseInt(btn.getAttribute('data-select-yt'), 10));
      });
    });
  }

  function populateYoutubeForm(index) {
    const v = (portalData.youtubeVideos || [])[index];
    if (!v) return;
    activeYoutubeIdx = index;
    setVal('editYoutubeIndex', index);
    setText('youtubeFormHeading', `Editando [${v.id}]`);
    setVal('ytIdInput', v.id);
    setVal('ytCategoryInput', v.category);
    setVal('ytTitleInput', v.title);
    setVal('ytUrlInput', v.watchUrl || v.url || '');
    setVal('ytRelatedInput', v.relatedCircuit || '');
    setVal('ytDurationInput', v.duration || '');
    setVal('ytDescInput', v.description || '');
    updateYoutubePreview();
    renderYoutubeList();
  }

  function updateYoutubePreview() {
    const url = document.getElementById('ytUrlInput')?.value || '';
    const title = document.getElementById('ytTitleInput')?.value || 'Vista previa del video';
    const isPlaylist = url.includes('list=');
    const img = document.getElementById('ytAdminPreviewImg');
    if (img) img.src = extractYoutubeThumbnail(url);
    const openLink = document.getElementById('ytAdminOpenLink');
    if (openLink) openLink.href = url || '#';
    setText('ytAdminTypeBadge', isPlaylist ? '📑 Lista de Reproducción' : '🎬 Video Individual');
    setText('ytAdminPreviewTitle', title);
    setText('ytAdminPreviewEmbed', convertWatchUrlToEmbed(url) || 'Pega una URL válida de YouTube');
  }

  // 3. REPOSITORIO POR CARPETAS
  function renderRepositoryManager() {
    const listEl = document.getElementById('adminRepoList');
    const folderBar = document.getElementById('adminRepoFolderBar');
    const q = (document.getElementById('adminRepoSearch')?.value || '').trim().toLowerCase();
    const repo = portalData.resourcesInventory || [];
    const datalist = document.getElementById('repoCategorySuggestions');

    const categories = Array.from(new Set(repo.map((r) => r.category).filter(Boolean)));
    if (datalist) {
      datalist.innerHTML = categories.map((c) => `<option value="${escapeHtml(c)}"></option>`).join('');
    }
    if (activeRepoFolderFilter !== 'ALL' && !categories.includes(activeRepoFolderFilter)) {
      activeRepoFolderFilter = 'ALL';
    }

    if (folderBar) {
      folderBar.innerHTML = [
        `<button type="button" class="chip-filter-btn ${activeRepoFolderFilter === 'ALL' ? 'active' : ''}" data-rfolder="ALL">Todas (${repo.length})</button>`,
        ...categories.map((c) => {
          const count = repo.filter((r) => r.category === c).length;
          return `<button type="button" class="chip-filter-btn ${activeRepoFolderFilter === c ? 'active' : ''}" data-rfolder="${escapeHtml(c)}">📁 ${escapeHtml(c)} (${count})</button>`;
        })
      ].join('');

      folderBar.querySelectorAll('[data-rfolder]').forEach((btn) => {
        btn.addEventListener('click', () => {
          activeRepoFolderFilter = btn.getAttribute('data-rfolder') || 'ALL';
          renderRepositoryManager();
        });
      });
    }

    setText('adminRepoCountBadge', `${repo.length} archivos en ${categories.length} carpetas`);
    if (!listEl) return;

    const filtered = repo
      .map((r, idx) => ({ r, idx }))
      .filter(({ r }) => {
        const fOk = activeRepoFolderFilter === 'ALL' || r.category === activeRepoFolderFilter;
        const qOk = !q || `${r.id} ${r.title} ${r.category} ${r.type}`.toLowerCase().includes(q);
        return fOk && qOk;
      });

    listEl.innerHTML = filtered
      .map(
        ({ r, idx }) => `
        <div class="repo-row">
          <div style="min-width:0;flex:1;">
            <div style="font-size:12px;font-weight:800;color:#0045A3;">[${escapeHtml(r.id)}] • 📂 ${escapeHtml(r.category)}</div>
            <div style="font-size:13px;font-weight:700;color:#0f172a;margin-top:2px;">${escapeHtml(r.title)}</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px;">Formato: ${escapeHtml(r.type)}</div>
          </div>
          <div class="repo-row-actions">
            <button type="button" class="btn-outline" style="padding:6px 10px;font-size:12px;" data-edit-repo="${idx}">✏️ Editar</button>
            <button type="button" class="btn-danger-outline" style="padding:6px 10px;font-size:12px;" data-del-repo="${idx}">🗑️</button>
          </div>
        </div>
      `
      )
      .join('');

    listEl.querySelectorAll('[data-edit-repo]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-edit-repo'), 10);
        const item = portalData.resourcesInventory[idx];
        if (!item) return;
        setVal('editRepoIndex', idx);
        setVal('repoEditId', item.id);
        setVal('repoEditCategory', item.category);
        setVal('repoEditTitle', item.title);
        setVal('repoEditDrive', item.driveUrl || '');
        setVal('repoEditMega', item.megaUrl || '');
        document.getElementById('adminEditRepoForm')?.classList.remove('hidden');
      });
    });

    listEl.querySelectorAll('[data-del-repo]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.getAttribute('data-del-repo'), 10);
        const item = portalData.resourcesInventory[idx];
        if (!item || !window.confirm(`¿Eliminar "${item.title}" del repositorio?`)) return;
        portalData.resourcesInventory.splice(idx, 1);
        document.getElementById('adminEditRepoForm')?.classList.add('hidden');
        await savePortalData(`Recurso ${item.id} eliminado`);
      });
    });
  }

  // 4. INSTITUCIÓN, AUTORÍA Y CRÉDITOS + PREVIEW
  function updateCreditsLivePreview() {
    const devsRaw = document.getElementById('instDevelopersInput')?.value || '';
    const firstLine = devsRaw.split('\n').map((s) => s.trim()).find(Boolean) || 'Mattius Holguín Blanco';
    const email = document.getElementById('instEmailInput')?.value || '';
    const phone = document.getElementById('instPhoneInput')?.value || '';

    setText('previewCreditsNames', firstLine);
    const contactEl = document.getElementById('previewCreditsContact');
    if (contactEl) {
      contactEl.innerHTML = `
        <span class="preview-status-tag">✉️ ${escapeHtml(email)}</span>
        <span class="preview-status-tag">📱 ${escapeHtml(phone)}</span>
      `;
    }
  }

  function populateInstitutionForm() {
    const inst = portalData.institution || {};
    setVal('instNameInput', inst.name);
    setVal('instFacultyInput', inst.faculty);
    setVal('instDepartmentInput', inst.department);
    setVal('instFormerNameInput', inst.formerName);
    setVal('instHeroBadgeInput', inst.heroBadge);
    setVal('instHeroTitleInput', inst.heroTitle);
    setVal('instHeroDescInput', inst.heroDescription);
    setVal('instAnnouncementInput', inst.announcement);
    setVal('instEmailInput', inst.deanEmail || inst.developerEmail);
    setVal('instPhoneInput', inst.contactPhone || inst.developerPhone);
    setVal('instDevelopersInput', (inst.developers || []).join('\n'));
    setVal('instSourceBlogInput', inst.sourceBlogUrl);
    setVal('instYoutubeChannelInput', inst.youtubeChannelUrl);
    updateCreditsLivePreview();
  }

  // 5. AUDITORÍA Y FORTALEZA DE CONTRASEÑA
  function renderAuditTable() {
    const tbody = document.getElementById('adminAuditTableBody');
    if (!tbody) return;
    if (!auditLogs.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#64748b;">Sin eventos registrados aún</td></tr>';
      return;
    }

    tbody.innerHTML = auditLogs
      .map((row) => {
        const isWarn = row.event.includes('FAIL') || row.event.includes('LOCKED') || row.event.includes('REJECTED');
        const isOk = row.event.includes('OK') || row.event.includes('SAVED') || row.event.includes('UPDATED') || row.event.includes('UPLOADED');
        const cls = isWarn ? 'warn' : isOk ? 'ok' : '';
        const timeStr = row.timestamp ? new Date(row.timestamp).toLocaleString('es-CO') : '';
        return `
          <tr>
            <td class="mono">${escapeHtml(timeStr)}</td>
            <td><span class="audit-event-pill ${cls}">${escapeHtml(row.event)}</span></td>
            <td><strong>${escapeHtml(row.username)}</strong></td>
            <td>${escapeHtml(row.detail)}</td>
            <td class="mono">${escapeHtml(row.ip)}</td>
          </tr>
        `;
      })
      .join('');
  }

  function evaluatePasswordStrength(pass) {
    const bar = document.getElementById('passStrengthBar');
    const label = document.getElementById('passStrengthLabel');
    if (!bar || !label) return;
    if (!pass) {
      bar.style.width = '0%';
      label.textContent = 'Fortaleza: escribe al menos 8 caracteres';
      return;
    }
    let score = 0;
    if (pass.length >= 8) score++;
    if (pass.length >= 12) score++;
    if (/[A-Z]/.test(pass) && /[a-z]/.test(pass)) score++;
    if (/\d/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;

    const stages = [
      { pct: '20%', color: '#dc2626', text: 'Muy débil (usa mínimo 8 caracteres)' },
      { pct: '40%', color: '#f97316', text: 'Débil (agrega mayúsculas y números)' },
      { pct: '65%', color: '#eab308', text: 'Media (puedes agregar un símbolo)' },
      { pct: '85%', color: '#16a34a', text: 'Fuerte (buena seguridad)' },
      { pct: '100%', color: '#15803d', text: 'Excelente (contraseña muy robusta)' }
    ];
    const st = stages[Math.min(Math.max(score - 1, 0), stages.length - 1)];
    bar.style.width = st.pct;
    bar.style.background = st.color;
    label.textContent = `Fortaleza: ${st.text}`;
  }

  function handleSelectedUploadFile(file) {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['pdf', 'zip', 'ct'].includes(ext)) {
      showToast('⚠️ Formato no válido. Solo se permiten .pdf, .zip o .ct');
      return;
    }
    const mb = (file.size / (1024 * 1024)).toFixed(2);
    setText('dropzoneTitle', `Archivo listo: ${file.name}`);
    setText('dropzoneSub', `Tamaño: ${mb} MB • Formato .${ext.toUpperCase()} listo para validar`);

    const titleEl = document.getElementById('uploadResourceTitle');
    if (titleEl && !titleEl.value.trim()) {
      titleEl.value = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
    }
    const idEl = document.getElementById('uploadResourceId');
    if (idEl && !idEl.value.trim()) {
      const m = file.name.match(/(CIR|CASO|PRAC|FUND)[_-]?(\d+)/i);
      if (m) idEl.value = `${m[1].toUpperCase()}-${m[2]}`;
    }
  }

  // ==========================================================================
  // EVENTOS DE LA CONSOLA EDITORIAL
  // ==========================================================================
  function bindEvents() {
    ['mousemove', 'keydown', 'click'].forEach((ev) => {
      document.addEventListener(ev, resetIdleTimer, { passive: true });
    });

    window.addEventListener('beforeunload', (e) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    document.getElementById('btnTogglePass')?.addEventListener('click', () => {
      const inp = document.getElementById('loginPassword');
      if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
    });

    document.getElementById('adminLoginForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('loginUsername').value.trim();
      const password = document.getElementById('loginPassword').value;
      const errEl = document.getElementById('loginErrorBanner');
      errEl?.classList.add('hidden');

      try {
        const res = await fetch('/api/admin/login', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const result = await res.json();
        if (!res.ok || !result.ok) {
          if (errEl) {
            errEl.textContent = result.error || 'Credenciales incorrectas';
            errEl.classList.remove('hidden');
          }
          return;
        }
        document.getElementById('loginPassword').value = '';
        showWorkspace(result.username, result.csrfToken, result.mustChangePassword);
        await loadAdminData();
        showToast('🔓 Sesión iniciada con seguridad CSRF');
      } catch (err) {
        if (errEl) {
          errEl.textContent = 'Error de conexión con el servidor.';
          errEl.classList.remove('hidden');
        }
      }
    });

    document.getElementById('btnAdminLogout')?.addEventListener('click', async () => {
      if (isDirty && !window.confirm('Tienes cambios sin guardar. ¿Seguro que deseas salir?')) return;
      await apiFetch('/api/admin/logout', { method: 'POST' }).catch(() => {});
      showAuthGate('');
      showToast('🔒 Sesión bloqueada');
    });

    document.getElementById('btnGoChangeInitialPass')?.addEventListener('click', () => {
      switchSection('sec-security');
      document.getElementById('secCurrentPassword')?.focus();
    });

    document.querySelectorAll('.nav-item-btn').forEach((btn) => {
      btn.addEventListener('click', () => switchSection(btn.getAttribute('data-section')));
    });

    document.querySelectorAll('[data-jump-sec]').forEach((btn) => {
      btn.addEventListener('click', () => switchSection(btn.getAttribute('data-jump-sec')));
    });

    document.getElementById('btnRefreshOverview')?.addEventListener('click', async () => {
      await Promise.all([refreshOverviewMetrics(), refreshAuditLogs(), refreshServerFiles()]);
      renderAllAdminViews();
      showToast('🔄 Métricas y diagnóstico actualizados');
    });

    // Búsquedas
    document.getElementById('adminPracticeSearch')?.addEventListener('input', renderPracticesList);
    document.getElementById('adminYoutubeSearch')?.addEventListener('input', renderYoutubeList);
    document.getElementById('adminRepoSearch')?.addEventListener('input', renderRepositoryManager);

    // Dirty tracking & Vista Previa en Circuitos
    const practiceForm = document.getElementById('adminPracticeForm');
    practiceForm?.addEventListener('input', () => {
      markDirty(true);
      updatePracticeLivePreview();
    });

    document.querySelectorAll('#visual3dPicker .visual-3d-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        syncVisual3dSelection(btn.getAttribute('data-3d-val'));
        markDirty(true);
        updatePracticeLivePreview();
      });
    });

    document.getElementById('pickerPracticePdf')?.addEventListener('change', (e) => {
      if (e.target.value) {
        setVal('fieldPracticePdf', e.target.value);
        markDirty(true);
        updatePracticeLivePreview();
      }
    });

    document.getElementById('pickerPracticeZip')?.addEventListener('change', (e) => {
      if (e.target.value) {
        setVal('fieldPracticeZip', e.target.value);
        markDirty(true);
        updatePracticeLivePreview();
      }
    });

    document.getElementById('btnNewPractice')?.addEventListener('click', () => {
      const nextNum = (portalData.practices?.length || 0) + 1;
      portalData.practices.push({
        id: `CIR-${nextNum}`,
        code: `CIRCUITO Nº ${nextNum}`,
        title: `Nuevo Circuito Electroneumático #${nextNum}`,
        category: 'Circuitos 1 Cilindro (Nº 1-10)',
        difficulty: 'Intermedio',
        duration: '2 Horas',
        pressureBar: 6.0,
        voltage: '24V DC',
        motionEquation: 'S1 → K1 → Y1 (A+) → S2 → Y2 (A-)',
        hologramPreset: 'double_cylinder',
        summary: 'Descripción técnica del nuevo circuito.',
        objectives: ['Validar diagrama DIN ISO 1219 y lógica eléctrica en FluidSIM.'],
        steps: ['Paso 1: Presurizar FRL a 6 bar.', 'Paso 2: Accionar mando y verificar carrera.'],
        components: [{ item: '0Z1', name: 'Unidad FRL', norm: 'ISO 1219-1', refFesto: 'LFR-1/4-D-MINI', qty: 1, spec: '6 bar' }],
        pdfFile: serverFiles.pdfs[0] || '',
        zipFile: serverFiles.zips[0] || ''
      });
      activePracticeCategory = 'ALL';
      renderPracticesCategoryBar();
      populatePracticeForm(portalData.practices.length - 1);
      markDirty(true);
      showToast('✨ Borrador creado. Completa y guarda los cambios.');
    });

    document.getElementById('btnDuplicatePractice')?.addEventListener('click', () => {
      const orig = (portalData.practices || [])[activePracticeIdx];
      if (!orig) return;
      const copy = JSON.parse(JSON.stringify(orig));
      copy.id = `${orig.id}-COPIA`;
      copy.title = `${orig.title} (Copia)`;
      portalData.practices.splice(activePracticeIdx + 1, 0, copy);
      populatePracticeForm(activePracticeIdx + 1);
      markDirty(true);
      showToast('📋 Circuito duplicado. Recuerda guardar.');
    });

    practiceForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const idx = parseInt(document.getElementById('editPracticeIndex').value, 10);
      const existing = portalData.practices[idx] || {};

      portalData.practices[idx] = {
        ...existing,
        id: document.getElementById('fieldPracticeId').value.trim(),
        code: document.getElementById('fieldPracticeCode').value.trim(),
        title: document.getElementById('fieldPracticeTitle').value.trim(),
        category: document.getElementById('fieldPracticeCategory').value.trim(),
        hologramPreset: document.getElementById('fieldPracticeHologram').value,
        pressureBar: parseFloat(document.getElementById('fieldPracticePressure').value) || 6.0,
        voltage: document.getElementById('fieldPracticeVoltage').value.trim(),
        motionEquation: document.getElementById('fieldPracticeEquation').value.trim(),
        summary: document.getElementById('fieldPracticeSummary').value.trim(),
        pdfFile: document.getElementById('fieldPracticePdf').value.trim(),
        zipFile: document.getElementById('fieldPracticeZip').value.trim(),
        videoUrl: document.getElementById('fieldPracticeVideoUrl').value.trim(),
        objectives: document.getElementById('fieldPracticeObjectives').value.split('\n').map((s) => s.trim()).filter(Boolean),
        steps: document.getElementById('fieldPracticeSteps').value.split('\n').map((s) => s.trim()).filter(Boolean)
      };

      await savePortalData(`Circuito ${portalData.practices[idx].id} guardado`);
      populatePracticeForm(idx);
    });

    document.getElementById('btnDeletePractice')?.addEventListener('click', async () => {
      if ((portalData.practices || []).length <= 1) {
        showToast('⚠️ Debe existir al menos un circuito en el portal.');
        return;
      }
      const target = portalData.practices[activePracticeIdx];
      if (!target || !window.confirm(`¿Eliminar definitivamente "${target.title}"?`)) return;
      portalData.practices.splice(activePracticeIdx, 1);
      activePracticeIdx = 0;
      await savePortalData(`Circuito ${target.id} eliminado`);
      populatePracticeForm(0);
    });

    // Videoteca YouTube
    document.getElementById('ytUrlInput')?.addEventListener('input', () => {
      markDirty(true);
      updateYoutubePreview();
    });
    document.getElementById('ytTitleInput')?.addEventListener('input', () => {
      markDirty(true);
      updateYoutubePreview();
    });

    document.getElementById('btnNewYoutubeVideo')?.addEventListener('click', () => {
      activeYoutubeIdx = -1;
      setVal('editYoutubeIndex', -1);
      setText('youtubeFormHeading', 'Agregar Nuevo Video o Playlist');
      setVal('ytIdInput', `VID-0${(portalData.youtubeVideos?.length || 0) + 1}`);
      setVal('ytCategoryInput', 'Prácticas en Banco FESTO');
      setVal('ytTitleInput', '');
      setVal('ytUrlInput', '');
      setVal('ytRelatedInput', '');
      setVal('ytDurationInput', 'Video HD');
      setVal('ytDescInput', '');
      updateYoutubePreview();
      renderYoutubeList();
    });

    document.getElementById('adminYoutubeForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const idx = parseInt(document.getElementById('editYoutubeIndex').value, 10);
      const watchUrl = document.getElementById('ytUrlInput').value.trim();
      const videoObj = {
        id: document.getElementById('ytIdInput').value.trim(),
        category: document.getElementById('ytCategoryInput').value.trim(),
        title: document.getElementById('ytTitleInput').value.trim(),
        watchUrl,
        embedUrl: convertWatchUrlToEmbed(watchUrl),
        relatedCircuit: document.getElementById('ytRelatedInput').value.trim() || 'Curso General',
        duration: document.getElementById('ytDurationInput').value.trim() || 'Video HD',
        description: document.getElementById('ytDescInput').value.trim()
      };

      if (!Array.isArray(portalData.youtubeVideos)) portalData.youtubeVideos = [];
      if (idx >= 0 && portalData.youtubeVideos[idx]) {
        portalData.youtubeVideos[idx] = { ...portalData.youtubeVideos[idx], ...videoObj };
      } else {
        portalData.youtubeVideos.push(videoObj);
        activeYoutubeIdx = portalData.youtubeVideos.length - 1;
      }

      await savePortalData(`Video ${videoObj.id} publicado`);
      populateYoutubeForm(activeYoutubeIdx);
    });

    document.getElementById('btnDeleteYoutubeVideo')?.addEventListener('click', async () => {
      if (activeYoutubeIdx < 0 || !(portalData.youtubeVideos || [])[activeYoutubeIdx]) return;
      const target = portalData.youtubeVideos[activeYoutubeIdx];
      if (!window.confirm(`¿Eliminar el video "${target.title}"?`)) return;
      portalData.youtubeVideos.splice(activeYoutubeIdx, 1);
      activeYoutubeIdx = Math.max(0, portalData.youtubeVideos.length - 1);
      await savePortalData(`Video ${target.id} eliminado`);
      if (portalData.youtubeVideos.length > 0) populateYoutubeForm(activeYoutubeIdx);
    });

    // Dropzone de subida de archivos
    const fileInput = document.getElementById('uploadFileInput');
    const dropzone = document.getElementById('repoDropzone');
    fileInput?.addEventListener('change', (e) => {
      handleSelectedUploadFile(e.target.files?.[0]);
    });
    dropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      const file = e.dataTransfer?.files?.[0];
      if (file && fileInput) {
        const dt = new DataTransfer();
        dt.items.add(file);
        fileInput.files = dt.files;
        handleSelectedUploadFile(file);
      }
    });

    document.getElementById('adminFileUploadForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const file = fileInput?.files?.[0];
      if (!file) {
        showToast('⚠️ Selecciona un archivo .pdf, .zip o .ct primero');
        return;
      }

      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const lower = file.name.toLowerCase();
          const isZip = lower.endsWith('.zip') || lower.endsWith('.ct');
          const { res, data } = await apiFetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filename: file.name,
              categoryType: isZip ? 'zip' : 'pdf',
              base64Data: reader.result
            })
          });
          if (!res.ok || !data.ok) throw new Error(data.error || 'Archivo rechazado');

          const newItem = {
            id: document.getElementById('uploadResourceId').value.trim(),
            title: document.getElementById('uploadResourceTitle').value.trim(),
            type: isZip ? 'ZIP (FluidSIM)' : 'PDF',
            category: document.getElementById('uploadResourceCategory').value.trim(),
            path: data.path,
            pdfFile: isZip ? '' : data.path,
            zipFile: isZip ? data.path : '',
            filename: data.filename,
            status: 'Publicado desde Consola Admin',
            requiredData: document.getElementById('uploadResourceNotes').value.trim()
          };

          if (!Array.isArray(portalData.resourcesInventory)) portalData.resourcesInventory = [];
          portalData.resourcesInventory.unshift(newItem);

          const linkIdx = document.getElementById('uploadLinkPracticeSelect').value;
          if (linkIdx !== '' && portalData.practices[parseInt(linkIdx, 10)]) {
            const p = portalData.practices[parseInt(linkIdx, 10)];
            if (isZip) p.zipFile = data.path;
            else p.pdfFile = data.path;
          }

          await savePortalData(`Archivo ${data.filename} validado y publicado`);
          e.target.reset();
          setText('dropzoneTitle', 'Haz clic aquí o arrastra un archivo .PDF / .ZIP / .CT');
          setText('dropzoneSub', 'Máximo 50 MB • Se validará cabecera binaria automáticamente');
        } catch (err) {
          showToast('❌ ' + err.message);
        }
      };
      reader.readAsDataURL(file);
    });

    document.getElementById('btnCancelRepoEdit')?.addEventListener('click', () => {
      document.getElementById('adminEditRepoForm')?.classList.add('hidden');
    });

    document.getElementById('adminEditRepoForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const idx = parseInt(document.getElementById('editRepoIndex').value, 10);
      const item = portalData.resourcesInventory?.[idx];
      if (!item) return;

      item.id = document.getElementById('repoEditId').value.trim();
      item.category = document.getElementById('repoEditCategory').value.trim();
      item.title = document.getElementById('repoEditTitle').value.trim();
      item.driveUrl = document.getElementById('repoEditDrive').value.trim();
      item.megaUrl = document.getElementById('repoEditMega').value.trim();

      document.getElementById('adminEditRepoForm')?.classList.add('hidden');
      await savePortalData(`Recurso ${item.id} actualizado`);
    });

    // Institución, Autoría & Preview en vivo
    const instForm = document.getElementById('adminInstitutionForm');
    instForm?.addEventListener('input', () => {
      markDirty(true);
      updateCreditsLivePreview();
    });

    instForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const inst = (portalData.institution ||= {});
      inst.name = document.getElementById('instNameInput').value.trim();
      inst.faculty = document.getElementById('instFacultyInput').value.trim();
      inst.department = document.getElementById('instDepartmentInput').value.trim();
      inst.formerName = document.getElementById('instFormerNameInput').value.trim();
      inst.heroBadge = document.getElementById('instHeroBadgeInput').value.trim();
      inst.heroTitle = document.getElementById('instHeroTitleInput').value.trim();
      inst.heroDescription = document.getElementById('instHeroDescInput').value.trim();
      inst.announcement = document.getElementById('instAnnouncementInput').value.trim();

      const email = document.getElementById('instEmailInput').value.trim();
      const phone = document.getElementById('instPhoneInput').value.trim();
      inst.deanEmail = email;
      inst.developerEmail = email;
      inst.contactPhone = phone;
      inst.developerPhone = phone;

      const devLines = document.getElementById('instDevelopersInput').value.split('\n').map((s) => s.trim()).filter(Boolean);
      if (devLines.length > 0) inst.developers = devLines;

      inst.sourceBlogUrl = document.getElementById('instSourceBlogInput').value.trim();
      inst.youtubeChannelUrl = document.getElementById('instYoutubeChannelInput').value.trim();

      await savePortalData('Textos, autoría y créditos publicados');
    });

    // Seguridad: Fortaleza de contraseña + cambio de credenciales + revocar sesiones + auditoría
    document.getElementById('secNewPassword')?.addEventListener('input', (e) => {
      evaluatePasswordStrength(e.target.value);
    });

    document.getElementById('adminChangeCredsForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const currentPassword = document.getElementById('secCurrentPassword').value;
      const newUsername = document.getElementById('secNewUsername').value.trim();
      const newPassword = document.getElementById('secNewPassword').value;
      const confirmPassword = document.getElementById('secConfirmPassword').value;

      if (newPassword && newPassword !== confirmPassword) {
        showToast('⚠️ Las nuevas contraseñas no coinciden');
        return;
      }

      try {
        const { res, data } = await apiFetch('/api/admin/change-credentials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentPassword, newUsername, newPassword })
        });
        if (!res.ok || !data.ok) {
          showToast('❌ ' + (data.error || 'No se pudieron actualizar'));
          return;
        }
        currentUsername = data.username;
        if (data.csrfToken) csrfToken = data.csrfToken;
        mustChangePassword = Boolean(data.mustChangePassword);
        document.getElementById('mustChangeBanner')?.classList.toggle('hidden', !mustChangePassword);
        setText('topbarUsernamePill', `👤 ${currentUsername}`);
        e.target.reset();
        evaluatePasswordStrength('');
        setVal('secNewUsername', currentUsername);
        await refreshAuditLogs();
        showToast('🔑 Credenciales actualizadas y sesiones renovadas');
      } catch (err) {
        showToast('❌ ' + err.message);
      }
    });

    document.getElementById('btnRevokeOtherSessions')?.addEventListener('click', async () => {
      try {
        const { res, data } = await apiFetch('/api/admin/logout-all', { method: 'POST' });
        if (res.ok && data.ok) {
          if (data.csrfToken) csrfToken = data.csrfToken;
          await refreshAuditLogs();
          showToast(`🔄 Token rotado y ${data.revokedCount || 0} sesión(es) externa(s) cerradas`);
        }
      } catch (err) {
        showToast('❌ ' + err.message);
      }
    });

    document.getElementById('btnRefreshAudit')?.addEventListener('click', async () => {
      await refreshAuditLogs();
      showToast('📋 Registro de auditoría actualizado');
    });

    document.getElementById('btnDownloadMasterJson')?.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(portalData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'iub_portal_data.json';
      a.click();
      URL.revokeObjectURL(url);
      showToast('📥 Respaldo iub_portal_data.json descargado');
    });

    document.getElementById('importMasterJsonInput')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        if (!parsed || !parsed.institution || !Array.isArray(parsed.practices)) {
          throw new Error('Estructura JSON incompatible');
        }
        if (!window.confirm(`¿Aplicar "${file.name}" (${parsed.practices.length} circuitos)?`)) return;
        portalData = parsed;
        await savePortalData('Base de datos JSON importada');
      } catch (err) {
        showToast('❌ JSON inválido: ' + err.message);
      } finally {
        e.target.value = '';
      }
    });

    document.getElementById('btnFactoryReset')?.addEventListener('click', async () => {
      if (!window.confirm('¿Restaurar toda la data original desde el script de fábrica?')) return;
      try {
        const { res, data } = await apiFetch('/api/reset', { method: 'POST' });
        if (res.ok && data.ok && data.data) {
          portalData = data.data;
          activePracticeIdx = 0;
          activeYoutubeIdx = 0;
          await Promise.all([refreshOverviewMetrics(), refreshAuditLogs(), refreshServerFiles()]);
          renderAllAdminViews();
          populatePracticeForm(0);
          markDirty(false);
          showToast('🔄 Data restaurada desde el script inicial');
        }
      } catch (err) {
        showToast('❌ ' + err.message);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    bootstrapAdmin();
  });
})();
