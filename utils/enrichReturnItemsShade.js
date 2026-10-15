const prisma = require('../prisma/client');

const collectPurchaseItemIds = (items = []) =>
    items
        .map((item) => item.purchase_item_id)
        .filter(Boolean);

async function loadShadeByPurchaseItemId(ids) {
    if (!ids.length) return new Map();
    const rows = await prisma.purchaseItem.findMany({
        where: { id: { in: ids } },
        select: { id: true, shade: true },
    });
    return new Map(rows.map((row) => [row.id, row.shade || '']));
}

function attachShadeToItems(items = [], shadeByPurchaseItemId) {
    return items.map((item) => {
        const fromStock =
            item.purchase_item_id && shadeByPurchaseItemId.has(item.purchase_item_id)
                ? shadeByPurchaseItemId.get(item.purchase_item_id)
                : null;
        return {
            ...item,
            shade: item.shade ?? fromStock ?? null,
        };
    });
}

/** Add shade from linked purchase stock rows when missing on return line items. */
async function enrichReturnItemsShade(items = []) {
    const ids = [...new Set(collectPurchaseItemIds(items))];
    const shadeByPurchaseItemId = await loadShadeByPurchaseItemId(ids);
    return attachShadeToItems(items, shadeByPurchaseItemId);
}

async function enrichReturnRecordShade(record) {
    if (!record?.items?.length) return record;
    return {
        ...record,
        items: await enrichReturnItemsShade(record.items),
    };
}

async function enrichReturnRecordsShade(records = []) {
    if (!records.length) return records;
    const ids = [
        ...new Set(records.flatMap((record) => collectPurchaseItemIds(record.items))),
    ];
    const shadeByPurchaseItemId = await loadShadeByPurchaseItemId(ids);
    return records.map((record) => ({
        ...record,
        items: attachShadeToItems(record.items || [], shadeByPurchaseItemId),
    }));
}

module.exports = {
    enrichReturnItemsShade,
    enrichReturnRecordShade,
    enrichReturnRecordsShade,
};
