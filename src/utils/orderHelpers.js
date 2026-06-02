/**
 * Calculates the overall order status based on individual item statuses.
 * @param {Array} items - Array of order items
 * @returns {String} Calculated overall order status
 */
function getCalculatedOrderStatus(items) {
    if (!items || items.length === 0) return 'Processing';

    const total = items.length;
    const cancelledCount = items.filter(i => i.itemStatus === 'Cancelled').length;
    const returnedCount = items.filter(i => i.itemStatus === 'Returned' || i.itemStatus === 'Return Approved').length;
    const returnRequestedCount = items.filter(i => i.itemStatus === 'Return Requested').length;
    
    // Treat 'Return Rejected' as delivered since the request was denied
    const processingCount = items.filter(i => i.itemStatus === 'Processing').length;
    const shippedCount = items.filter(i => i.itemStatus === 'Shipped').length;
    const deliveredCount = items.filter(i => i.itemStatus === 'Delivered' || i.itemStatus === 'Return Rejected').length;

    // 1. If all items are cancelled
    if (cancelledCount === total) {
        return 'Cancelled';
    }

    // 2. If all non-cancelled items are returned/approved
    if (returnedCount + cancelledCount === total) {
        return 'Returned';
    }

    // 3. If all non-cancelled/returned/approved items are return requested
    if (returnRequestedCount + returnedCount + cancelledCount === total) {
        return 'Return Requested';
    }

    // 4. Otherwise, calculate based on active items (Processing, Shipped, Delivered)
    const activeCount = processingCount + shippedCount + deliveredCount;

    if (activeCount > 0) {
        // If all active items are Delivered
        if (deliveredCount === activeCount) {
            return 'Delivered';
        }
        // If all active items are Shipped
        if (shippedCount === activeCount) {
            return 'Shipped';
        }
        // If all active items are Processing
        if (processingCount === activeCount) {
            return 'Processing';
        }
        // If there are any delivered items (but not all active items are delivered)
        if (deliveredCount > 0) {
            return 'Partially Delivered';
        }
        // If there are any shipped items (but not all active items are shipped)
        if (shippedCount > 0) {
            return 'Partially Shipped';
        }
    }

    return 'Processing';
}

module.exports = {
    getCalculatedOrderStatus
};
