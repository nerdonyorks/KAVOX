document.addEventListener('DOMContentLoaded', () => {

    const showNotify = (message, type) => {
        if (typeof KavoxNotify !== 'undefined') {
            KavoxNotify.toast(message, type);
        } else {
            console.log(type, message);
        }
    };

    // Cancel Entire Order
    const cancelOrderBtn = document.getElementById('cancelOrderBtn');
    if (cancelOrderBtn) {
        cancelOrderBtn.addEventListener('click', async function() {
            const orderId = this.dataset.orderId;
            const { value: reason, isConfirmed } = await KavoxNotify.prompt({
                title: 'Cancel Order',
                inputLabel: 'Reason for cancellation (optional)',
                inputPlaceholder: 'Type your reason here...',
                confirmButtonText: 'Confirm Cancellation',
                confirmButtonColor: '#dc3545'
            });

            if (isConfirmed) {
                try {
                    const response = await fetch(`/api/order/${orderId}/cancel`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        },
                        body: JSON.stringify({ reason })
                    });
                    const data = await response.json();

                    if (data.success) {
                        showNotify(data.message, 'success');
                        setTimeout(() => window.location.reload(), 1500);
                    } else {
                        showNotify(data.message || 'Failed to cancel order', 'error');
                    }
                } catch (err) {
                    showNotify('An error occurred', 'error');
                }
            }
        });
    }

    // Return Entire Order
    const returnOrderBtn = document.getElementById('returnOrderBtn');
    if (returnOrderBtn) {
        returnOrderBtn.addEventListener('click', async function() {
            const orderId = this.dataset.orderId;
            const { value: reason, isConfirmed } = await KavoxNotify.prompt({
                title: 'Return Order',
                inputLabel: 'Reason for return (mandatory)',
                inputPlaceholder: 'Why are you returning this order?',
                confirmButtonText: 'Request Return',
                confirmButtonColor: '#f39c12',
                inputValidator: (value) => {
                    if (!value) {
                        return 'You need to write something!'
                    }
                }
            });

            if (isConfirmed && reason) {
                try {
                    const response = await fetch(`/api/order/${orderId}/return`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        },
                        body: JSON.stringify({ reason })
                    });
                    const data = await response.json();

                    if (data.success) {
                        showNotify(data.message, 'success');
                        setTimeout(() => window.location.reload(), 1500);
                    } else {
                        showNotify(data.message || 'Failed to request return', 'error');
                    }
                } catch (err) {
                    showNotify('An error occurred', 'error');
                }
            }
        });
    }

    // Cancel Specific Item
    const cancelItemBtns = document.querySelectorAll('.cancel-item-btn');
    cancelItemBtns.forEach(btn => {
        btn.addEventListener('click', async function() {
            const orderId = this.dataset.orderId;
            const itemId = this.dataset.itemId;

            const { value: reason, isConfirmed } = await KavoxNotify.prompt({
                title: 'Cancel Item',
                inputLabel: 'Reason for cancellation (optional)',
                inputPlaceholder: 'Type your reason here...',
                confirmButtonText: 'Confirm Cancellation',
                confirmButtonColor: '#dc3545'
            });

            if (isConfirmed) {
                try {
                    const response = await fetch(`/api/order/${orderId}/item/${itemId}/cancel`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        },
                        body: JSON.stringify({ reason })
                    });
                    const data = await response.json();

                    if (data.success) {
                        showNotify(data.message, 'success');
                        setTimeout(() => window.location.reload(), 1500);
                    } else {
                        showNotify(data.message || 'Failed to cancel item', 'error');
                    }
                } catch (err) {
                    showNotify('An error occurred', 'error');
                }
            }
        });
    });

    // Return Specific Item
    const returnItemBtns = document.querySelectorAll('.return-item-btn');
    returnItemBtns.forEach(btn => {
        btn.addEventListener('click', async function() {
            const orderId = this.dataset.orderId;
            const itemId = this.dataset.itemId;

            const { value: reason, isConfirmed } = await KavoxNotify.prompt({
                title: 'Return Item',
                inputLabel: 'Reason for return (mandatory)',
                inputPlaceholder: 'Why are you returning this item?',
                confirmButtonText: 'Request Return',
                confirmButtonColor: '#f39c12',
                inputValidator: (value) => {
                    if (!value) {
                        return 'You need to write something!'
                    }
                }
            });

            if (isConfirmed && reason) {
                try {
                    const response = await fetch(`/api/order/${orderId}/return`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        },
                        body: JSON.stringify({ reason, itemId })
                    });
                    const data = await response.json();

                    if (data.success) {
                        showNotify(data.message, 'success');
                        setTimeout(() => window.location.reload(), 1500);
                    } else {
                        showNotify(data.message || 'Failed to request return', 'error');
                    }
                } catch (err) {
                    showNotify('An error occurred', 'error');
                }
            }
        });
    });

    // Retry Payment
    const retryPaymentBtn = document.getElementById('retryPaymentBtn');
    if (retryPaymentBtn) {
        retryPaymentBtn.addEventListener('click', async function() {
            const orderId = this.dataset.orderId;
            try {
                retryPaymentBtn.textContent = 'INITIATING PAY...';
                retryPaymentBtn.disabled = true;

                const response = await fetch('/api/payment/retry-order', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ orderId })
                });

                const data = await response.json();

                if (!data.success) {
                    showNotify(data.message || 'Failed to initiate payment retry.', 'error');
                    retryPaymentBtn.textContent = 'RETRY PAYMENT';
                    retryPaymentBtn.disabled = false;
                    return;
                }

                const options = {
                    key: data.razorpayKeyId,
                    amount: data.razorpayOrder.amount,
                    currency: data.razorpayOrder.currency,
                    name: "KAVOX",
                    description: "E-commerce Order Payment Retry",
                    order_id: data.razorpayOrder.id,
                    handler: async function (paymentResponse) {
                        try {
                            retryPaymentBtn.textContent = 'VERIFYING...';
                            
                            const verifyRes = await fetch('/api/payment/verify-payment', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    razorpayOrderId: paymentResponse.razorpay_order_id,
                                    razorpayPaymentId: paymentResponse.razorpay_payment_id,
                                    razorpaySignature: paymentResponse.razorpay_signature
                                })
                            });

                            const verifyData = await verifyRes.json();

                            if (verifyData.success) {
                                showNotify('Payment successful! Redirecting...', 'success');
                                setTimeout(() => {
                                    window.location.href = `/order-success?id=${verifyData.orderId}`;
                                }, 1500);
                            } else {
                                window.location.href = `/payment-failure?error=${encodeURIComponent(verifyData.message || 'Payment verification failed.')}&orderId=${orderId}`;
                            }
                        } catch (err) {
                            console.error('Verification error:', err);
                            window.location.href = `/payment-failure?error=${encodeURIComponent('An error occurred while verifying the payment.')}&orderId=${orderId}`;
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
                            showNotify('Payment cancelled by user.', 'warning');
                            retryPaymentBtn.textContent = 'RETRY PAYMENT';
                            retryPaymentBtn.disabled = false;
                        }
                    }
                };

                const rzp = new Razorpay(options);
                rzp.on('payment.failed', function (paymentFailedResponse) {
                    window.location.href = `/payment-failure?error=${encodeURIComponent(paymentFailedResponse.error.description || 'Payment transaction failed.')}&orderId=${orderId}`;
                });
                rzp.open();
            } catch (error) {
                console.error('Error retrying order:', error);
                showNotify('An unexpected error occurred. Please try again.', 'error');
                retryPaymentBtn.textContent = 'RETRY PAYMENT';
                retryPaymentBtn.disabled = false;
            }
        });
    }

});
