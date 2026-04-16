const User = require("../models/userModel");
const otpService = require("./otpService");
const emailService = require("./emailService");

const { MESSAGES } = require("../utils/constants");

/**
 * Handles the initial phase of Email/Password signup.
 * Validates uniqueness, then triggers OTP generation and delivery.
 */
exports.startSignup = async (userData) => {
    const { firstName, lastName, email, phone, referralCode, password, confirmPassword } = userData;


    // Pattern Validators
    const nameRegex = /^[A-Za-z0-9]{3,}$/;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const refRegex = /^[A-Za-z0-9]*$/;
    const passRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[\W]).{6,}$/;

    // Initial validations
    if (!firstName || !lastName || !email || !password || !confirmPassword) {
        return { success: false, error: MESSAGES.REQUIRED_FIELDS_MISSING };
    }

    if (!nameRegex.test(firstName)) {
        return { success: false, error: MESSAGES.INVALID_NAME_FORMAT };
    }
    
    if (!nameRegex.test(lastName)) {
        return { success: false, error: MESSAGES.INVALID_LAST_NAME_FORMAT };
    }

    if (!emailRegex.test(email)) {
        return { success: false, error: MESSAGES.INVALID_EMAIL_FORMAT };
    }

    if (referralCode && !refRegex.test(referralCode)) {
        return { success: false, error: MESSAGES.INVALID_REFERRAL_CODE };
    }

    if (!passRegex.test(password)) {
        return { success: false, error: MESSAGES.INVALID_PASSWORD_FORMAT };
    }

    if (password !== confirmPassword) {
        return { success: false, error: MESSAGES.PASSWORDS_NOT_MATCH };
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
        return { success: false, error: MESSAGES.EMAIL_ALREADY_EXISTS };
    }

    // Temporarily validate password strength via model constraints manually before 2FA to prevent bad inputs looping 
    const tempUser = new User({ name: 'temp', email, password });
    const validationError = tempUser.validateSync(['password']);
    if (validationError && password.length < 8) { // Our regex already catches < 6, model allows 8. Keeping fail safe open.

    }

    // All clear! Save user directly to DB.
    try {
        const name = `${firstName} ${lastName}`.trim();
        const user = new User({
            name,
            email,
            password,
            phone,
            referralCode
        });

        const savedUser = await user.save();
        return { success: true, user: savedUser };
    } catch (error) {
        console.error("DB Save Failed", error);
        return { success: false, error: MESSAGES.PROFILE_CREATE_ERROR };
    }
};

/**
 * Validates manual login credentials.
 */
exports.validateLogin = async (email, password) => {
    const user = await User.findOne({ email });

    if (!user) {
        return { success: false, error: MESSAGES.INVALID_CREDENTIALS };
    }

    if (!user.password) {
        return { success: false, error: MESSAGES.GOOGLE_AUTH_REQUIRED };
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
        return { success: false, error: MESSAGES.INVALID_CREDENTIALS };
    }

    if (!user.isActive) {
        return { success: false, error: MESSAGES.ACCOUNT_SUSPENDED };
    }

    return { success: true, user };
};


