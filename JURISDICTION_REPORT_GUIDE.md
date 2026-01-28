# Jurisdiction Report Feature Guide

## Overview

The jurisdiction report feature allows users to view IFTA data organized by jurisdiction (state/province) with quarterly breakdowns, totals, and percentages.

## Features

### 1. **Jurisdiction-Level View**
- View Total KM per jurisdiction across all quarters
- See quarterly breakdown (Q1, Q2, Q3, Q4) for each jurisdiction
- Automatic percentage calculation based on grand total
- Sorted by Total KM (highest first)

### 2. **Data Structure**
The report matches your Excel template structure:
- **STATE/Jurisdiction**: Two-letter jurisdiction code (e.g., AB, ON, CA)
- **Q1, Q2, Q3, Q4**: Quarterly KM values
- **TOTAL**: Sum of all quarters for that jurisdiction
- **% of total**: Percentage of grand total

### 3. **Download Options**

#### Excel Download
- Downloads as `.xlsx` file
- Matches your template structure
- Can be opened in Excel and further customized

#### PDF Download
- Professional PDF report
- Includes company branding (logo if uploaded)
- Formatted table with all jurisdiction data
- Ready for sharing or printing

## How to Use

### Step 1: Upload IFTA Reports
1. Go to **Reports > Upload**
2. Upload your IFTA PDF files (Q1, Q2, Q3, Q4)
3. Wait for processing to complete

### Step 2: Generate Summary Report
1. Go to **Reports**
2. Select the reports you want to include
3. Click **Generate Summary Report**
4. Give it a name (e.g., "2024 Annual Summary")

### Step 3: View Jurisdiction Report
1. Go to **Reports > Generated Reports**
2. Click on a report
3. Click **View Jurisdiction Report** button
4. You'll see:
   - Summary statistics
   - Complete jurisdiction table with percentages
   - Visual chart of top jurisdictions

### Step 4: Download
- Click **Download Excel** to get the Excel file
- Click **Download PDF** to get a PDF report

## Data Extraction

The system automatically:
1. Extracts jurisdiction codes from PDFs (e.g., AB, ON, CA)
2. Extracts "Txbl KM" (Taxable KM) values for each jurisdiction
3. Organizes data by jurisdiction across quarters
4. Calculates totals and percentages
5. Matches the Excel template structure

## Excel Template Structure

Your template has these columns:
- **STATE**: Jurisdiction code
- **Q1, Q2, Q3, Q4**: Quarterly values
- **TOTAL**: Sum of quarters
- **% of total**: Percentage
- **Total KM**: Same as TOTAL (for compatibility)

The system automatically populates these columns when you download the Excel file.

## Troubleshooting

**No jurisdiction data showing?**
- Make sure reports have been processed (status = "completed")
- Regenerate the summary report to include jurisdiction extraction
- Check that PDFs contain jurisdiction tables

**Percentages not showing correctly?**
- Percentages are calculated as: (Jurisdiction Total / Grand Total) × 100
- All percentages should sum to 100%

**Download not working?**
- Check browser download settings
- Ensure you have permission to download files
- Try a different browser if issues persist

## Technical Details

- **Jurisdiction Extraction**: Uses pattern matching to find "Diesel [Code] False [KM]" rows
- **Data Storage**: Raw PDF text is stored for extraction (up to 200KB per report)
- **Calculation**: Totals and percentages calculated server-side
- **PDF Generation**: Uses PDFKit library
- **Excel Generation**: Uses XLSX library, matches template structure
