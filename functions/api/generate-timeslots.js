// ===== CORS Utilities =====
const ALLOWED_ORIGINS = [
    'http://localhost:8081',
    'http://localhost:8080',
    'http://127.0.0.1:8081',
    'http://127.0.0.1:8080',
    'https://oliebollencostablanca.com',
    'https://www.oliebollencostablanca.com'
];

function corsHeaders(request) {
    const origin = request?.headers?.get('Origin') || '*';
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400'
    };
}

// POST /api/generate-timeslots - Generate timeslots based on configuration
export async function onRequestPost(context) {
    const { env, request } = context;

    try {
        // Get configuration
        const { results: configResults } = await env.DB.prepare(
            `SELECT key, value FROM config WHERE key IN ('day_start_time', 'day_end_time', 'slot_duration_minutes', 'default_capacity_krenten', 'default_capacity_naturel', 'default_capacity_appelbeignet')`
        ).all();

        const config = {};
        configResults.forEach(row => {
            config[row.key] = row.value;
        });

        const startTime = config.day_start_time || '10:00';
        const endTime = config.day_end_time || '18:00';
        const duration = parseInt(config.slot_duration_minutes) || 30;
        const capKrenten = parseInt(config.default_capacity_krenten) || 50;
        const capNaturel = parseInt(config.default_capacity_naturel) || 50;
        const capAppelbeignet = parseInt(config.default_capacity_appelbeignet) || 30;

        // Parse times
        const [startHour, startMin] = startTime.split(':').map(Number);
        const [endHour, endMin] = endTime.split(':').map(Number);

        const startMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;

        // Delete existing timeslots and product capacity
        await env.DB.prepare(`DELETE FROM timeslots`).run();
        await env.DB.prepare(`DELETE FROM product_capacity`).run();

        const timeslots = [];
        const hourBlocks = new Set();

        // Generate timeslots
        for (let minutes = startMinutes; minutes < endMinutes; minutes += duration) {
            const slotStartHour = Math.floor(minutes / 60);
            const slotStartMin = minutes % 60;
            const slotEndMinutes = minutes + duration;
            const slotEndHour = Math.floor(slotEndMinutes / 60);
            const slotEndMin = slotEndMinutes % 60;

            const startTimeStr = `${slotStartHour.toString().padStart(2, '0')}:${slotStartMin.toString().padStart(2, '0')}`;
            const endTimeStr = `${slotEndHour.toString().padStart(2, '0')}:${slotEndMin.toString().padStart(2, '0')}`;

            // Hour block for grouping (start of the hour)
            const hourBlockHour = slotStartHour;
            const hourBlockStr = `${hourBlockHour.toString().padStart(2, '0')}:00-${(hourBlockHour + 1).toString().padStart(2, '0')}:00`;

            hourBlocks.add(hourBlockStr);

            const slotId = `slot_${slotStartHour.toString().padStart(2, '0')}${slotStartMin.toString().padStart(2, '0')}`;

            timeslots.push({
                id: slotId,
                start_time: startTimeStr,
                end_time: endTimeStr,
                hour_block: hourBlockStr
            });
        }

        // Insert timeslots
        for (const slot of timeslots) {
            await env.DB.prepare(
                `INSERT INTO timeslots (id, start_time, end_time, hour_block) VALUES (?, ?, ?, ?)`
            ).bind(slot.id, slot.start_time, slot.end_time, slot.hour_block).run();
        }

        // Insert product capacity for each hour block
        const hourBlocksArray = Array.from(hourBlocks);
        for (const hourBlock of hourBlocksArray) {
            await env.DB.prepare(
                `INSERT INTO product_capacity (hour_block, product_id, capacity, booked) VALUES (?, ?, ?, ?)`
            ).bind(hourBlock, 'oliebol_krenten', capKrenten, 0).run();

            await env.DB.prepare(
                `INSERT INTO product_capacity (hour_block, product_id, capacity, booked) VALUES (?, ?, ?, ?)`
            ).bind(hourBlock, 'oliebol_naturel', capNaturel, 0).run();

            await env.DB.prepare(
                `INSERT INTO product_capacity (hour_block, product_id, capacity, booked) VALUES (?, ?, ?, ?)`
            ).bind(hourBlock, 'appelbeignet', capAppelbeignet, 0).run();
        }

        return Response.json({
            success: true,
            timeslots: timeslots.length,
            hourBlocks: hourBlocksArray.length,
            message: `${timeslots.length} tijdsloten gegenereerd`
        }, { headers: corsHeaders(request) });

    } catch (error) {
        console.error('Generation error:', error);
        return Response.json({ error: 'Generation failed', details: error.message }, { status: 500, headers: corsHeaders(request) });
    }
}
