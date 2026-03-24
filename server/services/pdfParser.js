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

  // DD-Mon-YYYY (e.g., 01-Jan-2025)
  m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (m) {
    const dt = new Date(Date.parse(`${m[2]} ${m[1]}, ${m[3]}`));
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
  const compact = text.replace(/\s+/g, '');

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
  if (!start) {
    for (const re of startLabelPatterns) {
      const m = compact.match(re);
      if (m && m[1]) {
        start = parseFlexibleDate(m[1]);
        if (start) break;
      }
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
  if (!end) {
    for (const re of endLabelPatterns) {
      const m = compact.match(re);
      if (m && m[1]) {
        end = parseFlexibleDate(m[1]);
        if (end) break;
      }
    }
  }

  // Heuristic fallback: pick the best (start,end) pair that looks like a quarter
  if (!start || !end) {
    const dateTokens = [];
    const tokenRe = /(\d{1,2}-[A-Za-z]{3}-\d{4}|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/g;
    let mm;
    while ((mm = tokenRe.exec(text)) !== null) {
      const dt = parseFlexibleDate(mm[1]);
      if (dt) dateTokens.push(dt);
    }

    const isQuarterStart = (d) => {
      const m = d.getUTCMonth() + 1;
      const day = d.getUTCDate();
      return day === 1 && (m === 1 || m === 4 || m === 7 || m === 10);
    };
    const isQuarterEnd = (d) => {
      const m = d.getUTCMonth() + 1;
      const day = d.getUTCDate();
      return (m === 3 && day === 31) || (m === 6 && day === 30) || (m === 9 && day === 30) || (m === 12 && day === 31);
    };

    let best = null;
    for (let i = 0; i < dateTokens.length; i++) {
      for (let j = 0; j < dateTokens.length; j++) {
        if (i === j) continue;
        const a = dateTokens[i];
        const b = dateTokens[j];
        if (a.getTime() >= b.getTime()) continue;
        const days = Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
        if (days < 10 || days > 120) continue;

        let score = 0;
        if (isQuarterStart(a)) score += 5;
        if (isQuarterEnd(b)) score += 5;
        // Prefer pairs that look like same-year quarter (most IFTA reports)
        if (a.getUTCFullYear() === b.getUTCFullYear()) score += 1;
        // Prefer typical quarter lengths (~90 days)
        score -= Math.abs(days - 90) / 30;

        if (!best || score > best.score) best = { start: a, end: b, score };
      }
    }

    if (best) {
      start = start || best.start;
      end = end || best.end;
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
