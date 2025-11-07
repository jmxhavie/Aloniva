const state = {
  data: { products: [], ingredients: [] },
  index: [],
  inputEl: null,
  resultsEl: null,
  flatResults: [],
  activeIndex: -1
};

const MAX_RESULTS = 8;
function getGlobal(name) {
  return globalThis[name];
}

async function loadDataset() {
  if (state.data.products.length || state.data.ingredients.length) return;

  try {
    if (Array.isArray(getGlobal('PRODUCTS'))) {
      state.data.products = getGlobal('PRODUCTS');
    } else {
      const mod = await import('../data/products.js').catch(() => ({}));
      if (Array.isArray(mod.PRODUCTS)) state.data.products = mod.PRODUCTS;
      if (!state.data.products.length && Array.isArray(getGlobal('PRODUCTS'))) {
        state.data.products = getGlobal('PRODUCTS');
      }
    }
  } catch (error) {
    console.warn('Product dataset load error', error);
  }
  if (!state.data.products.length) {
    try {
      const res = await fetch('/data/products.json', { cache: 'force-cache' });
      if (res.ok) state.data.products = await res.json();
    } catch (error) {
      console.warn('Product JSON fetch failed', error);
    }
  }

  try {
    const libraryGlobal = getGlobal('INGREDIENT_LIBRARY');
    if (Array.isArray(libraryGlobal) && libraryGlobal.length) {
      state.data.ingredients = libraryGlobal;
    } else if (Array.isArray(getGlobal('INGREDIENTS'))) {
      state.data.ingredients = getGlobal('INGREDIENTS');
    } else {
      const mod = await import('../data/ingredients.js').catch(() => ({}));
      if (Array.isArray(mod.INGREDIENT_LIBRARY) && mod.INGREDIENT_LIBRARY.length) {
        state.data.ingredients = mod.INGREDIENT_LIBRARY;
      } else if (Array.isArray(mod.INGREDIENTS)) {
        state.data.ingredients = mod.INGREDIENTS;
      }
      if (!state.data.ingredients.length && Array.isArray(getGlobal('INGREDIENTS'))) {
        state.data.ingredients = getGlobal('INGREDIENTS');
      }
      if (!state.data.ingredients.length && Array.isArray(getGlobal('INGREDIENT_LIBRARY'))) {
        state.data.ingredients = getGlobal('INGREDIENT_LIBRARY');
      }
    }
  } catch (error) {
    console.warn('Ingredient dataset load error', error);
  }
  if (!state.data.ingredients.length) {
    try {
      const res = await fetch('/data/ingredients.json', { cache: 'force-cache' });
      if (res.ok) state.data.ingredients = await res.json();
    } catch (error) {
      console.warn('Ingredient JSON fetch failed', error);
    }
  }

  state.data.products = Array.isArray(state.data.products) ? state.data.products : [];
  state.data.ingredients = Array.isArray(state.data.ingredients) ? state.data.ingredients : [];
}

function tokenize(value) {
  return (value || '')
    .toString()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s\-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function includesInfix(haystack, needle) {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function levenshtein(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length];
}

function buildRecord(item, type) {
  const name = item.name || item.inciName || item.tradeName || '';
  const extra = [
    item.inciName,
    item.tradeName,
    ...(item.tags || []),
    ...(item.functionTags || []),
    ...(item.solubility || []),
    ...(item.phaseHints || []),
    item.category,
    item.summary,
    item.description
  ]
    .filter(Boolean)
    .join(' ');

  const hay = `${name} ${extra}`.trim();
  return {
    id: item.id || item.slug || name,
    name,
    hay,
    type,
    raw: item
  };
}

function buildIndex() {
  const products = state.data.products.map(item => buildRecord(item, 'product'));
  const ingredients = state.data.ingredients.map(item => buildRecord(item, 'ingredient'));
  state.index = [...products, ...ingredients];
}

function scoreRecord(rec, query) {
  const q = query.toLowerCase();
  if (!rec.name) return 0;
  const name = rec.name.toLowerCase();

  if (name.startsWith(q)) return 120 - Math.min(rec.name.length - query.length, 20);
  if (includesInfix(rec.hay, query)) return 80 - Math.min(rec.hay.length - query.length, 40);

  let best = 0;
  for (const token of tokenize(rec.hay)) {
    const distance = levenshtein(token, q);
    if (distance <= 2) {
      best = Math.max(best, 60 - distance * 10);
    }
  }
  return best;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlight(text, query) {
  if (!query) return text;
  const regex = new RegExp(escapeRegExp(query), 'ig');
  return text.replace(regex, match => `<mark class="sr-highlight">${match}</mark>`);
}

function renderResults(results, query) {
  const box = state.resultsEl;
  box.innerHTML = '';
  state.flatResults = [];
  state.activeIndex = -1;
  box.scrollTop = 0;

  const grouped = {
    product: results.filter(r => r.type === 'product'),
    ingredient: results.filter(r => r.type === 'ingredient')
  };

  const sections = [
    ['Products', grouped.product],
    ['Ingredients', grouped.ingredient]
  ];

  sections.forEach(([title, list]) => {
    if (!list.length) return;
    const header = document.createElement('div');
    header.className = 'sr-section-title';
    header.textContent = title;
    box.appendChild(header);

    list.forEach((rec, idx) => {
      const option = document.createElement('div');
      option.className = 'sr-item';
      option.setAttribute('role', 'option');
      option.id = `sr-${rec.type}-${rec.id}-${idx}`;
      option.dataset.index = String(state.flatResults.length);
      option.setAttribute('aria-selected', 'false');

      const badgeLabel = rec.type === 'product' ? 'Product' : 'Ingredient';
      option.innerHTML = `
        <span class="sr-badge">${badgeLabel}</span>
        <span class="sr-label">${highlight(rec.name, query)}</span>
      `;

      option.addEventListener('mousedown', event => {
        event.preventDefault();
        navigateToResult(rec);
        closeResults();
      });

      box.appendChild(option);
      state.flatResults.push({ element: option, record: rec });
    });
  });

  if (!results.length) {
    const empty = document.createElement('div');
    empty.className = 'sr-empty';
    empty.textContent = 'No matches. Try a different term.';
    box.appendChild(empty);
  }

  box.hidden = false;
  state.inputEl.setAttribute('aria-expanded', 'true');
}

function closeResults() {
  state.resultsEl.hidden = true;
  state.resultsEl.innerHTML = '';
  state.flatResults = [];
  state.activeIndex = -1;
  state.inputEl.setAttribute('aria-expanded', 'false');
  state.inputEl.removeAttribute('aria-activedescendant');
}

function activate(index) {
  if (!state.flatResults.length) return;
  state.flatResults.forEach(({ element }, idx) => {
    const selected = idx === index;
    element.setAttribute('aria-selected', selected ? 'true' : 'false');
    if (selected) element.scrollIntoView({ block: 'nearest' });
  });
  if (index >= 0 && state.flatResults[index]) {
    state.inputEl.setAttribute('aria-activedescendant', state.flatResults[index].element.id);
  } else {
    state.inputEl.removeAttribute('aria-activedescendant');
  }
  state.activeIndex = index;
}

function resolvePath(path) {
  const clean = path.replace(/^\//, '');
  if (location.protocol === 'file:') {
    const current = location.pathname.replace(/\\/g, '/');
    if (/\/pages\//i.test(current)) {
      const base = current.replace(/\/pages\/.*$/, '/');
      return base + clean;
    }
    return current.replace(/[^/]+$/, '') + clean;
  }
  return '/' + clean;
}

function navigateToResult(rec) {
  if (!rec) return;
  const name = rec.name || '';
  if (rec.type === 'product') {
    const target = resolvePath('pages/shop.html');
    if (location.protocol === 'file:') {
      const sep = target.includes('?') ? '&' : '?';
      location.href = `${target}${sep}q=${encodeURIComponent(name)}`;
    } else {
      const url = new URL(target, location.origin);
      url.searchParams.set('q', name);
      location.href = url.pathname + url.search;
    }
  } else {
    const target = resolvePath('pages/ingredients.html');
    if (location.protocol === 'file:') {
      const sep = target.includes('?') ? '&' : '?';
      location.href = `${target}${sep}q=${encodeURIComponent(name)}#ingredientGrid`;
    } else {
      const url = new URL(target, location.origin);
      url.searchParams.set('q', name);
      url.hash = '#ingredientGrid';
      location.href = url.pathname + url.search + url.hash;
    }
  }
}

function onKeyDown(event) {
  if (state.resultsEl.hidden || !state.flatResults.length) return;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    const next = (state.activeIndex + 1) % state.flatResults.length;
    activate(next);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    const next = (state.activeIndex - 1 + state.flatResults.length) % state.flatResults.length;
    activate(next);
  } else if (event.key === 'Enter') {
    if (state.activeIndex >= 0 && state.flatResults[state.activeIndex]) {
      event.preventDefault();
      navigateToResult(state.flatResults[state.activeIndex].record);
      closeResults();
    }
  } else if (event.key === 'Escape') {
    event.preventDefault();
    closeResults();
    state.inputEl.blur();
  }
}

function debounce(fn, delay = 120) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function performSearch(query) {
  const trimmed = (query || '').trim();
  if (!trimmed) {
    closeResults();
    return;
  }

  const scored = state.index
    .map(rec => ({ ...rec, score: scoreRecord(rec, trimmed) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, MAX_RESULTS);

  renderResults(scored, trimmed);
}

function init() {
  const input = document.getElementById('globalSearch');
  const listbox = document.getElementById('searchListbox');
  if (!input || !listbox) return;

  state.inputEl = input;
  state.resultsEl = listbox;
  listbox.setAttribute('aria-live', 'polite');
  listbox.hidden = true;

  const debounced = debounce(performSearch, 120);

  input.addEventListener('input', event => {
    debounced(event.target.value);
  });

  input.addEventListener('keydown', onKeyDown);

  document.addEventListener('click', event => {
    if (!state.resultsEl.contains(event.target) && event.target !== input) {
      closeResults();
    }
  });

  input.addEventListener('focus', () => {
    if (state.flatResults.length) {
      state.resultsEl.hidden = false;
      state.inputEl.setAttribute('aria-expanded', 'true');
    }
  });
}

async function boot() {
  if (globalThis.__alonivaSearchBooted) return;
  globalThis.__alonivaSearchBooted = true;

  await loadDataset();
  buildIndex();

  const start = () => init();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}

boot();
