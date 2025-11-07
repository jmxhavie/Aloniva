import { INGREDIENT_LIBRARY, STORE_INGREDIENTS } from '../data/ingredients.js';
import {
  buildIngredientIndex,
  calcTotalsPercent,
  calcSolubilityBreakdown,
  summarizeFormula,
  applyBatchGrams
} from './formula-calculators.js';
import { validateFormula } from './formula-validators.js';
import {
  saveFormula,
  loadFormula,
  listFormulas,
  saveVersion,
  listVersions,
  restoreVersion,
  seedIngredients,
  seedSampleFormulas,
  getIngredientLibrary,
  getLastOpenedFormulaId,
  setLastOpenedFormulaId
} from './formula-db.js';
import { FORMULA_TEMPLATES, createSampleFormulas } from './formula-templates.js';
import {
  exportFormulaPDF,
  exportFormulaDOCX,
  exportFormulaCSV,
  exportFormulaJSON,
  formatFormulaForExport
} from './formula-exporters.js';

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));
const USD_TO_UGX = 3800;
const formatUGX = (value) => `UGX ${Number(value || 0).toLocaleString('en-UG', { maximumFractionDigits: 0 })}`;

const normaliseKey = (value) => {
  if (!value && value !== 0) return '';
  return value
    .toString()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
};

const expandKeyVariants = (value) => {
  if (!value && value !== 0) return [];
  const base = value.toString().trim();
  if (!base) return [];
  const variants = new Set([base]);
  if (base.includes('(')) {
    variants.add(base.split('(')[0].trim());
  }
  if (base.includes('/')) {
    base.split('/').forEach(part => variants.add(part.trim()));
  }
  return Array.from(variants).filter(Boolean);
};

const buildStoreLookup = (list = []) => {
  const map = new Map();
  list.forEach(item => {
    const keys = new Set([
      ...(expandKeyVariants(item.id) || []),
      ...(expandKeyVariants(item.name) || []),
      ...(expandKeyVariants(item.alias) || [])
    ]);
    keys.forEach(key => {
      const normalised = normaliseKey(key);
      if (normalised && !map.has(normalised)) {
        map.set(normalised, item);
      }
    });
  });
  return map;
};

const STORE_LOOKUP = buildStoreLookup(STORE_INGREDIENTS || []);
const formatCategoryLabel = (value = '') =>
  value
    .toString()
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

function uid(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

class FormulaBuilderApp {
  constructor() {
    this.library = [];
    this.libraryIndex = new Map();
    this.storeIndex = STORE_LOOKUP;
    this.libraryCategories = [];
    this.libraryCategory = 'all';
    this.currentFormula = null;
    this.chart = null;
    this.activePhaseId = null;
    this.dom = {
      projectForm: $('#projectForm'),
      phasesContainer: $('#phasesContainer'),
      addPhaseBtn: $('#addPhaseBtn'),
      librarySearch: $('#librarySearch'),
      libraryFilters: $('#libraryFilters'),
      libraryList: $('#libraryList'),
      batchSizeInput: $('#batchSize'),
      totalsTotal: $('#metricTotal'),
      totalsWater: $('#metricWater'),
      totalsOil: $('#metricOil'),
      totalsCost: $('#metricCost'),
      totalsMargin: $('#metricMargin'),
      warningList: $('#warningsList'),
      calculatorsToggle: $('#calculatorsToggle'),
      calculatorsPanel: $('#calculatorsPanel'),
      calculatorsContent: $('#calculatorsContent'),
      versionsDialog: $('#versionsDialog'),
      versionsList: $('#versionsList'),
      templatesDialog: $('#templatesDialog'),
      templatesList: $('#templatesList'),
      importInput: $('#importJsonInput'),
      chartCanvas: $('#phaseChart'),
      formulaPicker: $('#formulaPicker')
    };
    this.handleGlobalShortcuts = this.handleGlobalShortcuts.bind(this);
  }

  async init() {
    try {
      await seedIngredients(INGREDIENT_LIBRARY);
      await seedSampleFormulas(createSampleFormulas(INGREDIENT_LIBRARY));
      this.library = await this.loadLibrary();
    } catch (error) {
      console.warn('Formula builder initialisation fallback', error);
      this.library = INGREDIENT_LIBRARY;
      this.showToast('Working in offline memory mode', true);
    }
    this.libraryIndex = buildIngredientIndex(this.library);
    this.libraryCategories = this.buildLibraryCategories(this.library);
    this.libraryCategory = 'all';
    this.renderLibraryFilters();
    this.bindEvents();
    await this.populateFormulaPicker();
    const lastId = getLastOpenedFormulaId();
    if (lastId) {
      const stored = await loadFormula(lastId);
      if (stored) {
        this.loadFormula(stored);
        return;
      }
    }
    const [firstTemplate] = FORMULA_TEMPLATES;
    this.loadFormula(this.createFormulaFromTemplate(firstTemplate));
  }

  async loadLibrary() {
    const fromDb = await getIngredientLibrary();
    if (Array.isArray(fromDb) && fromDb.length) return fromDb;
    return INGREDIENT_LIBRARY;
  }

  bindEvents() {
    const bar = $('#builderBar');
    bar?.addEventListener('click', (event) => this.handleToolbarClick(event));
    this.dom.projectForm?.addEventListener('input', (event) => this.handleProjectField(event));
    this.dom.addPhaseBtn?.addEventListener('click', () => this.addPhase());
    this.dom.librarySearch?.addEventListener('input', () => this.renderLibrary());
    this.dom.libraryFilters?.addEventListener('click', (event) => this.handleLibraryFilter(event));
    this.dom.phasesContainer?.addEventListener('input', (event) => this.handlePhaseInput(event));
    this.dom.phasesContainer?.addEventListener('click', (event) => this.handlePhaseClick(event));
    this.dom.libraryList?.addEventListener('click', (event) => this.handleLibraryClick(event));
    this.dom.calculatorsToggle?.addEventListener('click', () => this.toggleCalculators());
    this.dom.versionsDialog?.querySelector('[data-close]')
      ?.addEventListener('click', () => this.dom.versionsDialog.close());
    this.dom.templatesDialog?.querySelector('[data-close]')
      ?.addEventListener('click', () => this.dom.templatesDialog.close());
    this.dom.importInput?.addEventListener('change', (event) => this.handleImport(event));
    this.dom.formulaPicker?.addEventListener('change', (event) => this.handleFormulaPick(event));
    document.addEventListener('keydown', this.handleGlobalShortcuts);
  }

  handleGlobalShortcuts(event) {
    if (!event.ctrlKey && !event.metaKey) return;
    if (event.key.toLowerCase() === 's') {
      event.preventDefault();
      this.handleSave();
    } else if (event.key.toLowerCase() === 'e') {
      event.preventDefault();
      this.openExportMenu();
    } else if (event.key.toLowerCase() === 'n') {
      event.preventDefault();
      this.addIngredientRow(this.activePhaseId || this.currentFormula.phases[0]?.id);
    }
  }

  handleToolbarClick(event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    switch (action) {
      case 'new':
        this.createNewFormula();
        break;
      case 'save':
        this.handleSave();
        break;
      case 'clone':
        this.cloneFormula();
        break;
      case 'versions':
        this.openVersionsDialog();
        break;
      case 'templates':
        this.openTemplatesDialog();
        break;
      case 'validate':
        this.renderWarnings(true);
        break;
      case 'export':
        this.openExportMenu(button);
        break;
      case 'import':
        this.dom.importInput?.click();
        break;
      default:
        break;
    }
  }

  async handleSave() {
    if (!this.currentFormula) return;
    const prepared = applyBatchGrams(this.currentFormula);
    const saved = await saveFormula(prepared);
    setLastOpenedFormulaId(saved.id);
    await saveVersion(prepared, 'Manual save');
    this.loadFormula(saved);
    await this.populateFormulaPicker();
    this.showToast('Formula saved');
  }

  cloneFormula() {
    if (!this.currentFormula) return;
    const clone = JSON.parse(JSON.stringify(this.currentFormula));
    clone.id = uid('formula');
    clone.name = `${clone.name || 'Formula'} Copy`;
    clone.version = 'v1.0';
    clone.createdAt = null;
    clone.updatedAt = null;
    this.loadFormula(clone);
    this.showToast('Cloned formula. Remember to save.');
  }

  createNewFormula() {
    const newFormula = {
      id: uid('formula'),
      name: 'Untitled Formula',
      version: 'v1.0',
      productType: 'Custom',
      batchSize: 1000,
      targetPH: 5.5,
      targetTempC: 75,
      notes: '',
      regions: { UG: true, EA: true, EU: false, US: false },
      costing: {},
      phases: [
        { id: uid('phase'), name: 'Phase A', temperature: 75, items: [] }
      ]
    };
    this.loadFormula(newFormula);
  }

  createFormulaFromTemplate(template) {
    return {
      id: uid('formula'),
      name: template.name,
      version: 'v1.0',
      productType: template.productType,
      batchSize: template.batchSize,
      targetPH: template.targetPH,
      targetTempC: template.targetTempC,
      notes: template.notes,
      regions: template.regions || { UG: true, EA: true, EU: true, US: true },
      costing: {},
      phases: template.phases.map(phase => ({
        id: uid('phase'),
        name: phase.name,
        temperature: phase.temperature,
        items: phase.items.map(item => ({
          id: uid('item'),
          ingredientId: item.ingredientId,
          ingredientName: this.libraryIndex.get(item.ingredientId)?.inciName || '',
          function: item.function || '',
          percent: item.percent,
          grams: 0,
          notes: item.notes || ''
        }))
      }))
    };
  }

  loadFormula(formula) {
    this.currentFormula = applyBatchGrams(formula);
    this.activePhaseId = this.currentFormula.phases[0]?.id || null;
    this.renderProjectPanel();
    this.renderCanvas();
    this.renderLibrary();
    this.renderSummary();
    this.renderWarnings(false);
  }

  renderProjectPanel() {
    if (!this.dom.projectForm || !this.currentFormula) return;
    const f = this.currentFormula;
    $('#formulaName').value = f.name || '';
    $('#productType').value = f.productType || '';
    $('#notes').value = f.notes || '';
    $('#targetPH').value = f.targetPH ?? '';
    $('#targetTemp').value = f.targetTempC ?? '';
    $('#batchSize').value = f.batchSize || 0;
    $$('#projectRegions input[type="checkbox"]').forEach(input => {
      input.checked = Boolean(f.regions?.[input.value]);
    });
  }

  renderCanvas() {
    if (!this.dom.phasesContainer || !this.currentFormula) return;
    this.dom.phasesContainer.innerHTML = this.currentFormula.phases.map(phase => this.renderPhase(phase)).join('');
    this.highlightActivePhase();
  }

  renderPhase(phase) {
    return `
      <section class="phase-card${this.activePhaseId === phase.id ? ' is-active' : ''}" data-phase-id="${phase.id}">
        <header class="phase-card__header">
          <div>
            <input class="phase-name" value="${phase.name}" aria-label="Phase name" />
            <span class="phase-total" data-phase-total="${phase.id}"></span>
          </div>
          <div class="phase-meta">
            <label>Temp °C <input type="number" min="0" class="phase-temp" value="${phase.temperature ?? ''}" /></label>
            <button class="btn ghost-sm" data-action="add-row" type="button">Add row</button>
            ${this.currentFormula.phases.length > 1 ? '<button class="btn ghost-sm" data-action="remove-phase" type="button" aria-label="Remove phase">Remove</button>' : ''}
          </div>
        </header>
        <table class="phase-table">
          <thead>
            <tr>
              <th scope="col">Ingredient</th>
              <th scope="col">Function</th>
              <th scope="col">% w/w</th>
              <th scope="col">Grams</th>
              <th scope="col">Notes</th>
              <th scope="col" aria-hidden="true"></th>
            </tr>
          </thead>
          <tbody>
            ${phase.items.map(item => this.renderPhaseItem(phase, item)).join('')}
          </tbody>
        </table>
      </section>
    `;
  }

  renderPhaseItem(phase, item) {
    const ingredient = this.libraryIndex.get(item.ingredientId);
    const functionFilter = (item.function || '').trim();
    const availableIngredients = this.getLibraryForFunction(functionFilter, item.ingredientId);
    const optionsMarkup = availableIngredients.length
      ? availableIngredients.map(entry => `<option value="${entry.id}" ${entry.id === item.ingredientId ? 'selected' : ''}>${entry.inciName}</option>`).join('')
      : '<option value="" disabled>No ingredients for this function</option>';
    return `
      <tr data-item-id="${item.id}">
        <td>
          <select class="select-ingredient" data-role="ingredient">
            <option value="">Select ingredient…</option>
            ${optionsMarkup}
          </select>
        </td>
        <td><input value="${item.function || ''}" data-role="function" placeholder="${ingredient?.functionTags?.[0] || ''}" /></td>
        <td><input type="number" min="0" step="0.01" value="${item.percent ?? 0}" data-role="percent" /></td>
        <td><output data-role="grams">${item.grams?.toFixed(2) ?? '0.00'}</output></td>
        <td><input value="${item.notes || ''}" data-role="notes" /></td>
        <td><button class="btn ghost-sm" type="button" data-action="remove-row" aria-label="Remove ingredient">✕</button></td>
      </tr>
    `;
  }

  highlightActivePhase() {
    $$('.phase-card', this.dom.phasesContainer).forEach(card => {
      if (card.dataset.phaseId === this.activePhaseId) card.classList.add('is-active');
      else card.classList.remove('is-active');
    });
  }

  buildLibraryCategories(list) {
    const map = new Map();
    list.forEach(item => {
      (item.functionTags || []).forEach(tag => {
        const key = normaliseKey(tag);
        if (!key || map.has(key)) return;
        map.set(key, { key, label: formatCategoryLabel(tag) || tag });
      });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }

  renderLibraryFilters() {
    const host = this.dom.libraryFilters;
    if (!host) return;
    const categories = this.libraryCategories || [];
    const active = this.libraryCategory || 'all';
    const buttons = [
      `<button type="button" class="library-chip ${active === 'all' ? 'is-active' : ''}" data-filter="all" aria-pressed="${active === 'all'}">All</button>`
    ];
    categories.forEach(cat => {
      const isActive = active === cat.key;
      buttons.push(
        `<button type="button" class="library-chip ${isActive ? 'is-active' : ''}" data-filter="${cat.key}" aria-pressed="${isActive}">${cat.label}</button>`
      );
    });
    host.innerHTML = buttons.join('');
  }

  handleLibraryFilter(event) {
    const button = event.target.closest('[data-filter]');
    if (!button) return;
    const value = button.dataset.filter || 'all';
    if (value === this.libraryCategory) return;
    this.libraryCategory = value;
    this.renderLibraryFilters();
    this.renderLibrary();
  }

  getLibraryForFunction(functionValue, currentIngredientId) {
    const trimmed = (functionValue || '').trim();
    const normalized = normaliseKey(trimmed);
    let matches;
    if (!trimmed || !normalized) {
      matches = [...this.library];
    } else {
      matches = this.library.filter(entry => {
        const tags = entry.functionTags || [];
        return tags.some(tag => {
          const tagKey = normaliseKey(tag);
          return tagKey === normalized || tagKey.includes(normalized) || normalized.includes(tagKey);
        });
      });
    }
    matches.sort((a, b) => a.inciName.localeCompare(b.inciName));
    if (trimmed && matches.length === 0 && currentIngredientId) {
      const selected = this.libraryIndex.get(currentIngredientId);
      if (selected) matches = [selected];
    }
    return matches;
  }

  findStoreIngredient(libraryItem) {
    if (!libraryItem) return null;
    const searchValues = [
      libraryItem.storeId,
      libraryItem.id,
      libraryItem.tradeName,
      libraryItem.inciName,
      libraryItem.alias,
      libraryItem.commonName
    ].filter(Boolean);
    for (const value of searchValues) {
      const variants = expandKeyVariants(value);
      for (const variant of variants) {
        const key = normaliseKey(variant);
        if (key && this.storeIndex.has(key)) {
          return this.storeIndex.get(key);
        }
      }
    }
    return null;
  }

  renderLibrary() {
    if (!this.dom.libraryList) return;
    const term = (this.dom.librarySearch?.value || '').toLowerCase();
    const filtered = this.library.filter(item => {
      if (!term) return true;
      return (
        item.inciName.toLowerCase().includes(term) ||
        (item.tradeName && item.tradeName.toLowerCase().includes(term)) ||
        (item.functionTags || []).some(tag => tag.toLowerCase().includes(term))
      );
    });
    const categoryKey = this.libraryCategory;
    const byCategory = categoryKey === 'all'
      ? filtered
      : filtered.filter(item => (item.functionTags || []).some(tag => normaliseKey(tag) === categoryKey));
    if (!byCategory.length) {
      this.dom.libraryList.innerHTML = '<p class="library-empty">No ingredients match this category yet.</p>';
      return;
    }
    this.dom.libraryList.innerHTML = byCategory.map(item => {
      const storeMatch = this.findStoreIngredient(item);
      const hasRetail = storeMatch && Number(storeMatch.priceUGX) > 0;
      let retailRow = `<dt>Retail</dt><dd class="library-out">Out of stock</dd>`;
      if (hasRetail) {
        const price = formatUGX(storeMatch.priceUGX);
        const hasWas = storeMatch.wasUGX && storeMatch.wasUGX > storeMatch.priceUGX;
        const was = hasWas ? `<span class="library-price-was">${formatUGX(storeMatch.wasUGX)}</span>` : '';
        const size = storeMatch.size ? `<span class="library-pack">• ${storeMatch.size}</span>` : '';
        retailRow = `<dt>Retail</dt><dd><span class="library-price">${price}</span>${was}${size}</dd>`;
      }
      return `
      <article class="library-item">
        <header>
          <h3>${item.inciName}</h3>
          ${item.tradeName ? `<span class="badge">${item.tradeName}</span>` : ''}
        </header>
        <p class="library-tags">${(item.functionTags || []).join(' • ')}</p>
        <button class="btn-secondary" type="button" data-action="add-library" data-ingredient="${item.id}">Add to phase</button>
        <dl>
          ${retailRow}
          <dt>Usage</dt><dd>${item.usageMinPct ?? 0}% – ${item.usageMaxPct ?? '—'}%</dd>
          <dt>Solubility</dt><dd>${(item.solubility || []).join(', ') || 'n/a'}</dd>
        </dl>
      </article>
    `;
    }).join('');
  }

  renderSummary() {
    if (!this.currentFormula) return;
    const summary = summarizeFormula(this.currentFormula, this.libraryIndex, { costing: this.currentFormula.costing });
    const totals = summary.totals;
    const breakdown = summary.breakdown;
    const costing = summary.costing;
    if (this.dom.totalsTotal) this.dom.totalsTotal.textContent = `${totals.total.toFixed(2)}%`;
    if (this.dom.totalsWater) this.dom.totalsWater.textContent = `${breakdown.water.toFixed(1)}%`;
    if (this.dom.totalsOil) this.dom.totalsOil.textContent = `${breakdown.oil.toFixed(1)}%`;
    if (this.dom.totalsCost) this.dom.totalsCost.textContent = `UGX ${Math.round(costing.totalCostPerUnit * USD_TO_UGX).toLocaleString('en-UG', { maximumFractionDigits: 0 })}`;
    if (this.dom.totalsMargin) this.dom.totalsMargin.textContent = `${costing.margin.toFixed(1)}%`;
    this.renderPhaseTotals();
    this.renderChart(breakdown.dataset);
    this.renderCalculators(summary);
  }

  renderPhaseTotals() {
    if (!this.dom.phasesContainer) return;
    this.currentFormula.phases.forEach(phase => {
      const totalCell = this.dom.phasesContainer.querySelector(`[data-phase-total="${phase.id}"]`);
      if (!totalCell) return;
      const total = phase.items.reduce((sum, item) => sum + Number(item.percent || 0), 0);
      totalCell.textContent = `${total.toFixed(2)}%`;
    });
  }

  renderChart(dataset) {
    if (!this.dom.chartCanvas || !window.Chart) return;
    if (!this.chart) {
      this.chart = new window.Chart(this.dom.chartCanvas, {
        type: 'doughnut',
        data: {
          labels: dataset.map(d => d.label),
          datasets: [{ data: dataset.map(d => d.value), backgroundColor: dataset.map(d => d.color) }]
        },
        options: {
          responsive: true,
          plugins: { legend: { position: 'bottom' } }
        }
      });
    } else {
      this.chart.data.labels = dataset.map(d => d.label);
      this.chart.data.datasets[0].data = dataset.map(d => d.value);
      this.chart.data.datasets[0].backgroundColor = dataset.map(d => d.color);
      this.chart.update();
    }
  }

  renderCalculators(summary) {
    if (!this.dom.calculatorsContent) return;
    const { breakdown, hlb, preservative, ph, costing } = summary;
    this.dom.calculatorsContent.innerHTML = `
      <section>
        <h3>Totals & Scaling</h3>
        <p>Batch size: ${this.currentFormula.batchSize} g</p>
        <p>Water/Oil/Other: ${breakdown.water.toFixed(1)} / ${breakdown.oil.toFixed(1)} / ${breakdown.other.toFixed(1)}</p>
      </section>
      <section>
        <h3>HLB</h3>
        <p>Required HLB: ${hlb.requiredHLB.toFixed(2)} | Emulsifier HLB: ${hlb.emulsifierHLB.toFixed(2)} | Δ ${hlb.delta.toFixed(2)}</p>
      </section>
      <section>
        <h3>Preservative</h3>
        <p>${preservative.requiresPreservative ? 'Requires preservative' : 'Water activity low'}</p>
        ${preservative.rangeWarnings.map(w => `<p class="text-warning">${w}</p>`).join('')}
      </section>
      <section>
        <h3>pH Guidance</h3>
        <p>Suggested window: ${ph.recommendedMin ?? '—'} - ${ph.recommendedMax ?? '—'}</p>
        ${ph.warnings.map(w => `<p class="text-warning">${w}</p>`).join('')}
      </section>
      <section>
        <h3>Costing</h3>
        <p>Raw: UGX ${Math.round(costing.rawCost * USD_TO_UGX).toLocaleString('en-UG')} | Unit Cost: UGX ${Math.round(costing.totalCostPerUnit * USD_TO_UGX).toLocaleString('en-UG')} | Margin @ UGX ${Math.round(costing.targetPrice * USD_TO_UGX).toLocaleString('en-UG')}: ${costing.margin.toFixed(1)}%</p>
      </section>
    `;
  }

  renderWarnings(showToastOnBlocking) {
    if (!this.dom.warningList || !this.currentFormula) return;
    const warnings = validateFormula(this.currentFormula, this.libraryIndex);
    this.dom.warningList.innerHTML = warnings.length
      ? warnings.map(w => `<li class="warning warning--${w.level}">${w.message}</li>`).join('')
      : '<li class="warning warning--info">No warnings. Ready to proceed.</li>';
    if (showToastOnBlocking && warnings.some(w => w.level === 'blocking')) {
      this.showToast('Blocking issues detected. Review warnings.', true);
    }
  }

  handleProjectField(event) {
    if (!this.currentFormula) return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
    const { id, type, value, checked } = target;
    switch (id) {
      case 'formulaName':
        this.currentFormula.name = value;
        break;
      case 'productType':
        this.currentFormula.productType = value;
        break;
      case 'notes':
        this.currentFormula.notes = value;
        break;
      case 'targetPH':
        this.currentFormula.targetPH = value === '' ? null : Number(value);
        break;
      case 'targetTemp':
        this.currentFormula.targetTempC = value === '' ? null : Number(value);
        break;
      case 'batchSize':
        this.currentFormula.batchSize = Number(value) || 0;
        this.currentFormula = applyBatchGrams(this.currentFormula);
        break;
      default:
        if (target.dataset.region) {
          this.currentFormula.regions[target.dataset.region] = checked;
        }
        break;
    }
    this.renderSummary();
    this.renderWarnings(false);
  }

  handlePhaseInput(event) {
    const target = event.target;
    const row = target.closest('tr[data-item-id]');
    const phaseCard = target.closest('.phase-card');
    if (!row || !phaseCard || !this.currentFormula) return;
    const phaseId = phaseCard.dataset.phaseId;
    const itemId = row.dataset.itemId;
    const phase = this.currentFormula.phases.find(p => p.id === phaseId);
    if (!phase) return;
    const item = phase.items.find(i => i.id === itemId);
    if (!item) return;

    if (target.matches('.phase-name')) {
      phase.name = target.value;
      this.renderCanvas();
      return;
    } else if (target.matches('.phase-temp')) {
      phase.temperature = target.value === '' ? null : Number(target.value);
    } else if (target.matches('.select-ingredient')) {
      item.ingredientId = target.value || null;
      const ing = this.libraryIndex.get(item.ingredientId);
      item.ingredientName = ing?.inciName || '';
      if (ing) {
        const tags = ing.functionTags || [];
        const currentKey = normaliseKey(item.function || '');
        if (!currentKey || !tags.some(tag => normaliseKey(tag) === currentKey)) {
          item.function = tags[0] || item.function;
        }
      }
    } else if (target.dataset.role === 'function') {
      item.function = target.value;
      const candidates = this.getLibraryForFunction(item.function, item.ingredientId);
      if (item.ingredientId && !candidates.some(entry => entry.id === item.ingredientId)) {
        item.ingredientId = null;
        item.ingredientName = '';
      }
    } else if (target.dataset.role === 'percent') {
      item.percent = Number(target.value) || 0;
    } else if (target.dataset.role === 'notes') {
      item.notes = target.value;
    }
    this.currentFormula = applyBatchGrams(this.currentFormula);
    this.renderSummary();
    this.renderCanvas();
    this.renderWarnings(false);
  }

  handlePhaseClick(event) {
    const card = event.target.closest('.phase-card');
    if (card) {
      this.activePhaseId = card.dataset.phaseId;
      this.highlightActivePhase();
    }
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    const phaseCard = button.closest('.phase-card');
    const phaseId = phaseCard?.dataset.phaseId;
    switch (action) {
      case 'add-row':
        this.addIngredientRow(phaseId);
        break;
      case 'remove-row':
        this.removeIngredientRow(phaseId, button.closest('tr')?.dataset.itemId);
        break;
      case 'remove-phase':
        this.removePhase(phaseId);
        break;
      default:
        break;
    }
  }

  handleLibraryClick(event) {
    const button = event.target.closest('[data-action="add-library"]');
    if (!button) return;
    const ingredientId = button.dataset.ingredient;
    if (!ingredientId) return;
    this.addIngredientRow(this.activePhaseId || this.currentFormula.phases[0]?.id, ingredientId);
  }

  addPhase() {
    if (!this.currentFormula) return;
    const newPhase = {
      id: uid('phase'),
      name: `Phase ${String.fromCharCode(65 + this.currentFormula.phases.length)}`,
      temperature: this.currentFormula.targetTempC || null,
      items: []
    };
    this.currentFormula.phases.push(newPhase);
    this.activePhaseId = newPhase.id;
    this.renderCanvas();
    this.renderSummary();
  }

  removePhase(phaseId) {
    if (!this.currentFormula || this.currentFormula.phases.length <= 1) return;
    this.currentFormula.phases = this.currentFormula.phases.filter(phase => phase.id !== phaseId);
    this.activePhaseId = this.currentFormula.phases[0]?.id || null;
    this.renderCanvas();
    this.renderSummary();
    this.renderWarnings(false);
  }

  addIngredientRow(phaseId, ingredientId = null) {
    if (!this.currentFormula) return;
    const phase = this.currentFormula.phases.find(p => p.id === phaseId);
    if (!phase) return;
    const ingredient = this.libraryIndex.get(ingredientId);
    const newItem = {
      id: uid('item'),
      ingredientId,
      ingredientName: ingredient?.inciName || '',
      function: ingredient?.functionTags?.[0] || '',
      percent: 0,
      grams: 0,
      notes: ''
    };
    phase.items.push(newItem);
    this.renderCanvas();
  }

  removeIngredientRow(phaseId, itemId) {
    if (!this.currentFormula) return;
    const phase = this.currentFormula.phases.find(p => p.id === phaseId);
    if (!phase) return;
    phase.items = phase.items.filter(item => item.id !== itemId);
    this.currentFormula = applyBatchGrams(this.currentFormula);
    this.renderCanvas();
    this.renderSummary();
  }

  toggleCalculators() {
    if (!this.dom.calculatorsPanel) return;
    this.dom.calculatorsPanel.toggleAttribute('data-open');
  }

  async openVersionsDialog() {
    if (!this.currentFormula) return;
    const versions = await listVersions(this.currentFormula.id);
    this.dom.versionsList.innerHTML = versions.length
      ? versions.map(v => `<li><button data-version="${v.versionId}" type="button">${new Date(v.createdAt).toLocaleString()} — ${v.note || 'Snapshot'}</button></li>`).join('')
      : '<li>No versions yet. Save to create history.</li>';
    this.dom.versionsList.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-version]');
      if (!button) return;
      const snapshot = await restoreVersion(button.dataset.version);
      if (snapshot) {
        this.loadFormula(snapshot);
        this.dom.versionsDialog.close();
        this.showToast('Version restored (unsaved)');
      }
    }, { once: true });
    this.dom.versionsDialog.showModal();
  }

  openTemplatesDialog() {
    this.dom.templatesList.innerHTML = FORMULA_TEMPLATES.map(template => `
      <li>
        <article>
          <h3>${template.name}</h3>
          <p>${template.description}</p>
          <button class="btn-primary" type="button" data-template="${template.id}">Use template</button>
        </article>
      </li>
    `).join('');
    this.dom.templatesList.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-template]');
      if (!button) return;
      const template = FORMULA_TEMPLATES.find(t => t.id === button.dataset.template);
      if (!template) return;
      this.loadFormula(this.createFormulaFromTemplate(template));
      this.dom.templatesDialog.close();
      this.showToast('Template applied');
    }, { once: true });
    this.dom.templatesDialog.showModal();
  }

  openExportMenu(anchor) {
    if (!this.currentFormula) return;
    const menu = $('#exportMenu');
    if (!menu) return;
    menu.style.display = 'block';
    if (anchor) {
      const rect = anchor.getBoundingClientRect();
      menu.style.top = `${rect.bottom + window.scrollY + 8}px`;
      menu.style.left = `${rect.left + window.scrollX}px`;
    }
    const hide = () => {
      menu.style.display = 'none';
      document.removeEventListener('click', hide);
    };
    setTimeout(() => document.addEventListener('click', hide), 0);
    menu.addEventListener('click', (event) => {
      event.stopPropagation();
      const action = event.target.closest('[data-export]')?.dataset.export;
      if (!action) return;
      this.handleExport(action);
      hide();
    }, { once: true });
  }

  async handleExport(type) {
    if (!this.currentFormula) return;
    const prepared = formatFormulaForExport(this.currentFormula, this.libraryIndex);
    const summary = summarizeFormula(prepared, this.libraryIndex, { costing: prepared.costing });
    try {
      switch (type) {
        case 'pdf':
          await exportFormulaPDF(prepared, this.libraryIndex, { summary });
          break;
        case 'docx':
          await exportFormulaDOCX(prepared, this.libraryIndex, { summary });
          break;
        case 'csv':
          exportFormulaCSV(prepared, this.libraryIndex);
          break;
        case 'json':
          exportFormulaJSON(prepared);
          break;
        default:
          break;
      }
      this.showToast(`Exported ${type.toUpperCase()}`);
    } catch (error) {
      console.error(error);
      this.showToast(`Export failed: ${error.message}`, true);
    }
  }

  async handleImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const json = JSON.parse(text);
      if (!json.phases) throw new Error('Invalid formula structure');
      json.id = json.id || uid('formula');
      json.name = json.name || file.name.replace(/\.json$/i, '');
      this.loadFormula(json);
      this.showToast('Formula imported (unsaved)');
    } catch (error) {
      this.showToast(`Import failed: ${error.message}`, true);
    } finally {
      event.target.value = '';
    }
  }

  async populateFormulaPicker() {
    if (!this.dom.formulaPicker) return;
    const formulas = await listFormulas();
    this.dom.formulaPicker.innerHTML = [
      '<option value="">Saved formulas…</option>',
      ...formulas.map(f => `<option value="${f.id}">${f.name} (${new Date(f.updatedAt).toLocaleDateString()})</option>`)
    ].join('');
    const currentId = this.currentFormula?.id;
    if (currentId) {
      this.dom.formulaPicker.value = currentId;
    }
  }

  async handleFormulaPick(event) {
    const id = event.target.value;
    if (!id) return;
    const formula = await loadFormula(id);
    if (formula) {
      this.loadFormula(formula);
      setLastOpenedFormulaId(id);
    }
  }

  showToast(message, isError = false) {
    const toastHost = $('#toastHost') || this.createToastHost();
    const toast = document.createElement('div');
    toast.className = `builder-toast${isError ? ' is-error' : ''}`;
    toast.textContent = message;
    toastHost.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('is-visible'));
    setTimeout(() => {
      toast.classList.remove('is-visible');
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  createToastHost() {
    const host = document.createElement('div');
    host.id = 'toastHost';
    host.className = 'builder-toasts';
    document.body.appendChild(host);
    return host;
  }
}

function bootstrap() {
  const app = new FormulaBuilderApp();
  app.init();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}
