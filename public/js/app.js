/**
 * Oliebollen Costa Blanca - Bestel App
 * Mobile-first, offline-capable
 */

// Prijzen
const PRICES = {
    oliebol_krenten: 1.00,
    oliebol_naturel: 1.00,
    appelbeignet: 1.10
};

const PRODUCT_NAMES = {
    oliebol_krenten: 'Oliebollen met krenten',
    oliebol_naturel: 'Oliebollen zonder krenten',
    appelbeignet: 'Appelbeignets'
};

// State
let currentStep = 1;
let selectedTimeslot = null;
let orderData = {
    products: {
        oliebol_krenten: 0,
        oliebol_naturel: 0,
        appelbeignet: 0
    },
    timeslot: null,
    customer: {
        naam: '',
        email: '',
        telefoon: '',
        opmerkingen: ''
    }
};

// API Base URL (Cloudflare Worker)
const API_BASE = '/api';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initQuantityButtons();
    initNavigation();
    loadTimeslots();
    initFormValidation();
});

// =====================
// Quantity Controls
// =====================
function initQuantityButtons() {
    document.querySelectorAll('.qty-btn').forEach(btn => {
        btn.addEventListener('click', handleQuantityChange);
        // Touch feedback
        btn.addEventListener('touchstart', () => btn.classList.add('active'));
        btn.addEventListener('touchend', () => btn.classList.remove('active'));
    });
}

function handleQuantityChange(e) {
    const btn = e.currentTarget;
    const product = btn.dataset.product;
    const input = document.getElementById(product);
    const isPlus = btn.classList.contains('plus');

    let value = parseInt(input.value) || 0;

    if (isPlus) {
        value = Math.min(value + 1, 100);
    } else {
        value = Math.max(value - 1, 0);
    }

    input.value = value;
    orderData.products[product] = value;

    updateTotalPrice();
    updateStep1Button();

    // Haptic feedback (if supported)
    if (navigator.vibrate) {
        navigator.vibrate(10);
    }
}

function updateTotalPrice() {
    const total = calculateTotal();
    document.getElementById('totalPrice').textContent = formatPrice(total);
}

function calculateTotal() {
    let total = 0;
    for (const [product, qty] of Object.entries(orderData.products)) {
        total += qty * PRICES[product];
    }
    return total;
}

function formatPrice(amount) {
    return '€ ' + amount.toFixed(2).replace('.', ',');
}

function getTotalItems() {
    return Object.values(orderData.products).reduce((a, b) => a + b, 0);
}

function updateStep1Button() {
    const btn = document.getElementById('toStep2');
    btn.disabled = getTotalItems() === 0;
}

// =====================
// Navigation
// =====================
function initNavigation() {
    // Step navigation buttons
    document.getElementById('toStep2').addEventListener('click', () => goToStep(2));
    document.getElementById('backToStep1').addEventListener('click', () => goToStep(1));
    document.getElementById('toStep3').addEventListener('click', () => goToStep(3));
    document.getElementById('backToStep2').addEventListener('click', () => goToStep(2));
    document.getElementById('toStep4').addEventListener('click', () => {
        if (validateStep3()) {
            goToStep(4);
        }
    });
    document.getElementById('backToStep3').addEventListener('click', () => goToStep(3));
    document.getElementById('submitOrder').addEventListener('click', submitOrder);
}

function goToStep(step) {
    // Update step indicator
    document.querySelectorAll('.step').forEach((el, index) => {
        el.classList.remove('active', 'completed');
        if (index + 1 < step) {
            el.classList.add('completed');
        } else if (index + 1 === step) {
            el.classList.add('active');
        }
    });

    // Show correct form step
    document.querySelectorAll('.form-step').forEach(el => {
        el.classList.remove('active');
    });
    document.getElementById('step' + step).classList.add('active');

    currentStep = step;

    // Special actions per step
    if (step === 4) {
        populateReview();
    }

    // Scroll to top of form
    document.querySelector('.order-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// =====================
// Timeslots
// =====================
async function loadTimeslots() {
    const grid = document.getElementById('timeslotGrid');

    try {
        // Try to fetch from API
        const response = await fetch(API_BASE + '/timeslots');
        if (response.ok) {
            const timeslots = await response.json();
            renderTimeslots(timeslots);
            return;
        }
    } catch (e) {
        console.log('API niet beschikbaar, gebruik demo tijdsloten');
    }

    // Fallback: demo timeslots
    const demoTimeslots = generateDemoTimeslots();
    renderTimeslots(demoTimeslots);
}

function generateDemoTimeslots() {
    const slots = [];
    const startHour = 10;
    const endHour = 18;

    for (let hour = startHour; hour < endHour; hour++) {
        for (let min = 0; min < 60; min += 30) {
            const time = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
            const endMin = (min + 30) % 60;
            const endHr = min + 30 >= 60 ? hour + 1 : hour;
            const endTime = `${endHr.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`;

            // Random availability for demo
            const capacity = 10;
            const booked = Math.floor(Math.random() * 12);
            const available = Math.max(0, capacity - booked);

            slots.push({
                id: `slot_${time.replace(':', '')}`,
                start: time,
                end: endTime,
                label: `${time} - ${endTime}`,
                capacity: capacity,
                booked: booked,
                available: available
            });
        }
    }

    return slots;
}

function renderTimeslots(timeslots) {
    const grid = document.getElementById('timeslotGrid');
    grid.innerHTML = '';

    timeslots.forEach(slot => {
        const div = document.createElement('div');
        div.className = 'timeslot' + (slot.available === 0 ? ' unavailable' : '');
        div.dataset.slotId = slot.id;
        div.dataset.slotLabel = slot.label;

        div.innerHTML = `
            <div class="timeslot-time">${slot.start}</div>
            <div class="timeslot-spots">${slot.available > 0 ? slot.available + ' plekken' : 'Vol!'}</div>
        `;

        if (slot.available > 0) {
            div.addEventListener('click', () => selectTimeslot(div, slot));
        }

        grid.appendChild(div);
    });
}

function selectTimeslot(element, slot) {
    // Deselect previous
    document.querySelectorAll('.timeslot.selected').forEach(el => {
        el.classList.remove('selected');
    });

    // Select new
    element.classList.add('selected');
    selectedTimeslot = slot;
    orderData.timeslot = slot;

    // Enable next button
    document.getElementById('toStep3').disabled = false;

    // Haptic feedback
    if (navigator.vibrate) {
        navigator.vibrate(10);
    }
}

// =====================
// Form Validation
// =====================
function initFormValidation() {
    const inputs = ['naam', 'email', 'telefoon'];
    inputs.forEach(id => {
        const input = document.getElementById(id);
        input.addEventListener('input', () => {
            orderData.customer[id] = input.value;
        });
        input.addEventListener('blur', () => {
            validateField(input);
        });
    });

    document.getElementById('opmerkingen').addEventListener('input', (e) => {
        orderData.customer.opmerkingen = e.target.value;
    });
}

function validateField(input) {
    const value = input.value.trim();
    let valid = true;

    if (input.required && !value) {
        valid = false;
    }

    if (input.type === 'email' && value) {
        valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }

    if (input.type === 'tel' && value) {
        // Basic phone validation
        valid = value.replace(/[\s\-\(\)]/g, '').length >= 9;
    }

    input.style.borderColor = valid ? '' : '#e74c3c';
    return valid;
}

function validateStep3() {
    const naam = document.getElementById('naam');
    const email = document.getElementById('email');
    const telefoon = document.getElementById('telefoon');

    const validNaam = validateField(naam);
    const validEmail = validateField(email);
    const validTelefoon = validateField(telefoon);

    if (!validNaam || !validEmail || !validTelefoon) {
        // Focus first invalid field
        if (!validNaam) naam.focus();
        else if (!validEmail) email.focus();
        else if (!validTelefoon) telefoon.focus();
        return false;
    }

    return true;
}

// =====================
// Review & Submit
// =====================
function populateReview() {
    // Products
    const reviewProducts = document.getElementById('reviewProducts');
    let productsHtml = '';

    for (const [product, qty] of Object.entries(orderData.products)) {
        if (qty > 0) {
            const subtotal = qty * PRICES[product];
            productsHtml += `<p>${qty}x ${PRODUCT_NAMES[product]} - ${formatPrice(subtotal)}</p>`;
        }
    }
    reviewProducts.innerHTML = productsHtml;

    // Total
    document.getElementById('reviewTotal').textContent = formatPrice(calculateTotal());

    // Timeslot
    document.getElementById('reviewTimeslot').textContent =
        `31 december 2025, ${orderData.timeslot.label}`;

    // Customer info
    document.getElementById('reviewName').textContent = orderData.customer.naam;
    document.getElementById('reviewEmail').textContent = orderData.customer.email;
    document.getElementById('reviewPhone').textContent = orderData.customer.telefoon;

    const notesEl = document.getElementById('reviewNotes');
    if (orderData.customer.opmerkingen) {
        notesEl.textContent = `"${orderData.customer.opmerkingen}"`;
        notesEl.style.display = 'block';
    } else {
        notesEl.style.display = 'none';
    }
}

async function submitOrder() {
    const submitBtn = document.getElementById('submitOrder');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Bezig met verzenden...';

    try {
        // Prepare order data
        const order = {
            products: orderData.products,
            timeslot: orderData.timeslot.id,
            timeslotLabel: orderData.timeslot.label,
            customer: orderData.customer,
            total: calculateTotal(),
            createdAt: new Date().toISOString()
        };

        // Try to submit to API
        let orderResult;
        try {
            const response = await fetch(API_BASE + '/orders', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(order)
            });

            if (response.ok) {
                orderResult = await response.json();
            }
        } catch (e) {
            console.log('API niet beschikbaar, sla lokaal op');
        }

        // Fallback: generate local order number
        if (!orderResult) {
            orderResult = {
                orderNumber: 'OB-' + Date.now().toString(36).toUpperCase(),
                qrCode: null
            };

            // Store locally for later sync
            saveOrderLocally(order, orderResult.orderNumber);
        }

        // Show confirmation
        showConfirmation(orderResult);

    } catch (error) {
        console.error('Error submitting order:', error);
        alert('Er ging iets mis. Probeer het opnieuw.');
        submitBtn.disabled = false;
        submitBtn.textContent = '✓ Bestelling plaatsen';
    }
}

function saveOrderLocally(order, orderNumber) {
    const pendingOrders = JSON.parse(localStorage.getItem('pendingOrders') || '[]');
    pendingOrders.push({
        ...order,
        orderNumber: orderNumber,
        synced: false
    });
    localStorage.setItem('pendingOrders', JSON.stringify(pendingOrders));
}

function showConfirmation(result) {
    // Hide step indicator
    document.querySelector('.step-indicator').style.display = 'none';

    // Show confirmation step
    document.querySelectorAll('.form-step').forEach(el => {
        el.classList.remove('active');
    });
    document.getElementById('stepComplete').classList.add('active');

    // Populate confirmation details
    document.getElementById('orderNumber').textContent = result.orderNumber;
    document.getElementById('confirmTimeslot').textContent =
        `31 december 2025, ${orderData.timeslot.label}`;
    document.getElementById('confirmTotal').textContent = formatPrice(calculateTotal());

    // Generate QR code (using QRCode.js library or show placeholder)
    const qrContainer = document.getElementById('confirmationQR');
    if (typeof QRCode !== 'undefined' && result.orderNumber) {
        qrContainer.innerHTML = '';
        new QRCode(qrContainer, {
            text: result.orderNumber,
            width: 200,
            height: 200,
            colorDark: '#2c3e50',
            colorLight: '#ffffff',
        });
    } else {
        // Show order number prominently if no QR lib available
        qrContainer.innerHTML = `
            <div style="background: #f7f7f7; padding: 20px; border-radius: 8px;">
                <p style="font-size: 0.9rem; color: #666; margin-bottom: 8px;">Je bestelnummer:</p>
                <p style="font-size: 1.5rem; font-weight: 700; color: #2c3e50;">${result.orderNumber}</p>
            </div>
        `;
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// =====================
// Service Worker Registration (PWA)
// =====================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('ServiceWorker registered:', registration.scope);
            })
            .catch(error => {
                console.log('ServiceWorker registration failed:', error);
            });
    });
}

// =====================
// Online/Offline handling
// =====================
window.addEventListener('online', () => {
    document.body.classList.remove('offline');
    syncPendingOrders();
});

window.addEventListener('offline', () => {
    document.body.classList.add('offline');
});

async function syncPendingOrders() {
    const pendingOrders = JSON.parse(localStorage.getItem('pendingOrders') || '[]');

    for (const order of pendingOrders) {
        if (!order.synced) {
            try {
                const response = await fetch(API_BASE + '/orders', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(order)
                });

                if (response.ok) {
                    order.synced = true;
                }
            } catch (e) {
                console.log('Sync failed, will retry later');
            }
        }
    }

    localStorage.setItem('pendingOrders', JSON.stringify(pendingOrders));
}
