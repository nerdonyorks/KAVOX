const Coupon = require('../models/couponModel');
const Cart = require('../models/cartModel');
const mongoose = require('mongoose');
const couponService = require('../services/couponService');
const { HTTP_STATUS } = require('../utils/constants');

// Helper to get cart total from orderController (we will export this from orderController)
const { getDetailedTotals } = require('./orderController');

/**
 * List all coupons in the admin dashboard with search and pagination
 */
exports.listCoupons = async (req, res) => {
    try {
        const { search } = req.query;
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.max(1, parseInt(req.query.limit) || 5);

        const query = { isDeleted: false };

        if (search) {
            query.code = { $regex: search.trim(), $options: 'i' };
        }

        const skip = (page - 1) * limit;
        const total = await Coupon.countDocuments(query);
        const coupons = await Coupon.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.render("admin/coupons", {
            title: "Coupon Management - KAVOX Admin",
            activePage: "coupons",
            coupons,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            searchQuery: search || ""
        });
    } catch (error) {
        console.error("List Coupons Error:", error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).render("user/error", {
            message: "Failed to load coupon management panel."
        });
    }
};

exports.renderUserCoupons = async (req, res) => {
    try {
        const coupons = await couponService.getAvailableCoupons();

        res.render("user/coupons", {
            title: "Coupons - KAVOX",
            coupons
        });
    } catch (error) {
        console.error("User Coupons Error:", error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).render("user/error", {
            message: "Failed to load coupons."
        });
    }
};

/**
 * Create a new coupon
 */
exports.createCoupon = async (req, res) => {
    try {
        let { code, discountType, discountValue, percentage, discountPercentage, maxDiscount, minPurchaseAmount, expiryDate, isActive } = req.body;
        const couponDiscountValue = discountValue ?? percentage ?? discountPercentage;
        const type = (discountType === 'fixed') ? 'fixed' : 'percentage';

        if (!code || couponDiscountValue === undefined || minPurchaseAmount === undefined || !expiryDate) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "All fields are required."
            });
        }

        // Clean & validate coupon code
        const cleanCode = code.trim().toUpperCase();
        if (cleanCode.length < 4) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Coupon code must be at least 4 characters long."
            });
        }
        if (/\s/.test(cleanCode)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Coupon code cannot contain spaces."
            });
        }

        // Check uniqueness
        const existingCoupon = await Coupon.findOne({ code: cleanCode, isDeleted: false });
        if (existingCoupon) {
            return res.status(HTTP_STATUS.CONFLICT).json({
                success: false,
                message: "Coupon code already exists."
            });
        }

        // Parse numerical values
        const parsedVal = parseFloat(couponDiscountValue);
        const parsedMin = parseFloat(minPurchaseAmount);
        const parsedMax = (type === 'percentage' && maxDiscount) ? parseFloat(maxDiscount) : null;

        if (isNaN(parsedVal) || parsedVal <= 0) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Discount value must be a positive number."
            });
        }

        if (type === 'percentage' && parsedVal > 100) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Percentage discount cannot exceed 100%."
            });
        }

        if (parsedMax !== null && (isNaN(parsedMax) || parsedMax <= 0)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Maximum discount must be greater than 0."
            });
        }

        if (isNaN(parsedMin) || parsedMin <= 0) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Minimum purchase amount must be greater than 0."
            });
        }

        // Validate expiry date (must be in the future)
        const expiry = new Date(expiryDate);
        if (isNaN(expiry.getTime())) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid expiry date format."
            });
        }

        const now = new Date();
        // Reset time components to check date-level difference
        const todayDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const expiryDateOnly = new Date(expiry.getFullYear(), expiry.getMonth(), expiry.getDate());
        if (expiryDateOnly < todayDateOnly) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Expiry date must be today or a future date."
            });
        }

        // Create coupon
        const newCoupon = new Coupon({
            code: cleanCode,
            discountType: type,
            discountValue: parsedVal,
            maxDiscount: parsedMax,
            minPurchaseAmount: parsedMin,
            expiryDate: expiry,
            isActive: isActive === "false" || isActive === false ? false : true
        });

        await newCoupon.save();

        res.status(HTTP_STATUS.CREATED).json({
            success: true,
            message: "Coupon created successfully!",
            data: newCoupon
        });
    } catch (error) {
        console.error("Create Coupon Error:", error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: "Failed to create coupon."
        });
    }
};

/**
 * Update an existing coupon
 */
exports.updateCoupon = async (req, res) => {
    try {
        const couponId = req.params.id;

        if (!mongoose.Types.ObjectId.isValid(couponId)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid coupon id."
            });
        }

        let { code, discountType, discountValue, percentage, discountPercentage, maxDiscount, minPurchaseAmount, expiryDate, isActive } = req.body;
        const couponDiscountValue = discountValue ?? percentage ?? discountPercentage;
        const type = (discountType === 'fixed') ? 'fixed' : 'percentage';

        if (!code || couponDiscountValue === undefined || minPurchaseAmount === undefined || !expiryDate) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "All fields are required."
            });
        }

        const coupon = await Coupon.findOne({ _id: couponId, isDeleted: false });
        if (!coupon) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Coupon not found."
            });
        }

        const cleanCode = code.trim().toUpperCase();
        if (cleanCode.length < 4) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Coupon code must be at least 4 characters long."
            });
        }
        if (/\s/.test(cleanCode)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Coupon code cannot contain spaces."
            });
        }

        const existingCoupon = await Coupon.findOne({
            code: cleanCode,
            _id: { $ne: couponId },
            isDeleted: false
        });
        if (existingCoupon) {
            return res.status(HTTP_STATUS.CONFLICT).json({
                success: false,
                message: "Coupon code already exists."
            });
        }

        const parsedVal = parseFloat(couponDiscountValue);
        const parsedMin = parseFloat(minPurchaseAmount);
        const parsedMax = (type === 'percentage' && maxDiscount) ? parseFloat(maxDiscount) : null;

        if (isNaN(parsedVal) || parsedVal <= 0) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Discount value must be a positive number."
            });
        }

        if (type === 'percentage' && parsedVal > 100) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Percentage discount cannot exceed 100%."
            });
        }

        if (parsedMax !== null && (isNaN(parsedMax) || parsedMax <= 0)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Maximum discount must be greater than 0."
            });
        }

        if (isNaN(parsedMin) || parsedMin <= 0) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Minimum purchase amount must be greater than 0."
            });
        }

        const expiry = new Date(expiryDate);
        if (isNaN(expiry.getTime())) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid expiry date format."
            });
        }

        const now = new Date();
        const todayDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const expiryDateOnly = new Date(expiry.getFullYear(), expiry.getMonth(), expiry.getDate());
        if (expiryDateOnly < todayDateOnly) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Expiry date must be today or a future date."
            });
        }

        coupon.code = cleanCode;
        coupon.discountType = type;
        coupon.discountValue = parsedVal;
        coupon.maxDiscount = parsedMax;
        coupon.minPurchaseAmount = parsedMin;
        coupon.expiryDate = expiry;
        coupon.isActive = isActive === "false" || isActive === false ? false : true;

        await coupon.save();

        res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Coupon updated successfully!",
            data: coupon
        });
    } catch (error) {
        console.error("Update Coupon Error:", error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: "Failed to update coupon."
        });
    }
};

/**
 * Soft delete a coupon
 */
exports.deleteCoupon = async (req, res) => {
    try {
        const couponId = req.params.id;

        if (!mongoose.Types.ObjectId.isValid(couponId)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid coupon id."
            });
        }

        const coupon = await Coupon.findOneAndUpdate(
            { _id: couponId, isDeleted: false },
            { $set: { isDeleted: true } },
            { new: true }
        );

        if (!coupon) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                success: false,
                message: "Coupon not found."
            });
        }

        res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Coupon deleted successfully."
        });
    } catch (error) {
        console.error("Delete Coupon Error:", error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: "Failed to delete coupon."
        });
    }
};

/**
 * Apply coupon to checkout session
 */
exports.applyCoupon = async (req, res) => {
    try {
        const { code } = req.body;
        const userId = req.user._id;

        if (!code) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Please enter a coupon code."
            });
        }

        if (req.session.couponCode) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Only one coupon is allowed per order."
            });
        }

        // Fetch Cart
        const cart = await Cart.findOne({ userId }).populate({
            path: "items.productId",
            populate: { path: "category" }
        });

        if (!cart || cart.items.length === 0) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Your cart is empty. Cannot apply coupon."
            });
        }

        // Get detailed totals
        const summary = getDetailedTotals(cart.items);
        const cartTotal = summary.cartTotal; // Active total after category & product discounts

        // Validate via service
        const validation = await couponService.validateCoupon(code, cartTotal, userId);

        if (!validation.isValid) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: validation.message
            });
        }

        // Store code in session
        req.session.couponCode = validation.coupon.code;

        res.status(HTTP_STATUS.OK).json({
            success: true,
            message: validation.message,
            couponCode: validation.coupon.code,
            discountAmount: validation.discountAmount,
            finalTotal: cartTotal - validation.discountAmount
        });

    } catch (error) {
        console.error("Apply Coupon Error:", error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: "Failed to apply coupon."
        });
    }
};

/**
 * Remove coupon from checkout session
 */
exports.removeCoupon = async (req, res) => {
    try {
        const userId = req.user._id;

        // Clear session coupon code
        delete req.session.couponCode;

        // Fetch Cart to recalculate original totals
        const cart = await Cart.findOne({ userId }).populate({
            path: "items.productId",
            populate: { path: "category" }
        });

        if (!cart || cart.items.length === 0) {
            return res.status(HTTP_STATUS.OK).json({
                success: true,
                message: "Coupon removed.",
                discountAmount: 0,
                finalTotal: 0
            });
        }

        const summary = getDetailedTotals(cart.items);

        res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Coupon removed successfully.",
            discountAmount: 0,
            finalTotal: summary.cartTotal
        });

    } catch (error) {
        console.error("Remove Coupon Error:", error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: "Failed to remove coupon."
        });
    }
};
