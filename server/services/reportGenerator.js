const XLSX = require('xlsx');

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

module.exports = { generateReport, generateExcelReport };
