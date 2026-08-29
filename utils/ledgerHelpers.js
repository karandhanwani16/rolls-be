function parseDateStart(dateStr) {
    return new Date(dateStr + 'T00:00:00.000Z');
}

function parseDateEnd(dateStr) {
    const date = new Date(dateStr + 'T23:59:59.999Z');
    return date;
}

function dayBeforeDateStr(dateStr) {
    const date = parseDateStart(dateStr);
    date.setUTCDate(date.getUTCDate() - 1);
    return date;
}

function toDateStr(date) {
    return date.toISOString().slice(0, 10);
}

function balanceToDebitCredit(balance, positiveSide = 'debit') {
    if (balance === 0) {
        return { debit: 0, credit: 0 };
    }
    if (balance > 0) {
        return positiveSide === 'debit'
            ? { debit: balance, credit: 0 }
            : { debit: 0, credit: balance };
    }
    return positiveSide === 'debit'
        ? { debit: 0, credit: Math.abs(balance) }
        : { debit: Math.abs(balance), credit: 0 };
}

function computeNetFromRows(rows) {
    return rows.reduce((sum, row) => sum + row.debit - row.credit, 0);
}

function addRunningBalance(rows) {
    let running = 0;
    return rows.map((row) => {
        running += row.debit - row.credit;
        return { ...row, balance: running };
    });
}

function sortLedgerRows(rows) {
    return rows.sort((a, b) => {
        const dateDiff = new Date(a.date) - new Date(b.date);
        if (dateDiff !== 0) {
            return dateDiff;
        }
        if (a.isOpeningBalance && !b.isOpeningBalance) return -1;
        if (!a.isOpeningBalance && b.isOpeningBalance) return 1;
        if (a.isBroughtForward && !b.isBroughtForward) return -1;
        if (!a.isBroughtForward && b.isBroughtForward) return 1;
        return 0;
    });
}

function buildLedgerWithOpeningBalance({
    partyName,
    openingBalance,
    openingBalanceDate,
    startDate,
    endDate,
    periodRows,
    prePeriodRows,
    positiveBalanceSide = 'debit',
}) {
    const rangeStart = parseDateStart(startDate);
    const rangeEnd = parseDateEnd(endDate);
    const obAmount = openingBalance || 0;
    const obDate = openingBalanceDate ? new Date(openingBalanceDate) : null;
    const obDateStr = obDate ? toDateStr(obDate) : null;

    const rows = [];

    if (obDate && obAmount !== 0 && obDate <= rangeEnd) {
        if (obDateStr >= startDate && obDateStr <= endDate) {
            const { debit, credit } = balanceToDebitCredit(obAmount, positiveBalanceSide);
            rows.push({
                date: obDate,
                particulars: `Opening Balance - ${partyName}`,
                voucherNo: '-',
                debit,
                credit,
                isOpeningBalance: true,
            });
        } else if (obDate < rangeStart) {
            const prePeriodNet = computeNetFromRows(prePeriodRows);
            const broughtForward = obAmount + prePeriodNet;
            if (broughtForward !== 0) {
                const { debit, credit } = balanceToDebitCredit(broughtForward, positiveBalanceSide);
                rows.push({
                    date: rangeStart,
                    particulars: `Opening Balance (B/F) - ${partyName}`,
                    voucherNo: '-',
                    debit,
                    credit,
                    isBroughtForward: true,
                });
            }
        }
    }

    const filteredPeriodRows = periodRows.filter((row) => {
        if (!obDate) return true;
        return new Date(row.date) >= obDate;
    });

    rows.push(...filteredPeriodRows);

    const sorted = sortLedgerRows(rows);
    const withBalance = addRunningBalance(sorted);

    const openingBalanceAtStart = withBalance.length > 0
        ? (withBalance[0].isBroughtForward
            ? withBalance[0].balance
            : withBalance[0].balance - (withBalance[0].debit - withBalance[0].credit))
        : 0;
    const closingBalance = withBalance.length > 0
        ? withBalance[withBalance.length - 1].balance
        : openingBalanceAtStart;

    const movementRows = withBalance.filter((row) => !row.isOpeningBalance && !row.isBroughtForward);
    const totalDebit = movementRows.reduce((sum, row) => sum + row.debit, 0);
    const totalCredit = movementRows.reduce((sum, row) => sum + row.credit, 0);

    return {
        rows: withBalance,
        summary: {
            openingBalance: openingBalanceAtStart,
            closingBalance,
            totalDebit,
            totalCredit,
        },
    };
}

module.exports = {
    parseDateStart,
    parseDateEnd,
    dayBeforeDateStr,
    balanceToDebitCredit,
    computeNetFromRows,
    addRunningBalance,
    sortLedgerRows,
    buildLedgerWithOpeningBalance,
};
