const Cart = require("../models/cartModel");
const Product = require("../models/productModel");
const Wishlist = require("../models/wishlist");
const { HTTP_STATUS, MESSAGES } = require("../utils/constants");
const offerService = require("../services/offerService");

// Helper to calculate cart totals
const calculateTotals = (items) => {
    return items.reduce((acc, item) => acc + (item.isUnavailable ? 0 : item.totalPrice), 0);
};

// Helper for detailed summary breakdown
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

/**
 * Render Cart Page
 */
exports.getCart = async (req, res) => {
    try {
        const userId = req.user._id;
        let cart = await Cart.findOne({ userId }).populate({
            path: "items.productId",
            populate: { path: "category" }
        });

        if (!cart) {
            cart = new Cart({ userId, items: [], cartTotal: 0 });
            await cart.save();
        }

        // Validate items and Refresh Prices (to handle offer changes)
        let hasChanges = false;
        let validationErrors = [];

        // Populate active offers first
        if (cart.items.length > 0) {
            const products = cart.items.map(item => item.productId).filter(Boolean);
            await offerService.populateProductOffers(products);
        }

        cart.items.forEach(item => {
            const product = item.productId;
            if (!product || product.isDeleted || !product.isActive || !product.category || !product.category.isActive || product.category.isDeleted) {
                item.isUnlisted = true;
                item.isUnavailable = true;
                const msg = "This product has been unlisted by the admin and must be removed before proceeding.";
                if (!validationErrors.includes(msg)) {
                    validationErrors.push(msg);
                }
            } else {
                // Variant check
                const variant = product.variants.find(v => v.size === item.size && v.color === item.color);
                if (!variant || !variant.isActive) {
                    item.isUnavailable = true;
                    validationErrors.push(`The selected variant for ${product.name} is unavailable.`);
                } else {
                    // Quantity validation
                    if (variant.quantity <= 0) {
                        item.isUnavailable = true;
                        validationErrors.push(`${product.name} (${item.size}/${item.color}) is out of stock.`);
                    } else if (item.quantity > variant.quantity) {
                        hasChanges = true;
                        validationErrors.push(`Quantity for ${product.name} (${item.size}/${item.color}) adjusted to maximum available stock (${variant.quantity}).`);
                        item.quantity = variant.quantity;
                        item.totalPrice = item.quantity * item.price;
                    }
                }

                // RECALCULATE PRICE (Dynamic Sync)
                if (!item.isUnavailable) {
                    const pricing = offerService.getDiscountedPrice(product);
                    const currentFinalPrice = pricing.finalPrice;

                    // If price stored in cart is different from current offer-aware price, update it
                    if (item.price !== currentFinalPrice) {
                        item.price = currentFinalPrice;
                        item.totalPrice = item.quantity * currentFinalPrice;
                        hasChanges = true;
                    }
                }
            }
        });

        if (hasChanges) {
            cart.cartTotal = calculateTotals(cart.items);
            await cart.save();
        }

        const summary = getDetailedTotals(cart.items);

        res.render("user/cart", {
            title: "Shopping Cart - KAVOX",
            cart,
            summary,
            validationErrors
        });
    } catch (error) {
        console.error("Get Cart Error:", error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).render("user/error", {
            message: "Failed to load cart."
        });
    }
};

/**
 * API: Add Item to Cart
 */
exports.addToCart = async (req, res) => {
    try {
        const { productId, size, color, variantId, quantity = 1 } = req.body;
        const userId = req.user._id;

        // 1. Validate Product (Populate category for offer calculation)
        const product = await Product.findOne({ _id: productId, isDeleted: false, isActive: true }).populate("category");
        if (!product || !product.category || !product.category.isActive || product.category.isDeleted) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Product no longer available." });
        }

        // Populate active offers
        await offerService.populateProductOffers(product);

        // 2. Find Variant (Prefer variantId if passed)
        let variant;
        if (variantId) {
            variant = product.variants.id(variantId);
        } else {
            variant = product.variants.find(v => v.size === size && v.color === color);
        }

        if (!variant || !variant.isActive) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Selected variant not available." });
        }

        if (variant.quantity <= 0) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Product is out of stock." });
        }

        if (variant.quantity < quantity) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: `Only ${variant.quantity} items left in stock.` });
        }

        // 3. Fetch or Create Cart
        let cart = await Cart.findOne({ userId });
        if (!cart) {
            cart = new Cart({ userId, items: [] });
        }

        // 4. Check for existing item with same variant
        const existingItemIndex = cart.items.findIndex(
            item => item.productId.toString() === productId &&
                item.size === variant.size &&
                item.color === variant.color
        );

        const pricing = offerService.getDiscountedPrice(product);
        const finalPrice = pricing.finalPrice;

        if (existingItemIndex > -1) {
            const newQty = cart.items[existingItemIndex].quantity + parseInt(quantity);
            if (newQty > variant.quantity) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Cannot exceed available stock." });
            }
            if (newQty > 10) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Maximum limit per item is 10." });
            }
            cart.items[existingItemIndex].quantity = newQty;
            cart.items[existingItemIndex].totalPrice = cart.items[existingItemIndex].quantity * finalPrice;
        } else {
            cart.items.push({
                productId,
                size: variant.size,
                color: variant.color,
                quantity: parseInt(quantity),
                price: finalPrice,
                totalPrice: parseInt(quantity) * finalPrice
            });
        }

        cart.cartTotal = calculateTotals(cart.items);
        await cart.save();

        // 4. Remove from Wishlist if present (Integration requirement)
        await Wishlist.findOneAndUpdate(
            { userId },
            { $pull: { products: productId } }
        );

        res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Added to cart successfully.",
            cartCount: cart.items.reduce((acc, item) => acc + item.quantity, 0)
        });

    } catch (error) {
        console.error("Add to Cart Error:", error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGES.INTERNAL_SERVER_ERROR });
    }
};

/**
 * API: Update Item Quantity
 */
exports.updateQuantity = async (req, res) => {
    try {
        const { itemId, change } = req.body;
        const userId = req.user._id;

        const cart = await Cart.findOne({ userId }).populate({
            path: "items.productId",
            populate: { path: "category" }
        });
        if (!cart) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Cart not found." });

        const item = cart.items.id(itemId);
        if (!item) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Item not found in cart." });

        const product = item.productId;
        if (!product || product.isDeleted || !product.isActive || !product.category || !product.category.isActive || product.category.isDeleted) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Product is no longer available." });
        }

        // Populate active offers
        await offerService.populateProductOffers(product);

        const variant = product.variants.find(v => v.size === item.size && v.color === item.color);
        if (!variant || !variant.isActive) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Selected variant is no longer available." });
        }

        const newQty = item.quantity + change;

        if (newQty < 1) return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Quantity cannot be less than 1." });
        if (newQty > 10) return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Max 10 units allowed per product." });

        if (newQty > variant.quantity) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Insufficient stock available." });
        }

        // Recalculate price in case offers changed
        const pricing = offerService.getDiscountedPrice(product);
        const currentFinalPrice = pricing.finalPrice;

        item.price = currentFinalPrice;
        item.quantity = newQty;
        item.totalPrice = item.quantity * item.price;
        cart.cartTotal = calculateTotals(cart.items);
        await cart.save();

        const summary = getDetailedTotals(cart.items);

        res.json({
            success: true,
            newQty: item.quantity,
            itemTotal: item.totalPrice,
            summary,
            cartCount: cart.items.reduce((acc, item) => acc + item.quantity, 0)
        });

    } catch (error) {
        console.error("Update Qty Error:", error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to update quantity." });
    }
};

/**
 * API: Remove Item from Cart
 */
exports.removeFromCart = async (req, res) => {
    try {
        const { itemId } = req.params;
        const userId = req.user._id;

        const cart = await Cart.findOne({ userId }).populate({
            path: "items.productId",
            populate: { path: "category" }
        });
        if (!cart) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Cart not found." });

        cart.items = cart.items.filter(item => item._id.toString() !== itemId);

        if (cart.items.length > 0) {
            const products = cart.items.map(item => item.productId).filter(Boolean);
            await offerService.populateProductOffers(products);
        }

        let validationErrors = [];
        cart.items.forEach(item => {
            const product = item.productId;
            if (!product || product.isDeleted || !product.isActive || !product.category || !product.category.isActive || product.category.isDeleted) {
                item.isUnlisted = true;
                item.isUnavailable = true;
                const msg = "This product has been unlisted by the admin and must be removed before proceeding.";
                if (!validationErrors.includes(msg)) {
                    validationErrors.push(msg);
                }
            } else {
                const variant = product.variants.find(v => v.size === item.size && v.color === item.color);
                if (!variant || !variant.isActive) {
                    item.isUnavailable = true;
                    validationErrors.push(`The selected variant for ${product.name} is unavailable.`);
                } else if (variant.quantity <= 0) {
                    item.isUnavailable = true;
                    validationErrors.push(`${product.name} (${item.size}/${item.color}) is out of stock.`);
                }
            }
        });

        cart.cartTotal = calculateTotals(cart.items);
        await cart.save();

        const summary = getDetailedTotals(cart.items);

        res.json({
            success: true,
            message: "Item removed from cart.",
            summary,
            cartCount: cart.items.reduce((acc, item) => acc + item.quantity, 0),
            validationErrors
        });
    } catch (error) {
        console.error("Remove from Cart Error:", error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to remove item." });
    }
};
