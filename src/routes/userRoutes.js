const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const productController = require("../controllers/productController");
const cartController = require("../controllers/cartController");
const wishlistController = require("../controllers/wishlistController");
const orderController = require("../controllers/orderController");
const orderManagementController = require("../controllers/orderManagementController");
const couponController = require("../controllers/couponController");
const reviewController = require("../controllers/reviewController");
const { isLoggedIn, isLoggedOut } = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");

// Public / Guest Routes
router.get("/", userController.renderHome);
router.get("/home", userController.renderHome);
router.get("/signup", isLoggedOut, userController.renderSignup);
router.get("/login", isLoggedOut, userController.renderLogin);
router.get("/api/user/counts", userController.getUserCounts);
router.get("/verify-otp", userController.renderOtpVerify);
router.get("/forgot-password", isLoggedOut, userController.renderForgotPassword);
router.get("/reset-password", isLoggedOut, userController.renderResetPassword);
router.get("/user/new-password", isLoggedOut, userController.renderNewPassword);

// Policy / Footer Info Routes
router.get("/shipping", userController.renderShippingPolicy);
router.get("/terms", userController.renderTermsOfUse);
router.get("/security", userController.renderSecurityPolicy);
router.get("/privacy", userController.renderPrivacyPolicy);

// Product Routes
router.get("/shop", productController.userListProducts);
router.get("/product/:id", productController.userGetProductDetails);
router.get("/api/products/:id/status", productController.checkProductStatus);

// Cart Routes
router.get("/cart", isLoggedIn, cartController.getCart);
router.post("/api/cart/add", isLoggedIn, cartController.addToCart);
router.patch("/api/cart/quantity", isLoggedIn, cartController.updateQuantity);
router.delete("/api/cart/remove/:itemId", isLoggedIn, cartController.removeFromCart);


// Wishlist Routes
router.get("/wishlist", isLoggedIn, wishlistController.getWishlist);
router.post("/api/wishlist/toggle", isLoggedIn, wishlistController.toggleWishlist);

// Checkout & Order Routes
router.get("/checkout", isLoggedIn, orderController.getCheckout);
router.get("/api/checkout/summary", isLoggedIn, orderController.getCheckoutSummary);
router.post("/api/checkout/place-order", isLoggedIn, orderController.placeOrder);
router.post("/api/checkout/apply-coupon", isLoggedIn, couponController.applyCoupon);
router.post("/api/checkout/remove-coupon", isLoggedIn, couponController.removeCoupon);
router.get("/coupons", isLoggedIn, couponController.renderUserCoupons);
router.get("/order-success", isLoggedIn, async (req, res) => {
    try {
        const orderId = req.query.id;
        const Order = require("../models/orderModel");
        const order = await Order.findOne({ orderId, userId: req.user._id });
        if (!order) {
            return res.redirect("/");
        }
        res.render("user/order-success", { 
            title: "Order Success - KAVOX", 
            orderId: order.orderId,
            paymentId: order.razorpayPaymentId || 'N/A',
            amountPaid: order.pricing.total
        });
    } catch (error) {
        console.error("Order success page error:", error);
        res.redirect("/");
    }
});

// Order Management Routes
router.get("/orders", isLoggedIn, orderManagementController.getUserOrders);

router.get("/order/:id", isLoggedIn, orderManagementController.getOrderDetails);
router.post("/api/order/:id/cancel", isLoggedIn, orderManagementController.cancelOrder);
router.post("/api/order/:id/item/:itemId/cancel", isLoggedIn, orderManagementController.cancelOrderItem);
router.post("/api/order/:id/return", isLoggedIn, orderManagementController.requestReturn);
router.get("/order/:id/invoice", isLoggedIn, orderManagementController.downloadInvoice);

// Protected User View Routes (Render)
router.get("/account", isLoggedIn, userController.renderAccount);
router.get("/profile/edit", isLoggedIn, userController.renderEditProfile);
router.post("/profile/update", isLoggedIn, upload.single("profileImage"), userController.updateProfile);
router.get("/profile/reset-password", isLoggedIn, userController.renderProfileResetPassword);
router.get("/user/address", isLoggedIn, userController.renderAddress);
router.get("/address/add", isLoggedIn, userController.renderAddAddress);
router.get("/address/edit/:id", isLoggedIn, userController.renderEditAddress);

// Protected User API Routes (Data Operations)
router.post("/api/users/profile/upload", isLoggedIn, upload.single("profileImage"), userController.uploadProfileImage);
router.patch("/api/users/profile", isLoggedIn, upload.single("profileImage"), userController.updateProfile);
router.patch("/api/users/profile/password", isLoggedIn, userController.updateProfilePassword);

router.post("/api/users/addresses", isLoggedIn, userController.addAddress);
router.put("/api/users/addresses/:id", isLoggedIn, userController.updateAddress);
router.delete("/api/users/addresses/:id", isLoggedIn, userController.deleteAddress);
router.patch("/api/users/addresses/:id/default", isLoggedIn, userController.setDefaultAddress);

router.get("/api/products/:id/variants", productController.userGetProductVariants);

// Product Review Routes
router.post("/api/reviews", isLoggedIn, upload.array("images", 5), reviewController.createOrUpdateReview);
router.put("/api/reviews/:id", isLoggedIn, upload.array("images", 5), reviewController.createOrUpdateReview);
router.delete("/api/reviews/:id", isLoggedIn, reviewController.deleteReview);
router.get("/api/reviews/product/:productId", reviewController.getProductReviews);

module.exports = router;
