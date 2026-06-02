/**
 * Kavox Product Details Interactivity
 */

let selectedSize = null;
let selectedColor = null;

// Change Main Image from Thumbnails
function changeMainImage(url, element) {
    const mainImg = document.getElementById('mainProductImage');
    mainImg.src = url;

    // Update active class on thumbnails
    document.querySelectorAll('.thumbnail-item').forEach(item => {
        item.classList.remove('active');
    });
    element.classList.add('active');

    // Reset zoom if any
    resetZoom();
}

// Product Quantity Control
function updateQty(change) {
    const qtyInput = document.getElementById('buyQty');
    let currentQty = parseInt(qtyInput.value);
    const maxQty = parseInt(qtyInput.max) || 10;
    const minQty = parseInt(qtyInput.min) || 1;

    const newQty = currentQty + change;

    if (newQty > maxQty) {
        if (maxQty === 10) {
            KavoxNotify.toast('Maximum 10 units allowed per order', 'error');
        } else {
            KavoxNotify.toast(`Only ${maxQty} items available in stock`, 'error');
        }
        return;
    }

    if (newQty < minQty) {
        return;
    }

    qtyInput.value = newQty;
}

// Verify if product is still active (real-time check)
async function verifyProductAvailability(productId) {
    const idToCheck = productId || window.productId;
    if (!idToCheck) return true; // Fail safe if ID is missing
    
    try {
        const response = await fetch(`/api/products/${idToCheck}/status`);
        const data = await response.json();

        if (data.success && data.isActive === false) {
            KavoxNotify.alert({
                icon: 'error',
                title: 'Product Unavailable',
                text: 'This product has been unlisted or removed.'
            }).then(() => {
                window.location.href = '/shop';
            });
            return false;
        }
        return true;
    } catch (err) {
        console.error('Status check failed:', err);
        return true; // Proceed if check fails to avoid blocking user unnecessarily
    }
}

// Variant Selection: Size
async function selectSize(size, element) {
    if (element.classList.contains('disabled')) return;

    // Real-time check
    const isAvailable = await verifyProductAvailability();
    if (!isAvailable) return;

    selectedSize = size;
    document.querySelectorAll('.size-item').forEach(item => {
        item.classList.remove('active');
    });
    element.classList.add('active');
    console.log('Selected Size:', size);
    updateStockDisplay();
}

// Variant Selection: Color
async function selectColor(color, element) {
    // Real-time check
    const isAvailable = await verifyProductAvailability();
    if (!isAvailable) return;

    selectedColor = color;
    document.querySelectorAll('.color-item').forEach(item => {
        item.classList.remove('active');
    });
    element.classList.add('active');

    // 1. Filter variants by color
    const colorVariants = window.productVariants.filter(v => v.color.toLowerCase() === color.toLowerCase() && v.isActive);

    if (colorVariants.length > 0) {
        // 2. Update Gallery to show this color's images
        updateGalleryForColor(colorVariants);

        // 3. Update Sizes availability
        updateSizesForColor(colorVariants);
    }

    console.log('Selected Color:', color);
    updateStockDisplay();
}

function updateGalleryForColor(variants) {
    const thumbnailList = document.querySelector('.thumbnail-list');
    const mainImg = document.getElementById('mainProductImage');

    // Collect all unique images for this color
    const colorImages = [];
    variants.forEach(v => {
        v.images.forEach(img => {
            if (!colorImages.find(ci => ci.url === img.url)) {
                colorImages.push(img);
            }
        });
    });

    if (colorImages.length > 0) {
        // Set first image as main
        mainImg.src = colorImages[0].url;

        // Rebuild thumbnail list
        thumbnailList.innerHTML = '';
        colorImages.forEach((img, index) => {
            const thumb = document.createElement('div');
            thumb.className = `thumbnail-item ${index === 0 ? 'active' : ''}`;
            thumb.onclick = function () { changeMainImage(img.url, this); };
            thumb.innerHTML = `<img src="${img.url}" alt="Thumbnail ${index + 1}">`;
            thumbnailList.appendChild(thumb);
        });
    }
}

function updateSizesForColor(variants) {
    const availableSizes = variants.filter(v => v.quantity > 0).map(v => String(v.size).trim());
    let sizeStillValid = false;

    document.querySelectorAll('.size-item').forEach(item => {
        const size = item.getAttribute('data-size').trim();
        
        // Ensure all sizes are always visible
        item.style.display = '';

        if (availableSizes.includes(size)) {
            item.classList.remove('disabled');
            if (size === selectedSize) {
                sizeStillValid = true;
            }
        } else {
            item.classList.add('disabled');
            item.classList.remove('active');
        }
    });

    if (!sizeStillValid) {
        selectedSize = null;
        console.log('Selection Reset: Previous size not available in this color.');
    }
}

function updateStockDisplay() {
    if (window.isBlocked) return;

    let variantsToCount = window.productVariants;
    if (selectedSize) {
        variantsToCount = variantsToCount.filter(v => String(v.size) === String(selectedSize));
    }
    if (selectedColor) {
        variantsToCount = variantsToCount.filter(v => v.color.toLowerCase() === selectedColor.toLowerCase());
    }

    const totalStock = variantsToCount.reduce((sum, v) => sum + v.quantity, 0);
    const stockBadge = document.querySelector('.stock-badge');

    if (stockBadge) {
        if (totalStock === 0) {
            stockBadge.textContent = 'Out of Stock';
            stockBadge.className = 'stock-badge stock-out';
        } else if (totalStock < 10) {
            stockBadge.textContent = `Only ${totalStock} Left!`;
            stockBadge.className = 'stock-badge stock-low';
        } else {
            stockBadge.textContent = 'In Stock';
            stockBadge.className = 'stock-badge stock-in';
        }
    }

    const qtyInput = document.getElementById('buyQty');
    const qtyBtns = document.querySelectorAll('.qty-btn');

    if (qtyInput) {
        const maxQty = Math.min(10, totalStock);
        qtyInput.max = maxQty > 0 ? maxQty : 1;
        if (parseInt(qtyInput.value) > totalStock && totalStock > 0) {
            qtyInput.value = totalStock;
        }
        qtyInput.disabled = totalStock === 0;
    }

    if (qtyBtns.length > 0) {
        qtyBtns.forEach(btn => btn.disabled = totalStock === 0);
        const qtyControl = document.querySelector('.quantity-control');
        if (qtyControl) {
            qtyControl.style.opacity = totalStock === 0 ? '0.6' : '1';
            qtyControl.style.cursor = totalStock === 0 ? 'not-allowed' : '';
        }
    }

    // Disable Action Buttons if out of stock
    const btnAddCart = document.querySelector('.btn-add-cart');
    const btnBuyNow = document.querySelector('.btn-buy-now');

    if (btnAddCart) {
        btnAddCart.disabled = totalStock === 0;
        btnAddCart.style.opacity = totalStock === 0 ? '0.5' : '1';
        btnAddCart.style.cursor = totalStock === 0 ? 'not-allowed' : 'pointer';
        btnAddCart.textContent = totalStock === 0 ? 'Out of Stock' : 'Add to Cart';
    }

    if (btnBuyNow) {
        btnBuyNow.disabled = totalStock === 0;
        btnBuyNow.style.opacity = totalStock === 0 ? '0.5' : '1';
        btnBuyNow.style.cursor = totalStock === 0 ? 'not-allowed' : 'pointer';
    }
}

// Tab Switching logic
function switchTab(tabId, element) {
    // Hide all tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.style.display = 'none';
    });

    // Show selected tab content
    document.getElementById(tabId).style.display = 'block';

    // Update active state on buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    element.classList.add('active');
}

// Image Zoom Functionality
function zoomImage(event) {
    const container = document.getElementById('mainImageContainer');
    const mainImg = document.getElementById('mainProductImage');
    const lens = document.getElementById('zoomLens');

    lens.style.display = 'block';

    const containerRect = container.getBoundingClientRect();
    const x = event.pageX - containerRect.left - window.scrollX;
    const y = event.pageY - containerRect.top - window.scrollY;

    // Lens Positioning
    let lensX = x - (lens.offsetWidth / 2);
    let lensY = y - (lens.offsetHeight / 2);

    // Boundaries
    if (lensX < 0) lensX = 0;
    if (lensY < 0) lensY = 0;
    if (lensX > containerRect.width - lens.offsetWidth) lensX = containerRect.width - lens.offsetWidth;
    if (lensY > containerRect.height - lens.offsetHeight) lensY = containerRect.height - lens.offsetHeight;

    lens.style.left = lensX + 'px';
    lens.style.top = lensY + 'px';

    // Background Zoom Effect
    const zoomLevel = 2.5;
    const backgroundPosX = (lensX / (containerRect.width - lens.offsetWidth)) * 100;
    const backgroundPosY = (lensY / (containerRect.height - lens.offsetHeight)) * 100;

    mainImg.style.transformOrigin = `${backgroundPosX}% ${backgroundPosY}%`;
    mainImg.style.transform = `scale(${zoomLevel})`;
}

function resetZoom() {
    const mainImg = document.getElementById('mainProductImage');
    const lens = document.getElementById('zoomLens');

    if (lens) lens.style.display = 'none';
    if (mainImg) {
        mainImg.style.transform = 'scale(1)';
        mainImg.style.transformOrigin = 'center';
    }
}

// Actions logic (Placeholders for now)
async function addToCart(productId) {
    // Real-time check
    const isAvailable = await verifyProductAvailability(productId);
    if (!isAvailable) return;

    if (!selectedSize || !selectedColor) {
        KavoxNotify.toast('Please select both size and color.', 'error');
        return;
    }
    const quantity = parseInt(document.getElementById('buyQty').value);

    // Find the actual variantId
    const variant = window.productVariants.find(v =>
        v.color.toLowerCase() === selectedColor.toLowerCase() &&
        String(v.size) === String(selectedSize)
    );

    if (!variant) {
        return KavoxNotify.toast('Selected variant not found', 'error');
    }

    if (variant.quantity <= 0) {
        return KavoxNotify.toast('Selected variant is out of stock', 'error');
    }

    try {
        const response = await fetch('/api/cart/add', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                productId: productId,
                variantId: variant._id,
                size: selectedSize,
                color: selectedColor,
                quantity: quantity
            })
        });

        if (response.status === 401) {
            KavoxNotify.toast('Please login to add to cart', 'error');
            setTimeout(() => {
                window.location.href = '/login?returnTo=' + encodeURIComponent(window.location.pathname + window.location.search);
            }, 1000);
            return;
        }

        const result = await response.json();

        if (result.success) {
            KavoxNotify.toast("Added to cart successfully!", 'success');
            if (typeof window.updateBadges === 'function') window.updateBadges();
            setTimeout(() => {
                window.location.href = '/cart';
            }, 800);
        } else {
            KavoxNotify.alert({ title: 'Oops', text: result.message, icon: 'error' });
        }
    } catch (error) {
        console.error("Submission error:", error);
        KavoxNotify.toast("Failed to add to cart", 'error');
    }
}

async function buyNow(productId) {
    // Real-time check
    const isAvailable = await verifyProductAvailability(productId);
    if (!isAvailable) return;

    if (!selectedSize || !selectedColor) {
        KavoxNotify.toast('Please select both size and color.', 'error');
        return;
    }
    const quantity = document.getElementById('buyQty').value;

    const variant = window.productVariants.find(v =>
        v.color.toLowerCase() === selectedColor.toLowerCase() &&
        String(v.size) === String(selectedSize)
    );

    if (!variant || variant.quantity <= 0) {
        return KavoxNotify.toast('Selected variant is out of stock', 'error');
    }

    try {
        const response = await fetch('/api/cart/add', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                productId: productId,
                size: selectedSize,
                color: selectedColor,
                quantity: quantity
            })
        });

        if (response.status === 401) {
            KavoxNotify.toast('Please login to continue', 'error');
            setTimeout(() => { window.location.href = '/login'; }, 800);
            return;
        }

        const result = await response.json();

        if (result.success) {
            if (typeof window.updateBadges === 'function') window.updateBadges();
            // Redirect straight to checkout
            window.location.href = '/checkout';
        } else {
            KavoxNotify.alert({ title: 'Oops', text: result.message, icon: 'error' });
        }
    } catch (error) {
        console.error("Submission error:", error);
        KavoxNotify.toast("Failed to process request", 'error');
    }
}
