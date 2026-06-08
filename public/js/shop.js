/**
 * KAVOX Shop AJAX Filtering
 */

document.addEventListener('DOMContentLoaded', function() {
    const filterForm = document.getElementById('filterForm');
    const shopGridContainer = document.getElementById('shopGridContainer');

    if (!filterForm || !shopGridContainer) return;

    /**
     * Fetch and update the shop grid
     */
    async function updateShop(queryString, pushState = true) {
        // Show loading state
        shopGridContainer.style.opacity = '0.5';
        shopGridContainer.style.pointerEvents = 'none';

        try {
            const response = await fetch(`/shop?${queryString}&ajax=true`, {
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            });
            const data = await response.json();

            if (data.success) {
                shopGridContainer.innerHTML = data.html;
                
                if (pushState) {
                    const newUrl = `/shop?${queryString}`;
                    history.pushState({ queryString }, '', newUrl);
                }
                
                // Close sort menu if open
                const customSort = document.getElementById('customSort');
                if (customSort) customSort.classList.remove('active');
            }
        } catch (err) {
            console.error("Shop Update Error:", err);
            KavoxNotify.toast('Failed to apply filters. Please try again.', 'error');
        } finally {
            shopGridContainer.style.opacity = '1';
            shopGridContainer.style.pointerEvents = 'auto';
            
            // Smooth scroll to top of results
            const scrollTarget = document.querySelector('.shop-main');
            if (scrollTarget) {
                scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    }

    // Auto-poll on filter changes
    filterForm.addEventListener('change', function() {
        filterForm.dispatchEvent(new Event('submit', { cancelable: true }));
    });

    // Intercept form submission
    filterForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const formData = new FormData(filterForm);
        const params = new URLSearchParams(formData);
        
        // When applying new filters, always reset to page 1
        params.set('page', '1');
        
        updateShop(params.toString());
    });

    // Intercept pagination clicks (Event Delegation)
    document.addEventListener('click', function(e) {
        const pageLink = e.target.closest('.page-link');
        if (pageLink && !pageLink.classList.contains('disabled')) {
            e.preventDefault();
            const page = pageLink.getAttribute('data-page');
            
            // Get current form data and update only the page
            const formData = new FormData(filterForm);
            const params = new URLSearchParams(formData);
            params.set('page', page);
            
            updateShop(params.toString());
        }
    });

    // Handle Browser Back/Forward buttons
    window.addEventListener('popstate', function(e) {
        const url = new URL(window.location.href);
        const params = url.searchParams;
        updateShop(params.toString(), false);
        
        // Sync the form inputs with the URL params
        syncFormWithParams(params);
    });

    /**
     * Simple helper to sync filter form inputs when URL changes (back button)
     */
    function syncFormWithParams(params) {
        // Sort
        if (params.has('sort')) {
            document.getElementById('filterSort').value = params.get('sort');
        }
        
        // Price
        if (params.has('minPrice')) {
            document.getElementById('minPrice').value = params.get('minPrice');
            document.getElementById('minPriceRange').value = params.get('minPrice');
        }
        if (params.has('maxPrice')) {
            document.getElementById('maxPrice').value = params.get('maxPrice');
            document.getElementById('maxPriceRange').value = params.get('maxPrice');
        }
        if (typeof updateSlider === 'function') updateSlider();

        // Category & Size Radio/Checks - Handle multi-select for size
        ['category', 'size'].forEach(name => {
            // First clear all current selections of this name
            const allInputs = filterForm.querySelectorAll(`input[name="${name}"]`);
            allInputs.forEach(i => i.checked = false);

            const values = params.getAll(name);
            values.forEach(val => {
                const input = filterForm.querySelector(`input[name="${name}"][value="${val}"]`);
                if (input) input.checked = true;
            });
        });
    }

    // Expose global functions for inline EJS onclicks
    window.updateSort = function(val) {
        const sortInput = document.getElementById('filterSort');
        if (sortInput) {
            sortInput.value = val;
            filterForm.dispatchEvent(new Event('submit', { cancelable: true }));
        }
    };

    window.clearFilters = function() {
        const searchInput = filterForm.querySelector('input[name="search"]');
        const searchVal = searchInput ? searchInput.value : '';
        
        // Reset inputs manually to ensure DOM state is clear
        const allInputs = filterForm.querySelectorAll('input[type="checkbox"], input[type="radio"]');
        allInputs.forEach(input => input.checked = false);

        // Reset text/range inputs
        const rangeInputs = filterForm.querySelectorAll('input[type="range"]');
        rangeInputs.forEach(input => {
            if (input.id.includes('min')) input.value = 0;
            if (input.id.includes('max')) input.value = 5000;
        });

        const numInputs = filterForm.querySelectorAll('input[type="number"]');
        numInputs.forEach(input => {
            if (input.id==='minPrice') input.value = 0;
            if (input.id==='maxPrice') input.value = 5000;
        });

        if (typeof updateSlider === 'function') updateSlider();

        // Redirect or soft clear? Let's do a soft clear.
        const baseQuery = searchVal ? `search=${encodeURIComponent(searchVal)}&page=1` : 'page=1';
        
        // Final reset for any other fields
        filterForm.reset();
        if (searchInput) searchInput.value = searchVal;
        
        updateShop(baseQuery);
    };

    window.toggleSortMenu = function() {
        const sortMenu = document.getElementById('customSort');
        if (sortMenu) sortMenu.classList.toggle('active');
    };

    window.updateShop = updateShop;
});
