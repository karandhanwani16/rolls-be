module.exports = (invoiceData, documentType = 'bill') => {
        const isChallan = documentType === 'challan';
        const { normalizeUnit, unitShort, unitAbbr, formatUnitTotals, sumQuantityByUnit } = require('../utils/quantityUnits');

        // Group items by name, width, unit, and (for bills) price
        const grouped = {};
        invoiceData.items.forEach((item) => {
            const name = `${item.name || ''}`.trim().toLowerCase();
            const width = (item.width || "").trim();
            const unit = normalizeUnit(item.unit);
            const price = parseFloat(item.price);
            const key = isChallan ? `${name}||${width}||${unit}` : `${name}||${width}||${unit}||${price}`;
            if (!grouped[key]) {
                grouped[key] = {
                    name: item.name || '',
                    width: item.width,
                    unit,
                    price: item.price,
                    roll_nos: [],
                    shades: [],
                    meters: [],
                    total_mts: 0,
                    total_amount: 0,
                };
            }
            grouped[key].roll_nos.push(item.roll_no);
            grouped[key].shades.push(item.shade || '');
            grouped[key].meters.push(parseFloat(item.mts || 0));
            grouped[key].total_mts += parseFloat(item.mts || 0);
            grouped[key].total_amount += parseFloat(item.amount || 0);
        });
        const groupedItems = Object.values(grouped);

        const unitTotals = sumQuantityByUnit(
            invoiceData.items.map((item) => ({ meters: item.mts, unit: item.unit })),
        );
        const totalQtyLabel = formatUnitTotals(unitTotals);

        // Format currency values
        const formatCurrency = (value) => {
            return typeof value === "number" ?
                value.toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                }) :
                value;
        };

        const totalRollCount = groupedItems.reduce(
            (count, item) => count + item.roll_nos.length,
            0
        );

        const itemsTotal = invoiceData.items.reduce((sum, item) => sum + (item.amount || 0), 0) || 0;
        const transportCharges = parseFloat(invoiceData.transport_charges) || 0;
        const actualTotal = itemsTotal + transportCharges;
        const roundedTotal = Math.round(actualTotal);
        const roundOff = (roundedTotal - actualTotal).toFixed(2);
        const heading = isChallan ? 'ON APPROVAL / DELIVERY CHALLAN' : 'SALES BILL';

        const headerRow = isChallan
            ? `
          <tr id="heading">
            <th style="border-right:1px solid #000;border-bottom:1px solid #000;">Rolls</th>
            <th style="border-right:1px solid #000;border-bottom:1px solid #000;">Sort No.</th>
            <th style="border-right:1px solid #000;border-bottom:1px solid #000;">Width</th>
            <th style="border-right:1px solid #000;border-bottom:1px solid #000;">Roll No.</th>
            <th style="border-right:1px solid #000;border-bottom:1px solid #000;">Shade</th>
            <th style="border-bottom:1px solid #000;">Qty</th>
          </tr>`
            : `
          <tr id="heading">
            <th style="border-right:1px solid #000;border-bottom:1px solid #000;">Rolls</th>
            <th style="border-right:1px solid #000;border-bottom:1px solid #000;">Sort No.</th>
            <th style="border-right:1px solid #000;border-bottom:1px solid #000;">Width</th>
            <th style="border-right:1px solid #000;border-bottom:1px solid #000;">Roll No.</th>
            <th style="border-right:1px solid #000;border-bottom:1px solid #000;">Shade</th>
            <th style="border-right:1px solid #000;border-bottom:1px solid #000;">Qty</th>
            <th style="border-right:1px solid #000;border-bottom:1px solid #000;">Rate</th>
            <th style="border-bottom:1px solid #000;">Amount</th>
          </tr>`;

        const itemRows = groupedItems
          .map((group) => {
            const rollNosHtml = group.roll_nos
              .map((roll) => `<div>${roll}</div>`)
              .join("");
            const shadesHtml = (group.shades || [])
              .map((shade) => `<div>${shade || "&nbsp;"}</div>`)
              .join("");
            const metersHtml = group.meters
              .map((m) => `<div>${m.toFixed(2)} ${unitAbbr(group.unit)}</div>`)
              .join("");
            const metersCell = `${metersHtml}<div style="font-size:18px;line-height:10px;padding-bottom:10px;">________</div><div style="font-weight:bold;">${group.total_mts.toFixed(2)} ${unitAbbr(group.unit)}</div>`;

            if (isChallan) {
              return `
          <tr>
            <td style="border-right:1px solid #000; vertical-align:top;">${group.roll_nos.length}</td>
            <td style="border-right:1px solid #000; vertical-align:top;">${group.name || ""}</td>
            <td style="border-right:1px solid #000; vertical-align:top;">${group.width || ""}</td>
            <td style="border-right:1px solid #000; white-space:pre-line; vertical-align:top;">${rollNosHtml}</td>
            <td style="border-right:1px solid #000; white-space:pre-line; vertical-align:top;">${shadesHtml}</td>
            <td style="white-space:pre-line; vertical-align:top;">${metersCell}</td>
          </tr>`;
            }

            return `
          <tr>
            <td style="border-right:1px solid #000; vertical-align:top;">${group.roll_nos.length}</td>
            <td style="border-right:1px solid #000; vertical-align:top;">${group.name || ""}</td>
            <td style="border-right:1px solid #000; vertical-align:top;">${group.width || ""}</td>
            <td style="border-right:1px solid #000; white-space:pre-line; vertical-align:top;">${rollNosHtml}</td>
            <td style="border-right:1px solid #000; white-space:pre-line; vertical-align:top;">${shadesHtml}</td>
            <td style="border-right:1px solid #000; white-space:pre-line; vertical-align:top;">${metersCell}</td>
            <td style="border-right:1px solid #000; vertical-align:bottom;"><div style="font-size:18px;line-height:10px;padding-bottom:10px;">______</div>${group.price || ""}</td>
            <td style="text-align: right; vertical-align:bottom;"><div style="font-size:18px;line-height:10px;padding-bottom:10px;">_______</div>${formatCurrency(group.total_amount) || ""}</td>
          </tr>`;
          })
          .join("");

        const colgroup = isChallan
            ? `<col style="width:9%"><col style="width:26%"><col style="width:11%"><col style="width:16%"><col style="width:16%"><col style="width:22%">`
            : `<col style="width:7%"><col style="width:20%"><col style="width:9%"><col style="width:13%"><col style="width:12%"><col style="width:11%"><col style="width:11%"><col style="width:17%">`;

        const fillCols = isChallan
            ? `<div class="fill-col" style="width:9%"></div><div class="fill-col" style="width:26%"></div><div class="fill-col" style="width:11%"></div><div class="fill-col" style="width:16%"></div><div class="fill-col" style="width:16%"></div><div class="fill-col" style="width:22%"></div>`
            : `<div class="fill-col" style="width:7%"></div><div class="fill-col" style="width:20%"></div><div class="fill-col" style="width:9%"></div><div class="fill-col" style="width:13%"></div><div class="fill-col" style="width:12%"></div><div class="fill-col" style="width:11%"></div><div class="fill-col" style="width:11%"></div><div class="fill-col" style="width:17%"></div>`;

        const footerRows = isChallan
            ? `
        <tr style="border-top:1px solid #000;">
          <td colspan="5" style="border-right:1px solid #000;font-weight: bold;text-align: right;">Total Qty : ${totalQtyLabel}</td>
          <td></td>
        </tr>`
            : `
        <tr style="border-top:1px solid #000;">
          <td colspan="5" style="border-right:1px solid #000;border-bottom:1px solid #000;font-weight: bold;text-align: right;">Total Qty : ${totalQtyLabel}</td>
          <td colspan="2" style="font-weight: bold;border-right:1px solid #000;border-bottom:1px solid #000;">Sub Total</td>
          <td style="text-align: right;border-bottom:1px solid #000;">${formatCurrency(itemsTotal || 0)}</td>
        </tr>
        <tr>
          <td colspan="5" rowspan="4" style="border-right:1px solid #000;font-weight: bold;text-align: right;">${convertNumberToWords(roundedTotal) || ""}</td>
          <td colspan="2" style="font-weight: bold;border-right:1px solid #000;border-bottom:1px solid #000;">Transport Charges</td>
          <td style="text-align: right;border-bottom:1px solid #000;">${formatCurrency(transportCharges)}</td>
        </tr>
        <tr>
          <td colspan="2" style="font-weight: bold;border-right:1px solid #000;border-bottom:1px solid #000;">Round Off</td>
          <td style="text-align: right;border-bottom:1px solid #000;">${formatCurrency(roundOff)}</td>
        </tr>
        <tr>
          <td colspan="2" style="border-right:1px solid #000;border-bottom:1px solid #000;"></td>
          <td style="border-bottom:1px solid #000;"></td>
        </tr>
        <tr>
          <td colspan="2" style="font-weight: bold;border-right:1px solid #000;">Total Amount</td>
          <td style="text-align: right">${formatCurrency(roundedTotal)}</td>
        </tr>`;

        return `
    <html>
    <head>
      <style>
        @page { size: A4; margin: 0; }
        html, body {
          margin: 0;
          padding: 0;
          width: 210mm;
          height: 297mm;
          background: #fff;
          font-family: Arial, sans-serif;
          color: #333;
        }
        .page {
          width: 210mm;
          height: 297mm;
          box-sizing: border-box;
          padding: 8mm;
          display: flex;
          flex-direction: column;
          background: #fff;
        }
        .header {
          border: 1px solid #000;
          text-align: center;
          padding: 10px;
          flex-shrink: 0;
        }
        .company-name {
          font-size: 24px;
          font-weight: bold;
          color: #2c3e50;
        }
        .sub-header {
          text-align: center;
          font-size: 14px;
          font-weight:700;
        }
        .details-row {
          border: 1px solid #000;
          border-top: none;
          display: flex;
          justify-content: space-between;
          flex-shrink: 0;
        }
        .details-col {
          flex: 1;
          font-size: 18px;
          font-weight: 700;
          padding-left: 10px;
          }
          .details-col.right {
            text-align: left;
            padding-right: 10px;
            padding-bottom: 10px;
            border-left: 1px solid #000;
            font-size: 18px !important;
            font-weight: 700 !important;
        }
        .table-wrap {
          flex: 1 1 0;
          height: 0;
          min-height: 0;
          display: flex;
          flex-direction: column;
          border: 1px solid #000;
          border-top: none;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }
        th,
        td {
          padding: 8px;
          text-align: left;
          font-size: 15px;
        }
        th {
          padding: 4px !important;
          padding-bottom: 10px !important;
          font-weight: black;
          border-top: none;
        }
        .table-fill {
          flex: 1 1 auto;
          min-height: 8px;
          display: flex;
          width: 100%;
        }
        .fill-col {
          box-sizing: border-box;
          height: 100%;
          border-right: 1px solid #000;
        }
        .fill-col:last-child {
          border-right: none;
        }
        .footer-table td {
          vertical-align: middle;
        }
        .summary-table {
          width: 100%;
          font-size: 15px;
        }
        .summary-table td {
          border: none;
          padding: 4px 8px;
        }
        .amount-words {
          margin-top: 10px;
          font-size: 15px;
        }
        .total-amount {
          font-size: 18px;
          font-weight: bold;
          text-align: right;
        }
          #heading th{
            font-size: 18px;
            font-weight: 700;
          }
            tbody tr td, tfoot tr td{
              font-size: 21px;
              font-weight: 700;
            
            }
      </style>
    </head>
    <body>
      <div class="page">
      <div class="header">
        <div class="sub-header">${heading}</div>
        <div class="company-name">MOHIT TRADERS</div>
        <div>ULHASNAGAR 421005</div>
      </div>
      <div class="details-row">
        <div class="details-col">
          <div><strong>To,</strong></div>
          <div><strong>${invoiceData.customer}</strong></div>
          <div>Maker : ${invoiceData.maker || "-"}</div>
        </div>
        <div class="details-col right">
        <div>Bill No.: ${invoiceData.sales_no || "-"}</div>
        <div>Date: ${invoiceData.date || ""}</div>
        <div>Hamal: ${invoiceData.hamaal || "-"}</div>
        <div>Challan No.: ${invoiceData.challan_no || ""}</div>
        </div>
      </div>
      <div class="table-wrap">
      <table class="items-table">
        <colgroup>${colgroup}</colgroup>
        <thead>
          ${headerRow}
        </thead>
        <tbody>
        ${itemRows}
        </tbody>
      </table>
      <div class="table-fill">${fillCols}</div>
      <table class="footer-table">
        <colgroup>${colgroup}</colgroup>
        <tbody>
        ${footerRows}
        </tbody>
      </table>
      </div>
      </div>
    </body>
  </html>`;
};


function convertNumberToWords(amount) {
    if (typeof amount !== 'number') amount = parseFloat(amount);
    if (isNaN(amount)) return '';

    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
        'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
    ];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    function numToWords(n) {
        if (n < 20) return ones[n];
        if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
        if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + numToWords(n % 100) : '');
        return '';
    }

    function splitNumber(num) {
        let res = [];
        res.push(num % 1000); // units
        num = Math.floor(num / 1000);
        res.push(num % 100); // thousands
        num = Math.floor(num / 100);
        res.push(num % 100); // lakhs
        num = Math.floor(num / 100);
        res.push(num); // crores
        return res;
    }

    let [rupees, paise] = amount.toFixed(2).split('.');
    rupees = parseInt(rupees, 10);
    paise = parseInt(paise, 10);
    if (rupees === 0) return 'Zero Rupees Only';
    let parts = splitNumber(rupees);
    let words = [];
    if (parts[3]) words.push(numToWords(parts[3]) + ' Crore');
    if (parts[2]) words.push(numToWords(parts[2]) + ' Lakh');
    if (parts[1]) words.push(numToWords(parts[1]) + ' Thousand');
    if (parts[0]) words.push(numToWords(parts[0]));
    let result = words.join(' ').replace(/  +/g, ' ').trim() + ' Rupees';
    if (paise) result += ' and ' + numToWords(paise) + ' Paise';
    result += ' Only';
    return result;
}
