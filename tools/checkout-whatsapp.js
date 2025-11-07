export const CHECKOUT_CFG = {
  businessPhoneIntl: '256750491105',
  currency: 'UGX',
  shippingOptions: [
    { id: 'pickup', label: 'Store Pickup (FREE)', fee: 0 },
    { id: 'kampala', label: 'Kampala Delivery', fee: 5000 },
    { id: 'upcountry', label: 'Upcountry Courier', fee: 12000 }
  ],
  paymentOptions: [
    { id: 'cod', label: 'Cash on Delivery' },
    { id: 'momo', label: 'Mobile Money' }
  ],
  maxWhatsAppChars: 3500
};

import cartHelper from './cart.js';

const ALT_CART_KEY = 'aloniva.cart';
const PLACEHOLDER_IMG = '../assets/nivera-logo.svg';
const FREE_KAMPALA_THRESHOLD = 120000;

const elements = {
  form: document.getElementById('wo-form'),
  items: document.getElementById('wo-items'),
  subtotal: document.getElementById('wo-subtotal'),
  shipping: document.getElementById('wo-shipping'),
  total: document.getElementById('wo-total'),
  error: document.getElementById('wo-error'),
  sendBtn: document.getElementById('wo-send'),
  clearBtn: document.getElementById('wo-clear')
};

const state = {
  items: [],
  totals: { subtotal: 0, shipping: 0, total: 0 },
  shippingFee: 0,
  selectedDeliveryId: ''
};

function readAltCart() {
  try {
    const raw = localStorage.getItem(ALT_CART_KEY);
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Alt cart read failed', error);
    return [];
  }
}

function mergeCart() {
  const primary = cartHelper.all();
  if (primary.length) return { items: primary, source: 'primary' };
  const fallback = readAltCart();
  return { items: fallback, source: 'alt' };
}

function clearAllCarts() {
  cartHelper.clear();
  localStorage.removeItem(ALT_CART_KEY);
}

async function loadProducts() {
  try {
    const mod = await import('../data/products.js').catch(() => null);
    if (Array.isArray(mod?.PRODUCTS)) return mod.PRODUCTS;
  } catch (error) {
    console.warn('Products module import failed', error);
  }
  try {
    const response = await fetch('../data/products.json', { cache: 'force-cache' });
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data)) return data;
      if (Array.isArray(data?.products)) return data.products;
    }
  } catch (error) {
    console.error('Products JSON fetch failed', error);
  }
  return [];
}

function mapProducts(products) {
  const map = new Map();
  products.forEach((product) => {
    const key = String(product.id || product.slug || product.name || '').trim();
    if (!key) return;
    map.set(key, {
      id: key,
      name: product.name || key,
      image: product.image ? resolveAsset(product.image) : PLACEHOLDER_IMG,
      price: Number(product.priceUGX ?? product.price ?? product.wasUGX ?? 0)
    });
  });
  return map;
}

function resolveAsset(path = '') {
  if (!path) return PLACEHOLDER_IMG;
  if (/^https?:\/\//i.test(path)) return path;
  return path.startsWith('..') ? path : `../${path.replace(/^\/+/, '')}`;
}

function hydrateCart(productsMap, cartItems) {
  return cartItems.map((entry) => {
    const key = String(entry.id || entry.itemId || entry.name || '').trim();
    const base = productsMap.get(key) || {};
    const cartId = entry.id || key || `item-${Math.random().toString(36).slice(2, 8)}`;
    const itemId = entry.itemId || entry.id || key;
    const qty = Math.max(1, Number(entry.qty) || 1);
    const price = Number(entry.priceUGX ?? entry.price ?? base.price ?? 0);
    const image = base.image || resolveAsset(entry.image) || PLACEHOLDER_IMG;
    const type = entry.type || 'product';
    const size = entry.size || '';
    const category = entry.category || '';
    return {
      id: cartId,
      cartId,
      itemId,
      type,
      name: base.name || entry.name || 'Product',
      image,
      qty,
      price,
      size,
      category,
      lineTotal: price * qty
    };
  }).filter(item => item.price >= 0);
}

function calcTotals(items, shippingFee) {
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const shipping = Number(shippingFee || 0);
  return { subtotal, shipping, total: subtotal + shipping };
}

function persistCartState() {
  const payload = state.items.map(item => ({
    id: item.cartId,
    itemId: item.itemId || item.cartId,
    type: item.type || 'product',
    name: item.name,
    priceUGX: item.price,
    image: item.image,
    size: item.size || '',
    category: item.category || '',
    qty: item.qty
  }));
  try {
    cartHelper._write?.(payload);
  } catch (error) {
    console.warn('Primary cart sync failed', error);
  }
  if (payload.length) {
    localStorage.setItem(ALT_CART_KEY, JSON.stringify(payload));
  } else {
    localStorage.removeItem(ALT_CART_KEY);
  }
}

function updateHeaderBadge() {
  const badge = document.getElementById('cartCount');
  if (!badge) return;
  const count = state.items.reduce((sum, item) => sum + item.qty, 0);
  badge.textContent = String(count);
}

function fmtMoney(amount) {
  return `${CHECKOUT_CFG.currency} ${Number(amount || 0).toLocaleString('en-UG', { maximumFractionDigits: 0 })}`;
}

function populateSelect(selectEl, options) {
  selectEl.innerHTML = options.map(option => `<option value="${option.id}">${option.label}</option>`).join('');
}

function renderSummary() {
  if (!state.items.length) {
    elements.items.innerHTML = '<p class="rb-empty rb-empty--inline">Your cart is empty.</p>';
    elements.subtotal.textContent = fmtMoney(0);
    elements.shipping.textContent = fmtMoney(0);
    elements.total.textContent = fmtMoney(0);
    elements.sendBtn.disabled = true;
    return;
  }

  const qualifiesFreeDelivery = state.selectedDeliveryId === 'kampala' && state.totals.subtotal >= FREE_KAMPALA_THRESHOLD;

  const itemsMarkup = state.items.map(item => {
    const metaLine = [item.size, item.category].filter(Boolean).join(' • ');
    return `
      <div class="wo-line">
        <div class="wo-line__info">
          <img src="${item.image}" alt="${item.name}" />
          <div class="wo-line__meta">
            <strong>${item.name}</strong>
            ${metaLine ? `<div class="small">${metaLine}</div>` : ''}
            <div class="wo-line__controls">
              <div class="qty" aria-label="Adjust quantity for ${item.name}">
                <button type="button" data-dec="${item.cartId}" aria-label="Decrease quantity for ${item.name}">-</button>
                <span>${item.qty}</span>
                <button type="button" data-inc="${item.cartId}" aria-label="Increase quantity for ${item.name}">+</button>
              </div>
              <button type="button" class="wo-remove" data-remove="${item.cartId}">Remove</button>
            </div>
          </div>
        </div>
        <div class="wo-line__price">${fmtMoney(item.lineTotal)}</div>
      </div>
    `;
  }).join('');

  const offerMarkup = qualifiesFreeDelivery
    ? '<p class="wo-offer" role="status">You qualify for <strong>free Kampala delivery</strong>. We\'ll waive the delivery fee at confirmation.</p>'
    : '';

  elements.items.innerHTML = `${itemsMarkup}${offerMarkup}`;

  elements.subtotal.textContent = fmtMoney(state.totals.subtotal);
  elements.shipping.textContent = fmtMoney(state.totals.shipping);
  elements.total.textContent = fmtMoney(state.totals.total);
  elements.sendBtn.disabled = false;
}

function idNow() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `ALV-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function getFormValues(formEl) {
  const formData = new FormData(formEl);
  const delivery = CHECKOUT_CFG.shippingOptions.find(opt => opt.id === formData.get('delivery'));
  const payment = CHECKOUT_CFG.paymentOptions.find(opt => opt.id === formData.get('payment'));
  return {
    name: (formData.get('name') || '').trim(),
    phone: (formData.get('phone') || '').trim(),
    address: (formData.get('address') || '').trim(),
    notes: (formData.get('notes') || '').trim(),
    deliveryId: delivery?.id,
    deliveryLabel: delivery?.label || '',
    paymentId: payment?.id,
    paymentLabel: payment?.label || ''
  };
}

function validateForm(values) {
  const errors = [];
  if (!values.name) errors.push('Enter your full name.');
  if (!values.phone) errors.push('Enter a valid phone number.');
  if (!values.deliveryId) errors.push('Choose a delivery method.');
  if (!values.paymentId) errors.push('Choose a payment method.');
  return errors;
}

function buildMessage({ orderId, items, totals, form }) {
  const lines = [
    `*New Order*: ${orderId}`,
    `*Name:* ${form.name}`,
    `*Buyer Phone:* ${form.phone}`,
    `*Delivery:* ${form.deliveryLabel}`
  ];
  if (form.address) lines.push(`*Address:* ${form.address}`);
  lines.push(`*Payment:* ${form.paymentLabel}`);
  if (form.notes) lines.push(`*Notes:* ${form.notes}`);
  lines.push('');
  lines.push(`*Items* (${items.length}):`);

  const itemLines = items.map(item => `• ${item.name} x${item.qty} — ${fmtMoney(item.lineTotal)}`);
  let body = [...lines, ...itemLines, '', `*Subtotal:* ${fmtMoney(totals.subtotal)}`, `*Shipping:* ${fmtMoney(totals.shipping)}`, `*Total:* ${fmtMoney(totals.total)}`].join('\n');

  if (body.length > CHECKOUT_CFG.maxWhatsAppChars) {
    const keepCount = Math.max(1, Math.floor(items.length * 0.6));
    const trimmed = items.slice(0, keepCount).map(item => `• ${item.name} x${item.qty} — ${fmtMoney(item.lineTotal)}`);
    const omitted = items.length - keepCount;
    body = [
      ...lines,
      ...trimmed,
      `• +${omitted} more item(s)…`,
      '',
      `*Subtotal:* ${fmtMoney(totals.subtotal)}`,
      `*Shipping:* ${fmtMoney(totals.shipping)}`,
      `*Total:* ${fmtMoney(totals.total)}`
    ].join('\n');
  }

  return body;
}

function openWhatsApp(phoneIntl, message) {
  const encoded = encodeURIComponent(message);
  const urlPrimary = `https://wa.me/${phoneIntl}?text=${encoded}`;
  const urlFallback = `https://api.whatsapp.com/send?phone=${phoneIntl}&text=${encoded}`;
  const opened = window.open(urlPrimary, '_blank');
  if (!opened) {
    window.open(urlFallback, '_blank');
  }
}

function updateTotals() {
  const subtotal = state.items.reduce((sum, item) => sum + item.lineTotal, 0);
  let shippingFee = state.items.length ? state.shippingFee : 0;
  if (
    state.items.length &&
    state.selectedDeliveryId === 'kampala' &&
    subtotal >= FREE_KAMPALA_THRESHOLD
  ) {
    shippingFee = 0;
  }
  state.totals = {
    subtotal,
    shipping: shippingFee,
    total: subtotal + shippingFee
  };
  renderSummary();
  updateHeaderBadge();
}

function adjustQuantity(cartId, delta) {
  const entry = state.items.find(item => item.cartId === cartId);
  if (!entry) return;
  const nextQty = entry.qty + delta;
  if (nextQty <= 0) {
    removeItem(cartId);
    return;
  }
  entry.qty = nextQty;
  entry.lineTotal = entry.price * entry.qty;
  persistCartState();
  updateTotals();
}

function removeItem(cartId) {
  const nextItems = state.items.filter(item => item.cartId === cartId ? false : true);
  if (nextItems.length === state.items.length) return;
  state.items = nextItems;
  if (!state.items.length) {
    const baseDelivery = CHECKOUT_CFG.shippingOptions.find(option => option.id === state.selectedDeliveryId);
    state.shippingFee = baseDelivery?.fee || 0;
  }
  persistCartState();
  updateTotals();
}

function attachEvents() {
  const deliverySelect = elements.form.querySelector('select[name="delivery"]');
  if (deliverySelect) {
    deliverySelect.addEventListener('change', (event) => {
      const selectedId = event.target.value;
      const selected = CHECKOUT_CFG.shippingOptions.find(option => option.id === selectedId);
      state.selectedDeliveryId = selectedId;
      state.shippingFee = selected?.fee || 0;
      updateTotals();
    });
  }

  elements.items?.addEventListener('click', handleItemsClick);

  elements.clearBtn.addEventListener('click', () => {
    clearAllCarts();
    state.items = [];
    const baseDelivery = CHECKOUT_CFG.shippingOptions.find(option => option.id === state.selectedDeliveryId);
    state.shippingFee = baseDelivery?.fee || 0;
    state.totals = calcTotals([], 0);
    updateTotals();
  });

  elements.sendBtn.addEventListener('click', () => {
    const formValues = getFormValues(elements.form);
    const errors = validateForm(formValues);

    if (!state.items.length) {
      errors.unshift('Your cart is empty.');
    }

    if (errors.length) {
      elements.error.textContent = errors.join(' ');
      return;
    }

    elements.error.textContent = '';

    const orderId = idNow();
    const message = buildMessage({
      orderId,
      items: state.items,
      totals: state.totals,
      form: formValues
    });

    openWhatsApp(CHECKOUT_CFG.businessPhoneIntl, message);
  });
}

function handleItemsClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  const inc = target.dataset.inc;
  const dec = target.dataset.dec;
  const remove = target.dataset.remove;
  if (inc) {
    adjustQuantity(inc, 1);
  } else if (dec) {
    adjustQuantity(dec, -1);
  } else if (remove) {
    removeItem(remove);
  }
}

async function init() {
  populateSelect(elements.form.querySelector('select[name="delivery"]'), CHECKOUT_CFG.shippingOptions);
  populateSelect(elements.form.querySelector('select[name="payment"]'), CHECKOUT_CFG.paymentOptions);

  const deliverySelect = elements.form.querySelector('select[name="delivery"]');
  state.selectedDeliveryId = deliverySelect?.value || CHECKOUT_CFG.shippingOptions[0]?.id || '';
  const baseDelivery = CHECKOUT_CFG.shippingOptions.find(option => option.id === state.selectedDeliveryId);
  state.shippingFee = baseDelivery?.fee || 0;

  const products = await loadProducts();
  const productMap = mapProducts(products);
  const { items: rawCart } = mergeCart();
  state.items = hydrateCart(productMap, rawCart);
  state.totals = calcTotals(state.items, state.shippingFee);

  persistCartState();
  updateTotals();
  attachEvents();
}

document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', init, { once: true })
  : init();
