module.exports = (invoiceData, documentType = 'bill') => {
    const isChallan = documentType === 'challan';
    const {
        normalizeUnit,
        unitAbbr,
        formatUnitTotals,
        sumQuantityByUnit,
    } = require('../utils/quantityUnits');

    // ~18 roll lines fit comfortably under header+details on an A4 page
    const ROLLS_PER_PAGE = 18;

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

    const colgroup = isChallan
        ? `<col style="width:9%"><col style="width:26%"><col style="width:11%"><col style="width:16%"><col style="width:16%"><col style="width:22%">`
        : `<col style="width:7%"><col style="width:20%"><col style="width:9%"><col style="width:13%"><col style="width:12%"><col style="width:11%"><col style="width:11%"><col style="width:17%">`;

    const fillCols = isChallan
        ? `<div class="fill-col" style="width:9%"></div><div class="fill-col" style="width:26%"></div><div class="fill-col" style="width:11%"></div><div class="fill-col" style="width:16%"></div><div class="fill-col" style="width:16%"></div><div class="fill-col" style="width:22%"></div>`
        : `<div class="fill-col" style="width:7%"></div><div class="fill-col" style="width:20%"></div><div class="fill-col" style="width:9%"></div><div class="fill-col" style="width:13%"></div><div class="fill-col" style="width:12%"></div><div class="fill-col" style="width:11%"></div><div class="fill-col" style="width:11%"></div><div class="fill-col" style="width:17%"></div>`;

    // Split each product group into roll chunks, then pack chunks into pages
    const chunks = [];
    groupedItems.forEach((group) => {
        const totalRolls = group.roll_nos.length || 1;
        for (let i = 0; i < totalRolls; i += ROLLS_PER_PAGE) {
            const end = Math.min(i + ROLLS_PER_PAGE, totalRolls);
            chunks.push({
                name: group.name,
                width: group.width,
                unit: group.unit,
                price: group.price,
                total_mts: group.total_mts,
                total_amount: group.total_amount,
                full_roll_count: group.roll_nos.length,
                roll_nos: group.roll_nos.slice(i, end),
                shades: (group.shades || []).slice(i, end),
                meters: group.meters.slice(i, end),
                isContinuation: i > 0,
                showGroupTotal: end === totalRolls,
            });
        }
    });

    const pages = [];
    let currentPage = [];
    let currentRolls = 0;
    chunks.forEach((chunk) => {
        const chunkRolls = chunk.roll_nos.length || 1;
        if (currentPage.length > 0 && currentRolls + chunkRolls > ROLLS_PER_PAGE) {
            pages.push(currentPage);
            currentPage = [];
            currentRolls = 0;
        }
        currentPage.push(chunk);
        currentRolls += chunkRolls;
    });
    if (currentPage.length > 0) {
        pages.push(currentPage);
    }
    if (pages.length === 0) {
        pages.push([]);
    }

    const renderItemRows = (pageChunks) =>
        pageChunks
            .map((group) => {
                const rollNosHtml = group.roll_nos
                    .map((roll) => `<div>${roll || '&nbsp;'}</div>`)
                    .join('');
                const shadesHtml = (group.shades || [])
                    .map((shade) => `<div>${shade || '&nbsp;'}</div>`)
                    .join('');
                const metersHtml = group.meters
                    .map((m) => `<div>${m.toFixed(2)} ${unitAbbr(group.unit)}</div>`)
                    .join('');
                const metersCell = group.showGroupTotal
                    ? `${metersHtml}<div style="font-size:18px;line-height:10px;padding-bottom:10px;">________</div><div style="font-weight:bold;">${group.total_mts.toFixed(2)} ${unitAbbr(group.unit)}</div>`
                    : `${metersHtml}<div style="font-size:12px;padding-top:4px;font-weight:normal;">(cont.)</div>`;

                const sortLabel = group.isContinuation
                    ? `${group.name || ''} (cont.)`
                    : group.name || '';
                const rollsLabel = group.isContinuation
                    ? group.roll_nos.length
                    : group.full_roll_count;

                if (isChallan) {
                    return `
          <tr>
            <td style="border-right:1px solid #000; vertical-align:top;">${rollsLabel}</td>
            <td style="border-right:1px solid #000; vertical-align:top;">${sortLabel}</td>
            <td style="border-right:1px solid #000; vertical-align:top;">${group.isContinuation ? '' : group.width || ''}</td>
            <td style="border-right:1px solid #000; white-space:pre-line; vertical-align:top;">${rollNosHtml}</td>
            <td style="border-right:1px solid #000; white-space:pre-line; vertical-align:top;">${shadesHtml}</td>
            <td style="white-space:pre-line; vertical-align:top;">${metersCell}</td>
          </tr>`;
                }

                const rateCell = group.showGroupTotal
                    ? `<div style="font-size:18px;line-height:10px;padding-bottom:10px;">______</div>${group.price || ''}`
                    : '';
                const amountCell = group.showGroupTotal
                    ? `<div style="font-size:18px;line-height:10px;padding-bottom:10px;">_______</div>${formatCurrency(group.total_amount) || ''}`
                    : '';

                return `
          <tr>
            <td style="border-right:1px solid #000; vertical-align:top;">${rollsLabel}</td>
            <td style="border-right:1px solid #000; vertical-align:top;">${sortLabel}</td>
            <td style="border-right:1px solid #000; vertical-align:top;">${group.isContinuation ? '' : group.width || ''}</td>
            <td style="border-right:1px solid #000; white-space:pre-line; vertical-align:top;">${rollNosHtml}</td>
            <td style="border-right:1px solid #000; white-space:pre-line; vertical-align:top;">${shadesHtml}</td>
            <td style="border-right:1px solid #000; white-space:pre-line; vertical-align:top;">${metersCell}</td>
            <td style="border-right:1px solid #000; vertical-align:bottom;">${rateCell}</td>
            <td style="text-align: right; vertical-align:bottom;">${amountCell}</td>
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

    const continuedFooter = isChallan
        ? `
        <tr style="border-top:1px solid #000;">
          <td colspan="6" style="font-weight: bold;text-align: center;padding: 10px;">Continued on next page...</td>
        </tr>`
        : `
        <tr style="border-top:1px solid #000;">
          <td colspan="8" style="font-weight: bold;text-align: center;padding: 10px;">Continued on next page...</td>
        </tr>`;

    const pageHtml = pages
        .map((pageChunks, pageIndex) => {
            const isLastPage = pageIndex === pages.length - 1;
            const pageNo = pageIndex + 1;
            const pageCount = pages.length;

            return `
      <div class="page">
      <div class="header">
        <div class="sub-header">${heading}</div>
        <div class="company-name">MOHIT TRADERS</div>
        <div>ULHASNAGAR 421005</div>
        ${
            pageCount > 1
                ? `<div class="page-no">Page ${pageNo} of ${pageCount}</div>`
                : ''
        }
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
      <div class="table-wrap">
      <table class="items-table">
        <colgroup>${colgroup}</colgroup>
        <thead>
          ${headerRow}
        </thead>
        <tbody>
        ${renderItemRows(pageChunks)}
        </tbody>
      </table>
      <div class="table-fill">${fillCols}</div>
      <table class="footer-table">
        <colgroup>${colgroup}</colgroup>
        <tbody>
        ${isLastPage ? footerRows : continuedFooter}
        </tbody>
      </table>
      </div>
      ${
          isLastPage && isChallan
              ? `
      <div class="challan-note">
        कृपया हर एक रोल काटने से पहले कपड़ा अच्छी तरह से परख लें<br/>
        रोल काटने के बाद हमारी किसी भी प्रकार की जिम्मेदारी नहीं है।
      </div>`
              : ''
      }
      </div>`;
        })
        .join('');

    return `
    <html>
    <head>
      <style>
        @page { size: A4; margin: 0; }
        html, body {
          margin: 0;
          padding: 0;
          width: 210mm;
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
          page-break-after: always;
          break-after: page;
        }
        .page:last-child {
          page-break-after: auto;
          break-after: auto;
        }
        .header {
          border: 1px solid #000;
          text-align: center;
          padding: 10px;
          flex-shrink: 0;
          position: relative;
        }
        .page-no {
          position: absolute;
          right: 10px;
          top: 8px;
          font-size: 12px;
          font-weight: 700;
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
        .challan-note {
          flex-shrink: 0;
          margin-top: 6px;
          border: 1px solid #000;
          padding: 8px 10px;
          font-size: 14px;
          font-weight: 700;
          line-height: 1.45;
          text-align: left;
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
      ${pageHtml}
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
