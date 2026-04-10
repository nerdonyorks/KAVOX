const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const categoryController = require("../controllers/categoryController");
const productController = require("../controllers/productController");
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
router.get("/admin/categories", isAdmin, setNoCache, (req, res) => res.render("admin/categories"));
router.get("/api/admin/category", isAdmin, categoryController.listCategories);
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

module.exports = router;
