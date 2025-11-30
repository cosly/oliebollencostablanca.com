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

// GET /api/timeslots
export async function onRequestGet(context) {
    const { env, request } = context;

    try {
        const { results } = await env.DB.prepare(
            `SELECT * FROM timeslots ORDER BY id`
        ).all();

        // Calculate available slots and generate label
        const slots = results.map(slot => ({
            id: slot.id,
            start: slot.start_time,
            end: slot.end_time,
            label: `${slot.start_time} - ${slot.end_time}`,
            hourBlock: slot.hour_block,
            capacity: slot.capacity,
            booked: slot.booked || 0,
            available: slot.capacity - (slot.booked || 0)
        }));

        return Response.json({ timeslots: slots }, { headers: corsHeaders(request) });
    } catch (error) {
        console.error('Database error:', error);
        return Response.json({ error: 'Database error', details: error.message }, { status: 500, headers: corsHeaders(request) });
    }
}

// PUT /api/timeslots - Update capacity
export async function onRequestPut(context) {
    const { env, request } = context;
    const data = await request.json();

    if (!data.id || data.capacity === undefined) {
        return Response.json({ error: 'Missing id or capacity' }, { status: 400, headers: corsHeaders(request) });
    }

    try {
        await env.DB.prepare(
            `UPDATE timeslots SET capacity = ? WHERE id = ?`
        ).bind(data.capacity, data.id).run();

        return Response.json({ success: true }, { headers: corsHeaders(request) });
    } catch (error) {
        console.error('Database error:', error);
        return Response.json({ error: 'Database error', details: error.message }, { status: 500, headers: corsHeaders(request) });
    }
}
