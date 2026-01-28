const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const pdfModule = require('pdf-parse');

// PDF files to process
const pdfFiles = [
  { file: 'CFL IFTA Q1 2025.pdf', quarter: 'Q1', year: 2025 },
  { file: 'CFL IFTA Q2 2025.pdf', quarter: 'Q2', year: 2025 },
  { file: 'CFL IFTA Q3 2025.pdf', quarter: 'Q3', year: 2025 },
  { file: 'CFL IFTA Q4 2024.pdf', quarter: 'Q4', year: 2024 }
];

// Function to parse PDF using the new API
async function parsePDF(filePath) {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const PDFParse = pdfModule.PDFParse;
    const parser = new PDFParse({ data: dataBuffer });
    await parser;
    const textResult = await parser.getText();
    return textResult.text; // Extract text from TextResult object
  } catch (error) {
    console.error(`Error parsing ${filePath}:`, error.message);
    return null;
  }
}

// Function to extract total KM from PDF text
function extractTotalKM(text) {
  // First, try to find explicit "Total" row in the table
  const totalPatterns = [
    /total.*?txbl.*?km[:\s]*([\d,]+\.?\d*)/i,
    /total.*?km[:\s]*([\d,]+\.?\d*)/i,
    /total[:\s]*([\d,]+\.?\d*).*?km/i,
    /grand.*?total.*?km[:\s]*([\d,]+\.?\d*)/i,
  ];

  for (const pattern of totalPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const value = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(value) && value > 0 && value < 10000000) {
        return value;
      }
    }
  }

  // Extract all "Txbl KM" values from jurisdiction rows
  // Pattern: "Diesel [Jurisdiction] False [Txbl KM value]"
  const kmValues = [];
  
  // Match rows like: "Diesel AB False 31,052 31,052 ..."
  // The first number after "False" is the Txbl KM value
  const rowPattern = /Diesel\s+\w{2,3}\s+False\s+(\d+(?:,\d+)*)/g;
  let match;
  
  while ((match = rowPattern.exec(text)) !== null) {
    const value = parseFloat(match[1].replace(/,/g, ''));
    if (!isNaN(value) && value > 0 && value < 10000000) {
      kmValues.push(value);
    }
  }
  
  // If we found values, sum them to get total
  if (kmValues.length > 0) {
    const sum = kmValues.reduce((a, b) => a + b, 0);
    // Verify the sum is reasonable
    if (sum > 1000 && sum < 10000000) {
      return Math.round(sum);
    }
  }

  return null;
}


// Main function
async function main() {
  console.log('🔍 Extracting Total KM from IFTA PDFs...\n');

  const results = [];

  // Process each PDF
  for (const pdfInfo of pdfFiles) {
    const filePath = path.join(__dirname, pdfInfo.file);
    
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  File not found: ${pdfInfo.file}`);
      continue;
    }

    console.log(`📄 Processing ${pdfInfo.file}...`);
    const text = await parsePDF(filePath);
    
    if (!text) {
      console.log(`❌ Failed to parse ${pdfInfo.file}\n`);
      continue;
    }

    const totalKM = extractTotalKM(text);
    
    if (totalKM) {
      console.log(`✅ Found Total KM: ${totalKM.toLocaleString()} km`);
      results.push({
        quarter: pdfInfo.quarter,
        year: pdfInfo.year,
        fileName: pdfInfo.file,
        totalKM: totalKM
      });
    } else {
      console.log(`⚠️  Could not find Total KM in ${pdfInfo.file}`);
      // Show a snippet of the text for debugging
      const snippet = text.substring(0, 500).replace(/\s+/g, ' ');
      console.log(`   Text snippet: ${snippet.substring(0, 200)}...`);
    }
    console.log('');
  }

  // Update Excel file
  const excelPath = path.join(__dirname, 'IFTA SUMMARY.xlsx');
  
  if (!fs.existsSync(excelPath)) {
    console.log('⚠️  Excel file not found. Creating new file...');
    // Create a new workbook
    const workbook = XLSX.utils.book_new();
    const wsData = [
      ['Quarter', 'Year', 'Total KM'],
      ...results.map(r => [r.quarter, r.year, r.totalKM])
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'IFTA Summary');
    XLSX.writeFile(workbook, excelPath);
    console.log('✅ Created new Excel file with data');
  } else {
    console.log('📊 Updating existing Excel file...');
    const workbook = XLSX.readFile(excelPath);
    
    // Try to find the first sheet or use 'Sheet1'
    const sheetName = workbook.SheetNames[0] || 'Sheet1';
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON to work with
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    // Find or create header row
    let headerRow = 0;
    let quarterCol = -1;
    let yearCol = -1;
    let kmCol = -1;
    
    // Look for headers
    for (let i = 0; i < Math.min(5, jsonData.length); i++) {
      const row = jsonData[i];
      if (Array.isArray(row)) {
        for (let j = 0; j < row.length; j++) {
          const cell = String(row[j]).toLowerCase();
          if (cell.includes('quarter') || cell.includes('q1') || cell.includes('q2')) {
            quarterCol = j;
            headerRow = i;
          }
          if (cell.includes('year')) {
            yearCol = j;
            headerRow = i;
          }
          if (cell.includes('km') || cell.includes('kilometer') || cell.includes('total km')) {
            kmCol = j;
            headerRow = i;
          }
        }
      }
    }
    
    // If we found headers, update data
    if (quarterCol >= 0 || kmCol >= 0) {
      console.log(`   Found headers at row ${headerRow + 1}`);
      
      // Update or add rows for each result
      for (const result of results) {
        let found = false;
        
        // Look for existing row with matching quarter and year
        for (let i = headerRow + 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (Array.isArray(row)) {
            const quarterMatch = quarterCol >= 0 && row[quarterCol] === result.quarter;
            const yearMatch = yearCol >= 0 && row[yearCol] === result.year;
            
            if ((quarterCol < 0 || quarterMatch) && (yearCol < 0 || yearMatch)) {
              // Update existing row
              if (kmCol >= 0) {
                row[kmCol] = result.totalKM;
              } else {
                // Add KM column if it doesn't exist
                row.push(result.totalKM);
                if (kmCol < 0) kmCol = row.length - 1;
              }
              found = true;
              console.log(`   Updated ${result.quarter} ${result.year}: ${result.totalKM.toLocaleString()} km`);
              break;
            }
          }
        }
        
        // If not found, add new row
        if (!found) {
          const newRow = [];
          if (quarterCol >= 0) {
            while (newRow.length < quarterCol) newRow.push('');
            newRow[quarterCol] = result.quarter;
          }
          if (yearCol >= 0) {
            while (newRow.length < yearCol) newRow.push('');
            newRow[yearCol] = result.year;
          }
          if (kmCol >= 0) {
            while (newRow.length < kmCol) newRow.push('');
            newRow[kmCol] = result.totalKM;
          } else {
            newRow.push(result.totalKM);
          }
          jsonData.push(newRow);
          console.log(`   Added ${result.quarter} ${result.year}: ${result.totalKM.toLocaleString()} km`);
        }
      }
      
      // Convert back to worksheet
      const newWorksheet = XLSX.utils.aoa_to_sheet(jsonData);
      workbook.Sheets[sheetName] = newWorksheet;
    } else {
      // No headers found, create new structure
      console.log('   No headers found, creating new structure...');
      const wsData = [
        ['Quarter', 'Year', 'Total KM'],
        ...results.map(r => [r.quarter, r.year, r.totalKM])
      ];
      const newWorksheet = XLSX.utils.aoa_to_sheet(wsData);
      workbook.Sheets[sheetName] = newWorksheet;
    }
    
    XLSX.writeFile(workbook, excelPath);
    console.log('✅ Excel file updated successfully');
  }

  // Summary
  console.log('\n📋 Summary:');
  console.log('─'.repeat(50));
  results.forEach(r => {
    console.log(`${r.quarter} ${r.year}: ${r.totalKM.toLocaleString()} km`);
  });
  console.log('─'.repeat(50));
  console.log(`Total: ${results.reduce((sum, r) => sum + r.totalKM, 0).toLocaleString()} km`);
}

// Run the script
main().catch(console.error);
