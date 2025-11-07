/**
 * Pure calculation helpers for the Aloniva Formula Builder.
 * These functions never mutate the original formula object.
 */

const DEFAULT_COSTING = {
  packagingUSD: 0.4,
  laborUSD: 0.35,
  overheadUSD: 0.5,
  targetPriceUSD: 12
};

export function buildIngredientIndex(library = []) {
  const index = new Map();
  library.forEach(item => index.set(item.id, item));
  return index;
}

export function cloneFormula(formula) {
  return JSON.parse(JSON.stringify(formula));
}

export function calcTotalsPercent(formula) {
  const total = formula.phases.reduce((sum, phase) => (
    sum + phase.items.reduce((phaseSum, item) => phaseSum + Number(item.percent || 0), 0)
  ), 0);

  const deviation = Math.abs(total - 100);
  return {
    total,
    deviation,
    isBalanced: deviation <= 0.01
  };
}

export function applyBatchGrams(formula) {
  const batchSize = Number(formula.batchSize || 0);
  if (!batchSize) {
    return cloneFormula(formula);
  }
  const copy = cloneFormula(formula);
  copy.phases.forEach(phase => {
    phase.items.forEach(item => {
      const pct = Number(item.percent || 0);
      item.grams = +(batchSize * (pct / 100)).toFixed(2);
    });
  });
  return copy;
}

export function calcSolubilityBreakdown(formula, ingredientIndex) {
  const buckets = {
    water: 0,
    oil: 0,
    other: 0
  };

  formula.phases.forEach(phase => {
    phase.items.forEach(item => {
      const ingredient = ingredientIndex.get(item.ingredientId);
      const pct = Number(item.percent || 0);
      if (!ingredient) {
        buckets.other += pct;
        return;
      }
      const sol = ingredient.solubility || [];
      if (sol.includes('water')) {
        buckets.water += pct;
      } else if (sol.includes('oil')) {
        buckets.oil += pct;
      } else {
        buckets.other += pct;
      }
    });
  });

  const dataset = [
    { label: 'Water Phase', value: +buckets.water.toFixed(2), color: '#1DD4E7' },
    { label: 'Oil Phase', value: +buckets.oil.toFixed(2), color: '#0A1D37' },
    { label: 'Other', value: +buckets.other.toFixed(2), color: '#6C757D' }
  ];

  return {
    ...buckets,
    dataset
  };
}

export function calcPhaseTotals(formula) {
  return formula.phases.map(phase => ({
    phaseId: phase.id,
    name: phase.name,
    total: +phase.items.reduce((sum, item) => sum + Number(item.percent || 0), 0).toFixed(2)
  }));
}

export function calcRHLB(formula, ingredientIndex) {
  let required = 0;
  let emulsifierHLB = 0;
  let oilTotal = 0;
  let emulsifierTotal = 0;

  formula.phases.forEach(phase => {
    phase.items.forEach(item => {
      const ingredient = ingredientIndex.get(item.ingredientId);
      const pct = Number(item.percent || 0);
      if (!ingredient || !pct) return;
      const sol = ingredient.solubility || [];
      if (sol.includes('oil') || (ingredient.functionTags || []).includes('emollient')) {
        const reqHLB = ingredient.requiredHLB;
        if (typeof reqHLB === 'number') {
          required += pct * reqHLB;
        }
        oilTotal += pct;
      }
      if ((ingredient.functionTags || []).includes('primary emulsifier') || (ingredient.functionTags || []).includes('emulsifier')) {
        const hlb = ingredient.hlb || ingredient.requiredHLB || 0;
        emulsifierHLB += pct * hlb;
        emulsifierTotal += pct;
      }
    });
  });

  const requiredAverage = oilTotal ? required / oilTotal : 0;
  const emulsifierAverage = emulsifierTotal ? emulsifierHLB / emulsifierTotal : 0;
  const delta = Math.abs(requiredAverage - emulsifierAverage);
  let status = 'ok';
  if (delta > 2) status = 'critical';
  else if (delta > 1) status = 'watch';

  return {
    oilTotal,
    emulsifierTotal,
    requiredHLB: +requiredAverage.toFixed(2),
    emulsifierHLB: +emulsifierAverage.toFixed(2),
    delta: +delta.toFixed(2),
    status
  };
}

export function calcPreservativeEstimate(formula, ingredientIndex) {
  const breakdown = calcSolubilityBreakdown(formula, ingredientIndex);
  const waterPct = breakdown.water;
  const preservativeItems = [];

  formula.phases.forEach(phase => {
    phase.items.forEach(item => {
      const ingredient = ingredientIndex.get(item.ingredientId);
      if (!ingredient) return;
      if ((ingredient.functionTags || []).includes('preservative')) {
        preservativeItems.push({ phaseId: phase.id, item, ingredient });
      }
    });
  });

  const requiresPreservative = waterPct >= 20;
  const hasPreservative = preservativeItems.length > 0;

  const rangeWarnings = preservativeItems.map(({ item, ingredient }) => {
    const pct = Number(item.percent || 0);
    if (ingredient.usageMinPct && pct < ingredient.usageMinPct) {
      return `Increase ${ingredient.inciName} to at least ${ingredient.usageMinPct}%`;
    }
    if (ingredient.usageMaxPct && pct > ingredient.usageMaxPct) {
      return `Reduce ${ingredient.inciName} to ${ingredient.usageMaxPct}%`;
    }
    return null;
  }).filter(Boolean);

  return {
    waterPct,
    requiresPreservative,
    hasPreservative,
    rangeWarnings
  };
}

export function calcPHHelper(formula, ingredientIndex, targetPH = null) {
  const warnings = [];
  const usedRange = { min: null, max: null };
  formula.phases.forEach(phase => {
    phase.items.forEach(item => {
      const ingredient = ingredientIndex.get(item.ingredientId);
      if (!ingredient) return;
      if (typeof ingredient.pHRangeMin === 'number') {
        usedRange.min = usedRange.min === null ? ingredient.pHRangeMin : Math.max(usedRange.min, ingredient.pHRangeMin);
      }
      if (typeof ingredient.pHRangeMax === 'number') {
        usedRange.max = usedRange.max === null ? ingredient.pHRangeMax : Math.min(usedRange.max, ingredient.pHRangeMax);
      }
    });
  });

  if (targetPH != null) {
    if (usedRange.min !== null && targetPH < usedRange.min) {
      warnings.push(`Target pH ${targetPH} is below the safe window (${usedRange.min} - ${usedRange.max || '—'}).`);
    }
    if (usedRange.max !== null && targetPH > usedRange.max) {
      warnings.push(`Target pH ${targetPH} is above the safe window (${usedRange.min || '—'} - ${usedRange.max}).`);
    }
  }

  return {
    recommendedMin: usedRange.min,
    recommendedMax: usedRange.max,
    warnings
  };
}

export function calcTemperatureGuidance(formula, ingredientIndex, defaultTarget = null) {
  const alerts = [];
  formula.phases.forEach(phase => {
    const phaseTemp = phase.temperature || defaultTarget || null;
    phase.items.forEach(item => {
      const ingredient = ingredientIndex.get(item.ingredientId);
      if (!ingredient || !phaseTemp || ingredient.tempMaxC == null) return;
      if (phaseTemp > ingredient.tempMaxC) {
        alerts.push({
          phaseId: phase.id,
          ingredientId: ingredient.id,
          ingredientName: ingredient.inciName,
          limit: ingredient.tempMaxC,
          actual: phaseTemp
        });
      }
    });
  });
  return alerts;
}

export function calcCosting(formula, ingredientIndex, costingOverrides = {}) {
  const opts = { ...DEFAULT_COSTING, ...costingOverrides };
  const batchSize = Number(formula.batchSize || 0);
  let rawCost = 0;

  formula.phases.forEach(phase => {
    phase.items.forEach(item => {
      const ingredient = ingredientIndex.get(item.ingredientId);
      if (!ingredient) return;
      const pct = Number(item.percent || 0);
      const grams = (batchSize * pct) / 100;
      const kg = grams / 1000;
      const costPerKg = ingredient.costPerKgUSD || 0;
      rawCost += kg * costPerKg;
    });
  });

  const packaging = opts.packagingUSD || 0;
  const labor = opts.laborUSD || 0;
  const overhead = opts.overheadUSD || 0;
  const totalCostPerUnit = rawCost + packaging + labor + overhead;

  const targetPrice = opts.targetPriceUSD || 0;
  const margin = targetPrice ? ((targetPrice - totalCostPerUnit) / targetPrice) * 100 : 0;

  return {
    rawCost: +rawCost.toFixed(2),
    packaging: +packaging.toFixed(2),
    labor: +labor.toFixed(2),
    overhead: +overhead.toFixed(2),
    totalCostPerUnit: +totalCostPerUnit.toFixed(2),
    targetPrice: +targetPrice.toFixed(2),
    margin: +margin.toFixed(2)
  };
}

export function summarizeFormula(formula, ingredientIndex, options = {}) {
  const totals = calcTotalsPercent(formula);
  const breakdown = calcSolubilityBreakdown(formula, ingredientIndex);
  const hlb = calcRHLB(formula, ingredientIndex);
  const preservative = calcPreservativeEstimate(formula, ingredientIndex);
  const ph = calcPHHelper(formula, ingredientIndex, formula.targetPH);
  const heat = calcTemperatureGuidance(formula, ingredientIndex, formula.targetTempC);
  const costing = calcCosting(formula, ingredientIndex, options.costing || {});

  return {
    totals,
    breakdown,
    hlb,
    preservative,
    ph,
    heat,
    costing
  };
}
