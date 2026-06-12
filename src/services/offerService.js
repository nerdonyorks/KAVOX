const ProductOffer = require("../models/productOfferModel");
const CategoryOffer = require("../models/categoryOfferModel");

class OfferService {
  /**
   * Dynamically populates active product and category offers onto product objects.
   * Modifies the objects in place (attaching productOffer and categoryOffer/category.offer).
   * Ensures no database N+1 query overhead by batching lookups.
   * @param {Object|Array} productsInput - Single product or array of products
   * @returns {Promise<Object|Array>} Populated product(s)
   */
  async populateProductOffers(productsInput) {
    if (!productsInput) return productsInput;
    const isArray = Array.isArray(productsInput);
    const products = isArray ? productsInput : [productsInput];

    if (products.length === 0) return productsInput;

    const productIds = products.map(p => p._id);
    const categoryIds = products.map(p => p.category && (p.category._id || p.category)).filter(Boolean);

    const currentDate = new Date();

    // Query active offers
    const [productOffers, categoryOffers] = await Promise.all([
      ProductOffer.find({
        productId: { $in: productIds },
        isActive: true,
        startDate: { $lte: currentDate },
        endDate: { $gte: currentDate }
      }).lean(),
      CategoryOffer.find({
        categoryId: { $in: categoryIds },
        isActive: true,
        startDate: { $lte: currentDate },
        endDate: { $gte: currentDate }
      }).lean()
    ]);

    // Build Maps keeping only the highest discount percentage
    const prodOfferMap = {};
    productOffers.forEach(o => {
      if (!prodOfferMap[o.productId] || prodOfferMap[o.productId] < o.discountPercentage) {
        prodOfferMap[o.productId] = o.discountPercentage;
      }
    });

    const catOfferMap = {};
    categoryOffers.forEach(o => {
      if (!catOfferMap[o.categoryId] || catOfferMap[o.categoryId] < o.discountPercentage) {
        catOfferMap[o.categoryId] = o.discountPercentage;
      }
    });

    // Attach values onto product objects
    products.forEach(p => {
      // If it's a Mongoose document, we convert to Object to allow adding arbitrary properties
      const target = typeof p.toObject === 'function' ? p : p;
      target.productOffer = prodOfferMap[p._id.toString()] || 0;
      
      const catId = p.category && (p.category._id ? p.category._id.toString() : p.category.toString());
      target.categoryOffer = catId ? (catOfferMap[catId] || 0) : 0;
      
      if (p.category && typeof p.category === 'object') {
        p.category.offer = target.categoryOffer;
      }
    });

    return productsInput;
  }

  /**
   * Centralized offer price calculator. Returns original price, best discount, and final calculated price.
   * @param {Object} product - Populated product object
   * @returns {Object} Pricing summary containing originalPrice, discountPercentage, finalPrice, and offerType
   */
  getDiscountedPrice(product) {
    if (!product) {
      return { originalPrice: 0, discountPercentage: 0, finalPrice: 0, offerType: "NONE" };
    }

    const pOffer = product.productOffer || 0;
    const cOffer = (product.category && typeof product.category === 'object') 
      ? (product.category.offer || 0) 
      : (product.categoryOffer || 0);

    const discount = Math.max(pOffer, cOffer);
    const finalPrice = discount > 0 
      ? Math.round(product.price * (1 - discount / 100)) 
      : product.price;

    return {
      originalPrice: product.price,
      discountPercentage: discount,
      finalPrice: finalPrice,
      offerType: discount === 0 ? 'NONE' : (discount === pOffer ? 'PRODUCT' : 'CATEGORY')
    };
  }
}

module.exports = new OfferService();
