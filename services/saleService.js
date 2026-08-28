const prisma = require('../prisma/client');
const { format } = require('date-fns');
const { PurchaseItemStatus } = require('@prisma/client');
const puppeteer = require('puppeteer');
const invoiceTemplate = require('./invoiceTemplate');
const transactionService = require('./transactions');


class SaleService {
    async getAllSales() {
        return await prisma.sale.findMany({
            include: {
                customer: true,
                items: true
            },
            orderBy: {
                created_at: 'desc'
            }
        });
    }

    async getSaleById(id) {
        const sale = await prisma.sale.findUnique({
            where: { id },
            include: {
                customer: true,
                items: true,
                godown: true
            }
        });

        if (!sale) {
            throw new Error('Sale not found');
        }

        return sale;
    }

    async getNextSalesNumber(date) {
        // Get the current financial year
        const now = new Date(date);

        const currentYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;

        const nextYear = currentYear + 1;

        const financialYearStart = `${currentYear}-04-01`;
        const financialYearEnd = `${nextYear}-03-31`;

        // Count sales in current financial year
        const salesCount = await prisma.sale.count({
            where: {
                date: {
                    gte: new Date(financialYearStart),
                    lte: new Date(financialYearEnd)
                }
            }
        });

        console.log("salesCount", salesCount);

        // Format as 00001, 00002, etc.
        return String(salesCount + 1).padStart(5, '0');
    }

    async createSale(saleData) {
        const { items, ...saleDetails } = saleData;

        return await prisma.$transaction(async(prisma) => {
            // Generate sales number if not provided
            if (!saleDetails.sales_no) {
                saleDetails.sales_no = await this.generateSalesNumber();
            }

            // Create the sale record
            const sale = await prisma.sale.create({
                data: {
                    customer_id: saleDetails.customer_id,
                    customer_name: saleDetails.customer_name,
                    date: new Date(saleDetails.sales_date),
                    total: saleDetails.total_amount,
                    sales_no: saleDetails.sales_no,
                    description: saleDetails.description,
                    godown_id: saleDetails.godown_no,
                    hamaal: saleDetails.hamaal,
                    maker: saleDetails.maker,
                    challan_no: saleDetails.challan_no,
                    sales_by: saleDetails.sales_by,
                    created_at: new Date(),
                    updated_at: new Date()
                }
            });

            // Create all sale items and update purchase items status
            if (items && items.length > 0) {
                // Filter items that have purchase_item_id (stock rolls) and update their status to SOLD
                const stockRollIds = items
                    .filter(item => item.roll_id && item.purchase_item_id)
                    .map(item => item.roll_id);

                if (stockRollIds.length > 0) {
                    await prisma.purchaseItem.updateMany({
                        where: {
                            id: { in: stockRollIds }
                        },
                        data: {
                            status: PurchaseItemStatus.SOLD
                        }
                    });
                }

                // Then create sale items (both stock and custom rolls)
                const saleItemsData = items.map(item => ({
                    sale_id: sale.id,
                    product_id: item.product_id,
                    product_name: item.product_name,
                    purchase_item_id: item.roll_id || null, // Can be null for custom rolls
                    roll_no: item.roll_no,
                    meters: item.meters,
                    price: item.price,
                    total: item.total_price,
                    created_at: new Date(),
                    updated_at: new Date()
                }));

                await prisma.saleItem.createMany({
                    data: saleItemsData
                });
            }

            // Create transaction record
            await transactionService.createTransactionRecord(
                'incoming',
                `Sale ${sale.sales_no} to ${sale.customer_name}`,
                sale.customer_id,
                null,
                sale.total
            );

            // Return the full sale with items
            return await prisma.sale.findUnique({
                where: { id: sale.id },
                include: { items: true }
            });
        });
    }

    async updateSale(id, saleData) {
        const { items, ...saleDetails } = saleData;

        const actualTotal = items.reduce((sum, item) => {
            return sum + item.total_price
        }, 0)
        const roundedTotal = Math.round(actualTotal);


        return await prisma.$transaction(async(prisma) => {
            // Get existing sale items to revert their purchase items status
            const existingSale = await prisma.sale.findUnique({
                where: { id },
                include: { items: true }
            });

            if (existingSale && existingSale.items.length > 0) {
                // Revert only stock rolls (items with purchase_item_id) to UNSOLD
                const existingStockRollIds = existingSale.items
                    .filter(item => item.purchase_item_id)
                    .map(item => item.purchase_item_id);

                if (existingStockRollIds.length > 0) {
                    await prisma.purchaseItem.updateMany({
                        where: {
                            id: { in: existingStockRollIds }
                        },
                        data: {
                            status: PurchaseItemStatus.UNSOLD
                        }
                    });
                }
            }

            // Update the sale record
            const sale = await prisma.sale.update({
                where: { id },
                data: {
                    customer: {
                        connect: { id: saleDetails.customer_id }
                    },
                    godown: saleDetails.godown_no ? { connect: { id: saleDetails.godown_no } } : { disconnect: true }, // if nullable
                    customer_name: saleDetails.customer_name,
                    date: new Date(saleDetails.sales_date),
                    total: roundedTotal,
                    sales_no: saleDetails.sales_no,
                    description: saleDetails.description,
                    hamaal: saleDetails.hamaal,
                    maker: saleDetails.maker,
                    challan_no: saleDetails.challan_no,
                    sales_by: saleDetails.sales_by,
                    updated_at: new Date()
                }
            });


            // Delete existing sale items
            await prisma.saleItem.deleteMany({
                where: { sale_id: id }
            });

            // Create new sale items and update purchase items status
            if (items && items.length > 0) {
                // Update only stock rolls (items with purchase_item_id) to SOLD
                const newStockRollIds = items
                    .filter(item => item.purchase_item_id)
                    .map(item => item.purchase_item_id);

                if (newStockRollIds.length > 0) {
                    await prisma.purchaseItem.updateMany({
                        where: {
                            id: { in: newStockRollIds }
                        },
                        data: {
                            status: PurchaseItemStatus.SOLD
                        }
                    });
                }

                // Create new sale items (both stock and custom rolls)
                const saleItemsData = items.map(item => ({
                    sale_id: sale.id,
                    product_id: item.product_id,
                    product_name: item.product_name,
                    purchase_item_id: item.purchase_item_id || null, // Can be null for custom rolls
                    roll_no: item.roll_no,
                    meters: item.meters,
                    price: item.price,
                    total: item.total_price,
                    created_at: new Date(),
                    updated_at: new Date()
                }));

                await prisma.saleItem.createMany({
                    data: saleItemsData
                });
            }

            // Create transaction record for the update
            await transactionService.createTransactionRecord(
                'incoming',
                `Sale updated ${sale.sales_no} to ${sale.customer_name}`,
                sale.customer_id,
                null,
                sale.total
            );

            // Return the updated sale with items
            return await prisma.sale.findUnique({
                where: { id: sale.id },
                include: { items: true }
            });
        });
    }

    async deleteSale(id) {
        const existingSale = await prisma.sale.findUnique({
            where: { id },
            include: { items: true }
        });

        if (!existingSale) {
            throw new Error('Sale not found');
        }

        // Revert only stock rolls (items with purchase_item_id) to UNSOLD
        const stockRollIds = existingSale.items
            .filter(item => item.purchase_item_id)
            .map(item => item.purchase_item_id);

        if (stockRollIds.length > 0) {
            await prisma.purchaseItem.updateMany({
                where: {
                    id: { in: stockRollIds }
                },
                data: {
                    status: PurchaseItemStatus.UNSOLD
                }
            });
        }

        // Delete all sale items
        await prisma.saleItem.deleteMany({
            where: { sale_id: id }
        });

        // Create transaction record for the deletion
        await transactionService.createTransactionRecord(
            'outgoing',
            `Sale deleted ${existingSale.sales_no} for ${existingSale.customer_name}`,
            existingSale.customer_id,
            null,
            existingSale.total
        );

        // Delete the sale
        await prisma.sale.delete({
            where: { id }
        });

        return { message: 'Sale deleted successfully' };
    }

    async generateInvoicePDF(saleId) {
        try {
            const sale = await this.getSaleById(saleId);

            const invoiceData = {
                customer: sale.customer_name,
                date: format(new Date(sale.date), 'dd/MM/yyyy'),
                items: sale.items.map(item => ({
                    name: item.product_name,
                    qty: item.meters,
                    price: item.price
                })),
                total: sale.total,
                sales_no: sale.sales_no,
                challan_no: sale.challan_no,
                godown: sale.godown,
                hamaal: sale.hamaal
            };

            const browser = await puppeteer.launch({
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });

            const page = await browser.newPage();
            const html = invoiceTemplate(invoiceData);

            await page.setContent(html, { waitUntil: 'networkidle0' });

            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: {
                    top: '20px',
                    right: '20px',
                    bottom: '20px',
                    left: '20px'
                }
            });

            await browser.close();
            return pdfBuffer;
        } catch (error) {
            console.error('Error generating PDF:', error);
            throw new Error('Failed to generate invoice PDF');
        }
    }

    async generateInvoiceHTML(saleId) {
        try {
            const sale = await this.getSaleById(saleId);

            // Get all unique product_ids from sale items
            const productIds = sale.items.map(item => item.product_id).filter(Boolean);
            // Fetch all products in one query
            const products = await prisma.product.findMany({
                where: { id: { in: productIds } },
                include: {
                    grade: true, // This assumes 'gradeRavle' is the correct relation name
                },
            });
            // Map product_id to width
            const productWidthMap = {};
            products.forEach(p => { productWidthMap[p.id] = p.width });

            const productGradeMap = {};
            products.forEach(p => { productGradeMap[p.id] = p.grade.name });


            const invoiceData = {
                customer: sale.customer_name,
                date: format(new Date(sale.date), 'dd/MM/yyyy'),
                items: sale.items.map(item => ({
                    name: item.product_name,
                    qty: item.meters,
                    price: item.price,
                    width: productWidthMap[item.product_id] || '',
                    roll_no: item.roll_no,
                    mts: item.meters,
                    amount: item.total,
                    grade: productGradeMap[item.product_id] || ''
                })),
                total: sale.total,
                sales_no: sale.sales_no,
                challan_no: sale.challan_no,
                godown: sale.godown.name,
                hamaal: sale.hamaal,
                maker: sale.maker,
            };
            return invoiceTemplate(invoiceData);
        } catch (error) {
            console.error('Error generating invoice HTML:', error);
            throw new Error('Failed to generate invoice HTML');
        }
    }
}

module.exports = new SaleService();