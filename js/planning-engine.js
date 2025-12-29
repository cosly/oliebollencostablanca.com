/**
 * Planning Engine - Oliebollen Costa Blanca
 * Pure simulation functions for production planning
 * v1.0
 */

// =====================
// Default Parameters
// =====================
export const DEFAULT_PARAMETERS = {
    // Beslag
    batter_batch_size: 60,
    batter_mix_time_min: 15,
    batter_rise_time_min: 45,
    batter_max_age_min: 120,
    batter_ready_margin_min: 10,

    // Scheppen
    scoop_time_sec_balls: 8,
    scoop_time_sec_apple: 12,
    scoop_workers: 2,

    // Frituren
    fry_time_sec_balls: 180,
    fry_time_sec_apple: 150,
    load_unload_sec: 30,
    recovery_after_batches: 6,
    recovery_pause_sec: 120,

    // Inpakken
    pack_time_sec: 20,
    bag_size_balls: 10,
    bag_size_apple: 5,
    pack_workers: 1,

    // Buffer
    buffer_per_hour: 10,

    // Timing
    opening_time: '09:00',
    closing_time: '17:00',
    pre_open_slot: true,
    pre_open_start: '08:00',

    // Initial stock
    initial_stock_plain: 0,
    initial_stock_raisin: 0,
    initial_stock_apple: 0
};

export const DEFAULT_FRY_UNITS = [
    { id: 1, name: 'Pan 1', type: 'fryer', active: true, batch_capacity_balls: 22, batch_capacity_apple: 10 },
    { id: 2, name: 'Pan 2', type: 'fryer', active: true, batch_capacity_balls: 22, batch_capacity_apple: 10 },
    { id: 3, name: 'Pan 3', type: 'fryer', active: true, batch_capacity_balls: 20, batch_capacity_apple: 8 },
    { id: 4, name: 'Wok', type: 'wok', active: true, batch_capacity_balls: 25, batch_capacity_apple: 12 }
];

// =====================
// Time Utilities
// =====================
function parseTime(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

function formatTime(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function formatDateTime(date, minutes) {
    return `${date}T${formatTime(minutes)}`;
}

// =====================
// Slot Generation
// =====================
export function generateSlots(params) {
    const slots = [];
    const openingMin = parseTime(params.opening_time);
    const closingMin = parseTime(params.closing_time);

    // Pre-opening slot
    if (params.pre_open_slot) {
        const preOpenMin = parseTime(params.pre_open_start);
        slots.push({
            id: 'pre-open',
            start_time: params.pre_open_start,
            end_time: params.opening_time,
            start_min: preOpenMin,
            end_min: openingMin,
            is_pre_open: true
        });
    }

    // Regular slots (1 hour each)
    for (let startMin = openingMin; startMin < closingMin; startMin += 60) {
        slots.push({
            id: formatTime(startMin),
            start_time: formatTime(startMin),
            end_time: formatTime(startMin + 60),
            start_min: startMin,
            end_min: startMin + 60,
            is_pre_open: false
        });
    }

    return slots;
}

// =====================
// Capacity Calculations
// =====================
export function calculateCapacities(params, fryUnits) {
    const activeUnits = fryUnits.filter(u => u.active);

    // Scheppen capacity (stuks per uur)
    const scoop_balls = params.scoop_workers * (3600 / params.scoop_time_sec_balls);
    const scoop_apple = params.scoop_workers * (3600 / params.scoop_time_sec_apple);

    // Frituren capacity (stuks per uur)
    // Include recovery time overhead
    const base_cycle_balls = params.fry_time_sec_balls + params.load_unload_sec;
    const base_cycle_apple = params.fry_time_sec_apple + params.load_unload_sec;

    // Add recovery overhead
    const recovery_overhead = params.recovery_pause_sec / params.recovery_after_batches;
    const effective_cycle_balls = base_cycle_balls + recovery_overhead;
    const effective_cycle_apple = base_cycle_apple + recovery_overhead;

    const batches_per_hour_balls = Math.floor(3600 / effective_cycle_balls);
    const batches_per_hour_apple = Math.floor(3600 / effective_cycle_apple);

    const fry_balls = activeUnits.reduce((sum, u) => sum + batches_per_hour_balls * u.batch_capacity_balls, 0);
    const fry_apple = activeUnits.reduce((sum, u) => sum + batches_per_hour_apple * u.batch_capacity_apple, 0);

    // Inpakken capacity (stuks per uur)
    const bags_per_hour = params.pack_workers * (3600 / params.pack_time_sec);
    const pack_balls = bags_per_hour * params.bag_size_balls;
    const pack_apple = bags_per_hour * params.bag_size_apple;

    return {
        scoop: { balls: Math.floor(scoop_balls), apple: Math.floor(scoop_apple) },
        fry: { balls: Math.floor(fry_balls), apple: Math.floor(fry_apple) },
        pack: { balls: Math.floor(pack_balls), apple: Math.floor(pack_apple) },
        // Combined for each product type
        balls: Math.min(Math.floor(scoop_balls), Math.floor(fry_balls), Math.floor(pack_balls)),
        apple: Math.min(Math.floor(scoop_apple), Math.floor(fry_apple), Math.floor(pack_apple))
    };
}

// =====================
// Orders Aggregation
// =====================
export function aggregateOrdersToSlots(orders, slots) {
    const slotDemand = {};

    // Initialize all slots with zero demand
    for (const slot of slots) {
        slotDemand[slot.id] = {
            plain: 0,
            raisin: 0,
            apple: 0
        };
    }

    // Aggregate orders into slots
    for (const order of orders) {
        const hour = order.pickup_hour || order.hour;
        const slotId = formatTime(hour * 60);

        if (slotDemand[slotId]) {
            const productType = mapProductToType(order.product_id);
            slotDemand[slotId][productType] += order.quantity;
        }
    }

    return slotDemand;
}

function mapProductToType(productId) {
    // Map product IDs to batter types
    const mapping = {
        'rozijnen': 'raisin',
        'naturel': 'plain',
        'appelbeignet': 'apple',
        // Fallback for numeric IDs
        1: 'raisin',
        2: 'plain',
        3: 'apple'
    };
    return mapping[productId] || 'plain';
}

// =====================
// Batter Planning
// =====================
export function planBatterBatches(slots, slotDemand, params) {
    const batches = [];
    let batchId = 1;

    const batterTypes = ['plain', 'raisin', 'apple'];

    for (const type of batterTypes) {
        // Calculate total needed per slot
        for (const slot of slots) {
            const demand = slotDemand[slot.id]?.[type] || 0;
            if (demand === 0) continue;

            // How many batches needed for this slot?
            const batchesNeeded = Math.ceil(demand / params.batter_batch_size);

            for (let i = 0; i < batchesNeeded; i++) {
                const readyTime = slot.start_min - params.batter_ready_margin_min;
                const mixEndTime = readyTime - params.batter_rise_time_min;
                const mixStartTime = mixEndTime - params.batter_mix_time_min;
                const expiresTime = readyTime + params.batter_max_age_min;

                batches.push({
                    id: `${type.charAt(0).toUpperCase()}${batchId++}`,
                    type: type,
                    yield: params.batter_batch_size,
                    start_mix_min: mixStartTime,
                    end_mix_min: mixEndTime,
                    ready_min: readyTime,
                    expires_min: expiresTime,
                    start_mix_time: formatTime(mixStartTime),
                    end_mix_time: formatTime(mixEndTime),
                    ready_time: formatTime(readyTime),
                    expires_time: formatTime(expiresTime),
                    allocated_slot: slot.id,
                    warnings: []
                });
            }
        }
    }

    // Sort by mix start time
    batches.sort((a, b) => a.start_mix_min - b.start_mix_min);

    // Re-number after sorting
    batches.forEach((b, i) => {
        b.id = `${b.type.charAt(0).toUpperCase()}${i + 1}`;
    });

    return batches;
}

// =====================
// Batter Pool Tracking
// =====================
function createBatterPool(params) {
    return {
        plain: 0,
        raisin: 0,
        apple: 0
    };
}

function updateBatterPool(pool, batches, currentMin, params) {
    // Add ready batches
    for (const batch of batches) {
        if (batch.ready_min <= currentMin && !batch.added) {
            pool[batch.type] += batch.yield;
            batch.added = true;
        }
        // Remove expired batches
        if (batch.expires_min <= currentMin && !batch.expired) {
            pool[batch.type] = Math.max(0, pool[batch.type] - batch.remaining || 0);
            batch.expired = true;
            batch.warnings.push('Beslag verlopen');
        }
    }
    return pool;
}

// =====================
// Production Simulation
// =====================
export function simulateProduction(slots, slotDemand, batches, capacities, params) {
    const results = [];
    const stock = {
        plain: params.initial_stock_plain || 0,
        raisin: params.initial_stock_raisin || 0,
        apple: params.initial_stock_apple || 0
    };
    const batterPool = createBatterPool(params);

    // Track batch usage
    const batchesCopy = batches.map(b => ({ ...b, added: false, expired: false, remaining: b.yield }));

    for (const slot of slots) {
        // Update batter pool for this slot
        updateBatterPool(batterPool, batchesCopy, slot.start_min, params);

        const demand = slotDemand[slot.id] || { plain: 0, raisin: 0, apple: 0 };

        // Calculate production for each product
        const production = {};
        const shortages = {};
        const bottlenecks = {};

        for (const type of ['plain', 'raisin', 'apple']) {
            const productDemand = demand[type] + params.buffer_per_hour;
            const isApple = type === 'apple';
            const capType = isApple ? 'apple' : 'balls';

            // Available capacity
            const capScoop = capacities.scoop[capType];
            const capFry = capacities.fry[capType];
            const capPack = capacities.pack[capType];
            const capBatter = batterPool[type];

            // Find limiting factor
            const limits = [
                { name: 'scoop', value: capScoop },
                { name: 'fry', value: capFry },
                { name: 'pack', value: capPack },
                { name: 'batter', value: capBatter }
            ];

            const minLimit = limits.reduce((min, l) => l.value < min.value ? l : min, limits[0]);
            const maxProduction = minLimit.value;

            // Actual production (limited by demand + buffer and capacity)
            const targetProduction = slot.is_pre_open ? params.buffer_per_hour * 3 : productDemand;
            production[type] = Math.min(targetProduction, maxProduction);

            // Consume from batter pool
            batterPool[type] = Math.max(0, batterPool[type] - production[type]);

            // Update stock
            const actualDemand = slot.is_pre_open ? 0 : demand[type];
            stock[type] = stock[type] + production[type] - actualDemand;

            // Check for shortage
            if (stock[type] < 0) {
                shortages[type] = Math.abs(stock[type]);
                stock[type] = 0;
            } else {
                shortages[type] = 0;
            }

            // Record bottleneck if production limited
            if (production[type] < productDemand) {
                bottlenecks[type] = minLimit.name;
            } else {
                bottlenecks[type] = null;
            }
        }

        // Calculate utilization
        const utilization = {
            scoop: Math.round(((production.plain + production.raisin) / capacities.scoop.balls + production.apple / capacities.scoop.apple) / 2 * 100),
            fry: Math.round(((production.plain + production.raisin) / capacities.fry.balls + production.apple / capacities.fry.apple) / 2 * 100),
            pack: Math.round(((production.plain + production.raisin) / capacities.pack.balls + production.apple / capacities.pack.apple) / 2 * 100)
        };

        results.push({
            slot_id: slot.id,
            slot: slot,
            demand: { ...demand },
            production: { ...production },
            stock: { ...stock },
            shortages: { ...shortages },
            bottlenecks: { ...bottlenecks },
            utilization: utilization,
            has_shortage: Object.values(shortages).some(s => s > 0),
            has_bottleneck: Object.values(bottlenecks).some(b => b !== null)
        });
    }

    return results;
}

// =====================
// Warning Detection
// =====================
export function detectWarnings(slotResults, batches, params) {
    const warnings = [];

    // Check slot results for issues
    for (const result of slotResults) {
        // Shortage warnings
        for (const [type, shortage] of Object.entries(result.shortages)) {
            if (shortage > 0) {
                warnings.push({
                    severity: 'critical',
                    time: result.slot.start_time,
                    code: 'SHORTAGE',
                    message: `Tekort ${type}: ${shortage} stuks`,
                    slot_id: result.slot_id
                });
            }
        }

        // Bottleneck warnings
        for (const [type, bottleneck] of Object.entries(result.bottlenecks)) {
            if (bottleneck) {
                warnings.push({
                    severity: 'warning',
                    time: result.slot.start_time,
                    code: 'BOTTLENECK',
                    message: `Bottleneck ${type}: ${bottleneck} limiteert productie`,
                    slot_id: result.slot_id
                });
            }
        }

        // High utilization warning
        if (result.utilization.fry > 90) {
            warnings.push({
                severity: 'info',
                time: result.slot.start_time,
                code: 'HIGH_UTIL',
                message: `Frituur ${result.utilization.fry}% bezet`,
                slot_id: result.slot_id
            });
        }
    }

    // Check batch warnings
    for (const batch of batches) {
        if (batch.start_mix_min < parseTime('06:00')) {
            warnings.push({
                severity: 'warning',
                time: batch.start_mix_time,
                code: 'EARLY_START',
                message: `Batch ${batch.id} moet zeer vroeg starten (${batch.start_mix_time})`,
                batch_id: batch.id
            });
        }

        if (batch.warnings && batch.warnings.length > 0) {
            for (const w of batch.warnings) {
                warnings.push({
                    severity: 'warning',
                    time: batch.expires_time,
                    code: 'BATCH_ISSUE',
                    message: `Batch ${batch.id}: ${w}`,
                    batch_id: batch.id
                });
            }
        }
    }

    // Sort by severity then time
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    warnings.sort((a, b) => {
        if (severityOrder[a.severity] !== severityOrder[b.severity]) {
            return severityOrder[a.severity] - severityOrder[b.severity];
        }
        return parseTime(a.time) - parseTime(b.time);
    });

    return warnings;
}

// =====================
// Runsheet Generation
// =====================
export function generateRunsheet(date, slotResults, batches, params) {
    const tasks = [];

    // Calculate totals
    const totals = {
        plain: 0,
        raisin: 0,
        apple: 0
    };
    for (const result of slotResults) {
        if (!result.slot.is_pre_open) {
            totals.plain += result.demand.plain;
            totals.raisin += result.demand.raisin;
            totals.apple += result.demand.apple;
        }
    }
    const totalOrders = totals.plain + totals.raisin + totals.apple;
    const totalBatches = batches.length;

    // Pre-start tasks
    const firstBatch = batches[0];
    if (firstBatch) {
        const oilHeatTime = firstBatch.start_mix_min - 15;
        tasks.push({
            time: formatTime(oilHeatTime),
            time_min: oilHeatTime,
            type: 'prep',
            description: 'Olie opwarmen alle pannen',
            done: false
        });
    }

    // Batch tasks
    for (const batch of batches) {
        tasks.push({
            time: batch.start_mix_time,
            time_min: batch.start_mix_min,
            type: 'mix',
            description: `Mix batch ${batch.id} (${batch.type}, ${batch.yield} stuks)`,
            done: false
        });

        tasks.push({
            time: batch.ready_time,
            time_min: batch.ready_min,
            type: 'check',
            description: `Check rijzen ${batch.id} - klaar om ${batch.ready_time}`,
            done: false
        });
    }

    // Slot production tasks
    for (const result of slotResults) {
        const slotTotal = result.production.plain + result.production.raisin + result.production.apple;
        if (slotTotal > 0) {
            const desc = result.slot.is_pre_open
                ? `START PRODUCTIE - buffer opbouwen. Target: ${result.production.raisin} rozijn, ${result.production.plain} naturel, ${result.production.apple} appel`
                : `${result.slot.start_time === params.opening_time ? 'OPENING - ' : ''}Productie slot. Vraag: ${result.demand.raisin + result.demand.plain + result.demand.apple} stuks`;

            tasks.push({
                time: result.slot.start_time,
                time_min: result.slot.start_min,
                type: result.slot.is_pre_open ? 'production_start' : 'production',
                description: desc,
                done: false,
                warning: result.has_bottleneck ? `Let op: ${Object.entries(result.bottlenecks).filter(([k, v]) => v).map(([k, v]) => `${k}: ${v}`).join(', ')}` : null
            });
        }
    }

    // Sort by time
    tasks.sort((a, b) => a.time_min - b.time_min);

    // Collect warnings
    const warnings = [];
    for (const result of slotResults) {
        if (result.has_shortage) {
            warnings.push({
                severity: 'critical',
                message: `${result.slot.start_time}-${result.slot.end_time}: Tekort verwacht`
            });
        }
        if (result.has_bottleneck) {
            warnings.push({
                severity: 'warning',
                message: `${result.slot.start_time}-${result.slot.end_time}: Bottleneck (${Object.entries(result.bottlenecks).filter(([k, v]) => v).map(([k, v]) => v).join(', ')})`
            });
        }
    }

    return {
        date: date,
        generated_at: new Date().toISOString(),
        summary: {
            total_orders: totalOrders,
            by_product: totals,
            total_batches: totalBatches,
            batches_by_type: {
                plain: batches.filter(b => b.type === 'plain').length,
                raisin: batches.filter(b => b.type === 'raisin').length,
                apple: batches.filter(b => b.type === 'apple').length
            }
        },
        tasks: tasks,
        warnings: warnings
    };
}

// =====================
// Main Simulation Entry Point
// =====================
export function simulateDay(date, orders, params = DEFAULT_PARAMETERS, fryUnits = DEFAULT_FRY_UNITS) {
    // Generate time slots
    const slots = generateSlots(params);

    // Aggregate orders to slots
    const slotDemand = aggregateOrdersToSlots(orders, slots);

    // Calculate capacities
    const capacities = calculateCapacities(params, fryUnits);

    // Plan batter batches
    const batches = planBatterBatches(slots, slotDemand, params);

    // Simulate production
    const slotResults = simulateProduction(slots, slotDemand, batches, capacities, params);

    // Detect warnings
    const warnings = detectWarnings(slotResults, batches, params);

    // Generate runsheet
    const runsheet = generateRunsheet(date, slotResults, batches, params);

    return {
        date: date,
        slots: slotResults,
        batches: batches,
        capacities: capacities,
        warnings: warnings,
        runsheet: runsheet
    };
}
