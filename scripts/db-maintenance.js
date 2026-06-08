/**
 * Database Maintenance Scripts
 * ────────────────────────────
 * Consolidates all one-off DB helpers that were previously scattered
 * as scratch*.js / delete_test_products.js in the project root.
 *
 * Usage:
 *   node scripts/db-maintenance.js <command>
 *
 * Commands:
 *   find-test-products        Find products whose name matches /test/i
 *   find-test-items-in-carts  Count cart items that reference "test" products
 *   find-inactive-in-carts    Find inactive / soft-deleted products still in carts
 *   clean-null-cart-items      Remove cart items with null productId
 *   clean-invalid-cart-items   Remove cart items with invalid product / variant / category
 *   delete-test-products       Hard-delete all "test" products & tidy empty carts
 */

const mongoose = require('mongoose');
require('dotenv').config();

// ── Models (lazy-loaded to keep startup fast) ─────────────────────
const Product = () => require('../src/models/productModel');
const Cart    = () => require('../src/models/cartModel');
const User    = () => require('../src/models/userModel');

// ── Helpers ───────────────────────────────────────────────────────
async function connect() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/kavox';
  await mongoose.connect(uri);
  console.log('✔ Connected to MongoDB');
}

function disconnect() {
  return mongoose.disconnect();
}

// ── Commands ──────────────────────────────────────────────────────

/** Find products whose name matches /test/i */
async function findTestProducts() {
  const testProducts = await Product().find({ name: { $regex: /test/i } });
  console.log('Found test products:', testProducts.map(p => p.name));
  return testProducts;
}

/** Count cart items that reference "test" products */
async function findTestItemsInCarts() {
  const carts = await Cart().find().populate('items.productId');
  let count = 0;
  carts.forEach(c => {
    c.items.forEach(i => {
      if (i.productId && i.productId.name && i.productId.name.toLowerCase().includes('test')) {
        count++;
      }
    });
  });
  console.log('Found test items in carts:', count);
  return count;
}

/** Find inactive / soft-deleted products still sitting in carts */
async function findInactiveInCarts() {
  const carts = await Cart().find().populate('items.productId');
  carts.forEach(c => {
    c.items.forEach(i => {
      if (i.productId && (i.productId.isDeleted || !i.productId.isActive)) {
        console.log('Found inactive/deleted product in cart:', i.productId.name);
      }
    });
  });
  console.log('Done');
}

/** Remove cart items whose productId resolved to null */
async function cleanNullCartItems() {
  const carts = await Cart().find();
  let count = 0;
  for (const c of carts) {
    let changed = false;
    c.items = c.items.filter(i => {
      if (!i.productId) {
        changed = true;
        count++;
        return false;
      }
      return true;
    });
    if (changed) await c.save();
  }
  console.log('Removed items with null productId:', count);

  // Also report any lingering test products
  const p = await Product().find({ name: /test/i });
  if (p.length) {
    console.log('Found test products:', p.map(x => x.name));
  }
  console.log('Done');
}

/**
 * Deep-clean carts: remove items whose product, variant, or category
 * is deleted / inactive, then recalculate cart totals.
 */
async function cleanInvalidCartItems() {
  const carts = await Cart().find().populate({
    path: 'items.productId',
    populate: { path: 'category' },
  });

  for (const cart of carts) {
    let hasChanges = false;
    cart.items = cart.items.filter(item => {
      const product = item.productId;
      if (
        !product ||
        product.isDeleted ||
        !product.isActive ||
        !product.category ||
        !product.category.isActive ||
        product.category.isDeleted
      ) {
        console.log('Removing invalid product:', product ? product.name : 'null');
        hasChanges = true;
        return false;
      }
      const variant = product.variants.find(
        v => v.size === item.size && v.color === item.color,
      );
      if (!variant || !variant.isActive) {
        console.log('Removing invalid variant for:', product.name);
        hasChanges = true;
        return false;
      }
      return true;
    });
    if (hasChanges) {
      cart.cartTotal = cart.items.reduce((a, b) => a + b.totalPrice, 0);
      await cart.save();
    }
  }

  // Soft-delete lingering test products
  const tests = await Product().find({ name: /test/i });
  if (tests.length) {
    console.log('Found test products:', tests.map(x => x.name));
    for (const p of tests) {
      p.isDeleted = true;
      await p.save();
      console.log('Soft-deleted:', p.name);
    }
  }
  console.log('Done');
}

/** Hard-delete all "test" products & tidy empty carts */
async function deleteTestProducts() {
  const ProductModel = Product();
  const tests = await ProductModel.find({ name: /test/i });
  if (tests.length) {
    console.log('Found test products:', tests.map(x => x.name));
    for (const p of tests) {
      await ProductModel.deleteOne({ _id: p._id });
      console.log('Deleted:', p.name);
    }
  } else {
    console.log('No test products found.');
  }

  // Tidy empty carts
  const carts = await Cart().find();
  for (const c of carts) {
    if (c.items.length === 0) {
      await c.save(); // trigger any pre-save hooks to normalise data
    }
  }
  console.log('Done');
}

// ── CLI dispatcher ────────────────────────────────────────────────
const COMMANDS = {
  'find-test-products':        findTestProducts,
  'find-test-items-in-carts':  findTestItemsInCarts,
  'find-inactive-in-carts':    findInactiveInCarts,
  'clean-null-cart-items':     cleanNullCartItems,
  'clean-invalid-cart-items':  cleanInvalidCartItems,
  'delete-test-products':      deleteTestProducts,
};

async function main() {
  const command = process.argv[2];

  if (!command || !COMMANDS[command]) {
    console.log('Usage: node scripts/db-maintenance.js <command>\n');
    console.log('Available commands:');
    Object.keys(COMMANDS).forEach(c => console.log(`  ${c}`));
    process.exit(1);
  }

  try {
    await connect();
    await COMMANDS[command]();
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await disconnect();
    process.exit(0);
  }
}

main();
