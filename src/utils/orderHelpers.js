const Product = require("../models/productModel");
const walletService = require("../services/walletService");
const Coupon = require("../models/couponModel");

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

async function updateOrderPricingAndRefund(order, cancelledItem = null, isFullCancel = false) {
    let refundAmount = 0;
    let couponRemovedMessage = null;

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
        order.couponDiscount = 0;
        order.couponCode = undefined;
    } else if (cancelledItem) {
        const initialOrderTotal = order.pricing.total;

        // Deduct cancelled item values from order summary
        const product = await Product.findById(cancelledItem.productId);
        const basePrice = product ? product.price : cancelledItem.price;
        const itemSubtotal = cancelledItem.quantity * basePrice;
        const itemDiscount = Math.max(0, itemSubtotal - cancelledItem.totalPrice);

        let newSubtotal = Math.max(0, order.pricing.subtotal - itemSubtotal);
        let newDiscount = Math.max(0, order.pricing.discount - itemDiscount);

        // Revalidate applied coupons
        if (order.couponCode && order.couponDiscount > 0) {
            const coupon = await Coupon.findOne({ code: order.couponCode });
            if (coupon) {
                // Total order value before coupon is subtotal minus other discounts
                const orderTotalBeforeCoupon = newSubtotal - (newDiscount - order.couponDiscount);
                if (orderTotalBeforeCoupon < coupon.minPurchaseAmount) {
                    newDiscount = Math.max(0, newDiscount - order.couponDiscount);
                    couponRemovedMessage = `Coupon removed because the order value no longer meets the minimum purchase requirement of ₹${coupon.minPurchaseAmount}.`;
                    order.couponDiscount = 0;
                    order.couponCode = undefined;
                } else {
                    let newCouponDiscount = order.couponDiscount;
                    if (coupon.discountType === 'percentage') {
                        newCouponDiscount = (orderTotalBeforeCoupon * coupon.discountValue) / 100;
                        if (coupon.maxDiscount && newCouponDiscount > coupon.maxDiscount) {
                            newCouponDiscount = coupon.maxDiscount;
                        }
                        newCouponDiscount = Math.round(newCouponDiscount);
                    } else {
                        newCouponDiscount = coupon.discountValue;
                    }

                    if (newCouponDiscount > orderTotalBeforeCoupon) {
                        newCouponDiscount = orderTotalBeforeCoupon;
                    }

                    newDiscount = Math.max(0, newDiscount - order.couponDiscount + newCouponDiscount);
                    order.couponDiscount = newCouponDiscount;
                }
            }
        }

        const newOrderTotal = Math.max(0, newSubtotal - newDiscount);

        order.pricing.subtotal = newSubtotal;
        order.pricing.discount = newDiscount;
        order.pricing.total = newOrderTotal;

        // Refund/Payment calculations
        if (order.paymentStatus === 'Completed') {
            refundAmount = Math.max(0, initialOrderTotal - newOrderTotal);
            order.remainingAmountPaid = 0;
        } else {
            // Pending COD order
            const oldWalletUsed = order.walletAmountUsed || 0;
            order.remainingAmountPaid = Math.max(0, newOrderTotal - oldWalletUsed);
            const excessWallet = Math.max(0, oldWalletUsed - newOrderTotal);
            refundAmount = excessWallet;
            order.walletAmountUsed = oldWalletUsed - excessWallet;
        }
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

    return { couponRemovedMessage };
}

module.exports = {
    getCalculatedOrderStatus,
    updateOrderPricingAndRefund
};
