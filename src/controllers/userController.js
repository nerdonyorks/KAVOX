const User = require("../models/userModel");
const otpService = require("../services/otpService");
const emailService = require("../services/emailService");

exports.renderHome = (req, res) => res.render("user/home");

exports.renderSignup = (req, res) => res.render("user/signup");

exports.renderLogin = (req, res) => {
    const { error } = req.query;
    let errorMessage = null;

    if (error === 'suspended') {
        errorMessage = "Your account has been suspended. Please contact support.";
    }

    res.render("user/login", { error: errorMessage });
};

exports.renderOtpVerify = (req, res) => {
    // Check for active OTP sessions
    const hasSignupSession = !!req.session.signupData;
    const hasEmailChangeSession = !!req.session.pendingEmail;

    if (!hasSignupSession && !hasEmailChangeSession) {
        // If logged in, go to account, otherwise to login
        if (req.isAuthenticated && req.isAuthenticated()) {
            return res.redirect("/account");
        }
        return res.redirect("/login");
    }

    res.render("user/otp-verify");
};

exports.renderForgotPassword = (req, res) => res.render("user/forgot-password");

exports.renderResetPassword = (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.redirect("/login");
  }
  res.render("user/new-password", { token });
};

exports.renderNewPassword = (req, res) => res.render("user/new-password");

exports.renderAccount = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.redirect("/login");
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.redirect("/login");
    }

    res.render("user/profile", { user });
  } catch (error) {
    next(error);
  }
};

exports.renderEditProfile = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.redirect("/login");

    const user = await User.findById(userId);
    if (!user) return res.redirect("/login");

    res.render("user/editProfile", { user });
  } catch (error) {
    next(error);
  }
};

exports.uploadProfileImage = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.redirect("/account");
    }

    const userId = req.user.id;
    const imagePath = `/uploads/users/${req.file.filename}`;

    await User.findByIdAndUpdate(userId, { profileImage: imagePath });

    res.redirect("/account");
  } catch (error) {
    console.error("Profile Image Upload Error:", error);
    next(error);
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.redirect("/login");
    }

    const { firstName, lastName, mobile, email } = req.body;
    const user = await User.findById(userId);

    if (!user) {
      return res.redirect("/login");
    }

    // Prepare current values for comparison
    const parts = user.name.trim().split(' ');
    const currentFirstName = parts[0] || '';
    const currentLastName = parts.slice(1).join(' ') || '';
    const currentMobile = user.phone || '';
    const currentEmail = user.email || '';

    let isNameChanged = (firstName !== currentFirstName) || (lastName !== currentLastName);
    let isMobileChanged = (mobile !== currentMobile);
    let isEmailChanged = (email && email !== currentEmail);
    let isImageChanged = !!req.file;

    if (!isNameChanged && !isMobileChanged && !isEmailChanged && !isImageChanged) {
        return res.redirect("/account");
    }

    // If only email is changed (or email is part of changes)
    if (isEmailChanged) {
        // Check if new email is already taken
        const existingUser = await User.findOne({ email });
        if (existingUser && existingUser._id.toString() !== userId) {
            return res.render("user/editProfile", { 
                user: user, 
                error: "This email address is already in use by another account." 
            });
        }

        // Trigger OTP for email change
        const generatedOtp = await otpService.generateAndStoreOTP(email);
        await emailService.sendOtpEmail(email, generatedOtp);
        
        // Store pending changes in session
        req.session.pendingEmail = { newEmail: email };
        
        // Save other non-email changes first? 
        // Actually, better to wait for OTP success to save anything IF email is being changed,
        // OR save non-email changes and then wait for OTP for email.
        // Let's save non-email changes now.
        if (isNameChanged) {
            user.name = `${firstName} ${lastName || ''}`.trim();
        }
        if (isMobileChanged) {
            user.phone = mobile;
        }
        if (isImageChanged) {
            user.profileImage = `/uploads/users/${req.file.filename}`;
        }
        await user.save();
        console.log(`OTP sent to ${email} for email change verification.`);
        return res.redirect(`/verify-otp?email=${encodeURIComponent(email)}&type=email_change`);
    }

    // Normal update (no email change)
    if (isNameChanged) {
        user.name = `${firstName} ${lastName || ''}`.trim();
    }
    if (isMobileChanged) {
        user.phone = mobile;
    }
    if (isImageChanged) {
        user.profileImage = `/uploads/users/${req.file.filename}`;
    }

    await user.save();
    
    // Passport session update - only if user exists in session
    if (req.session.passport) {
        req.session.passport.user = user.id;
    }
    
    req.session.save((err) => {
        if (err) {
            console.error("Session Save Error:", err);
            return res.status(500).render("user/editProfile", { user, error: "Failed to save session. Please try again." });
        }
        return res.redirect("/account");
    });
    
  } catch (error) {
    console.error("Profile Update Error Details:", error);
    let errorMessage = "An error occurred while updating your profile.";
    
    if (error.name === 'ReferenceError' && error.message.includes('otpService')) {
        errorMessage = "System error: OTP service is missing. Please contact support.";
    } else if (error.name === 'ValidationError') {
        errorMessage = Object.values(error.errors).map(val => val.message).join(", ");
    } else if (error.code === 11000) {
        errorMessage = "Email address is already in use.";
    }
    
    const user = await User.findById(req.user?.id);
    res.render("user/editProfile", { user, error: errorMessage });
  }
};

exports.renderAddress = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.redirect('/login');

    const user = await User.findById(userId);
    res.render("user/address", { addresses: user?.addresses || [] });
  } catch (error) {
    next(error);
  }
};

exports.renderAddAddress = (req, res) => res.render("user/add-address");

exports.addAddress = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.redirect('/login');

    const { firstName, lastName, mobile, pincode, street, state, city, type } = req.body;

    // The user schema expects specific address structure
    const newAddress = {
      firstName: firstName,
      lastName: lastName,
      addressLine: street,
      city: city,
      state: state,
      pin: pincode,
      isDefault: false,
      type: type || 'HOME',
      mobile: mobile
    };

    const user = await User.findById(userId);
    
    // Make it default if it's the first address
    if (!user.addresses || user.addresses.length === 0) {
      newAddress.isDefault = true;
    }

    user.addresses.push(newAddress);
    await user.save();

    res.redirect("/user/address");
  } catch (error) {
    console.error("Add Address Error:", error);
    next(error);
  }
};

exports.deleteAddress = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.redirect('/login');

    const addressId = req.params.id;
    await User.findByIdAndUpdate(userId, {
      $pull: { addresses: { _id: addressId } }
    });

    res.redirect("/user/address");
  } catch (error) {
    console.error("Delete Address Error:", error);
    next(error);
  }
};

exports.setDefaultAddress = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.redirect('/login');

    const addressId = req.params.id;
    const user = await User.findById(userId);

    if (user && user.addresses) {
      user.addresses.forEach(addr => {
        addr.isDefault = addr._id.toString() === addressId;
      });
      await user.save();
    }

    res.redirect("/user/address");
  } catch (error) {
    console.error("Set Default Address Error:", error);
    next(error);
  }
};

exports.renderProfileResetPassword = (req, res) => res.render("user/resetPassword", { user: req.user });

exports.updateProfilePassword = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { oldPassword, newPassword, confirmPassword } = req.body;
    
    const errors = {};
    
    const user = await User.findById(userId);
    if (!user) return res.redirect("/login");

    // 1. Verify old password (only if user has a password)
    if (user.password) {
      if (!oldPassword) {
        errors.oldPassword = "Old password is required";
      } else {
        const isMatch = await user.comparePassword(oldPassword);
        if (!isMatch) {
          errors.oldPassword = "Old password is incorrect";
        }
      }
    }

    // 2. Validate new password complexity
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      errors.newPassword = "New password must contain uppercase, lowercase, number and symbol";
    }

    // 3. Confirm password match
    if (newPassword !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match";
    }

    if (Object.keys(errors).length > 0) {
      if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(400).json({ success: false, errors });
      }
      return res.render("user/resetPassword", { 
        user: req.user, 
        errors, 
        oldPassword, 
        newPassword, 
        confirmPassword 
      });
    }

    // 4. Update password
    user.password = newPassword; 
    await user.save(); // pre-save hook handles hashing

    res.json({ success: true, message: "Password updated successfully" });

  } catch (error) {
    console.error("Update Password Error:", error);
    next(error);
  }
};

exports.renderEditAddress = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const addressId = req.params.id;
    const user = await User.findById(userId);
    const address = user.addresses.id(addressId);

    if (!address) {
      return res.redirect("/user/address");
    }

    res.render("user/edit-address", { address });
  } catch (error) {
    console.error("Render Edit Address Error:", error);
    next(error);
  }
};

exports.updateAddress = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const addressId = req.params.id;
    const { firstName, lastName, mobile, pincode, street, state, city, type } = req.body;

    const user = await User.findById(userId);
    const address = user.addresses.id(addressId);

    if (!address) {
      return res.redirect("/user/address");
    }

    // Update the address fields
    address.firstName = firstName; // The schema doesn't have firstName/lastName, it was passed in addAddress but not saved?
    address.lastName = lastName;   // Looking back at addAddress, it only saved street, city, etc.
    
    // Actually the userModel.js addressSchema showed:
    // type, addressLine (street), city, state, pin, mobile, isDefault

    address.addressLine = street;
    address.city = city;
    address.state = state;
    address.pin = pincode;
    address.mobile = mobile;
    address.type = type;

    await user.save();
    res.redirect("/user/address");
  } catch (error) {
    console.error("Update Address Error:", error);
    next(error);
  }
};
