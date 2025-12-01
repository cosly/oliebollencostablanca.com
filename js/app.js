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
    // Don't load timeslots here - they're loaded when user goes to step 2
    initFormValidation();
    checkPrefillParams();
    initDrawer();
    initStepperNavigation();
});

// =====================
// Pre-fill from URL (for returning customers)
// =====================
function checkPrefillParams() {
    const params = new URLSearchParams(window.location.search);

    // Check for prefill data
    const naam = params.get('naam');
    const email = params.get('email');
    const telefoon = params.get('telefoon');

    if (naam || email || telefoon) {
        // Pre-fill customer data
        if (naam) {
            const naamInput = document.getElementById('naam');
            if (naamInput) {
                naamInput.value = naam;
                orderData.customer.naam = naam;
            }
        }
        if (email) {
            const emailInput = document.getElementById('email');
            if (emailInput) {
                emailInput.value = email;
                orderData.customer.email = email;
            }
        }
        if (telefoon) {
            const telefoonInput = document.getElementById('telefoon');
            if (telefoonInput) {
                telefoonInput.value = telefoon;
                orderData.customer.telefoon = telefoon;
            }
        }

        // Show welcome back message
        showWelcomeBack(naam);
    }
}

function showWelcomeBack(naam) {
    const firstName = naam ? naam.split(' ')[0] : '';
    const hero = document.querySelector('.hero');
    if (hero && firstName) {
        // Add welcome back banner (use textContent to prevent XSS)
        const banner = document.createElement('div');
        banner.className = 'welcome-back-banner';
        const container = document.createElement('div');
        container.className = 'container';
        const p = document.createElement('p');
        p.appendChild(document.createTextNode('Welkom terug, '));
        const strong = document.createElement('strong');
        strong.textContent = firstName;
        p.appendChild(strong);
        p.appendChild(document.createTextNode('! Fijn dat je weer bestelt.'));
        container.appendChild(p);
        banner.appendChild(container);
        hero.insertAdjacentElement('afterend', banner);
    }
}

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

    // Re-render timeslots to reflect new capacity requirements
    if (loadedTimeslots.length > 0) {
        renderTimeslots(loadedTimeslots);
    }

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
    if (step === 2) {
        // Reload timeslots with fresh capacity data
        loadTimeslots();
    } else if (step === 4) {
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
        console.log('Timeslots API response:', response.status, response.ok);
        if (response.ok) {
            const data = await response.json();
            console.log('Timeslots data:', data);
            const timeslots = data.timeslots || data; // Support both {timeslots: [...]} and raw array
            console.log('Parsed timeslots:', timeslots.length, timeslots[0]);
            renderTimeslots(timeslots);
            return;
        } else {
            console.error('API response not OK:', response.status, response.statusText);
        }
    } catch (e) {
        console.error('API fetch failed:', e);
        console.log('API niet beschikbaar, gebruik demo tijdsloten');
    }

    // Fallback: demo timeslots
    const demoTimeslots = generateDemoTimeslots();
    renderTimeslots(demoTimeslots);
}

// Store loaded timeslots for re-rendering when order quantity changes
let loadedTimeslots = [];

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

            // Demo: 150 stuks capaciteit per slot
            const capacity = 150;
            const booked = Math.floor(Math.random() * 160);
            const available = Math.max(0, capacity - booked);

            const hourBlock = `${hour.toString().padStart(2, '0')}:00-${(hour + 1).toString().padStart(2, '0')}:00`;

            slots.push({
                id: `slot_${time.replace(':', '')}`,
                start: time,
                end: endTime,
                label: `${time} - ${endTime}`,
                hourBlock: hourBlock,
                products: {
                    'oliebol_krenten': {
                        capacity: 50,
                        booked: Math.floor(Math.random() * 60),
                        available: Math.max(0, 50 - Math.floor(Math.random() * 60))
                    },
                    'oliebol_naturel': {
                        capacity: 50,
                        booked: Math.floor(Math.random() * 60),
                        available: Math.max(0, 50 - Math.floor(Math.random() * 60))
                    },
                    'appelbeignet': {
                        capacity: 30,
                        booked: Math.floor(Math.random() * 40),
                        available: Math.max(0, 30 - Math.floor(Math.random() * 40))
                    }
                }
            });
        }
    }

    return slots;
}

function renderTimeslots(timeslots) {
    // Store for re-rendering when quantity changes
    loadedTimeslots = timeslots;

    const grid = document.getElementById('timeslotGrid');
    if (!grid) {
        console.log('Timeslot grid not found, skipping render');
        return;
    }
    grid.innerHTML = '';

    // Group timeslots by hour for displaying capacity bars
    const slotsByHour = {};
    timeslots.forEach(slot => {
        if (!slotsByHour[slot.hourBlock]) {
            slotsByHour[slot.hourBlock] = [];
        }
        slotsByHour[slot.hourBlock].push(slot);
    });

    timeslots.forEach(slot => {
        const div = document.createElement('div');

        // Check if each product has enough capacity
        let hasEnoughCapacity = true;
        let unavailableProducts = [];

        for (const [productId, quantity] of Object.entries(orderData.products)) {
            if (quantity > 0) {
                // Safety check: ensure slot has products data
                if (!slot.products || !slot.products[productId]) {
                    hasEnoughCapacity = false;
                    unavailableProducts.push(productId);
                    continue;
                }

                const productCap = slot.products[productId];
                if (!productCap || productCap.available < quantity) {
                    hasEnoughCapacity = false;
                    unavailableProducts.push(productId);
                }
            }
        }

        const isUnavailable = !hasEnoughCapacity;

        div.className = 'timeslot' + (isUnavailable ? ' unavailable' : '');
        div.dataset.slotId = slot.id;
        div.dataset.slotLabel = slot.label;

        // Show availability per product
        let availText = '';
        if (isUnavailable && unavailableProducts.length > 0) {
            availText = 'Te weinig beschikbaar';
        } else if (slot.products) {
            // Show mini capacity indicators
            const krenten = slot.products['oliebol_krenten'];
            const naturel = slot.products['oliebol_naturel'];
            const appel = slot.products['appelbeignet'];

            availText = `<div class="product-avail">
                <span style="color: #ff6b6b">K: ${krenten ? krenten.available : 0}</span>
                <span style="color: #4ecdc4">N: ${naturel ? naturel.available : 0}</span>
                <span style="color: #ffe66d">A: ${appel ? appel.available : 0}</span>
            </div>`;
        } else {
            availText = 'Beschikbaar';
        }

        div.innerHTML = `
            <div class="timeslot-time">${slot.start}</div>
            <div class="timeslot-spots">${availText}</div>
        `;

        if (!isUnavailable) {
            div.addEventListener('click', () => selectTimeslot(div, slot));
        }

        grid.appendChild(div);
    });

    // Re-check if selected timeslot is still valid
    if (selectedTimeslot) {
        const stillValid = timeslots.find(s => s.id === selectedTimeslot.id);
        let hasCapacity = true;

        if (stillValid) {
            for (const [productId, quantity] of Object.entries(orderData.products)) {
                if (quantity > 0) {
                    const productCap = stillValid.products[productId];
                    if (!productCap || productCap.available < quantity) {
                        hasCapacity = false;
                        break;
                    }
                }
            }
        }

        if (stillValid && hasCapacity) {
            // Re-select the slot visually
            const selectedEl = grid.querySelector(`[data-slot-id="${selectedTimeslot.id}"]`);
            if (selectedEl && !selectedEl.classList.contains('unavailable')) {
                selectedEl.classList.add('selected');
            } else {
                // Slot became unavailable, deselect
                selectedTimeslot = null;
                orderData.timeslot = null;
                document.getElementById('toStep3').disabled = true;
            }
        } else {
            // Slot no longer valid for this order size
            selectedTimeslot = null;
            orderData.timeslot = null;
            document.getElementById('toStep3').disabled = true;
        }
    }
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
            } else {
                // Handle capacity error
                const errorData = await response.json();
                if (errorData.error === 'Onvoldoende capaciteit') {
                    alert(errorData.message || 'Er is niet genoeg capaciteit in dit tijdslot. Kies een ander tijdslot.');
                    // Reload timeslots to get fresh availability
                    loadTimeslots();
                    goToStep(2);
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Bestelling plaatsen';
                    return;
                }
                throw new Error(errorData.error || 'Bestelling mislukt');
            }
        } catch (e) {
            if (e.message && e.message.includes('capaciteit')) {
                throw e;
            }
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
        alert(error.message || 'Er ging iets mis. Probeer het opnieuw.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Bestelling plaatsen';
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

// Store current order result for ticket generation
let currentOrderResult = null;

function showConfirmation(result) {
    currentOrderResult = result;

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

    // Save order to localStorage for order.html page
    saveOrderForViewing(result);

    // Setup action buttons
    setupConfirmationButtons(result);

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function saveOrderForViewing(result) {
    const orderToSave = {
        orderNumber: result.orderNumber,
        products: orderData.products,
        timeslot: orderData.timeslot.id,
        timeslotLabel: orderData.timeslot.label,
        customer: {
            naam: orderData.customer.naam,
            email: orderData.customer.email,
            telefoon: orderData.customer.telefoon
        },
        total: calculateTotal(),
        createdAt: new Date().toISOString()
    };

    // Save to myOrders in localStorage
    const savedOrders = JSON.parse(localStorage.getItem('myOrders') || '[]');
    const existing = savedOrders.findIndex(o => o.orderNumber === result.orderNumber);
    if (existing >= 0) {
        savedOrders[existing] = orderToSave;
    } else {
        savedOrders.push(orderToSave);
    }
    localStorage.setItem('myOrders', JSON.stringify(savedOrders));
}

function setupConfirmationButtons(result) {
    // View order page button
    const viewOrderBtn = document.getElementById('viewOrderPageBtn');
    if (viewOrderBtn) {
        viewOrderBtn.href = `/order.html?id=${result.orderNumber}`;
    }

    // Download ticket button
    const downloadBtn = document.getElementById('downloadTicketBtn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => generateAndDownloadTicket(result));
    }

    // Setup social share buttons
    setupShareButtons();
}

function setupShareButtons() {
    const websiteUrl = window.location.origin;
    const shareMessage = `Ik heb net oliebollen besteld bij Oliebollen Costa Blanca voor Oudjaar! Bestel ook via ${websiteUrl}`;

    // WhatsApp share
    const whatsappBtn = document.getElementById('shareWhatsapp');
    if (whatsappBtn) {
        const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;
        whatsappBtn.href = whatsappUrl;
    }

    // Facebook share
    const facebookBtn = document.getElementById('shareFacebook');
    if (facebookBtn) {
        const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(websiteUrl)}&quote=${encodeURIComponent(shareMessage)}`;
        facebookBtn.href = facebookUrl;
    }
}

async function generateAndDownloadTicket(result) {
    const canvas = document.getElementById('ticketCanvas');
    const ctx = canvas.getContext('2d');

    // Set canvas size (optimized for phone wallpaper/photo)
    const width = 800;
    const height = 1200;
    canvas.width = width;
    canvas.height = height;

    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#e67e22');
    gradient.addColorStop(0.3, '#d35400');
    gradient.addColorStop(0.3, '#ffffff');
    gradient.addColorStop(1, '#f8f9fa');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Header area
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px Fredoka, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Oliebollen Costa Blanca', width / 2, 80);

    ctx.font = '28px Arial, sans-serif';
    ctx.fillText('31 december 2025', width / 2, 130);

    // White ticket area
    const ticketY = 200;
    const ticketHeight = 900;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.1)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 5;

    // Rounded rectangle for ticket
    roundRect(ctx, 40, ticketY, width - 80, ticketHeight, 20);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Order number
    ctx.fillStyle = '#2c3e50';
    ctx.font = 'bold 36px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BESTELNUMMER', width / 2, ticketY + 60);

    ctx.fillStyle = '#e67e22';
    ctx.font = 'bold 56px Arial, sans-serif';
    ctx.fillText(result.orderNumber, width / 2, ticketY + 130);

    // Dashed line
    ctx.strokeStyle = '#dddddd';
    ctx.setLineDash([10, 5]);
    ctx.beginPath();
    ctx.moveTo(60, ticketY + 170);
    ctx.lineTo(width - 60, ticketY + 170);
    ctx.stroke();
    ctx.setLineDash([]);

    // QR Code placeholder area
    const qrSize = 250;
    const qrX = (width - qrSize) / 2;
    const qrY = ticketY + 200;

    // Load and draw QR code
    try {
        const qrImg = new Image();
        qrImg.crossOrigin = 'anonymous';
        await new Promise((resolve, reject) => {
            qrImg.onload = resolve;
            qrImg.onerror = reject;
            qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(result.orderNumber)}`;
        });
        ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
    } catch (e) {
        // Fallback: draw placeholder
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(qrX, qrY, qrSize, qrSize);
        ctx.fillStyle = '#999';
        ctx.font = '20px Arial';
        ctx.fillText('QR Code', width / 2, qrY + qrSize / 2);
    }

    // Timeslot
    const infoY = qrY + qrSize + 50;
    ctx.fillStyle = '#27ae60';
    ctx.font = 'bold 32px Arial, sans-serif';
    ctx.fillText('OPHAALTIJD', width / 2, infoY);

    ctx.fillStyle = '#2c3e50';
    ctx.font = 'bold 44px Arial, sans-serif';
    ctx.fillText(orderData.timeslot.label, width / 2, infoY + 55);

    // Dashed line
    ctx.strokeStyle = '#dddddd';
    ctx.setLineDash([10, 5]);
    ctx.beginPath();
    ctx.moveTo(60, infoY + 90);
    ctx.lineTo(width - 60, infoY + 90);
    ctx.stroke();
    ctx.setLineDash([]);

    // Order details
    const detailsY = infoY + 130;
    ctx.fillStyle = '#666666';
    ctx.font = '24px Arial, sans-serif';
    ctx.textAlign = 'left';

    let lineY = detailsY;
    for (const [product, qty] of Object.entries(orderData.products)) {
        if (qty > 0) {
            ctx.fillText(`${qty}x ${PRODUCT_NAMES[product]}`, 80, lineY);
            lineY += 40;
        }
    }

    // Total
    ctx.font = 'bold 32px Arial, sans-serif';
    ctx.fillStyle = '#e67e22';
    ctx.textAlign = 'center';
    ctx.fillText(`TOTAAL: ${formatPrice(calculateTotal())}`, width / 2, lineY + 30);

    // Customer name
    ctx.fillStyle = '#999999';
    ctx.font = '24px Arial, sans-serif';
    ctx.fillText(orderData.customer.naam, width / 2, lineY + 80);

    // Footer
    ctx.fillStyle = '#cccccc';
    ctx.font = '20px Arial, sans-serif';
    ctx.fillText('Betaling contant bij ophalen', width / 2, height - 60);

    // Download the image
    const link = document.createElement('a');
    link.download = `oliebollen-ticket-${result.orderNumber}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
}

// Helper function for rounded rectangles
function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
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

// =====================
// Drawer functionality
// =====================
function initDrawer() {
    const infoBtn = document.getElementById('infoBtn');
    const drawer = document.getElementById('infoDrawer');
    const overlay = document.getElementById('drawerOverlay');
    const closeBtn = document.getElementById('drawerClose');

    if (!infoBtn || !drawer || !overlay || !closeBtn) return;

    // Open drawer
    infoBtn.addEventListener('click', () => {
        drawer.classList.add('active');
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    });

    // Close drawer
    const closeDrawer = () => {
        drawer.classList.remove('active');
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    };

    closeBtn.addEventListener('click', closeDrawer);
    overlay.addEventListener('click', closeDrawer);

    // Close on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && drawer.classList.contains('active')) {
            closeDrawer();
        }
    });
}

// =====================
// Clickable stepper navigation
// =====================
function initStepperNavigation() {
    const steps = document.querySelectorAll('.step');
    
    steps.forEach((step, index) => {
        step.addEventListener('click', () => {
            const stepNumber = index + 1;
            
            // Only allow navigation to current or previous steps
            if (stepNumber <= currentStep) {
                goToStep(stepNumber);
            }
        });
    });
}
