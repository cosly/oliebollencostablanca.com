/**
 * Oliebollen Costa Blanca - Admin Panel
 * Mobile-first, offline-capable
 */

const API_BASE = '/api';

// State
let currentOrder = null;
let orders = [];
let timeslots = [];
let html5QrCode = null;
let scannerRunning = false;

// Product info
const PRODUCT_NAMES = {
    oliebol_krenten: 'Oliebollen met krenten',
    oliebol_naturel: 'Oliebollen zonder krenten',
    appelbeignet: 'Appelbeignets'
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initScanner();
    initCalculator();
    initCapacity();
    loadOrders();
    loadTimeslots();
    checkConnection();
});

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

    // Enter key for manual lookup
    document.getElementById('manualOrderNumber').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            manualLookup();
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
        const response = await fetch(`${API_BASE}/orders/${orderNumber}`);
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
    const statusEl = document.getElementById('scanOrderStatus');
    statusEl.textContent = getStatusLabel(order.status || 'pending');
    statusEl.className = 'order-status ' + (order.status || 'pending');

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
            method: 'POST'
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

    alert('✓ Bestelling afgehandeld!');
    cancelScan();
    loadOrders();
}

function manualLookup() {
    const query = document.getElementById('manualOrderNumber').value.trim();
    if (query) {
        lookupOrder(query);
    }
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
        const response = await fetch(`${API_BASE}/orders`);
        if (response.ok) {
            orders = await response.json();
        }
    } catch (e) {
        console.log('API niet beschikbaar, laad demo data');
        orders = getDemoOrders();
    }

    renderOrders();
    updateOrderCounts();
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
        <div class="order-card" data-order="${order.orderNumber}">
            <div class="order-card-header">
                <span class="order-number">${order.orderNumber}</span>
                <span class="order-status ${order.status || 'pending'}">${getStatusLabel(order.status)}</span>
            </div>
            <div class="order-card-body">
                <div class="order-customer">${order.customer.naam}</div>
                <div class="order-timeslot">🕐 ${order.timeslotLabel || order.timeslot}</div>
                <div class="order-items">${formatOrderItems(order.products)}</div>
                <div class="order-total">${formatPrice(order.total || calculateOrderTotal(order))}</div>
                <div class="order-actions">
                    ${order.status !== 'completed' ? `
                        <button class="btn btn-success btn-complete" data-order="${order.orderNumber}">✓ Afhandelen</button>
                        <button class="btn btn-danger btn-noshow" data-order="${order.orderNumber}">⚠️ No-show</button>
                    ` : `
                        <span class="completed-label">✓ Opgehaald</span>
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

function populateTimeslotFilter() {
    const select = document.getElementById('timeslotFilter');
    const existingSlots = [...new Set(orders.map(o => o.timeslot))];

    select.innerHTML = '<option value="">Alle tijdsloten</option>';
    existingSlots.sort().forEach(slot => {
        const order = orders.find(o => o.timeslot === slot);
        const label = order?.timeslotLabel || slot;
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
            await fetch(`${API_BASE}/orders/${orderNumber}/complete`, { method: 'POST' });
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
        `Hoi ${order.customer.naam.split(' ')[0]}! Je oliebollen bestelling (${order.orderNumber}) staat nog op je te wachten. Laat even weten wanneer je langs komt! 🍩`
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
            await fetch(`${API_BASE}/orders/${orderNumber}/noshow`, { method: 'POST' });
        } catch (e) {}
    }

    document.getElementById('noshowModal').style.display = 'none';
}

// =====================
// Capacity Management
// =====================
async function loadTimeslots() {
    try {
        const response = await fetch(`${API_BASE}/timeslots`);
        if (response.ok) {
            timeslots = await response.json();
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

    container.innerHTML = timeslots.map(slot => {
        // Use booked from API (total items), or calculate from orders if not available
        const booked = slot.booked !== undefined ? slot.booked : calculateBookedItems(slot.id);
        const percentage = slot.capacity > 0 ? (booked / slot.capacity) * 100 : 0;
        const fillClass = percentage >= 100 ? 'full' : percentage >= 80 ? 'warning' : '';
        const orderCount = orders.filter(o => o.timeslot === slot.id).length;

        return `
            <div class="capacity-item" data-slot="${slot.id}">
                <span class="capacity-time">${slot.start}</span>
                <div class="capacity-bar">
                    <div class="capacity-fill ${fillClass}" style="width: ${Math.min(percentage, 100)}%"></div>
                </div>
                <span class="capacity-booked" title="${orderCount} bestellingen">${booked}/${slot.capacity} stuks</span>
                <input type="number" class="capacity-input" value="${slot.capacity}"
                       min="0" max="500" data-slot="${slot.id}">
            </div>
        `;
    }).join('');

    // Bulk set capacity
    document.getElementById('setAllCapacity').addEventListener('click', () => {
        const bulkValue = document.getElementById('bulkCapacity').value;
        container.querySelectorAll('.capacity-input').forEach(input => {
            input.value = bulkValue;
        });
    });

    // Save capacity
    document.getElementById('saveCapacity').addEventListener('click', saveCapacity);
}

async function saveCapacity() {
    const updates = [];
    document.querySelectorAll('.capacity-input').forEach(input => {
        const slotId = input.dataset.slot;
        const capacity = parseInt(input.value) || 0;
        updates.push({ id: slotId, capacity });

        // Update local state
        const slot = timeslots.find(s => s.id === slotId);
        if (slot) slot.capacity = capacity;
    });

    try {
        await fetch(`${API_BASE}/timeslots/capacity`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
    } catch (e) {
        console.log('API niet beschikbaar, lokaal opgeslagen');
    }

    // Save locally
    localStorage.setItem('timeslots', JSON.stringify(timeslots));

    alert('✓ Capaciteit opgeslagen!');
    renderCapacityList();
}

function initCapacity() {
    // Load from localStorage if available
    const savedTimeslots = localStorage.getItem('timeslots');
    if (savedTimeslots) {
        timeslots = JSON.parse(savedTimeslots);
    }
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

    orders.forEach(order => {
        const slot = order.timeslotLabel || order.timeslot;
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
                ${data.products.oliebol_krenten > 0 ? `<span>🟤 ${data.products.oliebol_krenten}x krenten</span>` : ''}
                ${data.products.oliebol_naturel > 0 ? `<span>⚪ ${data.products.oliebol_naturel}x naturel</span>` : ''}
                ${data.products.appelbeignet > 0 ? `<span>🍎 ${data.products.appelbeignet}x appel</span>` : ''}
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
// Service Worker
// =====================
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('SW registered'))
        .catch(err => console.log('SW failed', err));
}
