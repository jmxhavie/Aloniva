import { applyBatchGrams } from './formula-calculators.js';

function buildFileName(formula, ext) {
  const safeName = (formula.name || 'Formula').replace(/[^a-z0-9\-_\s]/gi, '').replace(/\s+/g, '-');
  const version = formula.version || 'v1.0';
  const date = new Date().toISOString().slice(0, 10);
  return `${safeName}_${version}_${date}.${ext}`;
}

function downloadBlob(content, mime, filename) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildINCIList(formula, ingredientIndex) {
  const flattened = [];
  formula.phases.forEach(phase => {
    phase.items.forEach(item => {
      const ingredient = ingredientIndex.get(item.ingredientId);
      flattened.push({
        inci: ingredient?.inciName || item.ingredientId,
        trade: ingredient?.tradeName || '',
        percent: Number(item.percent || 0),
        grams: Number(item.grams || 0),
        phase: phase.name
      });
    });
  });
  flattened.sort((a, b) => b.percent - a.percent);
  return flattened;
}

export async function exportFormulaPDF(formula, ingredientIndex, options = {}) {
  const jsPDFLib = window.jspdf;
  if (!jsPDFLib) throw new Error('jsPDF unavailable');
  const doc = new jsPDFLib.jsPDF({ unit: 'mm', format: 'a4' });
  const margins = { x: 14, y: 14, line: 6 };
  let cursorY = margins.y;

  function addLine(text, bold = false) {
    if (bold) doc.setFont(undefined, 'bold'); else doc.setFont(undefined, 'normal');
    doc.text(text, margins.x, cursorY);
    cursorY += margins.line;
  }

  addLine(`Formula: ${formula.name || 'Untitled'}`, true);
  addLine(`Version: ${formula.version || 'v1.0'}`);
  addLine(`Batch Size: ${formula.batchSize || 0} g`);
  addLine(`Product Type: ${formula.productType || '—'}`);
  addLine(`Target pH: ${formula.targetPH ?? '—'}  |  Target Temp: ${formula.targetTempC ?? '—'}°C`);
  cursorY += 4;
  addLine('INCI (Descending %)', true);

  const inciList = buildINCIList(formula, ingredientIndex);
  inciList.forEach(item => {
    if (cursorY > 276) {
      doc.addPage();
      cursorY = margins.y;
    }
    addLine(`${item.inci} — ${item.percent.toFixed(2)}% (${item.grams.toFixed(2)} g) [${item.phase}]`);
  });

  cursorY += 4;
  addLine('Manufacturing Notes', true);
  (formula.notes || '—').split('\n').forEach(line => addLine(line));

  cursorY += 4;
  addLine('Regulatory Regions: ' + Object.entries(formula.regions || {}).filter(([, v]) => v).map(([k]) => k).join(', ') || 'None');

  if (options.summary) {
    cursorY += 4;
    addLine('Quick Metrics', true);
    const { totals, breakdown, costing } = options.summary;
    addLine(`Total %: ${totals.total.toFixed(2)}%`);
    addLine(`Water/Oil/Other: ${breakdown.water.toFixed(1)} / ${breakdown.oil.toFixed(1)} / ${breakdown.other.toFixed(1)}`);
    addLine(`Cost/Unit: $${costing.totalCostPerUnit.toFixed(2)} | Margin at $${costing.targetPrice.toFixed(2)}: ${costing.margin.toFixed(1)}%`);
  }

  const filename = buildFileName(formula, 'pdf');
  doc.save(filename);
}

export async function exportFormulaDOCX(formula, ingredientIndex, options = {}) {
  const docx = window.docx;
  if (!docx) throw new Error('docx unavailable');
  const { Document, Packer, Paragraph, HeadingLevel, Table, TableRow, TableCell, WidthType } = docx;

  const inciList = buildINCIList(formula, ingredientIndex);

  const tableRows = [
    new TableRow({
      children: ['INCI', '%', 'Grams', 'Phase'].map(text => new TableCell({
        width: { size: 25, type: WidthType.PERCENTAGE },
        children: [new Paragraph({ text, heading: HeadingLevel.HEADING_3 })]
      }))
    })
  ];

  inciList.forEach(item => {
    tableRows.push(new TableRow({
      children: [
        new TableCell({ children: [new Paragraph(item.inci)] }),
        new TableCell({ children: [new Paragraph(item.percent.toFixed(2))] }),
        new TableCell({ children: [new Paragraph(item.grams.toFixed(2))] }),
        new TableCell({ children: [new Paragraph(item.phase)] })
      ]
    }));
  });

  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({ text: `Formula: ${formula.name || 'Untitled'}`, heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ text: `Version: ${formula.version || 'v1.0'}` }),
        new Paragraph({ text: `Batch Size: ${formula.batchSize || 0} g` }),
        new Paragraph({ text: `Product Type: ${formula.productType || '—'}` }),
        new Paragraph({ text: `Target pH: ${formula.targetPH ?? '—'}  |  Target Temp: ${formula.targetTempC ?? '—'}°C` }),
        new Paragraph({ text: ' ' }),
        new Paragraph({ text: 'INCI List', heading: HeadingLevel.HEADING_2 }),
        new Table({ rows: tableRows }),
        new Paragraph({ text: ' ' }),
        new Paragraph({ text: 'Manufacturing Notes', heading: HeadingLevel.HEADING_2 }),
        new Paragraph({ text: formula.notes || '—' })
      ]
    }]
  });

  const buffer = await Packer.toBlob(doc);
  const filename = buildFileName(formula, 'docx');
  downloadBlob(buffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', filename);
}

export function exportFormulaCSV(formula, ingredientIndex) {
  const lines = [['Phase', 'Ingredient', 'Trade Name', 'Percent', 'Grams', 'Notes']];
  formula.phases.forEach(phase => {
    phase.items.forEach(item => {
      const ingredient = ingredientIndex.get(item.ingredientId);
      lines.push([
        phase.name,
        ingredient?.inciName || item.ingredientId,
        ingredient?.tradeName || '',
        Number(item.percent || 0).toFixed(3),
        Number(item.grams || 0).toFixed(2),
        item.notes || ''
      ]);
    });
  });
  const csvContent = lines.map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(',')).join('\n');
  const filename = buildFileName(formula, 'csv');
  downloadBlob(csvContent, 'text/csv', filename);
}

export function exportFormulaJSON(formula) {
  const filename = buildFileName(formula, 'json');
  downloadBlob(JSON.stringify(formula, null, 2), 'application/json', filename);
}

export function formatFormulaForExport(formula, ingredientIndex) {
  const enriched = applyBatchGrams(formula);
  enriched.phases.forEach(phase => {
    phase.items.forEach(item => {
      const ingredient = ingredientIndex.get(item.ingredientId);
      if (ingredient) {
        item.ingredientName = ingredient.inciName;
      }
    });
  });
  return enriched;
}
