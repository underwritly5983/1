/**
 * IFTA Summary Report PDF — professional layout and styling.
 * Page 1: title, four summary cards, main table (left) + Top 15 (right).
 * Main table: US → USA Subtotal → Canada → Canada Subtotal → Grand Total.
 * Styling: cohesive palette, accent line, alternating rows, refined cards.
 */
const PDFDocument = require('pdfkit');

const CANADIAN_PROVINCES = new Set(['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT']);

// Professional color palette
const palette = {
  primary: '#0f172a',      // slate-900 — title, strong text
  accent: '#1d4ed8',      // blue-700 — headers, accent line
  accentDark: '#1e3a8a',   // blue-900 — Grand Total
  muted: '#64748b',       // slate-500 — labels, secondary
  headerBg: '#f1f5f9',    // slate-100
  headerBorder: '#cbd5e1',
  rowAlt: '#f8fafc',      // slate-50 — alternating rows
  subtotalBg: '#e2e8f0',  // slate-200
  cardBg: '#f8fafc',
  cardBorder: '#e2e8f0',
  border: '#e2e8f0',
  white: '#ffffff'
};

function isCanadian(code) {
  const c = String(code || '').trim().toUpperCase();
  return c.length === 2 && CANADIAN_PROVINCES.has(c);
}

function sortJurisdictionsUSThenCanada(jurisdictions) {
  const list = [...(jurisdictions || [])];
  list.sort((a, b) => {
    const aCan = isCanadian(a.code);
    const bCan = isCanadian(b.code);
    if (aCan && !bCan) return 1;
    if (!aCan && bCan) return -1;
    return (b.totalKM || 0) - (a.totalKM || 0);
  });
  return list;
}

function formatReportDate(value) {
  if (value == null) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatReportDateLong(value) {
  if (value == null) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

const quarterKmByIndex = (list, idx) =>
  list.reduce((sum, j) => {
    const q = (j.quarters || [])[idx];
    return sum + (q && q.km != null ? Number(q.km) : 0);
  }, 0);

/** Draw main table header with accent underline. periodLabels length = number of period columns. */
function drawTableHeader(doc, tableLeft, tableWidth, colW, rowHeight, atY, periodLabels) {
  const y = atY != null ? atY : doc.y;
  doc.rect(tableLeft, y, tableWidth, rowHeight).fill(palette.headerBg);
  doc.strokeColor(palette.accent).lineWidth(1).moveTo(tableLeft, y + rowHeight).lineTo(tableLeft + tableWidth, y + rowHeight).stroke();
  doc.strokeColor(palette.headerBorder).lineWidth(0.5).moveTo(tableLeft, y).lineTo(tableLeft + tableWidth, y).stroke();
  doc.fontSize(8).font('Helvetica-Bold').fillColor(palette.muted);
  let x = tableLeft + 5;
  doc.text('Jurisdiction', x, y + 3, { width: colW[0] - 6 });
  x += colW[0];
  for (let i = 0; i < periodLabels.length; i++) {
    const label = String(periodLabels[i] || `P${i + 1}`).slice(0, 14);
    doc.text(label, x, y + 3, { width: colW[i + 1], align: 'right' });
    x += colW[i + 1];
  }
  const totalIdx = 1 + periodLabels.length;
  const pctIdx = totalIdx + 1;
  doc.text('Total KM', x, y + 3, { width: colW[totalIdx], align: 'right' });
  x += colW[totalIdx];
  doc.text('% of Total', x, y + 3, { width: colW[pctIdx], align: 'right' });
  return y + rowHeight;
}

/** Draw Top 15 block with border and styled header. */
function drawTop15Block(doc, top15, top15Left, startY, top15Width, top15RowH, fontTable) {
  let y = startY;
  doc.fontSize(9).font('Helvetica-Bold').fillColor(palette.primary);
  doc.text('Top 15 Jurisdictions', top15Left, y);
  y += top15RowH + 3;
  const headerH = top15RowH + 2;
  doc.rect(top15Left, y, top15Width, headerH).fill(palette.headerBg);
  doc.strokeColor(palette.accent).lineWidth(0.5).rect(top15Left, y, top15Width, headerH).stroke();
  doc.fillColor(palette.muted).fontSize(fontTable).font('Helvetica-Bold');
  const col0 = Math.floor(top15Width * 0.6);
  const col1 = top15Width - col0;
  doc.text('Area', top15Left + 5, y + 3, { width: col0 - 6 });
  doc.text('%', top15Left + col0, y + 3, { width: col1, align: 'right' });
  y += headerH;
  doc.font('Helvetica').fontSize(fontTable);
  for (let i = 0; i < top15.length; i++) {
    const j = top15[i];
    const rowBg = i % 2 === 0 ? palette.white : palette.rowAlt;
    doc.fillColor(rowBg).rect(top15Left, y, top15Width, top15RowH).fill();
    doc.fillColor(palette.primary);
    doc.text(String(j.code || '').slice(0, 8), top15Left + 5, y + 2, { width: col0 - 6 });
    doc.text((j.percentage != null ? j.percentage : 0).toFixed(2) + '%', top15Left + col0, y + 2, { width: col1, align: 'right' });
    y += top15RowH;
  }
  doc.strokeColor(palette.border).lineWidth(0.5).rect(top15Left, startY, top15Width, y - startY).stroke();
  return y;
}

/**
 * Generate PDF: compact header, US/Canada subtotals with separator line, Top 15 on right of page one.
 */
function generateReportPrintPdf(report, reportData, options = {}) {
  return new Promise((resolve, reject) => {
    const jurisdictionData = reportData.jurisdictionData || { jurisdictions: [], grandTotal: 0 };
    const sortedJurisdictions = sortJurisdictionsUSThenCanada(jurisdictionData.jurisdictions);
    const usList = sortedJurisdictions.filter((j) => !isCanadian(j.code));
    const canList = sortedJurisdictions.filter((j) => isCanadian(j.code));
    const top15 = [...(jurisdictionData.jurisdictions || [])]
      .sort((a, b) => (b.totalKM || 0) - (a.totalKM || 0))
      .slice(0, 15);
    const grandTotalNum = jurisdictionData.grandTotal || 0;
    const periods = reportData.quarters || [];
    let numPeriods = periods.length;
    if (jurisdictionData.jurisdictions[0]?.quarters?.length) {
      numPeriods = Math.max(numPeriods, jurisdictionData.jurisdictions[0].quarters.length);
    }
    numPeriods = Math.max(numPeriods, 1);
    const defaultQ = ['Q1', 'Q2', 'Q3', 'Q4'];
    const periodLabels = Array.from({ length: numPeriods }, (_, i) => {
      const q = periods[i];
      if (q && (q.quarter != null || q.year != null)) {
        const qs = String(q.quarter || '').trim();
        const yr = q.year != null ? String(q.year) : '';
        if (qs && yr) return `${qs} ${yr}`;
        return qs || yr || `P${i + 1}`;
      }
      return defaultQ[i] != null ? defaultQ[i] : `P${i + 1}`;
    });
    const periodIndices = Array.from({ length: numPeriods }, (_, i) => i);
    const totalQuarterKms = periodIndices.map((idx) => quarterKmByIndex(jurisdictionData.jurisdictions, idx));
    const usQuarterKms = periodIndices.map((idx) => quarterKmByIndex(usList, idx));
    const canQuarterKms = periodIndices.map((idx) => quarterKmByIndex(canList, idx));
    const usTotalKM = usList.reduce((sum, j) => sum + (j.totalKM || 0), 0);
    const canTotalKM = canList.reduce((sum, j) => sum + (j.totalKM || 0), 0);
    const usPct = grandTotalNum > 0 ? (usTotalKM / grandTotalNum) * 100 : 0;
    const canPct = grandTotalNum > 0 ? (canTotalKM / grandTotalNum) * 100 : 0;

    const margin = 32;
    const pageWidth = 612;
    const pageHeight = 792;
    const pageBottom = pageHeight - margin;
    const bodyWidth = pageWidth - margin * 2;
    const doc = new PDFDocument({ margin, size: 'LETTER', autoFirstPage: true });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const fontTitle = 18;
    const fontSub = 9;
    const fontTable = 7;
    const rowHeight = 10;
    const cardH = 28;
    const jW = 58;
    const pW = 42;
    const tW = 52;
    const pctW = 50;
    const colW = [jW, ...Array(numPeriods).fill(pW), tW, pctW];
    const tableWidth = colW.reduce((a, b) => a + b, 0);
    const tableLeft = margin;
    const top15Width = 175;
    const top15Left = pageWidth - margin - top15Width;
    const top15RowH = 8;

    // ---- Title and subtitle (professional typography)
    const titleY = doc.y;
    doc.fontSize(fontTitle).font('Helvetica-Bold').fillColor(palette.primary);
    doc.text(String(report.report_name || 'IFTA Summary'), margin, titleY, { align: 'left' });
    const subtitleY = titleY + 24;
    doc.fontSize(fontSub).font('Helvetica').fillColor(palette.muted);
    doc.text(`Generated on ${formatReportDateLong(report.created_at)}`, margin, subtitleY, { align: 'left' });
    const cardY = subtitleY + 14;
    doc.y = cardY;

    // ---- Summary cards: light fill, border, left accent
    const cardLabels = ['Total Jurisdictions', 'Grand Total KM', 'Quarters Included', 'Report Date'];
    const cardValues = [
      String(jurisdictionData.jurisdictions.length),
      (grandTotalNum || 0).toLocaleString(),
      String(reportData.quarters?.length || 0),
      formatReportDate(report.created_at)
    ];
    const cardW = (top15Left - margin) / 4;
    let cardX = margin;
    for (let i = 0; i < 4; i++) {
      doc.fillColor(palette.cardBg).strokeColor(palette.cardBorder).lineWidth(0.5).rect(cardX, cardY, cardW - 4, cardH).fillAndStroke();
      doc.fillColor(palette.accent).rect(cardX, cardY, 3, cardH).fill(); // left accent bar
      doc.fontSize(7).font('Helvetica').fillColor(palette.muted).text(cardLabels[i], cardX + 8, cardY + 6, { width: cardW - 14 });
      doc.fontSize(11).font('Helvetica-Bold').fillColor(palette.primary).text(cardValues[i], cardX + 8, cardY + 16, { width: cardW - 14 });
      cardX += cardW;
    }
    const contentStartY = cardY + cardH + 10;
    doc.y = contentStartY;

    // ---- Page 1: table header (left) + Top 15 (right)
    let y = drawTableHeader(doc, tableLeft, tableWidth, colW, rowHeight, contentStartY, periodLabels);
    drawTop15Block(doc, top15, top15Left, contentStartY, top15Width, top15RowH, fontTable);
    doc.y = y;

    let rowIndex = 0;
    const drawOneRow = (label, qVals, totalKM, pct, bg, bold, useAlternate) => {
      if (y + rowHeight > pageBottom) {
        doc.addPage({ size: 'LETTER', margin });
        y = drawTableHeader(doc, tableLeft, tableWidth, colW, rowHeight, margin, periodLabels);
      }
      const fillBg = bg || (useAlternate ? (rowIndex % 2 === 0 ? palette.white : palette.rowAlt) : null);
      if (fillBg) doc.rect(tableLeft, y, tableWidth, rowHeight).fill(fillBg);
      const textCol = bg === palette.accentDark ? palette.white : (bg === palette.subtotalBg ? palette.primary : palette.primary);
      doc.fillColor(textCol).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontTable);
      let x = tableLeft + 5;
      doc.text(label, x, y + 2, { width: colW[0] - 6 });
      x += colW[0];
      for (let i = 0; i < numPeriods; i++) {
        const qv = qVals[i];
        doc.text(qv != null && qv > 0 ? qv.toLocaleString() : '-', x, y + 2, { width: colW[i + 1], align: 'right' });
        x += colW[i + 1];
      }
      const totalIdx = 1 + numPeriods;
      const pctIdx = totalIdx + 1;
      doc.text(totalKM != null ? totalKM.toLocaleString() : '-', x, y + 2, { width: colW[totalIdx], align: 'right' });
      x += colW[totalIdx];
      doc.text((pct != null ? pct.toFixed(2) : '0.00') + '%', x, y + 2, { width: colW[pctIdx], align: 'right' });
      if (useAlternate) rowIndex++;
      y += rowHeight;
    };

    const drawSeparatorLine = () => {
      if (y + 5 > pageBottom) {
        doc.addPage({ size: 'LETTER', margin });
        y = drawTableHeader(doc, tableLeft, tableWidth, colW, rowHeight, margin, periodLabels);
      }
      doc.strokeColor(palette.accent).lineWidth(0.75).moveTo(tableLeft, y + 2).lineTo(tableLeft + tableWidth, y + 2).stroke();
      y += 5;
    };

    doc.font('Helvetica').fontSize(fontTable).fillColor(palette.primary);

    const kmValsForJuris = (j) =>
      periodIndices.map((idx) => {
        const q = j.quarters && j.quarters[idx];
        return q && q.km != null ? Number(q.km) : null;
      });

    for (const j of usList) {
      drawOneRow(String(j.code || '').slice(0, 8), kmValsForJuris(j), j.totalKM || 0, j.percentage, null, false, true);
    }
    drawOneRow('USA Subtotal', usQuarterKms, usTotalKM, usPct, palette.subtotalBg, true, false);
    drawSeparatorLine();

    for (const j of canList) {
      drawOneRow(String(j.code || '').slice(0, 8), kmValsForJuris(j), j.totalKM || 0, j.percentage, null, false, true);
    }
    drawOneRow('Canada Subtotal', canQuarterKms, canTotalKM, canPct, palette.subtotalBg, true, false);

    if (y + rowHeight > pageBottom) {
      doc.addPage({ size: 'LETTER', margin });
      y = margin;
    }
    doc.rect(tableLeft, y, tableWidth, rowHeight).fill(palette.accentDark);
    doc.strokeColor(palette.accent).lineWidth(0.5).rect(tableLeft, y, tableWidth, rowHeight).stroke();
    doc.fillColor(palette.white).font('Helvetica-Bold').fontSize(fontTable);
    let gx = tableLeft + 5;
    doc.text('Grand Total', gx, y + 2, { width: colW[0] - 6 });
    gx += colW[0];
    for (let i = 0; i < numPeriods; i++) {
      const km = totalQuarterKms[i];
      doc.text(km > 0 ? km.toLocaleString() : '-', gx, y + 2, { width: colW[i + 1], align: 'right' });
      gx += colW[i + 1];
    }
    const gTotalIdx = 1 + numPeriods;
    const gPctIdx = gTotalIdx + 1;
    doc.text(grandTotalNum.toLocaleString(), gx, y + 2, { width: colW[gTotalIdx], align: 'right' });
    gx += colW[gTotalIdx];
    doc.text('100.00%', gx, y + 2, { width: colW[gPctIdx], align: 'right' });

    doc.y = y + rowHeight + 6;
    doc.end();
  });
}

module.exports = {
  generateReportPrintPdf
};
