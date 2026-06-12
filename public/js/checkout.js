document.addEventListener('DOMContentLoaded', () => {
    // Toggle active class on payment option labels on change
    const paymentRadios = document.querySelectorAll('input[name="paymentMethod"]');
    paymentRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            document.querySelectorAll('.payment-option').forEach(label => {
                label.classList.remove('active');
            });
            const parentLabel = radio.closest('.payment-option');
            if (parentLabel) {
                parentLabel.classList.add('active');
            }
        });
    });

    const btnPlaceOrder = document.getElementById('btnPlaceOrder');
    const selectedAddressCard = document.getElementById('selectedAddressCard');

    // Wallet application UI elements
    const useWalletCheckbox = document.getElementById('useWalletCheckbox');
    const walletAppliedInfo = document.getElementById('walletAppliedInfo');
    const walletAppliedAmountSpan = document.getElementById('walletAppliedAmount');
    const walletDeductionRow = document.getElementById('walletDeductionRow');
    const walletDeductionValue = document.getElementById('walletDeductionValue');
    const paymentMethodsWrapper = document.getElementById('paymentMethodsWrapper');

    const couponDiscountRow = document.getElementById('couponDiscountRow');
    const couponDiscountValue = document.getElementById('couponDiscountValue');
    const finalTotalValue = document.getElementById('finalTotalValue');

    let walletBalance = useWalletCheckbox ? parseFloat(useWalletCheckbox.dataset.balance || 0) : 0;
    let baseCartTotal = finalTotalValue ? parseFloat(finalTotalValue.textContent.replace('₹', '')) : 0;

    const recalculateWalletAndTotal = () => {
        let isWalletChecked = useWalletCheckbox && useWalletCheckbox.checked;
        let finalPayableTotal = baseCartTotal;
        let appliedWalletAmount = 0;

        if (isWalletChecked) {
            if (walletBalance >= baseCartTotal) {
                appliedWalletAmount = baseCartTotal;
                finalPayableTotal = 0;
            } else {
                appliedWalletAmount = walletBalance;
                finalPayableTotal = baseCartTotal - walletBalance;
            }

            if (walletAppliedInfo) walletAppliedInfo.style.display = 'block';
            if (walletAppliedAmountSpan) walletAppliedAmountSpan.textContent = appliedWalletAmount;
            if (walletDeductionRow) walletDeductionRow.style.display = 'flex';
            if (walletDeductionValue) walletDeductionValue.textContent = `-₹${appliedWalletAmount}`;
        } else {
            if (walletAppliedInfo) walletAppliedInfo.style.display = 'none';
            if (walletDeductionRow) walletDeductionRow.style.display = 'none';
        }

        if (finalTotalValue) finalTotalValue.textContent = `₹${finalPayableTotal}`;

        // If remaining payable total is 0, hide options and place order using wallet
        if (finalPayableTotal === 0) {
            if (paymentMethodsWrapper) paymentMethodsWrapper.style.display = 'none';
            if (btnPlaceOrder) btnPlaceOrder.textContent = `PAY ₹${appliedWalletAmount} WITH WALLET`;
        } else {
            if (paymentMethodsWrapper) paymentMethodsWrapper.style.display = 'block';
            if (btnPlaceOrder) btnPlaceOrder.textContent = 'PROCEED TO PAYMENT';
        }
    };

    if (useWalletCheckbox) {
        useWalletCheckbox.addEventListener('change', () => {
            recalculateWalletAndTotal();
        });
        // Initial run in case it was pre-checked
        if (useWalletCheckbox.checked) {
            recalculateWalletAndTotal();
        }
    }

    if (btnPlaceOrder) {
        btnPlaceOrder.addEventListener('click', async () => {
            if (!selectedAddressCard) {
                KavoxNotify.toast('Please add or select a shipping address before placing your order.', 'warning');
                return;
            }

            const addressId = selectedAddressCard.dataset.id;
            const useWallet = useWalletCheckbox && useWalletCheckbox.checked;
            
            let paymentMethod = null;
            let finalPayable = baseCartTotal;
            if (useWallet) {
                finalPayable = Math.max(0, baseCartTotal - walletBalance);
            }

            if (finalPayable > 0) {
                const paymentMethodInput = document.querySelector('input[name="paymentMethod"]:checked');
                if (!paymentMethodInput) {
                    KavoxNotify.toast('Please select a payment method.', 'warning');
                    return;
                }
                paymentMethod = paymentMethodInput.value;
            } else {
                paymentMethod = 'WALLET';
            }

            try {
                // Show loading state
                btnPlaceOrder.textContent = 'PROCESSING...';
                btnPlaceOrder.disabled = true;

                if (paymentMethod === 'RAZORPAY') {
                    // Call backend to create Razorpay Order
                    const response = await fetch('/api/payment/create-order', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            addressId,
                            useWallet
                        })
                    });

                    const data = await response.json();

                    if (!data.success) {
                        KavoxNotify.toast(data.message || 'Failed to initiate online payment.', 'error');
                        btnPlaceOrder.textContent = 'PROCEED TO PAYMENT';
                        btnPlaceOrder.disabled = false;
                        return;
                    }

                    const options = {
                        key: data.razorpayKeyId,
                        amount: data.razorpayOrder.amount,
                        currency: data.razorpayOrder.currency,
                        name: "KAVOX",
                        description: "E-commerce Order Payment",
                        order_id: data.razorpayOrder.id,
                        handler: async function (paymentResponse) {
                            try {
                                btnPlaceOrder.textContent = 'VERIFYING PAYMENT...';
                                
                                const verifyRes = await fetch('/api/payment/verify-payment', {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({
                                        razorpayOrderId: paymentResponse.razorpay_order_id,
                                        razorpayPaymentId: paymentResponse.razorpay_payment_id,
                                        razorpaySignature: paymentResponse.razorpay_signature,
                                        addressId: addressId,
                                        useWallet: useWallet
                                    })
                                });

                                const verifyData = await verifyRes.json();

                                if (verifyData.success) {
                                    const modal = document.getElementById('orderSuccessModal');
                                    if (modal) {
                                        modal.style.display = 'flex';
                                        setTimeout(() => {
                                            modal.classList.add('show');
                                        }, 50);
                                    }
                                    
                                    setTimeout(() => {
                                        window.location.href = `/order-success?id=${verifyData.orderId}`;
                                    }, 2500);
                                } else {
                                    window.location.href = `/payment-failure?error=${encodeURIComponent(verifyData.message || 'Payment verification failed.')}`;
                                }
                            } catch (err) {
                                console.error('Verification error:', err);
                                window.location.href = `/payment-failure?error=${encodeURIComponent('An error occurred while verifying the payment.')}`;
                            }
                        },
                        prefill: {
                            name: data.user.name,
                            email: data.user.email,
                            contact: data.user.phone || ''
                        },
                        theme: {
                            color: "#e91e63"
                        },
                        modal: {
                            ondismiss: function () {
                                KavoxNotify.toast('Payment cancelled by user.', 'warning');
                                btnPlaceOrder.textContent = 'PROCEED TO PAYMENT';
                                btnPlaceOrder.disabled = false;
                            }
                        }
                    };

                    const rzp = new Razorpay(options);
                    rzp.on('payment.failed', function (paymentFailedResponse) {
                        window.location.href = `/payment-failure?error=${encodeURIComponent(paymentFailedResponse.error.description || 'Payment transaction failed.')}`;
                    });
                    rzp.open();
                } else {
                    const response = await fetch('/api/checkout/place-order', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            addressId,
                            paymentMethod,
                            useWallet
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
                }
            } catch (error) {
                console.error('Error placing order:', error);
                KavoxNotify.toast('An unexpected error occurred. Please try again later.', 'error');
                btnPlaceOrder.textContent = 'PROCEED TO PAYMENT';
                btnPlaceOrder.disabled = false;
            }
        });
    }

    const btnApplyCoupon = document.querySelector('.btn-apply-coupon');
    const inputCouponCode = document.getElementById('couponCode');
    const couponInputGroup = document.getElementById('couponInputGroup');
    const appliedCouponWrapper = document.getElementById('appliedCouponWrapper');
    const appliedCodeDisplay = document.getElementById('appliedCodeDisplay');
    const singleCouponAlert = document.getElementById('singleCouponAlert');
    const availableCouponsList = document.getElementById('availableCouponsList');
    
    const couponDiscountRow = document.getElementById('couponDiscountRow');
    const couponDiscountValue = document.getElementById('couponDiscountValue');
    const finalTotalValue = document.getElementById('finalTotalValue');

    const updateCalculationsUI = (discountAmount, finalTotal) => {
        if (discountAmount > 0) {
            couponDiscountRow.style.display = 'flex';
            couponDiscountValue.textContent = `-₹${discountAmount}`;
        } else {
            couponDiscountRow.style.display = 'none';
        }
        finalTotalValue.textContent = `₹${finalTotal}`;
    };

    document.querySelectorAll('.available-coupon-card').forEach(card => {
        card.addEventListener('click', () => {
            if (card.dataset.eligible !== 'true') {
                KavoxNotify.toast('Cart total does not meet this coupon minimum.', 'warning');
                return;
            }

            inputCouponCode.value = card.dataset.code || '';
            inputCouponCode.focus();
        });
    });

    if (btnApplyCoupon) {
        btnApplyCoupon.addEventListener('click', async () => {
            const code = inputCouponCode.value.trim().toUpperCase();
            if (!code) {
                KavoxNotify.toast('Please enter a coupon code.', 'warning');
                return;
            }

            try {
                const response = await fetch('/api/checkout/apply-coupon', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code })
                });

                const data = await response.json();

                if (data.success) {
                    KavoxNotify.toast(data.message, 'success');
                    
                    // Update layout
                    couponInputGroup.style.display = 'none';
                    appliedCodeDisplay.textContent = data.couponCode;
                    appliedCouponWrapper.style.display = 'flex';
                    singleCouponAlert.style.display = 'none';
                    if (availableCouponsList) availableCouponsList.style.display = 'none';

                    // Update prices
                    updateCalculationsUI(data.discountAmount, data.finalTotal);
                } else {
                    if (data.message === 'Only one coupon is allowed per order.') {
                        singleCouponAlert.style.display = 'block';
                    }
                    KavoxNotify.toast(data.message || 'Invalid coupon code.', 'error');
                }
            } catch (error) {
                console.error('Apply coupon error:', error);
                KavoxNotify.toast('Failed to apply coupon. Please try again.', 'error');
            }
        });
    }

    // Delegate remove event
    document.addEventListener('click', async (e) => {
        if (e.target && e.target.classList.contains('btn-remove-coupon')) {
            try {
                const response = await fetch('/api/checkout/remove-coupon', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });

                const data = await response.json();

                if (data.success) {
                    KavoxNotify.toast(data.message, 'success');

                    // Reset coupon section layout
                    appliedCouponWrapper.style.display = 'none';
                    singleCouponAlert.style.display = 'none';
                    inputCouponCode.value = '';
                    couponInputGroup.style.display = 'flex';
                    if (availableCouponsList) availableCouponsList.style.display = 'flex';

                    // Update prices
                    updateCalculationsUI(0, data.finalTotal);
                } else {
                    KavoxNotify.toast(data.message || 'Failed to remove coupon.', 'error');
                }
            } catch (error) {
                console.error('Remove coupon error:', error);
                KavoxNotify.toast('Failed to remove coupon. Please try again.', 'error');
            }
        }
    });
});
