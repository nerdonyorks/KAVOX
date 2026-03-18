const User = require("../models/userModel");
const bcrypt = require("bcrypt");

const createAdmin = async () => {
  try {

    const adminExists = await User.findOne({ email: "admin@gmail.com" });

    const hashedPassword = await bcrypt.hash("Admin@123", 10);

    if (adminExists) {
      // Update existing admin password to match the one in this script
      await User.findOneAndUpdate({ email: "admin@gmail.com" }, { password: hashedPassword });
      console.log("Admin already exist");
      return;
    }

    const admin = new User({
      name: "Admin",
      email: "admin@gmail.com",
      password: hashedPassword,
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