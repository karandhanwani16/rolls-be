const { getDueDate, getElapsedDays, getOverdueDays } = require('./creditDays');
const { customerCreditAmount } = require('../services/paymentInService');

function round2(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}

function eventTime(date, createdAt) {
    const primary = date ? new Date(date).getTime() : 0;
    const secondary = createdAt ? new Date(createdAt).getTime() : 0;
    return primary + secondary / 1e12;
}

function isCustomerLedgerPayment(payment) {
    if (!payment?.actual_id) return false;
    if (payment.payment_category === 'VATAV' && payment.entry_type === 'STANDALONE') {
        return false;
    }
    return true;
}

/**
 * FIFO-allocate customer payments-in and unlinked sale returns against each
 * customer's sales. Opening balance is settled first so sale outstanding is not
 * understated. Linked returns reduce that sale before allocation. Payments with
 * sale_id are applied to that bill first; any leftover joins the FIFO pool.
 *
 * Returns Map<saleId, { remaining_amount, cleared_amount, payment_status }>
 */
function allocateSaleOutstanding({ sales, payments, saleReturns, customers }) {
    const remainingById = new Map();
    const salesByCustomer = new Map();
    const paymentsByCustomer = new Map();
    const returnsByCustomer = new Map();
    const customerById = new Map((customers || []).map((customer) => [customer.id, customer]));

    for (const sale of sales || []) {
        if (!salesByCustomer.has(sale.customer_id)) {
            salesByCustomer.set(sale.customer_id, []);
        }
        salesByCustomer.get(sale.customer_id).push(sale);
        remainingById.set(sale.id, {
            remaining_amount: round2(sale.total),
            cleared_amount: 0,
            payment_status: 'UNPAID',
        });
    }

    for (const payment of payments || []) {
        if (!isCustomerLedgerPayment(payment)) continue;
        if (!paymentsByCustomer.has(payment.actual_id)) {
            paymentsByCustomer.set(payment.actual_id, []);
        }
        paymentsByCustomer.get(payment.actual_id).push(payment);
    }

    for (const saleReturn of saleReturns || []) {
        if (!returnsByCustomer.has(saleReturn.customer_id)) {
            returnsByCustomer.set(saleReturn.customer_id, []);
        }
        returnsByCustomer.get(saleReturn.customer_id).push(saleReturn);
    }

    const customerIds = new Set([
        ...salesByCustomer.keys(),
        ...paymentsByCustomer.keys(),
        ...returnsByCustomer.keys(),
        ...customerById.keys(),
    ]);

    for (const customerId of customerIds) {
        const customerSales = (salesByCustomer.get(customerId) || [])
            .slice()
            .sort((a, b) => eventTime(a.date, a.created_at) - eventTime(b.date, b.created_at));

        const linkedReturnLeftover = [];
        for (const saleReturn of returnsByCustomer.get(customerId) || []) {
            const amount = round2(saleReturn.total);
            if (!amount) continue;

            if (saleReturn.sale_id && remainingById.has(saleReturn.sale_id)) {
                const current = remainingById.get(saleReturn.sale_id);
                const applied = Math.min(current.remaining_amount, amount);
                current.remaining_amount = round2(current.remaining_amount - applied);
                const leftover = round2(amount - applied);
                if (leftover > 0) {
                    linkedReturnLeftover.push({
                        amount: leftover,
                        date: saleReturn.date,
                        created_at: saleReturn.created_at,
                    });
                }
            } else {
                linkedReturnLeftover.push({
                    amount,
                    date: saleReturn.date,
                    created_at: saleReturn.created_at,
                });
            }
        }

        const fifoCredits = [];
        for (const payment of paymentsByCustomer.get(customerId) || []) {
            const amount = round2(customerCreditAmount(payment));
            if (!amount) continue;

            if (payment.sale_id && remainingById.has(payment.sale_id)) {
                const current = remainingById.get(payment.sale_id);
                const applied = Math.min(current.remaining_amount, amount);
                current.remaining_amount = round2(current.remaining_amount - applied);
                const leftover = round2(amount - applied);
                if (leftover > 0) {
                    fifoCredits.push({
                        amount: leftover,
                        date: payment.payment_date || payment.created_at,
                        created_at: payment.created_at,
                    });
                }
            } else {
                fifoCredits.push({
                    amount,
                    date: payment.payment_date || payment.created_at,
                    created_at: payment.created_at,
                });
            }
        }

        const credits = [...fifoCredits, ...linkedReturnLeftover]
            .filter((credit) => credit.amount > 0)
            .sort((a, b) => eventTime(a.date, a.created_at) - eventTime(b.date, b.created_at));

        let creditPool = credits.reduce((sum, credit) => round2(sum + credit.amount), 0);
        const customer = customerById.get(customerId);
        const openingBalance = round2(customer?.opening_balance);
        if (openingBalance > 0) {
            creditPool = round2(Math.max(0, creditPool - openingBalance));
        }

        for (const sale of customerSales) {
            const current = remainingById.get(sale.id);
            if (!current || current.remaining_amount <= 0 || creditPool <= 0) continue;
            const applied = Math.min(current.remaining_amount, creditPool);
            current.remaining_amount = round2(current.remaining_amount - applied);
            creditPool = round2(creditPool - applied);
        }

        for (const sale of customerSales) {
            const current = remainingById.get(sale.id);
            if (!current) continue;
            const total = round2(sale.total);
            current.cleared_amount = round2(Math.max(0, total - current.remaining_amount));
            if (current.remaining_amount <= 0) {
                current.payment_status = 'FULL';
                current.remaining_amount = 0;
            } else if (current.remaining_amount < total) {
                current.payment_status = 'PARTIAL';
            } else {
                current.payment_status = 'UNPAID';
            }
        }
    }

    return remainingById;
}

function attachSaleOutstanding(sale, allocation) {
    const remainingAmount = allocation
        ? allocation.remaining_amount
        : round2(sale.total);
    const paymentStatus = allocation?.payment_status || 'UNPAID';
    const clearedAmount = allocation?.cleared_amount || 0;

    return {
        ...sale,
        cleared_amount: clearedAmount,
        remaining_amount: remainingAmount,
        payment_status: paymentStatus,
        due_date: getDueDate(sale.date, sale.credit_days || 0),
        elapsed_days: getElapsedDays(sale.date),
        overdue_days: getOverdueDays(
            sale.date,
            sale.credit_days || 0,
            remainingAmount
        ),
    };
}

module.exports = {
    allocateSaleOutstanding,
    attachSaleOutstanding,
    isCustomerLedgerPayment,
};
