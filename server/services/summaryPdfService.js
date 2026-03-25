/**
 * Single source of truth for IFTA Summary Report PDF (download from View IFTA Summaries).
 * Layout: US states (highest to lowest) → "Canada" section header → Canada (highest to lowest)
 * → USA / Canada / TOTAL summary rows. North America "Areas most travelled" = top 15 overall.
 */
const PDFDocument = require('pdfkit');
const { classifyJurisdiction, normalizeJurisdictionCode } = require('./jurisdictionClassifier');

function generateSummaryReportPDF(report, reportData) {
  return new Promise((resolve, reject) => {
    const jurisdictionData = reportData.jurisdictionData || {};
    const jurisdictionsRaw = Array.isArray(jurisdictionData.jurisdictions) ? jurisdictionData.jurisdictions : [];
    const grandTotal = Number(jurisdictionData.grandTotal) || 0;

    const codeOf = (j) => normalizeJurisdictionCode(j) || String(j.code || j.name || '').trim().toUpperCase().slice(0, 8);
    const kmOf = (j) => Number(j.totalKM ?? j.total_km ?? 0) || 0;
    const pctOf = (j) => Number(j.percentage ?? j.pct ?? 0) || 0;

    // Classify using normalized code so "Texas" -> US, "Ontario" -> CAN
    const usList = [...jurisdictionsRaw]
      .filter(j => classifyJurisdiction(normalizeJurisdictionCode(j)) === 'US' && kmOf(j) > 0)
      .sort((a, b) => {
        const kmA = kmOf(a), kmB = kmOf(b);
        if (kmB !== kmA) return kmB - kmA;
        return pctOf(b) - pctOf(a);
      });
    const canList = [...jurisdictionsRaw]
      .filter(j => classifyJurisdiction(normalizeJurisdictionCode(j)) === 'CAN' && kmOf(j) > 0)
      .sort((a, b) => {
        const kmA = kmOf(a), kmB = kmOf(b);
        if (kmB !== kmA) return kmB - kmA;
        return pctOf(b) - pctOf(a);
      });

    const usSubtotalKM = usList.reduce((sum, j) => sum + kmOf(j), 0);
    const usSubtotalPct = usList.reduce((sum, j) => sum + pctOf(j), 0);
    const canSubtotalKM = canList.reduce((sum, j) => sum + kmOf(j), 0);
    const canSubtotalPct = canList.reduce((sum, j) => sum + pctOf(j), 0);

    const tableRows = [
      ...usList.map(j => ({ ...j, isTotal: false, isSectionHeader: false })),
      ...(canList.length > 0 ? [{ isSectionHeader: true, label: 'Canada' }] : []),
      ...canList.map(j => ({ ...j, isTotal: false, isSectionHeader: false }))
    ];

    const canVsUs = jurisdictionData.canVsUs || {};
    const canTotal = Number(canVsUs.can?.total) || 0;
    const canPct = Number(canVsUs.can?.percentage) || 0;
    const usTotal = Number(canVsUs.us?.total) || 0;
    const usPct = Number(canVsUs.us?.percentage) || 0;

    const generatedAt = report.created_at ? new Date(report.created_at) : new Date();
    const generatedLabel = Number.isNaN(generatedAt.getTime())
      ? new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
      : generatedAt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

    const margin = 40;
    const maxY = 755;
    const doc = new PDFDocument({ margin, size: 'LETTER', autoFirstPage: true });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = margin;
    const tableRight = 308;
    const rightPanelLeft = 318;
    const rightPanelWidth = 254;
    const headerBg = '#5B6770';
    const headerText = '#FFFFFF';
    const gridColor = '#D0D0D0';
    const totalBg = '#A5CE4D';
    const bodyText = '#333333';
    const canColor = '#2E86AB';
    const usColor = '#E94F37';
    const otherColor = '#888888';

    doc.fontSize(16).font('Helvetica-Bold').fillColor(bodyText).text('IFTA Summary Report', { align: 'center' });
    doc.moveDown(0.25);
    doc.fontSize(10).font('Helvetica').text(String(report.company_name || 'Company'), { align: 'center' });
    doc.fontSize(9).text(`Report generated: ${generatedLabel}`, { align: 'center' });
    doc.moveDown(0.5);

    doc.fontSize(11).font('Helvetica-Bold').text('Summary', { underline: true });
    doc.moveDown(0.2);
    doc.fontSize(9).font('Helvetica').fillColor(bodyText);
    doc.text(`Total KM: ${grandTotal.toLocaleString()}   |   Canada: ${canTotal.toLocaleString()} KM (${canPct.toFixed(2)}%)   |   United States: ${usTotal.toLocaleString()} KM (${usPct.toFixed(2)}%)`, left, doc.y, { width: tableRight - left });
    doc.moveDown(0.45);

    if (jurisdictionsRaw.length > 0) {
      const rowHeight = 7;
      const cols = [
        { x: left, w: 44, label: 'STATE', align: 'left' },
        { x: left + 44, w: 32, label: 'Q1', align: 'right' },
        { x: left + 76, w: 32, label: 'Q2', align: 'right' },
        { x: left + 108, w: 32, label: 'Q3', align: 'right' },
        { x: left + 140, w: 32, label: 'Q4', align: 'right' },
        { x: left + 172, w: 50, label: 'TOTAL', align: 'right' },
        { x: left + 222, w: 42, label: '% of total', align: 'right' }
      ];
      const tableWidth = tableRight - left;

      doc.fontSize(10).font('Helvetica-Bold').fillColor(bodyText).text('Jurisdiction Summary', { underline: true });
      doc.moveDown(0.25);

      const headerY = doc.y;
      doc.fillColor(headerBg).rect(left, headerY - 1, tableWidth, rowHeight + 2).fill();
      doc.fillColor(headerText).font('Helvetica-Bold').fontSize(7);
      doc.text('STATE', left + 3, headerY + 1, { width: cols[0].w - 4 });
      doc.text('Q1', cols[1].x, headerY + 1, { width: cols[1].w, align: 'right' });
      doc.text('Q2', cols[2].x, headerY + 1, { width: cols[2].w, align: 'right' });
      doc.text('Q3', cols[3].x, headerY + 1, { width: cols[3].w, align: 'right' });
      doc.text('Q4', cols[4].x, headerY + 1, { width: cols[4].w, align: 'right' });
      doc.text('TOTAL', cols[5].x, headerY + 1, { width: cols[5].w, align: 'right' });
      doc.text('% of total', cols[6].x, headerY + 1, { width: cols[6].w - 4, align: 'right' });
      const tableStartY = headerY + rowHeight + 3;
      doc.y = tableStartY;
      doc.strokeColor(gridColor).lineWidth(0.5);
      doc.moveTo(left, doc.y).lineTo(left + tableWidth, doc.y).stroke();
      doc.moveDown(0.15);

      const otherPct = Math.max(0, 100 - canPct - usPct);
      const pieCx = rightPanelLeft + rightPanelWidth / 2;
      const pieCy = tableStartY + 52;
      const pieR = 42;
      const twoPi = 2 * Math.PI;
      let angle = -Math.PI / 2;
      if (canPct > 0) {
        const sweep = (canPct / 100) * twoPi;
        doc.fillColor(canColor).moveTo(pieCx, pieCy).arc(pieCx, pieCy, pieR, angle, angle + sweep).lineTo(pieCx, pieCy).fill();
        angle += sweep;
      }
      if (usPct > 0) {
        const sweep = (usPct / 100) * twoPi;
        doc.fillColor(usColor).moveTo(pieCx, pieCy).arc(pieCx, pieCy, pieR, angle, angle + sweep).lineTo(pieCx, pieCy).fill();
        angle += sweep;
      }
      if (otherPct > 0) {
        const sweep = (otherPct / 100) * twoPi;
        doc.fillColor(otherColor).moveTo(pieCx, pieCy).arc(pieCx, pieCy, pieR, angle, angle + sweep).lineTo(pieCx, pieCy).fill();
      }
      doc.strokeColor(gridColor).lineWidth(0.3).circle(pieCx, pieCy, pieR).stroke();
      doc.fillColor(bodyText).font('Helvetica').fontSize(6);
      doc.fillColor(canColor).rect(rightPanelLeft, pieCy + pieR + 6, 10, 5).fill();
      doc.fillColor(bodyText).text(`Canada ${canPct.toFixed(1)}%`, rightPanelLeft + 12, pieCy + pieR + 7, { width: 70 });
      doc.fillColor(usColor).rect(rightPanelLeft + 85, pieCy + pieR + 6, 10, 5).fill();
      doc.fillColor(bodyText).text(`US ${usPct.toFixed(1)}%`, rightPanelLeft + 97, pieCy + pieR + 7, { width: 60 });

      const heatStartY = pieCy + pieR + 28;
      doc.fontSize(8).font('Helvetica-Bold').fillColor(bodyText).text('North America', rightPanelLeft, heatStartY, { width: rightPanelWidth });
      doc.font('Helvetica').fontSize(7).text('Areas most travelled', rightPanelLeft, heatStartY + 10, { width: rightPanelWidth });
      const heatList = [...jurisdictionsRaw]
        .filter(j => kmOf(j) > 0)
        .sort((a, b) => kmOf(b) - kmOf(a))
        .slice(0, 15);
      const maxPct = Math.max(...heatList.map(j => pctOf(j)), 1);
      const heatBarMaxW = 84;
      const heatLabelW = 38;
      const heatBarX = rightPanelLeft + heatLabelW;
      const heatRowH = 10;
      const heatColor = (pct) => {
        const t = Math.min(1, pct / maxPct);
        return `rgb(${Math.round(200 + 55 * t)}, ${Math.round(230 - 200 * t)}, ${Math.round(80 + 95 * (1 - t))})`;
      };
      let heatY = heatStartY + 24;
      doc.fontSize(6).font('Helvetica').fillColor(bodyText);
      for (const j of heatList) {
        const pct = pctOf(j);
        const w = Math.max(4, (pct / maxPct) * heatBarMaxW);
        doc.fillColor(heatColor(pct)).rect(heatBarX, heatY + 2, w, 5).fill();
        doc.fillColor(bodyText).text(`${codeOf(j)} ${pct.toFixed(1)}%`, rightPanelLeft, heatY + 2, { width: heatLabelW - 2, continued: false });
        heatY += heatRowH;
      }

      doc.y = tableStartY + 0.15;
      doc.fillColor(bodyText).font('Helvetica').fontSize(6);
      for (const row of tableRows) {
        if (doc.y + rowHeight > maxY) break;
        const y = doc.y;
        const isSectionHeader = row.isSectionHeader === true;
        if (isSectionHeader) {
          doc.fillColor(headerBg).rect(left, y, tableWidth, rowHeight).fill();
          doc.fillColor(headerText).font('Helvetica-Bold').fontSize(7);
          doc.text(row.label || 'Canada', left, y + 1.5, { width: tableWidth, align: 'center' });
          doc.strokeColor(gridColor).lineWidth(0.25);
          doc.moveTo(left, y).lineTo(left + tableWidth, y).stroke();
          doc.moveTo(left, y + rowHeight).lineTo(left + tableWidth, y + rowHeight).stroke();
          doc.moveTo(left, y).lineTo(left, y + rowHeight).stroke();
          doc.moveTo(left + tableWidth, y).lineTo(left + tableWidth, y + rowHeight).stroke();
          doc.fillColor(bodyText).font('Helvetica');
          doc.y = y + rowHeight;
          continue;
        }
        doc.strokeColor(gridColor).lineWidth(0.25);
        for (let c = 0; c <= cols.length; c++) {
          const x = c === 0 ? left : (cols[c - 1].x + cols[c - 1].w);
          doc.moveTo(x, y).lineTo(x, y + rowHeight).stroke();
        }
        doc.moveTo(left, y).lineTo(left + tableWidth, y).stroke();
        doc.moveTo(left, y + rowHeight).lineTo(left + tableWidth, y + rowHeight).stroke();

        const code = codeOf(row).slice(0, 8);
        doc.fillColor(bodyText).text(code, left + 3, y + 1.5, { width: cols[0].w - 4 });
        const quarters = Array.isArray(row.quarters) ? row.quarters : [];
        for (let idx = 0; idx < 4; idx++) {
          const q = quarters[idx];
          const km = q && typeof q === 'object' && q.km != null ? Number(q.km) : null;
          doc.text(km != null && !Number.isNaN(km) ? km.toLocaleString() : '-', cols[idx + 1].x, y + 1.5, { width: cols[idx + 1].w - 2, align: 'right' });
        }
        const totalKM = kmOf(row);
        const pct = pctOf(row);
        doc.text(!Number.isNaN(totalKM) ? totalKM.toLocaleString() : '-', cols[5].x, y + 1.5, { width: cols[5].w - 2, align: 'right' });
        doc.text(!Number.isNaN(pct) ? `${pct.toFixed(2)}%` : '-', cols[6].x, y + 1.5, { width: cols[6].w - 4, align: 'right' });
        doc.y = y + rowHeight;
      }

      doc.moveDown(0.1);
      const summaryRowH = rowHeight + 2;
      let summaryY = doc.y;
      doc.fillColor(totalBg).rect(left, summaryY - 1, tableWidth, summaryRowH).fill();
      doc.fillColor(bodyText).font('Helvetica-Bold').fontSize(7);
      doc.text('USA', left + 3, summaryY + 1, { width: cols[0].w - 4 });
      doc.text('-', cols[1].x, summaryY + 1, { width: cols[1].w - 2, align: 'right' });
      doc.text('-', cols[2].x, summaryY + 1, { width: cols[2].w - 2, align: 'right' });
      doc.text('-', cols[3].x, summaryY + 1, { width: cols[3].w - 2, align: 'right' });
      doc.text('-', cols[4].x, summaryY + 1, { width: cols[4].w - 2, align: 'right' });
      doc.text(usSubtotalKM.toLocaleString(), cols[5].x, summaryY + 1, { width: cols[5].w - 2, align: 'right' });
      doc.text(`${usSubtotalPct.toFixed(2)}%`, cols[6].x, summaryY + 1, { width: cols[6].w - 4, align: 'right' });
      doc.strokeColor(gridColor).lineWidth(0.25);
      doc.moveTo(left, summaryY - 1).lineTo(left + tableWidth, summaryY - 1).stroke();
      doc.moveTo(left, summaryY + summaryRowH).lineTo(left + tableWidth, summaryY + summaryRowH).stroke();
      for (let c = 0; c <= cols.length; c++) {
        const x = c === 0 ? left : (cols[c - 1].x + cols[c - 1].w);
        doc.moveTo(x, summaryY - 1).lineTo(x, summaryY + summaryRowH).stroke();
      }
      summaryY += summaryRowH;
      doc.fillColor(totalBg).rect(left, summaryY - 1, tableWidth, summaryRowH).fill();
      doc.fillColor(bodyText).font('Helvetica-Bold').fontSize(7);
      doc.text('Canada', left + 3, summaryY + 1, { width: cols[0].w - 4 });
      doc.text('-', cols[1].x, summaryY + 1, { width: cols[1].w - 2, align: 'right' });
      doc.text('-', cols[2].x, summaryY + 1, { width: cols[2].w - 2, align: 'right' });
      doc.text('-', cols[3].x, summaryY + 1, { width: cols[3].w - 2, align: 'right' });
      doc.text('-', cols[4].x, summaryY + 1, { width: cols[4].w - 2, align: 'right' });
      doc.text(canSubtotalKM.toLocaleString(), cols[5].x, summaryY + 1, { width: cols[5].w - 2, align: 'right' });
      doc.text(`${canSubtotalPct.toFixed(2)}%`, cols[6].x, summaryY + 1, { width: cols[6].w - 4, align: 'right' });
      doc.strokeColor(gridColor).lineWidth(0.25);
      doc.moveTo(left, summaryY - 1).lineTo(left + tableWidth, summaryY - 1).stroke();
      doc.moveTo(left, summaryY + summaryRowH).lineTo(left + tableWidth, summaryY + summaryRowH).stroke();
      for (let c = 0; c <= cols.length; c++) {
        const x = c === 0 ? left : (cols[c - 1].x + cols[c - 1].w);
        doc.moveTo(x, summaryY - 1).lineTo(x, summaryY + summaryRowH).stroke();
      }
      summaryY += summaryRowH;
      doc.fillColor(headerBg).rect(left, summaryY - 1, tableWidth, summaryRowH).fill();
      doc.fillColor(headerText).font('Helvetica-Bold').fontSize(7);
      doc.text('TOTAL', left + 3, summaryY + 1, { width: cols[0].w - 4 });
      doc.text('-', cols[1].x, summaryY + 1, { width: cols[1].w - 2, align: 'right' });
      doc.text('-', cols[2].x, summaryY + 1, { width: cols[2].w - 2, align: 'right' });
      doc.text('-', cols[3].x, summaryY + 1, { width: cols[3].w - 2, align: 'right' });
      doc.text('-', cols[4].x, summaryY + 1, { width: cols[4].w - 2, align: 'right' });
      doc.text(grandTotal.toLocaleString(), cols[5].x, summaryY + 1, { width: cols[5].w - 2, align: 'right' });
      doc.text('100.00%', cols[6].x, summaryY + 1, { width: cols[6].w - 4, align: 'right' });
      doc.y = summaryY + summaryRowH;
      doc.strokeColor(gridColor).lineWidth(0.5);
      doc.moveTo(left, doc.y).lineTo(left + tableWidth, doc.y).stroke();
    }

    doc.end();
  });
}

module.exports = { generateSummaryReportPDF };
