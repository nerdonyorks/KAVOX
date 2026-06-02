const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const productController = require("../controllers/productController");
const cartController = require("../controllers/cartController");
const wishlistController = require("../controllers/wishlistController");
const orderController = require("../controllers/orderController");
const orderManagementController = require("../controllers/orderManagementController");
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
router.post("/api/checkout/place-order", isLoggedIn, orderController.placeOrder);
router.get("/order-success", isLoggedIn, (req, res) => {
    const orderId = req.query.id;
    res.render("user/order-success", { title: "Order Success", orderId });
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

module.exports = router;