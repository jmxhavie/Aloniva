const DB_NAME = 'aloniva-formula-db';
const DB_VERSION = 1;
const LAST_FORMULA_KEY = 'aloniva.builder.lastFormula';
const THEME_KEY = 'aloniva.builder.theme';
const MEMORY_KEYS = {
  formulas: 'aloniva.builder.memory.formulas',
  versions: 'aloniva.builder.memory.versions',
  ingredients: 'aloniva.builder.memory.ingredients'
};

let dbPromise;
let useMemoryStore = false;
const memoryStore = {
  formulas: new Map(),
  versions: new Map(),
  ingredients: new Map()
};

function hydrateMemoryStore() {
  try {
    const formulas = JSON.parse(localStorage.getItem(MEMORY_KEYS.formulas) || '[]');
    const versions = JSON.parse(localStorage.getItem(MEMORY_KEYS.versions) || '[]');
    const ingredients = JSON.parse(localStorage.getItem(MEMORY_KEYS.ingredients) || '[]');
    formulas.forEach(item => memoryStore.formulas.set(item.id, item));
    versions.forEach(item => memoryStore.versions.set(item.versionId, item));
    ingredients.forEach(item => memoryStore.ingredients.set(item.id, item));
  } catch (error) {
    console.warn('Failed to hydrate memory store', error);
  }
}

function persistMemoryStore() {
  try {
    localStorage.setItem(MEMORY_KEYS.formulas, JSON.stringify([...memoryStore.formulas.values()]));
    localStorage.setItem(MEMORY_KEYS.versions, JSON.stringify([...memoryStore.versions.values()]));
    localStorage.setItem(MEMORY_KEYS.ingredients, JSON.stringify([...memoryStore.ingredients.values()]));
  } catch (error) {
    console.warn('Failed to persist memory store', error);
  }
}

hydrateMemoryStore();

function waitForGlobal(name, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    (function check() {
      if (globalThis[name]) {
        resolve(globalThis[name]);
        return;
      }
      if (performance.now() - start > timeout) {
        reject(new Error(`Global ${name} not available`));
        return;
      }
      setTimeout(check, 30);
    })();
  });
}

async function getDB() {
  if (useMemoryStore) return null;
  if (dbPromise) return dbPromise;
  try {
    const idb = await waitForGlobal('idb', 5000);
    dbPromise = idb.openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('formulas')) {
          const store = db.createObjectStore('formulas', { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt');
          store.createIndex('name', 'name');
        }
        if (!db.objectStoreNames.contains('versions')) {
          const store = db.createObjectStore('versions', { keyPath: 'versionId' });
          store.createIndex('formulaId', 'formulaId');
          store.createIndex('createdAt', 'createdAt');
        }
        if (!db.objectStoreNames.contains('ingredients')) {
          db.createObjectStore('ingredients', { keyPath: 'id' });
        }
      }
    });
    return dbPromise;
  } catch (error) {
    console.warn('IndexedDB unavailable, falling back to LocalStorage memory store', error);
    useMemoryStore = true;
    dbPromise = Promise.resolve(null);
    return null;
  }
}

export async function saveFormula(formula) {
  const db = await getDB();
  const now = new Date().toISOString();
  const record = { ...formula, updatedAt: now, createdAt: formula.createdAt || now };
  if (useMemoryStore || !db) {
    memoryStore.formulas.set(record.id, record);
    persistMemoryStore();
    return record;
  }
  await db.put('formulas', record);
  return record;
}

export async function loadFormula(id) {
  const db = await getDB();
  if (useMemoryStore || !db) {
    return memoryStore.formulas.get(id) || null;
  }
  return db.get('formulas', id);
}

export async function deleteFormula(id) {
  const db = await getDB();
  if (useMemoryStore || !db) {
    memoryStore.formulas.delete(id);
    persistMemoryStore();
    return;
  }
  await db.delete('formulas', id);
}

export async function listFormulas() {
  const db = await getDB();
  let all;
  if (useMemoryStore || !db) {
    all = [...memoryStore.formulas.values()];
  } else {
    all = await db.getAll('formulas');
  }
  return all.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
}

export async function saveVersion(formula, note = '') {
  const db = await getDB();
  const timestamp = new Date().toISOString();
  const versionId = `${formula.id}:${timestamp}`;
  const record = {
    versionId,
    formulaId: formula.id,
    name: formula.name,
    note,
    createdAt: timestamp,
    snapshot: JSON.parse(JSON.stringify(formula))
  };
  if (useMemoryStore || !db) {
    memoryStore.versions.set(versionId, record);
    persistMemoryStore();
    return record;
  }
  await db.put('versions', record);
  return record;
}

export async function listVersions(formulaId) {
  const db = await getDB();
  let versions;
  if (useMemoryStore || !db) {
    versions = [...memoryStore.versions.values()].filter(v => v.formulaId === formulaId);
  } else {
    const index = db.transaction('versions').store.index('formulaId');
    versions = await index.getAll(formulaId);
  }
  return versions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function restoreVersion(versionId) {
  const db = await getDB();
  let record;
  if (useMemoryStore || !db) {
    record = memoryStore.versions.get(versionId);
  } else {
    record = await db.get('versions', versionId);
  }
  return record ? record.snapshot : null;
}

export async function seedIngredients(library) {
  if (!Array.isArray(library) || !library.length) return;
  const db = await getDB();
  if (useMemoryStore || !db) {
    if (memoryStore.ingredients.size) return;
    library.forEach(item => memoryStore.ingredients.set(item.id, item));
    persistMemoryStore();
    return;
  }
  const tx = db.transaction('ingredients', 'readwrite');
  const store = tx.store;
  const existingCount = await store.count();
  if (!existingCount) {
    for (const item of library) {
      await store.put(item);
    }
  }
  await tx.done;
}

export async function getIngredientLibrary() {
  const db = await getDB();
  if (useMemoryStore || !db) {
    return [...memoryStore.ingredients.values()];
  }
  return db.getAll('ingredients');
}

export async function seedSampleFormulas(formulas = []) {
  if (!formulas.length) return;
  const db = await getDB();
  const now = new Date().toISOString();
  if (useMemoryStore || !db) {
    if (memoryStore.formulas.size) return;
    formulas.forEach(formula => {
      const record = { ...formula, createdAt: now, updatedAt: now };
      memoryStore.formulas.set(record.id, record);
    });
    persistMemoryStore();
    return;
  }
  const count = await db.count('formulas');
  if (count) return;
  const tx = db.transaction('formulas', 'readwrite');
  const store = tx.store;
  for (const formula of formulas) {
    await store.put({
      ...formula,
      createdAt: now,
      updatedAt: now
    });
  }
  await tx.done;
}

export function getLastOpenedFormulaId() {
  return localStorage.getItem(LAST_FORMULA_KEY);
}

export function setLastOpenedFormulaId(id) {
  if (id) localStorage.setItem(LAST_FORMULA_KEY, id);
}

export function getThemePreference() {
  return localStorage.getItem(THEME_KEY) || 'system';
}

export function setThemePreference(value) {
  localStorage.setItem(THEME_KEY, value);
}
