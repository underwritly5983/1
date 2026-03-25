// Extract jurisdiction-level data from IFTA report text
// IMPORTANT: We prefer the PDF's "Total KM" column per jurisdiction (not Txbl KM).
const extractJurisdictionData = (text) => {
  const jurisdictions = [];

  if (!text) return jurisdictions;

  // Many PDFs collapse whitespace between columns, e.g.:
  // "DieselABFalse31,05231,05212,521..."
  // So we find each Diesel row header, then parse the first numeric field after it.
  const headerRe = /Diesel\s*([A-Z]{2,3})\s*(True|False)/gi;
  const matches = [];
  let m;
  while ((m = headerRe.exec(text)) !== null) {
    matches.push({
      code: String(m[1] || '').toUpperCase(),
      start: headerRe.lastIndex
    });
  }

  for (let i = 0; i < matches.length; i++) {
    const code = matches[i].code;
    const start = matches[i].start;
    const end = i + 1 < matches.length ? matches[i + 1].start - 1 : text.length;
    const tailRaw = text.slice(start, end);
    const tail = tailRaw.replace(/\s+/g, ''); // collapse whitespace

    // 1) If the first value uses thousand separators, grab the whole grouped number.
    let kmStr = null;
    const commaNum = tail.match(/^(\d{1,3}(?:,\d{3})+)/);
    if (commaNum && commaNum[1]) {
      kmStr = commaNum[1];
    } else {
      // 2) Otherwise grab a digit run and try to detect repeated Txbl+Total like "394394" or "70167016"
      const digitsRunMatch = tail.match(/^(\d{2,14})/);
      const digitsRun = digitsRunMatch ? digitsRunMatch[1] : null;
      if (digitsRun) {
        let chosen = null;
        const maxUnit = Math.min(7, Math.floor(digitsRun.length / 2));
        for (let unitLen = 2; unitLen <= maxUnit; unitLen++) {
          const a = digitsRun.slice(0, unitLen);
          const b = digitsRun.slice(unitLen, unitLen * 2);
          if (a === b) {
            chosen = a;
            break;
          }
        }
        kmStr = chosen || digitsRun;
      }
    }

    const totalKM = kmStr ? parseFloat(kmStr.replace(/,/g, '')) : NaN;
    if (code && !isNaN(totalKM) && totalKM > 0) {
      jurisdictions.push({ code, txblKM: 0, totalKM });
    }
  }

  return jurisdictions;
};

const { parseIftaSummaryJson } = require('../lib/parseIftaSummary');

// Extract jurisdiction data from all reports and organize by jurisdiction
const organizeByJurisdiction = (reports) => {
  const { calculateCANvsUS } = require('./jurisdictionClassifier');
  const jurisdictionMap = new Map();
  const numPeriods = Math.max(reports.length, 1);

  // One column per uploaded report in chronological order (same order as reportData.quarters).
  // Do not map by Q1–Q4 slot: e.g. Q4 2024 + Q1–Q3 2025 must occupy four columns, not three Q1–Q3 + empty Q4.
  reports.forEach((report, periodIndex) => {
    const summary = parseIftaSummaryJson(report.summary);

    const quarter = report.quarter;
    const year = report.year;
    
    // Prefer Diesel-row parsing from the PDF; if it finds nothing, use AI jurisdictions.
    let jurisdictions = [];
    if (report.rawText) {
      jurisdictions = extractJurisdictionData(report.rawText);
    }
    if (
      jurisdictions.length === 0 &&
      summary.jurisdictions &&
      Array.isArray(summary.jurisdictions)
    ) {
      jurisdictions = summary.jurisdictions.map((j) => ({
        code: j.name || j.code || '',
        txblKM: j.miles || j.txblKM || 0,
        totalKM: j.miles || j.totalKM || 0
      }));
    }
    
    // Organize by jurisdiction
    jurisdictions.forEach(j => {
      if (!j.code) return;
      
      if (!jurisdictionMap.has(j.code)) {
        jurisdictionMap.set(j.code, {
          code: j.code,
          quarters: Array(numPeriods).fill(null),
          totalKM: 0
        });
      }

      const jurisData = jurisdictionMap.get(j.code);
      jurisData.quarters[periodIndex] = {
        quarter: quarter,
        year: year,
        km: j.totalKM || 0
      };
    });
  });
  
  // Calculate totals and percentages
  const allJurisdictions = Array.from(jurisdictionMap.values());
  
  // Calculate grand total
  let grandTotal = 0;
  allJurisdictions.forEach(j => {
    const jurisTotal = j.quarters
      .filter(q => q !== null)
      .reduce((sum, q) => sum + (q.km || 0), 0);
    j.totalKM = jurisTotal;
    grandTotal += jurisTotal;
  });
  
  // Calculate percentages
  allJurisdictions.forEach(j => {
    j.percentage = grandTotal > 0 ? (j.totalKM / grandTotal) * 100 : 0;
  });
  
  // Sort by total KM descending
  allJurisdictions.sort((a, b) => b.totalKM - a.totalKM);
  
  // Calculate CAN vs US breakdown
  const canVsUs = calculateCANvsUS(allJurisdictions);
  
  return {
    jurisdictions: allJurisdictions,
    grandTotal: grandTotal,
    quarters: reports.map((r) => ({ quarter: r.quarter, year: r.year })),
    columnMode: 'period',
    canVsUs: canVsUs
  };
};

module.exports = { extractJurisdictionData, organizeByJurisdiction };
