const XLSX = require('xlsx');
const { parseIftaSummaryJson } = require('../lib/parseIftaSummary');
const { organizeByJurisdiction } = require('./jurisdictionExtractor');

function cleanNameCandidate(value) {
  const s = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '';
  if (s.length < 2 || s.length > 120) return '';
  if (!/[A-Za-z]/.test(s)) return '';
  return s;
}

function isWeakName(value) {
  const s = String(value || '').toUpperCase();
  if (!s) return true;
  return (
    s.includes('JURISDICTIONAL SUMMARY') ||
    s.includes('IFTA') ||
    s.includes('QUARTER') ||
    s.includes('REPORT') ||
    s.includes('TAX')
  );
}

function extractInsuredNameFromRawText(rawText) {
  const txt = String(rawText || '');
  if (!txt) return '';

  const inline = txt.match(/Jurisdictional\s+Summary\s*[:\-]?\s*([^\n\r]{2,120})/i);
  if (inline && inline[1]) {
    const c = cleanNameCandidate(inline[1]);
    if (c && !isWeakName(c)) return c;
  }

  const lines = txt
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    if (/jurisdictional\s+summary/i.test(lines[i])) {
      for (let j = i + 1; j <= Math.min(i + 6, lines.length - 1); j++) {
        const c = cleanNameCandidate(lines[j]);
        if (c && !isWeakName(c)) return c;
      }
    }
  }
  return '';
}

function pickPreferredInsuredName(reports, fallbackCompanyName) {
  const counts = new Map();
  const add = (v) => {
    const c = cleanNameCandidate(v);
    if (!c || isWeakName(c)) return;
    counts.set(c, (counts.get(c) || 0) + 1);
  };

  for (const r of reports || []) {
    const s = parseIftaSummaryJson(r.summary);
    add(s.insuredName);
    add(s.organizationName);
    add(s.companyName);
    add(extractInsuredNameFromRawText(r.rawText));
  }
  if (counts.size === 0) return cleanNameCandidate(fallbackCompanyName || '');

  let best = '';
  let bestCount = -1;
  for (const [name, count] of counts.entries()) {
    if (count > bestCount || (count === bestCount && name.length > best.length)) {
      best = name;
      bestCount = count;
    }
  }
  return best || cleanNameCandidate(fallbackCompanyName || '');
}

const generateReport = async (reports, user) => {
  // Aggregate data from all reports
  const aggregatedData = {
    companyName: user.company_name,
    logoUrl: user.logo_url,
    brandColorPrimary: user.brand_color_primary || '#2563eb',
    brandColorSecondary: user.brand_color_secondary || '#1e40af',
    generatedAt: new Date().toISOString(),
    quarters: [],
    totals: {
      totalMiles: 0,
      totalFuelPurchased: 0,
      totalFuelConsumed: 0,
      totalTaxOwed: 0
    },
    allJurisdictions: new Set(),
    allIssues: []
  };

  // Process each report
  reports.forEach((report, index) => {
    const summary = parseIftaSummaryJson(report.summary);

    const quarterData = {
      quarter: report.quarter,
      year: report.year,
      fileName: report.fileName,
      detectedDate: report.detectedDate,
      summary: summary.summary || 'No summary available',
      totalMiles: summary.totalMiles || 0,
      totalFuelPurchased: summary.totalFuelPurchased || 0,
      totalFuelConsumed: summary.totalFuelConsumed || 0,
      jurisdictions: summary.jurisdictions || [],
      keyDates: summary.keyDates || [],
      vehicles: summary.vehicles || [],
      issues: summary.issues || []
    };

    // Aggregate totals
    aggregatedData.totals.totalMiles += quarterData.totalMiles || 0;
    aggregatedData.totals.totalFuelPurchased += quarterData.totalFuelPurchased || 0;
    aggregatedData.totals.totalFuelConsumed += quarterData.totalFuelConsumed || 0;

    // Collect jurisdictions
    if (quarterData.jurisdictions) {
      quarterData.jurisdictions.forEach(j => {
        aggregatedData.allJurisdictions.add(j.name);
        if (j.fuelTax) {
          aggregatedData.totals.totalTaxOwed += j.fuelTax;
        }
      });
    }

    // Collect issues
    if (quarterData.issues) {
      aggregatedData.allIssues.push(...quarterData.issues);
    }

    aggregatedData.quarters.push(quarterData);
  });

  // Convert Set to Array
  aggregatedData.allJurisdictions = Array.from(aggregatedData.allJurisdictions);
  const preferredInsuredName = pickPreferredInsuredName(reports, user.company_name);
  aggregatedData.insuredName = preferredInsuredName || null;
  aggregatedData.companyName = preferredInsuredName || user.company_name;

  // Organize by jurisdiction for detailed view (only if we have raw text)
  try {
    aggregatedData.jurisdictionData = organizeByJurisdiction(reports);
    // Ensure canVsUs is included
    if (!aggregatedData.jurisdictionData.canVsUs) {
      const { calculateCANvsUS } = require('./jurisdictionClassifier');
      aggregatedData.jurisdictionData.canVsUs = calculateCANvsUS(aggregatedData.jurisdictionData.jurisdictions);
    }
    // Surface Total KM explicitly at top-level totals for UI/exports
    aggregatedData.totals.totalKM = aggregatedData.jurisdictionData.grandTotal || 0;
  } catch (error) {
    console.error('Error organizing jurisdiction data:', error);
    aggregatedData.jurisdictionData = { 
      jurisdictions: [], 
      grandTotal: 0,
      canVsUs: { can: { total: 0, percentage: 0 }, us: { total: 0, percentage: 0 }, grandTotal: 0 }
    };
    aggregatedData.totals.totalKM = 0;
  }

  return aggregatedData;
};

// Generate Excel file
const generateExcelReport = (reportData) => {
  const workbook = XLSX.utils.book_new();

  // Summary sheet
  const summaryData = [
    ['IFTA Summary Report'],
    ['Company:', reportData.companyName],
    ['Generated:', new Date(reportData.generatedAt).toLocaleDateString()],
    [],
    ['Totals'],
    ['Total Miles:', reportData.totals.totalMiles],
    ['Total Fuel Purchased:', reportData.totals.totalFuelPurchased],
    ['Total Fuel Consumed:', reportData.totals.totalFuelConsumed],
    ['Total Tax Owed:', reportData.totals.totalTaxOwed],
    [],
    ['Quarters Summary']
  ];

  // Add quarter data
  reportData.quarters.forEach(q => {
    summaryData.push([`${q.quarter} ${q.year}`]);
    summaryData.push(['Miles:', q.totalMiles]);
    summaryData.push(['Fuel Purchased:', q.totalFuelPurchased]);
    summaryData.push(['Fuel Consumed:', q.totalFuelConsumed]);
    summaryData.push([]);
  });

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  // Detailed quarters sheet
  const quartersData = [
    ['Quarter', 'Year', 'Miles', 'Fuel Purchased', 'Fuel Consumed', 'Issues']
  ];

  reportData.quarters.forEach(q => {
    quartersData.push([
      q.quarter,
      q.year,
      q.totalMiles,
      q.totalFuelPurchased,
      q.totalFuelConsumed,
      q.issues.join('; ')
    ]);
  });

  const quartersSheet = XLSX.utils.aoa_to_sheet(quartersData);
  XLSX.utils.book_append_sheet(workbook, quartersSheet, 'Quarters');

  return workbook;
};

// Generate Excel file matching the IFTA SUMMARY.xlsx template structure
// Template: sheet "DATA", header row has STATE, ZONE, Q1, Q2, Q3, Q4, YEAR, TOTAL, % of total
const generateTemplateExcel = (reportData, templatePath) => {
  const XLSX = require('xlsx');
  const fs = require('fs');

  let workbook;
  if (templatePath && fs.existsSync(templatePath)) {
    workbook = XLSX.readFile(templatePath);
  } else {
    workbook = XLSX.utils.book_new();
  }

  const sheetName = workbook.SheetNames.includes('DATA') ? 'DATA' : (workbook.SheetNames[0] || 'Sheet1');
  let worksheet = workbook.Sheets[sheetName] || XLSX.utils.aoa_to_sheet([]);
  let data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

  let headerRow = -1;
  let stateCol = -1;
  let q1Col = -1, q2Col = -1, q3Col = -1, q4Col = -1;
  let totalCol = -1;
  let percentCol = -1;

  for (let i = 0; i < Math.min(12, data.length); i++) {
    const row = data[i];
    if (!Array.isArray(row)) continue;
    for (let j = 0; j < row.length; j++) {
      const cell = String(row[j] || '').toUpperCase().trim();
      if (cell === 'STATE' || (cell.includes('STATE') && !cell.includes('UNITED'))) {
        stateCol = j;
        if (headerRow < 0) headerRow = i;
      }
      if (cell === 'Q1') q1Col = j;
      if (cell === 'Q2') q2Col = j;
      if (cell === 'Q3') q3Col = j;
      if (cell === 'Q4') q4Col = j;
      if (cell === 'TOTAL' && totalCol < 0) totalCol = j;
      if ((cell.includes('%') && cell.includes('TOTAL')) || cell === '% OF TOTAL') percentCol = j;
    }
  }

  if (headerRow < 0 || stateCol < 0) {
    data = [
      [],
      [],
      ['', 'STATE', 'ZONE', 'Q1', 'Q2', 'Q3', 'Q4', 'YEAR', 'TOTAL', '% of total']
    ];
    headerRow = 2;
    stateCol = 1;
    q1Col = 3;
    q2Col = 4;
    q3Col = 5;
    q4Col = 6;
    totalCol = 8;
    percentCol = 9;
  }

  const jurisData = reportData.jurisdictionData || { jurisdictions: [], grandTotal: 0 };
  const quarterMap = { 'Q1': q1Col, 'Q2': q2Col, 'Q3': q3Col, 'Q4': q4Col };
  const maxCol = Math.max(stateCol, q1Col || 0, q2Col || 0, q3Col || 0, q4Col || 0, totalCol || 0, percentCol || 0);

  for (const juris of jurisData.jurisdictions) {
    let found = false;
    for (let i = headerRow + 1; i < data.length; i++) {
      const row = data[i];
      if (!Array.isArray(row)) continue;
      while (row.length <= maxCol) row.push('');
      const stateVal = String(row[stateCol] || '').toUpperCase().trim();
      if (stateVal === (juris.code || '').toUpperCase()) {
        if (q1Col >= 0) row[q1Col] = (juris.quarters && juris.quarters[0] && juris.quarters[0].km != null) ? juris.quarters[0].km : '';
        if (q2Col >= 0) row[q2Col] = (juris.quarters && juris.quarters[1] && juris.quarters[1].km != null) ? juris.quarters[1].km : '';
        if (q3Col >= 0) row[q3Col] = (juris.quarters && juris.quarters[2] && juris.quarters[2].km != null) ? juris.quarters[2].km : '';
        if (q4Col >= 0) row[q4Col] = (juris.quarters && juris.quarters[3] && juris.quarters[3].km != null) ? juris.quarters[3].km : '';
        if (totalCol >= 0) row[totalCol] = juris.totalKM != null ? juris.totalKM : '';
        if (percentCol >= 0) row[percentCol] = juris.percentage != null ? (Number(juris.percentage) / 100).toFixed(4) : '';
        found = true;
        break;
      }
    }
    if (!found) {
      const newRow = Array(maxCol + 1).fill('');
      newRow[stateCol] = juris.code || '';
      if (q1Col >= 0) newRow[q1Col] = (juris.quarters && juris.quarters[0] && juris.quarters[0].km != null) ? juris.quarters[0].km : '';
      if (q2Col >= 0) newRow[q2Col] = (juris.quarters && juris.quarters[1] && juris.quarters[1].km != null) ? juris.quarters[1].km : '';
      if (q3Col >= 0) newRow[q3Col] = (juris.quarters && juris.quarters[2] && juris.quarters[2].km != null) ? juris.quarters[2].km : '';
      if (q4Col >= 0) newRow[q4Col] = (juris.quarters && juris.quarters[3] && juris.quarters[3].km != null) ? juris.quarters[3].km : '';
      if (totalCol >= 0) newRow[totalCol] = juris.totalKM != null ? juris.totalKM : '';
      if (percentCol >= 0) newRow[percentCol] = juris.percentage != null ? (Number(juris.percentage) / 100).toFixed(4) : '';
      data.push(newRow);
    }
  }

  worksheet = XLSX.utils.aoa_to_sheet(data);
  workbook.Sheets[sheetName] = worksheet;
  return workbook;
};

module.exports = { generateReport, generateExcelReport, generateTemplateExcel };
