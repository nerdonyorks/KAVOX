/**
 * Brand Population Migration Script
 * ─────────────────────────────────
 * Populates the brand field of all existing products by parsing the first word
 * of their name (e.g. "Nike" from "Nike P 6000 Gold").
 *
 * Usage:
 *   node scripts/populateBrands.js
 */

const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const Product = require("../src/models/productModel");

async function populateBrands() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/kavox";
  console.log("Connecting to MongoDB...");
  await mongoose.connect(uri);
  console.log("✔ Connected to MongoDB");

  const products = await Product.find({});
  console.log(`Found ${products.length} products to process.`);

  let updatedCount = 0;
  for (const product of products) {
    // Determine the brand: extract first word from name
    const firstWord = product.name.trim().split(" ")[0];
    
    // Capitalize first word (e.g., "shoes" -> "Shoes", "nike" -> "Nike")
    let brandVal = firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
    
    // If it's a generic descriptor like "shoes" or "boot", let's fallback to "KAVOX" or keep it capitalized
    if (["Shoes", "Boot", "Boots", "Slipper", "Slippers", "Product"].includes(brandVal)) {
      brandVal = "KAVOX";
    }

    product.brand = brandVal;
    await product.save();
    console.log(`✔ Updated product "${product.name}" -> Brand: "${brandVal}"`);
    updatedCount++;
  }

  console.log(`\nSuccessfully populated brands for ${updatedCount} products.`);
}

populateBrands()
  .catch(err => {
    console.error("Brand population failed:", err);
  })
  .finally(() => {
    mongoose.disconnect();
    process.exit(0);
  });
