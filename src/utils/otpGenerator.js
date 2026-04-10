const crypto = require('crypto');
//Generates a cryptographically strong 4-digit OTP string.
exports.generateOTP = () => {
    // Math.random is not cryptographically secure, using crypto for 2FA
    return crypto.randomInt(1000, 9999).toString();
};
