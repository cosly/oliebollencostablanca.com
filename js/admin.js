/**
 * Oliebollen Costa Blanca - Admin Panel
 * Mobile-first, offline-capable
 */

const API_BASE = '/api';
const SESSION_KEY = 'admin_session_token';

// Google Review URL - vervang PLACE_ID met je Google Business Place ID
// Vind je Place ID via: https://developers.google.com/maps/documentation/places/web-service/place-id
const GOOGLE_REVIEW_URL = 'https://www.google.com/search?sca_esv=e0a4ad7df939e9f7&sxsrf=AE3TifM-rJd32nGqmBnpQWhAMotiVnfsWQ:1764302185750&si=AMgyJEtREmoPL4P1I5IDCfuA8gybfVI2d5Uj7QMwYCZHKDZ-EylOjFpgKjqGV3kPwQrcKnAPFNUr4Wd00dAj-b_2y6Ynt3Bom6JTJcBemtGypCm5rAFfAC7urhBSI2D5TzSm8gpcc2YOd7DfQwviTKujZRpsEUJ4GA%3D%3D&q=Oliebollen+Costa+Blanca+Reviews';

// State
let currentOrder = null;
let orders = [];
let timeslots = [];
let html5QrCode = null;
let scannerRunning = false;
let authToken = null;

// Product info
const PRODUCT_NAMES = {
    oliebol_krenten: 'Oliebollen met krenten',
    oliebol_naturel: 'Oliebollen zonder krenten',
    appelbeignet: 'Appelbeignets'
};

// HTML escape helper to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =====================
// Authentication
// =====================
let pendingToken = null; // Temporary token during login flow

function getAuthHeaders() {
    return authToken ? { 'Authorization': `Bearer ${authToken}` } : {};
}

async function checkAuth() {
    authToken = localStorage.getItem(SESSION_KEY);

    if (!authToken) {
        showLoginStep1();
        return false;
    }

    // Verify token with server
    try {
        const response = await fetch(`${API_BASE}/auth/verify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders()
            }
        });

        if (response.ok) {
            const data = await response.json();
            if (data.valid) {
                showAdmin();
                return true;
            }
        }
    } catch (e) {
        // If offline and token exists, allow access
        if (!navigator.onLine && authToken) {
            showAdmin();
            return true;
        }
    }

    // Token invalid or expired
    localStorage.removeItem(SESSION_KEY);
    authToken = null;
    showLoginStep1();
    return false;
}

function showLoginStep1() {
    document.getElementById('loginOverlay').style.display = 'flex';
    document.getElementById('adminContent').style.display = 'none';
    document.getElementById('requestCodeForm').style.display = 'block';
    document.getElementById('tokenForm').style.display = 'none';
}

function showLoginStep2() {
    document.getElementById('requestCodeForm').style.display = 'none';
    document.getElementById('tokenForm').style.display = 'block';
    document.getElementById('loginToken').value = '';
    document.getElementById('loginToken').focus();
}

function showAdmin() {
    document.getElementById('loginOverlay').style.display = 'none';
    document.getElementById('adminContent').style.display = 'block';
}

// Step 1: Request login code (button click)
async function handleRequestCode() {
    const errorEl = document.getElementById('requestError');
    const btn = document.getElementById('requestCodeBtn');

    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Verzenden...';

    try {
        const response = await fetch(`${API_BASE}/auth/request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });

        const data = await response.json();

        console.log('Request code response:', { ok: response.ok, status: response.status, data });

        if (response.ok && data.pendingToken) {
            pendingToken = data.pendingToken;
            console.log('Pending token saved:', pendingToken);
            showLoginStep2();
        } else {
            console.error('Request failed:', data);
            errorEl.textContent = data.message || 'Kon geen code versturen';
            errorEl.style.display = 'block';
        }
    } catch (error) {
        console.error('Request error:', error);
        errorEl.textContent = 'Verbindingsfout. Probeer opnieuw.';
        errorEl.style.display = 'block';
    }

    btn.disabled = false;
    btn.textContent = 'Stuur login code';
}

// Step 2: Verify the code
async function handleTokenSubmit(e) {
    e.preventDefault();

    const code = document.getElementById('loginToken').value.trim();
    const errorEl = document.getElementById('tokenError');
    const submitBtn = e.target.querySelector('button[type="submit"]');

    errorEl.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Controleren...';

    try {
        const response = await fetch(`${API_BASE}/auth/verify-code`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pendingToken, code })
        });

        const data = await response.json();

        // Debug logging
        console.log('Verify response:', { ok: response.ok, status: response.status, data });

        if (response.ok && data.sessionToken) {
            authToken = data.sessionToken;
            localStorage.setItem(SESSION_KEY, data.sessionToken);
            pendingToken = null;
            showAdmin();
            initAdminPanel();
        } else {
            console.error('Login failed:', data);
            errorEl.textContent = data.error || 'Onjuiste code';
            errorEl.style.display = 'block';
        }
    } catch (error) {
        console.error('Login error:', error);
        errorEl.textContent = 'Verbindingsfout. Probeer opnieuw.';
        errorEl.style.display = 'block';
    }

    submitBtn.disabled = false;
    submitBtn.textContent = 'Inloggen';
}

function handleBackToRequest() {
    pendingToken = null;
    showLoginStep1();
}

function handleLogout() {
    localStorage.removeItem(SESSION_KEY);
    authToken = null;
    pendingToken = null;
    document.getElementById('loginToken').value = '';
    showLoginStep1();
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Setup login handlers
    document.getElementById('requestCodeBtn').addEventListener('click', handleRequestCode);
    document.getElementById('tokenForm').addEventListener('submit', handleTokenSubmit);
    document.getElementById('backToRequest').addEventListener('click', handleBackToRequest);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);

    // Check authentication
    const isAuthed = await checkAuth();

    if (isAuthed) {
        initAdminPanel();
    }
});

function initAdminPanel() {
    initTabs();
    initScanner();
    initCalculator();
    initCapacity();
    loadOrders();
    loadTimeslots();
    checkConnection();
}

// =====================
// Tab Navigation
// =====================
function initTabs() {
    document.querySelectorAll('.admin-nav button').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;

            // Update buttons
            document.querySelectorAll('.admin-nav button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update tabs
            document.querySelectorAll('.admin-tab').forEach(tab => tab.classList.remove('active'));
            document.getElementById('tab-' + tabId).classList.add('active');

            // Stop scanner when leaving scanner tab
            if (tabId !== 'scanner' && scannerRunning) {
                stopScanner();
            }

            // Load data when entering tabs
            if (tabId === 'orders') {
                loadOrders();
            } else if (tabId === 'totals') {
                updateTotals();
            } else if (tabId === 'capacity') {
                loadConfig();
                loadGeneratedTimeslots();
                loadCapacity();
            }
        });
    });
}

// =====================
// QR Scanner
// =====================
function initScanner() {
    document.getElementById('startScanBtn').addEventListener('click', startScanner);
    document.getElementById('cancelScanBtn').addEventListener('click', cancelScan);
    document.getElementById('completeOrderBtn').addEventListener('click', completeOrder);
    document.getElementById('lookupBtn').addEventListener('click', manualLookup);

    // Autocomplete setup
    const searchInput = document.getElementById('manualOrderNumber');
    const resultsContainer = document.getElementById('autocompleteResults');

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        if (query.length >= 2) {
            showAutocompleteResults(query);
        } else {
            hideAutocompleteResults();
        }
    });

    // Keyboard navigation for autocomplete
    searchInput.addEventListener('keydown', (e) => {
        const items = resultsContainer.querySelectorAll('.autocomplete-item');
        const activeItem = resultsContainer.querySelector('.autocomplete-item.active');
        let currentIndex = Array.from(items).indexOf(activeItem);

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (currentIndex < items.length - 1) {
                items[currentIndex]?.classList.remove('active');
                items[currentIndex + 1]?.classList.add('active');
                items[currentIndex + 1]?.scrollIntoView({ block: 'nearest' });
            } else if (currentIndex === -1 && items.length > 0) {
                items[0].classList.add('active');
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (currentIndex > 0) {
                items[currentIndex]?.classList.remove('active');
                items[currentIndex - 1]?.classList.add('active');
                items[currentIndex - 1]?.scrollIntoView({ block: 'nearest' });
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (activeItem) {
                selectAutocompleteItem(activeItem.dataset.orderNumber);
            } else {
                manualLookup();
            }
        } else if (e.key === 'Escape') {
            hideAutocompleteResults();
        }
    });

    // Close autocomplete when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.autocomplete-container')) {
            hideAutocompleteResults();
        }
    });
}

async function startScanner() {
    const scannerDiv = document.getElementById('qr-reader');
    document.getElementById('startScanBtn').style.display = 'none';

    try {
        html5QrCode = new Html5Qrcode('qr-reader');

        await html5QrCode.start(
            { facingMode: 'environment' },
            {
                fps: 10,
                qrbox: { width: 250, height: 250 }
            },
            onScanSuccess,
            onScanFailure
        );

        scannerRunning = true;
    } catch (err) {
        console.error('Scanner error:', err);
        alert('Kon camera niet starten. Controleer permissies.');
        document.getElementById('startScanBtn').style.display = 'block';
    }
}

function stopScanner() {
    if (html5QrCode && scannerRunning) {
        html5QrCode.stop().then(() => {
            scannerRunning = false;
            document.getElementById('startScanBtn').style.display = 'block';
        }).catch(err => console.error('Stop error:', err));
    }
}

function onScanSuccess(decodedText, decodedResult) {
    // Vibrate on successful scan
    if (navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
    }

    // Stop scanner
    stopScanner();

    // Look up order
    lookupOrder(decodedText);
}

function onScanFailure(error) {
    // Ignore - continuous scanning
}

async function lookupOrder(orderNumber) {
    try {
        // Try API first
        const response = await fetch(`${API_BASE}/orders/${orderNumber}`, {
            headers: getAuthHeaders()
        });
        if (response.ok) {
            const order = await response.json();
            displayScannedOrder(order);
            return;
        }
    } catch (e) {
        console.log('API niet beschikbaar, zoek lokaal');
    }

    // Fallback: search local orders
    const localOrder = orders.find(o =>
        o.orderNumber === orderNumber ||
        o.customer?.naam?.toLowerCase().includes(orderNumber.toLowerCase())
    );

    if (localOrder) {
        displayScannedOrder(localOrder);
    } else {
        alert('Bestelling niet gevonden: ' + orderNumber);
    }
}

function displayScannedOrder(order) {
    currentOrder = order;

    document.getElementById('scanOrderNumber').textContent = order.orderNumber;
    document.getElementById('scanCustomer').textContent = order.customer.naam;
    document.getElementById('scanTimeslot').textContent = order.timeslotLabel || order.timeslot;

    // Check timeslot status
    const timeslotStatus = getTimeslotStatus(order);
    const statusEl = document.getElementById('scanTimeslotStatus');
    const iconEl = statusEl.querySelector('.timeslot-status-icon');
    const textEl = statusEl.querySelector('.timeslot-status-text');

    iconEl.textContent = timeslotStatus.icon;
    textEl.textContent = timeslotStatus.message;
    statusEl.className = `timeslot-status ${timeslotStatus.status} ${timeslotStatus.severity || ''}`;
    statusEl.style.display = 'flex';

    // Build items list
    let itemsHtml = '';
    for (const [product, qty] of Object.entries(order.products)) {
        if (qty > 0) {
            itemsHtml += `${qty}x ${PRODUCT_NAMES[product]}<br>`;
        }
    }
    document.getElementById('scanItems').innerHTML = itemsHtml;

    // Total
    const total = order.total || calculateOrderTotal(order);
    document.getElementById('scanTotal').textContent = formatPrice(total);
    document.getElementById('calcTotal').textContent = formatPrice(total);

    // Status
    const orderStatusEl = document.getElementById('scanOrderStatus');
    orderStatusEl.textContent = getStatusLabel(order.status || 'pending');
    orderStatusEl.className = 'order-status ' + (order.status || 'pending');

    // Reset calculator
    document.getElementById('calcReceived').value = '';
    document.getElementById('calcChange').textContent = '€ 0,00';
    document.getElementById('calcChange').classList.remove('negative');

    // Show order display
    document.getElementById('scannedOrder').style.display = 'block';

    // Scroll to order
    document.getElementById('scannedOrder').scrollIntoView({ behavior: 'smooth' });
}

function cancelScan() {
    currentOrder = null;
    document.getElementById('scannedOrder').style.display = 'none';
    document.getElementById('startScanBtn').style.display = 'block';
}

async function completeOrder() {
    if (!currentOrder) return;

    try {
        // Try API
        await fetch(`${API_BASE}/orders/${currentOrder.orderNumber}/complete`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
    } catch (e) {
        console.log('API niet beschikbaar, markeer lokaal');
    }

    // Update local state
    currentOrder.status = 'completed';
    updateLocalOrder(currentOrder);

    // Feedback
    if (navigator.vibrate) {
        navigator.vibrate(200);
    }

    // Show review modal instead of alert
    showReviewModal(currentOrder);

    cancelScan();
    loadOrders();
}

function showReviewModal(order) {
    const modal = document.getElementById('reviewModal');
    const customerName = order.customer?.naam || 'Klant';
    const firstName = customerName.split(' ')[0];

    // Show customer name
    document.getElementById('reviewCustomer').textContent = customerName;

    // Create WhatsApp message with review link
    const phone = (order.customer?.telefoon || '').replace(/[^0-9+]/g, '');
    const reviewMessage = encodeURIComponent(
        `Hoi ${firstName}!\n\n` +
        `Bedankt voor je bestelling bij Oliebollen Costa Blanca!\n\n` +
        `We hopen dat je hebt genoten van onze oliebollen. ` +
        `Zou je ons willen helpen door een Google review te plaatsen?\n\n` +
        `${GOOGLE_REVIEW_URL}\n\n` +
        `Alvast bedankt en een gelukkig nieuwjaar!`
    );

    const whatsappLink = document.getElementById('reviewWhatsappLink');
    if (phone) {
        whatsappLink.href = `https://wa.me/${phone}?text=${reviewMessage}`;
        whatsappLink.style.display = 'flex';
    } else {
        whatsappLink.style.display = 'none';
    }

    // Close button handler
    document.getElementById('closeReviewModal').onclick = () => {
        modal.style.display = 'none';
    };

    // Show modal
    modal.style.display = 'flex';
}

function manualLookup() {
    const query = document.getElementById('manualOrderNumber').value.trim();
    if (query) {
        hideAutocompleteResults();
        lookupOrder(query);
    }
}

// =====================
// Autocomplete
// =====================
function showAutocompleteResults(query) {
    const resultsContainer = document.getElementById('autocompleteResults');
    const queryLower = query.toLowerCase();

    // Filter orders by order number or customer name
    const matchingOrders = orders.filter(order => {
        const orderNumber = (order.orderNumber || '').toLowerCase();
        const customerName = (order.customer?.naam || '').toLowerCase();
        return orderNumber.includes(queryLower) || customerName.includes(queryLower);
    }).slice(0, 8); // Limit to 8 results

    if (matchingOrders.length === 0) {
        resultsContainer.innerHTML = '<div class="autocomplete-no-results">Geen resultaten gevonden</div>';
        resultsContainer.classList.add('show');
        return;
    }

    resultsContainer.innerHTML = matchingOrders.map(order => {
        const statusClass = order.status || 'pending';
        const statusLabel = getStatusLabel(order.status);
        const total = order.total || calculateOrderTotal(order);

        return `
            <div class="autocomplete-item" data-order-number="${escapeHtml(order.orderNumber)}">
                <div class="autocomplete-item-main">
                    <span class="autocomplete-order-number">${highlightMatch(escapeHtml(order.orderNumber), query)}</span>
                    <span class="autocomplete-customer">${highlightMatch(escapeHtml(order.customer?.naam || ''), query)}</span>
                </div>
                <div class="autocomplete-item-details">
                    <span class="autocomplete-timeslot">${escapeHtml(formatTimeslotLabel(order.timeslot, order.timeslotLabel))}</span>
                    <span class="autocomplete-total">${formatPrice(total)}</span>
                    <span class="autocomplete-status ${statusClass}">${statusLabel}</span>
                </div>
            </div>
        `;
    }).join('');

    // Add click handlers to items
    resultsContainer.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('click', () => {
            selectAutocompleteItem(item.dataset.orderNumber);
        });
    });

    resultsContainer.classList.add('show');
}

function hideAutocompleteResults() {
    const resultsContainer = document.getElementById('autocompleteResults');
    resultsContainer.classList.remove('show');
    resultsContainer.innerHTML = '';
}

function selectAutocompleteItem(orderNumber) {
    document.getElementById('manualOrderNumber').value = orderNumber;
    hideAutocompleteResults();
    lookupOrder(orderNumber);
}

function highlightMatch(text, query) {
    if (!text || !query) return text;
    const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
    return text.replace(regex, '<strong>$1</strong>');
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// =====================
// Calculator
// =====================
function initCalculator() {
    const receivedInput = document.getElementById('calcReceived');

    receivedInput.addEventListener('input', updateChange);

    // Quick amount buttons
    document.querySelectorAll('.quick-amount-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            receivedInput.value = btn.dataset.amount;
            updateChange();
        });
    });
}

function updateChange() {
    if (!currentOrder) return;

    const total = currentOrder.total || calculateOrderTotal(currentOrder);
    const received = parseFloat(document.getElementById('calcReceived').value) || 0;
    const change = received - total;

    const changeEl = document.getElementById('calcChange');
    changeEl.textContent = formatPrice(Math.abs(change));

    if (change < 0) {
        changeEl.classList.add('negative');
        changeEl.textContent = '- ' + changeEl.textContent;
    } else {
        changeEl.classList.remove('negative');
    }
}

// =====================
// Orders List
// =====================
async function loadOrders() {
    try {
        const response = await fetch(`${API_BASE}/orders`, {
            headers: getAuthHeaders()
        });
        if (response.ok) {
            orders = await response.json();
        } else if (response.status === 401) {
            handleLogout();
            return;
        }
    } catch (e) {
        console.log('API niet beschikbaar, laad demo data');
        orders = getDemoOrders();
    }

    renderOrders();
    updateOrderCounts();
    renderTimeslotOverview();
    populateTimeslotFilter();
}

function getDemoOrders() {
    return [
        {
            orderNumber: 'OB-ABC123',
            customer: { naam: 'Jan de Vries', telefoon: '+31612345678', email: 'jan@email.com' },
            products: { oliebol_krenten: 6, oliebol_naturel: 6, appelbeignet: 4 },
            timeslot: 'slot_1000',
            timeslotLabel: '10:00 - 10:30',
            total: 16.40,
            status: 'pending',
            createdAt: new Date().toISOString()
        },
        {
            orderNumber: 'OB-DEF456',
            customer: { naam: 'Maria Garcia', telefoon: '+34612345678', email: 'maria@email.com' },
            products: { oliebol_krenten: 12, appelbeignet: 6 },
            timeslot: 'slot_1030',
            timeslotLabel: '10:30 - 11:00',
            total: 18.60,
            status: 'pending',
            createdAt: new Date().toISOString()
        },
        {
            orderNumber: 'OB-GHI789',
            customer: { naam: 'Pieter Bakker', telefoon: '+31698765432', email: 'pieter@email.com' },
            products: { oliebol_naturel: 24 },
            timeslot: 'slot_1100',
            timeslotLabel: '11:00 - 11:30',
            total: 24.00,
            status: 'completed',
            createdAt: new Date().toISOString()
        }
    ];
}

function renderOrders() {
    const container = document.getElementById('ordersList');
    const statusFilter = document.getElementById('statusFilter').value;
    const timeslotFilter = document.getElementById('timeslotFilter').value;

    let filteredOrders = orders;

    if (statusFilter) {
        filteredOrders = filteredOrders.filter(o => o.status === statusFilter);
    }

    if (timeslotFilter) {
        filteredOrders = filteredOrders.filter(o => o.timeslot === timeslotFilter);
    }

    if (filteredOrders.length === 0) {
        container.innerHTML = '<p class="no-orders">Geen bestellingen gevonden</p>';
        return;
    }

    container.innerHTML = filteredOrders.map(order => `
        <div class="order-card" data-order="${escapeHtml(order.orderNumber)}">
            <div class="order-card-header">
                <span class="order-number">${escapeHtml(order.orderNumber)}</span>
                <span class="order-status ${order.status || 'pending'}">${getStatusLabel(order.status)}</span>
            </div>
            <div class="order-card-body">
                <div class="order-customer">${escapeHtml(order.customer.naam)}</div>
                <div class="order-timeslot">${escapeHtml(formatTimeslotLabel(order.timeslot, order.timeslotLabel))}</div>
                <div class="order-items">${escapeHtml(formatOrderItems(order.products))}</div>
                <div class="order-total">${formatPrice(order.total || calculateOrderTotal(order))}</div>
                <div class="order-actions">
                    ${order.status !== 'completed' ? `
                        <button class="btn btn-success btn-complete" data-order="${escapeHtml(order.orderNumber)}">Afhandelen</button>
                        <button class="btn btn-danger btn-noshow" data-order="${escapeHtml(order.orderNumber)}">No-show</button>
                    ` : `
                        <span class="completed-label">Opgehaald</span>
                    `}
                </div>
            </div>
        </div>
    `).join('');

    // Add event listeners
    container.querySelectorAll('.btn-complete').forEach(btn => {
        btn.addEventListener('click', () => quickComplete(btn.dataset.order));
    });

    container.querySelectorAll('.btn-noshow').forEach(btn => {
        btn.addEventListener('click', () => showNoshowModal(btn.dataset.order));
    });
}

function formatOrderItems(products) {
    return Object.entries(products)
        .filter(([_, qty]) => qty > 0)
        .map(([product, qty]) => `${qty}x ${PRODUCT_NAMES[product]}`)
        .join(', ');
}

function getStatusLabel(status) {
    const labels = {
        pending: 'Wachtend',
        completed: 'Opgehaald',
        noshow: 'No-show'
    };
    return labels[status] || 'Wachtend';
}

function updateOrderCounts() {
    document.getElementById('pendingCount').textContent =
        orders.filter(o => !o.status || o.status === 'pending').length;
    document.getElementById('completedCount').textContent =
        orders.filter(o => o.status === 'completed').length;
    document.getElementById('noshowCount').textContent =
        orders.filter(o => o.status === 'noshow').length;
}

function renderTimeslotOverview() {
    const container = document.getElementById('timeslotOverview');

    // Group orders by timeslot
    const timeslotGroups = {};
    orders.forEach(order => {
        const slot = order.timeslot;
        if (!timeslotGroups[slot]) {
            timeslotGroups[slot] = {
                orders: [],
                krenten: 0,
                naturel: 0,
                appelbeignet: 0
            };
        }
        timeslotGroups[slot].orders.push(order);
        timeslotGroups[slot].krenten += order.products.oliebol_krenten || 0;
        timeslotGroups[slot].naturel += order.products.oliebol_naturel || 0;
        timeslotGroups[slot].appelbeignet += order.products.appelbeignet || 0;
    });

    // Sort timeslots chronologically
    const sortedSlots = Object.keys(timeslotGroups).sort();

    if (sortedSlots.length === 0) {
        container.innerHTML = '<p class="no-orders">Nog geen bestellingen</p>';
        return;
    }

    // Render each timeslot card
    container.innerHTML = sortedSlots.map(slot => {
        const data = timeslotGroups[slot];
        const orderCount = data.orders.length;
        const totalItems = data.krenten + data.naturel + data.appelbeignet;

        // Calculate capacity percentage (assuming 50 per hour for oliebollen, 30 for appelbeignets)
        // This is a simplified calculation - you might want to fetch actual capacity from API
        const maxCapacity = 50; // per hour per product type
        const capacityUsed = Math.max(data.krenten, data.naturel, data.appelbeignet);
        const capacityPercentage = Math.min(100, (capacityUsed / maxCapacity) * 100);

        // Determine card status
        let cardClass = '';
        let barClass = '';
        if (capacityPercentage >= 90) {
            cardClass = 'full';
            barClass = 'danger';
        } else if (capacityPercentage >= 70) {
            cardClass = 'near-full';
            barClass = 'warning';
        }

        const orderLabel = orders.find(o => o.timeslot === slot);
        const timeLabel = formatTimeslotLabel(slot, orderLabel?.timeslotLabel);

        return `
            <div class="timeslot-overview-card ${cardClass}" data-timeslot="${escapeHtml(slot)}" style="cursor: pointer;">
                <div class="timeslot-overview-header">
                    <span class="timeslot-time">${escapeHtml(timeLabel)}</span>
                    <span class="timeslot-order-count">${orderCount} ${orderCount === 1 ? 'bestelling' : 'bestellingen'}</span>
                </div>
                <div class="timeslot-products">
                    ${data.krenten > 0 ? `
                        <div class="product-row">
                            <span class="product-name-small">🔴 Met krenten</span>
                            <span class="product-count-small">${data.krenten}</span>
                        </div>
                    ` : ''}
                    ${data.naturel > 0 ? `
                        <div class="product-row">
                            <span class="product-name-small">🟠 Naturel</span>
                            <span class="product-count-small">${data.naturel}</span>
                        </div>
                    ` : ''}
                    ${data.appelbeignet > 0 ? `
                        <div class="product-row">
                            <span class="product-name-small">🟢 Appelbeignets</span>
                            <span class="product-count-small">${data.appelbeignet}</span>
                        </div>
                    ` : ''}
                </div>
                <div class="timeslot-capacity-bar">
                    <div class="capacity-bar-label">
                        <span>Capaciteit</span>
                        <span>${Math.round(capacityPercentage)}%</span>
                    </div>
                    <div class="capacity-bar">
                        <div class="capacity-bar-fill ${barClass}" style="width: ${capacityPercentage}%"></div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Add click handlers to filter by timeslot
    container.querySelectorAll('.timeslot-overview-card').forEach(card => {
        card.addEventListener('click', () => {
            const timeslot = card.dataset.timeslot;
            const timeslotFilter = document.getElementById('timeslotFilter');
            timeslotFilter.value = timeslot;
            renderOrders();

            // Scroll to orders list
            document.getElementById('ordersList').scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
}

// Helper function to convert slot_HHMM to readable label
function formatTimeslotLabel(timeslotId, timeslotLabel) {
    // If we already have a clean label (not starting with slot_), use it
    if (timeslotLabel && !timeslotLabel.startsWith('slot_')) {
        return timeslotLabel;
    }

    // Otherwise convert slot_HHMM format to HH:MM - HH:MM
    if (timeslotId && timeslotId.startsWith('slot_')) {
        const time = timeslotId.replace('slot_', '');
        const hour = time.substring(0, 2);
        const minute = time.substring(2, 4);
        const startTime = `${hour}:${minute}`;

        // Calculate end time (15 minutes later)
        let endHour = parseInt(hour);
        let endMinute = parseInt(minute) + 15;
        if (endMinute >= 60) {
            endHour++;
            endMinute -= 60;
        }
        const endTime = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;

        return `${startTime} - ${endTime}`;
    }

    return timeslotId || 'Onbekend tijdslot';
}

function populateTimeslotFilter() {
    const select = document.getElementById('timeslotFilter');
    const existingSlots = [...new Set(orders.map(o => o.timeslot))];

    select.innerHTML = '<option value="">Alle tijdsloten</option>';
    existingSlots.sort().forEach(slot => {
        const order = orders.find(o => o.timeslot === slot);
        const label = formatTimeslotLabel(slot, order?.timeslotLabel);
        select.innerHTML += `<option value="${slot}">${label}</option>`;
    });

    select.addEventListener('change', renderOrders);
    document.getElementById('statusFilter').addEventListener('change', renderOrders);
}

async function quickComplete(orderNumber) {
    const order = orders.find(o => o.orderNumber === orderNumber);
    if (order) {
        order.status = 'completed';
        updateLocalOrder(order);
        renderOrders();
        updateOrderCounts();

        // Try API
        try {
            await fetch(`${API_BASE}/orders/${orderNumber}/complete`, {
                method: 'POST',
                headers: getAuthHeaders()
            });
        } catch (e) {}
    }
}

// =====================
// No-show Modal
// =====================
function showNoshowModal(orderNumber) {
    const order = orders.find(o => o.orderNumber === orderNumber);
    if (!order) return;

    document.getElementById('noshowCustomer').textContent =
        `${order.customer.naam} - ${order.timeslotLabel}`;

    // WhatsApp link
    const phone = order.customer.telefoon.replace(/[^0-9+]/g, '');
    const message = encodeURIComponent(
        `Hoi ${order.customer.naam.split(' ')[0]}! Je oliebollen bestelling (${order.orderNumber}) staat nog op je te wachten. Laat even weten wanneer je langs komt!`
    );
    document.getElementById('whatsappLink').href = `https://wa.me/${phone}?text=${message}`;

    document.getElementById('noshowModal').style.display = 'flex';
    document.getElementById('noshowModal').dataset.orderNumber = orderNumber;

    document.getElementById('confirmNoshow').onclick = confirmNoshow;
    document.getElementById('cancelNoshow').onclick = () => {
        document.getElementById('noshowModal').style.display = 'none';
    };
}

async function confirmNoshow() {
    const orderNumber = document.getElementById('noshowModal').dataset.orderNumber;
    const order = orders.find(o => o.orderNumber === orderNumber);

    if (order) {
        order.status = 'noshow';
        updateLocalOrder(order);
        renderOrders();
        updateOrderCounts();

        try {
            await fetch(`${API_BASE}/orders/${orderNumber}/noshow`, {
                method: 'POST',
                headers: getAuthHeaders()
            });
        } catch (e) {}
    }

    document.getElementById('noshowModal').style.display = 'none';
}

// =====================
// Capacity Management
// =====================
async function loadTimeslots() {
    try {
        const response = await fetch(`${API_BASE}/timeslots`, {
            headers: getAuthHeaders()
        });
        if (response.ok) {
            timeslots = await response.json();
        } else if (response.status === 401) {
            handleLogout();
            return;
        }
    } catch (e) {
        timeslots = generateDefaultTimeslots();
    }

    renderCapacityList();
}

function generateDefaultTimeslots() {
    const slots = [];
    for (let hour = 10; hour < 18; hour++) {
        for (let min = 0; min < 60; min += 30) {
            const time = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
            const endMin = (min + 30) % 60;
            const endHr = min + 30 >= 60 ? hour + 1 : hour;
            const endTime = `${endHr.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`;

            slots.push({
                id: `slot_${time.replace(':', '')}`,
                start: time,
                end: endTime,
                label: `${time} - ${endTime}`,
                capacity: 150,  // 150 stuks per half uur
                booked: 0
            });
        }
    }
    return slots;
}

function calculateBookedItems(slotId) {
    return orders
        .filter(o => o.timeslot === slotId)
        .reduce((sum, o) => {
            return sum + Object.values(o.products).reduce((a, b) => a + (b || 0), 0);
        }, 0);
}

function renderCapacityList() {
    const container = document.getElementById('capacityList');

    // Get first slot to read global capacity
    const firstSlot = timeslots[0];
    const products = firstSlot?.products || {};
    const krenten = products['oliebol_krenten'] || { capacity: 0, booked: 0, available: 0 };
    const naturel = products['oliebol_naturel'] || { capacity: 0, booked: 0, available: 0 };
    const appel = products['appelbeignet'] || { capacity: 0, booked: 0, available: 0 };

    // Calculate total booked across all timeslots
    const totalKrenten = orders.reduce((sum, o) => sum + (o.products.oliebol_krenten || 0), 0);
    const totalNaturel = orders.reduce((sum, o) => sum + (o.products.oliebol_naturel || 0), 0);
    const totalAppel = orders.reduce((sum, o) => sum + (o.products.appelbeignet || 0), 0);

    // Render global capacity inputs (eenmalig bovenaan)
    const globalInputs = `
        <div class="global-capacity">
            <h3>Capaciteit per uur (geldt voor alle tijden)</h3>
            <div class="capacity-inputs">
                <div class="capacity-input-row">
                    <span class="product-label" style="color: #ff6b6b">⬤ Krenten</span>
                    <input type="number" class="global-capacity-input" value="${krenten.capacity}"
                           min="0" max="500" data-product="oliebol_krenten">
                    <span class="capacity-unit">stuks/uur → ${Math.round(krenten.capacity / 2)}/half uur</span>
                </div>
                <div class="capacity-input-row">
                    <span class="product-label" style="color: #4ecdc4">⬤ Naturel</span>
                    <input type="number" class="global-capacity-input" value="${naturel.capacity}"
                           min="0" max="500" data-product="oliebol_naturel">
                    <span class="capacity-unit">stuks/uur → ${Math.round(naturel.capacity / 2)}/half uur</span>
                </div>
                <div class="capacity-input-row">
                    <span class="product-label" style="color: #ffe66d">⬤ Appel</span>
                    <input type="number" class="global-capacity-input" value="${appel.capacity}"
                           min="0" max="500" data-product="appelbeignet">
                    <span class="capacity-unit">stuks/uur → ${Math.round(appel.capacity / 2)}/half uur</span>
                </div>
            </div>
            <button class="btn btn-primary" id="saveCapacityBtn" style="width: 100%; margin-top: 16px;">
                Opslaan
            </button>
            <div class="total-stats">
                Totaal geboekt vandaag: <span style="color: #ff6b6b">${totalKrenten} krenten</span>,
                <span style="color: #4ecdc4">${totalNaturel} naturel</span>,
                <span style="color: #ffe66d">${totalAppel} appel</span>
            </div>
        </div>
        <h3 style="margin-bottom: 16px; color: var(--secondary);">Bezetting per tijdslot</h3>
    `;

    // Render bars per tijdslot (gewoon alle tijdsloten achter elkaar)
    const timeslotBars = timeslots.map(slot => {
        // Calculate booked per product for THIS specific timeslot
        const slotOrders = orders.filter(o => o.timeslot === slot.id);
        const slotKrenten = slotOrders.reduce((sum, o) => sum + (o.products.oliebol_krenten || 0), 0);
        const slotNaturel = slotOrders.reduce((sum, o) => sum + (o.products.oliebol_naturel || 0), 0);
        const slotAppel = slotOrders.reduce((sum, o) => sum + (o.products.appelbeignet || 0), 0);

        // Half-hour capacity = hour capacity / 2
        const halfHourKrenten = krenten.capacity / 2;
        const halfHourNaturel = naturel.capacity / 2;
        const halfHourAppel = appel.capacity / 2;

        // Percentages based on HALF-HOUR capacity
        const krentenPct = halfHourKrenten > 0 ? (slotKrenten / halfHourKrenten) * 100 : 0;
        const naturelPct = halfHourNaturel > 0 ? (slotNaturel / halfHourNaturel) * 100 : 0;
        const appelPct = halfHourAppel > 0 ? (slotAppel / halfHourAppel) * 100 : 0;

        const orderCount = slotOrders.length;

        return `
            <div class="timeslot-bars">
                <div class="timeslot-header">
                    <div class="timeslot-time">${slot.label}</div>
                    <div class="timeslot-orders">${orderCount} ${orderCount === 1 ? 'bestelling' : 'bestellingen'}</div>
                </div>
                <div class="product-bars">
                    <div class="product-bar-row">
                        <div class="capacity-bar">
                            <div class="capacity-fill" style="width: ${Math.min(krentenPct, 100)}%; background-color: #ff6b6b"></div>
                        </div>
                        <span class="bar-label">${slotKrenten}/${Math.round(halfHourKrenten)}</span>
                    </div>
                    <div class="product-bar-row">
                        <div class="capacity-bar">
                            <div class="capacity-fill" style="width: ${Math.min(naturelPct, 100)}%; background-color: #4ecdc4"></div>
                        </div>
                        <span class="bar-label">${slotNaturel}/${Math.round(halfHourNaturel)}</span>
                    </div>
                    <div class="product-bar-row">
                        <div class="capacity-bar">
                            <div class="capacity-fill" style="width: ${Math.min(appelPct, 100)}%; background-color: #ffe66d"></div>
                        </div>
                        <span class="bar-label">${slotAppel}/${Math.round(halfHourAppel)}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = globalInputs + '<div class="timeslots-list">' + timeslotBars + '</div>';

    // Save capacity handler
    document.getElementById('saveCapacityBtn')?.addEventListener('click', saveGlobalCapacity);
}

async function saveGlobalCapacity() {
    const updates = [];

    // Get all unique hour blocks from timeslots
    const hourBlocks = [...new Set(timeslots.map(slot => slot.hourBlock))];

    // For each product, update capacity for ALL hour blocks
    document.querySelectorAll('.global-capacity-input').forEach(input => {
        const productId = input.dataset.product;
        const capacity = parseInt(input.value) || 0;

        // Apply this capacity to every hour block
        hourBlocks.forEach(hourBlock => {
            updates.push({ hourBlock, productId, capacity });
        });
    });

    try {
        await fetch(`${API_BASE}/product-capacity`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders()
            },
            body: JSON.stringify(updates)
        });

        alert('Capaciteit opgeslagen!');
        // Reload timeslots to get updated data
        await loadTimeslots();
        renderCapacityList();
    } catch (e) {
        console.error('Fout bij opslaan capaciteit:', e);
        alert('Er is een fout opgetreden bij het opslaan');
    }
}

function initCapacity() {
    // Clear old localStorage data (oude structuur zonder hourBlock)
    localStorage.removeItem('timeslots');
    // Data wordt nu altijd from API geladen
}

// =====================
// Totals & Statistics
// =====================
function updateTotals() {
    // Overall stats
    document.getElementById('totalOrders').textContent = orders.length;

    const totalRevenue = orders.reduce((sum, o) => sum + (o.total || calculateOrderTotal(o)), 0);
    document.getElementById('totalRevenue').textContent = formatPrice(totalRevenue);

    const totalItems = orders.reduce((sum, o) => {
        return sum + Object.values(o.products).reduce((a, b) => a + b, 0);
    }, 0);
    document.getElementById('totalItems').textContent = totalItems;

    const avgOrder = orders.length > 0 ? totalRevenue / orders.length : 0;
    document.getElementById('avgOrderValue').textContent = formatPrice(avgOrder);

    // Per product totals
    let krenten = 0, naturel = 0, appel = 0;
    orders.forEach(o => {
        krenten += o.products.oliebol_krenten || 0;
        naturel += o.products.oliebol_naturel || 0;
        appel += o.products.appelbeignet || 0;
    });

    document.getElementById('totalKrenten').textContent = `${krenten} stuks`;
    document.getElementById('totalNaturel').textContent = `${naturel} stuks`;
    document.getElementById('totalAppel').textContent = `${appel} stuks`;

    // Per timeslot breakdown
    renderTimeslotTotals();
}

function renderTimeslotTotals() {
    const container = document.getElementById('timeslotTotals');
    const byTimeslot = {};

    // Helper function to convert timeslot ID to readable label
    function getTimeslotLabel(timeslotId, timeslotLabel) {
        // If we already have a label, use it
        if (timeslotLabel && !timeslotLabel.startsWith('slot_')) {
            return timeslotLabel;
        }

        // Otherwise convert slot_HHMM format to HH:MM - HH:MM
        if (timeslotId && timeslotId.startsWith('slot_')) {
            const time = timeslotId.replace('slot_', '');
            const hour = time.substring(0, 2);
            const minute = time.substring(2, 4);
            const startTime = `${hour}:${minute}`;

            // Calculate end time (15 minutes later)
            let endHour = parseInt(hour);
            let endMinute = parseInt(minute) + 15;
            if (endMinute >= 60) {
                endHour++;
                endMinute -= 60;
            }
            const endTime = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;

            return `${startTime} - ${endTime}`;
        }

        return timeslotId || 'Onbekend tijdslot';
    }

    orders.forEach(order => {
        const slot = getTimeslotLabel(order.timeslot, order.timeslotLabel);
        if (!byTimeslot[slot]) {
            byTimeslot[slot] = {
                orders: 0,
                products: { oliebol_krenten: 0, oliebol_naturel: 0, appelbeignet: 0 }
            };
        }
        byTimeslot[slot].orders++;
        for (const [product, qty] of Object.entries(order.products)) {
            byTimeslot[slot].products[product] = (byTimeslot[slot].products[product] || 0) + qty;
        }
    });

    container.innerHTML = Object.entries(byTimeslot).map(([slot, data]) => `
        <div class="timeslot-total-card">
            <div class="timeslot-total-header">
                <strong>${slot}</strong>
                <span>${data.orders} bestellingen</span>
            </div>
            <div class="timeslot-total-products">
                ${data.products.oliebol_krenten > 0 ? `<span>${data.products.oliebol_krenten}x krenten</span>` : ''}
                ${data.products.oliebol_naturel > 0 ? `<span>${data.products.oliebol_naturel}x naturel</span>` : ''}
                ${data.products.appelbeignet > 0 ? `<span>${data.products.appelbeignet}x appel</span>` : ''}
            </div>
        </div>
    `).join('');
}

// Export functions
document.getElementById('exportCsv')?.addEventListener('click', exportToCsv);
document.getElementById('printList')?.addEventListener('click', () => window.print());

function exportToCsv() {
    let csv = 'Bestelnummer,Naam,Telefoon,Tijdslot,Krenten,Naturel,Appelbeignet,Totaal,Status\n';

    orders.forEach(o => {
        csv += `${o.orderNumber},${o.customer.naam},${o.customer.telefoon},${o.timeslotLabel || o.timeslot},`;
        csv += `${o.products.oliebol_krenten || 0},${o.products.oliebol_naturel || 0},${o.products.appelbeignet || 0},`;
        csv += `${o.total || calculateOrderTotal(o)},${o.status || 'pending'}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `oliebollen_bestellingen_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
}

// =====================
// Timeslot Validation
// =====================
function getTimeslotStatus(order) {
    // Parse the timeslot times from label (e.g., "10:00 - 10:30")
    const timeslotLabel = order.timeslotLabel || order.timeslot;
    const timeMatch = timeslotLabel.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);

    if (!timeMatch) {
        // Try to get from timeslots array
        const slot = timeslots.find(s => s.id === order.timeslot);
        if (slot && slot.start && slot.end) {
            return checkTimeAgainstSlot(slot.start, slot.end);
        }
        return { status: 'unknown', message: 'Tijdslot niet te bepalen' };
    }

    const startTime = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
    const endTime = `${timeMatch[3].padStart(2, '0')}:${timeMatch[4]}`;

    return checkTimeAgainstSlot(startTime, endTime);
}

function checkTimeAgainstSlot(startTime, endTime) {
    const now = new Date();
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentTimeMinutes = currentHours * 60 + currentMinutes;

    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    const startTimeMinutes = startHour * 60 + startMin;
    const endTimeMinutes = endHour * 60 + endMin;

    // Calculate difference in minutes
    const minutesUntilStart = startTimeMinutes - currentTimeMinutes;
    const minutesUntilEnd = endTimeMinutes - currentTimeMinutes;

    // Define thresholds
    const EARLY_THRESHOLD = 15; // More than 15 min early is "te vroeg"
    const LATE_THRESHOLD = 15;  // More than 15 min late is "te laat"

    if (minutesUntilStart > EARLY_THRESHOLD) {
        // Customer is early
        const hoursEarly = Math.floor(minutesUntilStart / 60);
        const minsEarly = minutesUntilStart % 60;
        let timeText;
        if (hoursEarly > 0) {
            timeText = `${hoursEarly} uur${minsEarly > 0 ? ` en ${minsEarly} min` : ''}`;
        } else {
            timeText = `${minsEarly} minuten`;
        }
        return {
            status: 'early',
            message: `Te vroeg! Nog ${timeText} tot tijdslot`,
            icon: '',
            severity: minutesUntilStart > 60 ? 'severe' : 'warning'
        };
    } else if (minutesUntilEnd < -LATE_THRESHOLD) {
        // Customer is late (after their timeslot ended)
        const minutesLate = Math.abs(minutesUntilEnd);
        const hoursLate = Math.floor(minutesLate / 60);
        const minsLate = minutesLate % 60;
        let timeText;
        if (hoursLate > 0) {
            timeText = `${hoursLate} uur${minsLate > 0 ? ` en ${minsLate} min` : ''}`;
        } else {
            timeText = `${minsLate} minuten`;
        }
        return {
            status: 'late',
            message: `Te laat! Tijdslot is ${timeText} geleden geëindigd`,
            icon: '',
            severity: minutesLate > 60 ? 'severe' : 'warning'
        };
    } else if (minutesUntilStart > 0 && minutesUntilStart <= EARLY_THRESHOLD) {
        // Almost time (within 15 min before)
        return {
            status: 'almost',
            message: `Bijna tijd! Nog ${minutesUntilStart} minuten`,
            icon: '',
            severity: 'info'
        };
    } else if (minutesUntilEnd < 0 && minutesUntilEnd >= -LATE_THRESHOLD) {
        // Just ended (within 15 min after)
        return {
            status: 'justended',
            message: `Net afgelopen (${Math.abs(minutesUntilEnd)} min geleden)`,
            icon: '',
            severity: 'info'
        };
    } else {
        // On time (during the timeslot)
        return {
            status: 'ontime',
            message: 'Op tijd!',
            icon: '',
            severity: 'success'
        };
    }
}

// =====================
// Utility Functions
// =====================
function formatPrice(amount) {
    return '€ ' + amount.toFixed(2).replace('.', ',');
}

function calculateOrderTotal(order) {
    const PRICES = {
        oliebol_krenten: 1.00,
        oliebol_naturel: 1.00,
        appelbeignet: 1.10
    };

    let total = 0;
    for (const [product, qty] of Object.entries(order.products)) {
        total += qty * (PRICES[product] || 0);
    }
    return total;
}

function updateLocalOrder(order) {
    const index = orders.findIndex(o => o.orderNumber === order.orderNumber);
    if (index >= 0) {
        orders[index] = order;
    }
    // Save to localStorage for offline support
    localStorage.setItem('orders', JSON.stringify(orders));
}

function checkConnection() {
    const statusEl = document.getElementById('connectionStatus');

    function updateStatus() {
        if (navigator.onLine) {
            statusEl.style.color = '#27ae60';
            statusEl.title = 'Online';
        } else {
            statusEl.style.color = '#e74c3c';
            statusEl.title = 'Offline';
        }
    }

    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
    updateStatus();
}

// =====================
// CSV Import
// =====================
document.getElementById('importCsv')?.addEventListener('click', () => {
    document.getElementById('csvFileInput').click();
});

document.getElementById('csvFileInput')?.addEventListener('change', handleCsvImport);

document.getElementById('closeImportModal')?.addEventListener('click', () => {
    document.getElementById('importModal').style.display = 'none';
    // Reload orders after import
    loadOrders();
    updateTotals();
});

async function handleCsvImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Reset file input
    event.target.value = '';

    // Show modal with progress
    const modal = document.getElementById('importModal');
    const progressDiv = document.getElementById('importProgress');
    const resultsContainer = document.getElementById('importResultsContainer');
    const resultsDiv = document.getElementById('importResults');
    const summaryDiv = document.getElementById('importSummary');

    modal.style.display = 'flex';
    progressDiv.style.display = 'block';
    resultsContainer.style.display = 'none';

    try {
        const text = await file.text();
        const rows = parseCSV(text);

        if (rows.length === 0) {
            throw new Error('Geen data gevonden in CSV bestand');
        }

        // Process rows
        const results = [];
        let successCount = 0;
        let errorCount = 0;

        for (const row of rows) {
            try {
                const result = await importOrder(row);
                results.push({ success: true, message: `${row.naam}: ${result.orderNumber}` });
                successCount++;
            } catch (error) {
                results.push({ success: false, message: `${row.naam || 'Onbekend'}: ${error.message}` });
                errorCount++;
            }
        }

        // Show results
        progressDiv.style.display = 'none';
        resultsContainer.style.display = 'block';

        resultsDiv.innerHTML = results.map(r =>
            `<div class="import-result-item ${r.success ? 'success' : 'error'}">${escapeHtml(r.message)}</div>`
        ).join('');

        summaryDiv.textContent = `${successCount} geïmporteerd, ${errorCount} mislukt`;

    } catch (error) {
        progressDiv.style.display = 'none';
        resultsContainer.style.display = 'block';
        resultsDiv.innerHTML = `<div class="import-result-item error">${escapeHtml(error.message)}</div>`;
        summaryDiv.textContent = 'Import mislukt';
    }
}

function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 2) return [];

    // Parse header
    const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());

    // Map column names
    const columnMap = {
        naam: ['naam', 'name', 'klant', 'customer'],
        email: ['email', 'e-mail', 'mail'],
        telefoon: ['telefoon', 'tel', 'phone', 'telefoonnummer'],
        timeslot: ['tijdslot', 'timeslot', 'tijd', 'time'],
        krenten: ['krenten', 'oliebol_krenten', 'met krenten'],
        naturel: ['naturel', 'oliebol_naturel', 'zonder krenten'],
        appelbeignet: ['appelbeignet', 'appelbeignets', 'appel']
    };

    const indices = {};
    for (const [key, variants] of Object.entries(columnMap)) {
        indices[key] = headers.findIndex(h => variants.some(v => h.includes(v)));
    }

    // Parse data rows
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length === 0) continue;

        const row = {
            naam: values[indices.naam] || '',
            email: values[indices.email] || '',
            telefoon: values[indices.telefoon] || '',
            timeslot: values[indices.timeslot] || '',
            krenten: parseInt(values[indices.krenten]) || 0,
            naturel: parseInt(values[indices.naturel]) || 0,
            appelbeignet: parseInt(values[indices.appelbeignet]) || 0
        };

        // Skip rows without name or products
        if (row.naam && (row.krenten > 0 || row.naturel > 0 || row.appelbeignet > 0)) {
            rows.push(row);
        }
    }

    return rows;
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if ((char === ',' || char === ';') && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }

    result.push(current.trim());
    return result;
}

function parseTimeslot(timeslotStr) {
    if (!timeslotStr) return null;

    // Try to parse time format like "10:00", "10:00 - 10:30", "slot_1000"
    const timeMatch = timeslotStr.match(/(\d{1,2}):?(\d{2})?/);
    if (!timeMatch) return null;

    const hour = parseInt(timeMatch[1]);
    const minute = parseInt(timeMatch[2]) || 0;

    // Round to nearest 30 min slot
    const roundedMinute = minute < 30 ? '00' : '30';
    const slotId = `slot_${hour.toString().padStart(2, '0')}${roundedMinute}`;

    // Find the slot
    const slot = timeslots.find(s => s.id === slotId);
    if (slot) {
        return { id: slot.id, label: slot.label };
    }

    // Fallback: create label
    const endHour = roundedMinute === '30' ? hour + 1 : hour;
    const endMinute = roundedMinute === '30' ? '00' : '30';
    return {
        id: slotId,
        label: `${hour.toString().padStart(2, '0')}:${roundedMinute} - ${endHour.toString().padStart(2, '0')}:${endMinute}`
    };
}

async function importOrder(row) {
    // Parse timeslot
    const timeslot = parseTimeslot(row.timeslot);
    if (!timeslot) {
        throw new Error('Ongeldig tijdslot');
    }

    const orderData = {
        customer: {
            naam: row.naam,
            email: row.email || `${row.naam.toLowerCase().replace(/\s+/g, '.')}@import.local`,
            telefoon: row.telefoon || ''
        },
        products: {
            oliebol_krenten: row.krenten,
            oliebol_naturel: row.naturel,
            appelbeignet: row.appelbeignet
        },
        timeslot: timeslot.id,
        timeslotLabel: timeslot.label
    };

    // Try API first
    try {
        const response = await fetch(`${API_BASE}/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || error.error || 'API fout');
        }

        return await response.json();
    } catch (error) {
        // If API fails, create locally
        if (error.message.includes('fetch')) {
            const orderNumber = 'OB-' + Math.random().toString(36).substring(2, 8).toUpperCase();
            const localOrder = {
                orderNumber,
                ...orderData,
                total: calculateOrderTotal(orderData),
                status: 'pending',
                createdAt: new Date().toISOString()
            };

            orders.push(localOrder);
            localStorage.setItem('orders', JSON.stringify(orders));

            return { orderNumber };
        }
        throw error;
    }
}

// =====================
// Service Worker
// =====================
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('SW registered'))
        .catch(err => console.log('SW failed', err));
}

// =====================
// Configuration Management
// =====================
async function loadConfig() {
    try {
        const response = await fetch(`${API_BASE}/config`, {
            headers: getAuthHeaders()
        });

        if (response.ok) {
            const config = await response.json();

            // Fill form fields
            if (config.day_start_time) {
                document.getElementById('dayStartTime').value = config.day_start_time.value;
            }
            if (config.day_end_time) {
                document.getElementById('dayEndTime').value = config.day_end_time.value;
            }
            if (config.slot_duration_minutes) {
                document.getElementById('slotDuration').value = config.slot_duration_minutes.value;
            }
            if (config.default_capacity_krenten) {
                document.getElementById('capKrenten').value = config.default_capacity_krenten.value;
            }
            if (config.default_capacity_naturel) {
                document.getElementById('capNaturel').value = config.default_capacity_naturel.value;
            }
            if (config.default_capacity_appelbeignet) {
                document.getElementById('capAppelbeignet').value = config.default_capacity_appelbeignet.value;
            }
        }
    } catch (error) {
        console.error('Failed to load config:', error);
    }
}

async function saveConfig() {
    const configData = {
        day_start_time: document.getElementById('dayStartTime').value,
        day_end_time: document.getElementById('dayEndTime').value,
        slot_duration_minutes: document.getElementById('slotDuration').value,
        default_capacity_krenten: document.getElementById('capKrenten').value,
        default_capacity_naturel: document.getElementById('capNaturel').value,
        default_capacity_appelbeignet: document.getElementById('capAppelbeignet').value
    };

    try {
        const response = await fetch(`${API_BASE}/config`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders()
            },
            body: JSON.stringify(configData)
        });

        if (response.ok) {
            showNotification('Configuratie opgeslagen!', 'success');
        } else {
            const errorData = await response.json();
            console.error('Save config failed:', errorData);
            throw new Error(errorData.error || 'Failed to save config');
        }
    } catch (error) {
        console.error('Save config error:', error);
        showNotification('Fout bij opslaan configuratie', 'error');
    }
}

function generateTimeslots() {
    // Show confirmation modal
    const modal = document.getElementById('generateTimeslotsModal');
    modal.style.display = 'flex';
}

async function doGenerateTimeslots() {
    // Hide modal
    const modal = document.getElementById('generateTimeslotsModal');
    modal.style.display = 'none';

    // First save config
    await saveConfig();

    try {
        const response = await fetch(`${API_BASE}/generate-timeslots`, {
            method: 'POST',
            headers: getAuthHeaders()
        });

        if (response.ok) {
            const result = await response.json();
            showNotification(`${result.message} (${result.hourBlocks} uren)`, 'success');

            // Reload timeslots and capacity
            await loadGeneratedTimeslots();
            await loadCapacity();
        } else {
            const error = await response.json();
            throw new Error(error.details || 'Generation failed');
        }
    } catch (error) {
        console.error('Generate error:', error);
        showNotification('Fout bij genereren tijdsloten: ' + error.message, 'error');
    }
}

async function loadGeneratedTimeslots() {
    const container = document.getElementById('timeslotsList');
    if (!container) {
        console.error('Timeslots container not found');
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/timeslots`, {
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            console.error('Failed to load timeslots:', response.status);
            container.innerHTML = '<p class="loading">Fout bij laden tijdsloten.</p>';
            return;
        }

        const data = await response.json();
        const timeslots = data.timeslots || [];

        if (timeslots.length === 0) {
            container.innerHTML = '<p class="loading">Geen tijdsloten gegenereerd. Gebruik de knop hierboven om tijdsloten te maken.</p>';
            return;
        }

        // Group by hour block
        const grouped = {};
        timeslots.forEach(slot => {
            if (!grouped[slot.hourBlock]) {
                grouped[slot.hourBlock] = [];
            }
            grouped[slot.hourBlock].push(slot);
        });

        let html = '';
        for (const [hourBlock, slots] of Object.entries(grouped)) {
            html += `<div class="hour-block">
                <div class="hour-block-header">${hourBlock}</div>
                <div class="slots-row">`;

            slots.forEach(slot => {
                html += `<div class="slot-item">${slot.label}</div>`;
            });

            html += `</div></div>`;
        }

        container.innerHTML = html;
    } catch (error) {
        console.error('Failed to load timeslots:', error);
        container.innerHTML = '<p class="loading">Fout bij laden tijdsloten.</p>';
    }
}

function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = 'admin-notification notification-' + type;
    notification.textContent = message;
    notification.style.cssText = 'position: fixed; top: 20px; right: 20px; padding: 16px 24px; background: ' +
        (type === 'success' ? '#27ae60' : type === 'error' ? '#e74c3c' : '#3498db') +
        '; color: white; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 10000;';

    document.body.appendChild(notification);

    setTimeout(function() {
        notification.remove();
    }, 3000);
}

// Initialize config management
function initConfigManagement() {
    const saveBtn = document.getElementById('saveConfigBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveConfig);
    }

    const generateBtn = document.getElementById('generateTimeslotsBtn');
    if (generateBtn) {
        generateBtn.addEventListener('click', generateTimeslots);
    }

    // Modal handlers
    const confirmGenerateBtn = document.getElementById('confirmGenerateTimeslots');
    if (confirmGenerateBtn) {
        confirmGenerateBtn.addEventListener('click', doGenerateTimeslots);
    }

    const cancelGenerateBtn = document.getElementById('cancelGenerateTimeslots');
    if (cancelGenerateBtn) {
        cancelGenerateBtn.addEventListener('click', () => {
            document.getElementById('generateTimeslotsModal').style.display = 'none';
        });
    }

    // Close modal on overlay click
    const generateModal = document.getElementById('generateTimeslotsModal');
    if (generateModal) {
        generateModal.addEventListener('click', (e) => {
            if (e.target === generateModal) {
                generateModal.style.display = 'none';
            }
        });
    }
}

// Call init when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initConfigManagement);
} else {
    initConfigManagement();
}
