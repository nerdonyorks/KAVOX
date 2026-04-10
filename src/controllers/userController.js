const User = require("../models/userModel");
const Product = require("../models/productModel");
const otpService = require("../services/otpService");
const emailService = require("../services/emailService");
const { HTTP_STATUS, MESSAGES } = require("../utils/constants");
const sharp = require("sharp");
const fs = require("fs").promises;

exports.renderHome = async (req, res) => {
    try {
        const { search } = req.query;
        let query = { isActive: true };

        if (search) {
            query.name = { $regex: search, $options: 'i' };
        }

        let products = await Product.find(query).sort({ createdAt: -1 }).lean();

        // Seed data if empty (for demo)
        if (products.length === 0 && !search) {
            const demoProducts = [
                { name: "Athleisure Shoes for Men", description: "Comfortable athletic shoes", price: 2799, originalPrice: 3499, discount: 20, image: "/images/products/shoe1.jpg", category: "Men", stock: 10 },
                { name: "Men's Athleisure Shoes", description: "Versatile men's shoes", price: 1199, originalPrice: 1499, discount: 20, image: "/images/products/shoe2.jpg", category: "Men", stock: 15 },
                { name: "Lifestyle Men's Casual Shoes", description: "Casual everyday shoes", price: 1499, originalPrice: 1799, discount: 15, image: "/images/products/shoe3.jpg", category: "Men", stock: 8 },
                { name: "Lifestyle Casual Shoes for Men", description: "Stylish lifestyle shoes", price: 2899, originalPrice: 3499, discount: 20, image: "/images/products/shoe4.jpg", category: "Men", stock: 12 },
                { name: "White Casual Shoes for Men", description: "Classic white casuals", price: 2499, originalPrice: 3399, discount: 25, image: "/images/products/shoe5.jpg", category: "Men", stock: 20 },
                { name: "Men's Walking Slip-On Shoes", description: "Easy walking shoes", price: 1999, originalPrice: 2499, discount: 15, image: "/images/products/shoe6.jpg", category: "Men", stock: 18 }
            ];
            await Product.insertMany(demoProducts);
            products = await Product.find(query).sort({ createdAt: -1 }).lean();
        }

        if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.json({ success: true, products });
        }

        res.render("user/home", { products });
    } catch (err) {
        console.error("Home render error:", err);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).render("user/error", { message: MESSAGES.HOME_PAGE_LOAD_FAILED });
    }
};

exports.renderSignup = (req, res) => res.render("user/signup");

exports.renderLogin = (req, res) => {
    const { error } = req.query;
    let errorMessage = null;

    if (error === 'suspended') {
        errorMessage = MESSAGES.ACCOUNT_SUSPENDED;
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
    const inputPath = req.file.path;
    
    // Optimize with sharp
    const buffer = await sharp(inputPath)
      .resize(500, 500, { fit: "cover" })
      .jpeg({ quality: 80 })
      .toBuffer();
    
    await fs.writeFile(inputPath, buffer);

    const imagePath = `/uploads/users/${req.file.filename}`;
    await User.findByIdAndUpdate(userId, { profileImage: imagePath });

    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.json({ success: true, message: "Profile image updated successfully", imagePath });
    }
    res.redirect("/account");
  } catch (error) {
    console.error("Profile Image Upload Error:", error);
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: error.message });
    }
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
            return res.status(HTTP_STATUS.BAD_REQUEST).render("user/editProfile", { 
                user: user, 
                error: MESSAGES.EMAIL_TAKEN 
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
        const inputPath = req.file.path;
        
        // Optimize with sharp
        const buffer = await sharp(inputPath)
            .resize(500, 500, { fit: "cover" })
            .jpeg({ quality: 80 })
            .toBuffer();
        
        await fs.writeFile(inputPath, buffer);

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
            if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
                return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGES.SESSION_SAVE_ERROR });
            }
            return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).render("user/editProfile", { user, error: MESSAGES.SESSION_SAVE_ERROR });
        }
        if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.json({ success: true, message: "Profile updated successfully" });
        }
        return res.redirect("/account");
    });
    
  } catch (error) {
    console.error("Profile Update Error Details:", error);
    let errorMessage = MESSAGES.INTERNAL_SERVER_ERROR;
    
    if (error.name === 'ReferenceError' && error.message.includes('otpService')) {
        errorMessage = MESSAGES.OTP_SERVICE_MISSING;
    } else if (error.name === 'ValidationError') {
        errorMessage = Object.values(error.errors).map(val => val.message).join(", ");
    } else if (error.code === 11000) {
        errorMessage = MESSAGES.EMAIL_TAKEN;
    }
    
    const user = await User.findById(req.user?.id);
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ 
            success: false, 
            message: errorMessage 
        });
    }
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
      street: street,
      city: city,
      state: state,
      pincode: pincode,
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

    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(HTTP_STATUS.CREATED).json({ 
            success: true, 
            message: MESSAGES.ADDRESS_ADDED, 
            address: newAddress 
        });
    }

    res.redirect("/user/address");
  } catch (error) {
    console.error("Add Address Error:", error);
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ 
            success: false, 
            message: MESSAGES.INTERNAL_SERVER_ERROR 
        });
    }
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

    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(HTTP_STATUS.OK).json({ 
            success: true, 
            message: MESSAGES.ADDRESS_DELETED 
        });
    }

    res.redirect("/user/address");
  } catch (error) {
    console.error("Delete Address Error:", error);
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ 
            success: false, 
            message: MESSAGES.INTERNAL_SERVER_ERROR 
        });
    }
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

    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(HTTP_STATUS.OK).json({ 
            success: true, 
            message: MESSAGES.ADDRESS_UPDATED 
        });
    }

    res.redirect("/user/address");
  } catch (error) {
    console.error("Set Default Address Error:", error);
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ 
            success: false, 
            message: MESSAGES.INTERNAL_SERVER_ERROR 
        });
    }
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
        errors.oldPassword = MESSAGES.OLD_PASSWORD_REQUIRED;
      } else {
        const isMatch = await user.comparePassword(oldPassword);
        if (!isMatch) {
          errors.oldPassword = MESSAGES.OLD_PASSWORD_INCORRECT;
        }
      }
    }

    // 2. Validate new password complexity
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      errors.newPassword = MESSAGES.NEW_PASSWORD_COMPLEXITY;
    }

    // 3. Confirm password match
    if (newPassword !== confirmPassword) {
      errors.confirmPassword = MESSAGES.PASSWORDS_NOT_MATCH;
    }

    if (Object.keys(errors).length > 0) {
      if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, errors });
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

    res.status(HTTP_STATUS.OK).json({ 
        success: true, 
        message: MESSAGES.PASSWORD_UPDATED 
    });

  } catch (error) {
    console.error("Update Password Error:", error);
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ 
            success: false, 
            message: MESSAGES.INTERNAL_SERVER_ERROR 
        });
    }
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
    address.firstName = firstName;
    address.lastName = lastName;
    address.street = street;
    address.city = city;
    address.state = state;
    address.pincode = pincode;
    address.type = type || 'HOME';
    address.mobile = mobile;

    await user.save();

    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(HTTP_STATUS.OK).json({ 
            success: true, 
            message: MESSAGES.ADDRESS_UPDATED 
        });
    }

    res.redirect("/user/address");
  } catch (error) {
    console.error("Update Address Error:", error);
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ 
            success: false, 
            message: MESSAGES.INTERNAL_SERVER_ERROR 
        });
    }
    next(error);
  }
};
