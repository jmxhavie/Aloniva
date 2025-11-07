import { calcTotalsPercent, calcSolubilityBreakdown, calcRHLB, calcPreservativeEstimate, calcPHHelper, calcTemperatureGuidance } from './formula-calculators.js';

function createWarning(level, message, ref = null) {
  return { level, message, ref };
}

export function validateFormula(formula, ingredientIndex) {
  const warnings = [];
  const totals = calcTotalsPercent(formula);
  if (!totals.isBalanced) {
    warnings.push(createWarning('blocking', `Total percentages equal ${totals.total.toFixed(2)}%. Adjust until you reach 100%.`));
  }

  const breakdown = calcSolubilityBreakdown(formula, ingredientIndex);
  const preservative = calcPreservativeEstimate(formula, ingredientIndex);
  if (preservative.requiresPreservative && !preservative.hasPreservative) {
    warnings.push(createWarning('blocking', 'Water content is ≥ 20%, but no preservative is present. Add a broad-spectrum system.'));
  }
  preservative.rangeWarnings.forEach(message => {
    warnings.push(createWarning('caution', message));
  });

  const hlb = calcRHLB(formula, ingredientIndex);
  if (hlb.delta > 2) {
    warnings.push(createWarning('blocking', `HLB delta is ${hlb.delta}. Select emulsifiers closer to the required HLB ${hlb.requiredHLB}.`));
  } else if (hlb.delta > 1) {
    warnings.push(createWarning('caution', `HLB delta is ${hlb.delta}. Stability may be compromised.`));
  }

  const ph = calcPHHelper(formula, ingredientIndex, formula.targetPH);
  ph.warnings.forEach(message => {
    warnings.push(createWarning('caution', message));
  });

  const heatAlerts = calcTemperatureGuidance(formula, ingredientIndex, formula.targetTempC);
  heatAlerts.forEach(alert => {
    warnings.push(createWarning('caution', `${alert.ingredientName} overheats (limit ${alert.limit}°C, current ${alert.actual}°C).`, { phaseId: alert.phaseId, itemId: alert.ingredientId }));
  });

  // Region limits (if ingredient has regulatory caps)
  const selectedRegions = Object.entries(formula.regions || {}).filter(([, value]) => Boolean(value)).map(([key]) => key);
  if (selectedRegions.length) {
    formula.phases.forEach(phase => {
      phase.items.forEach(item => {
        const ingredient = ingredientIndex.get(item.ingredientId);
        if (!ingredient) return;
        const pct = Number(item.percent || 0);
        const regulatory = ingredient.regulatory || {};
        selectedRegions.forEach(region => {
          if (regulatory[region] && pct > regulatory[region]) {
            warnings.push(createWarning('blocking', `${ingredient.inciName} exceeds ${region} limit (${pct}% > ${regulatory[region]}%).`, { phaseId: phase.id, itemId: item.id }));
          }
        });
      });
    });
  }

  // Fragrance threshold
  formula.phases.forEach(phase => {
    phase.items.forEach(item => {
      const ingredient = ingredientIndex.get(item.ingredientId);
      if (!ingredient) return;
      const isFragrance = (ingredient.functionTags || []).includes('fragrance') || ingredient.inciName.toLowerCase().includes('fragrance');
      if (isFragrance && Number(item.percent || 0) > 0.8) {
        warnings.push(createWarning('caution', `${ingredient.inciName} exceeds recommended leave-on fragrance maximum (0.8%).`, { phaseId: phase.id, itemId: item.id }));
      }
    });
  });

  if (breakdown.water === 0 && breakdown.oil > 0 && !hlb.emulsifierTotal && breakdown.other < 5) {
    warnings.push(createWarning('info', 'Formula appears anhydrous. Ensure packaging prevents moisture ingress.'));
  }

  return warnings;
}
