const prisma = require('../prisma/client');
const transactionService = require('./transactions');

class PaymentOutService {
    async getAllPaymentsOut() {
        try {
            const paymentsOut = await prisma.paymentOut.findMany({
                include: {
                    supplier: true
                }
            });
            return paymentsOut;
        } catch (error) {
            throw new Error(`Failed to fetch payments out: ${error.message}`);
        }
    }

    async getPaymentOutById(id) {
        try {
            const paymentOut = await prisma.paymentOut.findUnique({
                where: { id },
                include: {
                    supplier: true
                }
            });

            if (!paymentOut) {
                throw new Error(`Payment out with ID ${id} not found`);
            }

            return paymentOut;
        } catch (error) {
            throw new Error(`Failed to fetch payment out: ${error.message}`);
        }
    }

    async createPaymentOut(paymentOutData) {
        try {
            // Format cheque_date if provided
            if (paymentOutData.cheque_date) {
                paymentOutData.cheque_date = new Date(paymentOutData.cheque_date);
            }

            const newPaymentOut = await prisma.paymentOut.create({
                data: paymentOutData,
                include: {
                    supplier: true
                }
            });

            // Create transaction record
            await transactionService.createTransactionRecord(
                'outgoing',
                `Payment made to ${newPaymentOut.supplier?.name || 'Supplier'}`,
                null,
                newPaymentOut.supplier_id,
                newPaymentOut.amount
            );

            return newPaymentOut;
        } catch (error) {
            throw new Error(`Failed to create payment out: ${error.message}`);
        }
    }

    async updatePaymentOut(id, paymentOutData) {
        try {
            // Format cheque_date if provided
            if (paymentOutData.cheque_date) {
                paymentOutData.cheque_date = new Date(paymentOutData.cheque_date);
            }

            const updatedPaymentOut = await prisma.paymentOut.update({
                where: { id },
                data: paymentOutData,
                include: {
                    supplier: true
                }
            });

            // Create transaction record for the update
            await transactionService.createTransactionRecord(
                'outgoing',
                `Payment updated for ${updatedPaymentOut.supplier?.name || 'Supplier'}`,
                null,
                updatedPaymentOut.supplier_id,
                updatedPaymentOut.amount
            );

            return updatedPaymentOut;
        } catch (error) {
            throw new Error(`Failed to update payment out: ${error.message}`);
        }
    }

    async deletePaymentOut(id) {
        try {
            const paymentOut = await prisma.paymentOut.findUnique({
                where: { id },
                include: {
                    supplier: true
                }
            });

            if (!paymentOut) {
                throw new Error(`Payment out with ID ${id} not found`);
            }

            // Create transaction record for the deletion
            await transactionService.createTransactionRecord(
                'incoming',
                `Payment deleted for ${paymentOut.supplier?.name || 'Supplier'}`,
                null,
                paymentOut.supplier_id,
                paymentOut.amount
            );

            await prisma.paymentOut.delete({
                where: { id }
            });
            return { success: true, message: 'Payment out deleted successfully' };
        } catch (error) {
            throw new Error(`Failed to delete payment out: ${error.message}`);
        }
    }
}

module.exports = new PaymentOutService();