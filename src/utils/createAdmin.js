const User = require("../models/userModel");
const bcrypt = require("bcrypt");

const createAdmin = async () => {
  try {

    const adminExists = await User.findOne({ email: "admin@gmail.com" });
    if (adminExists) {
      // Pass plain password, model will hash it on save()
      adminExists.password = "Admin@123";
      await adminExists.save();
      
      // Verification log
      const isCorrect = await adminExists.comparePassword("Admin@123");
      console.log(`[AUTH] Admin password verified on startup: ${isCorrect}`);
      
      console.log("Admin already exist");
      return;
    }

    const admin = new User({
      name: "Admin",
      email: "admin@gmail.com",
      password: "Admin@123",
      role: "admin",
      isActive: true
    });

    await admin.save();
    console.log("Default admin created successfully");

  } catch (error) {
    console.error("Admin creation error:", error);
  }
};

module.exports = createAdmin;