
// State for the Add-to-Cart Modal
let atcData = {
    product: null,
    selectedColor: null,
    selectedSize: null,
    selectedQty: 1,
    currentVariant: null
};


//Open the Add-to-Cart Modal


async function openAddToCartModal(productId) {
    // Show a global loading state if needed
    try {
        const response = await fetch(`/api/products/${productId}/variants`);
        const result = await response.json();

        if (!result.success) {
            return KavoxNotify.toast(result.message, 'error');
        }

        // Initialize state
        atcData = {
            product: result.data,
            selectedColor: null,
            selectedSize: null,
            selectedQty: 1,
            currentVariant: null
        };

        renderAddToCartModal();
    } catch (error) {
        console.error("Failed to load variants:", error);
        KavoxNotify.toast("Error loading product data", 'error');
    }
}


//Render the Custom Modal UI

function renderAddToCartModal() {
    const { product } = atcData;
    
    let modalOverlay = document.getElementById('kavox-modal-overlay');
    if (!modalOverlay) {
        modalOverlay = document.createElement('div');
        modalOverlay.id = 'kavox-modal-overlay';
        document.body.appendChild(modalOverlay);
    }

    // Prepare distinct colors
    const colors = [...new Set(product.variants.map(v => v.color))];
    
    // Initial best-guess image: first variant's first image or product placeholder
    const initialImg = product.variants[0]?.images[0]?.url || '/images/placeholder.jpg';

    modalOverlay.innerHTML = `
        <div class="atc-modal">
            <button class="atc-close" onclick="closeAtcModal()">&times;</button>
            
            <div class="atc-left">
                <img src="${initialImg}" alt="${product.name}" id="atcMainImg" class="atc-main-img">
            </div>
            
            <div class="atc-right">
                <h2 class="atc-product-name">${product.name}</h2>
                <div class="atc-price">₹${product.finalPrice}</div>
                
                <span class="variant-label">Select Color</span>
                <div class="color-options">
                    ${colors.map(color => `
                        <div class="color-swatch" data-color="${color}" title="${color}" onclick="selectAtcColor('${color}')">
                            <span style="background-color: ${color.toLowerCase().replace(' ', '')}"></span>
                        </div>
                    `).join('')}
                </div>
                
                <span class="variant-label">Select Size</span>
                <div class="size-options" id="atcSizeOptions">
                    <p style="font-size: 11px; color: #888;">Select a color first...</p>
                </div>
                
                <div class="atc-error" id="atcError"></div>

                <div class="atc-qty-row">
                    <div class="qty-control">
                        <button onclick="updateAtcQty(-1)">-</button>
                        <span id="atcQtyDisplay">1</span>
                        <button onclick="updateAtcQty(1)">+</button>
                    </div>
                    <button class="btn-add-final" id="atcSubmitBtn" onclick="submitAddToCart()">Add to Cart</button>
                </div>
            </div>
        </div>
    `;

    modalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeAtcModal() {
    const overlay = document.getElementById('kavox-modal-overlay');
    if (overlay) {
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    }
}


 //Handle Color Selection

function selectAtcColor(color) {
    atcData.selectedColor = color;
    atcData.selectedSize = null; // Reset size
    
    // Update Active Swatch
    document.querySelectorAll('.color-swatch').forEach(s => {
        s.classList.toggle('active', s.getAttribute('data-color') === color);
    });

    // Update Image
    const variantWithImg = atcData.product.variants.find(v => v.color === color && v.images.length > 0);
    if (variantWithImg) {
        document.getElementById('atcMainImg').src = variantWithImg.images[0].url;
    }

    // Filter Sizes
    const sizes = atcData.product.variants
        .filter(v => v.color === color)
        .sort((a, b) => parseInt(a.size) - parseInt(b.size));

    const sizeContainer = document.getElementById('atcSizeOptions');
    sizeContainer.innerHTML = sizes.map(v => `
        <button class="size-btn ${v.quantity <= 0 ? 'out-of-stock' : ''}" 
                ${v.quantity <= 0 ? 'disabled' : ''} 
                onclick="selectAtcSize('${v.size}', '${v._id}')"
                data-size="${v.size}">
            ${v.size}
            ${v.quantity <= 0 ? '<br><small style="font-size: 9px;">Out of Stock</small>' : ''}
        </button>
    `).join('');
    
    document.getElementById('atcError').style.display = 'none';
}


//Handle Size Selection
 
function selectAtcSize(size, variantId) {
    atcData.selectedSize = size;
    atcData.currentVariant = atcData.product.variants.find(v => v._id === variantId);
    
    document.querySelectorAll('.size-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-size') === size);
    });
    
    document.getElementById('atcError').style.display = 'none';
}

 //Handle Qty Update

function updateAtcQty(change) {
    const newQty = atcData.selectedQty + change;
    if (newQty < 1 || newQty > 10) return;
    
    atcData.selectedQty = newQty;
    document.getElementById('atcQtyDisplay').textContent = newQty;
}


//Submit to Cart

async function submitAddToCart() {
    const errorEl = document.getElementById('atcError');
    
    if (!atcData.selectedColor || !atcData.selectedSize) {
        errorEl.textContent = "Please select color and size.";
        errorEl.style.display = 'block';
        return;
    }

    const submitBtn = document.getElementById('atcSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = "Adding...";

    try {
        const response = await fetch('/api/cart/add', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                productId: atcData.product.id,
                variantId: atcData.currentVariant._id,
                quantity: atcData.selectedQty
            })
        });

        if (response.status === 401) {
            closeAtcModal();
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
            errorEl.textContent = result.message;
            errorEl.style.display = 'block';
            submitBtn.disabled = false;
            submitBtn.textContent = "Add to Cart";
        }
    } catch (error) {
        console.error("Submission error:", error);
        KavoxNotify.toast("Failed to add to cart", 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = "Add to Cart";
    }
}


//Global Utilities (Replacing old Swal logic)


async function updateCartQty(itemId, change) {
    const qtyInput = document.getElementById(`qty-${itemId}`);
    if (!qtyInput) return;

    const currentQty = parseInt(qtyInput.value);
    const newQty = currentQty + change;

    if (newQty < 1 || newQty > 10) return;

    try {
        const response = await fetch('/api/cart/quantity', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemId, change })
        });

        const data = await response.json();

        if (data.success) {
            qtyInput.value = data.newQty;
            const subtotalElement = document.getElementById(`subtotal-${itemId}`);
            if (subtotalElement) subtotalElement.innerText = `₹${data.itemTotal}`;
            
            // Update Summary Breakdown
            const s = data.summary;
            if (document.getElementById('summaryActualPrice')) 
                document.getElementById('summaryActualPrice').innerText = `₹${s.totalActualPrice}`;
            
            if (document.getElementById('summaryProductDiscount')) {
                document.getElementById('summaryProductDiscount').innerText = `-₹${s.totalProductDiscount}`;
                document.getElementById('rowProductDiscount').style.display = s.totalProductDiscount > 0 ? 'flex' : 'none';
            }
            
            if (document.getElementById('summaryCategoryDiscount')) {
                document.getElementById('summaryCategoryDiscount').innerText = `-₹${s.totalCategoryDiscount}`;
                document.getElementById('rowCategoryDiscount').style.display = s.totalCategoryDiscount > 0 ? 'flex' : 'none';
            }

            if (document.getElementById('cartTotal')) 
                document.getElementById('cartTotal').innerText = `₹${s.cartTotal}`;
            
            if (document.getElementById('summaryTotal')) 
                document.getElementById('summaryTotal').innerText = `₹${s.cartTotal}`;

            if (typeof window.updateBadges === 'function') window.updateBadges();
        } else {
            KavoxNotify.toast(data.message, 'error');
        }
    } catch (error) {
        console.error('Update quantity failed:', error);
    }
}

async function removeFromCart(itemId) {
    const confirmed = await KavoxNotify.confirm({
        title: 'Remove Item?',
        text: 'Are you sure you want to remove this item from your cart?',
        confirmText: 'Yes, Remove',
        cancelText: 'No, Keep'
    });

    if (confirmed.isConfirmed) {
        try {
            const response = await fetch(`/api/cart/remove/${itemId}`, { method: 'DELETE' });
            const data = await response.json();

            if (data.success) {
                const itemRow = document.getElementById(`cart-item-${itemId}`);
                if (itemRow) {
                    itemRow.style.opacity = '0';
                    setTimeout(() => {
                        itemRow.remove();
                        if (typeof window.updateBadges === 'function') window.updateBadges();
                        if (data.cartCount === 0) location.reload();
                        else {
                            const s = data.summary;
                            if (document.getElementById('summaryActualPrice')) 
                                document.getElementById('summaryActualPrice').innerText = `₹${s.totalActualPrice}`;
                            
                            if (document.getElementById('summaryProductDiscount')) {
                                document.getElementById('summaryProductDiscount').innerText = `-₹${s.totalProductDiscount}`;
                                document.getElementById('rowProductDiscount').style.display = s.totalProductDiscount > 0 ? 'flex' : 'none';
                            }
                            
                            if (document.getElementById('summaryCategoryDiscount')) {
                                document.getElementById('summaryCategoryDiscount').innerText = `-₹${s.totalCategoryDiscount}`;
                                document.getElementById('rowCategoryDiscount').style.display = s.totalCategoryDiscount > 0 ? 'flex' : 'none';
                            }

                            if (document.getElementById('cartTotal')) 
                                document.getElementById('cartTotal').innerText = `₹${s.cartTotal}`;
                            
                            if (document.getElementById('summaryTotal')) 
                                document.getElementById('summaryTotal').innerText = `₹${s.cartTotal}`;
                        }
                    }, 300);
                }
            } else {
                KavoxNotify.toast(data.message, 'error');
            }
        } catch (error) {
            console.error('Remove from cart failed:', error);
        }
    }
}

async function toggleWishlist(productId, element) {
    try {
        const response = await fetch('/api/wishlist/toggle', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ productId })
        });

        if (response.status === 401) {
            KavoxNotify.toast('Please login to manage wishlist', 'error');
            setTimeout(() => {
                window.location.href = '/login?returnTo=' + encodeURIComponent(window.location.pathname + window.location.search);
            }, 1000);
            return;
        }

        const data = await response.json();

        if (data.success) {
            const icon = element.querySelector('svg');
            if (data.action === 'added') element.classList.add('active');
            else element.classList.remove('active');

            if (typeof window.updateBadges === 'function') window.updateBadges();
            KavoxNotify.toast(data.action === 'added' ? 'Added to Wishlist' : 'Removed from Wishlist', 'success');
        }
    } catch (error) {
        console.error('Wishlist toggle failed:', error);
    }
}

// Global exposure
window.openAddToCartModal = openAddToCartModal;
window.updateCartQty = updateCartQty;
window.removeFromCart = removeFromCart;
window.toggleWishlist = toggleWishlist;
window.closeAtcModal = closeAtcModal;
window.selectAtcColor = selectAtcColor;
window.selectAtcSize = selectAtcSize;
window.updateAtcQty = updateAtcQty;
window.submitAddToCart = submitAddToCart;


