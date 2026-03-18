const nodemailer = require("nodemailer");

let transporter;

// Asynchronously initialize the transporter
const initTransporter = async () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error("❌ EMAIL_USER or EMAIL_PASS environment variables are missing.");
  }
  
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  try {
    await transporter.verify();
    console.log("✅ Gmail Transporter verified and ready.");
  } catch (error) {
    console.error("❌ Gmail Transporter verification failed. Check your EMAIL_USER/EMAIL_PASS (App Password required).");
    console.error(error.message);
  }
};

// Initialize immediately
initTransporter();

exports.sendOtpEmail = async (email, otp) => {
  try {
    // Wait for transporter to initialize if it hasn't yet
    if (!transporter) await initTransporter();

    const mailOptions = {
      from: `"${process.env.EMAIL_USER || 'Kavox Security'}" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Your Login OTP for Kavox",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2>Verification Code</h2>
          <p>Hello,</p>
          <p>You requested an OTP. Your 4-digit verification code is:</p>
          <h1 style="font-size: 32px; letter-spacing: 5px; color: #4F46E5; background-color: #F3F4F6; padding: 20px; text-align: center; border-radius: 8px;">${otp}</h1>
          <p>This code will expire in 5 minutes.</p>
          <p>If you didn't request this code, you can safely ignore this email.</p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("OTP Email sent successfully!");
    
    return true;
  } catch (error) {
    console.error("Error sending OTP email:");
    console.error(error);
    return false; 
  }
};

exports.sendPasswordResetEmail = async (email, resetUrl) => {
  try {
    if (!transporter) await initTransporter();

    const mailOptions = {
      from: `"${process.env.EMAIL_USER || 'Kavox Support'}" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Password Reset Request - KAVOX SOLE LAB",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h2 style="color: #1a1a1a; text-align: center;">Password Reset Request</h2>
          <p>Hello,</p>
          <p>You are receiving this because you (or someone else) have requested the reset of the password for your account.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background-color: #ff1744; color: white; padding: 12px 24px; text-decoration: none; border-radius: 25px; font-weight: bold; display: inline-block;">Reset Password</a>
          </div>
          <p>If the button above doesn't work, copy and paste the following link into your browser:</p>
          <p style="word-break: break-all; color: #3344dd;">${resetUrl}</p>
          <p>This link will expire in 10 minutes.</p>
          <p>If you did not request this, please ignore this email and your password will remain unchanged.</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #6b7280; text-align: center;">KAVOX SOLE LAB - Your Ultimate Footwear Destination</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log("Password Reset Email sent successfully!");
    return true;
  } catch (error) {
    console.error("Error sending password reset email:", error);
    return false;
  }
};

exports.getTransporter = async () => {
  if (!transporter) await initTransporter();
  return transporter;
};

exports.sendGenericLink = async (email, link, subject, title) => {
  try {
    if (!transporter) await initTransporter();

    const mailOptions = {
      from: `"${process.env.EMAIL_USER || 'Kavox Support'}" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: subject || "Link Shared - KAVOX",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h2 style="color: #1a1a1a; text-align: center;">${title || 'Shared Link'}</h2>
          <p>Hello,</p>
          <p>Here is the link you requested:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${link}" style="background-color: #3344dd; color: white; padding: 12px 24px; text-decoration: none; border-radius: 25px; font-weight: bold; display: inline-block;">Open Link</a>
          </div>
          <p>Or copy and paste this into your browser:</p>
          <p style="word-break: break-all; color: #3344dd;">${link}</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #6b7280; text-align: center;">KAVOX SOLE LAB - Your Ultimate Footwear Destination</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log("Generic Link Email sent successfully!");
    return true;
  } catch (error) {
    console.error("Error sending generic link email:", error);
    return false;
  }
};
