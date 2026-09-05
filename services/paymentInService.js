const prisma = require('../prisma/client');
const transactionService = require('./transactions');

const PAYMENT_CATEGORY = {
    NORMAL: 'NORMAL',
    VATAV: 'VATAV',
};

const ENTRY_TYPE = {
    CUSTOMER_PAYMENT: 'CUSTOMER_PAYMENT',
    STANDALONE: 'STANDALONE',
};

const COLLECTION_STATUS = {
    PENDING: 'PENDING',
    COLLECTED: 'COLLECTED',
};

/**
 * Amount credited to the customer's ledger for a payment.
 * NORMAL → full payment (actual_amount / received_amount).
 * VATAV customer payment → full gross (received_amount), not net after charges.
 * Standalone → 0 (no customer).
 */
function customerCreditAmount(payment) {
    if (!payment.actual_id) return 0;
    if (payment.payment_category === PAYMENT_CATEGORY.VATAV) {
        if (payment.entry_type === ENTRY_TYPE.STANDALONE) return 0;
        return payment.received_amount || 0;
    }
    return payment.actual_amount ?? payment.received_amount ?? 0;
}

function normalizePaymentPayload(paymentInData) {
    const category = (paymentInData.payment_category || PAYMENT_CATEGORY.NORMAL).toUpperCase();
    const received = Number(paymentInData.received_amount) || 0;
    const charges = Number(paymentInData.charges) || 0;

    if (received <= 0) {
        throw new Error('Gross / received amount must be greater than 0');
    }
    if (charges < 0) {
        throw new Error('Charges cannot be negative');
    }
    if (charges > received) {
        throw new Error('Charges cannot exceed the gross amount');
    }

    if (category === PAYMENT_CATEGORY.NORMAL) {
        const customerId = paymentInData.actual_id || paymentInData.receive_id;
        if (!customerId) {
            throw new Error('Customer is required for a normal payment');
        }
        return {
            payment_category: PAYMENT_CATEGORY.NORMAL,
            entry_type: null,
            collection_status: null,
            collection_date: null,
            receive_id: customerId,
            actual_id: customerId,
            received_amount: received,
            charges: 0,
            actual_amount: received,
            type: paymentInData.type,
            description: paymentInData.description || '',
            payment_date: paymentInData.payment_date,
        };
    }

    if (category !== PAYMENT_CATEGORY.VATAV) {
        throw new Error('payment_category must be NORMAL or VATAV');
    }

    const entryType = (paymentInData.entry_type || ENTRY_TYPE.CUSTOMER_PAYMENT).toUpperCase();
    if (![ENTRY_TYPE.CUSTOMER_PAYMENT, ENTRY_TYPE.STANDALONE].includes(entryType)) {
        throw new Error('entry_type must be CUSTOMER_PAYMENT or STANDALONE for VATAV');
    }

    const vendorId = paymentInData.receive_id;
    if (!vendorId) {
        throw new Error('Watav vendor is required for a VATAV entry');
    }

    let actualId = paymentInData.actual_id || null;
    if (entryType === ENTRY_TYPE.CUSTOMER_PAYMENT) {
        if (!actualId) {
            throw new Error('Customer is required for a VATAV customer payment');
        }
        if (actualId === vendorId) {
            throw new Error('Customer and Watav vendor must be different');
        }
    } else {
        // Standalone — never linked to a customer
        actualId = null;
    }

    let collectionStatus = (paymentInData.collection_status || COLLECTION_STATUS.PENDING).toUpperCase();
    if (![COLLECTION_STATUS.PENDING, COLLECTION_STATUS.COLLECTED].includes(collectionStatus)) {
        throw new Error('collection_status must be PENDING or COLLECTED');
    }

    let collectionDate = null;
    if (collectionStatus === COLLECTION_STATUS.COLLECTED) {
        collectionDate = paymentInData.collection_date
            ? new Date(paymentInData.collection_date)
            : new Date();
    }

    return {
        payment_category: PAYMENT_CATEGORY.VATAV,
        entry_type: entryType,
        collection_status: collectionStatus,
        collection_date: collectionDate,
        receive_id: vendorId,
        actual_id: actualId,
        received_amount: received,
        charges,
        actual_amount: received - charges,
        type: paymentInData.type || 'other',
        description: paymentInData.description || '',
        payment_date: paymentInData.payment_date,
    };
}

function paymentCreateData(normalized) {
    return {
        received_amount: normalized.received_amount,
        actual_amount: normalized.actual_amount,
        charges: normalized.charges,
        type: normalized.type,
        description: normalized.description,
        payment_date: normalized.payment_date,
        payment_category: normalized.payment_category,
        entry_type: normalized.entry_type,
        collection_status: normalized.collection_status,
        collection_date: normalized.collection_date,
        ...(normalized.receive_id
            ? { receive_customer: { connect: { id: normalized.receive_id } } }
            : {}),
        ...(normalized.actual_id
            ? { actual_customer: { connect: { id: normalized.actual_id } } }
            : {}),
    };
}

class PaymentInService {
    async getAllPaymentsIn() {
        try {
            const paymentsIn = await prisma.paymentIn.findMany({
                include: {
                    receive_customer: true,
                    actual_customer: true,
                },
                orderBy: {
                    created_at: 'desc',
                },
            });
            return paymentsIn;
        } catch (error) {
            throw new Error(`Failed to fetch payments in: ${error.message}`);
        }
    }

    async getPaymentInById(id) {
        try {
            const paymentIn = await prisma.paymentIn.findUnique({
                where: { id },
                include: {
                    receive_customer: true,
                    actual_customer: true,
                },
            });

            if (!paymentIn) {
                throw new Error(`Payment in with ID ${id} not found`);
            }

            return paymentIn;
        } catch (error) {
            throw new Error(`Failed to fetch payment in: ${error.message}`);
        }
    }

    async createPaymentIn(paymentInData) {
        try {
            const normalized = normalizePaymentPayload(paymentInData);

            const newPaymentIn = await prisma.paymentIn.create({
                data: paymentCreateData(normalized),
                include: {
                    receive_customer: true,
                    actual_customer: true,
                },
            });

            const credit = customerCreditAmount(newPaymentIn);
            if (credit > 0 && newPaymentIn.actual_id) {
                const label =
                    newPaymentIn.payment_category === PAYMENT_CATEGORY.VATAV
                        ? `Watav payment from ${newPaymentIn.actual_customer?.name || 'Customer'}`
                        : `Payment received from ${newPaymentIn.actual_customer?.name || 'Customer'}`;
                await transactionService.createTransactionRecord(
                    'incoming',
                    label,
                    newPaymentIn.actual_id,
                    null,
                    credit
                );
            }

            return newPaymentIn;
        } catch (error) {
            throw new Error(`Failed to create payment in: ${error.message}`);
        }
    }

    async updatePaymentIn(id, paymentInData) {
        try {
            const existing = await prisma.paymentIn.findUnique({ where: { id } });
            if (!existing) {
                throw new Error(`Payment in with ID ${id} not found`);
            }

            const normalized = normalizePaymentPayload({
                ...existing,
                ...paymentInData,
            });

            const updatedPaymentIn = await prisma.paymentIn.update({
                where: { id },
                data: {
                    received_amount: normalized.received_amount,
                    actual_amount: normalized.actual_amount,
                    charges: normalized.charges,
                    type: normalized.type,
                    description: normalized.description,
                    payment_date: normalized.payment_date,
                    payment_category: normalized.payment_category,
                    entry_type: normalized.entry_type,
                    collection_status: normalized.collection_status,
                    collection_date: normalized.collection_date,
                    receive_id: normalized.receive_id,
                    actual_id: normalized.actual_id,
                },
                include: {
                    receive_customer: true,
                    actual_customer: true,
                },
            });

            const credit = customerCreditAmount(updatedPaymentIn);
            if (credit > 0 && updatedPaymentIn.actual_id) {
                await transactionService.createTransactionRecord(
                    'incoming',
                    `Payment updated for ${updatedPaymentIn.actual_customer?.name || 'Customer'}`,
                    updatedPaymentIn.actual_id,
                    null,
                    credit
                );
            }

            return updatedPaymentIn;
        } catch (error) {
            throw new Error(`Failed to update payment in: ${error.message}`);
        }
    }

    async deletePaymentIn(id) {
        try {
            const paymentIn = await prisma.paymentIn.findUnique({
                where: { id },
                include: {
                    actual_customer: true,
                },
            });

            if (!paymentIn) {
                throw new Error(`Payment in with ID ${id} not found`);
            }

            const credit = customerCreditAmount(paymentIn);
            if (credit > 0 && paymentIn.actual_id) {
                await transactionService.createTransactionRecord(
                    'outgoing',
                    `Payment deleted for ${paymentIn.actual_customer?.name || 'Customer'}`,
                    paymentIn.actual_id,
                    null,
                    credit
                );
            }

            await prisma.paymentIn.delete({
                where: { id },
            });
            return { success: true, message: 'Payment in deleted successfully' };
        } catch (error) {
            throw new Error(`Failed to delete payment in: ${error.message}`);
        }
    }

    /**
     * Mark one or more VATAV entries as collected (batch collection from a vendor).
     */
    async collectWatavEntries({ ids, collection_date }) {
        if (!Array.isArray(ids) || ids.length === 0) {
            throw new Error('At least one payment id is required');
        }

        const collectionDate = collection_date ? new Date(collection_date) : new Date();

        const result = await prisma.paymentIn.updateMany({
            where: {
                id: { in: ids },
                payment_category: PAYMENT_CATEGORY.VATAV,
            },
            data: {
                collection_status: COLLECTION_STATUS.COLLECTED,
                collection_date: collectionDate,
            },
        });

        return {
            updated: result.count,
            collection_date: collectionDate,
            collection_status: COLLECTION_STATUS.COLLECTED,
        };
    }

    /**
     * Mark VATAV entries as pending again (undo collection).
     */
    async uncollectWatavEntries({ ids }) {
        if (!Array.isArray(ids) || ids.length === 0) {
            throw new Error('At least one payment id is required');
        }

        const result = await prisma.paymentIn.updateMany({
            where: {
                id: { in: ids },
                payment_category: PAYMENT_CATEGORY.VATAV,
            },
            data: {
                collection_status: COLLECTION_STATUS.PENDING,
                collection_date: null,
            },
        });

        return {
            updated: result.count,
            collection_status: COLLECTION_STATUS.PENDING,
        };
    }

    /**
     * Dedicated Watav report: pending / collected / vendor accounts.
     * Includes both customer-linked and standalone entries.
     */
    async getWatavReport({ startDate, endDate, watavCustomerId, collectionStatus, entryType }) {
        try {
            const dateFilter = {};
            if (startDate) {
                dateFilter.gte = new Date(startDate + 'T00:00:00.000Z');
            }
            if (endDate) {
                dateFilter.lte = new Date(endDate + 'T23:59:59.999Z');
            }

            const where = {
                payment_category: PAYMENT_CATEGORY.VATAV,
                ...(Object.keys(dateFilter).length > 0 ? { payment_date: dateFilter } : {}),
                ...(watavCustomerId ? { receive_id: watavCustomerId } : { receive_id: { not: null } }),
                ...(collectionStatus ? { collection_status: collectionStatus.toUpperCase() } : {}),
                ...(entryType ? { entry_type: entryType.toUpperCase() } : {}),
            };

            // Also include legacy watav rows not yet backfilled (receive !== actual)
            // if payment_category filter alone would miss them — migration handles backfill;
            // keep category filter as source of truth after migration.

            const payments = await prisma.paymentIn.findMany({
                where,
                include: {
                    receive_customer: true,
                    actual_customer: true,
                },
                orderBy: {
                    payment_date: 'asc',
                },
            });

            const transactions = payments.map((payment, index) => {
                const isStandalone = payment.entry_type === ENTRY_TYPE.STANDALONE || !payment.actual_id;
                return {
                    srno: index + 1,
                    id: payment.id,
                    date: payment.payment_date || payment.created_at,
                    watavCustomerId: payment.receive_id,
                    watavCustomerName: payment.receive_customer?.name || 'Unknown',
                    actualCustomerId: payment.actual_id,
                    actualCustomerName: isStandalone
                        ? null
                        : payment.actual_customer?.name || 'Unknown',
                    entryType: isStandalone ? ENTRY_TYPE.STANDALONE : ENTRY_TYPE.CUSTOMER_PAYMENT,
                    collectionStatus: payment.collection_status || COLLECTION_STATUS.PENDING,
                    collectionDate: payment.collection_date,
                    receivedAmount: payment.received_amount || 0,
                    paidToWatav: payment.charges || 0,
                    vendorCharges: payment.charges || 0,
                    actualAmount: payment.actual_amount || 0,
                    netAmount: payment.actual_amount || 0,
                    type: payment.type,
                    description: payment.description || '',
                };
            });

            const emptyVendor = (id, name) => ({
                watavCustomerId: id,
                watavCustomerName: name,
                entries: 0,
                customerLinkedEntries: 0,
                standaloneEntries: 0,
                totalReceived: 0,
                totalPaidToWatav: 0,
                totalActualAmount: 0,
                pendingGross: 0,
                pendingNet: 0,
                pendingCharges: 0,
                pendingEntries: 0,
                collectedGross: 0,
                collectedNet: 0,
                collectedCharges: 0,
                collectedEntries: 0,
                customerLinkedGross: 0,
                standaloneGross: 0,
            });

            const byWatav = {};
            for (const row of transactions) {
                if (!byWatav[row.watavCustomerId]) {
                    byWatav[row.watavCustomerId] = emptyVendor(
                        row.watavCustomerId,
                        row.watavCustomerName
                    );
                }
                const bucket = byWatav[row.watavCustomerId];
                bucket.entries += 1;
                bucket.totalReceived += row.receivedAmount;
                bucket.totalPaidToWatav += row.paidToWatav;
                bucket.totalActualAmount += row.actualAmount;

                if (row.entryType === ENTRY_TYPE.STANDALONE) {
                    bucket.standaloneEntries += 1;
                    bucket.standaloneGross += row.receivedAmount;
                } else {
                    bucket.customerLinkedEntries += 1;
                    bucket.customerLinkedGross += row.receivedAmount;
                }

                if (row.collectionStatus === COLLECTION_STATUS.COLLECTED) {
                    bucket.collectedEntries += 1;
                    bucket.collectedGross += row.receivedAmount;
                    bucket.collectedNet += row.netAmount;
                    bucket.collectedCharges += row.vendorCharges;
                } else {
                    bucket.pendingEntries += 1;
                    bucket.pendingGross += row.receivedAmount;
                    bucket.pendingNet += row.netAmount;
                    bucket.pendingCharges += row.vendorCharges;
                }
            }

            const sum = (fn) => transactions.reduce((s, row) => s + fn(row), 0);
            const pending = transactions.filter(
                (r) => r.collectionStatus !== COLLECTION_STATUS.COLLECTED
            );
            const collected = transactions.filter(
                (r) => r.collectionStatus === COLLECTION_STATUS.COLLECTED
            );
            const customerLinked = transactions.filter(
                (r) => r.entryType === ENTRY_TYPE.CUSTOMER_PAYMENT
            );
            const standalone = transactions.filter(
                (r) => r.entryType === ENTRY_TYPE.STANDALONE
            );

            const summary = {
                totalEntries: transactions.length,
                totalReceived: sum((r) => r.receivedAmount),
                totalPaidToWatav: sum((r) => r.paidToWatav),
                totalActualAmount: sum((r) => r.actualAmount),
                totalVendorCharges: sum((r) => r.vendorCharges),
                totalNetAmount: sum((r) => r.netAmount),
                pending: {
                    entries: pending.length,
                    gross: pending.reduce((s, r) => s + r.receivedAmount, 0),
                    net: pending.reduce((s, r) => s + r.netAmount, 0),
                    charges: pending.reduce((s, r) => s + r.vendorCharges, 0),
                    customerLinkedGross: pending
                        .filter((r) => r.entryType === ENTRY_TYPE.CUSTOMER_PAYMENT)
                        .reduce((s, r) => s + r.receivedAmount, 0),
                    standaloneGross: pending
                        .filter((r) => r.entryType === ENTRY_TYPE.STANDALONE)
                        .reduce((s, r) => s + r.receivedAmount, 0),
                },
                collected: {
                    entries: collected.length,
                    gross: collected.reduce((s, r) => s + r.receivedAmount, 0),
                    net: collected.reduce((s, r) => s + r.netAmount, 0),
                    charges: collected.reduce((s, r) => s + r.vendorCharges, 0),
                    customerLinkedGross: collected
                        .filter((r) => r.entryType === ENTRY_TYPE.CUSTOMER_PAYMENT)
                        .reduce((s, r) => s + r.receivedAmount, 0),
                    standaloneGross: collected
                        .filter((r) => r.entryType === ENTRY_TYPE.STANDALONE)
                        .reduce((s, r) => s + r.receivedAmount, 0),
                },
                customerLinked: {
                    entries: customerLinked.length,
                    gross: customerLinked.reduce((s, r) => s + r.receivedAmount, 0),
                    net: customerLinked.reduce((s, r) => s + r.netAmount, 0),
                    charges: customerLinked.reduce((s, r) => s + r.vendorCharges, 0),
                },
                standalone: {
                    entries: standalone.length,
                    gross: standalone.reduce((s, r) => s + r.receivedAmount, 0),
                    net: standalone.reduce((s, r) => s + r.netAmount, 0),
                    charges: standalone.reduce((s, r) => s + r.vendorCharges, 0),
                },
            };

            return {
                transactions,
                byWatav: Object.values(byWatav).sort(
                    (a, b) => b.pendingNet - a.pendingNet || b.totalReceived - a.totalReceived
                ),
                summary,
            };
        } catch (error) {
            throw new Error(`Failed to fetch watav report: ${error.message}`);
        }
    }
}

module.exports = new PaymentInService();
module.exports.customerCreditAmount = customerCreditAmount;
module.exports.PAYMENT_CATEGORY = PAYMENT_CATEGORY;
module.exports.ENTRY_TYPE = ENTRY_TYPE;
module.exports.COLLECTION_STATUS = COLLECTION_STATUS;
