const User = require("../models/userModel");
const Otp = require("../models/otpModel");
const authService = require("../services/authService");
const otpService = require("../services/otpService");
const emailService = require("../services/emailService");
const otpGenerator = require("../utils/otpGenerator");
const crypto = require("crypto");
const { HTTP_STATUS, MESSAGES } = require("../utils/constants");

exports.requestSignupOtp = async (req, res) => {
  try {
    const { email } = req.body;

    // check existing user
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: MESSAGES.EMAIL_ALREADY_EXISTS
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

    res.status(HTTP_STATUS.OK).json({ success: true, message: MESSAGES.OTP_SENT_SUCCESS });
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ 
        success: false, 
        message: MESSAGES.SIGNUP_FAILED, 
        error: error.message 
    });
  }
};

exports.signup = async (req, res) => {
  try {
    const { firstName, lastName, email, phone, referralCode, password, confirmPassword } = req.body;

    // Pattern Validators (moved from service to controller for easier session handling)
    const nameRegex = /^[A-Za-z0-9]{3,}$/;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const passRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[\W]).{8,}$/;

    const isAjax = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'));

    if (!firstName || !email || !password || !confirmPassword) {
      if (isAjax) return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.REQUIRED_FIELDS_MISSING });
      return res.status(HTTP_STATUS.BAD_REQUEST).render("user/signup", { error: MESSAGES.REQUIRED_FIELDS_MISSING, ...req.body });
    }

    if (!nameRegex.test(firstName)) {
      if (isAjax) return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.INVALID_NAME_FORMAT });
      return res.status(HTTP_STATUS.BAD_REQUEST).render("user/signup", { error: MESSAGES.INVALID_NAME_FORMAT, ...req.body });
    }

    if (lastName && !nameRegex.test(lastName)) {
      if (isAjax) return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.INVALID_LAST_NAME_FORMAT });
      return res.status(HTTP_STATUS.BAD_REQUEST).render("user/signup", { error: MESSAGES.INVALID_LAST_NAME_FORMAT, ...req.body });
    }

    if (!emailRegex.test(email)) {
      if (isAjax) return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.INVALID_EMAIL_FORMAT });
      return res.status(HTTP_STATUS.BAD_REQUEST).render("user/signup", { error: MESSAGES.INVALID_EMAIL_FORMAT, ...req.body });
    }

    if (!passRegex.test(password)) {
      if (isAjax) return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.INVALID_PASSWORD_FORMAT });
      return res.status(HTTP_STATUS.BAD_REQUEST).render("user/signup", { error: MESSAGES.INVALID_PASSWORD_FORMAT, ...req.body });
    }

    if (password !== confirmPassword) {
      if (isAjax) return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.PASSWORDS_NOT_MATCH });
      return res.status(HTTP_STATUS.BAD_REQUEST).render("user/signup", { error: MESSAGES.PASSWORDS_NOT_MATCH, ...req.body });
    }

    const existingEmailUser = await User.findOne({ email });
    if (existingEmailUser) {
      if (isAjax) return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.EMAIL_ALREADY_EXISTS });
      return res.status(HTTP_STATUS.BAD_REQUEST).render("user/signup", { error: MESSAGES.EMAIL_ALREADY_EXISTS, ...req.body });
    }

    const firstNameRegex = new RegExp(`^${firstName}(\\s|$)`, 'i');
    const existingNameUser = await User.findOne({ name: { $regex: firstNameRegex } });
    if (existingNameUser) {
      if (isAjax) return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.FIRST_NAME_TAKEN });
      return res.status(HTTP_STATUS.BAD_REQUEST).render("user/signup", { error: MESSAGES.FIRST_NAME_TAKEN, ...req.body });
    }


    // Store signup data in session
    req.session.signupData = { firstName, lastName, email, phone, referralCode, password };

    // Trigger OTP
    const generatedOtp = await otpService.generateAndStoreOTP(email);
    await emailService.sendOtpEmail(email, generatedOtp);
    console.log(`[DEV] Generated Signup OTP for ${email}: ${generatedOtp}`);

    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.status(HTTP_STATUS.OK).json({ 
            success: true, 
            redirect: `/verify-otp?email=${encodeURIComponent(email)}&type=signup`,
            message: MESSAGES.OTP_SENT_SUCCESS 
        });
    }

    return res.redirect(`/verify-otp?email=${encodeURIComponent(email)}&type=signup`);
  } catch (error) {
    console.error("Signup error", error);
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ 
            success: false, 
            message: MESSAGES.SIGNUP_FAILED 
        });
    }
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).render("user/signup", { error: MESSAGES.SIGNUP_FAILED });
  }
};


exports.verifyOtp = async (req, res) => {
  try {
    let { email, otp, type } = req.body;
    
    // Concatenate OTP if it comes as separate fields (standard form submission)
    if (!otp && req.body.otp1 && req.body.otp2 && req.body.otp3 && req.body.otp4) {
        otp = `${req.body.otp1}${req.body.otp2}${req.body.otp3}${req.body.otp4}`;
    }
    const isAjax = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'));

    // Verify OTP first via Service Layer
    const isValid = await otpService.verifyOTP(email, otp);
    if (!isValid) {
      if (isAjax) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.INVALID_OTP });
      }
      return res.status(HTTP_STATUS.BAD_REQUEST).render("user/otp-verify", { error: MESSAGES.INVALID_OTP, email, ...req.body });
    }

    if (type === 'signup') {
        const signupData = req.session.signupData;
        if (!signupData || signupData.email !== email) {
            if (isAjax) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.SIGNUP_SESSION_EXPIRED });
            }
            return res.status(HTTP_STATUS.BAD_REQUEST).render("user/otp-verify", { error: MESSAGES.SIGNUP_SESSION_EXPIRED, email, ...req.body });
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

        if (isAjax) {
            return res.status(HTTP_STATUS.OK).json({ success: true, redirect: "/login?signup_success=1" });
        }
        return res.redirect("/login?signup_success=1");
    } else if (type === 'email_change') {
        const pendingEmail = req.session.pendingEmail;
        if (!pendingEmail || pendingEmail.newEmail !== email) {
            if (isAjax) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.EMAIL_CHANGE_SESSION_EXPIRED });
            }
            return res.status(HTTP_STATUS.BAD_REQUEST).render("user/otp-verify", { error: MESSAGES.EMAIL_CHANGE_SESSION_EXPIRED, email, ...req.body });
        }

        const user = await User.findById(req.user.id);
        
        // Final check if email was taken while user was verifying
        const existingUser = await User.findOne({ email: pendingEmail.newEmail });
        if (existingUser && existingUser._id.toString() !== user._id.toString()) {
            if (isAjax) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.EMAIL_TAKEN });
            }
            return res.status(HTTP_STATUS.BAD_REQUEST).render("user/otp-verify", { 
                error: MESSAGES.EMAIL_TAKEN, 
                email, ...req.body 
            });
        }

        user.email = pendingEmail.newEmail;
        await user.save();
        delete req.session.pendingEmail;

        if (isAjax) {
            return res.status(HTTP_STATUS.OK).json({ success: true, redirect: "/account?email_success=1" });
        }
        return res.redirect("/account?email_success=1");
    } else {
        if (isAjax) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.UNKNOWN_OTP_TYPE });
        }
        res.status(HTTP_STATUS.BAD_REQUEST).render("user/otp-verify", { error: MESSAGES.UNKNOWN_OTP_TYPE, email, ...req.body });
    }

  } catch (error) {
    console.error("verifyOtp error", error);
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGES.VERIFICATION_FAILED });
    }
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).render("user/otp-verify", { error: MESSAGES.VERIFICATION_FAILED, ...req.body });
  }
};

exports.resendOtp = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.EMAIL_REQUIRED });
        
        const newOtp = await otpService.generateAndStoreOTP(email);
        await emailService.sendOtpEmail(email, newOtp);
        
        res.status(HTTP_STATUS.OK).json({ success: true, message: MESSAGES.OTP_RESEND_SUCCESS });
    } catch (e) {
        console.error("Resend OTP Error", e);
         res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGES.OTP_RESEND_FAILED });
    }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
        return res.status(HTTP_STATUS.BAD_REQUEST).render("user/login", { error: MESSAGES.INVALID_CREDENTIALS, email });
    }

    if (user.role === 'admin') {
        if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.status(HTTP_STATUS.FORBIDDEN).json({ success: false, message: MESSAGES.ADMIN_VIA_USER_PORTAL });
        }
        return res.status(HTTP_STATUS.FORBIDDEN).render("user/login", { error: MESSAGES.ADMIN_VIA_USER_PORTAL, email });
    }

    if (!user.password) {
        if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.GOOGLE_LOGIN_REQUIRED });
        }
        return res.status(HTTP_STATUS.BAD_REQUEST).render("user/login", { error: MESSAGES.GOOGLE_LOGIN_REQUIRED, email });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
        if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.INVALID_CREDENTIALS });
        }
        return res.status(HTTP_STATUS.BAD_REQUEST).render("user/login", { error: MESSAGES.INVALID_CREDENTIALS, email });
    }

    if (!user.isActive) {
        if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.status(HTTP_STATUS.FORBIDDEN).json({ success: false, message: MESSAGES.ACCOUNT_SUSPENDED });
        }
        return res.status(HTTP_STATUS.FORBIDDEN).render("user/login", { error: MESSAGES.ACCOUNT_SUSPENDED, email });
    }

    // Credentials valid, log in directly
    req.login(user, (err) => {
        if (err) {
            console.error("Login Error:", err);
            if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
                return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ 
                    success: false, 
                    message: MESSAGES.INTERNAL_LOGIN_ERROR 
                });
            }
            return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).render("user/login", { error: MESSAGES.INTERNAL_LOGIN_ERROR, email });
        }
        
        req.session.save(() => {
            if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
                return res.status(HTTP_STATUS.OK).json({ 
                    success: true, 
                    redirect: "/home",
                    message: MESSAGES.LOGIN_SUCCESS 
                });
            }
            res.redirect("/home");
        });
    });

  } catch (error) {
    console.error("Login Error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).render("user/login", { error: MESSAGES.INTERNAL_LOGIN_ERROR, email: req.body.email });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: MESSAGES.EMAIL_NOT_FOUND });
    }

    if (!user.isActive) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({ success: false, message: MESSAGES.ACCOUNT_SUSPENDED });
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
      res.status(HTTP_STATUS.OK).json({ success: true, message: MESSAGES.PASSWORD_RESET_SENT });
    } else {
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGES.PASSWORD_RESET_LINK_FAILED });
    }
  } catch (error) {
    console.error("Forgot Password Error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGES.INTERNAL_SERVER_ERROR });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.INVALID_TOKEN });
    }

    // Hash token from query back to compare with DB hashed token
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() } // ensure strictly in the future
    });

    if (!user) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ success: false, message: MESSAGES.TOKEN_EXPIRED });
    }

    // Assign new password (pre-save hook hashes it automatically)
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    try {
      await user.save();
    } catch (validationError) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: MESSAGES.PASSWORD_COMPLEXITY_ERROR });
    }

    res.status(HTTP_STATUS.OK).json({ success: true, message: MESSAGES.PASSWORD_RESET_SUCCESS });
  } catch (error) {
    console.error("Reset Password Error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGES.PASSWORD_RESET_FAILED });
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
      res.clearCookie('user_sid'); // Clear session cookie manually
      res.redirect("/login");
    });
  });
};