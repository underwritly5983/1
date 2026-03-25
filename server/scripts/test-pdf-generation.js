/**
 * Test script: generates a sample IFTA Summary PDF to verify layout.
 * Run from server dir: node scripts/test-pdf-generation.js
 * Opens test-output.pdf in project root (or server dir).
 */
const path = require('path');
const fs = require('fs');

// Sample report_data matching jurisdictionExtractor / reportGenerator shape
const sampleReportData = {
  jurisdictionData: {
    jurisdictions: [
      { code: 'TX', quarters: [{ quarter: 'Q1', year: 2025, km: 10000 }, null, null, null], totalKM: 10000, percentage: 40 },
      { code: 'ON', quarters: [null, { quarter: 'Q2', year: 2025, km: 8000 }, null, null], totalKM: 8000, percentage: 32 },
      { code: 'CA', quarters: [null, null, { quarter: 'Q3', year: 2025, km: 5000 }, null], totalKM: 5000, percentage: 20 },
      { code: 'AB', quarters: [null, null, null, { quarter: 'Q4', year: 2025, km: 2000 }], totalKM: 2000, percentage: 8 }
    ],
    grandTotal: 25000,
    canVsUs: {
      can: { total: 10000, percentage: 40 },
      us: { total: 15000, percentage: 60 }
    }
  }
};

const sampleReport = {
  id: 1,
  report_name: 'IFTA Summary - Test',
  created_at: new Date(),
  company_name: 'Test Company'
};

async function run() {
  const { generateSummaryReportPDF } = require('../services/summaryPdfService');
  const outPath = path.join(__dirname, '..', '..', 'test-output.pdf');
  const buffer = await generateSummaryReportPDF(sampleReport, sampleReportData);
  fs.writeFileSync(outPath, buffer);
  console.log('PDF written to:', outPath);
  console.log('Open test-output.pdf to verify: US (TX, CA) then Canada header then Canada (ON, AB), then USA/Canada/TOTAL rows.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
