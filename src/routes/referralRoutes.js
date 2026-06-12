const express = require("express");
const router = express.Router();
const referralController = require("../controllers/referralController");
const { isLoggedIn, setNoCache } = require("../middleware/authMiddleware");

// User Referral Dashboard
router.get("/referral", isLoggedIn, setNoCache, referralController.renderReferralDashboard);

module.exports = router;
