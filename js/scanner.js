/**
 * Oliebollen Costa Blanca - Dedicated Scanner
 * Standalone scanner without admin navigation
 */

const API_BASE = '/api';
const SESSION_KEY = 'admin_session_token';

const GOOGLE_REVIEW_URL = 'https://www.google.com/search?sca_esv=e0a4ad7df939e9f7&sxsrf=AE3TifM-rJd32nGqmBnpQWhAMotiVnfsWQ:1764302185750&si=AMgyJEtREmoPL4P1I5IDCfuA8gybfVI2d5Uj7QMwYCZHKDZ-EylOjFpgKjqGV3kPwQrcKnAPFNUr4Wd00dAj-b_2y6Ynt3Bom6JTJcBemtGypCm5rAFfAC7urhBSI2D5TzSm8gpcc2YOd7DfQwviTKujZRpsEUJ4GA%3D%3D&q=Oliebollen+Costa+Blanca+Reviews';

// State
let currentOrder = null;
let orders = [];
let timeslots = [];
let html5QrCode = null;
let scannerRunning = false;
let authToken = null;
let pendingToken = null;

// Product info
const PRODUCT_NAMES = {
    oliebol_krenten: 'Oliebollen met rozijnen',
    oliebol_naturel: 'Oliebollen zonder rozijnen',
    appelbeignet: 'Appelbeignets'
};

// HTML escape helper
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =====================
// Authentication
// =====================
function getAuthHeaders() {
    return authToken ? { 'Authorization': `Bearer ${authToken}` } : {};
}

async function checkAuth() {
    authToken = localStorage.getItem(SESSION_KEY);

    if (!authToken) {
        showLoginStep1();
        return false;
    }

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
                showScanner();
                return true;
            }
        }
    } catch (e) {
        if (!navigator.onLine && authToken) {
            showScanner();
            return true;
        }
    }

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

function showScanner() {
    document.getElementById('loginOverlay').style.display = 'none';
    document.getElementById('adminContent').style.display = 'block';
}

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

        if (response.ok && data.pendingToken) {
            pendingToken = data.pendingToken;
            showLoginStep2();
        } else {
            errorEl.textContent = data.message || 'Kon geen code versturen';
            errorEl.style.display = 'block';
        }
    } catch (error) {
        errorEl.textContent = 'Verbindingsfout. Probeer opnieuw.';
        errorEl.style.display = 'block';
    }

    btn.disabled = false;
    btn.textContent = 'Stuur login code';
}

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

        if (response.ok && data.sessionToken) {
            authToken = data.sessionToken;
            localStorage.setItem(SESSION_KEY, data.sessionToken);
            pendingToken = null;
            showScanner();
            initScannerApp();
        } else {
            errorEl.textContent = data.error || 'Onjuiste code';
            errorEl.style.display = 'block';
        }
    } catch (error) {
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

// =====================
// Initialize
// =====================
async function initScannerApp() {
    initScanner();
    initCalculator();
    await loadOrders();
    await loadTimeslots();
}

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
        console.log('API niet beschikbaar');
        orders = [];
    }
}

async function loadTimeslots() {
    try {
        const response = await fetch(`${API_BASE}/timeslots`, {
            headers: getAuthHeaders()
        });
        if (response.ok) {
            const data = await response.json();
            timeslots = data.timeslots || data || [];
        }
    } catch (e) {
        console.log('Kon timeslots niet laden');
        timeslots = [];
    }
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

    // Keyboard navigation
    searchInput.addEventListener('keydown', (e) => {
        const items = resultsContainer.querySelectorAll('.autocomplete-item');
        const activeItem = resultsContainer.querySelector('.autocomplete-item.active');
        let currentIndex = Array.from(items).indexOf(activeItem);

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (currentIndex < items.length - 1) {
                items[currentIndex]?.classList.remove('active');
                items[currentIndex + 1]?.classList.add('active');
            } else if (currentIndex === -1 && items.length > 0) {
                items[0].classList.add('active');
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (currentIndex > 0) {
                items[currentIndex]?.classList.remove('active');
                items[currentIndex - 1]?.classList.add('active');
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
    document.getElementById('startScanBtn').style.display = 'none';
    document.getElementById('scannerReadyMsg').style.display = 'none';

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

function onScanSuccess(decodedText) {
    if (navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
    }
    stopScanner();
    lookupOrder(decodedText);
}

function onScanFailure(error) {
    // Ignore - continuous scanning
}

async function lookupOrder(orderNumber) {
    try {
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
    document.getElementById('scannedOrder').scrollIntoView({ behavior: 'smooth' });
}

function cancelScan() {
    currentOrder = null;
    document.getElementById('scannedOrder').style.display = 'none';
    document.getElementById('startScanBtn').style.display = 'block';
    document.getElementById('scannerReadyMsg').style.display = 'block';
}

async function completeOrder() {
    if (!currentOrder) return;

    try {
        await fetch(`${API_BASE}/orders/${currentOrder.orderNumber}/complete`, {
            method: 'POST',
            headers: getAuthHeaders()
        });
    } catch (e) {
        console.log('API niet beschikbaar');
    }

    currentOrder.status = 'completed';
    updateLocalOrder(currentOrder);

    if (navigator.vibrate) {
        navigator.vibrate(200);
    }

    // Show success feedback
    showCompletionFeedback(currentOrder);
    cancelScan();
    loadOrders();
}

function showCompletionFeedback(order) {
    const customerName = order.customer?.naam || 'Klant';
    const firstName = customerName.split(' ')[0];

    // Simple alert for dedicated scanner
    alert(`Bestelling ${order.orderNumber} afgehandeld voor ${firstName}!`);
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

    const matchingOrders = orders.filter(order => {
        const orderNumber = (order.orderNumber || '').toLowerCase();
        const customerName = (order.customer?.naam || '').toLowerCase();
        return orderNumber.includes(queryLower) || customerName.includes(queryLower);
    }).slice(0, 8);

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
                    <span class="autocomplete-timeslot">${escapeHtml(order.timeslotLabel || order.timeslot)}</span>
                    <span class="autocomplete-total">${formatPrice(total)}</span>
                    <span class="autocomplete-status ${statusClass}">${statusLabel}</span>
                </div>
            </div>
        `;
    }).join('');

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
// Utility Functions
// =====================
function formatPrice(amount) {
    return '€\u00A0' + amount.toFixed(2).replace('.', ',');
}

function calculateOrderTotal(order) {
    const PRICES = {
        oliebol_krenten: 1.10,
        oliebol_naturel: 1.00,
        appelbeignet: 1.25
    };

    let total = 0;
    for (const [product, qty] of Object.entries(order.products)) {
        total += qty * (PRICES[product] || 0);
    }
    return total;
}

function getStatusLabel(status) {
    const labels = {
        pending: 'Wachtend',
        completed: 'Opgehaald',
        noshow: 'No-show'
    };
    return labels[status] || 'Wachtend';
}

function updateLocalOrder(order) {
    const index = orders.findIndex(o => o.orderNumber === order.orderNumber);
    if (index >= 0) {
        orders[index] = order;
    }
    localStorage.setItem('orders', JSON.stringify(orders));
}

function getTimeslotStatus(order) {
    const timeslotLabel = order.timeslotLabel || order.timeslot;
    const timeMatch = timeslotLabel.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);

    if (!timeMatch) {
        const slot = timeslots.find(s => s.id === order.timeslot);
        if (slot && slot.start && slot.end) {
            return checkTimeAgainstSlot(slot.start, slot.end);
        }
        return { status: 'unknown', message: 'Tijdslot niet te bepalen', icon: '' };
    }

    const startTime = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
    const endTime = `${timeMatch[3].padStart(2, '0')}:${timeMatch[4]}`;

    return checkTimeAgainstSlot(startTime, endTime);
}

function checkTimeAgainstSlot(startTime, endTime) {
    const now = new Date();

    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);

    const slotStart = new Date(2025, 11, 31, startHour, startMin);
    const slotEnd = new Date(2025, 11, 31, endHour, endMin);

    const minutesUntilStart = Math.floor((slotStart - now) / 1000 / 60);
    const minutesUntilEnd = Math.floor((slotEnd - now) / 1000 / 60);

    const EARLY_THRESHOLD = 15;
    const LATE_THRESHOLD = 15;

    if (minutesUntilStart > EARLY_THRESHOLD) {
        const hoursEarly = Math.floor(minutesUntilStart / 60);
        const minsEarly = minutesUntilStart % 60;
        let timeText = hoursEarly > 0
            ? `${hoursEarly} uur${minsEarly > 0 ? ` en ${minsEarly} min` : ''}`
            : `${minsEarly} minuten`;
        return {
            status: 'early',
            message: `Te vroeg! Nog ${timeText} tot tijdslot`,
            icon: '',
            severity: minutesUntilStart > 60 ? 'severe' : 'warning'
        };
    } else if (minutesUntilEnd < -LATE_THRESHOLD) {
        const minutesLate = Math.abs(minutesUntilEnd);
        const hoursLate = Math.floor(minutesLate / 60);
        const minsLate = minutesLate % 60;
        let timeText = hoursLate > 0
            ? `${hoursLate} uur${minsLate > 0 ? ` en ${minsLate} min` : ''}`
            : `${minsLate} minuten`;
        return {
            status: 'late',
            message: `Te laat! Tijdslot is ${timeText} geleden`,
            icon: '',
            severity: minutesLate > 60 ? 'severe' : 'warning'
        };
    } else if (minutesUntilStart > 0 && minutesUntilStart <= EARLY_THRESHOLD) {
        return {
            status: 'almost',
            message: `Bijna tijd! Nog ${minutesUntilStart} minuten`,
            icon: '',
            severity: 'info'
        };
    } else if (minutesUntilEnd < 0 && minutesUntilEnd >= -LATE_THRESHOLD) {
        return {
            status: 'justended',
            message: `Net afgelopen (${Math.abs(minutesUntilEnd)} min geleden)`,
            icon: '',
            severity: 'info'
        };
    } else {
        return {
            status: 'ontime',
            message: 'Op tijd!',
            icon: '',
            severity: 'success'
        };
    }
}

// =====================
// DOM Ready
// =====================
document.addEventListener('DOMContentLoaded', () => {
    // Login handlers
    document.getElementById('requestCodeBtn').addEventListener('click', handleRequestCode);
    document.getElementById('tokenForm').addEventListener('submit', handleTokenSubmit);
    document.getElementById('backToRequest').addEventListener('click', handleBackToRequest);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);

    // Check auth and init
    checkAuth().then(loggedIn => {
        if (loggedIn) {
            initScannerApp();
        }
    });
});
