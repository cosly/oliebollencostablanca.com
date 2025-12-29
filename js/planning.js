/**
 * Planning UI - Oliebollen Costa Blanca
 * Connects UI to planning engine
 * v1.0
 */

import {
    simulateDay,
    DEFAULT_PARAMETERS,
    DEFAULT_FRY_UNITS
} from './planning-engine.js';

const API_BASE = '/api';

// State
let currentDate = null;
let currentOrders = [];
let currentParams = { ...DEFAULT_PARAMETERS };
let currentFryUnits = JSON.parse(JSON.stringify(DEFAULT_FRY_UNITS));
let currentResult = null;
let demandChart = null;
let stockChart = null;

// =====================
// Initialization
// =====================
document.addEventListener('DOMContentLoaded', () => {
    // Only initialize if planning tab exists
    if (!document.getElementById('tab-planning')) return;

    initDatePicker();
    initParameterSliders();
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

function initDatePicker() {
    const datePicker = document.getElementById('planningDate');
    if (!datePicker) return;

    // Default to December 31, 2025 (or next production day)
    const today = new Date();
    const defaultDate = new Date(2025, 11, 31); // Dec 31, 2025

    datePicker.value = defaultDate.toISOString().split('T')[0];
    currentDate = datePicker.value;

    datePicker.addEventListener('change', () => {
        currentDate = datePicker.value;
        loadPlanning();
    });
}

function initParameterSliders() {
    const sliders = [
        { id: 'param_rise_time', param: 'batter_rise_time_min' },
        { id: 'param_mix_time', param: 'batter_mix_time_min' },
        { id: 'param_max_age', param: 'batter_max_age_min' },
        { id: 'param_batch_size', param: 'batter_batch_size' },
        { id: 'param_fry_time', param: 'fry_time_sec_balls' },
        { id: 'param_load_time', param: 'load_unload_sec' },
        { id: 'param_scoop_workers', param: 'scoop_workers' },
        { id: 'param_pack_workers', param: 'pack_workers' },
        { id: 'param_buffer', param: 'buffer_per_hour' }
    ];

    sliders.forEach(({ id, param }) => {
        const slider = document.getElementById(id);
        const valueDisplay = document.getElementById(`${id}_val`);

        if (slider && valueDisplay) {
            // Set initial value
            slider.value = currentParams[param];
            valueDisplay.textContent = currentParams[param];

            // Update on change
            slider.addEventListener('input', () => {
                currentParams[param] = parseInt(slider.value);
                valueDisplay.textContent = slider.value;
                recalculate();
            });
        }
    });

    // Pre-open checkbox
    const preOpenCheckbox = document.getElementById('param_pre_open');
    if (preOpenCheckbox) {
        preOpenCheckbox.checked = currentParams.pre_open_slot;
        preOpenCheckbox.addEventListener('change', () => {
            currentParams.pre_open_slot = preOpenCheckbox.checked;
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
    if (!currentDate) return;

    try {
        // Fetch orders for the date
        const response = await fetch(`${API_BASE}/planning-data?date=${currentDate}`);
        if (!response.ok) throw new Error('Failed to load orders');

        const data = await response.json();
        currentOrders = data.orders || [];

        // Update summary
        updateSummary(data);

        // Run simulation
        recalculate();
    } catch (error) {
        console.error('Error loading planning:', error);
        showError('Kon planning data niet laden');
    }
}

function recalculate() {
    if (!currentDate) return;

    // Run simulation
    currentResult = simulateDay(currentDate, currentOrders, currentParams, currentFryUnits);

    // Update UI
    updateTable(currentResult);
    updateBatterTimeline(currentResult);
    updateCharts(currentResult);
    updateWarnings(currentResult);
}

// =====================
// UI Updates
// =====================
function updateSummary(data) {
    const totals = data.totals || { plain: 0, raisin: 0, apple: 0 };

    document.getElementById('summaryOrders').textContent = data.order_count || 0;
    document.getElementById('summaryRaisin').textContent = totals.raisin || 0;
    document.getElementById('summaryPlain').textContent = totals.plain || 0;
    document.getElementById('summaryApple').textContent = totals.apple || 0;
}

function updateTable(result) {
    const tbody = document.getElementById('planningTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    for (const slot of result.slots) {
        const tr = document.createElement('tr');

        // Add classes for warnings
        if (slot.has_shortage) tr.classList.add('shortage-row');
        if (slot.has_bottleneck) tr.classList.add('bottleneck-row');

        const demandTotal = slot.demand.plain + slot.demand.raisin + slot.demand.apple;
        const prodTotal = slot.production.plain + slot.production.raisin + slot.production.apple;
        const stockTotal = slot.stock.plain + slot.stock.raisin + slot.stock.apple;

        // Bottleneck display
        const bottlenecks = Object.entries(slot.bottlenecks)
            .filter(([k, v]) => v)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ') || '-';

        tr.innerHTML = `
            <td class="slot-cell">${slot.slot.is_pre_open ? 'Pre' : slot.slot_id}</td>
            <td class="demand-cell">
                <span class="demand-breakdown" title="R:${slot.demand.raisin} N:${slot.demand.plain} A:${slot.demand.apple}">
                    ${demandTotal}
                </span>
            </td>
            <td class="production-cell">
                <span class="production-breakdown" title="R:${slot.production.raisin} N:${slot.production.plain} A:${slot.production.apple}">
                    ${prodTotal}
                </span>
            </td>
            <td class="stock-cell ${stockTotal < 0 ? 'negative' : ''}">
                ${stockTotal}
            </td>
            <td class="bottleneck-cell ${slot.has_bottleneck ? 'has-bottleneck' : ''}">
                ${bottlenecks}
            </td>
        `;

        tbody.appendChild(tr);
    }

    // Update batch count in summary
    document.getElementById('summaryBatches').textContent = result.batches.length;
}

function updateBatterTimeline(result) {
    const container = document.getElementById('batterTimeline');
    if (!container) return;

    container.innerHTML = '';

    // Create timeline grid
    const timeline = document.createElement('div');
    timeline.className = 'timeline-grid';

    // Time header (6:00 - 17:00)
    const header = document.createElement('div');
    header.className = 'timeline-header';
    for (let h = 6; h <= 17; h++) {
        const hourMark = document.createElement('span');
        hourMark.className = 'hour-mark';
        hourMark.textContent = `${h.toString().padStart(2, '0')}:00`;
        header.appendChild(hourMark);
    }
    timeline.appendChild(header);

    // Batch rows by type
    const types = ['plain', 'raisin', 'apple'];
    const typeLabels = { plain: 'Naturel', raisin: 'Rozijnen', apple: 'Appel' };
    const typeColors = { plain: '#3498db', raisin: '#9b59b6', apple: '#27ae60' };

    types.forEach(type => {
        const typeBatches = result.batches.filter(b => b.type === type);
        if (typeBatches.length === 0) return;

        const row = document.createElement('div');
        row.className = 'timeline-row';

        const label = document.createElement('span');
        label.className = 'timeline-label';
        label.textContent = typeLabels[type];
        row.appendChild(label);

        const track = document.createElement('div');
        track.className = 'timeline-track';

        typeBatches.forEach(batch => {
            const bar = document.createElement('div');
            bar.className = 'batch-bar';
            bar.style.backgroundColor = typeColors[type];

            // Position based on time (6:00 = 0%, 17:00 = 100%)
            const startPercent = (batch.start_mix_min - 360) / (17 * 60 - 360) * 100;
            const endPercent = (batch.ready_min - 360) / (17 * 60 - 360) * 100;
            const width = endPercent - startPercent;

            bar.style.left = `${Math.max(0, startPercent)}%`;
            bar.style.width = `${Math.min(100, width)}%`;
            bar.title = `${batch.id}: Mix ${batch.start_mix_time}, Klaar ${batch.ready_time}`;
            bar.textContent = batch.id;

            track.appendChild(bar);
        });

        row.appendChild(track);
        timeline.appendChild(row);
    });

    container.appendChild(timeline);
}

function updateCharts(result) {
    const labels = result.slots.map(s => s.slot.is_pre_open ? 'Pre' : s.slot_id);

    // Demand vs Production chart
    const demandCtx = document.getElementById('demandProductionChart');
    if (demandCtx) {
        const demandData = result.slots.map(s => s.demand.plain + s.demand.raisin + s.demand.apple);
        const prodData = result.slots.map(s => s.production.plain + s.production.raisin + s.production.apple);

        if (demandChart) demandChart.destroy();

        demandChart = new Chart(demandCtx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Vraag',
                        data: demandData,
                        borderColor: '#e74c3c',
                        backgroundColor: 'rgba(231, 76, 60, 0.1)',
                        fill: true
                    },
                    {
                        label: 'Productie',
                        data: prodData,
                        borderColor: '#27ae60',
                        backgroundColor: 'rgba(39, 174, 96, 0.1)',
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } },
                scales: { y: { beginAtZero: true } }
            }
        });
    }

    // Stock chart
    const stockCtx = document.getElementById('stockChart');
    if (stockCtx) {
        const stockData = result.slots.map(s => s.stock.plain + s.stock.raisin + s.stock.apple);

        if (stockChart) stockChart.destroy();

        stockChart = new Chart(stockCtx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Voorraad',
                        data: stockData,
                        borderColor: '#3498db',
                        backgroundColor: 'rgba(52, 152, 219, 0.1)',
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } },
                scales: { y: { beginAtZero: true } }
            }
        });
    }
}

function updateWarnings(result) {
    const container = document.getElementById('planningWarnings');
    if (!container) return;

    if (result.warnings.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    container.innerHTML = '';

    result.warnings.forEach(warning => {
        const div = document.createElement('div');
        div.className = `warning-item ${warning.severity}`;

        const icon = warning.severity === 'critical' ? '🔴' :
                    warning.severity === 'warning' ? '🟠' : '🔵';

        div.innerHTML = `
            <span class="warning-icon">${icon}</span>
            <span class="warning-time">${warning.time}</span>
            <span class="warning-message">${warning.message}</span>
        `;

        container.appendChild(div);
    });
}

// =====================
// Print Runsheet
// =====================
function printRunsheet() {
    if (!currentResult) return;

    const runsheet = currentResult.runsheet;
    const container = document.getElementById('runsheetPrint');
    if (!container) return;

    // Generate runsheet HTML
    container.innerHTML = `
        <div class="runsheet">
            <div class="runsheet-header">
                <h1>PRODUCTIEPLANNING - ${formatDateNL(runsheet.date)}</h1>
                <p>Gegenereerd: ${new Date(runsheet.generated_at).toLocaleString('nl-NL')}</p>
            </div>

            <div class="runsheet-summary">
                <h2>SAMENVATTING</h2>
                <p>Totaal orders: <strong>${runsheet.summary.total_orders} stuks</strong></p>
                <p>Rozijnen: ${runsheet.summary.by_product.raisin} | Naturel: ${runsheet.summary.by_product.plain} | Appel: ${runsheet.summary.by_product.apple}</p>
                <p>Beslag batches: ${runsheet.summary.total_batches} (${runsheet.summary.batches_by_type.plain} plain, ${runsheet.summary.batches_by_type.raisin} rozijn, ${runsheet.summary.batches_by_type.apple} appel)</p>
            </div>

            <div class="runsheet-tasks">
                <h2>TAKEN</h2>
                ${runsheet.tasks.map(task => `
                    <div class="task-item ${task.type}">
                        <span class="task-checkbox">☐</span>
                        <span class="task-time">${task.time}</span>
                        <span class="task-description">${task.description}</span>
                        ${task.warning ? `<span class="task-warning">⚠️ ${task.warning}</span>` : ''}
                    </div>
                `).join('')}
            </div>

            ${runsheet.warnings.length > 0 ? `
                <div class="runsheet-warnings">
                    <h2>WAARSCHUWINGEN</h2>
                    ${runsheet.warnings.map(w => `
                        <p class="${w.severity}">${w.severity === 'critical' ? '🔴' : '🟠'} ${w.message}</p>
                    `).join('')}
                </div>
            ` : ''}
        </div>
    `;

    // Print
    window.print();
}

function formatDateNL(dateStr) {
    const date = new Date(dateStr);
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('nl-NL', options);
}

function showError(message) {
    const tbody = document.getElementById('planningTableBody');
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="5" class="error">${message}</td></tr>`;
    }
}
