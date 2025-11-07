import { buildIngredientIndex } from './formula-calculators.js';

export const FORMULA_TEMPLATES = [
  {
    id: 'template-hydrating-lotion',
    name: 'Hydrating Lotion',
    description: 'Lightweight O/W lotion featuring humectant-rich water phase and silky emollients.',
    batchSize: 1000,
    productType: 'Lotion',
    targetPH: 5.5,
    targetTempC: 75,
    notes: 'Heat phases A/B separately to 75°C, homogenise, then cool <40°C before adding Phase C.',
    phases: [
      {
        id: 'phase-a',
        name: 'Phase A (Water)',
        temperature: 75,
        items: [
          { id: 'a1', ingredientId: 'ing-deionized-water', function: 'Solvent', percent: 62.9 },
          { id: 'a2', ingredientId: 'ing-glycerin', function: 'Humectant', percent: 4 },
          { id: 'a3', ingredientId: 'ing-propanediol', function: 'Humectant', percent: 3 },
          { id: 'a4', ingredientId: 'ing-xanthan-gum', function: 'Thickener', percent: 0.3 }
        ]
      },
      {
        id: 'phase-b',
        name: 'Phase B (Oil)',
        temperature: 75,
        items: [
          { id: 'b1', ingredientId: 'ing-caprylic-capric-triglyceride', function: 'Emollient', percent: 10 },
          { id: 'b2', ingredientId: 'ing-squalane', function: 'Emollient', percent: 5 },
          { id: 'b3', ingredientId: 'ing-glyceryl-stearate-se', function: 'Primary Emulsifier', percent: 3 },
          { id: 'b4', ingredientId: 'ing-polyglyceryl-6-stearate', function: 'Co-Emulsifier', percent: 2 },
          { id: 'b5', ingredientId: 'ing-cetearyl-alcohol', function: 'Thickener', percent: 2 }
        ]
      },
      {
        id: 'phase-c',
        name: 'Phase C (Cool down)',
        temperature: 30,
        items: [
          { id: 'c1', ingredientId: 'ing-niacinamide', function: 'Brightener', percent: 4 },
          { id: 'c2', ingredientId: 'ing-panthenol', function: 'Soother', percent: 1.5 },
          { id: 'c3', ingredientId: 'ing-sodium-pca', function: 'Humectant', percent: 1 },
          { id: 'c4', ingredientId: 'ing-phenoxyethanol-ethylhexylglycerin', function: 'Preservative', percent: 0.8 },
          { id: 'c5', ingredientId: 'ing-vitamin-e', function: 'Antioxidant', percent: 0.2 },
          { id: 'c6', ingredientId: 'ing-fragrance-free', function: 'Sensory', percent: 0.2 },
          { id: 'c7', ingredientId: 'ing-citric-acid', function: 'pH adjust', percent: 0.1 }
        ]
      }
    ],
    regions: { UG: true, EA: true, EU: true, US: true }
  },
  {
    id: 'template-gel-serum',
    name: 'Gel Serum',
    description: 'Water-light serum with humectants, brighteners, and light gel matrix.',
    batchSize: 500,
    productType: 'Serum',
    targetPH: 5.2,
    targetTempC: 25,
    notes: 'Disperse polymers into Phase A, neutralise with Phase C while stirring. Avoid air entrapment.',
    phases: [
      {
        id: 'phase-a',
        name: 'Phase A',
        temperature: 25,
        items: [
          { id: 'ga1', ingredientId: 'ing-deionized-water', function: 'Solvent', percent: 83.2 },
          { id: 'ga2', ingredientId: 'ing-butyleneglycol', function: 'Humectant', percent: 3 },
          { id: 'ga3', ingredientId: 'ing-glycerin', function: 'Humectant', percent: 3 },
          { id: 'ga4', ingredientId: 'ing-hydroxyethylcellulose', function: 'Polymer', percent: 0.4 }
        ]
      },
      {
        id: 'phase-b',
        name: 'Phase B',
        temperature: 25,
        items: [
          { id: 'gb1', ingredientId: 'ing-sodium-hyaluronate', function: 'Humectant', percent: 0.15 },
          { id: 'gb2', ingredientId: 'ing-panthenol', function: 'Soother', percent: 1 },
          { id: 'gb3', ingredientId: 'ing-ascorbyl-glucoside', function: 'Brightener', percent: 2 },
          { id: 'gb4', ingredientId: 'ing-alpha-arbutin', function: 'Brightener', percent: 1.5 }
        ]
      },
      {
        id: 'phase-c',
        name: 'Phase C',
        temperature: 25,
        items: [
          { id: 'gc1', ingredientId: 'ing-phenoxyethanol-ethylhexylglycerin', function: 'Preservative', percent: 0.8 },
          { id: 'gc2', ingredientId: 'ing-sodium-hydroxide', function: 'pH adjust', percent: 0.15 },
          { id: 'gc3', ingredientId: 'ing-niacinamide', function: 'Vitamin', percent: 4 },
          { id: 'gc4', ingredientId: 'ing-licorice-extract', function: 'Brightener', percent: 0.8 }
        ]
      }
    ],
    regions: { UG: true, EA: true, EU: true, US: true }
  },
  {
    id: 'template-foaming-cleanser',
    name: 'Foaming Cleanser',
    description: 'Mild amino-acid based foaming cleanser.',
    batchSize: 1000,
    productType: 'Cleanser',
    targetPH: 5.5,
    targetTempC: 70,
    notes: 'Heat Phase A to 70°C until SCI melts. Cool to 40°C before adding Phase C.',
    phases: [
      {
        id: 'phase-a',
        name: 'Phase A',
        temperature: 70,
        items: [
          { id: 'fa1', ingredientId: 'ing-deionized-water', function: 'Solvent', percent: 54.3 },
          { id: 'fa2', ingredientId: 'ing-sodium-cocoyl-isethionate', function: 'Primary Surfactant', percent: 25 },
          { id: 'fa3', ingredientId: 'ing-decyl-glucoside', function: 'Secondary Surfactant', percent: 5 },
          { id: 'fa4', ingredientId: 'ing-cocamidopropyl-betaine', function: 'Foam booster', percent: 8 },
          { id: 'fa5', ingredientId: 'ing-glycerin', function: 'Humectant', percent: 5 }
        ]
      },
      {
        id: 'phase-b',
        name: 'Phase B',
        temperature: 25,
        items: [
          { id: 'fb1', ingredientId: 'ing-panthenol', function: 'Soother', percent: 1 },
          { id: 'fb2', ingredientId: 'ing-allantoin', function: 'Soother', percent: 0.3 }
        ]
      },
      {
        id: 'phase-c',
        name: 'Phase C',
        temperature: 25,
        items: [
          { id: 'fc1', ingredientId: 'ing-phenoxyethanol-ethylhexylglycerin', function: 'Preservative', percent: 0.8 },
          { id: 'fc2', ingredientId: 'ing-citric-acid', function: 'pH adjust', percent: 0.4 },
          { id: 'fc3', ingredientId: 'ing-bisal', function: 'Soothing', percent: 0.2 }
        ]
      }
    ],
    regions: { UG: true, EA: true, EU: true, US: true }
  },
  {
    id: 'template-anhydrous-balm',
    name: 'Anhydrous Recovery Balm',
    description: 'Waterless balm with rich occlusives and antioxidants.',
    batchSize: 750,
    productType: 'Balm',
    targetPH: null,
    targetTempC: 75,
    notes: 'Melt Phase A to 75°C, stir until uniform, cool to 45°C before adding heat-sensitive ingredients.',
    phases: [
      {
        id: 'phase-a',
        name: 'Phase A',
        temperature: 75,
        items: [
          { id: 'ba1', ingredientId: 'ing-shea-butter', function: 'Occlusive', percent: 20 },
          { id: 'ba2', ingredientId: 'ing-squalane', function: 'Emollient', percent: 20 },
          { id: 'ba3', ingredientId: 'ing-isoamyl-laurate', function: 'Silicone alternative', percent: 12 },
          { id: 'ba4', ingredientId: 'ing-cetyl-alcohol', function: 'Structure', percent: 7 },
          { id: 'ba5', ingredientId: 'ing-mango-butter', function: 'Emollient', percent: 15 },
          { id: 'ba6', ingredientId: 'ing-camellia-seed-oil', function: 'Emollient', percent: 10 },
          { id: 'ba7', ingredientId: 'ing-jojoba-oil', function: 'Emollient', percent: 5 },
          { id: 'ba8', ingredientId: 'ing-shorea-butter', function: 'Structure', percent: 8 }
        ]
      },
      {
        id: 'phase-b',
        name: 'Phase B',
        temperature: 45,
        items: [
          { id: 'bb1', ingredientId: 'ing-vitamin-e', function: 'Antioxidant', percent: 0.5 },
          { id: 'bb2', ingredientId: 'ing-bisal', function: 'Soothing', percent: 0.3 },
          { id: 'bb3', ingredientId: 'ing-kojic-dipalmitate', function: 'Brightening', percent: 2 },
          { id: 'bb4', ingredientId: 'ing-fragrance-free', function: 'Sensory', percent: 0.2 }
        ]
      }
    ],
    regions: { UG: true, EA: true, EU: true, US: true }
  }
];

export function createSampleFormulas(library = []) {
  const index = buildIngredientIndex(library);
  return FORMULA_TEMPLATES.slice(0, 2).map((template, idx) => {
    const version = `v1.0`;
    return {
      ...template,
      id: `sample-${template.id}`,
      version,
      createdAt: null,
      updatedAt: null,
      notes: template.notes,
      phases: template.phases.map(phase => ({
        ...phase,
        items: phase.items.map(item => ({
          ...item,
          grams: 0,
          ingredientName: index.get(item.ingredientId)?.inciName || ''
        }))
      }))
    };
  });
}
