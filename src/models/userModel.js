const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const addressSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  type: { type: String, default: "HOME" },
  street: String,
  city: String,
  state: String,
  pincode: String,
  mobile: String,
  isDefault: { type: Boolean, default: false }
});

const userSchema = new mongoose.Schema({

  name: {
    type: String,
    required: true,
    trim: true
  },

  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },

  password: {
    type: String,
    minlength: 8,
    validate: {
      validator: function (v) {
        if (!v) return true;
        return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/.test(v);
      },
      message: "Password must contain uppercase, lowercase, number and symbol"
    }
  },

  resetPasswordToken: String,
  resetPasswordExpires: Date,

  googleId: String,

  phone: String,

  role: {
    type: String,
    enum: ["user", "admin"],
    default: "user"
  },

  referralCode: String,

  isActive: {
    type: Boolean,
    default: true
  },

  addresses: [addressSchema],
  profileImage: { type: String, default: "/images/default-user.png" }

}, { timestamps: true });


// hash password before save
userSchema.pre("save", async function () {

  if (!this.isModified("password")) return;

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);

});


// compare password for login
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);