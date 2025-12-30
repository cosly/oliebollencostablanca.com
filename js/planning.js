/**
 * Planning UI - Oliebollen Costa Blanca
 * Simpele weergave: wat, wanneer, hoeveel
 */

import { createPlanning, DEFAULT_PARAMETERS, DEFAULT_FRY_UNITS } from './planning-engine.js';

const API_BASE = '/api';

// State
let currentOrders = [];
let currentParams = { ...DEFAULT_PARAMETERS };
let currentFryUnits = JSON.parse(JSON.stringify(DEFAULT_FRY_UNITS));
let currentPlanning = null;

// =====================
// Initialization
// =====================
document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('tab-planning')) return;

    initParameters();
    initFryUnits();
    initButtons();

    // Load planning when tab is shown
    const planningTabBtn = document.querySelector('[data-tab="planning"]');
    if (planningTabBtn) {
        planningTabBtn.addEventListener('click', () => {
            setTimeout(loadPlanning, 100);
        });
    }
});

function initParameters() {
    // Start tijd
    const startTimeInput = document.getElementById('param_start_time');
    if (startTimeInput) {
        startTimeInput.value = currentParams.start_time || '07:00';
        startTimeInput.addEventListener('change', () => {
            currentParams.start_time = startTimeInput.value;
            recalculate();
        });
    }

    // Mix tijd
    setupSlider('param_mix_time', 'mix_time');

    // Rijstijd
    setupSlider('param_rise_time', 'rise_time');

    // Batch grootte per type
    setupSlider('param_batch_naturel', 'batch_naturel');
    setupSlider('param_batch_rozijnen', 'batch_rozijnen');
    setupSlider('param_batch_appel', 'batch_appel');

    // Frituurtijd
    setupSlider('param_fry_time', 'fry_time');

    // Laden/lossen
    setupSlider('param_load_time', 'load_unload_time', 0.1);
}

function setupSlider(elementId, paramName, step = 1) {
    const slider = document.getElementById(elementId);
    const valueDisplay = document.getElementById(`${elementId}_val`);

    if (slider && valueDisplay) {
        slider.value = currentParams[paramName];
        valueDisplay.textContent = currentParams[paramName];

        slider.addEventListener('input', () => {
            currentParams[paramName] = parseFloat(slider.value);
            valueDisplay.textContent = slider.value;
            recalculate();
        });
    }
}

function initFryUnits() {
    currentFryUnits.forEach((unit, index) => {
        const checkbox = document.getElementById(`unit_${unit.id}`);
        if (checkbox) {
            checkbox.checked = unit.active;
            checkbox.addEventListener('change', () => {
                currentFryUnits[index].active = checkbox.checked;
                recalculate();
            });
        }
    });
}

function initButtons() {
    const refreshBtn = document.getElementById('refreshPlanningBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadPlanning);
    }

    const printBtn = document.getElementById('printRunsheetBtn');
    if (printBtn) {
        printBtn.addEventListener('click', printRunsheet);
    }
}

// =====================
// Data Loading
// =====================
async function loadPlanning() {
    try {
        const response = await fetch(`${API_BASE}/planning-data?date=2025-12-31`);
        if (!response.ok) throw new Error('Failed to load orders');

        const data = await response.json();
        currentOrders = data.orders || [];

        recalculate();
    } catch (error) {
        console.error('Error loading planning:', error);
        showError('Kon planning data niet laden');
    }
}

function recalculate() {
    if (currentOrders.length === 0) return;

    currentPlanning = createPlanning(currentOrders, currentParams, currentFryUnits);
    updateUI();
}

// =====================
// UI Updates
// =====================
function updateUI() {
    if (!currentPlanning) return;

    updateTotals();
    updateCapacity();
    updatePlanningTable();
    updateTaskList();
}

function updateTotals() {
    const t = currentPlanning.totals;

    const setEl = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    setEl('summaryTotaal', t.totaal);
    setEl('summaryPlain', t.naturel);
    setEl('summaryRaisin', t.rozijnen);
    setEl('summaryApple', t.appel);
    setEl('summaryBatches', t.naturelBatches + t.rozijnenBatches + t.appelBatches);
}

function updateCapacity() {
    const c = currentPlanning.capacity;
    const capacityEl = document.getElementById('capacityInfo');
    if (capacityEl) {
        capacityEl.innerHTML = `
            <strong>Capaciteit:</strong> ${c.perBatch} stuks/batch, ${c.perHour} stuks/uur
            (${c.activeUnits} pannen, ${c.cycleTime} min/cyclus)
        `;
    }
}

function updatePlanningTable() {
    const container = document.getElementById('planningTableBody');
    if (!container) return;

    container.innerHTML = '';

    for (const slot of currentPlanning.planning) {
        const row = document.createElement('div');
        row.className = 'planning-slot';

        row.innerHTML = `
            <div class="slot-header">
                <span class="slot-time">${slot.slot}</span>
                <span class="slot-total">${slot.orders.totaal} stuks</span>
            </div>
            <div class="slot-details">
                <div class="slot-orders">
                    <div class="order-count naturel">
                        <span class="count-value">${slot.orders.naturel}</span>
                        <span class="count-label">Naturel</span>
                    </div>
                    <div class="order-count rozijnen">
                        <span class="count-value">${slot.orders.rozijnen}</span>
                        <span class="count-label">Rozijnen</span>
                    </div>
                    <div class="order-count appel">
                        <span class="count-value">${slot.orders.appel}</span>
                        <span class="count-label">Appel</span>
                    </div>
                </div>
                <div class="slot-beslag">
                    <div class="beslag-item naturel">
                        <span class="beslag-type">Naturel:</span>
                        <span class="beslag-batches">${slot.beslag.naturel.batches}x</span>
                        <span class="beslag-time">mix ${slot.beslag.naturel.mixTime}</span>
                    </div>
                    <div class="beslag-item rozijnen">
                        <span class="beslag-type">Rozijnen:</span>
                        <span class="beslag-batches">${slot.beslag.rozijnen.batches}x</span>
                        <span class="beslag-time">mix ${slot.beslag.rozijnen.mixTime}</span>
                    </div>
                    <div class="beslag-item appel">
                        <span class="beslag-type">Appel:</span>
                        <span class="beslag-batches">${slot.beslag.appel.batches}x</span>
                        <span class="beslag-time">mix ${slot.beslag.appel.mixTime}</span>
                    </div>
                </div>
                <div class="slot-bakken">
                    Start bakken: ${slot.bakken.startTime} (${slot.bakken.duur} min)
                </div>
            </div>
        `;

        container.appendChild(row);
    }
}

function updateTaskList() {
    const container = document.getElementById('taskList');
    if (!container) return;

    container.innerHTML = '';

    let currentHour = -1;

    for (const task of currentPlanning.tasks) {
        const taskHour = Math.floor(task.minutes / 60);

        // Uur header
        if (taskHour !== currentHour) {
            currentHour = taskHour;
            const header = document.createElement('div');
            header.className = 'task-hour-header';
            header.textContent = `${taskHour.toString().padStart(2, '0')}:00`;
            container.appendChild(header);
        }

        const taskEl = document.createElement('div');
        taskEl.className = `task-item task-${task.category}${task.early ? ' task-early' : ''}`;
        taskEl.innerHTML = `
            <span class="task-checkbox">${task.early ? '⚠️' : '☐'}</span>
            <span class="task-time">${task.time}</span>
            <span class="task-description">${task.description}</span>
            <span class="task-slot">→ ${task.slot}</span>
        `;

        container.appendChild(taskEl);
    }
}

// =====================
// Print Runsheet
// =====================
function printRunsheet() {
    if (!currentPlanning) return;

    const printWindow = window.open('', '_blank');
    const t = currentPlanning.totals;

    let tasksHtml = '';
    let currentHour = -1;

    for (const task of currentPlanning.tasks) {
        const taskHour = Math.floor(task.minutes / 60);

        if (taskHour !== currentHour) {
            currentHour = taskHour;
            tasksHtml += `<h3 style="margin: 20px 0 10px; border-bottom: 1px solid #ccc;">${taskHour.toString().padStart(2, '0')}:00</h3>`;
        }

        const icons = { naturel: '🟠', rozijnen: '🟣', appel: '🟢', bakken: '🔵' };
        const icon = icons[task.category] || '⚪';
        tasksHtml += `
            <div style="display: flex; gap: 10px; margin: 8px 0; font-size: 14px;">
                <span style="font-size: 18px;">☐</span>
                <span style="font-weight: bold; min-width: 50px;">${task.time}</span>
                <span>${icon} ${task.description}</span>
            </div>
        `;
    }

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Runsheet 31 December 2025</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
                h1 { border-bottom: 2px solid #333; padding-bottom: 10px; }
                .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 20px 0; }
                .summary-item { background: #f5f5f5; padding: 15px; text-align: center; border-radius: 8px; }
                .summary-value { font-size: 24px; font-weight: bold; color: #e67e22; }
                @media print { body { padding: 0; } }
            </style>
        </head>
        <body>
            <h1>🍩 Productieplanning 31 December 2025</h1>

            <div class="summary">
                <div class="summary-item">
                    <div class="summary-value">${t.totaal}</div>
                    <div>Totaal stuks</div>
                </div>
                <div class="summary-item">
                    <div class="summary-value">${t.naturel}</div>
                    <div>Naturel</div>
                </div>
                <div class="summary-item">
                    <div class="summary-value">${t.rozijnen}</div>
                    <div>Rozijnen</div>
                </div>
                <div class="summary-item">
                    <div class="summary-value">${t.appel}</div>
                    <div>Appel</div>
                </div>
            </div>

            <h2>Takenlijst</h2>
            ${tasksHtml}

            <div style="margin-top: 40px; padding-top: 20px; border-top: 2px solid #333; font-size: 12px; color: #666;">
                Gegenereerd: ${new Date().toLocaleString('nl-NL')}
            </div>
        </body>
        </html>
    `);

    printWindow.document.close();
    printWindow.print();
}

function showError(message) {
    const container = document.getElementById('planningTableBody');
    if (container) {
        container.innerHTML = `<div class="error">${message}</div>`;
    }
}
