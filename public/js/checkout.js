document.addEventListener('DOMContentLoaded', () => {
    const btnPlaceOrder = document.getElementById('btnPlaceOrder');
    const selectedAddressCard = document.getElementById('selectedAddressCard');

    if (btnPlaceOrder) {
        btnPlaceOrder.addEventListener('click', async () => {
            if (!selectedAddressCard) {
                KavoxNotify.toast('Please add or select a shipping address before placing your order.', 'warning');
                return;
            }

            const addressId = selectedAddressCard.dataset.id;
            const paymentMethodInput = document.querySelector('input[name="paymentMethod"]:checked');
            
            if (!paymentMethodInput) {
                KavoxNotify.toast('Please select a payment method.', 'warning');
                return;
            }

            const paymentMethod = paymentMethodInput.value;

            try {
                // Show loading state
                btnPlaceOrder.textContent = 'PLACING ORDER...';
                btnPlaceOrder.disabled = true;

                const response = await fetch('/api/checkout/place-order', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        addressId,
                        paymentMethod
                    })
                });

                const data = await response.json();

                if (data.success) {
                    // Show the animated modal
                    const modal = document.getElementById('orderSuccessModal');
                    if (modal) {
                        modal.style.display = 'flex';
                        // Small delay to allow display block to apply before adding class for opacity transition
                        setTimeout(() => {
                            modal.classList.add('show');
                        }, 50);
                    }
                    
                    // Wait for animation to finish then redirect
                    setTimeout(() => {
                        window.location.href = `/order-success?id=${data.orderId}`; // Redirect to success page
                    }, 2500);
                } else {
                    KavoxNotify.toast(data.message || 'Something went wrong while placing your order.', 'error');
                    btnPlaceOrder.textContent = 'PROCEED TO PAYMENT';
                    btnPlaceOrder.disabled = false;
                }
            } catch (error) {
                console.error('Error placing order:', error);
                KavoxNotify.toast('An unexpected error occurred. Please try again later.', 'error');
                btnPlaceOrder.textContent = 'PROCEED TO PAYMENT';
                btnPlaceOrder.disabled = false;
            }
        });
    }

    // Optional: Add logic to handle coupon apply if needed in the future
    const btnApplyCoupon = document.querySelector('.btn-apply-coupon');
    if (btnApplyCoupon) {
        btnApplyCoupon.addEventListener('click', () => {
            KavoxNotify.toast('Coupon functionality is not yet active.', 'info');
        });
    }
});
