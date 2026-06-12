/**
 * Database Migration Script
 * ──────────────────────────
 * Migrates legacy inline offer fields (productOffer on Product, offer on Category)
 * into dedicated, structured ProductOffer and CategoryOffer collections.
 *
 * Usage:
 *   node src/scripts/migrateOffers.js
 */

const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const Product = require("../models/productModel");
const Category = require("../models/categoryModel");
const ProductOffer = require("../models/productOfferModel");
const CategoryOffer = require("../models/categoryOfferModel");

async function migrate() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/kavox";
  console.log("Connecting to MongoDB...");
  await mongoose.connect(uri);
  console.log("✔ Connected to MongoDB");

  const currentDate = new Date();
  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(currentDate.getFullYear() + 1);

  // 1. Migrate Product Offers
  console.log("\n--- Migrating Product Offers ---");
  // Query raw database documents to retrieve fields even if they're not in the Mongoose schema later
  const productsWithOffers = await Product.find({ productOffer: { $gt: 0 } }).lean();
  console.log(`Found ${productsWithOffers.length} products with legacy offers.`);

  for (const product of productsWithOffers) {
    const existingOffer = await ProductOffer.findOne({ productId: product._id });
    if (!existingOffer) {
      const newOffer = new ProductOffer({
        name: `Migrated Offer for ${product.name}`,
        productId: product._id,
        discountPercentage: product.productOffer,
        startDate: currentDate,
        endDate: oneYearFromNow,
        isActive: product.isActive !== false
      });
      await newOffer.save();
      console.log(`✔ Created ProductOffer for "${product.name}": ${product.productOffer}%`);
    } else {
      console.log(`ℹ ProductOffer already exists for "${product.name}", skipping creation.`);
    }
  }

  // 2. Migrate Category Offers
  console.log("\n--- Migrating Category Offers ---");
  const categoriesWithOffers = await Category.find({ offer: { $gt: 0 } }).lean();
  console.log(`Found ${categoriesWithOffers.length} categories with legacy offers.`);

  for (const category of categoriesWithOffers) {
    const existingOffer = await CategoryOffer.findOne({ categoryId: category._id });
    if (!existingOffer) {
      const newOffer = new CategoryOffer({
        name: `Migrated Offer for ${category.name}`,
        categoryId: category._id,
        discountPercentage: category.offer,
        startDate: currentDate,
        endDate: oneYearFromNow,
        isActive: category.isActive !== false
      });
      await newOffer.save();
      console.log(`✔ Created CategoryOffer for "${category.name}": ${category.offer}%`);
    } else {
      console.log(`ℹ CategoryOffer already exists for "${category.name}", skipping creation.`);
    }
  }

  // 3. Remove legacy fields from database collections
  console.log("\n--- Unsetting Legacy Fields ---");
  const productUnsetResult = await Product.updateMany(
    { productOffer: { $exists: true } },
    { $unset: { productOffer: "" } }
  );
  console.log(`✔ Product collection updated:`, productUnsetResult);

  const categoryUnsetResult = await Category.updateMany(
    { offer: { $exists: true } },
    { $unset: { offer: "" } }
  );
  console.log(`✔ Category collection updated:`, categoryUnsetResult);

  console.log("\nMigration completed successfully!");
}

migrate()
  .catch(err => {
    console.error("Migration failed:", err);
  })
  .finally(() => {
    mongoose.disconnect();
    process.exit(0);
  });
