const prisma = require('../prisma/client');
const transactionService = require('./transactions');

class PaymentInService {
    async getAllPaymentsIn() {
        try {
            const paymentsIn = await prisma.paymentIn.findMany({
                include: {
                    receive_customer: true,
                    actual_customer: true
                },
                orderBy: {
                    created_at: 'desc'
                }
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
                    actual_customer: true
                }
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
            // Ensure we're properly setting up the data structure for Prisma
            const newPaymentIn = await prisma.paymentIn.create({
                data: {
                    received_amount: paymentInData.received_amount,
                    actual_amount: paymentInData.received_amount - (paymentInData.charges || 0),
                    charges: paymentInData.charges || 0,
                    type: paymentInData.type,
                    description: paymentInData.description || "",
                    payment_date: paymentInData.payment_date,
                    // Connect to customers if IDs are provided
                    ...(paymentInData.receive_id && {
                        receive_customer: {
                            connect: { id: paymentInData.receive_id }
                        }
                    }),
                    ...(paymentInData.actual_id && {
                        actual_customer: {
                            connect: { id: paymentInData.actual_id }
                        }
                    })
                },
                include: {
                    receive_customer: true,
                    actual_customer: true
                }
            });

            // Create transaction record
            await transactionService.createTransactionRecord(
                'incoming',
                `Payment received from ${newPaymentIn.actual_customer?.name || 'Customer'}`,
                newPaymentIn.actual_id,
                null,
                newPaymentIn.actual_amount
            );

            return newPaymentIn;
        } catch (error) {
            throw new Error(`Failed to create payment in: ${error.message}`);
        }
    }

    async updatePaymentIn(id, paymentInData) {
        try {
            const updatedPaymentIn = await prisma.paymentIn.update({
                where: { id },
                data: {
                    ...paymentInData,
                    actual_amount: paymentInData.received_amount - (paymentInData.charges || 0)
                },
                include: {
                    receive_customer: true,
                    actual_customer: true
                }
            });

            // Create transaction record for the update
            await transactionService.createTransactionRecord(
                'incoming',
                `Payment updated for ${updatedPaymentIn.actual_customer?.name || 'Customer'}`,
                updatedPaymentIn.actual_id,
                null,
                updatedPaymentIn.actual_amount
            );

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
                    actual_customer: true
                }
            });

            if (!paymentIn) {
                throw new Error(`Payment in with ID ${id} not found`);
            }

            // Create transaction record for the deletion
            await transactionService.createTransactionRecord(
                'outgoing',
                `Payment deleted for ${paymentIn.actual_customer?.name || 'Customer'}`,
                paymentIn.actual_id,
                null,
                paymentIn.actual_amount
            );

            await prisma.paymentIn.delete({
                where: { id }
            });
            return { success: true, message: 'Payment in deleted successfully' };
        } catch (error) {
            throw new Error(`Failed to delete payment in: ${error.message}`);
        }
    }

    /**
     * Watav entries: receive_id !== actual_id.
     * "Paid to Watav" = charges collected by the receive (watav) party.
     */
    async getWatavReport({ startDate, endDate, watavCustomerId }) {
        try {
            const dateFilter = {};
            if (startDate) {
                dateFilter.gte = new Date(startDate + 'T00:00:00.000Z');
            }
            if (endDate) {
                dateFilter.lte = new Date(endDate + 'T23:59:59.999Z');
            }

            const payments = await prisma.paymentIn.findMany({
                where: {
                    ...(Object.keys(dateFilter).length > 0
                        ? { payment_date: dateFilter }
                        : {}),
                    receive_id: watavCustomerId || { not: null },
                    actual_id: { not: null },
                },
                include: {
                    receive_customer: true,
                    actual_customer: true,
                },
                orderBy: {
                    payment_date: 'asc',
                },
            });

            const watavPayments = payments.filter(
                (payment) => payment.receive_id && payment.actual_id && payment.receive_id !== payment.actual_id
            );

            const transactions = watavPayments.map((payment, index) => ({
                srno: index + 1,
                id: payment.id,
                date: payment.payment_date || payment.created_at,
                watavCustomerId: payment.receive_id,
                watavCustomerName: payment.receive_customer?.name || 'Unknown',
                actualCustomerId: payment.actual_id,
                actualCustomerName: payment.actual_customer?.name || 'Unknown',
                receivedAmount: payment.received_amount || 0,
                paidToWatav: payment.charges || 0,
                actualAmount: payment.actual_amount || 0,
                type: payment.type,
                description: payment.description || '',
            }));

            const byWatav = {};
            for (const row of transactions) {
                if (!byWatav[row.watavCustomerId]) {
                    byWatav[row.watavCustomerId] = {
                        watavCustomerId: row.watavCustomerId,
                        watavCustomerName: row.watavCustomerName,
                        entries: 0,
                        totalReceived: 0,
                        totalPaidToWatav: 0,
                        totalActualAmount: 0,
                    };
                }
                byWatav[row.watavCustomerId].entries += 1;
                byWatav[row.watavCustomerId].totalReceived += row.receivedAmount;
                byWatav[row.watavCustomerId].totalPaidToWatav += row.paidToWatav;
                byWatav[row.watavCustomerId].totalActualAmount += row.actualAmount;
            }

            const summary = {
                totalEntries: transactions.length,
                totalReceived: transactions.reduce((sum, row) => sum + row.receivedAmount, 0),
                totalPaidToWatav: transactions.reduce((sum, row) => sum + row.paidToWatav, 0),
                totalActualAmount: transactions.reduce((sum, row) => sum + row.actualAmount, 0),
            };

            return {
                transactions,
                byWatav: Object.values(byWatav).sort(
                    (a, b) => b.totalPaidToWatav - a.totalPaidToWatav
                ),
                summary,
            };
        } catch (error) {
            throw new Error(`Failed to fetch watav report: ${error.message}`);
        }
    }
}

module.exports = new PaymentInService();