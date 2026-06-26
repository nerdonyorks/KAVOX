const Coupon = require('../models/couponModel');
const Order = require('../models/orderModel');

exports.getAvailableCoupons = async () => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return Coupon.find({
        isDeleted: false,
        isActive: true,
        expiryDate: { $gte: todayStart }
    })
        .sort({ expiryDate: 1, discountValue: -1 })
        .lean();
};


exports.validateCoupon = async (code, cartTotal, userId) => {
    if (!code) {
        return { isValid: false, message: "Coupon code is required." };
    }

    const normalizedCode = code.trim().toUpperCase();
    const coupon = await Coupon.findOne({ code: normalizedCode, isDeleted: false });

    if (!coupon) {
        return { isValid: false, message: "Coupon code does not exist." };
    }

    if (!coupon.isActive) {
        return { isValid: false, message: "This coupon is currently inactive." };
    }

    // Compare date components to avoid strict time zone/hour mismatch issues (i.e. check if current date is past the end of the expiry day)
    const now = new Date();
    // Expiry date represents the deadline. Set expiry date check at the end of the day or direct date comparison
    if (new Date(coupon.expiryDate) < now) {
        return { isValid: false, message: "This coupon has expired." };
    }

    if (cartTotal < coupon.minPurchaseAmount) {
        return {
            isValid: false,
            message: `Minimum purchase of ₹${coupon.minPurchaseAmount} is required to use this coupon.`
        };
    }
   
    // Check if user has already used this coupon code in a non-cancelled order
    const hasUsed = await Order.exists({
        userId,
        couponCode: coupon.code,
        orderStatus: { $ne: 'Cancelled' }
    });

    if (hasUsed) {
        return { isValid: false, message: "You have already used this coupon." };
    }

    let discountAmount;
    if (coupon.discountType === 'fixed') {
        discountAmount = coupon.discountValue;
    } else {
        // percentage
        discountAmount = (cartTotal * coupon.discountValue) / 100;
        if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
            discountAmount = coupon.maxDiscount;
        }
    }

    // Cap the discount at the cart total to prevent negative pricing
    if (discountAmount > cartTotal) {
        discountAmount = cartTotal;
    }

    // Round the discount to nearest integer
    discountAmount = Math.round(discountAmount);

    return {
        isValid: true,
        message: "Coupon applied successfully!",
        coupon,
        discountAmount
    };
};
