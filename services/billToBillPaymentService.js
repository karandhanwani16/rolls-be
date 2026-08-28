const prisma = require('../prisma/client');
const { format } = require('date-fns');

class BillToBillPaymentService {
    async getCustomerBillPayments(customerId) {
        try {
            const billPayments = await prisma.billToBillPayment.findMany({
                where: { customer_id: customerId },
                include: {
                    details: {
                        include: {
                            sale: true
                        }
                    }
                },
                orderBy: {
                    bill_clear_date: 'desc'
                }
            });
            return billPayments;
        } catch (error) {
            console.error('Error fetching bill payments:', error);
            throw new Error(`Failed to fetch bill payments: ${error.message}`);
        }
    }

    async getReconciliationData(customerId) {
        try {
            // Get the latest bill payment record to determine cutoff date
            const latestBillPayment = await prisma.billToBillPayment.findFirst({
                where: { customer_id: customerId },
                orderBy: { bill_latest_clear_date: 'desc' }
            });

            // Get all sales for this customer
            const customerSales = await prisma.sale.findMany({
                where: { customer_id: customerId },
                orderBy: { date: 'asc' },
                include: { bill_payments: true }
            });

            // Get all payment_ins for this customer
            let paymentsIn = await prisma.paymentIn.findMany({
                where: { actual_id: customerId },
                orderBy: { created_at: 'asc' }
            });

            let billOverflowAmount = 0;
            let startDate = new Date(0); // Default to beginning of time

            if (latestBillPayment) {
                billOverflowAmount = latestBillPayment.bill_overflow_amount;
                startDate = latestBillPayment.bill_latest_clear_date;

                // Filter to only include payments after the latest clear date
                paymentsIn = paymentsIn.filter(payment =>
                    new Date(payment.created_at) > new Date(startDate)
                );
            }

            // Process each sale and determine its payment status
            const salesWithStatus = customerSales.map(sale => {
                // Calculate total cleared amount for this sale from existing bill payments
                const clearedAmount = sale.bill_payments.reduce(
                    (total, payment) => total + payment.cleared_amount,
                    0
                );

                let status = "UNPAID";
                if (clearedAmount >= sale.total) {
                    status = "FULL";
                } else if (clearedAmount > 0) {
                    status = "PARTIAL";
                }

                return {
                    id: sale.id,
                    sales_no: sale.sales_no,
                    date: sale.date,
                    total: sale.total,
                    cleared_amount: clearedAmount,
                    remaining_amount: sale.total - clearedAmount,
                    status
                };
            });

            // Calculate total payment amount available
            const totalPaymentAmount = paymentsIn.reduce(
                (total, payment) => total + payment.received_amount,
                0
            ) + billOverflowAmount;

            return {
                customer_id: customerId,
                bill_overflow_amount: billOverflowAmount,
                last_clear_date: latestBillPayment?.bill_latest_clear_date || null,
                total_payment_amount: totalPaymentAmount,
                payments_in: paymentsIn,
                sales: salesWithStatus
            };
        } catch (error) {
            console.error('Error fetching reconciliation data:', error);
            throw new Error(`Failed to fetch reconciliation data: ${error.message}`);
        }
    }

    async processBillPayments(data) {
        const { customerId, sales } = data;

        try {
            return await prisma.$transaction(async(tx) => {
                // Get the current date
                const currentDate = new Date();

                // Calculate total payment amount from sales that will be cleared
                const totalClearedAmount = sales.reduce(
                    (total, sale) => total + parseFloat(sale.cleared_amount),
                    0
                );

                // Create new bill payment record
                const billPayment = await tx.billToBillPayment.create({
                    data: {
                        customer_id: customerId,
                        bill_clear_date: currentDate,
                        bill_latest_clear_date: currentDate,
                        bill_overflow_amount: data.overflow_amount || 0,
                        details: {
                            create: sales.filter(sale => parseFloat(sale.cleared_amount) > 0).map(sale => ({
                                sale_id: sale.id,
                                cleared_amount: parseFloat(sale.cleared_amount),
                                status: sale.status
                            }))
                        }
                    },
                    include: {
                        details: true
                    }
                });

                return billPayment;
            });
        } catch (error) {
            console.error('Error processing bill payments:', error);
            throw new Error(`Failed to process bill payments: ${error.message}`);
        }
    }
}

module.exports = new BillToBillPaymentService();