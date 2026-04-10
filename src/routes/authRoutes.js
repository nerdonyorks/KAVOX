const express = require("express");
const router = express.Router();
const passport = require("passport");

const authController = require("../controllers/authController");

// Standard Auth Logic
router.post("/api/auth/signup", authController.signup);
router.post("/signup", authController.signup);

// Google Auth Routes
router.get("/api/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

router.get("/api/auth/google/callback", (req, res, next) => {
    passport.authenticate("google", (err, user, info) => {
        if (err) return next(err);
        
        if (!user) {
            if (info && info.message === "suspended") {
                return res.redirect("/login?error=suspended");
            }
            return res.redirect("/login");
        }

        // Prevent admins from logging in via the user session (Google)
        if (user.role === 'admin') {
            return res.redirect("/admin/login?error=admin_via_google");
        }

        req.logIn(user, (err) => {
            if (err) return next(err);
            req.session.save(() => {
                return res.redirect("/home");
            });
        });
    })(req, res, next);
});

// Standard Login Route (Email + Password)
router.post("/api/auth/login", authController.login);
router.post("/login", authController.login);

// OTP Flow Routes
router.post("/api/auth/verify-otp", authController.verifyOtp);
router.post("/verify-otp", authController.verifyOtp);
router.post("/api/auth/resend-otp", authController.resendOtp);

// Forgot & Reset Password Routes
router.post("/api/auth/forgot-password", authController.forgotPassword);
router.post("/api/auth/reset-password", authController.resetPassword);

// Logout Route
router.get("/api/auth/logout", authController.logout);

module.exports = router;