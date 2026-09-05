const prisma = require('../prisma/client');
const {
    parseDateStart,
    parseDateEnd,
    dayBeforeDateStr,
    buildLedgerWithOpeningBalance,
} = require('../utils/ledgerHelpers');

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

    formatCustomerSale(sale) {
        return {
            date: sale.date,
            particulars: `Sale to ${sale.customer_name}`,
            voucherNo: sale.sales_no,
            debit: sale.total,
            credit: 0,
        };
    }

    formatCustomerPayment(payment) {
        const { customerCreditAmount, PAYMENT_CATEGORY } = require('./paymentInService');
        const isWatav = payment.payment_category === PAYMENT_CATEGORY.VATAV;
        const credit = customerCreditAmount(payment);
        return {
            date: payment.payment_date,
            particulars: isWatav
                ? `Watav payment from ${payment.actual_customer?.name || 'Unknown'}`
                : `Payment from ${payment.actual_customer?.name || 'Unknown'}`,
            voucherNo: payment.id,
            debit: 0,
            // VATAV customer payments credit the full gross; NORMAL uses actual_amount
            credit,
            paymentCategory: payment.payment_category || PAYMENT_CATEGORY.NORMAL,
            entryType: payment.entry_type || null,
        };
    }

    formatCustomerReturn(saleReturn) {
        return {
            date: saleReturn.date,
            particulars: `Sales return from ${saleReturn.customer_name}`,
            voucherNo: saleReturn.return_no,
            debit: 0,
            credit: saleReturn.total,
        };
    }

    async fetchCustomerTransactions(customerIds, fromDate, toDate) {
        const dateFilter = {
            gte: fromDate,
            lte: toDate,
        };

        const [sales, payments, salesReturns] = await Promise.all([
            prisma.sale.findMany({
                where: {
                    customer_id: { in: customerIds },
                    date: dateFilter,
                },
                include: { customer: true },
                orderBy: { date: 'asc' },
            }),
            prisma.paymentIn.findMany({
                where: {
                    actual_id: { in: customerIds },
                    payment_date: dateFilter,
                    // Standalone watav entries have no actual_id; exclude any misfires
                    NOT: {
                        payment_category: 'VATAV',
                        entry_type: 'STANDALONE',
                    },
                },
                include: { actual_customer: true, receive_customer: true },
                orderBy: { payment_date: 'asc' },
            }),
            prisma.saleReturn.findMany({
                where: {
                    customer_id: { in: customerIds },
                    date: dateFilter,
                },
                orderBy: { date: 'asc' },
            }),
        ]);

        return [
            ...sales.map((sale) => this.formatCustomerSale(sale)),
            ...payments.map((payment) => this.formatCustomerPayment(payment)),
            ...salesReturns.map((saleReturn) => this.formatCustomerReturn(saleReturn)),
        ];
    }

    async getSalesAndPaymentsService(customerIds, startDate, endDate, customerType) {
        try {
            const customerIdsArray = customerIds.split(',').filter(Boolean);
            const rangeStart = parseDateStart(startDate);
            const rangeEnd = parseDateEnd(endDate);

            const customerWhere = customerIdsArray.length > 0
                ? { id: { in: customerIdsArray } }
                : customerType
                    ? { type: customerType }
                    : {};

            const customers = await prisma.customer.findMany({
                where: customerWhere,
            });

            if (customers.length === 0) {
                return {
                    transactions: [],
                    summary: {
                        openingBalance: 0,
                        closingBalance: 0,
                        totalDebit: 0,
                        totalCredit: 0,
                        normalPayments: 0,
                        vatavPayments: 0,
                        totalPayments: 0,
                    },
                };
            }

            const ids = customers.map((customer) => customer.id);

            const allRows = [];
            const summaryTotals = {
                openingBalance: 0,
                closingBalance: 0,
                totalDebit: 0,
                totalCredit: 0,
                normalPayments: 0,
                vatavPayments: 0,
                totalPayments: 0,
            };

            for (const customer of customers) {
                const customerPeriodRows = await this.fetchCustomerTransactions(
                    [customer.id],
                    rangeStart,
                    rangeEnd
                );

                for (const row of customerPeriodRows) {
                    if (row.credit > 0 && row.paymentCategory) {
                        if (row.paymentCategory === 'VATAV') {
                            summaryTotals.vatavPayments += row.credit;
                        } else {
                            summaryTotals.normalPayments += row.credit;
                        }
                        summaryTotals.totalPayments += row.credit;
                    }
                }

                let prePeriodRows = [];
                if (customer.opening_balance_date) {
                    const obDate = new Date(customer.opening_balance_date);
                    if (obDate < rangeStart) {
                        prePeriodRows = await this.fetchCustomerTransactions(
                            [customer.id],
                            obDate,
                            dayBeforeDateStr(startDate)
                        );
                    }
                }

                const ledger = buildLedgerWithOpeningBalance({
                    partyName: customer.name,
                    openingBalance: customer.opening_balance,
                    openingBalanceDate: customer.opening_balance_date,
                    startDate,
                    endDate,
                    periodRows: customerPeriodRows,
                    prePeriodRows,
                    positiveBalanceSide: 'debit',
                });

                allRows.push(...ledger.rows);
                summaryTotals.openingBalance += ledger.summary.openingBalance;
                summaryTotals.closingBalance += ledger.summary.closingBalance;
                summaryTotals.totalDebit += ledger.summary.totalDebit;
                summaryTotals.totalCredit += ledger.summary.totalCredit;
            }

            const sortedRows = allRows.sort((a, b) => new Date(a.date) - new Date(b.date));
            let running = 0;
            const transactions = sortedRows.map((row, index) => {
                running += row.debit - row.credit;
                return {
                    srno: index + 1,
                    date: row.date,
                    particulars: row.particulars,
                    voucherNo: row.voucherNo,
                    debit: row.debit,
                    credit: row.credit,
                    balance: running,
                    isOpeningBalance: row.isOpeningBalance || false,
                    isBroughtForward: row.isBroughtForward || false,
                    paymentCategory: row.paymentCategory || null,
                    entryType: row.entryType || null,
                };
            });

            return {
                transactions,
                summary: {
                    ...summaryTotals,
                    closingBalance: transactions.length > 0
                        ? transactions[transactions.length - 1].balance
                        : summaryTotals.openingBalance,
                },
            };
        } catch (error) {
            console.error('Error fetching sales and payments:', error);
            throw error;
        }
    }
}

module.exports = new CustomerService();
