# Multiple File Upload Feature

## Overview

You can now upload up to 4 IFTA report PDFs at once (one for each quarter) and automatically generate a single summary PDF containing all the data.

## How to Use

### Step 1: Upload Multiple Files

1. Go to **Reports > Upload**
2. Drag and drop up to 4 PDF files, or click to select multiple files
3. You'll see all selected files listed
4. Remove any file by clicking the × button

### Step 2: Auto-Generate Summary (Optional)

- Check the box: **"Automatically generate summary PDF after upload"**
- This will create a single PDF with all quarters combined
- The PDF will automatically download when ready

### Step 3: Upload and Process

1. Click **"Upload & Process X Report(s)"**
2. Each file is processed individually:
   - Quarter is automatically detected
   - Data is extracted from each PDF
   - Jurisdiction information is parsed
3. If auto-generate is enabled:
   - All reports are combined
   - A single summary PDF is generated
   - PDF includes all quarters with jurisdiction breakdowns

## What's in the Summary PDF?

The automatically generated PDF includes:

1. **Header**
   - Company name
   - Generation date

2. **Summary Totals**
   - Total miles across all quarters
   - Total fuel purchased
   - Total fuel consumed

3. **Quarters Summary**
   - Each quarter (Q1, Q2, Q3, Q4) with:
     - Summary text
     - Total miles
     - Fuel purchased
     - Fuel consumed

4. **Jurisdiction Table**
   - All jurisdictions with:
     - Q1, Q2, Q3, Q4 columns
     - Total KM per jurisdiction
     - Percentage of total
   - Grand total row

## File Limits

- **Maximum files**: 4 (one per quarter)
- **File size**: 10MB per file
- **File type**: PDF only

## Processing Flow

1. **Upload** → Files are uploaded to server
2. **Parse** → Each PDF is parsed and quarter detected
3. **Extract** → Jurisdiction data extracted from each
4. **Process** → AI summarization runs in background
5. **Generate** → If enabled, summary PDF is created
6. **Download** → PDF automatically opens/downloads

## Tips

- **Upload all 4 quarters at once** for best results
- **Enable auto-generate** to get instant summary PDF
- Files are processed in parallel for faster results
- Each file is saved individually, so you can still access them separately

## Troubleshooting

**PDF not generating?**
- Make sure at least one file uploaded successfully
- Check that files are valid PDFs
- Wait a few seconds for processing to complete

**Wrong quarters detected?**
- The system detects quarters from document content
- You can manually adjust after upload if needed

**Missing jurisdiction data?**
- Ensure PDFs contain jurisdiction tables
- The system looks for "Diesel [Code] False [KM]" patterns
- Some PDF formats may require manual entry
