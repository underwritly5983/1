const XLSX = require('xlsx');
const { organizeByJurisdiction } = require('./jurisdictionExtractor');

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
    const summary = typeof report.summary === 'string' 
      ? JSON.parse(report.summary) 
      : report.summary;

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

  // Organize by jurisdiction for detailed view (only if we have raw text)
  try {
    aggregatedData.jurisdictionData = organizeByJurisdiction(reports);
    // Ensure canVsUs is included
    if (!aggregatedData.jurisdictionData.canVsUs) {
      const { calculateCANvsUS } = require('./jurisdictionClassifier');
      aggregatedData.jurisdictionData.canVsUs = calculateCANvsUS(aggregatedData.jurisdictionData.jurisdictions);
    }
  } catch (error) {
    console.error('Error organizing jurisdiction data:', error);
    aggregatedData.jurisdictionData = { 
      jurisdictions: [], 
      grandTotal: 0,
      canVsUs: { can: { total: 0, percentage: 0 }, us: { total: 0, percentage: 0 }, grandTotal: 0 }
    };
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

// Generate Excel file matching the template structure
const generateTemplateExcel = (reportData, templatePath) => {
  const XLSX = require('xlsx');
  
  // Read template if provided
  let workbook;
  if (templatePath && require('fs').existsSync(templatePath)) {
    workbook = XLSX.readFile(templatePath);
  } else {
    workbook = XLSX.utils.book_new();
  }
  
  const sheetName = workbook.SheetNames[0] || 'Sheet1';
  let worksheet = workbook.Sheets[sheetName] || XLSX.utils.aoa_to_sheet([]);
  let data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  
  // Find header row
  let headerRow = -1;
  let stateCol = -1;
  let q1Col = -1, q2Col = -1, q3Col = -1, q4Col = -1;
  let totalCol = -1;
  let percentCol = -1;
  let totalKMCol = -1;
  
  for (let i = 0; i < Math.min(5, data.length); i++) {
    const row = data[i];
    if (Array.isArray(row)) {
      for (let j = 0; j < row.length; j++) {
        const cell = String(row[j] || '').toUpperCase();
        if (cell.includes('STATE') || cell === 'STATE') {
          stateCol = j;
          if (headerRow < 0) headerRow = i;
        }
        if (cell === 'Q1' || cell.includes('Q1')) q1Col = j;
        if (cell === 'Q2' || cell.includes('Q2')) q2Col = j;
        if (cell === 'Q3' || cell.includes('Q3')) q3Col = j;
        if (cell === 'Q4' || cell.includes('Q4')) q4Col = j;
        if (cell.includes('TOTAL') && !cell.includes('%')) totalCol = j;
        if (cell.includes('%') || cell.includes('PERCENTAGE')) percentCol = j;
        if (cell.includes('TOTAL KM') || cell.includes('KM')) totalKMCol = j;
      }
    }
  }
  
  // If no headers found, create them
  if (headerRow < 0) {
    data = [['STATE', 'Q1', 'Q2', 'Q3', 'Q4', 'TOTAL', '% of total', 'Total KM']];
    headerRow = 0;
    stateCol = 0;
    q1Col = 1;
    q2Col = 2;
    q3Col = 3;
    q4Col = 4;
    totalCol = 5;
    percentCol = 6;
    totalKMCol = 7;
  }
  
  // Get jurisdiction data
  const jurisData = reportData.jurisdictionData || { jurisdictions: [], grandTotal: 0 };
  
  // Update or add jurisdiction rows
  const quarterMap = { 'Q1': q1Col, 'Q2': q2Col, 'Q3': q3Col, 'Q4': q4Col };
  
  for (const juris of jurisData.jurisdictions) {
    let found = false;
    
    // Look for existing row
    for (let i = headerRow + 1; i < data.length; i++) {
      const row = data[i];
      if (!Array.isArray(row)) continue;
      
      while (row.length <= Math.max(stateCol, q1Col, q2Col, q3Col, q4Col, totalCol, percentCol, totalKMCol)) {
        row.push('');
      }
      
      if (String(row[stateCol] || '').toUpperCase() === juris.code) {
        // Update existing row
        juris.quarters.forEach((q, idx) => {
          if (q && quarterMap[q.quarter] >= 0) {
            row[quarterMap[q.quarter]] = q.km || '';
          }
        });
        if (totalCol >= 0) row[totalCol] = juris.totalKM || '';
        if (percentCol >= 0) row[percentCol] = juris.percentage ? (juris.percentage / 100).toFixed(4) : '';
        if (totalKMCol >= 0) row[totalKMCol] = juris.totalKM || '';
        found = true;
        break;
      }
    }
    
    // Add new row if not found
    if (!found) {
      const newRow = [];
      while (newRow.length <= Math.max(stateCol, q1Col, q2Col, q3Col, q4Col, totalCol, percentCol, totalKMCol)) {
        newRow.push('');
      }
      
      newRow[stateCol] = juris.code;
      juris.quarters.forEach((q, idx) => {
        if (q && quarterMap[q.quarter] >= 0) {
          newRow[quarterMap[q.quarter]] = q.km || '';
        }
      });
      if (totalCol >= 0) newRow[totalCol] = juris.totalKM || '';
      if (percentCol >= 0) newRow[percentCol] = juris.percentage ? (juris.percentage / 100).toFixed(4) : '';
      if (totalKMCol >= 0) newRow[totalKMCol] = juris.totalKM || '';
      
      data.push(newRow);
    }
  }
  
  // Update worksheet
  worksheet = XLSX.utils.aoa_to_sheet(data);
  workbook.Sheets[sheetName] = worksheet;
  
  return workbook;
};

module.exports = { generateReport, generateExcelReport, generateTemplateExcel };
