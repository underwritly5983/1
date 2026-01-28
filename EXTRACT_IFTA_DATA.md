# Extract IFTA Total KM Data

## Quick Method: Manual Entry

1. **Open `ifta-data.txt`** and enter your values:
   ```
   Q1 2025: 12345
   Q2 2025: 23456
   Q3 2025: 34567
   Q4 2024: 45678
   ```

2. **Run the script:**
   ```bash
   node extract-ifta-simple.js
   ```

3. **The Excel file will be updated automatically!**

## Finding Total KM in PDFs

To find the Total KM values in your PDFs:

1. Open each PDF file
2. Look for a section labeled "Total KM", "Total Kilometers", or "Total Distance"
3. Note the number (usually a large number like 12,345 or 123,456)
4. Enter it in the `ifta-data.txt` file

## Alternative: Use the App

You can also:
1. Upload the PDFs through the web app at http://localhost:3000
2. The AI will extract the data automatically
3. Generate a summary report

## File Format

The `ifta-data.txt` file accepts this format:
```
Q1 2025: 12345
Q2 2025: 23456
Q3 2025: 34567
Q4 2024: 45678
```

Or:
```
Q1 2025 = 12345
Q2 2025 = 23456
```

The script will automatically update the Excel file with these values.
