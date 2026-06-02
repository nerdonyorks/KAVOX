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

});
