const { getDueDate, getOverdueDays } = require('./creditDays');

function round2(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}

function eventTime(date, createdAt) {
    const primary = date ? new Date(date).getTime() : 0;
    const secondary = createdAt ? new Date(createdAt).getTime() : 0;
    return primary + secondary / 1e12;
}

/**
 * FIFO-allocate payments-out and unlinked purchase returns against each
 * supplier's bills. Opening balance is settled first so purchase outstanding
 * is not understated. Linked returns reduce that purchase before allocation.
 *
 * Returns Map<purchaseId, { remaining_amount, cleared_amount, payment_status }>
 */
function allocatePurchaseOutstanding({ purchases, payments, purchaseReturns, suppliers }) {
    const remainingById = new Map();
    const purchasesBySupplier = new Map();
    const paymentsBySupplier = new Map();
    const returnsBySupplier = new Map();
    const supplierById = new Map((suppliers || []).map((supplier) => [supplier.id, supplier]));

    for (const purchase of purchases || []) {
        if (!purchasesBySupplier.has(purchase.supplier_id)) {
            purchasesBySupplier.set(purchase.supplier_id, []);
        }
        purchasesBySupplier.get(purchase.supplier_id).push(purchase);
        remainingById.set(purchase.id, {
            remaining_amount: round2(purchase.total),
            cleared_amount: 0,
            payment_status: 'UNPAID',
        });
    }

    for (const payment of payments || []) {
        if (!paymentsBySupplier.has(payment.supplier_id)) {
            paymentsBySupplier.set(payment.supplier_id, []);
        }
        paymentsBySupplier.get(payment.supplier_id).push(payment);
    }

    for (const purchaseReturn of purchaseReturns || []) {
        if (!returnsBySupplier.has(purchaseReturn.supplier_id)) {
            returnsBySupplier.set(purchaseReturn.supplier_id, []);
        }
        returnsBySupplier.get(purchaseReturn.supplier_id).push(purchaseReturn);
    }

    const supplierIds = new Set([
        ...purchasesBySupplier.keys(),
        ...paymentsBySupplier.keys(),
        ...returnsBySupplier.keys(),
        ...supplierById.keys(),
    ]);

    for (const supplierId of supplierIds) {
        const supplierPurchases = (purchasesBySupplier.get(supplierId) || [])
            .slice()
            .sort((a, b) => eventTime(a.date, a.created_at) - eventTime(b.date, b.created_at));

        const linkedReturnLeftover = [];
        for (const purchaseReturn of returnsBySupplier.get(supplierId) || []) {
            const amount = round2(purchaseReturn.total);
            if (!amount) continue;

            if (purchaseReturn.purchase_id && remainingById.has(purchaseReturn.purchase_id)) {
                const current = remainingById.get(purchaseReturn.purchase_id);
                const applied = Math.min(current.remaining_amount, amount);
                current.remaining_amount = round2(current.remaining_amount - applied);
                const leftover = round2(amount - applied);
                if (leftover > 0) {
                    linkedReturnLeftover.push({
                        amount: leftover,
                        date: purchaseReturn.date,
                        created_at: purchaseReturn.created_at,
                    });
                }
            } else {
                linkedReturnLeftover.push({
                    amount,
                    date: purchaseReturn.date,
                    created_at: purchaseReturn.created_at,
                });
            }
        }

        const credits = [
            ...(paymentsBySupplier.get(supplierId) || []).map((payment) => ({
                amount: round2(payment.amount),
                date: payment.payment_date,
                created_at: payment.created_at,
            })),
            ...linkedReturnLeftover,
        ]
            .filter((credit) => credit.amount > 0)
            .sort((a, b) => eventTime(a.date, a.created_at) - eventTime(b.date, b.created_at));

        let creditPool = credits.reduce((sum, credit) => round2(sum + credit.amount), 0);
        const supplier = supplierById.get(supplierId);
        const openingBalance = round2(supplier?.opening_balance);
        if (openingBalance > 0) {
            creditPool = round2(Math.max(0, creditPool - openingBalance));
        }

        for (const purchase of supplierPurchases) {
            const current = remainingById.get(purchase.id);
            if (!current || current.remaining_amount <= 0 || creditPool <= 0) continue;
            const applied = Math.min(current.remaining_amount, creditPool);
            current.remaining_amount = round2(current.remaining_amount - applied);
            creditPool = round2(creditPool - applied);
        }

        for (const purchase of supplierPurchases) {
            const current = remainingById.get(purchase.id);
            if (!current) continue;
            const total = round2(purchase.total);
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

function attachPurchaseOutstanding(purchase, allocation) {
    const remainingAmount = allocation
        ? allocation.remaining_amount
        : round2(purchase.total);
    const paymentStatus = allocation?.payment_status || 'UNPAID';
    const clearedAmount = allocation?.cleared_amount || 0;

    return {
        ...purchase,
        cleared_amount: clearedAmount,
        remaining_amount: remainingAmount,
        payment_status: paymentStatus,
        due_date: getDueDate(purchase.date, purchase.credit_days || 0),
        overdue_days: getOverdueDays(
            purchase.date,
            purchase.credit_days || 0,
            remainingAmount
        ),
    };
}

module.exports = {
    allocatePurchaseOutstanding,
    attachPurchaseOutstanding,
};
