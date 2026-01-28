const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Generate summary PDF with all quarters
const generateSummaryPDF = async (reportData, user) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ 
        margin: 50,
        size: 'LETTER'
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header with company name (logo can be added later if needed)

      // Title
      doc.fontSize(20).font('Helvetica-Bold').text('IFTA Summary Report', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(14).font('Helvetica').text(user.company_name, { align: 'center' });
      doc.fontSize(10).text(`Generated: ${new Date(reportData.generatedAt).toLocaleDateString()}`, { align: 'center' });
      doc.moveDown(1);

      // Summary totals
      if (reportData.totals) {
        doc.fontSize(14).font('Helvetica-Bold').text('Summary Totals', { underline: true });
        doc.moveDown(0.3);
        doc.fontSize(10).font('Helvetica');
        doc.text(`Total Miles: ${(reportData.totals.totalMiles || 0).toLocaleString()}`, 50, doc.y);
        doc.moveDown(0.4);
        doc.text(`Total Fuel Purchased: ${(reportData.totals.totalFuelPurchased || 0).toLocaleString()}`, 50, doc.y);
        doc.moveDown(0.4);
        doc.text(`Total Fuel Consumed: ${(reportData.totals.totalFuelConsumed || 0).toLocaleString()}`, 50, doc.y);
        doc.moveDown(1);
      }

      // Quarters summary
      if (reportData.quarters && reportData.quarters.length > 0) {
        doc.fontSize(14).font('Helvetica-Bold').text('Quarters Summary', { underline: true });
        doc.moveDown(0.5);

        reportData.quarters.forEach((quarter, index) => {
          if (doc.y > 700) {
            doc.addPage();
          }

          doc.fontSize(12).font('Helvetica-Bold').text(`${quarter.quarter} ${quarter.year}`, 50, doc.y);
          doc.moveDown(0.3);
          doc.fontSize(10).font('Helvetica');
          
          if (quarter.summary) {
            doc.text(`Summary: ${quarter.summary}`, 70, doc.y, { width: 500 });
            doc.moveDown(0.5);
          }

          doc.text(`Total Miles: ${(quarter.totalMiles || 0).toLocaleString()}`, 70, doc.y);
          doc.moveDown(0.3);
          doc.text(`Fuel Purchased: ${(quarter.totalFuelPurchased || 0).toLocaleString()}`, 70, doc.y);
          doc.moveDown(0.3);
          doc.text(`Fuel Consumed: ${(quarter.totalFuelConsumed || 0).toLocaleString()}`, 70, doc.y);
          doc.moveDown(0.8);
        });
      }

      // Jurisdiction table
      if (reportData.jurisdictionData && reportData.jurisdictionData.jurisdictions.length > 0) {
        if (doc.y > 600) {
          doc.addPage();
        }

        doc.fontSize(14).font('Helvetica-Bold').text('Jurisdiction Summary', { underline: true });
        doc.moveDown(0.5);

        // Table headers
        doc.fontSize(9).font('Helvetica-Bold');
        const headerY = doc.y;
        doc.text('Jurisdiction', 50, headerY);
        doc.text('Q1', 150, headerY);
        doc.text('Q2', 200, headerY);
        doc.text('Q3', 250, headerY);
        doc.text('Q4', 300, headerY);
        doc.text('Total KM', 350, headerY);
        doc.text('%', 450, headerY);
        doc.moveDown(0.3);
        doc.moveTo(50, doc.y).lineTo(500, doc.y).stroke();
        doc.moveDown(0.3);

        // Table rows
        doc.font('Helvetica').fontSize(9);
        reportData.jurisdictionData.jurisdictions.forEach((juris) => {
          if (doc.y > 700) {
            doc.addPage();
          }

          const y = doc.y;
          doc.text(juris.code, 50, y);
          juris.quarters.forEach((q, idx) => {
            const x = 150 + (idx * 50);
            doc.text(q ? q.km.toLocaleString() : '-', x, y, { width: 45, align: 'right' });
          });
          doc.text(juris.totalKM.toLocaleString(), 350, y, { width: 90, align: 'right' });
          doc.text(`${juris.percentage.toFixed(2)}%`, 450, y, { width: 50, align: 'right' });
          doc.moveDown(0.4);
        });

        // Grand total
        doc.moveDown(0.3);
        doc.moveTo(50, doc.y).lineTo(500, doc.y).stroke();
        doc.moveDown(0.3);
        doc.font('Helvetica-Bold');
        doc.text('Grand Total', 50, doc.y);
        doc.text(reportData.jurisdictionData.grandTotal.toLocaleString(), 350, doc.y, { width: 90, align: 'right' });
        doc.text('100.00%', 450, doc.y, { width: 50, align: 'right' });
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

module.exports = { generateSummaryPDF };
