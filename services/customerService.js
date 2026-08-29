const prisma = require('../prisma/client');

class CustomerService {
    async getAllCustomers() {
        try {
            const customers = await prisma.customer.findMany();
            return customers;
        } catch (error) {
            console.error('Error fetching customers:', error);
            throw error;
        }
    }

    async createCustomer(data) {
        try {
            const customer = await prisma.customer.create({ data });
            return customer;
        } catch (error) {
            console.error('Error creating customer:', error);
            throw error;
        }
    }

    async updateCustomer(id, data) {
        try {
            const customer = await prisma.customer.update({
                where: { id },
                data
            });
            return customer;
        } catch (error) {
            console.error('Error updating customer:', error);
            throw error;
        }
    }

    async deleteCustomer(id) {
        try {
            await prisma.customer.delete({ where: { id } });
        } catch (error) {
            console.error('Error deleting customer:', error);
            throw error;
        }
    }

    async getSalesAndPaymentsService(customerIds, startDate, endDate, customerType) {
        try {
            let customerIdsArray = customerIds.split(',');
            let srno = 1;

            // Get sales data
            const sales = await prisma.sale.findMany({
                where: {
                    customer_id: { in: customerIdsArray },
                    date: {
                        gte: new Date(startDate + 'T00:00:00.000Z'),
                        lte: new Date(endDate + 'T23:59:59.999Z')
                    }
                },
                include: {
                    customer: true
                },
                orderBy: {
                    date: 'asc'
                }
            });

            // Get payments data
            const payments = await prisma.paymentIn.findMany({
                where: {
                    actual_id: { in: customerIdsArray },
                    payment_date: {
                        gte: new Date(startDate + 'T00:00:00.000Z'),
                        lte: new Date(endDate + 'T23:59:59.999Z')
                    }
                },
                include: {
                    actual_customer: true
                },
                orderBy: {
                    payment_date: 'asc'
                }
            });

            // Format sales data
            const formattedSales = sales.map(sale => ({
                srno: srno++,
                date: sale.date,
                particulars: `Sale to ${sale.customer_name}`,
                voucherNo: sale.sales_no,
                debit: sale.total,
                credit: 0
            }));

            // Format payments data
            const formattedPayments = payments.map(payment => ({
                srno: srno++,
                date: payment.payment_date,
                particulars: `Payment from ${payment.actual_customer?.name || 'Unknown'}`,
                voucherNo: payment.id,
                debit: 0,
                credit: payment.actual_amount
            }));

            const salesReturns = await prisma.saleReturn.findMany({
                where: {
                    customer_id: { in: customerIdsArray },
                    date: {
                        gte: new Date(startDate + 'T00:00:00.000Z'),
                        lte: new Date(endDate + 'T23:59:59.999Z')
                    }
                },
                orderBy: { date: 'asc' }
            });

            const formattedReturns = salesReturns.map(saleReturn => ({
                srno: srno++,
                date: saleReturn.date,
                particulars: `Sales return from ${saleReturn.customer_name}`,
                voucherNo: saleReturn.return_no,
                debit: 0,
                credit: saleReturn.total
            }));

            // Combine and sort all transactions by date
            const allTransactions = [...formattedSales, ...formattedPayments, ...formattedReturns]
                .sort((a, b) => new Date(a.date) - new Date(b.date));

            // Reset srno after sorting
            allTransactions.forEach((transaction, index) => {
                transaction.srno = index + 1;
            });

            return allTransactions;
        } catch (error) {
            console.error('Error fetching sales and payments:', error);
            throw error;
        }
    }

    // async getSalesAndPayments({ customerIds, startDate, endDate, customerType }) {
    //     try {
    //         // Build where conditions for sales
    //         const salesWhere = {
    //             customer_id: { in: customerIds },
    //             ...(startDate && { date: { gte: startDate } }),
    //             ...(endDate && { date: { lte: endDate } }),
    //             customer: customerType ? { type: customerType } : undefined
    //         };

    //         console.log("salesWhere", salesWhere);

    //         // Build where conditions for payments
    //         const paymentsWhere = {
    //             customer_id: { in: customerIds },
    //             ...(startDate && { date: { gte: startDate } }),
    //             ...(endDate && { date: { lte: endDate } }),
    //             customer: customerType ? { type: customerType } : undefined
    //         };

    //         // Get sales data
    //         const sales = await prisma.sales.findMany({
    //             where: salesWhere,
    //             include: {
    //                 customer: {
    //                     select: {
    //                         name: true,
    //                         type: true
    //                     }
    //                 }
    //             },
    //             orderBy: {
    //                 date: 'desc'
    //             }
    //         });

    //         // Get payments data
    //         const payments = await prisma.payments.findMany({
    //             where: paymentsWhere,
    //             include: {
    //                 customer: {
    //                     select: {
    //                         name: true,
    //                         type: true
    //                     }
    //                 }
    //             },
    //             orderBy: {
    //                 date: 'desc'
    //             }
    //         });

    //         return {
    //             sales,
    //             payments
    //         };
    //     } catch (error) {
    //         console.error('Error in getSalesAndPayments:', error);
    //         throw error;
    //     }
    // }
}

module.exports = new CustomerService();