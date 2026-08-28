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
}

module.exports = new PaymentInService();