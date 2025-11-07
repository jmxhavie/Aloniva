const PRICE_TIERS = {
  low: (value) => value < 35000,
  medium: (value) => value >= 35000 && value < 65000,
  premium: (value) => value >= 65000
};

const STEP_KEYWORDS = [
  { step: 'cleanser', patterns: ['cleanser', 'wash', 'foam', 'gel wash'] },
  { step: 'sunscreen', patterns: ['sunscreen', 'spf', 'sun screen', 'uv'] },
  { step: 'moisturizer', patterns: ['moistur', 'cream', 'lotion', 'butter', 'emulsion'] },
  { step: 'serum', patterns: ['serum', 'essence', 'booster', 'ampoule'] },
  { step: 'spot', patterns: ['spot', 'treatment', 'gel', 'blemish'] },
  { step: 'toner', patterns: ['toner', 'tonic', 'mist'] }
];

const DEFAULT_PIPELINE = {
  am: ['cleanser', 'serum', 'moisturizer', 'sunscreen'],
  pm: ['cleanser', 'serum', 'moisturizer', 'spot']
};

const CONCERN_KEYWORDS = {
  acne: ['acne', 'breakout', 'blemish', 'clarifying', 'clarify', 'spot', 'pimple'],
  oil: ['oil', 'sebum', 'oil-control', 'shine', 'matte'],
  hydration: ['hydration', 'hydrate', 'moisture', 'moisturizing', 'dehydration', 'plump', 'water'],
  barrier: ['barrier', 'repair', 'ceramide', 'recovery', 'strengthen'],
  pigmentation: ['pigmentation', 'hyperpigmentation', 'dark', 'spot', 'uneven', 'tone'],
  brightening: ['brighten', 'brightening', 'glow', 'radiance', 'vitamin-c'],
  soothing: ['soothing', 'calming', 'sensitive', 'redness', 'comfort'],
  aging: ['aging', 'anti-aging', 'firm', 'lifting', 'retinol', 'lines', 'wrinkle']
};

const CONCERN_LABELS = {
  acne: 'breakouts',
  oil: 'oil control',
  hydration: 'hydration',
  barrier: 'barrier repair',
  pigmentation: 'dark spots',
  brightening: 'radiance',
  soothing: 'sensitivity',
  aging: 'fine lines'
};

function normalizeText(value = '') {
  return value.toLowerCase();
}

function inferStep(name = '') {
  const label = normalizeText(name);
  for (const { step, patterns } of STEP_KEYWORDS) {
    if (patterns.some((pattern) => label.includes(pattern))) {
      return step;
    }
  }
  return 'serum';
}

function deriveTags(product = {}) {
  const tags = new Set();
  const fields = [
    product.tags,
    product.badges,
    product.category,
    product.description
  ];
  fields.flat().filter(Boolean).forEach((source) => {
    const stringValue = Array.isArray(source) ? source.join(' ') : String(source);
    stringValue
      .toLowerCase()
      .split(/[^a-z0-9\-\+%]+/g)
      .filter(Boolean)
      .forEach((token) => tags.add(token));
  });
  return Array.from(tags);
}

function productMatchesConcern(product, concern) {
  const keywords = CONCERN_KEYWORDS[concern] || [concern];
  const tags = product.tags || [];
  const haystack = `${product.name || ''} ${product.description || ''}`.toLowerCase();
  return keywords.some((keyword) => tags.includes(keyword) || haystack.includes(keyword));
}

function formatConcern(concern) {
  return CONCERN_LABELS[concern] || concern;
}

function toPrice(value) {
  if (Number.isFinite(value)) return value;
  if (!value) return 0;
  const number = Number(String(value).replace(/[^\d.]/g, ''));
  return Number.isFinite(number) ? number : 0;
}

function getTier(price) {
  if (PRICE_TIERS.low(price)) return 'low';
  if (PRICE_TIERS.medium(price)) return 'medium';
  return 'premium';
}

export function buildIndex(products = []) {
  return products.map((product) => {
    const priceUGX = toPrice(product.priceUGX ?? product.price);
    const step = product.step || inferStep(product.name || '');
    const tags = deriveTags(product);
    return {
      ...product,
      step,
      tags,
      priceUGX,
      _tier: getTier(priceUGX)
    };
  });
}

export function scoreProduct(product, answers) {
  let score = 0;
  const reasons = [];
  const concerns = (answers.concern || []).map((label) => normalizeText(label));
  const productTags = product.tags || [];
  const requestedCategories = new Set((answers.category || []).map((cat) => normalizeText(cat)));

  if (answers.requiredStep && product.step === answers.requiredStep) {
    score += 30;
    reasons.push(`Ideal for ${product.step} step`);
  }

  if (requestedCategories.size) {
    const matchesCategory = requestedCategories.has(normalizeText(product.category || ''));
    if (matchesCategory) {
      score += 12;
      reasons.push(`Matches ${product.category} range`);
    }
  }

  concerns.forEach((concern) => {
    if (productMatchesConcern(product, concern)) {
      score += 10;
      reasons.push(`Targets ${formatConcern(concern)}`);
    }
  });

  if (answers.skin) {
    const skinTag = normalizeText(answers.skin);
    if (productTags.includes(skinTag)) {
      score += 6;
      reasons.push(`Supports ${answers.skin} skin`);
    }
  }

  if (answers.fragrance === 'no-fragrance') {
    if (productTags.includes('fragrance-free') || productTags.includes('fragrancefree')) {
      score += 4;
      reasons.push('Fragrance-free');
    } else {
      score -= 6;
    }
  }

  if (answers.sensitivity === 'high') {
    if (productTags.includes('strong-acid') || productTags.includes('retinoid') || productTags.includes('retinol')) {
      score -= 18;
      reasons.push('Potent actives—patch test first');
    }
  }

  if (answers.pregnancy) {
    if (productTags.includes('retinoid') || productTags.includes('retinol') || productTags.includes('high-salicylic')) {
      score -= 50;
      reasons.push('Not pregnancy recommended');
    } else {
      score += 2;
    }
  }

  if (answers.skin === 'dry') {
    if (product.step === 'moisturizer' || /(butter|balm|cream|ointment)/i.test(product.name || '')) {
      score += 6;
      reasons.push('Comforts dry skin');
    }
  }

  if (answers.budget && product._tier === answers.budget) {
    score += 3;
    reasons.push(`Fits ${answers.budget} budget`);
  }

  return { score, reasons };
}

export function pipeline(answers = {}) {
  const complexity = answers.complexity || 'standard';
  const wantsSPF = answers.spf !== false;
  const concerns = answers.concern || [];
  const quick = complexity === 'quick';
  const advanced = complexity === 'advanced';

  const amSteps = ['cleanser'];
  if (!quick) amSteps.push('serum');
  amSteps.push('moisturizer');
  if (wantsSPF) amSteps.push('sunscreen');

  const pmSteps = ['cleanser'];
  if (!quick || advanced) pmSteps.push('serum');
  if (advanced && concerns.length > 0) pmSteps.push('treatment');
  pmSteps.push('moisturizer');
  if (concerns.some((c) => ['acne', 'breakouts', 'blemish'].includes(c))) {
    pmSteps.push('spot');
  }

  return { am: amSteps, pm: pmSteps };
}

function selectProducts(products, answers, step) {
  const concerns = Array.isArray(answers.concern) ? answers.concern.map((c) => c.toLowerCase()) : [];
  const basePool = products.filter((product) => {
    if (step === 'treatment') {
      return product.step === 'serum' || product.step === 'treatment';
    }
    return product.step === step;
  });

  let pool = basePool;
  if (concerns.length) {
    const matched = basePool.filter((product) => concerns.some((concern) => productMatchesConcern(product, concern)));
    if (matched.length) pool = matched;
  }
  if (Array.isArray(answers.category) && answers.category.length) {
    const requested = new Set(answers.category.map((cat) => cat.toLowerCase()));
    pool = pool.filter((product) => requested.has((product.category || '').toLowerCase()));
    if (!pool.length) return [];
  }
  if (answers.skin === 'oily') {
    const blacklist = /(butter|ointment|jelly|moisturizer|moisturiser|cream)/i;
    const filtered = pool.filter((product) => product.step !== 'moisturizer' && !blacklist.test(product.name || ''));
    if (!filtered.length) {
      return [];
    }
    pool = filtered;
  }
  if (!pool.length) return [];

  const scored = pool.map((product) => {
    const evaluation = scoreProduct(product, { ...answers, requiredStep: step === 'treatment' ? 'serum' : step });
    return { ...product, score: evaluation.score, reasons: evaluation.reasons };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.priceUGX !== b.priceUGX) return a.priceUGX - b.priceUGX;
    return a.name.localeCompare(b.name);
  });

  return scored.slice(0, Math.min(scored.length, 2));
}

function selectCategoryProducts(products, answers, category) {
  const matches = products.filter((product) => (product.category || '').toLowerCase() === category.toLowerCase());
  if (!matches.length) return [];
  const custom = { ...answers, category: [category] };
  const scored = matches
    .map((product) => {
      const evaluation = scoreProduct(product, custom);
      return { ...product, score: evaluation.score, reasons: evaluation.reasons };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if ((a.priceUGX || 0) !== (b.priceUGX || 0)) return (a.priceUGX || 0) - (b.priceUGX || 0);
      return a.name.localeCompare(b.name);
    });
  return scored.slice(0, 4);
}

export function recommend(products, answers = {}) {
  const categories = Array.isArray(answers.category) ? answers.category.filter(Boolean) : [];
  if (categories.length) {
    const blocks = categories.map((category) => ({
      step: category,
      period: null,
      items: selectCategoryProducts(products, answers, category)
    })).filter((block) => block.items.length);
    return { am: blocks, pm: [] };
  }

  const flows = pipeline(answers);
  const result = {
    am: [],
    pm: []
  };

  flows.am.forEach((step) => {
    result.am.push({
      step,
      items: selectProducts(products, answers, step)
    });
  });

  flows.pm.forEach((step) => {
    result.pm.push({
      step,
      items: selectProducts(products, answers, step)
    });
  });

  return result;
}

export default {
  buildIndex,
  scoreProduct,
  pipeline,
  recommend
};
