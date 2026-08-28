const MIN_ROW_COUNT = 10;
module.exports = (invoiceData) => {
        // Group items by name, width, price
        const grouped = {};
        invoiceData.items.forEach((item) => {
            // Normalize fields for robust grouping
            const name = (item.name + " - " + item.grade || "").trim().toLowerCase();
            const width = (item.width || "").trim();
            const price = parseFloat(item.price);
            const key = `${name}||${width}||${price}`;
            if (!grouped[key]) {
                grouped[key] = {
                    name: item.name + " - " + item.grade,
                    width: item.width,
                    price: item.price,
                    roll_nos: [],
                    meters: [],
                    total_mts: 0,
                    total_amount: 0,
                };
            }
            grouped[key].roll_nos.push(item.roll_no);
            grouped[key].meters.push(parseFloat(item.mts || 0));
            grouped[key].total_mts += parseFloat(item.mts || 0);
            grouped[key].total_amount += parseFloat(item.amount || 0);
        });
        const groupedItems = Object.values(grouped);

        // Calculate total meters
        const totalMeters = groupedItems.reduce(
            (sum, group) => sum + group.total_mts,
            0
        );

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



        const actualTotal = invoiceData.items.reduce((sum, item) => sum + item.amount, 0) || 0;
        const roundedTotal = Math.round(actualTotal);
        const roundOff = (roundedTotal - actualTotal).toFixed(2);


        return `
    <html>
    <head>
      <style>
        body {
          font-family: Arial, sans-serif;
          padding: 40px;
          color: #333;
        }
        .header {
          border: 1px solid #000;
          text-align: center;
          padding: 10px;
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
        table {
          width: 100%;
          border-collapse: collapse;
          border: 1px solid #000;
          border-top: none;
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
            tbody tr td{
              font-size: 21px;
              font-weight: 700;
            
            }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="sub-header">ON APPROVAL / DELIVERY CHALLAN</div>
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
      <table>
        <thead>
          <tr id="heading">
            <th style="border-right:1px solid #000;border-bottom:1px solid #000;">Rolls</th>
            <th style="border-right:1px solid #000;border-bottom:1px solid #000;">Sort No.</th>
            <th style="border-right:1px solid #000;border-bottom:1px solid #000;">Width</th>
            <th style="border-right:1px solid #000;border-bottom:1px solid #000;">Roll No.</th>
            <th style="border-right:1px solid #000;border-bottom:1px solid #000;">MTS</th>
            <th style="border-right:1px solid #000;border-bottom:1px solid #000;">Rate</th>
            <th style="border-bottom:1px solid #000;">Amount</th>
          </tr>
        </thead>
        <tbody>
        ${groupedItems
          .map((group, i) => {
            const rollNosHtml = group.roll_nos
              .map((roll) => `<div>${roll}</div>`)
              .join("");
            const metersHtml = group.meters
              .map((m) => `<div>${m.toFixed(2)}</div>`)
              .join("");
            return `
          <tr>
            <td style=\"border-right:1px solid #000; vertical-align:top;\">${
              group.roll_nos.length
            }</td>
            <td style=\"border-right:1px solid #000; vertical-align:top;\">${
              group.name || ""
            }</td>
            <td style=\"border-right:1px solid #000; vertical-align:top;\">${
              group.width || ""
            }</td>
            <td style=\"border-right:1px solid #000; white-space:pre-line; vertical-align:top;\">${rollNosHtml}</td>
            <td style=\"border-right:1px solid #000; white-space:pre-line; vertical-align:top;\">${metersHtml}<div style=\"font-size:18px;line-height:10px;padding-bottom:10px;\">________</div><div style=\"font-weight:bold;\">${group.total_mts.toFixed(
              2
            )}</div></td>
            <td style=\"border-right:1px solid #000; vertical-align:bottom;\"><div style=\"font-size:18px;line-height:10px;padding-bottom:10px;\">______</div>${
              group.price || ""
            }</td>
            <td style=\"text-align: right; vertical-align:bottom;\"><div style=\"font-size:18px;line-height:10px;padding-bottom:10px;\">_______</div>${
              formatCurrency(group.total_amount) || ""
            }</td>
          </tr>
          `;
          })
          .join("")}
        ${Array.from(
          { length: Math.max(0, MIN_ROW_COUNT - totalRollCount) },
          (_, i) => `
          <tr>
            <td style="border-right:1px solid #000;">&nbsp;</td>
            <td style="border-right:1px solid #000;">&nbsp;</td>
            <td style="border-right:1px solid #000;">&nbsp;</td>
            <td style="border-right:1px solid #000;">&nbsp;</td>
            <td style="border-right:1px solid #000;">&nbsp;</td>
            <td style="border-right:1px solid #000;">&nbsp;</td>
            <td>&nbsp;</td>
          </tr>
        `
        ).join("")}
        <tbody>
      <tr style="border-top:1px solid #000;">
        <td colspan="4" style="border-right:1px solid #000;border-bottom:1px solid #000;font-weight: bold;text-align: right;">Total Mtr. : ${totalMeters.toFixed(
          2
        )}</td>
        <td colspan="2" style="font-weight: bold;border-right:1px solid #000;border-bottom:1px solid #000;">Sub Total</td>
        <td style="text-align: right;border-bottom:1px solid #000;">${formatCurrency(
          actualTotal || 0
        )}</td>
        </tr>
        <tr>
          <td colspan="4" rowspan="3" style="border-right:1px solid #000;font-weight: bold;text-align: right;">${
            convertNumberToWords(roundedTotal) || ""
          }</td>
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
        </tr>
      </table>
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
    const scales = ['', 'Thousand', 'Lakh', 'Crore'];

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