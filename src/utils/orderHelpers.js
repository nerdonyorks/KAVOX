const Product = require("../models/productModel");
const walletService = require("../services/walletService");

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

/**
 * Updates order pricing summaries (subtotal, discount, total) and refunds user wallet if prepaid.
 */
async function updateOrderPricingAndRefund(order, cancelledItem = null, isFullCancel = false) {
    let refundAmount = 0;

    if (isFullCancel) {
        if (order.paymentStatus === 'Completed') {
            refundAmount = order.pricing.total;
        } else {
            refundAmount = order.walletAmountUsed || 0;
        }
        order.pricing.subtotal = 0;
        order.pricing.discount = 0;
        order.pricing.total = 0;
        order.walletAmountUsed = 0;
        order.remainingAmountPaid = 0;
    } else if (cancelledItem) {
        if (order.paymentStatus === 'Completed') {
            refundAmount = cancelledItem.totalPrice;
        } else {
            // Pending COD order: adjust remaining amount to pay and refund excess from wallet
            const deduction = cancelledItem.totalPrice;
            const oldRemaining = order.remainingAmountPaid || 0;
            order.remainingAmountPaid = Math.max(0, oldRemaining - deduction);
            const unpaidReduction = oldRemaining - order.remainingAmountPaid;
            refundAmount = Math.max(0, deduction - unpaidReduction);
            order.walletAmountUsed = Math.max(0, (order.walletAmountUsed || 0) - refundAmount);
        }

        // Deduct cancelled item values from order summary
        const product = await Product.findById(cancelledItem.productId);
        const basePrice = product ? product.price : cancelledItem.price;
        const itemSubtotal = cancelledItem.quantity * basePrice;
        const itemDiscount = Math.max(0, itemSubtotal - cancelledItem.totalPrice);

        order.pricing.subtotal = Math.max(0, order.pricing.subtotal - itemSubtotal);
        order.pricing.discount = Math.max(0, order.pricing.discount - itemDiscount);
        order.pricing.total = Math.max(0, order.pricing.total - cancelledItem.totalPrice);
    }

    if (refundAmount > 0) {
        let isReturn = false;
        if (cancelledItem && (cancelledItem.itemStatus === 'Return Approved' || cancelledItem.itemStatus === 'Returned')) {
            isReturn = true;
        } else if (!cancelledItem && order.orderStatus === 'Returned') {
            isReturn = true;
        }
        const description = isReturn ? 'RETURN_REFUND' : 'ORDER_CANCELLATION_REFUND';

        await walletService.creditWallet(order.userId, refundAmount, description, order.orderId);

        order.refundStatus = 'Completed';
        order.refundAmount = (order.refundAmount || 0) + refundAmount;
    }
}

module.exports = {
    getCalculatedOrderStatus,
    updateOrderPricingAndRefund
};
