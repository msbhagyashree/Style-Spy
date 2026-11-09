// popup.js – Style Spy Extension Popup Controller
'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────
const state = {
  currentTab: null,       // Active Chrome tab
  colours: [],            // Extracted colour results
  fonts: [],              // Extracted font results
  pageUrl: '',            // Current page URL
  pageTitle: '',          // Current page title
  hasData: false,         // Whether analysis has been run
  kits: [],               // Saved style kits (loaded from storage)
  renameKitId: null,      // ID of the kit currently being renamed
  viewKitId: null,        // ID of the kit currently being viewed
  exportKitId: null       // ID of the kit being exported (null = current analysis)
};

// ─────────────────────────────────────────────────────────────────────────────
// DOM References
// ─────────────────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const ui = {
  siteDomain:       $('siteDomain'),
  coloursContent:   $('coloursContent'),
  fontsContent:     $('fontsContent'),
  kitsContent:      $('kitsContent'),
  toast:            $('toast'),
  loadingOverlay:   $('loadingOverlay'),
  btnAnalyze:       $('btnAnalyze'),
  btnSaveKit:       $('btnSaveKit'),
  btnExportCSS:     $('btnExportCSS'),
  // Save kit modal
  saveKitModal:     $('saveKitModal'),
  kitNameInput:     $('kitNameInput'),
  kitNameHint:      $('kitNameHint'),
  saveKitConfirm:   $('saveKitConfirm'),
  saveKitCancel:    $('saveKitCancel'),
  saveKitClose:     $('saveKitClose'),
  // Rename kit modal
  renameKitModal:   $('renameKitModal'),
  renameKitInput:   $('renameKitInput'),
  renameKitConfirm: $('renameKitConfirm'),
  renameKitCancel:  $('renameKitCancel'),
  renameKitClose:   $('renameKitClose'),
  // Export modal
  exportModal:      $('exportModal'),
  cssPreview:       $('cssPreview'),
  exportCopyCSS:    $('exportCopyCSS'),
  exportDownloadCSS:$('exportDownloadCSS'),
  exportCancel:     $('exportCancel'),
  exportClose:      $('exportClose'),
  // View kit modal
  viewKitModal:     $('viewKitModal'),
  viewKitTitle:     $('viewKitTitle'),
  viewKitMeta:      $('viewKitMeta'),
  viewKitBody:      $('viewKitBody'),
  viewKitClose:     $('viewKitClose'),
  viewKitCloseBtn:  $('viewKitCloseBtn'),
  viewKitExport:    $('viewKitExport')
};

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

/** Show a toast notification */
let toastTimer = null;
function showToast(message, type = 'default') {
  clearTimeout(toastTimer);
  ui.toast.textContent = message;
  ui.toast.className = `toast show${type !== 'default' ? ' ' + type : ''}`;
  toastTimer = setTimeout(() => {
    ui.toast.className = 'toast';
  }, 2200);
}

/** Copy text to clipboard and handle feedback */
async function copyToClipboard(text, label, btn) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(`Copied: ${label}`, 'success');
    if (btn) {
      const original = btn.textContent;
      btn.textContent = '✓ Copied';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = original;
        btn.classList.remove('copied');
      }, 1800);
    }
    return true;
  } catch {
    showToast('Copy failed. Please copy manually.', 'error');
    return false;
  }
}

/** Extract domain from a URL */
function getDomain(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

/** Generate a unique kit ID */
function generateId() {
  return 'kit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}

/** Format a timestamp as a readable date */
function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Escape HTML special characters */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Convert a colour HEX to a CSS-safe variable name */
function hexToVarName(hex, index) {
  return `--color-${index + 1}`;
}

/** Convert a font family string to a CSS-safe variable name */
function fontToVarName(family, usage) {
  const clean = family.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const role = usage === 'heading' ? 'heading' : 'body';
  return `--font-${clean}-${role}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage Helpers
// ─────────────────────────────────────────────────────────────────────────────

function loadKits() {
  return new Promise((resolve) => {
    chrome.storage.local.get('styleSpyKits', (result) => {
      state.kits = result.styleSpyKits || [];
      resolve(state.kits);
    });
  });
}

function saveKitsToStorage() {
  return new Promise((resolve) => {
    chrome.storage.local.set({ styleSpyKits: state.kits }, resolve);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CSS Generation
// ─────────────────────────────────────────────────────────────────────────────

function generateCSS(colours, fonts, kitName, sourceUrl) {
  const lines = [];
  const name = kitName || getDomain(sourceUrl || '') || 'Style Kit';
  const url = sourceUrl || '';
  const dateStr = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

  lines.push(`/*`);
  lines.push(` * Style Kit: ${name}`);
  if (url) lines.push(` * Source:    ${url}`);
  lines.push(` * Generated: ${dateStr} by Style Spy`);
  lines.push(` */`);
  lines.push('');
  lines.push(':root {');

  // Colours
  if (colours && colours.length > 0) {
    lines.push('  /* ── Colours ── */');
    colours.slice(0, 20).forEach((c, i) => {
      const varName = hexToVarName(c.hex, i);
      const rgb = c.rgb || '';
      const comment = rgb ? ` /* ${rgb} */` : '';
      lines.push(`  ${varName}: ${c.hex};${comment}`);
    });
  }

  // Fonts
  if (fonts && fonts.length > 0) {
    lines.push('');
    lines.push('  /* ── Typography ── */');
    const seen = new Set();
    let fontIndex = 1;
    fonts.slice(0, 10).forEach((f) => {
      const family = f.fontFamily;
      if (!seen.has(family)) {
        seen.add(family);
        const fullStack = f.fontFamilyFull || `"${family}", sans-serif`;
        lines.push(`  --font-family-${fontIndex}: ${fullStack};`);
        fontIndex++;
      }
    });

    lines.push('');
    fonts.slice(0, 10).forEach((f, i) => {
      const base = `--font-${i + 1}`;
      const family = f.fontFamily;
      const fullStack = f.fontFamilyFull || `"${family}", sans-serif`;
      lines.push(`  ${base}-family: ${fullStack};`);
      lines.push(`  ${base}-size: ${f.fontSize};`);
      lines.push(`  ${base}-weight: ${f.fontWeight};`);
      if (f.lineHeight && f.lineHeight !== 'normal') {
        lines.push(`  ${base}-line-height: ${f.lineHeight};`);
      }
      lines.push('');
    });
  }

  lines.push('}');
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab Initialisation
// ─────────────────────────────────────────────────────────────────────────────

async function initActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError || !tabs || !tabs.length) {
        state.currentTab = null;
        ui.siteDomain.textContent = '—';
        resolve(null);
        return;
      }
      const tab = tabs[0];
      state.currentTab = tab;
      state.pageUrl = tab.url || '';

      // Detect restricted pages
      if (
        tab.url.startsWith('chrome://') ||
        tab.url.startsWith('chrome-extension://') ||
        tab.url.startsWith('about:') ||
        tab.url.startsWith('edge://')
      ) {
        ui.siteDomain.textContent = 'Restricted page';
        showRestrictedPageMessage();
        resolve(null);
        return;
      }

      ui.siteDomain.textContent = getDomain(tab.url);
      resolve(tab);
    });
  });
}

function showRestrictedPageMessage() {
  const msg = `
    <div class="empty-state">
      <div class="empty-icon">🚫</div>
      <p class="empty-title">Restricted Page</p>
      <p class="empty-desc">Style Spy cannot access Chrome system pages.<br>Navigate to a normal website and click <strong>Analyze Page</strong>.</p>
    </div>`;
  ui.coloursContent.innerHTML = msg;
  ui.fontsContent.innerHTML = msg;
}

// ─────────────────────────────────────────────────────────────────────────────
// Analysis
// ─────────────────────────────────────────────────────────────────────────────

async function analyzeCurrentPage() {
  if (!state.currentTab) {
    showToast('No active tab found.', 'error');
    return;
  }

  const tab = state.currentTab;

  if (
    tab.url.startsWith('chrome://') ||
    tab.url.startsWith('chrome-extension://') ||
    tab.url.startsWith('about:') ||
    tab.url.startsWith('edge://')
  ) {
    showToast('Cannot analyze Chrome system pages.', 'error');
    return;
  }

  // Show loading
  ui.loadingOverlay.hidden = false;
  ui.btnAnalyze.disabled = true;

  try {
    // Inject content script (safe to re-inject; the script guards against
    // duplicate listener registration with window.__styleSpyListenerAttached)
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });

    // Small delay to ensure the script is fully registered before messaging
    await new Promise((r) => setTimeout(r, 80));

    const response = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Analysis timed out. The page may be loading slowly or blocking scripts.'));
      }, 15000);

      chrome.tabs.sendMessage(tab.id, { action: 'extractStyles' }, (res) => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(res);
        }
      });
    });

    if (!response || !response.success) {
      throw new Error(response?.error || 'Extraction failed. The page may have blocked script injection.');
    }

    state.colours   = response.colours || [];
    state.fonts     = response.fonts || [];
    state.pageUrl   = response.url || tab.url;
    state.pageTitle = response.title || getDomain(tab.url);
    state.hasData   = true;

    renderColours(state.colours);
    renderFonts(state.fonts);

    ui.btnSaveKit.disabled   = false;
    ui.btnExportCSS.disabled = false;

    showToast(
      `Found ${state.colours.length} colours & ${state.fonts.length} font styles`,
      'success'
    );

  } catch (err) {
    console.error('[Style Spy] Analysis error:', err);
    showToast('Analysis failed: ' + (err.message || 'Unknown error'), 'error');
    renderError(err.message);
  } finally {
    ui.loadingOverlay.hidden = true;
    ui.btnAnalyze.disabled   = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Render Colours
// ─────────────────────────────────────────────────────────────────────────────

function renderColours(colours) {
  if (!colours || colours.length === 0) {
    ui.coloursContent.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎨</div>
        <p class="empty-title">No colours found</p>
        <p class="empty-desc">The page may use only system colours or very few visible elements.</p>
      </div>`;
    return;
  }

  const maxCount = colours[0].count || 1;

  const html = `
    <div class="section-header">
      <span class="section-title">Colours</span>
      <span class="section-count">${colours.length} found</span>
    </div>
    <div class="colour-grid" id="colourGrid">
      ${colours.map((c, i) => {
        const barWidth = Math.max(4, Math.round((c.count / maxCount) * 100));
        return `
          <div class="colour-card" data-hex="${escHtml(c.hex)}" data-rgb="${escHtml(c.rgb)}" title="Click to copy HEX">
            <span class="rank-badge">#${i + 1}</span>
            <div class="colour-swatch" style="background:${c.hex}" aria-label="${c.hex} colour swatch"></div>
            <div class="colour-info">
              <div class="colour-hex">${escHtml(c.hex)}</div>
              <div class="colour-rgb">${escHtml(c.rgb)}</div>
              <div class="colour-stats">
                <span class="colour-count">${c.count} uses</span>
                <div class="colour-bar" role="progressbar" aria-valuenow="${barWidth}" aria-valuemin="0" aria-valuemax="100">
                  <div class="colour-bar-fill" style="width:${barWidth}%;background:${c.hex}"></div>
                </div>
                <span class="colour-percentage">${c.percentage}%</span>
              </div>
            </div>
            <button class="copy-btn" data-copy="${escHtml(c.hex)}" aria-label="Copy ${c.hex}">Copy</button>
          </div>`;
      }).join('')}
    </div>`;

  ui.coloursContent.innerHTML = html;
  attachColourCardListeners();
}

function attachColourCardListeners() {
  const grid = document.getElementById('colourGrid');
  if (!grid) return;

  grid.addEventListener('click', async (e) => {
    const copyBtn = e.target.closest('.copy-btn');
    const card    = e.target.closest('.colour-card');

    if (copyBtn) {
      e.stopPropagation();
      const hex = copyBtn.dataset.copy;
      await copyToClipboard(hex, hex, copyBtn);
      return;
    }

    if (card) {
      const hex = card.dataset.hex;
      const copyBtn = card.querySelector('.copy-btn');
      await copyToClipboard(hex, hex, copyBtn);
      card.classList.add('copied');
      setTimeout(() => card.classList.remove('copied'), 1800);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Render Fonts
// ─────────────────────────────────────────────────────────────────────────────

function renderFonts(fonts) {
  if (!fonts || fonts.length === 0) {
    ui.fontsContent.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔤</div>
        <p class="empty-title">No fonts found</p>
        <p class="empty-desc">The page may not have visible text elements.</p>
      </div>`;
    return;
  }

  const html = `
    <div class="section-header">
      <span class="section-title">Fonts</span>
      <span class="section-count">${fonts.length} styles</span>
    </div>
    <div class="font-list" id="fontList">
      ${fonts.map((f, i) => {
        const cssCopy = buildFontCSS(f);
        const preview = escHtml(f.sampleText || 'The quick brown fox');
        const previewStyle = buildPreviewStyle(f);
        const weightLabel = getFontWeightLabel(f.fontWeight);
        return `
          <div class="font-card" data-index="${i}">
            <div class="font-card-meta">
              <div class="font-details">
                <div class="font-family">${escHtml(f.fontFamily)}</div>
                <div class="font-tags">
                  <span class="font-tag weight" title="Font weight">${f.fontWeight} ${weightLabel}</span>
                  <span class="font-tag size"   title="Font size">${escHtml(f.fontSize)}</span>
                  ${f.lineHeight && f.lineHeight !== 'normal' ? `<span class="font-tag lh" title="Line height">lh ${escHtml(f.lineHeight)}</span>` : ''}
                </div>
              </div>
              <span class="font-count">${f.count} elements</span>
            </div>
            <div class="font-preview">
              <div class="font-preview-text" style="${previewStyle}" aria-label="Font preview">${preview}</div>
            </div>
            <div class="font-actions">
              <button class="copy-btn" data-copy-font="${i}" aria-label="Copy CSS for ${f.fontFamily}">Copy CSS</button>
            </div>
          </div>`;
      }).join('')}
    </div>`;

  ui.fontsContent.innerHTML = html;
  attachFontListListeners(fonts);
}

function buildFontCSS(f) {
  const lines = [
    `font-family: ${f.fontFamilyFull || '"' + f.fontFamily + '", sans-serif'};`,
    `font-size: ${f.fontSize};`,
    `font-weight: ${f.fontWeight};`
  ];
  if (f.lineHeight && f.lineHeight !== 'normal') {
    lines.push(`line-height: ${f.lineHeight};`);
  }
  return lines.join('\n');
}

function buildPreviewStyle(f) {
  const family = f.fontFamilyFull || f.fontFamily;
  const size   = Math.min(parseFloat(f.fontSize), 22) + 'px';
  const weight = f.fontWeight;
  return `font-family:${family};font-size:${size};font-weight:${weight};`;
}

function getFontWeightLabel(weight) {
  const map = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular',
                500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };
  return map[parseInt(weight, 10)] || '';
}

function attachFontListListeners(fonts) {
  const list = document.getElementById('fontList');
  if (!list) return;

  list.addEventListener('click', async (e) => {
    const copyBtn = e.target.closest('.copy-btn[data-copy-font]');
    if (copyBtn) {
      const idx = parseInt(copyBtn.dataset.copyFont, 10);
      const f   = fonts[idx];
      if (!f) return;
      const css = buildFontCSS(f);
      await copyToClipboard(css, f.fontFamily + ' CSS', copyBtn);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Render Error
// ─────────────────────────────────────────────────────────────────────────────

function renderError(msg) {
  const html = `
    <div class="empty-state">
      <div class="empty-icon">⚠️</div>
      <p class="empty-title">Analysis failed</p>
      <p class="empty-desc">${escHtml(msg)}</p>
    </div>`;
  ui.coloursContent.innerHTML = html;
  ui.fontsContent.innerHTML   = html;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab Switching
// ─────────────────────────────────────────────────────────────────────────────

function initTabs() {
  const tabs   = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.panel');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach(  (t) => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
      panels.forEach((p) => p.classList.remove('active'));

      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      const panelId = 'panel-' + tab.dataset.tab;
      const panel = document.getElementById(panelId);
      if (panel) panel.classList.add('active');

      // Reload kits when switching to that tab
      if (tab.dataset.tab === 'kits') renderKits();
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Save Kit
// ─────────────────────────────────────────────────────────────────────────────

function openSaveKitModal() {
  if (!state.hasData) {
    showToast('Analyze a page first.', 'error');
    return;
  }
  // Pre-fill kit name with page title / domain
  ui.kitNameInput.value = state.pageTitle || getDomain(state.pageUrl) || '';
  ui.kitNameHint.textContent = '';
  ui.saveKitModal.hidden = false;
  ui.kitNameInput.focus();
  ui.kitNameInput.select();
}

function closeSaveKitModal() {
  ui.saveKitModal.hidden = true;
}

async function saveKit() {
  const name = ui.kitNameInput.value.trim();
  if (!name) {
    ui.kitNameHint.textContent = 'Please enter a kit name.';
    ui.kitNameInput.focus();
    return;
  }

  const kit = {
    id:       generateId(),
    name,
    url:      state.pageUrl,
    title:    state.pageTitle,
    created:  Date.now(),
    colours:  JSON.parse(JSON.stringify(state.colours)),
    fonts:    JSON.parse(JSON.stringify(state.fonts))
  };

  state.kits.unshift(kit); // newest first
  await saveKitsToStorage();
  closeSaveKitModal();
  showToast(`Kit "${name}" saved!`, 'success');
  renderKits();
}

// ─────────────────────────────────────────────────────────────────────────────
// Render Saved Kits
// ─────────────────────────────────────────────────────────────────────────────

async function renderKits() {
  await loadKits();

  if (state.kits.length === 0) {
    ui.kitsContent.innerHTML = `
      <div class="empty-state" id="kitsEmpty">
        <div class="empty-icon">📦</div>
        <p class="empty-title">No saved kits yet</p>
        <p class="empty-desc">Analyze a page then click <strong>Save Kit</strong> to store its design tokens.</p>
      </div>`;
    return;
  }

  const html = `
    <div class="section-header">
      <span class="section-title">Saved Kits</span>
      <span class="section-count">${state.kits.length}</span>
    </div>
    <div class="kit-list" id="kitList">
      ${state.kits.map((kit) => {
        const swatchHtml = (kit.colours || []).slice(0, 10).map(
          (c) => `<div class="kit-swatch" style="background:${c.hex}" title="${c.hex}"></div>`
        ).join('');
        const fontNames = [...new Set((kit.fonts || []).slice(0, 3).map((f) => f.fontFamily))].join(', ');
        return `
          <div class="kit-card" data-kit-id="${escHtml(kit.id)}">
            <div class="kit-header">
              <div class="kit-name">${escHtml(kit.name)}</div>
              <div class="kit-actions">
                <button class="kit-action-btn open"   data-action="open"   data-kit-id="${kit.id}" title="Open kit" aria-label="Open ${kit.name}">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 3l5 5-5 5M3 8h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                </button>
                <button class="kit-action-btn export"  data-action="export" data-kit-id="${kit.id}" title="Export CSS" aria-label="Export ${kit.name} as CSS">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 1v8M5 6l3 3 3-3M2 12h12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
                </button>
                <button class="kit-action-btn rename"  data-action="rename" data-kit-id="${kit.id}" title="Rename kit" aria-label="Rename ${kit.name}">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M11 2l3 3-9 9H2v-3L11 2z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
                </button>
                <button class="kit-action-btn delete"  data-action="delete" data-kit-id="${kit.id}" title="Delete kit" aria-label="Delete ${kit.name}">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M3 5h10M6 5V3h4v2M7 8v5M9 8v5M4 5l1 9h6l1-9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                </button>
              </div>
            </div>
            <div class="kit-meta">
              <span class="kit-meta-item">
                <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 4v4l3 2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                ${formatDate(kit.created)}
              </span>
              <span class="kit-meta-item">
                <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="8" cy="8" r="3.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
                ${(kit.colours || []).length} colours
              </span>
              <span class="kit-meta-item">
                <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M2 4h12v2H8v6H6V6H2V4z" fill="currentColor"/></svg>
                ${(kit.fonts || []).length} fonts
              </span>
            </div>
            ${swatchHtml ? `<div class="kit-palette">${swatchHtml}</div>` : ''}
            ${fontNames ? `<div class="kit-fonts-preview">${escHtml(fontNames)}</div>` : ''}
          </div>`;
      }).join('')}
    </div>`;

  ui.kitsContent.innerHTML = html;
  attachKitListListeners();
}

function attachKitListListeners() {
  const list = document.getElementById('kitList');
  if (!list) return;

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('.kit-action-btn');
    if (!btn) return;

    const { action, kitId } = btn.dataset;
    switch (action) {
      case 'open':   openKit(kitId);   break;
      case 'export': exportKit(kitId); break;
      case 'rename': openRenameModal(kitId); break;
      case 'delete': deleteKit(kitId); break;
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Open Kit (View)
// ─────────────────────────────────────────────────────────────────────────────

function openKit(kitId) {
  const kit = state.kits.find((k) => k.id === kitId);
  if (!kit) return;

  state.viewKitId = kitId;
  ui.viewKitTitle.textContent = kit.name;
  ui.viewKitMeta.textContent  = `${getDomain(kit.url)} · ${formatDate(kit.created)}`;

  // Build body
  let bodyHtml = '';

  // Colours section
  if (kit.colours && kit.colours.length > 0) {
    bodyHtml += `<div class="kit-detail-section">
      <div class="kit-detail-title">Colours (${kit.colours.length})</div>`;
    kit.colours.slice(0, 20).forEach((c) => {
      bodyHtml += `
        <div class="kit-colour-row" data-copy="${escHtml(c.hex)}" title="Click to copy ${c.hex}" role="button" tabindex="0" aria-label="Copy ${c.hex}">
          <div class="kit-colour-swatch" style="background:${c.hex}"></div>
          <span class="kit-colour-hex">${escHtml(c.hex)}</span>
          <span class="kit-colour-rgb">${escHtml(c.rgb)}</span>
          <button class="copy-btn" aria-label="Copy ${c.hex}">Copy</button>
        </div>`;
    });
    bodyHtml += '</div>';
  }

  // Fonts section
  if (kit.fonts && kit.fonts.length > 0) {
    bodyHtml += `<div class="kit-detail-section">
      <div class="kit-detail-title">Fonts (${kit.fonts.length})</div>`;
    kit.fonts.slice(0, 15).forEach((f, i) => {
      const css = buildFontCSS(f);
      bodyHtml += `
        <div class="kit-font-row" data-copy-css="${escHtml(css)}" title="Click to copy CSS" role="button" tabindex="0" aria-label="Copy CSS for ${f.fontFamily}">
          <div class="kit-font-name">${escHtml(f.fontFamily)}</div>
          <div class="kit-font-tags">
            <span class="font-tag weight">${f.fontWeight}</span>
            <span class="font-tag size">${escHtml(f.fontSize)}</span>
            ${f.lineHeight && f.lineHeight !== 'normal' ? `<span class="font-tag lh">lh ${escHtml(f.lineHeight)}</span>` : ''}
          </div>
        </div>`;
    });
    bodyHtml += '</div>';
  }

  if (!bodyHtml) bodyHtml = '<p style="color:var(--text-muted);font-size:12px;">No data in this kit.</p>';

  ui.viewKitBody.innerHTML = bodyHtml;

  // Attach click listeners for copy within kit view
  ui.viewKitBody.addEventListener('click', async (e) => {
    const copyBtn = e.target.closest('.copy-btn');
    const colourRow = e.target.closest('.kit-colour-row');
    const fontRow   = e.target.closest('.kit-font-row');

    if (copyBtn && colourRow) {
      e.stopPropagation();
      await copyToClipboard(colourRow.dataset.copy, colourRow.dataset.copy, copyBtn);
      return;
    }
    if (colourRow) {
      await copyToClipboard(colourRow.dataset.copy, colourRow.dataset.copy, null);
      return;
    }
    if (fontRow) {
      await copyToClipboard(fontRow.dataset.copyCss, 'Font CSS', null);
    }
  });

  ui.viewKitModal.hidden = false;
}

function closeViewKitModal() {
  ui.viewKitModal.hidden = true;
  state.viewKitId = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Delete Kit
// ─────────────────────────────────────────────────────────────────────────────

async function deleteKit(kitId) {
  const kit = state.kits.find((k) => k.id === kitId);
  if (!kit) return;

  // Confirm with user (simple confirm dialog is fine in popup context)
  if (!confirm(`Delete kit "${kit.name}"? This cannot be undone.`)) return;

  state.kits = state.kits.filter((k) => k.id !== kitId);
  await saveKitsToStorage();
  showToast(`Deleted "${kit.name}"`, 'default');
  renderKits();
}

// ─────────────────────────────────────────────────────────────────────────────
// Rename Kit
// ─────────────────────────────────────────────────────────────────────────────

function openRenameModal(kitId) {
  const kit = state.kits.find((k) => k.id === kitId);
  if (!kit) return;

  state.renameKitId = kitId;
  ui.renameKitInput.value = kit.name;
  ui.renameKitModal.hidden = false;
  ui.renameKitInput.focus();
  ui.renameKitInput.select();
}

function closeRenameModal() {
  ui.renameKitModal.hidden = true;
  state.renameKitId = null;
}

async function confirmRename() {
  const newName = ui.renameKitInput.value.trim();
  if (!newName) { ui.renameKitInput.focus(); return; }

  const kit = state.kits.find((k) => k.id === state.renameKitId);
  if (!kit) return;

  kit.name = newName;
  await saveKitsToStorage();
  closeRenameModal();
  showToast(`Renamed to "${newName}"`, 'success');
  renderKits();
}

// ─────────────────────────────────────────────────────────────────────────────
// Export CSS
// ─────────────────────────────────────────────────────────────────────────────

function exportCurrentAnalysis() {
  if (!state.hasData) {
    showToast('Analyze a page first.', 'error');
    return;
  }
  openExportModal(null); // null = current analysis
}

function exportKit(kitId) {
  const kit = state.kits.find((k) => k.id === kitId);
  if (!kit) return;
  openExportModal(kitId);
}

function openExportModal(kitId) {
  state.exportKitId = kitId;

  let colours, fonts, name, url;
  if (kitId) {
    const kit = state.kits.find((k) => k.id === kitId);
    if (!kit) return;
    colours = kit.colours;
    fonts   = kit.fonts;
    name    = kit.name;
    url     = kit.url;
  } else {
    colours = state.colours;
    fonts   = state.fonts;
    name    = state.pageTitle || getDomain(state.pageUrl);
    url     = state.pageUrl;
  }

  ui.cssPreview.value = generateCSS(colours, fonts, name, url);
  ui.exportModal.hidden = false;
}

function closeExportModal() {
  ui.exportModal.hidden = true;
  state.exportKitId = null;
}

async function copyExportedCSS() {
  const css = ui.cssPreview.value;
  await copyToClipboard(css, 'CSS variables', ui.exportCopyCSS);
}

function downloadExportedCSS() {
  const css = ui.cssPreview.value;
  let filename;

  if (state.exportKitId) {
    const kit = state.kits.find((k) => k.id === state.exportKitId);
    filename = (kit?.name || 'style-kit').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.css';
  } else {
    const domain = getDomain(state.pageUrl) || 'style-kit';
    filename = domain.replace(/[^a-z0-9]/g, '-') + '-variables.css';
  }

  const blob = new Blob([css], { type: 'text/css' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast(`Downloaded ${filename}`, 'success');
}

// ─────────────────────────────────────────────────────────────────────────────
// Keyboard Handling for Modals
// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!ui.saveKitModal.hidden)   closeSaveKitModal();
    if (!ui.renameKitModal.hidden) closeRenameModal();
    if (!ui.exportModal.hidden)    closeExportModal();
    if (!ui.viewKitModal.hidden)   closeViewKitModal();
  }
  if (e.key === 'Enter') {
    if (!ui.saveKitModal.hidden)   saveKit();
    if (!ui.renameKitModal.hidden) confirmRename();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Event Bindings
// ─────────────────────────────────────────────────────────────────────────────

function bindEvents() {
  // Footer buttons
  ui.btnAnalyze.addEventListener('click', analyzeCurrentPage);
  ui.btnSaveKit.addEventListener('click', openSaveKitModal);
  ui.btnExportCSS.addEventListener('click', exportCurrentAnalysis);

  // Save kit modal
  ui.saveKitConfirm.addEventListener('click', saveKit);
  ui.saveKitCancel.addEventListener('click', closeSaveKitModal);
  ui.saveKitClose.addEventListener('click', closeSaveKitModal);
  ui.saveKitModal.addEventListener('click', (e) => {
    if (e.target === ui.saveKitModal) closeSaveKitModal();
  });

  // Rename kit modal
  ui.renameKitConfirm.addEventListener('click', confirmRename);
  ui.renameKitCancel.addEventListener('click', closeRenameModal);
  ui.renameKitClose.addEventListener('click', closeRenameModal);
  ui.renameKitModal.addEventListener('click', (e) => {
    if (e.target === ui.renameKitModal) closeRenameModal();
  });

  // Export modal
  ui.exportCopyCSS.addEventListener('click', copyExportedCSS);
  ui.exportDownloadCSS.addEventListener('click', downloadExportedCSS);
  ui.exportCancel.addEventListener('click', closeExportModal);
  ui.exportClose.addEventListener('click', closeExportModal);
  ui.exportModal.addEventListener('click', (e) => {
    if (e.target === ui.exportModal) closeExportModal();
  });

  // View kit modal
  ui.viewKitClose.addEventListener('click', closeViewKitModal);
  ui.viewKitCloseBtn.addEventListener('click', closeViewKitModal);
  ui.viewKitModal.addEventListener('click', (e) => {
    if (e.target === ui.viewKitModal) closeViewKitModal();
  });
  ui.viewKitExport.addEventListener('click', () => {
    closeViewKitModal();
    if (state.viewKitId) exportKit(state.viewKitId);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Initialisation
// ─────────────────────────────────────────────────────────────────────────────

async function init() {
  initTabs();
  bindEvents();
  await loadKits();
  await initActiveTab();
}

document.addEventListener('DOMContentLoaded', init);
