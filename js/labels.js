/**
 * Labels Generator - Oliebollen Costa Blanca
 * Genereer zaklabels met naam, ordernummer, QR code en tekst
 * A4 papier met 2x A5 portrait labels per pagina
 */

const API_BASE = '/api';

// State
let allOrders = [];
let selectedOrders = new Set();

// =====================
// Initialization
// =====================
document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('tab-labels')) return;

    initButtons();

    // Load orders when tab is shown
    const labelsTabBtn = document.querySelector('[data-tab="labels"]');
    if (labelsTabBtn) {
        labelsTabBtn.addEventListener('click', () => {
            setTimeout(loadOrders, 100);
        });
    }
});

function initButtons() {
    document.getElementById('selectAllLabels')?.addEventListener('click', selectAll);
    document.getElementById('deselectAllLabels')?.addEventListener('click', deselectAll);
    document.getElementById('generatePdfBtn')?.addEventListener('click', generatePdf);
    document.getElementById('timeslotFilterLabels')?.addEventListener('change', filterOrders);
}

// =====================
// Data Loading
// =====================
async function loadOrders() {
    try {
        const response = await fetch(`${API_BASE}/orders`);
        if (!response.ok) throw new Error('Failed to load orders');

        const data = await response.json();
        // API returns array directly
        allOrders = Array.isArray(data) ? data : (data.orders || []);

        populateTimeslotFilter();
        renderOrdersList();
    } catch (error) {
        console.error('Error loading orders:', error);
        showError('Kon bestellingen niet laden');
    }
}

function populateTimeslotFilter() {
    const filter = document.getElementById('timeslotFilterLabels');
    if (!filter) return;

    const timeslots = [...new Set(allOrders.map(o => o.timeslot_label))].sort();

    filter.innerHTML = '<option value="">Alle tijdsloten</option>';
    timeslots.forEach(slot => {
        if (slot) {
            filter.innerHTML += `<option value="${slot}">${slot}</option>`;
        }
    });
}

function filterOrders() {
    renderOrdersList();
}

// =====================
// Orders List Rendering
// =====================
function renderOrdersList() {
    const container = document.getElementById('labelOrdersList');
    if (!container) return;

    const filter = document.getElementById('timeslotFilterLabels')?.value || '';
    const filteredOrders = filter
        ? allOrders.filter(o => o.timeslot_label === filter)
        : allOrders;

    if (filteredOrders.length === 0) {
        container.innerHTML = '<p class="no-orders">Geen bestellingen gevonden</p>';
        return;
    }

    container.innerHTML = '';

    for (const order of filteredOrders) {
        const customerName = getCustomerName(order);
        const isSelected = selectedOrders.has(order.id);

        const row = document.createElement('div');
        row.className = `label-order-row ${isSelected ? 'selected' : ''}`;
        row.innerHTML = `
            <label class="order-checkbox-label">
                <input type="checkbox" class="order-checkbox" data-id="${order.id}" ${isSelected ? 'checked' : ''}>
                <span class="order-info">
                    <span class="order-number">${order.order_number}</span>
                    <span class="order-name">${customerName}</span>
                    <span class="order-timeslot">${order.timeslot_label || '-'}</span>
                </span>
            </label>
        `;

        const checkbox = row.querySelector('.order-checkbox');
        checkbox.addEventListener('change', () => toggleOrder(order.id, checkbox.checked));

        container.appendChild(row);
    }

    updateSelectedCount();
}

function getCustomerName(order) {
    // API already provides parsed customer object
    if (order.customer && order.customer.naam) {
        return order.customer.naam;
    }
    // Fallback to parsing customer_data
    try {
        const data = JSON.parse(order.customer_data);
        return data.naam || 'Onbekend';
    } catch {
        return 'Onbekend';
    }
}

function toggleOrder(orderId, checked) {
    if (checked) {
        selectedOrders.add(orderId);
    } else {
        selectedOrders.delete(orderId);
    }
    updateSelectedCount();

    // Update visual state
    const row = document.querySelector(`[data-id="${orderId}"]`)?.closest('.label-order-row');
    if (row) {
        row.classList.toggle('selected', checked);
    }
}

function selectAll() {
    const filter = document.getElementById('timeslotFilterLabels')?.value || '';
    const filteredOrders = filter
        ? allOrders.filter(o => o.timeslot_label === filter)
        : allOrders;

    filteredOrders.forEach(o => selectedOrders.add(o.id));
    renderOrdersList();
}

function deselectAll() {
    selectedOrders.clear();
    renderOrdersList();
}

function updateSelectedCount() {
    const countEl = document.querySelector('.selected-count');
    if (countEl) {
        countEl.textContent = `${selectedOrders.size} geselecteerd`;
    }
}

// =====================
// PDF Generation
// =====================
async function generatePdf() {
    if (selectedOrders.size === 0) {
        alert('Selecteer eerst bestellingen om te printen');
        return;
    }

    const labelText = document.getElementById('labelText')?.value || 'Fijne jaarwisseling!';
    const ordersToprint = allOrders
        .filter(o => selectedOrders.has(o.id))
        .sort((a, b) => (a.timeslot_label || '').localeCompare(b.timeslot_label || ''));

    // Show loading state
    const btn = document.getElementById('generatePdfBtn');
    const originalText = btn.textContent;
    btn.textContent = 'Bezig...';
    btn.disabled = true;

    try {
        await createPdf(ordersToprint, labelText);
    } catch (error) {
        console.error('PDF generation error:', error);
        alert('Fout bij genereren PDF: ' + error.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

async function createPdf(orders, labelText) {
    const { jsPDF } = window.jspdf;

    // A4 dimensions in mm
    const pageWidth = 210;
    const pageHeight = 297;

    // A6 = quarter of A4 (2x2 grid)
    const labelWidth = pageWidth / 2;
    const labelHeight = pageHeight / 2;

    const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });

    // Items per bag setting
    const itemsPerBag = 10;

    // Build list of labels (multiple per order if needed)
    const labels = [];
    for (const order of orders) {
        const products = order.products || {};
        const totalItems = (products.oliebol_krenten || 0) +
                          (products.oliebol_naturel || 0) +
                          (products.appelbeignet || 0);
        const bagsNeeded = Math.max(1, Math.ceil(totalItems / itemsPerBag));

        for (let bag = 0; bag < bagsNeeded; bag++) {
            labels.push({ order, bagNumber: bag + 1, totalBags: bagsNeeded });
        }
    }

    for (let i = 0; i < labels.length; i++) {
        const { order, bagNumber, totalBags } = labels[i];
        const customerName = getCustomerName(order);

        // Position in 2x2 grid (0=top-left, 1=top-right, 2=bottom-left, 3=bottom-right)
        const posOnPage = i % 4;
        const col = posOnPage % 2;
        const row = Math.floor(posOnPage / 2);
        const xOffset = col * labelWidth;
        const yOffset = row * labelHeight;

        // Add new page for every 4 labels (except first)
        if (i > 0 && i % 4 === 0) {
            pdf.addPage();
        }

        // Draw label
        await drawLabel(pdf, order, customerName, labelText, xOffset, yOffset, labelWidth, labelHeight, bagNumber, totalBags);

        // Draw cut lines
        if (posOnPage === 0) {
            pdf.setDrawColor(200);
            pdf.setLineDash([3, 3]);
            // Horizontal line
            pdf.line(0, labelHeight, pageWidth, labelHeight);
            // Vertical line
            pdf.line(labelWidth, 0, labelWidth, pageHeight);
            pdf.setLineDash([]);
        }
    }

    // Open PDF in new window
    pdf.output('dataurlnewwindow');
}

async function drawLabel(pdf, order, customerName, labelText, xOffset, yOffset, width, height, bagNumber = 1, totalBags = 1) {
    const centerX = xOffset + width / 2;

    // Order number + timeslot (top)
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    const headerText = `${order.order_number} • ${order.timeslot_label || ''}`;
    pdf.text(headerText, centerX, yOffset + 12, { align: 'center' });

    // Customer name
    pdf.setFontSize(18);
    pdf.setFont('helvetica', 'bold');
    pdf.text(customerName, centerX, yOffset + 24, { align: 'center' });

    // Order contents
    const products = order.products || {};
    const krenten = products.oliebol_krenten || 0;
    const naturel = products.oliebol_naturel || 0;
    const appel = products.appelbeignet || 0;

    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');

    let yPos = yOffset + 34;
    if (krenten > 0) {
        pdf.text(`${krenten}x Rozijnen`, centerX, yPos, { align: 'center' });
        yPos += 5;
    }
    if (naturel > 0) {
        pdf.text(`${naturel}x Naturel`, centerX, yPos, { align: 'center' });
        yPos += 5;
    }
    if (appel > 0) {
        pdf.text(`${appel}x Appel`, centerX, yPos, { align: 'center' });
        yPos += 5;
    }

    // Price
    const total = order.total || 0;
    if (total > 0) {
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'bold');
        pdf.text(`€ ${total.toFixed(2).replace('.', ',')}`, centerX, yPos + 2, { align: 'center' });
    }

    // QR Code
    try {
        const qrDataUrl = await generateQRCode(order.order_number);
        const qrSize = 30;
        pdf.addImage(qrDataUrl, 'PNG', centerX - qrSize/2, yOffset + 55, qrSize, qrSize);
    } catch (error) {
        console.error('QR generation error:', error);
    }

    // Label text (bottom)
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'italic');
    pdf.text(labelText, centerX, yOffset + height - 8, { align: 'center' });
}

function generateQRCode(text) {
    return new Promise((resolve, reject) => {
        try {
            // qrcode-generator library
            const qr = qrcode(0, 'M');
            qr.addData(text);
            qr.make();

            // Create image data URL
            const size = 4; // cell size
            const margin = 2;
            const dataUrl = qr.createDataURL(size, margin);
            resolve(dataUrl);
        } catch (error) {
            reject(error);
        }
    });
}

function rotateImage(dataUrl, degrees) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // For 90° rotation, swap width and height
            if (degrees === 90 || degrees === -90 || degrees === 270) {
                canvas.width = img.height;
                canvas.height = img.width;
            } else {
                canvas.width = img.width;
                canvas.height = img.height;
            }

            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate(degrees * Math.PI / 180);
            ctx.drawImage(img, -img.width / 2, -img.height / 2);

            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = reject;
        img.src = dataUrl;
    });
}

function showError(message) {
    const container = document.getElementById('labelOrdersList');
    if (container) {
        container.innerHTML = `<div class="error">${message}</div>`;
    }
}
