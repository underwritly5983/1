const pdf = require('pdf-parse');
const fs = require('fs');

const parsePDF = async (filePath) => {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdf(dataBuffer);
    
    return {
      text: data.text,
      numPages: data.npages,
      info: data.info,
      metadata: data.metadata
    };
  } catch (error) {
    console.error('PDF parsing error:', error);
    throw new Error('Failed to parse PDF file');
  }
};

// Extract quarter information from text
const extractQuarterInfo = (text) => {
  const quarterPatterns = [
    /Q[1-4]\s*(?:of\s*)?(\d{4})/i,
    /Quarter\s*([1-4])\s*(?:of\s*)?(\d{4})/i,
    /(\d{4})\s*Q([1-4])/i,
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i
  ];

  let quarter = null;
  let year = null;
  let detectedDate = null;

  // Try quarter patterns
  for (const pattern of quarterPatterns) {
    const match = text.match(pattern);
    if (match) {
      if (pattern === quarterPatterns[0]) {
        quarter = match[0].match(/Q([1-4])/i)?.[1];
        year = parseInt(match[1]);
      } else if (pattern === quarterPatterns[1]) {
        quarter = match[1];
        year = parseInt(match[2]);
      } else if (pattern === quarterPatterns[2]) {
        year = parseInt(match[1]);
        quarter = match[2];
      } else if (pattern === quarterPatterns[3]) {
        const month = match[1];
        const day = parseInt(match[2]);
        year = parseInt(match[3]);
        
        // Determine quarter from month
        const monthNum = new Date(`${month} 1, ${year}`).getMonth() + 1;
        if (monthNum >= 1 && monthNum <= 3) quarter = '1';
        else if (monthNum >= 4 && monthNum <= 6) quarter = '2';
        else if (monthNum >= 7 && monthNum <= 9) quarter = '3';
        else quarter = '4';
        
        detectedDate = new Date(year, monthNum - 1, day);
      }
      
      if (quarter && year) break;
    }
  }

  // If no quarter found, try to extract from dates in the document
  if (!quarter || !year) {
    const datePattern = /(\d{1,2})\/(\d{1,2})\/(\d{4})/g;
    const dates = [];
    let match;
    
    while ((match = datePattern.exec(text)) !== null) {
      const month = parseInt(match[1]);
      const day = parseInt(match[2]);
      const yearFound = parseInt(match[3]);
      dates.push({ month, day, year: yearFound });
    }
    
    if (dates.length > 0) {
      // Use the most recent date
      const latestDate = dates.sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        if (a.month !== b.month) return b.month - a.month;
        return b.day - a.day;
      })[0];
      
      year = latestDate.year;
      if (latestDate.month >= 1 && latestDate.month <= 3) quarter = '1';
      else if (latestDate.month >= 4 && latestDate.month <= 6) quarter = '2';
      else if (latestDate.month >= 7 && latestDate.month <= 9) quarter = '3';
      else quarter = '4';
      
      detectedDate = new Date(latestDate.year, latestDate.month - 1, latestDate.day);
    }
  }

  return {
    quarter: quarter ? `Q${quarter}` : null,
    year: year,
    detectedDate: detectedDate?.toISOString().split('T')[0] || null
  };
};

module.exports = { parsePDF, extractQuarterInfo };
