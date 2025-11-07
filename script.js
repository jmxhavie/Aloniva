const STORAGE_KEY = 'nivera_cart';

const formatUGX = value => `UGX ${Number(value || 0).toLocaleString('en-UG', { maximumFractionDigits: 0 })}`;
const qs = (selector, scope = document) => scope.querySelector(selector);
const qsa = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function resolveCheckoutPath() {
  const path = (location.pathname || '').replace(/\\/g, '/');
  if (/\/pages\//.test(path)) return 'checkout-whatsapp.html';
  if (/\/blog\//.test(path)) return '../pages/checkout-whatsapp.html';
  return 'pages/checkout-whatsapp.html';
}

const state = {
  products: [],
  ingredients: [],
  cart: [],
  filters: { q: '', category: '', sort: '' },
  lastFocus: null,
  quickViewFocus: null,
  imageMap: {}
};

const elements = {
  grid: qs('#grid'),
  favGrid: qs('#favGrid'),
  ingredientGrid: qs('#ingredientGrid'),
  productSearch: qs('#searchField'),
  headerSearchForm: qs('#headerSearch'),
  headerSearchInput: qs('#search'),
  filterSelect: qs('#filter'),
  sortSelect: qs('#sort'),
  resetBtn: qs('#reset'),
  cartDrawer: qs('#cart'),
  cartBtn: qs('#cartBtn'),
  closeCartBtn: qs('#closeCart'),
  cartItems: qs('#cartItems'),
  cartTotal: qs('#cartTotal'),
  cartDelivery: qs('#cartDelivery'),
  cartCount: qs('#cartCount'),
  clearCartBtn: qs('#clearCart'),
  checkoutBtn: qs('#checkout'),
  menuBtn: qs('#menuBtn'),
  searchToggle: qs('#searchToggle'),
  siteHeader: qs('#siteHeader'),
  primaryNav: qs('#primaryNav'),
  globalSearchInput: qs('#globalSearch'),
  globalSearchContainer: qs('.global-search'),
  year: qs('#year'),
  socialStrip: qs('#socialStrip'),
  journalGrid: qs('#journalGrid'),
  quickView: qs('#quickView'),
  qvImg: qs('#qvImg'),
  qvTitle: qs('#qvTitle'),
  qvMeta: qs('#qvMeta'),
  qvPrice: qs('#qvPrice'),
  qvDescription: qs('#qvDescription'),
  qvAdd: qs('#qvAdd'),
  qvBulk: qs('#qvBulk'),
  closeQV: qs('#closeQV')
};

// Toast notifications
function ensureToastHost() {
  let host = document.getElementById('toasts');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toasts';
    host.className = 'toasts';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  return host;
}

function showToast(message) {
  const host = ensureToastHost();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  host.appendChild(toast);
  // trigger transition
  requestAnimationFrame(() => toast.classList.add('visible'));
  // auto-remove
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 220);
  }, 2200);
}

function init() {
  state.products = normaliseProducts(window.PRODUCTS || []);
  state.ingredients = normaliseIngredients(window.INGREDIENTS || []);
  hydrateCart();
  setYear();
  ensureLocalLinks();
  highlightNav();
  applyQueryFilters();
  populateFilters();
  bindEvents();
  renderProducts();
  renderIngredients();
  renderFavorites();
  drawCart();
  loadImageMap().finally(() => {
    hydrateHero();
    hydrateSocial();
  });
  hydrateJournal();
  initReveal();
  initCounters();
  initTilt();
  enrichProducts();
}

document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();

function normaliseProducts(list) {
  return list.map((item, index) => {
    const price = Number(item.priceUGX) || 0;
    const providedWas = Number(item.wasUGX);
    const fallbackWas = price ? Math.round((price * 1.18) / 1000) * 1000 : 0;
    const safeId = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `product-${index}`;

    return {
      ...item,
      id: safeId,
      brand: item.brand || 'Aloniva',
      category: item.category || 'Skincare',
      priceUGX: price,
      size: item.size || '',
      image: normalizeAsset(item.image) || 'assets/nivera-logo.svg',
      badges: Array.isArray(item.badges) ? item.badges : [],
      description: item.description || '',
      wasUGX: Number.isFinite(providedWas) && providedWas > price ? providedWas : fallbackWas
    };
  });
}

function normaliseIngredients(list) {
  return list.map((item, index) => {
    const safeId = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `ingredient-${index}`;
    const price = Number(item.priceUGX) || 0;
    const providedWas = Number(item.wasUGX);
    const fallbackWas = price ? Math.round((price * 1.18) / 1000) * 1000 : 0;
    const wasUGX = Number.isFinite(providedWas) && providedWas > price ? providedWas : fallbackWas;
    return {
      ...item,
      id: safeId,
      name: item.name || 'Hero ingredient',
      concentration: item.concentration || '',
      alias: item.alias || '',
      category: item.category || '',
      usage: item.usage || '',
      summary: item.summary || '',
      size: item.size || '',
      priceUGX: price,
      wasUGX,
      image: normalizeAsset(item.image || 'assets/nivera-logo.svg'),
      type: 'ingredient',
      benefits: Array.isArray(item.benefits) ? item.benefits.slice(0, 3) : [],
      featured: Array.isArray(item.featured) ? item.featured.slice(0, 2) : []
    };
  });
}

function hydrateCart() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (Array.isArray(stored)) {
      state.cart = stored
        .filter(item => item && item.id && Number.isFinite(Number(item.priceUGX)))
        .map(item => {
          const id = String(item.id);
          const type = item.type === 'ingredient' || id.startsWith('ingredient:') ? 'ingredient' : 'product';
          const normalizedImage = normalizeAsset(item.image) || 'assets/nivera-logo.svg';
          const size = item.size || (type === 'ingredient' ? (item.concentration || '') : '');
          const category = item.category || (type === 'ingredient' ? 'Ingredient' : '');
          const itemId = item.itemId
            ? String(item.itemId)
            : (type === 'ingredient' ? id.replace(/^ingredient:/, '') : id);
          return {
            id,
            itemId,
            type,
            name: String(item.name || ''),
            priceUGX: Number(item.priceUGX) || 0,
            image: normalizedImage,
            size,
            category,
            qty: Math.max(1, Number(item.qty) || 1)
          };
        });
    }
  } catch (error) {
    console.warn('Cart restore failed', error);
    state.cart = [];
  }
  updateCartBadge();
}

function saveCart() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.cart));
  } catch (error) {
    console.warn('Cart persist failed', error);
  }
}

function setYear() {
  if (elements.year) {
    elements.year.textContent = new Date().getFullYear();
  }
}

function populateFilters() {
  const select = elements.filterSelect;
  if (!select) return;
  const current = state.filters.category;
  const categories = [...new Set(state.products.map(p => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  select.innerHTML = '<option value="">All categories</option>';
  const frag = document.createDocumentFragment();
  categories.forEach(category => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    frag.appendChild(option);
  });
  select.appendChild(frag);
  if (current) {
    select.value = current;
  }
}

function bindEvents() {
  ensureSearchToggleElement();
  if (elements.searchToggle) {
    elements.siteHeader?.classList.add('has-search-toggle');
  }
  elements.productSearch?.addEventListener('input', event => {
    state.filters.q = event.target.value.trim().toLowerCase();
    renderProducts();
    renderIngredients();
  });

  elements.headerSearchForm?.addEventListener('submit', event => {
    event.preventDefault();
    const term = elements.headerSearchInput?.value.trim();
    if (!term) {
      if (elements.ingredientGrid) {
        state.filters.q = '';
        renderIngredients();
      }
      return;
    }
    // If the current page has a shop grid, filter in place; otherwise, redirect to shop with query
    if (elements.productSearch && document.getElementById('shop')) {
      elements.productSearch.value = term;
      state.filters.q = term.toLowerCase();
      renderProducts();
      renderIngredients();
      document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (elements.ingredientGrid) {
      state.filters.q = term.toLowerCase();
      renderIngredients();
      elements.ingredientGrid.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      const url = new URL(getRoute('/shop'), location.origin);
      url.searchParams.set('q', term);
      location.href = url.pathname + url.search;
    }
  });

  elements.filterSelect?.addEventListener('change', event => {
    state.filters.category = event.target.value;
    renderProducts();
  });

  elements.sortSelect?.addEventListener('change', event => {
    state.filters.sort = event.target.value;
    renderProducts();
  });

  elements.resetBtn?.addEventListener('click', () => {
    state.filters = { q: '', category: '', sort: '' };
    if (elements.productSearch) elements.productSearch.value = '';
    if (elements.headerSearchInput) elements.headerSearchInput.value = '';
    if (elements.filterSelect) elements.filterSelect.selectedIndex = 0;
    if (elements.sortSelect) elements.sortSelect.selectedIndex = 0;
     const globalSearchInput = document.getElementById('globalSearch');
     if (globalSearchInput) globalSearchInput.value = '';
    renderProducts();
    renderIngredients();
  });

  qsa('[data-filter]').forEach(link => {
    link.addEventListener('click', event => {
      const value = event.currentTarget.getAttribute('data-filter');
      if (!value) return;
      if (document.getElementById('shop')) {
        state.filters.category = value;
        if (elements.filterSelect) elements.filterSelect.value = value;
        renderProducts();
        document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        const url = new URL(getRoute('/shop'), location.origin);
        url.searchParams.set('category', value);
        location.href = url.pathname + url.search;
      }
    });
  });

  elements.cartBtn?.addEventListener('click', () => {
    const target = resolveCheckoutPath();
    elements.cartBtn?.setAttribute('aria-expanded', 'false');
    location.href = target;
  });
  elements.closeCartBtn?.addEventListener('click', () => closeCart());
  elements.cartDrawer?.addEventListener('click', event => {
    if (event.target === elements.cartDrawer) {
      closeCart();
    }
  });
  elements.clearCartBtn?.addEventListener('click', () => {
    state.cart = [];
    saveCart();
    drawCart();
  });
  elements.checkoutBtn?.addEventListener('click', () => checkoutCart());
  elements.cartItems?.addEventListener('click', handleCartClick);
  elements.searchToggle?.addEventListener('click', () => {
    toggleMobileSearch();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeCart();
      closeQuickView();
      closeMobileSearch();
    }
  });

  elements.menuBtn?.addEventListener('click', () => {
    closeMobileSearch();
    const header = elements.siteHeader;
    if (!header) return;
    const isOpen = header.classList.toggle('is-open');
    elements.menuBtn.setAttribute('aria-expanded', String(isOpen));
  });

  elements.primaryNav?.addEventListener('click', event => {
    if (event.target.matches('a')) {
      elements.siteHeader?.classList.remove('is-open');
      elements.menuBtn?.setAttribute('aria-expanded', 'false');
      closeMobileSearch();
    }
  });

  // Dropdown menus
  qsa('.menu.has-dropdown .menu__toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const parent = btn.closest('.menu.has-dropdown');
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      // close others
      closeOtherMenus(parent);
      if (!expanded) {
        openMenu(parent, btn);
      } else {
        const href = btn.getAttribute('data-href');
        if (href) {
          if (e.ctrlKey || e.metaKey) {
            window.open(href, '_blank', 'noopener');
          } else {
            location.href = href;
          }
          return;
        }
        closeMenu(parent, btn);
      }
    });
    btn.addEventListener('auxclick', (e) => {
      if (e.button !== 1) return; // middle click only
      const href = btn.getAttribute('data-href');
      if (href) window.open(href, '_blank', 'noopener');
    });

    // Keyboard support on toggle
    btn.addEventListener('keydown', (e) => {
      const menu = btn.closest('.menu.has-dropdown');
      if (!menu) return;
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMenu(menu, btn);
        focusFirstItem(menu);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        openMenu(menu, btn);
        focusLastItem(menu);
      }
    });
  });
  // Keyboard navigation within dropdown menu
  qsa('.menu.has-dropdown .dropdown').forEach(drop => {
    drop.addEventListener('keydown', (e) => {
      const menu = drop.closest('.menu.has-dropdown');
      const btn = menu?.querySelector('.menu__toggle');
      const items = getMenuItems(drop);
      const i = items.indexOf(document.activeElement);
      if (e.key === 'Escape') {
        e.preventDefault();
        if (menu && btn) {
          closeMenu(menu, btn);
          btn.focus();
        }
        return;
      }
      if (!items.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = i >= 0 ? (i + 1) % items.length : 0;
        items[next].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = i >= 0 ? (i - 1 + items.length) % items.length : items.length - 1;
        items[prev].focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        items[0].focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        items[items.length - 1].focus();
      }
    });
  });

  setupDropdownHover();
  setupDropdownHover();
  document.addEventListener('click', (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (target.closest('.menu.has-dropdown')) return;
    qsa('.menu.has-dropdown .menu__toggle').forEach(b => {
      b.setAttribute('aria-expanded', 'false');
      b.closest('.menu.has-dropdown')?.classList.remove('open');
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      qsa('.menu.has-dropdown .menu__toggle').forEach(b => {
        b.setAttribute('aria-expanded', 'false');
        b.closest('.menu.has-dropdown')?.classList.remove('open');
      });
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 960) {
      elements.siteHeader?.classList.remove('is-open');
      elements.menuBtn?.setAttribute('aria-expanded', 'false');
    }
    // Close any open dropdowns on resize to avoid stuck state
    closeOtherMenus(null);
  });

  elements.quickView?.addEventListener('cancel', event => {
    event.preventDefault();
    closeQuickView();
  });
  elements.closeQV?.addEventListener('click', () => closeQuickView());
}

function renderIngredients() {
  if (!elements.ingredientGrid) return;
  if (!state.ingredients.length) {
    elements.ingredientGrid.innerHTML = '<article class="card"><p class="muted">Ingredient library coming soon.</p></article>';
    return;
  }
  const showAll = elements.ingredientGrid?.dataset.view === 'all';
  const query = (state.filters.q || '').trim().toLowerCase();
  const source = [...state.ingredients];
  let filtered = source;
  if (query) {
    filtered = source.filter(item => {
      const text = [
        item.name,
        item.alias,
        item.category,
        item.summary,
        ...(item.functionTags || [])
      ].filter(Boolean).join(' ').toLowerCase();
      return text.includes(query);
    });
  }
  let list = showAll ? filtered : (query ? filtered.slice(0, 6) : source.slice(0, 6));
  if (showAll) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  if (!list.length) {
    elements.ingredientGrid.innerHTML = `<article class="card"><p class="muted">No ingredients found for "${escapeHtml(state.filters.q || '')}".</p></article>`;
    return;
  }
  elements.ingredientGrid.innerHTML = list.map(renderIngredientCard).join('');
  attachIngredientEvents(elements.ingredientGrid);
  enhanceProductImages(elements.ingredientGrid);
}

function toggleMobileSearch(forceState) {
  const header = elements.siteHeader;
  if (!header) return;
  const next = typeof forceState === 'boolean'
    ? forceState
    : !header.classList.contains('search-open');
  header.classList.toggle('search-open', next);
  if (elements.searchToggle) {
    elements.searchToggle.setAttribute('aria-expanded', String(next));
  }
  if (next) {
    if (elements.globalSearchInput) {
      requestAnimationFrame(() => {
        elements.globalSearchInput?.focus({ preventScroll: true });
      });
    }
  } else if (elements.globalSearchInput) {
    elements.globalSearchInput.blur();
  }
}

function closeMobileSearch() {
  if (!elements.siteHeader?.classList.contains('search-open')) return;
  toggleMobileSearch(false);
}

function ensureSearchToggleElement() {
  if (elements.searchToggle && document.body.contains(elements.searchToggle)) {
    return;
  }
  const header = elements.siteHeader;
  const headerBar = header?.querySelector('.site-header__bar');
  if (!headerBar) return;
  let actions = headerBar.querySelector('.header-actions');
  if (!actions) {
    actions = document.createElement('div');
    actions.className = 'header-actions';
    headerBar.appendChild(actions);
  }
  const btn = document.createElement('button');
  btn.className = 'search-toggle';
  btn.id = 'searchToggle';
  btn.type = 'button';
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', 'globalSearch');
  btn.innerHTML = `
    <span class="sr-only">Toggle search</span>
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></circle>
      <line x1="20" y1="20" x2="16.65" y2="16.65" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></line>
    </svg>
  `;
  if (actions.firstChild) {
    actions.insertBefore(btn, actions.firstChild);
  } else {
    actions.appendChild(btn);
  }
  elements.searchToggle = btn;
}

function renderIngredientCard(item) {
  const aliasLine = item.alias ? `<p class="muted">${escapeHtml(item.alias)}</p>` : '';
  const packLine = item.size ? `<p class="muted">Pack size: ${escapeHtml(item.size)}</p>` : '';
  const hasDiscount = item.wasUGX && item.wasUGX > item.priceUGX;
  const was = hasDiscount ? `<span class="was">${formatUGX(item.wasUGX)}</span>` : '';
  const discountPct = hasDiscount ? Math.round(((item.wasUGX - item.priceUGX) / item.wasUGX) * 100) : 0;
  const discountBadge = discountPct > 0 ? `<span class="discount-badge">-${discountPct}%</span>` : '';
  const priceRow = item.priceUGX
    ? `<div class="product-card__price-row"><span class="price">${formatUGX(item.priceUGX)}</span>${was}${discountBadge}</div>`
    : (was ? `<div class="product-card__price-row">${was}${discountBadge}</div>` : '');
  return `
    <article class="card product-card ingredient-card" data-ingredient-open="${escapeHtml(item.id)}" tabindex="0" aria-label="View details for ${escapeHtml(item.name)}">
      <figure class="product-card__media">
        <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy" decoding="async" />
        <button class="btn ghost product-card__details" data-ingredient-qv="${escapeHtml(item.id)}" type="button">Details</button>
      </figure>
      <div class="product-card__body">
        <h3>${escapeHtml(item.name)}</h3>
        ${aliasLine}
        ${packLine}
        ${priceRow}
        <button class="btn primary block" data-add-ingredient="${escapeHtml(item.id)}" type="button" aria-label="Add ${escapeHtml(item.name)} to cart">Add to cart</button>
      </div>
    </article>
  `;
}

function attachIngredientEvents(scope) {
  qsa('[data-add-ingredient]', scope).forEach(button => button.addEventListener('click', handleAddIngredient));
  qsa('[data-ingredient-qv]', scope).forEach(button => button.addEventListener('click', handleIngredientQuickView));
  qsa('.ingredient-card[data-ingredient-open]', scope).forEach(card => {
    card.addEventListener('click', (e) => {
      const target = e.target;
      if (target.closest('button')) return;
      const id = card.getAttribute('data-ingredient-open');
      if (id) openQuickView(id, 'ingredient');
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const id = card.getAttribute('data-ingredient-open');
        if (id) openQuickView(id, 'ingredient');
      }
    });
  });
}

function handleIngredientQuickView(event) {
  const id = event.currentTarget.getAttribute('data-ingredient-qv');
  if (!id) return;
  openQuickView(id, 'ingredient');
}

function handleAddIngredient(event) {
  const id = event.currentTarget.getAttribute('data-add-ingredient');
  if (!id) return;
  addToCart(id, 'ingredient');
}

function renderProducts() {
  if (!elements.grid) return;
  const items = applyFilters();
  if (!items.length) {
    elements.grid.innerHTML = '<article class="card"><p class="muted">No products match your filters yet. Try resetting or browsing another concern.</p></article>';
    return;
  }
  elements.grid.innerHTML = items.map(renderProductCard).join('');
  attachProductEvents(elements.grid);
  enhanceProductImages(elements.grid);
}

function renderFavorites() {
  if (!elements.favGrid || !state.products.length) return;
  const bestsellerMatches = state.products.filter(product => product.badges.some(badge => /best/i.test(badge)));
  const featured = (bestsellerMatches.length ? bestsellerMatches : [...state.products]).slice(0, 4);
  elements.favGrid.innerHTML = featured.map(renderProductCard).join('');
  attachProductEvents(elements.favGrid);
  enhanceProductImages(elements.favGrid);
}

function renderProductCard(product) {
  const was = product.wasUGX && product.wasUGX > product.priceUGX ? `<span class="was">${formatUGX(product.wasUGX)}</span>` : '';
  const discountPct = product.wasUGX && product.wasUGX > product.priceUGX
    ? Math.round(((product.wasUGX - product.priceUGX) / product.wasUGX) * 100)
    : 0;
  const discount = discountPct > 0 ? `<span class="discount-badge">-${discountPct}%</span>` : '';
  const tags = product.badges.length ? product.badges.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('') : '';
  const packSize = product.size ? `<p class="muted">Pack size: ${escapeHtml(product.size)}</p>` : '';
  return `
    <article class="card product-card" data-open="${escapeHtml(product.id)}" tabindex="0" aria-label="View details for ${escapeHtml(product.name)}">
      <figure class="product-card__media">
        <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy" decoding="async" />
        <button class="btn ghost product-card__details" data-qv="${escapeHtml(product.id)}" type="button">Details</button>
      </figure>
      <div class="product-card__body">
        <h3>${escapeHtml(product.name)}</h3>
        ${packSize}
        <div class="product-card__price-row">
          <span class="price">${formatUGX(product.priceUGX)}</span>
          ${was}
          ${discount}
        </div>
        <div class="product-card__tags">${tags}</div>
        <button class="btn primary block" data-add="${escapeHtml(product.id)}" type="button">Add to cart</button>
      </div>
    </article>
  `;
}

function attachProductEvents(scope) {
  qsa('[data-add]', scope).forEach(button => button.addEventListener('click', handleAdd));
  qsa('[data-qv]', scope).forEach(button => button.addEventListener('click', handleQuickView));
  // Open quick view when clicking the whole card (except on interactive controls)
  qsa('.product-card[data-open]', scope).forEach(card => {
    card.addEventListener('click', (e) => {
      const target = e.target;
      if (target.closest('button')) return; // don't trigger when buttons are clicked
      const id = card.getAttribute('data-open');
      if (id) openQuickView(id, 'product');
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const id = card.getAttribute('data-open');
        if (id) openQuickView(id, 'product');
      }
    });
  });
}

function handleAdd(event) {
  const id = event.currentTarget.getAttribute('data-add');
  if (!id) return;
  addToCart(id);
}

function handleQuickView(event) {
  const id = event.currentTarget.getAttribute('data-qv');
  if (!id) return;
  openQuickView(id, 'product');
}

function applyFilters() {
  let list = [...state.products];
  if (state.filters.q) {
    list = list.filter(item => `${item.name} ${item.category} ${item.brand}`.toLowerCase().includes(state.filters.q));
  }
  if (state.filters.category) {
    list = list.filter(item => item.category === state.filters.category);
  }
  if (state.filters.sort === 'price-asc') list.sort((a, b) => a.priceUGX - b.priceUGX);
  if (state.filters.sort === 'price-desc') list.sort((a, b) => b.priceUGX - a.priceUGX);
  if (state.filters.sort === 'name-asc') list.sort((a, b) => a.name.localeCompare(b.name));
  return list;
}

function addToCart(id, source = 'product') {
  const catalog = source === 'ingredient' ? state.ingredients : state.products;
  const item = catalog.find(entry => entry.id === id);
  if (!item) return;
  const cartId = source === 'ingredient' ? `ingredient:${item.id}` : item.id;
  const existing = state.cart.find(entry => entry.id === cartId);
  if (existing) {
    existing.qty += 1;
  } else {
    const image = normalizeAsset(item.image) || 'assets/nivera-logo.svg';
    const size = source === 'ingredient'
      ? (item.size || item.concentration || '')
      : (item.size || '');
    const category = source === 'ingredient'
      ? ['Ingredient', item.category].filter(Boolean).join(' • ')
      : item.category;
    state.cart.push({
      id: cartId,
      itemId: item.id,
      type: source,
      name: item.name,
      priceUGX: item.priceUGX || 0,
      image,
      size,
      category,
      qty: 1
    });
  }
  saveCart();
  drawCart();
  showToast(`${item.name} successfully added to cart`);
}

function handleCartClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.dataset.inc) {
    updateQty(target.dataset.inc, 1);
  } else if (target.dataset.dec) {
    updateQty(target.dataset.dec, -1);
  } else if (target.dataset.del) {
    removeFromCart(target.dataset.del);
  }
}

function updateQty(id, delta) {
  const entry = state.cart.find(item => item.id === id);
  if (!entry) return;
  entry.qty += delta;
  if (entry.qty <= 0) {
    state.cart = state.cart.filter(item => item.id !== id);
  }
  saveCart();
  drawCart();
}

function removeFromCart(id) {
  state.cart = state.cart.filter(item => item.id !== id);
  saveCart();
  drawCart();
}

function drawCart() {
  if (!elements.cartItems) return;
  elements.cartItems.textContent = '';
  if (!state.cart.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'Your cart is empty. Explore bestsellers or ingredient essentials to add your first item.';
    elements.cartItems.appendChild(empty);
  } else {
    const frag = document.createDocumentFragment();
    state.cart.forEach(item => {
      const row = document.createElement('div');
      row.className = 'cart-item';

      const image = document.createElement('img');
      image.src = item.image;
      image.alt = item.name;
      image.loading = 'lazy';
      image.decoding = 'async';
      image.width = 56;
      image.height = 56;
      image.onerror = () => { image.src = normalizeAsset('assets/nivera-logo.svg'); };
      row.appendChild(image);

      const info = document.createElement('div');
      const titleWrap = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = item.name;
      titleWrap.appendChild(title);
      info.appendChild(titleWrap);
      if (item.size || item.category) {
        const meta = document.createElement('small');
        meta.className = 'kicker';
        const sizeLabel = item.size ? `Pack size: ${item.size}` : '';
        meta.textContent = [sizeLabel, item.category].filter(Boolean).join(' • ');
        info.appendChild(meta);
      }
      row.appendChild(info);

      const qtyWrap = document.createElement('div');
      qtyWrap.className = 'qty';
      const dec = document.createElement('button');
      dec.type = 'button';
      dec.dataset.dec = item.id;
      dec.textContent = '-';
      const qty = document.createElement('span');
      qty.textContent = String(item.qty);
      const inc = document.createElement('button');
      inc.type = 'button';
      inc.dataset.inc = item.id;
      inc.textContent = '+';
      qtyWrap.append(dec, qty, inc);
      row.appendChild(qtyWrap);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'cart-remove';
      remove.dataset.del = item.id;
      remove.setAttribute('aria-label', `Remove ${item.name}`);
      remove.textContent = 'Remove';
      row.appendChild(remove);

      frag.appendChild(row);
    });
    elements.cartItems.appendChild(frag);
  }

  const total = state.cart.reduce((sum, item) => sum + item.priceUGX * item.qty, 0);
  if (elements.cartTotal) {
    elements.cartTotal.textContent = formatUGX(total);
  }

  updateCartBadge();

  const threshold = 120000;
  if (elements.cartDelivery) {
    if (!state.cart.length) {
      elements.cartDelivery.classList.remove('eligible');
      elements.cartDelivery.textContent = `Add ${formatUGX(threshold)} of items to unlock free Kampala delivery.`;
    } else if (total >= threshold) {
      elements.cartDelivery.classList.add('eligible');
      elements.cartDelivery.textContent = 'You qualify for free Kampala delivery.';
    } else {
      const remaining = threshold - total;
      elements.cartDelivery.classList.remove('eligible');
      elements.cartDelivery.textContent = `${formatUGX(remaining)} more in your cart unlocks free Kampala delivery.`;
    }
  }

  if (elements.checkoutBtn) {
    elements.checkoutBtn.disabled = !state.cart.length;
  }
  if (elements.clearCartBtn) {
    elements.clearCartBtn.disabled = !state.cart.length;
  }
}

function updateCartBadge() {
  const count = state.cart.reduce((sum, item) => sum + item.qty, 0);
  if (elements.cartCount) {
    elements.cartCount.textContent = count;
  }
}

function openCart() {
  if (!elements.cartDrawer) return;
  state.lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  elements.cartDrawer.classList.add('open');
  elements.cartDrawer.setAttribute('aria-hidden', 'false');
  elements.cartBtn?.setAttribute('aria-expanded', 'true');
  document.body.classList.add('cart-open');
  if (elements.closeCartBtn) {
    queueMicrotask(() => elements.closeCartBtn.focus({ preventScroll: true }));
  }
}

function closeCart() {
  if (!elements.cartDrawer) return;
  elements.cartDrawer.classList.remove('open');
  elements.cartDrawer.setAttribute('aria-hidden', 'true');
  elements.cartBtn?.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('cart-open');
  if (state.lastFocus && document.contains(state.lastFocus)) {
    queueMicrotask(() => state.lastFocus?.focus({ preventScroll: true }));
  }
}

function checkoutCart() {
  const target = resolveCheckoutPath();
  if (!state.cart.length) {
    location.href = target;
    return;
  }
  location.href = target;
}

function openQuickView(id, source = 'auto') {
  const dialog = elements.quickView;
  if (!dialog) return;
  let type = source;
  let item = null;
  if (source === 'product') {
    item = state.products.find(entry => entry.id === id) || null;
  } else if (source === 'ingredient') {
    item = state.ingredients.find(entry => entry.id === id) || null;
  } else {
    item = state.products.find(entry => entry.id === id) || null;
    if (item) {
      type = 'product';
    } else {
      item = state.ingredients.find(entry => entry.id === id) || null;
      if (item) type = 'ingredient';
    }
  }
  if (!item) return;
  if (type !== 'ingredient') type = 'product';
  state.quickViewFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (elements.qvImg) {
    elements.qvImg.src = item.image || normalizeAsset('assets/nivera-logo.svg');
    elements.qvImg.alt = item.name;
    elements.qvImg.onerror = () => { elements.qvImg.src = normalizeAsset('assets/nivera-logo.svg'); };
  }
  if (elements.qvTitle) elements.qvTitle.textContent = item.name;
  if (elements.qvMeta) {
    if (type === 'product') {
      const detail = [item.brand || 'Aloniva', item.category, item.size].filter(Boolean).join(' • ');
      elements.qvMeta.textContent = detail;
    } else {
      const meta = [item.category, item.concentration, item.size].filter(Boolean).join(' • ');
      elements.qvMeta.textContent = meta || 'Signature active ingredient';
    }
  }
  if (elements.qvPrice) {
    if (type === 'product') {
      const was = item.wasUGX && item.wasUGX > item.priceUGX ? `<span class="was">${formatUGX(item.wasUGX)}</span>` : '';
      elements.qvPrice.innerHTML = `${formatUGX(item.priceUGX)} ${was}`;
    } else {
      const was = item.wasUGX && item.wasUGX > item.priceUGX ? `<span class="was">${formatUGX(item.wasUGX)}</span>` : '';
      if (item.priceUGX) {
        elements.qvPrice.innerHTML = `${formatUGX(item.priceUGX)} ${was}`;
      } else if (was) {
        elements.qvPrice.innerHTML = was;
      } else {
        elements.qvPrice.textContent = '';
      }
    }
  }
  if (elements.qvDescription) {
    if (type === 'product') {
      elements.qvDescription.textContent = item.description || 'Formulated by pharmacists. Gentle, effective, routine-friendly.';
    } else {
      const benefits = Array.isArray(item.benefits) && item.benefits.length
        ? `Benefits: ${item.benefits.map(entry => entry.trim()).filter(Boolean).map(entry => `• ${entry}`).join(' ')}`
        : '';
      const featured = Array.isArray(item.featured) && item.featured.length
        ? `Featured in: ${item.featured.map(entry => entry.trim()).filter(Boolean).join(', ')}.`
        : '';
      const text = [item.summary, benefits, featured].filter(Boolean).join(' ');
      elements.qvDescription.textContent = text || 'Derm-selected active concentrate for custom routines.';
    }
  }
  if (elements.qvAdd) {
    elements.qvAdd.onclick = () => {
      addToCart(id, type);
      closeQuickView();
    };
    elements.qvAdd.textContent = 'Add to cart';
  }
  if (elements.qvBulk) {
    const baseMessage = `Hello Aloniva,\nI would like to purchase ${item.name}${item.size ? ` (pack size: ${item.size})` : ''} in bulk. Please share pricing and availability.`;
    const encoded = encodeURIComponent(baseMessage);
    elements.qvBulk.onclick = () => {
      window.open(`https://wa.me/256750491105?text=${encoded}`, '_blank', 'noopener');
    };
    elements.qvBulk.style.display = 'inline-flex';
  }
  if (typeof dialog.showModal === 'function') {
    dialog.showModal();
  } else {
    dialog.setAttribute('open', 'true');
  }
}

function closeQuickView() {
  const dialog = elements.quickView;
  if (!dialog) return;
  if (dialog.open && typeof dialog.close === 'function') {
    dialog.close();
  } else {
    dialog.removeAttribute('open');
  }
  if (state.quickViewFocus && document.contains(state.quickViewFocus)) {
    queueMicrotask(() => state.quickViewFocus?.focus({ preventScroll: true }));
  }
  if (elements.qvBulk) {
    elements.qvBulk.onclick = null;
  }
}

function hydrateHero() {
  const wrap = document.getElementById('heroSlides');
  if (!wrap) return;
  const images = Array.isArray(window.HERO_IMAGES) && window.HERO_IMAGES.length ? window.HERO_IMAGES : [
    { src: 'assets/freepik/lady-applying-cream.jpg', alt: 'Applying cream' },
    { src: 'assets/freepik/applying-sunscreen.jpg', alt: 'Applying sunscreen outdoors' },
    { src: 'assets/freepik/man-cleansing-face.jpg', alt: 'Cleansing routine' }
  ];
  wrap.innerHTML = '';
  const slides = images.map((item, index) => {
    const img = document.createElement('img');
    img.className = index === 0 ? 'hero-slide current' : 'hero-slide';
    img.loading = index === 0 ? 'eager' : 'lazy';
    img.decoding = 'async';
    img.src = item.src;
    img.alt = item.alt || 'Aloniva skincare';
    if (index === 0) {
      try { img.fetchPriority = 'high'; } catch {}
      img.width = 1600; // helps layout stability
      img.height = 900; // approximate 16:9 for hero
      img.sizes = '100vw';
    }
    // generic hint for responsive layout even without multiple sources
    if (!img.sizes) img.sizes = '100vw';
    applySrcset(img, item.src);
    wrap.appendChild(img);
    return img;
  });
  if (slides.length <= 1) return;
  let pointer = 0;
  setInterval(() => {
    slides[pointer].classList.remove('current');
    pointer = (pointer + 1) % slides.length;
    slides[pointer].classList.add('current');
  }, 5500);
}

function hydrateSocial() {
  if (!elements.socialStrip) return;
  const items = [
    { src: 'assets/freepik/lady-applying-cream.jpg', caption: 'Barrier care' },
    { src: 'assets/freepik/applying-sunscreen.jpg', caption: 'SPF every day' },
    { src: 'assets/freepik/man-cleansing-face.jpg', caption: 'Routine ready' },
    { src: 'assets/freepik/couple-skincare.jpg', caption: 'Community love' }
  ];
  elements.socialStrip.innerHTML = items.map(item => `
    <a class="social-tile" href="https://www.instagram.com/alonivaskincare" target="_blank" rel="noopener">
      <img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.caption)}" loading="lazy" decoding="async" width="220" height="220" />
      <span>${escapeHtml(item.caption)}</span>
    </a>
  `).join('');
  qsa('img', elements.socialStrip).forEach(img => applySrcset(img, img.getAttribute('src') || ''));
}

function applyQueryFilters() {
  try {
    const params = new URLSearchParams(location.search);
    const q = (params.get('q') || '').trim();
    const category = (params.get('category') || '').trim();
    const sort = (params.get('sort') || '').trim();
    if (q) {
      state.filters.q = q.toLowerCase();
      if (elements.headerSearchInput) elements.headerSearchInput.value = q;
      if (elements.productSearch) elements.productSearch.value = q;
      const globalSearchInput = document.getElementById('globalSearch');
      if (globalSearchInput) globalSearchInput.value = q;
    }
    if (category) {
      state.filters.category = category;
      if (elements.filterSelect) elements.filterSelect.value = category;
    }
    if (sort) {
      state.filters.sort = sort;
      if (elements.sortSelect) elements.sortSelect.value = sort;
    }
    // If we're on a page with a shop section, ensure it's visible after applying
    if ((q || category || sort) && document.getElementById('shop')) {
      document.getElementById('shop').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } catch (_) {
    // ignore
  }
}

function highlightNav() {
  const path = (location.pathname || '/').replace(/index\.html$/, '').replace(/\/$/, '');
  const links = qsa('nav a[href]');
  links.forEach(a => {
    const href = a.getAttribute('href') || '';
    if (!href || /^https?:/i.test(href) || href.startsWith('#')) return;
    const url = new URL(href, location.href);
    const apath = url.pathname.replace(/index\.html$/, '').replace(/\/$/, '');
    if (apath === path && a.getAttribute('aria-current') !== 'page') {
      a.setAttribute('aria-current', 'page');
      const toggle = a.closest('.dropdown')?.previousElementSibling;
      if (toggle && toggle.classList.contains('menu__toggle')) {
        toggle.setAttribute('aria-expanded', 'true');
        toggle.closest('.menu.has-dropdown')?.classList.add('open');
        toggle.classList.add('active');
      }
    }
  });
}

function getMenuItems(menuOrDrop) {
  const drop = menuOrDrop.classList?.contains('dropdown') ? menuOrDrop : menuOrDrop.querySelector('.dropdown');
  return qsa('a[role="menuitem"]', drop);
}

function openMenu(menu, btn) {
  btn.setAttribute('aria-expanded', 'true');
  menu.classList.add('open');
}

function closeMenu(menu, btn) {
  btn.setAttribute('aria-expanded', 'false');
  menu.classList.remove('open');
}

function closeOtherMenus(except) {
  qsa('.menu.has-dropdown').forEach(m => {
    if (m !== except) {
      const b = m.querySelector('.menu__toggle');
      if (b) b.setAttribute('aria-expanded', 'false');
      m.classList.remove('open');
    }
  });
}

function focusFirstItem(menu) {
  const items = getMenuItems(menu);
  if (items.length) items[0].focus();
}

function focusLastItem(menu) {
  const items = getMenuItems(menu);
  if (items.length) items[items.length - 1].focus();
}

function setupDropdownHover() {
  const mql = window.matchMedia('(hover: hover) and (pointer: fine)');
  const enable = () => window.innerWidth > 960 && mql.matches;
  qsa('.menu.has-dropdown').forEach(menu => {
    const btn = menu.querySelector('.menu__toggle');
    if (!btn) return;
    let openTimer = null;
    let closeTimer = null;
    menu.addEventListener('mouseenter', () => {
      if (!enable()) return;
      if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
      openTimer = setTimeout(() => openMenu(menu, btn), 120);
    });
    menu.addEventListener('mouseleave', () => {
      if (!enable()) return;
      if (openTimer) { clearTimeout(openTimer); openTimer = null; }
      closeTimer = setTimeout(() => closeMenu(menu, btn), 200);
    });
  });
}

// Map pretty routes to file-based paths when running from filesystem (file://)
function getRoute(prettyPath) {
  if (location.protocol !== 'file:') return prettyPath;
  const map = {
    'shop': 'pages/shop.html',
    'bestsellers': 'pages/bestsellers.html',
    'collections': 'pages/collections.html',
    'routine': 'pages/routine.html',
    'ingredients': 'pages/ingredients.html',
    'trust': 'pages/trust.html',
    'faq': 'pages/faq.html',
    'support': 'pages/support.html',
    'formula-builder': 'pages/formula-builder.html',
    'checkout-whatsapp': 'pages/checkout-whatsapp.html',
    'offers': 'pages/offers.html'
  };
  return map[prettyPath] || prettyPath;
}

function ensureLocalLinks() {
  if (location.protocol !== 'file:') return;
  const inSubdir = /[\\\/]pages[\\\/]/.test(location.pathname) || /[\\\/]blog[\\\/]/.test(location.pathname);
  const homeReplacement = inSubdir ? '../index.html' : 'index.html';
  const map = {
    '/': homeReplacement,
    'shop': '/pages/shop.html',
    'bestsellers': 'pages/bestsellers.html',
    'collections': 'pages/collections.html',
    'routine': 'pages/routine.html',
    'routine-builder': 'pages/routine-builder.html',
    'ingredients': '/pages/ingredients.html',
    'trust': 'pages/trust.html',
    'faq': 'pages/faq.html',
    'support': 'pages/support.html',
    'formula-builder': 'pages/formula-builder.html',
    'checkout-whatsapp': 'pages/checkout-whatsapp.html',
    '/pages/formula-builder.html': 'pages/formula-builder.html',
    '/pages/routine-builder.html': 'pages/routine-builder.html',
    '/pages/checkout-whatsapp.html': 'pages/checkout-whatsapp.html',
    'offers': 'pages/offers.html',
    'blog': 'blog/'
  };
  // Rewrite anchors
  qsa('a[href]').forEach(a => {
    const href = a.getAttribute('href') || '';
    const u = new URL(href, location.href);
    const pretty = u.pathname + (u.search || '') + (u.hash || '');
    const base = u.pathname;
    if (map[base]) {
      const replacement = map[base] + (u.search || '') + (u.hash || '');
      a.setAttribute('href', replacement);
    }
  });
  // Rewrite menu toggle data-href
  qsa('.menu__toggle[data-href]').forEach(btn => {
    const dest = btn.getAttribute('data-href') || '';
    try {
      const u = new URL(dest, location.href);
      const base = u.pathname;
      if (map[base]) btn.setAttribute('data-href', map[base]);
    } catch (_) {}
  });
}

function setupDropdownHover() {
  const mql = window.matchMedia('(hover: hover) and (pointer: fine)');
  const enable = () => window.innerWidth > 960 && mql.matches;
  const menus = qsa('.menu.has-dropdown');
  menus.forEach(menu => {
    const btn = menu.querySelector('.menu__toggle');
    if (!btn) return;
    menu.addEventListener('mouseenter', () => {
      if (!enable()) return;
      btn.setAttribute('aria-expanded', 'true');
      menu.classList.add('open');
    });
    menu.addEventListener('mouseleave', () => {
      if (!enable()) return;
      btn.setAttribute('aria-expanded', 'false');
      menu.classList.remove('open');
    });
  });
}

async function hydrateJournal() {
  if (!elements.journalGrid) return;
  try {
    const res = await fetch('data/blogs.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load blog data');
    const data = await res.json();
    const posts = (data.posts || []).slice(0, 3);
    if (!posts.length) return;
    elements.journalGrid.innerHTML = posts.map(post => {
      const date = new Date(post.date);
      const label = Number.isNaN(date.valueOf()) ? '' : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const title = typeof post.title === 'string' ? post.title.replace(' | Aloniva Skincare', '') : 'Read more';
      return `
        <article class="journal-card">
          <img src="${escapeHtml(post.cover_image || 'assets/freepik/lady-applying-cream.jpeg')}" alt="${escapeHtml(title)}" loading="lazy" decoding="async" />
          <div>
            <p class="kicker">${escapeHtml(label)}</p>
            <h3>${escapeHtml(title)}</h3>
            <p class="muted">${escapeHtml(post.excerpt || '')}</p>
            <a class="link" href="/pages/blogs.html#${escapeHtml(post.slug || '')}">Read more</a>
          </div>
        </article>
      `;
    }).join('');
  } catch (error) {
    console.warn('Journal hydrate failed', error);
    elements.journalGrid.innerHTML = '<p class="muted">Stories are on the way. Check back soon for fresh dermatologist insights.</p>';
  }
}

function initReveal() {
  if (typeof IntersectionObserver !== 'function') return;
  const targets = qsa('.reveal');
  if (!targets.length) return;
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('visible');
      qsa('.card, .reveal-child', entry.target).forEach((child, index) => {
        child.style.transitionDelay = `${index * 60}ms`;
        child.classList.add('visible');
      });
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.18 });
  targets.forEach(target => observer.observe(target));
}

function initCounters() {
  if (typeof IntersectionObserver !== 'function') return;
  const counters = qsa('[data-count]');
  if (!counters.length) return;
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const target = Number(el.dataset.count || 0);
      let current = 0;
      const step = Math.max(1, Math.floor(target / 80));
      const timer = setInterval(() => {
        current += step;
        if (current >= target) {
          current = target;
          clearInterval(timer);
        }
        el.textContent = current.toLocaleString('en-UG');
      }, 20);
      observer.unobserve(el);
    });
  }, { threshold: 0.3 });
  counters.forEach(counter => observer.observe(counter));
}

function initTilt() {
  const hero = qs('.hero');
  const content = hero?.querySelector('.hero-content');
  if (!hero || !content) return;
  hero.addEventListener('mousemove', event => {
    const rect = hero.getBoundingClientRect();
    const percentX = (event.clientX - rect.left) / rect.width - 0.5;
    const percentY = (event.clientY - rect.top) / rect.height - 0.5;
    const max = 4;
    content.style.setProperty('--tiltX', `${-percentY * max}deg`);
    content.style.setProperty('--tiltY', `${percentX * max}deg`);
  });
  hero.addEventListener('mouseleave', () => {
    content.style.setProperty('--tiltX', '0deg');
    content.style.setProperty('--tiltY', '0deg');
  });
}

async function enrichProducts() {
  try {
    const res = await fetch('data/products.json', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    const augmented = Array.isArray(data.products) ? data.products : [];
    const map = new Map(augmented.map(item => [String(item.name || '').toLowerCase(), item]));
    state.products = state.products.map(product => {
      const extra = map.get(product.name.toLowerCase());
      if (!extra) return product;
      return {
        ...product,
        description: extra.description || product.description,
        image: extra.image ? normalizeAsset(extra.image) : product.image,
        badges: product.badges.length ? product.badges : Array.isArray(extra.tags) ? extra.tags : product.badges
      };
    });
    populateFilters();
    renderProducts();
    renderFavorites();
  } catch (error) {
    console.warn('Product enrichment skipped', error);
  }
}

// Responsive image helpers (optional; activates if data/images.json exists)
async function loadImageMap() {
  try {
    const res = await fetch('data/images.json', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    if (data && typeof data === 'object') {
      state.imageMap = data;
    }
  } catch (_) {
    // silently skip if not available
  }
}

function normalizeAsset(path) {
  if (!path) return '';
  try {
    // Absolute URLs pass through
    if (/^https?:\/\//i.test(path)) return path;
    if (location.protocol === 'file:') {
      // When previewing locally from filesystem, adjust for subdirectories
      // so assets resolve correctly relative to the current HTML file.
      const clean = path.replace(/^\/+/, '');
      const pathname = (location.pathname || '').replace(/\\/g, '/');
      // If current page is in /pages/ or /blog/, we need to go up one level
      const needsUp = /\/pages\//i.test(pathname) || /\/blog\//i.test(pathname);
      return (needsUp ? '../' : '') + clean;
    }
    // On a web server, ensure asset paths are root-relative
    if (path.startsWith('/')) return path;
    return '/' + path.replace(/^\/+/, '');
  } catch (_) {
    return path;
  }
}

function applySrcset(img, originalSrc) {
  if (!originalSrc || !state.imageMap) return;
  const entry = state.imageMap[originalSrc] || state.imageMap['/' + originalSrc.replace(/^\/+/, '')] || null;
  if (!entry || !Array.isArray(entry.sources) || !entry.sources.length) return;
  const srcset = entry.sources.map(s => `${s.src} ${s.width}w`).join(', ');
  img.srcset = srcset;
  if (!img.sizes) img.sizes = entry.sizes || '100vw';
}

function enhanceProductImages(scope) {
  qsa('.product-card__media img', scope).forEach(img => {
    img.addEventListener('error', () => {
      img.src = normalizeAsset('assets/nivera-logo.svg');
    });
  });
}


if (!globalThis.__alonivaSearchQueued) {
  globalThis.__alonivaSearchQueued = true;
  import('./tools/search.js').catch(() => {});
}






