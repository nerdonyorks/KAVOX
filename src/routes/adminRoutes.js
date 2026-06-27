const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const categoryController = require("../controllers/categoryController");
const productController = require("../controllers/productController");
const adminOrderController = require("../controllers/adminOrderController");
const couponController = require("../controllers/couponController");
const ledgerController = require("../controllers/ledgerController");
const bannerController = require("../controllers/bannerController");
const reviewController = require("../controllers/reviewController");
const { isAdmin, setNoCache, isLoggedOut } = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");

// Unprotected Login GET/POST
router.get("/admin/login", isLoggedOut, adminController.renderLogin);
router.post("/api/admin/login", adminController.loginAdmin);
router.get("/api/admin/logout", adminController.logoutAdmin);

// Protected Admin Dashboard & Management
router.get("/admin/dashboard", isAdmin, setNoCache, adminController.renderDashboard);
router.get("/admin/users", isAdmin, setNoCache, adminController.renderUserManagement);
router.get("/admin/users/:id", isAdmin, setNoCache, adminController.renderUserDetails);

// API Endpoints
router.patch("/api/admin/users/:id/block", isAdmin, adminController.blockUser);
router.patch("/api/admin/users/:id/unblock", isAdmin, adminController.unblockUser);
router.patch("/api/admin/users/:id/toggle-block", isAdmin, adminController.toggleUserBlock);

const { upload: cloudinaryUpload } = require("../config/cloudinary");

// Category Management Views & APIs
router.get("/admin/categories", isAdmin, setNoCache, categoryController.listCategories);
router.get("/api/admin/category", isAdmin, categoryController.getAllCategoriesAPI);
router.post("/api/admin/category", isAdmin, categoryController.createCategory);
router.put("/api/admin/category/:id", isAdmin, categoryController.updateCategory);
router.delete("/api/admin/category/:id", isAdmin, categoryController.deleteCategory);

// Product Management Views & APIs
router.get("/admin/products", isAdmin, setNoCache, (req, res) => res.render("admin/products"));
router.get("/api/admin/product", isAdmin, productController.listProducts);
router.get("/api/admin/product/:id", isAdmin, productController.getProductById);
router.post("/api/admin/product", isAdmin, upload.array("images", 10), productController.createProduct);
router.put("/api/admin/product/:id", isAdmin, upload.array("images", 10), productController.updateProduct);
router.delete("/api/admin/product/:id", isAdmin, productController.deleteProduct);

// Admin Order Management
router.get("/admin/orders", isAdmin, setNoCache, adminOrderController.getAdminOrders);

router.get("/admin/order/:id", isAdmin, setNoCache, adminOrderController.getAdminOrderDetails);
router.patch("/api/admin/order/:id/status", isAdmin, adminOrderController.updateOrderStatus);
router.patch("/api/admin/order/:orderId/item/:itemId/status", isAdmin, adminOrderController.updateItemStatus);
router.post("/api/admin/order/:id/return", isAdmin, adminOrderController.handleReturnRequest);

// Coupon Management
router.get("/admin/coupons", isAdmin, setNoCache, couponController.listCoupons);
router.post("/api/admin/coupon", isAdmin, couponController.createCoupon);
router.put("/api/admin/coupon/:id", isAdmin, couponController.updateCoupon);
router.delete("/api/admin/coupon/:id", isAdmin, couponController.deleteCoupon);

// Dashboard Analytics APIs
router.get("/admin/dashboard/summary", isAdmin, setNoCache, adminController.getDashboardSummaryAPI);
router.get("/admin/dashboard/sales", isAdmin, setNoCache, adminController.getSalesAnalyticsAPI);
router.get("/admin/dashboard/top-products", isAdmin, setNoCache, adminController.getTopProductsAPI);
router.get("/admin/dashboard/top-categories", isAdmin, setNoCache, adminController.getTopCategoriesAPI);
router.get("/admin/dashboard/top-brands", isAdmin, setNoCache, adminController.getTopBrandsAPI);
router.get("/admin/dashboard/top-toprated", isAdmin, setNoCache, adminController.getTopRatedProductsAPI);
router.get("/admin/dashboard/top-lowestrated", isAdmin, setNoCache, adminController.getLowestRatedProductsAPI);

// Ledger Book Views & APIs
router.get("/admin/ledger", isAdmin, setNoCache, ledgerController.renderLedger);
router.get("/admin/ledger/data", isAdmin, setNoCache, ledgerController.getLedgerDataAPI);
router.get("/admin/ledger/download/pdf", isAdmin, setNoCache, ledgerController.downloadLedgerPdf);
router.get("/admin/ledger/download/excel", isAdmin, setNoCache, ledgerController.downloadLedgerExcel);

// Banner Management Views & APIs
router.get("/admin/banners", isAdmin, setNoCache, bannerController.renderBannersList);
router.post("/api/admin/banners", isAdmin, upload.single("image"), bannerController.createBanner);
router.put("/api/admin/banners/:id", isAdmin, upload.single("image"), bannerController.updateBanner);
router.delete("/api/admin/banners/:id", isAdmin, bannerController.deleteBanner);
router.patch("/api/admin/banners/:id/toggle", isAdmin, bannerController.toggleBannerStatus);

// Admin Review Management
router.get("/admin/reviews", isAdmin, setNoCache, reviewController.renderAdminReviews);
router.patch("/api/admin/reviews/:id/status", isAdmin, reviewController.updateReviewStatus);
router.delete("/api/admin/reviews/:id", isAdmin, reviewController.deleteReviewAdmin);

module.exports = router;
