/**
 * Planning Engine - Oliebollen Costa Blanca
 * Simpele berekening: hoeveel beslag, wanneer mixen, wanneer bakken
 */

// =====================
// Default Parameters
// =====================
export const DEFAULT_PARAMETERS = {
    // Beslag
    mix_time: 15,                // minuten om te mixen
    rise_time: 45,               // minuten rijzen (alleen oliebollen)

    // Batch grootte per type
    batch_naturel: 20,           // stuks per batch naturel beslag
    batch_rozijnen: 20,          // stuks per batch rozijnen beslag
    batch_appel: 20,             // stuks per batch appel beslag

    // Frituren
    fry_time: 3,                 // minuten per bak
    load_unload_time: 0.5,       // minuten laden/lossen

    // Tijden
    start_time: '07:00',         // productie start
    opening_time: '09:00',       // eerste slot
    closing_time: '17:00',       // laatste slot
};

// Default frituur units
export const DEFAULT_FRY_UNITS = [
    { id: 'pan1', name: 'Pan 1', capacity: 22, active: true },
    { id: 'pan2', name: 'Pan 2', capacity: 22, active: true },
    { id: 'pan3', name: 'Pan 3', capacity: 20, active: true },
    { id: 'wok', name: 'Wok', capacity: 25, active: true }
];

// =====================
// Main Planning Function
// =====================
export function createPlanning(orders, params = DEFAULT_PARAMETERS, fryUnits = DEFAULT_FRY_UNITS) {
    // Bereken capaciteit
    const activeUnits = fryUnits.filter(u => u.active);
    const capacityPerBatch = activeUnits.reduce((sum, u) => sum + u.capacity, 0);
    const cycleTime = params.fry_time + params.load_unload_time;
    const batchesPerHour = Math.floor(60 / cycleTime);
    const capacityPerHour = batchesPerHour * capacityPerBatch;

    // Start tijd in minuten
    const startMinutes = timeToMinutes(params.start_time || '07:00');

    // Groepeer orders per tijdslot
    const slots = groupOrdersBySlot(orders);

    // Bereken planning per slot
    const planning = [];
    const tasks = []; // Chronologische takenlijst

    for (const [slotTime, slotOrders] of Object.entries(slots).sort()) {
        const slotMinutes = timeToMinutes(slotTime);

        // Tel per productsoort
        const naturel = slotOrders.plain;
        const rozijnen = slotOrders.raisin;
        const appel = slotOrders.apple;
        const totaal = naturel + rozijnen + appel;

        // Bereken batches beslag nodig (3 aparte beslagsoorten)
        const naturelBatches = naturel > 0 ? Math.ceil(naturel / params.batch_naturel) : 0;
        const rozijnenBatches = rozijnen > 0 ? Math.ceil(rozijnen / params.batch_rozijnen) : 0;
        const appelBatches = appel > 0 ? Math.ceil(appel / params.batch_appel) : 0;

        // Bereken tijden
        // Naturel beslag: mix + rijzen vooraf
        const naturelMixTime = slotMinutes - params.rise_time - params.mix_time;

        // Rozijnen beslag: mix + rijzen vooraf
        const rozijnenMixTime = slotMinutes - params.rise_time - params.mix_time;

        // Appelbeslag: alleen mix vooraf (geen rijzen)
        const appelMixTime = slotMinutes - params.mix_time;

        // Baktijd berekenen
        const bakBatches = Math.ceil(totaal / capacityPerBatch);
        const bakTijd = bakBatches * cycleTime;
        const startBakken = slotMinutes - bakTijd;

        const slotPlanning = {
            slot: slotTime,
            slotMinutes,
            orders: {
                naturel: naturel,
                rozijnen: rozijnen,
                appel: appel,
                totaal: totaal
            },
            beslag: {
                naturel: {
                    batches: naturelBatches,
                    mixTime: minutesToTime(naturelMixTime),
                    mixMinutes: naturelMixTime
                },
                rozijnen: {
                    batches: rozijnenBatches,
                    mixTime: minutesToTime(rozijnenMixTime),
                    mixMinutes: rozijnenMixTime
                },
                appel: {
                    batches: appelBatches,
                    mixTime: minutesToTime(appelMixTime),
                    mixMinutes: appelMixTime
                }
            },
            bakken: {
                startTime: minutesToTime(startBakken),
                startMinutes: startBakken,
                batches: bakBatches,
                duur: Math.round(bakTijd)
            }
        };

        planning.push(slotPlanning);

        // Voeg taken toe aan chronologische lijst
        if (naturelBatches > 0) {
            tasks.push({
                time: minutesToTime(naturelMixTime),
                minutes: naturelMixTime,
                type: 'mix',
                description: `Mix ${naturelBatches}x naturel beslag (${naturel} stuks)`,
                slot: slotTime,
                category: 'naturel',
                early: naturelMixTime < startMinutes
            });
        }

        if (rozijnenBatches > 0) {
            tasks.push({
                time: minutesToTime(rozijnenMixTime),
                minutes: rozijnenMixTime,
                type: 'mix',
                description: `Mix ${rozijnenBatches}x rozijnen beslag (${rozijnen} stuks)`,
                slot: slotTime,
                category: 'rozijnen',
                early: rozijnenMixTime < startMinutes
            });
        }

        if (appelBatches > 0) {
            tasks.push({
                time: minutesToTime(appelMixTime),
                minutes: appelMixTime,
                type: 'mix',
                description: `Mix ${appelBatches}x appelbeslag (${appel} stuks)`,
                slot: slotTime,
                category: 'appel',
                early: appelMixTime < startMinutes
            });
        }

        tasks.push({
            time: minutesToTime(startBakken),
            minutes: startBakken,
            type: 'bak',
            description: `Start bakken voor ${slotTime}: ${totaal} stuks`,
            slot: slotTime,
            category: 'bakken',
            early: startBakken < startMinutes
        });
    }

    // Sorteer taken op tijd
    tasks.sort((a, b) => a.minutes - b.minutes);

    // Bereken totalen
    const totals = {
        naturel: planning.reduce((sum, s) => sum + s.orders.naturel, 0),
        rozijnen: planning.reduce((sum, s) => sum + s.orders.rozijnen, 0),
        appel: planning.reduce((sum, s) => sum + s.orders.appel, 0),
        totaal: planning.reduce((sum, s) => sum + s.orders.totaal, 0),
        naturelBatches: planning.reduce((sum, s) => sum + s.beslag.naturel.batches, 0),
        rozijnenBatches: planning.reduce((sum, s) => sum + s.beslag.rozijnen.batches, 0),
        appelBatches: planning.reduce((sum, s) => sum + s.beslag.appel.batches, 0)
    };

    return {
        date: '2025-12-31',
        parameters: params,
        capacity: {
            perBatch: capacityPerBatch,
            perHour: capacityPerHour,
            cycleTime: cycleTime,
            activeUnits: activeUnits.length
        },
        totals,
        planning,
        tasks
    };
}

// =====================
// Helper Functions
// =====================
function groupOrdersBySlot(orders) {
    const slots = {};

    for (const order of orders) {
        const hour = order.pickup_hour;
        const slotTime = `${hour.toString().padStart(2, '0')}:00`;

        if (!slots[slotTime]) {
            slots[slotTime] = { plain: 0, raisin: 0, apple: 0 };
        }

        const type = order.product_id;
        if (type === 'plain') slots[slotTime].plain += order.quantity;
        else if (type === 'raisin') slots[slotTime].raisin += order.quantity;
        else if (type === 'apple') slots[slotTime].apple += order.quantity;
    }

    return slots;
}

function timeToMinutes(time) {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
}

function minutesToTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}
