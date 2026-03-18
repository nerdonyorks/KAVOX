const User = require("../models/userModel");
const Otp = require("../models/otpModel");
const authService = require("../services/authService");
const otpService = require("../services/otpService");
const emailService = require("../services/emailService");
const otpGenerator = require("../utils/otpGenerator");
const crypto = require("crypto");

exports.requestSignupOtp = async (req, res) => {
  try {
    const { email } = req.body;

    // check existing user
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({
        message: "Email already registered"
      });
    }

    // Generate 4 digit OTP
    const generatedOtp = otpGenerator.generateOTP();

    // Remove existing OTPs for the same email
    await Otp.deleteMany({ email });

    // Save new OTP
    const otpDoc = new Otp({ email, otp: generatedOtp });
    await otpDoc.save();

    // Send email
    await emailService.sendOtpEmail(email, generatedOtp);
    console.log(`[DEV] Generated Signup OTP for ${email}: ${generatedOtp}`);

    res.json({ message: "OTP sent to your email" });
  } catch (error) {
    res.status(500).json({ message: "Signup OTP request failed", error: error.message });
  }
};

exports.signup = async (req, res) => {
  try {
    const { firstName, lastName, email, phone, referralCode, password, confirmPassword } = req.body;

    // Pattern Validators (moved from service to controller for easier session handling)
    const nameRegex = /^[A-Za-z0-9]{3,}$/;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const passRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[\W]).{6,}$/;

    if (!firstName || !email || !password || !confirmPassword) {
      return res.status(400).render("user/signup", { error: "Required fields are missing.", ...req.body });
    }

    if (!nameRegex.test(firstName)) {
      return res.status(400).render("user/signup", { error: "First name can only contain letters and numbers, minimum 3 chars.", ...req.body });
    }

    if (lastName && !nameRegex.test(lastName)) {
      return res.status(400).render("user/signup", { error: "Last name can only contain letters and numbers, minimum 3 chars.", ...req.body });
    }

    if (!emailRegex.test(email)) {
      return res.status(400).render("user/signup", { error: "Please enter a valid email address.", ...req.body });
    }

    if (!passRegex.test(password)) {
      return res.status(400).render("user/signup", { error: "Password must contain uppercase, lowercase, number and symbol (min 6 chars).", ...req.body });
    }

    if (password !== confirmPassword) {
      return res.status(400).render("user/signup", { error: "Passwords do not match.", ...req.body });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).render("user/signup", { error: "An account with this email already exists.", ...req.body });
    }

    // Store signup data in session
    req.session.signupData = { firstName, lastName, email, phone, referralCode, password };

    // Trigger OTP
    const generatedOtp = await otpService.generateAndStoreOTP(email);
    await emailService.sendOtpEmail(email, generatedOtp);
    console.log(`[DEV] Generated Signup OTP for ${email}: ${generatedOtp}`);

    return res.redirect(`/verify-otp?email=${encodeURIComponent(email)}&type=signup`);
  } catch (error) {
    console.error("Signup error", error);
    res.status(500).render("user/signup", { error: "Signup failed due to server error." });
  }
};

exports.createPasswordPost = async (req, res) => {
  try {
    const { newPassword, confirmPassword } = req.body;
    
    if (newPassword !== confirmPassword) {
      return res.status(400).render("user/create-password", {
        error: "Passwords do not match.",
        user: req.user
      });
    }

    const userId = req.user?.id;
    if (!userId) return res.redirect("/login");

    const user = await User.findById(userId);
    user.password = newPassword; 
    
    try {
        await user.save();
    } catch (validationError) {
        return res.status(400).render("user/create-password", {
           error: "Password must contain uppercase, lowercase, number and symbol (min 8 chars).",
           user: req.user
        });
    }

    req.session.save(() => res.redirect("/login"));
    
  } catch (error) {
    console.error("Create Password Post Error:", error);
    res.status(500).render("user/create-password", { error: "Server error updating password.", user: req.user });
  }
};

exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp, type } = req.body;

    // Verify OTP first via Service Layer
    const isValid = await otpService.verifyOTP(email, otp);
    if (!isValid) {
      return res.status(400).render("user/otp-verify", { error: "Invalid or expired OTP", email, ...req.body });
    }

    if (type === 'signup') {
        const signupData = req.session.signupData;
        if (!signupData || signupData.email !== email) {
            return res.status(400).render("user/otp-verify", { error: "Signup session expired or invalid", email, ...req.body });
        }

        const name = `${signupData.firstName} ${signupData.lastName || ''}`.trim();
        const user = new User({
            name,
            email: signupData.email,
            password: signupData.password,
            phone: signupData.phone,
            referralCode: signupData.referralCode
        });

        await user.save();
        delete req.session.signupData;

        return res.redirect("/login?signup_success=1");
    } else if (type === 'email_change') {
        const pendingEmail = req.session.pendingEmail;
        if (!pendingEmail || pendingEmail.newEmail !== email) {
            return res.status(400).render("user/otp-verify", { error: "Email change session expired or invalid", email, ...req.body });
        }

        const user = await User.findById(req.user.id);
        
        // Final check if email was taken while user was verifying
        const existingUser = await User.findOne({ email: pendingEmail.newEmail });
        if (existingUser && existingUser._id.toString() !== user._id.toString()) {
            return res.status(400).render("user/otp-verify", { 
                error: "This email has been taken by another account. Please try a different email.", 
                email, ...req.body 
            });
        }

        user.email = pendingEmail.newEmail;
        await user.save();
        delete req.session.pendingEmail;

        return res.redirect("/account?email_success=1");
    } else {
        res.status(400).render("user/otp-verify", { error: "Unknown OTP verification type", email, ...req.body });
    }

  } catch (error) {
    console.error("verifyOtp error", error);
    res.status(500).render("user/otp-verify", { error: "Verification failed due to server error.", ...req.body });
  }
};

exports.resendOtp = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, message: "Email required" });
        
        const newOtp = await otpService.generateAndStoreOTP(email);
        await emailService.sendOtpEmail(email, newOtp);
        
        res.json({ success: true, message: "OTP resent successfully" });
    } catch (e) {
        console.error("Resend OTP Error", e);
         res.status(500).json({ success: false, message: "Failed to resend OTP" });
    }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
        return res.status(400).render("user/login", { error: "Invalid email or password", email });
    }

    if (!user.password) {
        return res.status(400).render("user/login", { error: "Account registered with Google. Use Google login.", email });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
        return res.status(400).render("user/login", { error: "Invalid email or password", email });
    }

    if (!user.isActive) {
        return res.status(400).render("user/login", { error: "Your account has been suspended. Please contact support.", email });
    }

    // Credentials valid, log in directly
    req.login(user, (err) => {
        if (err) {
            console.error("Login Error:", err);
            return res.status(500).render("user/login", { error: "Internal server error during login", email });
        }
        req.session.save(() => res.redirect("/home"));
    });

  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).render("user/login", { error: "Internal server error during login", email: req.body.email });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.json({ success: false, message: "No account found with that email." });
    }

    if (!user.isActive) {
      return res.json({ success: false, message: "Account is suspended. Cannot reset password." });
    }

    // Generate secure reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    
    // Hash token to save in DB
    const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");

    // Save hashed token and expiry date (10 minutes from now)
    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = Date.now() + 10 * 60 * 1000;
    await user.save();

    // Dynamically construct reset URL
    const resetUrl = `${req.protocol}://${req.get('host')}/reset-password?token=${resetToken}`;

    // Use emailService to send the email
    const emailSent = await emailService.sendPasswordResetEmail(user.email, resetUrl);

    if (emailSent) {
      res.json({ success: true, message: "A password reset link has been sent to your email." });
    } else {
      res.json({ success: false, message: "Failed to send password reset link. Please try again later." });
    }
  } catch (error) {
    console.error("Forgot Password Error:", error);
    res.json({ success: false, message: "An internal error occurred while processing your request." });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token) {
        return res.json({ success: false, message: "Invalid or missing token." });
    }

    // Hash token from query back to compare with DB hashed token
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() } // ensure strictly in the future
    });

    if (!user) {
      return res.json({ success: false, message: "Password reset token is invalid or has expired." });
    }

    // Assign new password (pre-save hook hashes it automatically)
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    try {
      await user.save();
    } catch (validationError) {
      return res.json({ success: false, message: "Password does not meet complexity requirements." });
    }

    res.json({ success: true, message: "Your password has been successfully reset! You may now login." });
  } catch (error) {
    console.error("Reset Password Error:", error);
    res.json({ success: false, message: "Failed to reset password." });
  }
};

exports.logout = (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error("Logout Error:", err);
      return res.redirect("/");
    }
    // Destroy the session entirely to remove any stale caching
    req.session.destroy((err) => {
      if (err) {
         console.error("Session Destroy Error:", err);
      }
      res.clearCookie('connect.sid'); // Clear session cookie manually
      res.redirect("/login");
    });
  });
};