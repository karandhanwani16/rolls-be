const prisma = require('../prisma/client');

class SupplierService {
    async getAllSuppliers() {
        try {
            const suppliers = await prisma.supplier.findMany();
            return suppliers;
        } catch (error) {
            console.error('Error fetching suppliers:', error);
            throw error;
        }
    }

    async createSupplier(data) {
        try {
            const supplier = await prisma.supplier.create({ data });
            return supplier;
        } catch (error) {
            console.error('Error creating supplier:', error);
            throw error;
        }
    }

    async updateSupplier(id, data) {
        try {
            const supplier = await prisma.supplier.update({
                where: { id },
                data
            });
            return supplier;
        } catch (error) {
            console.error('Error updating supplier:', error);
            throw error;
        }
    }

    async deleteSupplier(id) {
        try {
            await prisma.supplier.delete({ where: { id } });
        } catch (error) {
            console.error('Error deleting supplier:', error);
            throw error;
        }
    }

    async getPurchasesAndPaymentsService(supplierIds, startDate, endDate) {
        try {
            let supplierIdsArray = supplierIds.split(',');
            let srno = 1;

            // Get purchases data
            const purchases = await prisma.purchase.findMany({
                where: {
                    supplier_id: { in: supplierIdsArray },
                    date: {
                        gte: new Date(startDate + 'T00:00:00.000Z'),
                        lte: new Date(endDate + 'T23:59:59.999Z')
                    }
                },
                include: {
                    supplier: true
                },
                orderBy: {
                    date: 'asc'
                }
            });

            // Get payments data
            const payments = await prisma.paymentOut.findMany({
                where: {
                    supplier_id: { in: supplierIdsArray },
                    payment_date: {
                        gte: new Date(startDate + 'T00:00:00.000Z'),
                        lte: new Date(endDate + 'T23:59:59.999Z')
                    }
                },
                include: {
                    supplier: true
                },
                orderBy: {
                    payment_date: 'asc'
                }
            });

            // Format purchases data
            const formattedPurchases = purchases.map(purchase => ({
                srno: srno++,
                date: purchase.date,
                particulars: `Purchase from ${purchase.supplier_name}`,
                voucherNo: purchase.purchase_no,
                debit: 0,
                credit: purchase.total
            }));

            // Format payments data
            console.log("payments", payments)
            const formattedPayments = payments.map(payment => ({
                srno: srno++,
                date: payment.payment_date,
                particulars: `Payment to ${payment.supplier?.name || 'Unknown'}`,
                voucherNo: "-",
                debit: payment.amount,
                credit: 0
            }));

            const purchaseReturns = await prisma.purchaseReturn.findMany({
                where: {
                    supplier_id: { in: supplierIdsArray },
                    date: {
                        gte: new Date(startDate + 'T00:00:00.000Z'),
                        lte: new Date(endDate + 'T23:59:59.999Z')
                    }
                },
                orderBy: { date: 'asc' }
            });

            const formattedReturns = purchaseReturns.map(purchaseReturn => ({
                srno: srno++,
                date: purchaseReturn.date,
                particulars: `Purchase return to ${purchaseReturn.supplier_name}`,
                voucherNo: purchaseReturn.return_no,
                debit: purchaseReturn.total,
                credit: 0
            }));

            // Combine and sort all transactions by date
            const allTransactions = [...formattedPurchases, ...formattedPayments, ...formattedReturns]
                .sort((a, b) => new Date(a.date) - new Date(b.date));

            // Reset srno after sorting
            allTransactions.forEach((transaction, index) => {
                transaction.srno = index + 1;
            });

            return allTransactions;
        } catch (error) {
            console.error('Error fetching purchases and payments:', error);
            throw error;
        }
    }
}

module.exports = new SupplierService();