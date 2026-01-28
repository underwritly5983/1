const pdfParse = require('pdf-parse');
const fs = require('fs');

const parsePDF = async (filePath) => {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    // pdf-parse v1.x exports a function that returns { text, numpages, info, metadata, ... }
    const data = await pdfParse(dataBuffer);

    // Best-effort first page extraction (used for period dates / quarter detection)
    let firstPageText = '';
    try {
      const first = await pdfParse(dataBuffer, { max: 1 });
      firstPageText = first?.text || '';
    } catch (e) {
      // Fallback: split by form-feed if present
      firstPageText = String(data?.text || '').split('\f')[0] || '';
    }

    return {
      text: data?.text || '',
      firstPageText,
      numPages: data?.numpages || data?.npages || 0,
      info: data?.info || {},
      metadata: data?.metadata || {}
    };
  } catch (error) {
    console.error('PDF parsing error:', error);
    throw new Error('Failed to parse PDF file');
  }
};

function parseFlexibleDate(input) {
  const s = String(input || '').trim();
  if (!s) return null;

  // YYYY-MM-DD
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10) - 1;
    const d = parseInt(m[3], 10);
    const dt = new Date(Date.UTC(y, mo, d));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  // MM/DD/YYYY or MM-DD-YYYY
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const mo = parseInt(m[1], 10) - 1;
    const d = parseInt(m[2], 10);
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    const dt = new Date(Date.UTC(y, mo, d));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  // Month DD, YYYY
  m = s.match(/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})$/i);
  if (m) {
    const dt = new Date(Date.parse(`${m[1]} ${m[2]}, ${m[3]}`));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  return null;
}

function quarterFromStartDate(startDate) {
  const month = startDate.getUTCMonth() + 1; // 1-12
  if (month <= 3) return 1;
  if (month <= 6) return 2;
  if (month <= 9) return 3;
  return 4;
}

function extractPeriodDates(firstPageText) {
  const text = String(firstPageText || '');

  // Common labels in IFTA reports
  const startLabelPatterns = [
    /Period\s*(?:Start|Begin(?:s)?|From)\s*(?:Date)?\s*[:\-]?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
    /Start\s*Date\s*[:\-]?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i
  ];
  const endLabelPatterns = [
    /Period\s*(?:End|To|Thru|Through)\s*(?:Date)?\s*[:\-]?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
    /End\s*Date\s*[:\-]?\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i
  ];

  let start = null;
  for (const re of startLabelPatterns) {
    const m = text.match(re);
    if (m && m[1]) {
      start = parseFlexibleDate(m[1]);
      if (start) break;
    }
  }

  let end = null;
  for (const re of endLabelPatterns) {
    const m = text.match(re);
    if (m && m[1]) {
      end = parseFlexibleDate(m[1]);
      if (end) break;
    }
  }

  return { start, end };
}

// Extract quarter information from FIRST PAGE text (period begin/end)
const extractQuarterInfo = (firstPageText) => {
  const quarterPatterns = [
    /Q[1-4]\s*(?:of\s*)?(\d{4})/i,
    /Quarter\s*([1-4])\s*(?:of\s*)?(\d{4})/i,
    /(\d{4})\s*Q([1-4])/i,
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i
  ];

  let quarter = null;
  let year = null;
  let detectedDate = null;

  // 1) Preferred: read Period Start / Period End from page 1
  const { start, end } = extractPeriodDates(firstPageText);
  if (start) {
    quarter = String(quarterFromStartDate(start));
    year = start.getUTCFullYear();
    detectedDate = end || start;
  }

  // Try quarter patterns
  if (!quarter || !year) {
    const text = String(firstPageText || '');
    for (const pattern of quarterPatterns) {
      const match = text.match(pattern);
      if (match) {
        if (pattern === quarterPatterns[0]) {
          quarter = match[0].match(/Q([1-4])/i)?.[1];
          year = parseInt(match[1], 10);
        } else if (pattern === quarterPatterns[1]) {
          quarter = match[1];
          year = parseInt(match[2], 10);
        } else if (pattern === quarterPatterns[2]) {
          year = parseInt(match[1], 10);
          quarter = match[2];
        } else if (pattern === quarterPatterns[3]) {
          const month = match[1];
          const day = parseInt(match[2], 10);
          year = parseInt(match[3], 10);

          const monthNum = new Date(`${month} 1, ${year}`).getMonth() + 1;
          if (monthNum >= 1 && monthNum <= 3) quarter = '1';
          else if (monthNum >= 4 && monthNum <= 6) quarter = '2';
          else if (monthNum >= 7 && monthNum <= 9) quarter = '3';
          else quarter = '4';

          detectedDate = new Date(Date.UTC(year, monthNum - 1, day));
        }

        if (quarter && year) break;
      }
    }
  }

  return {
    quarter: quarter ? `Q${quarter}` : null,
    year: year,
    detectedDate: detectedDate?.toISOString().split('T')[0] || null
  };
};

module.exports = { parsePDF, extractQuarterInfo };
