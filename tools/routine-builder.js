import { buildIndex, recommend } from './routine-rules.js';
import { cart } from './cart.js';

const FORM_ID = 'rb-form';
const RESULTS_ID = 'rb-results';
const STATUS_ID = 'rb-status';
const STORAGE_KEY_ANSWERS = 'aloniva.routine.answers';
const STORAGE_KEY_ROUTINE = 'aloniva.routine.saved';

const TYPEAHEAD_HINT = '<p class="rb-hint">Type above to explore individual products instantly.</p>';
const SKIN_ALIASES = {
  'dry skin': 'dry',
  'oily skin': 'oily',
  'sensitive skin': 'sensitive',
  'balanced': 'balanced'
};
const BUNDLE_DEFINITIONS = [
  {
    id: 'bundle-acne-starter',
    name: 'Acne Starter',
    blurb: 'Kickstart a breakout-calming routine with essential actives.',
    products: [
      'Aloniva Clear Balance Acne Cleanser',
      'Aloniva Rapid Spot Acne Gel',
      'Aloniva Sunshield 50 Sunscreen'
    ]
  },
  {
    id: 'bundle-brightening',
    name: 'Brightening Glow',
    blurb: 'Daily duo for even tone and lasting radiance.',
    products: [
      'Aloniva Gentle Touch Foaming Cleanser',
      'Aloniva Radiant Glow Brightening Lotion',
      'Aloniva Sunshield 50 Sunscreen'
    ]
  },
  {
    id: 'bundle-dry-rescue',
    name: 'Dry Skin Rescue',
    blurb: 'Layered hydration that cushions and seals in moisture.',
    products: [
      'Aloniva Aqua Boost Hydrating Serum',
      'Aloniva Daily Silk Moisturizing Lotion',
      'Aloniva Intense Moisture Emulsified Body Butter'
    ]
  },
  {
    id: 'bundle-dark-spots',
    name: 'Dark Spots Corrector',
    blurb: 'Focus treatment duo to fade lingering pigmentation.',
    products: [
      'Aloniva Dark Fade PIH Serum',
      'Aloniva Sunshield 50 Sunscreen'
    ]
  },
  {
    id: 'bundle-baby-care',
    name: 'Baby Care Comfort',
    blurb: 'Gentle care essentials for delicate skin.',
    products: [
      'Aloniva Baby Protection Jelly',
      'Aloniva Healing Ointment'
    ]
  }
];

const QUESTIONS = [
  {
    id: 'skin',
    group: 'profile',
    label: 'How does your skin behave most days?',
    description: 'Choose the option that feels the most accurate for your face.',
    type: 'radio',
    options: [
      ['Dry Skin', 'Dry skin that craves moisture'],
      ['Oily Skin', 'Oily or shine-prone'],
      ['Sensitive Skin', 'Easily irritated or reactive'],
      ['Balanced', 'Comfortably balanced']
    ],
    required: true
  },
  {
    id: 'category',
    group: 'shopping',
    label: 'Which product categories do you need today?',
    description: 'Pick one or more categories to build your routine.',
    type: 'checkbox',
    options: [],
    required: true
  }
];

const FORM_GROUPS = [
  {
    id: 'profile',
    title: 'Skin profile',
    description: 'Help us understand your baseline so textures and actives feel comfortable.'
  },
  {
    id: 'shopping',
    title: 'Product categories',
    description: 'Tell us which product types you need today.'
  }
];

const state = {
  products: [],
  index: [],
  answers: null,
  recommendations: null,
  warning: ''
};

function resolveAsset(path = '') {
  if (!path) return '../assets/nivera-logo.svg';
  if (/^https?:\/\//i.test(path)) return path;
  const clean = path.replace(/^\/+/, '');
  return `../${clean}`;
}

function formatUGX(value) {
  const amount = Number(value) || 0;
  return `UGX ${amount.toLocaleString('en-UG', { maximumFractionDigits: 0 })}`;
}

function parseQueryAnswers() {
  const params = new URLSearchParams(location.search);
  if (!params.size) return null;
  const answers = {};
  QUESTIONS.forEach((question) => {
    if (question.type === 'checkbox') {
      const raw = params.get(question.id);
      answers[question.id] = raw ? raw.split(',').map((v) => decodeURIComponent(v)).filter(Boolean) : [];
    } else if (params.has(question.id)) {
      answers[question.id] = params.get(question.id);
    }
  });
  if (params.has('pregnancy')) answers.pregnancy = params.get('pregnancy');
  if (params.has('spf')) answers.spf = params.get('spf');
  return answers;
}

function loadSavedAnswers() {
  try {
    const fromQuery = parseQueryAnswers();
    if (fromQuery) return fromQuery;
    const raw = localStorage.getItem(STORAGE_KEY_ANSWERS);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_error) {
    return null;
  }
}

function renderQuestion(question, saved = {}) {
  const isCheckbox = question.type === 'checkbox';
  const savedValue = saved?.[question.id];
  const optionsMarkup = question.options.map(([value, label]) => {
    const checked = isCheckbox
      ? Array.isArray(savedValue) && savedValue.includes(value)
      : savedValue === value;
    return `
      <label class="rb-choice-card">
        <input
          type="${isCheckbox ? 'checkbox' : 'radio'}"
          name="${question.id}"
          value="${value}"
          ${checked ? 'checked' : ''}
        />
        <span>${label}</span>
      </label>
    `;
  }).join('');

  const hint = question.description ? `<span class="rb-field__hint">${question.description}</span>` : '';

  return `
    <fieldset class="rb-field">
      <legend class="rb-field__legend">
        <span class="rb-field__title">${question.label}${question.required ? ' *' : ''}</span>
        ${hint}
      </legend>
      <div class="rb-field__choices rb-field__choices--${question.type}">${optionsMarkup}</div>
    </fieldset>
  `;
}

function renderFormBundles(bundles) {
  if (!bundles.length) return '';
  return `
    <section class="rb-form-section rb-form-section--bundles">
      <header class="rb-form-section__header">
        <h3>Starter bundles</h3>
        <p>Jump-start with pharmacist-curated sets. Add any bundle instantly.</p>
      </header>
      <div class="rb-bundle-grid">
        ${bundles.map((bundle) => createBundleCard(bundle)).join('')}
      </div>
    </section>
  `;
}

function renderForm(saved = {}) {
  const form = document.getElementById(FORM_ID);
  if (!form) return;
  const bundles = resolveBundleProducts();
  const categories = getProductCategories();
  const categoryQuestion = QUESTIONS.find((q) => q.id === 'category');
  if (categoryQuestion) {
    categoryQuestion.options = categories.map((cat) => [cat, cat]);
  }
  const sections = FORM_GROUPS.map((group) => {
    const groupQuestions = QUESTIONS.filter((question) => question.group === group.id);
    if (!groupQuestions.length) return '';
    return `
      <section class="rb-form-section">
        <header class="rb-form-section__header">
          <h3>${group.title}</h3>
          ${group.description ? `<p>${group.description}</p>` : ''}
        </header>
        ${groupQuestions.map((question) => renderQuestion(question, saved)).join('')}
      </section>
    `;
  }).join('');
  const bundleSection = renderFormBundles(bundles);
  form.innerHTML = sections + bundleSection;
  if (saved?.skin && saved.skin.toLowerCase() === 'dry skin') {
    enforceSkinCategory(saved.skin, form, { silent: true });
  }
  syncChoiceStates(form);
  if (bundles.length) {
    wireBundleButtons(form, bundles);
  }
}

function syncChoiceStates(scope) {
  if (!scope) return;
  scope.querySelectorAll('.rb-choice-card').forEach((card) => {
    const input = card.querySelector('input');
    card.classList.toggle('is-selected', !!input?.checked);
  });
}

function enforceSkinCategory(value, form, { silent = false } = {}) {
  if (!form) return false;
  const lower = (value || '').toLowerCase();
  if (lower !== 'dry skin') return false;
  const categoryInputs = Array.from(form.querySelectorAll('input[name="category"]'));
  if (!categoryInputs.length) return false;
  const dryOption = categoryInputs.find((input) => input.value.toLowerCase() === 'dry skin');
  if (!dryOption) return false;
  const alreadyOnlyDry = categoryInputs.every((input) => {
    const shouldBeChecked = input === dryOption;
    return shouldBeChecked === input.checked;
  });
  if (alreadyOnlyDry) return false;
  categoryInputs.forEach((input) => { input.checked = input === dryOption; });
  if (!silent) showStatus('Dry skin routines prioritise our Dry Skin moisturisers.', 'info');
  return true;
}

function getAnswers() {
  const form = document.getElementById(FORM_ID);
  if (!form) return {};

  const answers = {};
  QUESTIONS.forEach((question) => {
    if (question.type === 'checkbox') {
      const selected = Array.from(form.querySelectorAll(`input[name="${question.id}"]:checked`)).map((input) => input.value);
      answers[question.id] = selected;
    } else {
      const selected = form.querySelector(`input[name="${question.id}"]:checked`);
      answers[question.id] = selected ? selected.value : '';
    }
  });
  return answers;
}

function answersToQuery(answers = {}) {
  const params = new URLSearchParams();
  QUESTIONS.forEach((question) => {
    const value = answers[question.id];
    if (!value || (Array.isArray(value) && !value.length)) return;
    if (question.type === 'checkbox') {
      params.set(question.id, value.join(','));
    } else {
      params.set(question.id, value);
    }
  });
  return params.toString();
}

function showStatus(message, tone = 'info') {
  const el = document.getElementById(STATUS_ID);
  if (!el) return;
  el.textContent = message;
  el.dataset.tone = tone;
  if (message) {
    setTimeout(() => {
      if (el.textContent === message) el.textContent = '';
    }, 4000);
  }
}

function renderTypeaheadContainer(root) {
  if (!root) return null;
  root.innerHTML = `
    <div class="rb-typeahead">
      <label for="rb-search">Search any product</label>
      <input id="rb-search" type="search" placeholder="Search by name or concern…" autocomplete="off" aria-autocomplete="list" aria-expanded="false" aria-controls="rb-suggestions"/>
      <div id="rb-suggestions" class="rb-suggestions" role="listbox" hidden></div>
      <div id="rb-search-results" class="rb-search-results">${TYPEAHEAD_HINT}</div>
    </div>
  `;
  return root.querySelector('.rb-typeahead');
}

function aggregateRecommendations(data) {
  const map = new Map();
  const push = (blocks, period) => {
    if (!Array.isArray(blocks)) return;
    blocks.forEach((block) => {
      (block.items || []).forEach((item) => {
        if (!item || !item.id) return;
        const existing = map.get(item.id);
        const reasons = Array.isArray(item.reasons) ? item.reasons : [];
        const periodLabel = block.period === undefined ? period : block.period;
        if (existing) {
          existing.score = Math.max(existing.score ?? 0, item.score ?? 0);
          existing.reasons = Array.from(new Set([...existing.reasons, ...reasons])).slice(0, 5);
          existing.steps = Array.from(new Set([...existing.steps, block.step]));
          const periods = periodLabel ? [...existing.periods, periodLabel] : existing.periods;
          existing.periods = Array.from(new Set(periods));
        } else {
          map.set(item.id, {
            ...item,
            score: item.score ?? 0,
            reasons: reasons.slice(0, 5),
            steps: [block.step],
            periods: periodLabel ? [periodLabel] : []
          });
        }
      });
    });
  };
  push(data?.am, 'AM');
  push(data?.pm, 'PM');
  return Array.from(map.values()).sort((a, b) => {
    if ((b.score ?? 0) !== (a.score ?? 0)) return (b.score ?? 0) - (a.score ?? 0);
    if ((a.priceUGX ?? 0) !== (b.priceUGX ?? 0)) return (a.priceUGX ?? 0) - (b.priceUGX ?? 0);
    return a.name.localeCompare(b.name);
  });
}

function getProductCategories() {
  if (!state.index.length) return [];
  const categories = [];
  state.index.forEach((product) => {
    const cat = (product.category || '').trim();
    if (cat && !categories.includes(cat)) categories.push(cat);
  });
  return categories;
}

function resolveBundleProducts() {
  if (!state.index.length) return [];
  return BUNDLE_DEFINITIONS.map((bundle) => {
    const items = bundle.products
      .map((name) => state.index.find((product) => product.name.toLowerCase() === name.toLowerCase()))
      .filter(Boolean);
    if (!items.length || items.length !== bundle.products.length) return null;
    const total = items.reduce((sum, product) => sum + (product.priceUGX || 0), 0);
    return {
      ...bundle,
      items,
      total
    };
  }).filter(Boolean);
}

function renderResults(data) {
  const root = document.getElementById(RESULTS_ID);
  if (!root) return;
  if (!data) {
    state.warning = '';
    root.innerHTML = '<p class="rb-empty">Complete the questions above and tap “Suggest my routine” to unlock tailored product picks.</p>';
    return;
  }
  const items = aggregateRecommendations(data);
  const positives = items.filter((item) => (item.score ?? 0) > 0);
  const shortlist = (positives.length ? positives : items).slice(0, 8);
  if (!shortlist.length) {
    root.innerHTML = '<p class="rb-empty">We couldn’t find a good match. Try adjusting your answers.</p>';
    return;
  }

  const warningBlock = state.warning ? `<p class="rb-alert rb-alert--warning" role="alert">${state.warning}</p>` : '';

  root.innerHTML = `
    ${warningBlock}
    <section>
      <h2 class="rb-section-title">Recommended products</h2>
      <div class="rb-results-list">
        ${shortlist.map((product) => createProductCard(product)).join('')}
      </div>
    </section>
  `;
  wireCartButtons(root);

  const bundles = resolveBundleProducts();
  if (bundles.length) {
    const section = document.createElement('section');
    section.className = 'rb-bundles';
    section.innerHTML = `
      <h2 class="rb-section-title">Starter bundles</h2>
      <div class="rb-bundle-grid">
        ${bundles.map((bundle) => createBundleCard(bundle)).join('')}
      </div>
    `;
    root.appendChild(section);
    wireBundleButtons(section, bundles);
  }
}

function createProductCard(product) {
  const reasons = (product.reasons || []).slice(0, 3);
  const price = product.priceUGX ? formatUGX(product.priceUGX) : '';
  const description = product.summary || product.short || product.description || '';
  const altText = `Add ${product.name} to cart`;
  const badges = [];
  if (product.periods?.length) {
    badges.push(`<span class="rb-tag rb-tag--period">${product.periods.join(' & ')}</span>`);
  }
  if (product.steps?.length) {
    badges.push(`<span class="rb-tag rb-tag--step">${product.steps.join(', ')}</span>`);
  }
  return `
    <article class="rb-card">
      <img src="${resolveAsset(product.image)}" alt="${product.name}" loading="lazy" decoding="async" />
      <div class="rb-card__body">
        <header>
          <h3>${product.name}</h3>
          ${price ? `<span class="rb-price">${price}</span>` : ''}
        </header>
        ${description ? `<p class="rb-copy">${description}</p>` : ''}
        ${badges.length ? `<div class="rb-tags">${badges.join('')}</div>` : ''}
        ${reasons.length ? `
          <details class="rb-why">
            <summary>Why this?</summary>
            <ul>${reasons.map((reason) => `<li>${reason}</li>`).join('')}</ul>
          </details>
        ` : ''}
      </div>
      <button class="btn-secondary rb-add" type="button" data-id="${product.id}" aria-label="${altText}">Add to cart</button>
    </article>
  `;
}

function wireCartButtons(root) {
  root.querySelectorAll('.rb-add').forEach((button) => {
    button.addEventListener('click', (event) => {
      const id = event.currentTarget.dataset.id;
      const product = state.index.find((item) => item.id === id);
      cart.add(id, 1, product);
      event.currentTarget.textContent = 'Added ✓';
      event.currentTarget.disabled = true;
      setTimeout(() => {
        event.currentTarget.textContent = 'Add to cart';
        event.currentTarget.disabled = false;
      }, 1600);
    }, { passive: true });
  });
}

function createBundleCard(bundle) {
  return `
    <article class="rb-bundle" data-bundle="${bundle.id}">
      <header>
        <h3>${bundle.name}</h3>
        ${bundle.total ? `<span class="rb-price">${formatUGX(bundle.total)}</span>` : ''}
      </header>
      ${bundle.blurb ? `<p class="rb-copy">${bundle.blurb}</p>` : ''}
      <ul class="rb-bundle-list">
        ${bundle.items.map((item) => `<li>${item.name}</li>`).join('')}
      </ul>
      <button class="btn-secondary rb-add-bundle" type="button" data-bundle="${bundle.id}">Add bundle to cart</button>
    </article>
  `;
}

function wireBundleButtons(root, bundles) {
  root.querySelectorAll('.rb-add-bundle').forEach((button) => {
    button.addEventListener('click', () => {
      const target = bundles.find((bundle) => bundle.id === button.dataset.bundle);
      if (!target) return;
      target.items.forEach((product) => cart.add(product.id, 1, product));
      button.textContent = 'Bundle added ✓';
      button.disabled = true;
      setTimeout(() => {
        button.textContent = 'Add bundle to cart';
        button.disabled = false;
      }, 1600);
    });
  });
}

function handleTypeahead(container) {
  const input = container.querySelector('#rb-search');
  const list = container.querySelector('#rb-suggestions');
  const resultsBox = container.querySelector('#rb-search-results');

  function closeSuggestions() {
    list.innerHTML = '';
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    if (resultsBox) resultsBox.innerHTML = TYPEAHEAD_HINT;
  }

  function renderSuggestions(query) {
    const term = query.trim().toLowerCase();
    if (term.length < 2) {
      if (resultsBox) resultsBox.innerHTML = TYPEAHEAD_HINT;
      closeSuggestions();
      return;
    }
    const matches = state.index
      .map((product) => {
        const name = product.name.toLowerCase();
        const description = (product.description || '').toLowerCase();
        const matchIndex = name.indexOf(term);
        let score = matchIndex >= 0 ? 4 : 0;
        if (product.tags.some((tag) => tag.includes(term))) score += 3;
        if (description.includes(term)) score += 1;
        return { product, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    if (!matches.length) {
      list.innerHTML = '';
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      if (resultsBox) {
        resultsBox.innerHTML = '<p class="rb-empty rb-empty--inline">No matching products yet. Try another term.</p>';
      }
      return;
    }

    list.innerHTML = matches.map(({ product }) => `
      <button type="button" class="rb-suggestion" role="option" data-id="${product.id}">
        <span>${product.name}</span>
        ${product.priceUGX ? `<small>${formatUGX(product.priceUGX)}</small>` : ''}
      </button>
    `).join('');
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');

    if (resultsBox) {
      const cards = matches.slice(0, 6).map(({ product }) => createProductCard(product)).join('');
      resultsBox.innerHTML = `
        <div class="rb-search-grid">
          ${cards}
        </div>
      `;
      wireCartButtons(resultsBox);
    }

    return matches;
  }

  input.addEventListener('input', (event) => {
    renderSuggestions(event.target.value);
  });

  list.addEventListener('click', (event) => {
    const button = event.target.closest('.rb-suggestion');
    if (!button) return;
    const product = state.index.find((item) => item.id === button.dataset.id);
    if (!product) return;
    cart.add(product.id, 1, product);
    showStatus(`${product.name} added to cart`, 'success');
    input.value = '';
    closeSuggestions();
  });

  document.addEventListener('click', (event) => {
    if (!container.contains(event.target)) closeSuggestions();
  });
}

function saveAnswers(answers) {
  try {
    localStorage.setItem(STORAGE_KEY_ANSWERS, JSON.stringify(answers));
  } catch (error) {
    console.warn('Unable to persist answers', error);
  }
}

function saveRoutineSnapshot(answers, recommendations) {
  try {
    const payload = {
      answers,
      picks: {
        am: recommendations.am.map((block) => ({
          step: block.step,
          items: block.items.map((item) => item.id)
        })),
        pm: recommendations.pm.map((block) => ({
          step: block.step,
          items: block.items.map((item) => item.id)
        }))
      },
      savedAt: new Date().toISOString()
    };
    localStorage.setItem(STORAGE_KEY_ROUTINE, JSON.stringify(payload));
    showStatus('Routine saved for quick access', 'success');
  } catch (error) {
    console.warn('Unable to save routine', error);
    showStatus('Unable to save routine', 'error');
  }
}

async function loadProducts() {
  if (Array.isArray(window.PRODUCTS) && window.PRODUCTS.length) {
    return window.PRODUCTS;
  }
  if (document.readyState === 'loading') {
    await new Promise((resolve) => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  }
  if (Array.isArray(window.PRODUCTS) && window.PRODUCTS.length) {
    return window.PRODUCTS;
  }
  try {
    const module = await import(new URL('../data/products.js', import.meta.url).href).catch(() => null);
    if (module?.PRODUCTS?.length) return module.PRODUCTS;
  } catch (error) {
    console.warn('ES module product import failed', error);
  }
  if (Array.isArray(window.PRODUCTS) && window.PRODUCTS.length) {
    return window.PRODUCTS;
  }
  try {
    const response = await fetch(new URL('../data/products.json', import.meta.url).href, { cache: 'force-cache' });
    if (response.ok) {
      const json = await response.json();
      if (Array.isArray(json)) return json;
      if (Array.isArray(json?.products)) return json.products;
    }
  } catch (error) {
    console.error('Failed to load products', error);
  }
  return [];
}

function normalizeAnswers(raw = {}) {
  const skinKey = (raw.skin || '').toLowerCase();
  const skin = SKIN_ALIASES[skinKey] || '';
  return {
    skin,
    category: Array.isArray(raw.category) ? raw.category.filter(Boolean) : [],
    concern: [],
    sensitivity: 'medium',
    fragrance: 'either',
    pregnancy: false,
    spf: true,
    budget: '',
    complexity: 'standard'
  };
}

function runRecommendation() {
  const form = document.getElementById(FORM_ID);
  const raw = getAnswers();
  const missing = QUESTIONS
    .filter((question) => question.required)
    .filter((question) => {
      const value = raw[question.id];
      if (Array.isArray(value)) return value.length === 0;
      return value === undefined || value === null || value === '';
    });

  if (missing.length) {
    showStatus('Please complete the required questions.', 'error');
    renderResults(null);
    return;
  }

  let answers = normalizeAnswers(raw);
  state.answers = answers;
  saveAnswers({ skin: raw.skin || '', category: Array.isArray(raw.category) ? raw.category.filter(Boolean) : [] });
  state.warning = '';
  if (answers.skin === 'dry') {
    const hasDryCategory = answers.category.some((cat) => cat.toLowerCase() === 'dry skin');
    if (!hasDryCategory) {
      if (form && enforceSkinCategory(raw.skin, form)) {
        raw = getAnswers();
        answers = normalizeAnswers(raw);
        state.answers = answers;
        saveAnswers({ skin: raw.skin || '', category: Array.isArray(raw.category) ? raw.category.filter(Boolean) : [] });
        syncChoiceStates(form);
      }
    }
  }
  if (state.answers.skin === 'oily' && state.answers.category.some((cat) => cat.toLowerCase() === 'dry skin')) {
    state.warning = 'Oil-rich moisturizers can feel heavy on oily skin—apply sparingly and patch test first.';
  }
  if (!state.index.length) {
    renderResults(null);
    return;
  }
  const recommendation = recommend(state.index, answers);
  state.recommendations = recommendation;
  renderResults(recommendation);
  showStatus('Routine updated based on your answers.', 'success');
}

function copyShareLink() {
  if (!state.answers) {
    showStatus('Run the routine suggestion first.', 'info');
    return;
  }
  const params = answersToQuery(getAnswers());
  const url = `${location.origin}${location.pathname}?${params}`;
  navigator.clipboard?.writeText(url)
    .then(() => showStatus('Shareable link copied to clipboard', 'success'))
    .catch(() => {
      showStatus('Copy this link: ' + url, 'info');
    });
}

function bootstrapButtons() {
  const container = document.querySelector('.rb-actions');
  if (!container) return;

  container.addEventListener('click', (event) => {
    const { id } = event.target;
    if (id === 'rb-run') {
      runRecommendation();
    } else if (id === 'rb-save') {
      if (!state.answers || !state.recommendations) {
        showStatus('Generate a routine first.', 'info');
        return;
      }
      saveRoutineSnapshot(state.answers, state.recommendations);
    } else if (id === 'rb-share') {
      copyShareLink();
    }
  });
}

function observeForm() {
  const form = document.getElementById(FORM_ID);
  if (!form) return;
  form.addEventListener('change', (event) => {
    if (event.target?.name === 'skin') {
      enforceSkinCategory(event.target.value, form);
    }
    const current = getAnswers();
    state.answers = normalizeAnswers(current);
    syncChoiceStates(form);
    if (event.target?.name === 'category' && event.target.checked) {
      if ((current.skin || '').toLowerCase() === 'oily skin' && event.target.value.toLowerCase() === 'dry skin') {
        showStatus('Oil-rich moisturizers can feel heavy on oily skin—apply sparingly and patch test first.', 'info');
      }
    }
  });
}

async function init() {
  state.products = await loadProducts();
  state.index = buildIndex(state.products);

  const saved = loadSavedAnswers();
  renderForm(saved || { spf: 'yes' });
  state.answers = normalizeAnswers(getAnswers());
  observeForm();
  bootstrapButtons();

  const typeaheadHost = document.getElementById('rb-typeahead-host');
  if (typeaheadHost) {
    const typeahead = renderTypeaheadContainer(typeaheadHost);
    if (typeahead) handleTypeahead(typeahead);
  }

  if (saved) {
    state.answers = normalizeAnswers({
      ...saved,
      pregnancy: saved.pregnancy === 'yes' || saved.pregnancy === true,
      spf: saved.spf !== 'no'
    });
    renderResults(null);
  } else {
    renderResults(null);
  }
}

document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', init, { once: true })
  : init();
