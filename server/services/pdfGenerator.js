const PDFDocument = require('pdfkit');

// Generate summary PDF with all quarters
const generateSummaryPDF = async (reportData, user) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ 
      margin: 50,
      size: 'LETTER'
    });

    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {

      // Header with company name (logo can be added later if needed)

      // Title
      doc.fontSize(20).font('Helvetica-Bold').text('IFTA Summary Report', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(14).font('Helvetica').text(user.company_name || 'Company Name', { align: 'center' });
      doc.fontSize(10).text(`Generated: ${new Date(reportData.generatedAt || Date.now()).toLocaleDateString()}`, { align: 'center' });
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

      // CAN vs US Summary
      if (reportData.jurisdictionData && reportData.jurisdictionData.canVsUs) {
        if (doc.y > 650) {
          doc.addPage();
        }
        const canVsUs = reportData.jurisdictionData.canVsUs;
        
        doc.fontSize(14).font('Helvetica-Bold').text('CAN vs US Summary', { underline: true });
        doc.moveDown(0.3);
        doc.fontSize(10).font('Helvetica');
        doc.text(`Canada: ${canVsUs.can.total.toLocaleString()} KM (${canVsUs.can.percentage.toFixed(2)}%)`, 50, doc.y);
        doc.moveDown(0.4);
        doc.text(`United States: ${canVsUs.us.total.toLocaleString()} KM (${canVsUs.us.percentage.toFixed(2)}%)`, 50, doc.y);
        doc.moveDown(1);
      }

      // Jurisdiction table
      if (reportData.jurisdictionData && reportData.jurisdictionData.jurisdictions.length > 0) {
        if (doc.y > 600) {
          doc.addPage();
        }

        doc.fontSize(14).font('Helvetica-Bold').text('Jurisdiction Summary by State/Province/Territory', { underline: true });
        doc.moveDown(0.5);

        const jd = reportData.jurisdictionData;
        const periods = reportData.quarters || [];
        let numPeriodCols = periods.length;
        if (jd.jurisdictions[0]?.quarters?.length) {
          numPeriodCols = Math.max(numPeriodCols, jd.jurisdictions[0].quarters.length);
        }
        numPeriodCols = Math.max(numPeriodCols, 1);
        const jColW = 72;
        const pColW = 44;
        const startX = 50;
        let totalKmX = startX + jColW + numPeriodCols * pColW + 6;
        const pctX = totalKmX + 68;
        const tableEndX = Math.min(pctX + 44, 520);

        doc.fontSize(9).font('Helvetica-Bold');
        const headerY = doc.y;
        doc.text('Jurisdiction', startX, headerY, { width: jColW - 4 });
        let hx = startX + jColW;
        for (let i = 0; i < numPeriodCols; i++) {
          const q = periods[i];
          const label =
            q && q.quarter != null && q.year != null
              ? `${String(q.quarter).trim()} ${q.year}`.slice(0, 12)
              : `P${i + 1}`;
          doc.text(label, hx, headerY, { width: pColW, align: 'right' });
          hx += pColW;
        }
        doc.text('Total KM', totalKmX, headerY, { width: 64, align: 'right' });
        doc.text('%', pctX, headerY, { width: 40, align: 'right' });
        doc.moveDown(0.3);
        doc.moveTo(startX, doc.y).lineTo(tableEndX, doc.y).stroke();
        doc.moveDown(0.3);

        doc.font('Helvetica').fontSize(9);
        jd.jurisdictions.forEach((juris) => {
          if (doc.y > 700) {
            doc.addPage();
          }

          const y = doc.y;
          doc.text(String(juris.code || '').slice(0, 12), startX, y, { width: jColW - 4 });
          let rx = startX + jColW;
          for (let i = 0; i < numPeriodCols; i++) {
            const q = (juris.quarters || [])[i];
            const txt = q && q.km != null ? Number(q.km).toLocaleString() : '-';
            doc.text(txt, rx, y, { width: pColW, align: 'right' });
            rx += pColW;
          }
          doc.text(juris.totalKM != null ? juris.totalKM.toLocaleString() : '-', totalKmX, y, { width: 64, align: 'right' });
          doc.text(`${(juris.percentage != null ? juris.percentage : 0).toFixed(2)}%`, pctX, y, { width: 40, align: 'right' });
          doc.moveDown(0.4);
        });

        doc.moveDown(0.3);
        doc.moveTo(startX, doc.y).lineTo(tableEndX, doc.y).stroke();
        doc.moveDown(0.3);
        doc.font('Helvetica-Bold');
        const gY = doc.y;
        doc.text('Grand Total', startX, gY);
        doc.text(jd.grandTotal != null ? jd.grandTotal.toLocaleString() : '0', totalKmX, gY, { width: 64, align: 'right' });
        doc.text('100.00%', pctX, gY, { width: 40, align: 'right' });
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

module.exports = { generateSummaryPDF };
