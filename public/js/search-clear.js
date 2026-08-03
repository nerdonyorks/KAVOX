/**
 * Kavox Universal Clear Search Bootstrap Script
 */

(function () {
  function init() {
    const searchInputs = document.querySelectorAll(
      'input[id*="search" i], input[class*="search" i], input[name="search" i], input[placeholder*="search" i]'
    );

    searchInputs.forEach(input => {
      // Avoid double initialization
      if (input.getAttribute('data-search-clear-initialized')) return;
      input.setAttribute('data-search-clear-initialized', 'true');

      // Determine the container
      let container = input.parentElement;
      const isSpecialWrapper = container.classList.contains('search-input-wrapper') ||
                               container.classList.contains('search-box') ||
                               container.classList.contains('orders-search-box');

      // If the parent is not a simple wrapper or contains other elements (like search button), wrap it
      if (!isSpecialWrapper || (container.classList.contains('orders-search-box') && container.querySelector('.search-btn'))) {
        const wrapper = document.createElement('div');
        wrapper.className = 'kavox-search-wrapper';
        
        // Copy layout properties from input to wrapper
        const computedStyle = window.getComputedStyle(input);
        wrapper.style.display = computedStyle.display === 'block' ? 'block' : 'inline-flex';
        wrapper.style.flexGrow = computedStyle.flexGrow;
        wrapper.style.flexShrink = computedStyle.flexShrink;
        wrapper.style.flexBasis = computedStyle.flexBasis;
        wrapper.style.width = computedStyle.width;
        wrapper.style.margin = computedStyle.margin;
        wrapper.style.float = computedStyle.float;
        
        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(input);
        
        input.style.width = '100%';
        input.style.margin = '0';
        
        container = wrapper;
      } else {
        // Ensure container has relative positioning
        if (window.getComputedStyle(container).position === 'static') {
          container.style.position = 'relative';
        }
      }

      // Add padding right on the input to make space for 'X' button
      const computedInputStyle = window.getComputedStyle(input);
      const pr = parseFloat(computedInputStyle.paddingRight) || 0;
      input.style.paddingRight = Math.max(pr, 36) + 'px';

      // Create Clear Button
      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'kavox-clear-search-btn';
      clearBtn.setAttribute('aria-label', 'Clear search');
      clearBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      `;

      container.appendChild(clearBtn);

      // Function to toggle visibility of clear button
      function toggleClearButton() {
        const searchIcon = container.querySelector(':scope > svg:not(.kavox-clear-search-btn svg)');
        if (input.value.length > 0) {
          clearBtn.style.display = 'flex';
          if (searchIcon) {
            searchIcon.style.display = 'none';
          }
        } else {
          clearBtn.style.display = 'none';
          if (searchIcon) {
            searchIcon.style.display = '';
          }
        }
      }

      // Initial check
      toggleClearButton();

      // Listen to input
      input.addEventListener('input', toggleClearButton);

      // Handle Escape Key
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          clearSearch(input, clearBtn);
        }
      });

      // Handle Click on Clear Button
      clearBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        clearSearch(input, clearBtn);
        input.focus();
      });
    });
  }

  function clearSearch(input, clearBtn) {
    input.value = '';
    clearBtn.style.display = 'none';
    
    // Dispatch standard input/change events to update UI/debounces
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    // 1. If we are on user Shop page and executeSearch/updateShop is defined
    if (window.location.pathname.startsWith('/shop')) {
      const filterForm = document.getElementById('filterForm');
      if (filterForm) {
        const hiddenSearch = filterForm.querySelector('input[name="search"]');
        if (hiddenSearch) hiddenSearch.value = '';
      }
      if (typeof window.executeSearch === 'function') {
        window.executeSearch(input);
        return;
      }
    }

    // 2. If input is inside a Form, submit the form (e.g. Wallets page, coupons page, etc.)
    const form = input.closest('form');
    if (form) {
      // Ensure page/pagination parameter goes back to 1
      const pageInput = form.querySelector('input[name="page"]');
      if (pageInput) pageInput.value = '1';
      
      let action = form.getAttribute('action') || window.location.pathname;
      if (action.includes('page=')) {
        action = action.replace(/page=\d+/, 'page=1');
        form.setAttribute('action', action);
      }
      form.submit();
      return;
    }

    // 3. If the URL contains page parameters (for server-reloading lists like category-offers, reviews, etc.)
    const url = new URL(window.location.href);
    if (url.searchParams.has('search')) {
      url.searchParams.delete('search');
      url.searchParams.set('page', '1'); // reset page to 1
      window.location.href = url.pathname + url.search;
      return;
    }

    // 4. For pages that do direct AJAX without URL params (e.g. Products dashboard)
    // Dispatching input event above is already enough for their searchTimeout listeners
  }

  // Run on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Re-run when new elements might be added (e.g., dynamically inserted inputs)
  const observer = new MutationObserver(init);
  observer.observe(document.body, { childList: true, subtree: true });
})();
