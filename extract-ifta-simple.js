// Simple script to manually extract and update IFTA data
// Since PDF parsing is complex, this script allows manual entry or uses a simpler approach

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// You can manually enter the values here if PDF parsing doesn't work
const manualData = [
  // { quarter: 'Q1', year: 2025, totalKM: 0 }, // Enter value here
  // { quarter: 'Q2', year: 2025, totalKM: 0 }, // Enter value here
  // { quarter: 'Q3', year: 2025, totalKM: 0 }, // Enter value here
  // { quarter: 'Q4', year: 2024, totalKM: 0 }, // Enter value here
];

// Or use this function to read from a simple text file with values
function readFromTextFile() {
  const textFile = path.join(__dirname, 'ifta-data.txt');
  if (fs.existsSync(textFile)) {
    const content = fs.readFileSync(textFile, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());
    const data = [];
    for (const line of lines) {
      const match = line.match(/(Q[1-4])\s+(\d{4})\s*[:=]?\s*([\d,]+\.?\d*)/i);
      if (match) {
        data.push({
          quarter: match[1],
          year: parseInt(match[2]),
          totalKM: parseFloat(match[3].replace(/,/g, ''))
        });
      }
    }
    return data;
  }
  return [];
}

async function main() {
  console.log('📊 IFTA Data Extractor\n');
  
  // Try to read from text file first, then use manual data
  let data = readFromTextFile();
  if (data.length === 0 && manualData.length > 0) {
    data = manualData.filter(d => d.totalKM > 0);
  }
  
  if (data.length === 0) {
    console.log('⚠️  No data found. Please either:');
    console.log('   1. Create a file called "ifta-data.txt" with format:');
    console.log('      Q1 2025: 12345');
    console.log('      Q2 2025: 23456');
    console.log('      Q3 2025: 34567');
    console.log('      Q4 2024: 45678');
    console.log('\n   2. Or edit extract-ifta-simple.js and add values to manualData array');
    return;
  }
  
  console.log('📋 Data to update:');
  data.forEach(d => {
    console.log(`   ${d.quarter} ${d.year}: ${d.totalKM.toLocaleString()} km`);
  });
  console.log('');
  
  // Update Excel file
  const excelPath = path.join(__dirname, 'IFTA SUMMARY.xlsx');
  
  if (!fs.existsSync(excelPath)) {
    console.log('📝 Creating new Excel file...');
    const workbook = XLSX.utils.book_new();
    const wsData = [
      ['Quarter', 'Year', 'Total KM'],
      ...data.map(d => [d.quarter, d.year, d.totalKM])
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'IFTA Summary');
    XLSX.writeFile(workbook, excelPath);
    console.log('✅ Created new Excel file');
  } else {
    console.log('📝 Updating existing Excel file...');
    const workbook = XLSX.readFile(excelPath);
    const sheetName = workbook.SheetNames[0] || 'Sheet1';
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    
    // Find header row and columns
    let headerRow = -1;
    let quarterCol = -1;
    let yearCol = -1;
    let kmCol = -1;
    
    for (let i = 0; i < Math.min(10, jsonData.length); i++) {
      const row = jsonData[i];
      if (Array.isArray(row)) {
        for (let j = 0; j < row.length; j++) {
          const cell = String(row[j] || '').toLowerCase();
          if (cell.includes('quarter') || cell === 'q1' || cell === 'q2' || cell === 'q3' || cell === 'q4') {
            quarterCol = j;
            if (headerRow < 0) headerRow = i;
          }
          if (cell.includes('year') && !cell.includes('quarter')) {
            yearCol = j;
            if (headerRow < 0) headerRow = i;
          }
          if (cell.includes('km') || cell.includes('kilometer') || cell.includes('total km') || cell.includes('total km')) {
            kmCol = j;
            if (headerRow < 0) headerRow = i;
          }
        }
      }
    }
    
    if (headerRow < 0) {
      // No headers found, add them
      jsonData.unshift(['Quarter', 'Year', 'Total KM']);
      headerRow = 0;
      quarterCol = 0;
      yearCol = 1;
      kmCol = 2;
    }
    
    // Ensure columns exist
    if (quarterCol < 0) {
      quarterCol = jsonData[headerRow].length;
      jsonData[headerRow].push('Quarter');
    }
    if (yearCol < 0) {
      yearCol = jsonData[headerRow].length;
      jsonData[headerRow].push('Year');
    }
    if (kmCol < 0) {
      kmCol = jsonData[headerRow].length;
      jsonData[headerRow].push('Total KM');
    }
    
    // Update or add rows
    for (const item of data) {
      let found = false;
      
      // Look for existing row
      for (let i = headerRow + 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!Array.isArray(row)) continue;
        
        while (row.length <= Math.max(quarterCol, yearCol, kmCol)) {
          row.push('');
        }
        
        const quarterMatch = quarterCol >= 0 && String(row[quarterCol] || '').trim() === item.quarter;
        const yearMatch = yearCol >= 0 && (row[yearCol] === item.year || String(row[yearCol] || '').trim() === String(item.year));
        
        if (quarterMatch && yearMatch) {
          row[kmCol] = item.totalKM;
          found = true;
          console.log(`   ✓ Updated ${item.quarter} ${item.year}: ${item.totalKM.toLocaleString()} km`);
          break;
        }
      }
      
      // Add new row if not found
      if (!found) {
        const newRow = [];
        while (newRow.length <= Math.max(quarterCol, yearCol, kmCol)) {
          newRow.push('');
        }
        if (quarterCol >= 0) newRow[quarterCol] = item.quarter;
        if (yearCol >= 0) newRow[yearCol] = item.year;
        if (kmCol >= 0) newRow[kmCol] = item.totalKM;
        jsonData.push(newRow);
        console.log(`   + Added ${item.quarter} ${item.year}: ${item.totalKM.toLocaleString()} km`);
      }
    }
    
    // Write back to Excel
    const newWorksheet = XLSX.utils.aoa_to_sheet(jsonData);
    workbook.Sheets[sheetName] = newWorksheet;
    XLSX.writeFile(workbook, excelPath);
    console.log('\n✅ Excel file updated successfully!');
  }
  
  const total = data.reduce((sum, d) => sum + d.totalKM, 0);
  console.log(`\n📊 Total KM: ${total.toLocaleString()} km`);
}

main().catch(console.error);
