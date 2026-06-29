const express = require("express");
const router = express.Router();
const walletController = require("../controllers/walletController");
const { isLoggedIn, isAdmin, setNoCache } = require("../middleware/authMiddleware");

// User Dashboard & APIs
router.get("/wallet", isLoggedIn, setNoCache, walletController.renderWalletDashboard);
router.get("/api/wallet", isLoggedIn, walletController.getWalletDetailsAPI);

// Admin Console Ledger & Management
router.get("/admin/wallets", isAdmin, setNoCache, walletController.renderAdminWallets);
router.get("/admin/wallet/:userId", isAdmin, setNoCache, walletController.renderAdminWalletDetails);

module.exports = router;
