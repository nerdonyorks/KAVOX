const Otp = require("../models/otpModel");
const otpGenerator = require("../utils/otpGenerator");

exports.generateAndStoreOTP = async (email) => {
    // Generate new secure token
    const generatedOtp = otpGenerator.generateOTP();

    // Remove existing OTPs for the same email to avoid duplicates/race conditions
    await Otp.deleteMany({ email });

    // Save new OTP. The model's TTL index handles automatic 1m expiry.
    const otpDoc = new Otp({ email, otp: generatedOtp });
    await otpDoc.save();

    return generatedOtp;
};

exports.verifyOTP = async (email, otpInput) => {
    const otpDoc = await Otp.findOne({ email, otp: otpInput });

    if (!otpDoc) {
        return false;
    }

    // Strict 1-minute check (reinforces TTL index)
    const now = new Date();
    const expiryTime = 60 * 1000; // 1 minute in ms
    if (now - otpDoc.createdAt > expiryTime) {
        await Otp.deleteOne({ _id: otpDoc._id });
        return false;
    }

    // Clean up used OTP so it cannot be reused
    await Otp.deleteMany({ email });

    return true;
};
