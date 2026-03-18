const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
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
router.get("/create-password", userController.renderCreatePassword);

// Protected User Routes
router.get("/account", isLoggedIn, userController.renderAccount);
router.get("/profile/edit", isLoggedIn, userController.renderEditProfile);
router.post("/profile/upload", isLoggedIn, upload.single("profileImage"), userController.uploadProfileImage);
router.post("/profile/update", isLoggedIn, upload.single("profileImage"), userController.updateProfile);
router.get("/profile/reset-password", isLoggedIn, userController.renderProfileResetPassword);
router.post("/profile/reset-password", isLoggedIn, userController.updateProfilePassword);

router.get("/user/address", isLoggedIn, userController.renderAddress);
router.get("/address/add", isLoggedIn, userController.renderAddAddress);
router.post("/address/add", isLoggedIn, userController.addAddress);
router.get("/address/edit/:id", isLoggedIn, userController.renderEditAddress);
router.post("/address/edit/:id", isLoggedIn, userController.updateAddress);
router.get("/address/delete/:id", isLoggedIn, userController.deleteAddress);
router.get("/address/set-default/:id", isLoggedIn, userController.setDefaultAddress);

module.exports = router;