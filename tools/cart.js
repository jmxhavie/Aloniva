const STORAGE_KEY = 'nivera_cart';

function normalizeProduct(product) {
  if (!product) return null;
  const {
    id,
    name,
    image,
    priceUGX,
    size,
    category
  } = product;
  return {
    id,
    itemId: id,
    type: 'product',
    name,
    priceUGX: Number(priceUGX) || 0,
    image: image || 'assets/nivera-logo.svg',
    size: size || '',
    category: category || '',
    qty: 1
  };
}

function readCart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Cart read failed', error);
    return [];
  }
}

function writeCart(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (error) {
    console.warn('Cart write failed', error);
  }
}

export const cart = {
  key: STORAGE_KEY,
  _read: readCart,
  _write: writeCart,
  add(id, qty = 1, productMeta) {
    if (typeof window.addToCart === 'function') {
      window.addToCart(id, 'product');
      return;
    }
    const cartItems = this._read();
    const existing = cartItems.find(item => item.id === id || item.itemId === id);
    if (existing) {
      existing.qty += qty;
      existing.qty = Math.max(existing.qty, 1);
    } else {
      const normalized = normalizeProduct(productMeta) || { id, itemId: id, qty, type: 'product' };
      normalized.qty = qty;
      cartItems.push(normalized);
    }
    this._write(cartItems);
  },
  remove(id) {
    const cartItems = this._read().filter(item => item.id !== id && item.itemId !== id);
    this._write(cartItems);
  },
  set(id, qty) {
    const cartItems = this._read();
    const entry = cartItems.find(item => item.id === id || item.itemId === id);
    if (entry) {
      entry.qty = Math.max(1, Number(qty) || 1);
      this._write(cartItems);
    }
  },
  all() {
    return this._read();
  },
  clear() {
    this._write([]);
  }
};

export default cart;
