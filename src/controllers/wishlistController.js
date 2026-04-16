const Wishlist = require("../models/wishlist");
const Product = require("../models/productModel");
const { HTTP_STATUS, MESSAGES } = require("../utils/constants");

/**
 * Render Wishlist Page
 */
exports.getWishlist = async (req, res) => {
    try {
        const userId = req.user._id;
        const wishlist = await Wishlist.findOne({ userId }).populate({
          path: "products",
          match: { isDeleted: false, isActive: true },
          populate: { path: "category" }
        }).lean();
        
        // Filter out products from inactive categories
        if (wishlist && wishlist.products) {
            wishlist.products = wishlist.products.filter(p => 
                p && p.category && p.category.isActive && !p.category.isDeleted
            );
        }

        res.render("user/wishlist", {
            title: "Your Wishlist - KAVOX",
            wishlist: wishlist || { products: [] }
        });
    } catch (error) {
        console.error("Get Wishlist Error:", error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).render("user/error", {
            message: "Failed to load wishlist."
        });
    }
};

/**
 * API: Toggle Add/Remove from Wishlist
 */
exports.toggleWishlist = async (req, res) => {
    try {
        const { productId } = req.body;
        const userId = req.user._id;

        if (!productId) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Product ID required." });
        }

        let wishlist = await Wishlist.findOne({ userId });
        if (!wishlist) {
            wishlist = new Wishlist({ userId, products: [] });
        }

        const index = wishlist.products.indexOf(productId);
        let action = "";

        if (index > -1) {
            wishlist.products.splice(index, 1);
            action = "removed";
        } else {
            wishlist.products.push(productId);
            action = "added";
        }

        await wishlist.save();
        res.status(HTTP_STATUS.OK).json({ 
            success: true, 
            message: `Product ${action} ${action === 'added' ? 'to' : 'from'} wishlist.`,
            action
        });
    } catch (error) {
        console.error("Toggle Wishlist Error:", error);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ 
            success: false, 
            message: "Failed to update wishlist." 
        });
    }
};
