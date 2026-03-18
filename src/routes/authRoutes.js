const express = require("express");
const router = express.Router();
const passport = require("passport");

const authController = require("../controllers/authController");

// Standard Auth Logic
router.post("/signup", authController.signup);

// Google Auth Routes
router.get("/api/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

router.get("/api/auth/google/callback", 
  passport.authenticate("google", { failureRedirect: "/login" }), 
  (req, res) => {
    // If it's a completely new account created via Google OAuth
    if (req.user && req.user.isNewGoogleUser) {
        req.user.isNewGoogleUser = undefined; // clean transient tag
        req.session.save(() => {
            return res.redirect("/create-password");
        });
    } else {
        // Successful authentication, existing user, redirect to account dash or home
        req.session.save(() => {
            return res.redirect("/home");
        });
    }
  }
);

// Standard Login Route (Email + Password)
router.post("/login", authController.login);

// Create Password Route for Google Users
router.post("/create-password", authController.createPasswordPost);

// OTP Flow Routes
router.post("/verify-otp", authController.verifyOtp);
router.post("/resend-otp", authController.resendOtp);

// Forgot & Reset Password Routes
router.post("/api/auth/forgot-password", authController.forgotPassword);
router.post("/api/auth/reset-password", authController.resetPassword);

// Logout Route
router.get("/api/auth/logout", authController.logout);

module.exports = router;