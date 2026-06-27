const Cart = require("../models/cartModel");
const Order = require("../models/orderModel");
const Product = require("../models/productModel");
const User = require("../models/userModel");
const couponService = require("../services/couponService");
const { HTTP_STATUS, MESSAGES } = require("../utils/constants");
const offerService = require("../services/offerService");

const getDetailedTotals = (items) => {
    let totalActualPrice = 0;
    let totalProductDiscount = 0;
    let totalCategoryDiscount = 0;
    let cartTotal = 0;

    items.forEach(item => {
        if (item.isUnavailable) return;
        const product = item.productId;
        if (!product) return;
        const qty = item.quantity;
        const basePrice = product.price;
        const basePriceTotal = basePrice * qty;
        totalActualPrice += basePriceTotal;

        const pricing = offerService.getDiscountedPrice(product);
        const finalItemPrice = pricing.finalPrice;
        const bestOffer = pricing.discountPercentage;
        const offerType = pricing.offerType;

        const savedOnItem = (basePrice - finalItemPrice) * qty;

        // Attribute saving to the winning offer type
        if (offerType === 'PRODUCT') {
            totalProductDiscount += savedOnItem;
        } else if (offerType === 'CATEGORY') {
            totalCategoryDiscount += savedOnItem;
        }

        cartTotal += finalItemPrice * qty;
    });

    return {
        totalActualPrice,
        totalProductDiscount,
        totalCategoryDiscount,
        cartTotal
    };
};

exports.getDetailedTotals = getDetailedTotals;

const generateOrderId = () => {
    return 'ODR-' + Math.floor(100000000 + Math.random() * 900000000).toString();
};

exports.getCheckout = async (req, res) => {
    try {
        const userId = req.user._id;

        // Fetch Cart
        const cart = await Cart.findOne({ userId }).populate({
            path: "items.productId",
            populate: { path: "category" }
        });

        if (!cart || cart.items.length === 0) {
            return res.redirect("/cart");
        }

        // Populate active offers first
        if (cart.items.length > 0) {
            const products = cart.items.map(item => item.productId).filter(Boolean);
            await offerService.populateProductOffers(products);
        }

        // Validate items are still active and in stock
        let hasUnavailable = false;
        let checkoutValidationErrors = [];

        cart.items.forEach(item => {
            const product = item.productId;
            if (!product || product.isDeleted || !product.isActive || !product.category || !product.category.isActive || product.category.isDeleted) {
                item.isUnlisted = true;
                item.isUnavailable = true;
                hasUnavailable = true;
                const msg = "This product has been unlisted by the admin and must be removed before proceeding.";
                if (!checkoutValidationErrors.includes(msg)) {
                    checkoutValidationErrors.push(msg);
                }
            } else {
                const variant = product.variants.find(v => v.size === item.size && v.color === item.color);
                if (!variant || !variant.isActive) {
                    item.isUnavailable = true;
                    hasUnavailable = true;
                    checkoutValidationErrors.push(`The selected variant for ${product.name} is unavailable.`);
                } else if (variant.quantity <= 0) {
                    item.isUnavailable = true;
                    hasUnavailable = true;
                    checkoutValidationErrors.push(`${product.name} (${item.size}/${item.color}) is out of stock.`);
                } else if (variant.quantity < item.quantity) {
                    item.isUnavailable = true;
                    hasUnavailable = true;
                    checkoutValidationErrors.push(`Insufficient stock for ${product.name} (${item.size}/${item.color}). Only ${variant.quantity} available.`);
                }
            }
        });

        const summary = getDetailedTotals(cart.items);
        
        // Fetch User Addresses
        const user = await User.findById(userId);
        const addresses = user.addresses || [];

        // Check if coupon is applied in session and is still valid
        let couponDiscount = 0;
        let appliedCouponCode = "";
        if (req.session.couponCode) {
            const validation = await couponService.validateCoupon(req.session.couponCode, summary.cartTotal, userId);
            if (validation.isValid) {
                couponDiscount = validation.discountAmount;
                appliedCouponCode = validation.coupon.code;
            } else {
                if (validation.coupon && summary.cartTotal < validation.coupon.minPurchaseAmount) {
                    req.session.couponRemovedMessage = `Coupon removed because the order value no longer meets the minimum purchase requirement of ₹${validation.coupon.minPurchaseAmount}.`;
                }
                delete req.session.couponCode;
            }
        }

        const availableCoupons = await couponService.getAvailableCoupons();

        const walletService = require("../services/walletService");
        const wallet = await walletService.getWallet(userId);

        const couponRemovedMessage = req.session.couponRemovedMessage || "";
        delete req.session.couponRemovedMessage;

        res.render("user/checkout", {
            title: "Checkout - KAVOX",
            cart,
            summary,
            addresses,
            appliedCouponCode,
            couponDiscount,
            availableCoupons,
            wallet,
            couponRemovedMessage,
            hasUnavailable,
            checkoutValidationErrors
        });
    } catch (error) {
        console.error("Get Checkout Error:", error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).render("user/error", {
            message: "Failed to load checkout."
        });
    }
};

exports.placeOrder = async (req, res) => {
    try {
        const userId = req.user._id;
        const { addressId, paymentMethod } = req.body;
        const useWallet = req.body.useWallet === true || req.body.useWallet === 'true';

        if (!addressId || !paymentMethod) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Address and Payment Method are required." });
        }

        const validMethods = ['COD', 'WALLET'];
        if (!validMethods.includes(paymentMethod)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Invalid payment method for synchronous checkout." });
        }

        const user = await User.findById(userId);
        const address = user.addresses.id(addressId);
        if (!address) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Invalid shipping address." });
        }

        const cart = await Cart.findOne({ userId }).populate({
            path: "items.productId",
            populate: { path: "category" }
        });

        if (!cart || cart.items.length === 0) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Cart is empty." });
        }

        // Populate active offers first
        if (cart.items.length > 0) {
            const products = cart.items.map(item => item.productId).filter(Boolean);
            await offerService.populateProductOffers(products);
        }

        // Verify stock one last time
        for (let item of cart.items) {
            const product = item.productId;
            if (!product || product.isDeleted || !product.isActive || !product.category || !product.category.isActive || product.category.isDeleted) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: `Product ${product?.name || ''} is no longer available.` });
            }
            const variant = product.variants.find(v => v.size === item.size && v.color === item.color);
            if (!variant || !variant.isActive) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: `Variant for ${product.name} is no longer available.` });
            }
            if (variant.quantity <= 0) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: `${product.name} (${item.size}/${item.color}) is out of stock.` });
            }
            if (variant.quantity < item.quantity) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: `Insufficient stock for ${product.name} (${item.size}/${item.color}). Only ${variant.quantity} available.` });
            }
        }

        const summary = getDetailedTotals(cart.items);

        let couponDiscount = 0;
        let appliedCouponCode = "";
        if (req.session.couponCode) {
            const validation = await couponService.validateCoupon(req.session.couponCode, summary.cartTotal, userId);
            if (validation.isValid) {
                couponDiscount = validation.discountAmount;
                appliedCouponCode = validation.coupon.code;
            } else {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: validation.message });
            }
        }

        const expectedTotal = summary.cartTotal - couponDiscount;

        // Wallet calculations
        let walletAmountUsed = 0;
        let remainingAmountPaid = expectedTotal;
        let finalPaymentStatus = 'Pending';

        const walletService = require("../services/walletService");
        
        if (useWallet) {
            const wallet = await walletService.getWallet(userId);
            if (wallet.balance > 0) {
                if (paymentMethod === 'WALLET') {
                    if (wallet.balance < expectedTotal) {
                        return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Insufficient wallet balance for full payment." });
                    }
                    walletAmountUsed = expectedTotal;
                    remainingAmountPaid = 0;
                    finalPaymentStatus = 'Completed';
                } else if (paymentMethod === 'COD') {
                    walletAmountUsed = Math.min(wallet.balance, expectedTotal);
                    remainingAmountPaid = expectedTotal - walletAmountUsed;
                    if (remainingAmountPaid === 0) {
                        return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Wallet fully covers this order. Please select Wallet payment method." });
                    }
                }
            } else {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Wallet balance is zero." });
            }
        } else {
            if (paymentMethod === 'WALLET') {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "You must enable wallet usage to pay via wallet." });
            }
        }

        // Validate wallet balance before order creation
        if (walletAmountUsed > 0) {
            const hasSufficientBalance = await walletService.verifyWalletBalance(userId, walletAmountUsed);
            if (!hasSufficientBalance) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Insufficient wallet balance." });
            }
        }

        // Deduct stock
        for (let item of cart.items) {
            const product = item.productId;
            const variant = product.variants.find(v => v.size === item.size && v.color === item.color);
            variant.quantity -= item.quantity;
            await product.save();
        }

        // Create Order items array
        const orderItems = cart.items.map(item => {
            const product = item.productId;
            const variant = product.variants.find(v => v.size === item.size && v.color === item.color);

            const pricing = offerService.getDiscountedPrice(product);
            const finalPrice = pricing.finalPrice;

            return {
                productId: product._id,
                variantId: variant ? variant._id : null,
                productName: product.name,
                size: item.size,
                color: item.color,
                quantity: item.quantity,
                price: finalPrice,
                totalPrice: item.quantity * finalPrice
            };
        });

        const newOrderId = 'ODR-' + Math.floor(100000000 + Math.random() * 900000000).toString();

        const newOrder = new Order({
            userId,
            orderId: newOrderId,
            shippingAddress: {
                firstName: address.firstName,
                lastName: address.lastName,
                street: address.street,
                city: address.city,
                state: address.state,
                pincode: address.pincode,
                mobile: address.mobile
            },
            items: orderItems,
            pricing: {
                subtotal: summary.totalActualPrice,
                discount: summary.totalProductDiscount + summary.totalCategoryDiscount + couponDiscount,
                shipping: 0,
                total: expectedTotal
            },
            couponCode: appliedCouponCode || undefined,
            couponDiscount: couponDiscount,
            paymentMethod: paymentMethod,
            paymentStatus: finalPaymentStatus,
            orderStatus: 'Processing',
            walletAmountUsed: walletAmountUsed,
            remainingAmountPaid: remainingAmountPaid
        });

        await newOrder.save();

        // Perform Wallet deduction after successful order placement
        if (walletAmountUsed > 0) {
            try {
                await walletService.debitWallet(userId, walletAmountUsed, 'WALLET_PAYMENT', newOrderId);
            } catch (walletError) {
                // Rollback Order creation
                await Order.deleteOne({ _id: newOrder._id });
                // Restore stock
                for (let item of cart.items) {
                    const product = item.productId;
                    const variant = product.variants.find(v => v.size === item.size && v.color === item.color);
                    if (variant) {
                        variant.quantity += item.quantity;
                        await product.save();
                    }
                }
                return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: walletError.message || "Failed to process wallet payment." });
            }
        }

        // Clear coupon code from session
        delete req.session.couponCode;

        // Clear Cart
        cart.items = [];
        cart.cartTotal = 0;
        await cart.save();

        res.status(HTTP_STATUS.OK).json({ 
            success: true, 
            message: "Order placed successfully!",
            orderId: newOrder.orderId
        });

    } catch (error) {
        console.error("Place Order Error:", error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to place order." });
    }
};

exports.getCheckoutSummary = async (req, res) => {
    try {
        const userId = req.user._id;
        const cart = await Cart.findOne({ userId }).populate({
            path: "items.productId",
            populate: { path: "category" }
        });

        if (!cart || cart.items.length === 0) {
            return res.json({
                success: true,
                summary: { totalActualPrice: 0, totalProductDiscount: 0, totalCategoryDiscount: 0, cartTotal: 0 },
                couponDiscount: 0,
                appliedCouponCode: "",
                couponRemovedMessage: "",
                finalTotal: 0
            });
        }

        // Populate active offers first
        const products = cart.items.map(item => item.productId).filter(Boolean);
        await offerService.populateProductOffers(products);

        // Mark items as unavailable/unlisted to exclude them from detailed totals
        cart.items.forEach(item => {
            const product = item.productId;
            if (!product || product.isDeleted || !product.isActive || !product.category || !product.category.isActive || product.category.isDeleted) {
                item.isUnavailable = true;
            } else {
                const variant = product.variants.find(v => v.size === item.size && v.color === item.color);
                if (!variant || !variant.isActive || variant.quantity <= 0) {
                    item.isUnavailable = true;
                }
            }
        });

        const summary = getDetailedTotals(cart.items);

        let couponDiscount = 0;
        let appliedCouponCode = "";
        let couponRemovedMessage = "";

        if (req.session.couponCode) {
            const validation = await couponService.validateCoupon(req.session.couponCode, summary.cartTotal, userId);
            if (validation.isValid) {
                couponDiscount = validation.discountAmount;
                appliedCouponCode = validation.coupon.code;
            } else {
                if (validation.coupon && summary.cartTotal < validation.coupon.minPurchaseAmount) {
                    couponRemovedMessage = `Coupon removed because the order value no longer meets the minimum purchase requirement of ₹${validation.coupon.minPurchaseAmount}.`;
                }
                delete req.session.couponCode;
            }
        }

        res.json({
            success: true,
            summary,
            couponDiscount,
            appliedCouponCode,
            couponRemovedMessage,
            finalTotal: summary.cartTotal - couponDiscount
        });
    } catch (error) {
        console.error("Get Checkout Summary Error:", error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to recalculate totals." });
    }
};
