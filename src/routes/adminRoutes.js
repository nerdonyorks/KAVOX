const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const { isAdmin, setNoCache, isLoggedOut } = require("../middleware/authMiddleware");

// Unprotected Login GET/POST
router.get("/admin/login", isLoggedOut, adminController.renderLogin);
router.post("/admin/login", adminController.loginAdmin);
router.get("/admin/logout", adminController.logoutAdmin);

// Protected Admin Dashboard & Management
router.get("/admin/dashboard", isAdmin, setNoCache, adminController.renderDashboard);
router.get("/admin/userManagment", isAdmin, setNoCache, adminController.renderUserManagement);
router.get("/admin/users", isAdmin, setNoCache, adminController.renderUserManagement);
router.get("/admin/users/view/:id", isAdmin, setNoCache, adminController.renderUserDetails);

// API Endpoints
router.post("/admin/users/block/:id", isAdmin, adminController.blockUser);
router.post("/admin/users/unblock/:id", isAdmin, adminController.unblockUser);
router.post("/api/admin/users/:id/toggle-block", isAdmin, adminController.toggleUserBlock);

module.exports = router;
