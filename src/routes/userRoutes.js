const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const productController = require("../controllers/productController");
const cartController = require("../controllers/cartController");
const wishlistController = require("../controllers/wishlistController");
const { isLoggedIn, isLoggedOut } = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");

// Public / Guest Routes
router.get("/", userController.renderHome);
router.get("/home", userController.renderHome);
router.get("/signup", isLoggedOut, userController.renderSignup);
router.get("/login", isLoggedOut, userController.renderLogin);
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