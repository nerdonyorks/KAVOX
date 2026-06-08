const Product = require("../models/productModel");
const Wallet = require("../models/wallet");

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
    const isPrepaid = (order.paymentMethod === 'RAZORPAY' || order.paymentMethod === 'WALLET') && order.paymentStatus === 'Completed';

    if (isFullCancel) {
        if (isPrepaid) {
            refundAmount = order.pricing.total;
        }
        order.pricing.subtotal = 0;
        order.pricing.discount = 0;
        order.pricing.total = 0;
    } else if (cancelledItem) {
        if (isPrepaid) {
            refundAmount = cancelledItem.totalPrice;
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
        let wallet = await Wallet.findOne({ userId: order.userId });
        if (!wallet) {
            wallet = new Wallet({ userId: order.userId, balance: 0, transactions: [] });
        }
        wallet.balance += refundAmount;
        wallet.transactions.push({
            amount: refundAmount,
            type: "credit",
            description: `Refund for cancellation of ${cancelledItem ? 'item in order' : 'order'} ${order.orderId}`
        });
        await wallet.save();
    }
}

module.exports = {
    getCalculatedOrderStatus,
    updateOrderPricingAndRefund
};
