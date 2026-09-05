module.exports = (invoiceData, documentType = 'bill') => {
    const isChallan = documentType === 'challan';
    const {
        normalizeUnit,
        unitAbbr,
        formatUnitTotals,
        sumQuantityByUnit,
    } = require('../utils/quantityUnits');

    // Group items by name, width, unit, and (for bills) price
    const grouped = {};
    invoiceData.items.forEach((item) => {
        const name = `${item.name || ''}`.trim().toLowerCase();
        const width = (item.width || '').trim();
        const unit = normalizeUnit(item.unit);
        const price = parseFloat(item.price);
        const key = isChallan
            ? `${name}||${width}||${unit}`
            : `${name}||${width}||${unit}||${price}`;
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

    const formatCurrency = (value) => {
        return typeof value === 'number'
            ? value.toLocaleString('en-IN', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
              })
            : value;
    };

    const itemsTotal =
        invoiceData.items.reduce((sum, item) => sum + (item.amount || 0), 0) || 0;
    const transportCharges = parseFloat(invoiceData.transport_charges) || 0;
    const discount = parseFloat(invoiceData.discount) || 0;
    const actualTotal = itemsTotal + transportCharges - discount;
    const roundedTotal = Math.round(actualTotal);
    const roundOff = (roundedTotal - actualTotal).toFixed(2);
    const heading = isChallan ? 'ON APPROVAL / DELIVERY CHALLAN' : 'SALES BILL';
    const colCount = isChallan ? 6 : 8;

    // Wider Qty column so "58.00 m" stays on one line
    const colgroup = isChallan
        ? `<col style="width:7%"><col style="width:24%"><col style="width:10%"><col style="width:14%"><col style="width:14%"><col style="width:31%">`
        : `<col style="width:5%"><col style="width:18%"><col style="width:8%"><col style="width:12%"><col style="width:10%"><col style="width:18%"><col style="width:12%"><col style="width:17%">`;

    const columnHeaderRow = isChallan
        ? `
          <tr class="col-heading">
            <th style="border-right:1px solid #000;border-bottom:1px solid #000;">Rolls</th>
            <th style="border-right:1px solid #000;border-bottom:1px solid #000;">Sort No.</th>
            <th style="border-right:1px solid #000;border-bottom:1px solid #000;">Width</th>
            <th style="border-right:1px solid #000;border-bottom:1px solid #000;">Roll No.</th>
            <th style="border-right:1px solid #000;border-bottom:1px solid #000;">Shade</th>
            <th style="border-bottom:1px solid #000;">Qty</th>
          </tr>`
        : `
          <tr class="col-heading">
            <th style="border-right:1px solid #000;border-bottom:1px solid #000;">Rolls</th>
            <th style="border-right:1px solid #000;border-bottom:1px solid #000;">Sort No.</th>
            <th style="border-right:1px solid #000;border-bottom:1px solid #000;">Width</th>
            <th style="border-right:1px solid #000;border-bottom:1px solid #000;">Roll No.</th>
            <th style="border-right:1px solid #000;border-bottom:1px solid #000;">Shade</th>
            <th style="border-right:1px solid #000;border-bottom:1px solid #000;">Qty</th>
            <th style="border-right:1px solid #000;border-bottom:1px solid #000;">Rate</th>
            <th style="border-bottom:1px solid #000;">Amount</th>
          </tr>`;

    // Repeated on every printed page via thead
    const repeatingHeader = `
      <tr class="repeat-header">
        <td colspan="${colCount}" style="padding:0;border:none;">
          <div class="header">
            <div class="sub-header">${heading}</div>
            <div class="company-name">MOHIT TRADERS</div>
            <div>ULHASNAGAR 421005</div>
          </div>
          <div class="details-row">
            <div class="details-col">
              <div><strong>To,</strong></div>
              <div><strong>${invoiceData.customer}</strong></div>
              <div>Maker : ${invoiceData.maker || '-'}</div>
            </div>
            <div class="details-col right">
              <div>Bill No.: ${invoiceData.sales_no || '-'}</div>
              <div>Date: ${invoiceData.date || ''}</div>
              <div>Hamal: ${invoiceData.hamaal || '-'}</div>
              <div>Challan No.: ${invoiceData.challan_no || ''}</div>
            </div>
          </div>
        </td>
      </tr>
      ${columnHeaderRow}`;

    const qtyLine = (value, unit) =>
        `<div class="qty-line">${Number(value).toFixed(2)}&nbsp;${unitAbbr(unit)}</div>`;

    const itemRows = groupedItems
        .map((group) => {
            const rollNosHtml = group.roll_nos
                .map((roll) => `<div>${roll || '&nbsp;'}</div>`)
                .join('');
            const shadesHtml = (group.shades || [])
                .map((shade) => `<div>${shade || '&nbsp;'}</div>`)
                .join('');
            const metersHtml = group.meters
                .map((m) => qtyLine(m, group.unit))
                .join('');
            const metersCell = `${metersHtml}<div class="qty-rule">________</div><div class="qty-total">${qtyLine(group.total_mts, group.unit)}</div>`;

            if (isChallan) {
                return `
          <tr class="item-row">
            <td style="border-right:1px solid #000; vertical-align:top;">${group.roll_nos.length}</td>
            <td style="border-right:1px solid #000; vertical-align:top;">${group.name || ''}</td>
            <td style="border-right:1px solid #000; vertical-align:top;">${group.width || ''}</td>
            <td style="border-right:1px solid #000; white-space:pre-line; vertical-align:top;">${rollNosHtml}</td>
            <td style="border-right:1px solid #000; white-space:pre-line; vertical-align:top;">${shadesHtml}</td>
            <td class="qty-cell" style="white-space:pre-line; vertical-align:top;">${metersCell}</td>
          </tr>`;
            }

            return `
          <tr class="item-row">
            <td style="border-right:1px solid #000; vertical-align:top;">${group.roll_nos.length}</td>
            <td style="border-right:1px solid #000; vertical-align:top;">${group.name || ''}</td>
            <td style="border-right:1px solid #000; vertical-align:top;">${group.width || ''}</td>
            <td style="border-right:1px solid #000; white-space:pre-line; vertical-align:top;">${rollNosHtml}</td>
            <td style="border-right:1px solid #000; white-space:pre-line; vertical-align:top;">${shadesHtml}</td>
            <td class="qty-cell" style="border-right:1px solid #000; white-space:pre-line; vertical-align:top;">${metersCell}</td>
            <td style="border-right:1px solid #000; vertical-align:bottom;"><div class="qty-rule">______</div>${group.price || ''}</td>
            <td style="text-align: right; vertical-align:bottom;"><div class="qty-rule">_______</div>${formatCurrency(group.total_amount) || ''}</td>
          </tr>`;
        })
        .join('');

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
          <td colspan="5" rowspan="5" style="border-right:1px solid #000;font-weight: bold;text-align: right;">${convertNumberToWords(roundedTotal) || ''}</td>
          <td colspan="2" style="font-weight: bold;border-right:1px solid #000;border-bottom:1px solid #000;">Transport Charges</td>
          <td style="text-align: right;border-bottom:1px solid #000;">${formatCurrency(transportCharges)}</td>
        </tr>
        <tr>
          <td colspan="2" style="font-weight: bold;border-right:1px solid #000;border-bottom:1px solid #000;">Discount</td>
          <td style="text-align: right;border-bottom:1px solid #000;">${formatCurrency(discount)}</td>
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
        @page { size: A4; margin: 8mm; }
        html, body {
          margin: 0;
          padding: 0;
          background: #fff;
          font-family: Arial, sans-serif;
          color: #333;
        }
        .sheet {
          width: 100%;
        }
        .header {
          border: 1px solid #000;
          text-align: center;
          padding: 8px 10px;
        }
        .company-name {
          font-size: 22px;
          font-weight: bold;
          color: #2c3e50;
        }
        .sub-header {
          text-align: center;
          font-size: 13px;
          font-weight: 700;
        }
        .details-row {
          border: 1px solid #000;
          border-top: none;
          display: flex;
          justify-content: space-between;
        }
        .details-col {
          flex: 1;
          font-size: 16px;
          font-weight: 700;
          padding: 6px 10px;
        }
        .details-col.right {
          text-align: left;
          border-left: 1px solid #000;
        }
        table.items-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          border: 1px solid #000;
          border-top: none;
        }
        thead {
          display: table-header-group;
        }
        tfoot {
          display: table-footer-group;
        }
        tr.item-row {
          page-break-inside: avoid;
          break-inside: avoid;
        }
        th, td {
          padding: 6px;
          text-align: left;
          font-size: 15px;
          font-weight: 700;
          vertical-align: top;
        }
        .col-heading th {
          font-size: 16px;
          padding: 6px 4px 8px !important;
        }
        .qty-cell {
          white-space: nowrap;
        }
        .qty-line {
          white-space: nowrap;
          font-size: 16px;
          line-height: 1.25;
        }
        .qty-total .qty-line {
          font-weight: 700;
        }
        .qty-rule {
          font-size: 16px;
          line-height: 10px;
          padding-bottom: 8px;
        }
        .challan-note {
          margin-top: 6px;
          border: 1px solid #000;
          padding: 8px 10px;
          font-size: 14px;
          font-weight: 700;
          line-height: 1.45;
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .footer-block {
          page-break-inside: avoid;
          break-inside: avoid;
        }
      </style>
    </head>
    <body>
      <div class="sheet">
        <table class="items-table">
          <colgroup>${colgroup}</colgroup>
          <thead>
            ${repeatingHeader}
          </thead>
          <tbody>
            ${itemRows || `<tr><td colspan="${colCount}" style="padding:20px;text-align:center;">No items</td></tr>`}
          </tbody>
        </table>
        <div class="footer-block">
          <table class="items-table" style="border-top:none;">
            <colgroup>${colgroup}</colgroup>
            <tbody>
              ${footerRows}
            </tbody>
          </table>
          ${
              isChallan
                  ? `<div class="challan-note">
            कृपया हर एक रोल काटने से पहले कपड़ा अच्छी तरह से परख लें<br/>
            रोल काटने के बाद हमारी किसी भी प्रकार की जिम्मेदारी नहीं है।
          </div>`
                  : ''
          }
        </div>
      </div>
    </body>
  </html>`;
};

function convertNumberToWords(amount) {
    if (typeof amount !== 'number') amount = parseFloat(amount);
    if (isNaN(amount)) return '';

    const ones = [
        '',
        'One',
        'Two',
        'Three',
        'Four',
        'Five',
        'Six',
        'Seven',
        'Eight',
        'Nine',
        'Ten',
        'Eleven',
        'Twelve',
        'Thirteen',
        'Fourteen',
        'Fifteen',
        'Sixteen',
        'Seventeen',
        'Eighteen',
        'Nineteen',
    ];
    const tens = [
        '',
        '',
        'Twenty',
        'Thirty',
        'Forty',
        'Fifty',
        'Sixty',
        'Seventy',
        'Eighty',
        'Ninety',
    ];

    function numToWords(n) {
        if (n < 20) return ones[n];
        if (n < 100)
            return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
        if (n < 1000)
            return (
                ones[Math.floor(n / 100)] +
                ' Hundred' +
                (n % 100 ? ' ' + numToWords(n % 100) : '')
            );
        return '';
    }

    function splitNumber(num) {
        let res = [];
        res.push(num % 1000);
        num = Math.floor(num / 1000);
        res.push(num % 100);
        num = Math.floor(num / 100);
        res.push(num % 100);
        num = Math.floor(num / 100);
        res.push(num);
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
