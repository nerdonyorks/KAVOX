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

    currentQty += change;

    if (currentQty >= minQty && currentQty <= maxQty) {
        qtyInput.value = currentQty;
    }
}

// Verify if product is still active (real-time check)
async function verifyProductAvailability() {
    try {
        const response = await fetch(`/api/products/${window.productId}/status`);
        const data = await response.json();
        
        if (data.success && data.isActive === false) {
            Swal.fire({
                icon: 'error',
                title: 'Product Unavailable',
                text: 'This product has been unlisted or removed.',
                confirmButtonColor: '#e91e63'
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
            thumb.onclick = function() { changeMainImage(img.url, this); };
            thumb.innerHTML = `<img src="${img.url}" alt="Thumbnail ${index + 1}">`;
            thumbnailList.appendChild(thumb);
        });
    }
}

function updateSizesForColor(variants) {
    const availableSizes = variants.map(v => v.size);
    let sizeStillValid = false;

    document.querySelectorAll('.size-item').forEach(item => {
        const size = item.getAttribute('data-size');
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
    const isAvailable = await verifyProductAvailability();
    if (!isAvailable) return;

    if (!selectedSize || !selectedColor) {
        Swal.fire({
            icon: 'warning',
            title: 'Selection Required',
            text: 'Please select both size and color.',
            confirmButtonColor: '#e91e63'
        });
        return;
    }
    const quantity = document.getElementById('buyQty').value;
    console.log(`Adding to cart: Product ${productId}, Size ${selectedSize}, Color ${selectedColor}, Qty ${quantity}`);
    
    // Future: AJAX call to backend
    Swal.fire({
        icon: 'success',
        title: 'Added to Cart',
        text: `Successfully added ${quantity} item(s) to cart!`,
        confirmButtonColor: '#e91e63'
    });
}

async function buyNow(productId) {
    // Real-time check
    const isAvailable = await verifyProductAvailability();
    if (!isAvailable) return;

    if (!selectedSize || !selectedColor) {
        Swal.fire({
            icon: 'warning',
            title: 'Selection Required',
            text: 'Please select both size and color.',
            confirmButtonColor: '#e91e63'
        });
        return;
    }
    const quantity = document.getElementById('buyQty').value;
    console.log(`Buying now: Product ${productId}, Size ${selectedSize}, Color ${selectedColor}, Qty ${quantity}`);
    
    // Future: Redirect to checkout with these params
    window.location.href = `/checkout?productId=${productId}&size=${selectedSize}&color=${selectedColor}&qty=${quantity}`;
}
