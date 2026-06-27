const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    images: {
      type: [
        {
          url: { type: String, required: true },
          isPrimary: { type: Boolean, default: false },
        },
      ],
      validate: {
        validator: function (val) {
          return val.length >= 3;
        },
        message: "A product must have at least 3 images.",
      },
    },
    note: {
      type: String,
    },
    brand: {
      type: String,
      trim: true,
      default: "KAVOX"
    },

    showOnHome: {
      type: Boolean,
      default: false,
    },
    variants: [
      {
        size: { type: String, required: true },
        color: { type: String, required: true },
        quantity: { type: Number, default: 0, min: 0 },
        images: [
          {
            url: { type: String, required: true },
            isPrimary: { type: Boolean, default: false },
          }
        ],
        isActive: { type: Boolean, default: true }
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    totalReviews: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  { timestamps: true }
);

// Compound index for text search
productSchema.index({ name: 'text', description: 'text' });

module.exports = mongoose.model("Product", productSchema);
