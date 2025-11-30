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

// GET /api/config - Get all configuration
export async function onRequestGet(context) {
    const { env, request } = context;

    try {
        const { results } = await env.DB.prepare(
            `SELECT key, value, description FROM config`
        ).all();

        // Convert array to object for easier use
        const config = {};
        results.forEach(row => {
            config[row.key] = {
                value: row.value,
                description: row.description
            };
        });

        return Response.json(config, { headers: corsHeaders(request) });
    } catch (error) {
        console.error('Database error:', error);
        return Response.json({ error: 'Database error', details: error.message }, { status: 500, headers: corsHeaders(request) });
    }
}

// PUT /api/config - Update configuration
export async function onRequestPut(context) {
    const { env, request } = context;

    try {
        const updates = await request.json();

        if (!updates || typeof updates !== 'object') {
            return Response.json({ error: 'Invalid request body' }, { status: 400, headers: corsHeaders(request) });
        }

        // Update each config value
        for (const [key, value] of Object.entries(updates)) {
            await env.DB.prepare(
                `UPDATE config SET value = ? WHERE key = ?`
            ).bind(value, key).run();
        }

        return Response.json({ success: true }, { headers: corsHeaders(request) });
    } catch (error) {
        console.error('Database error:', error);
        return Response.json({ error: 'Database error', details: error.message }, { status: 500, headers: corsHeaders(request) });
    }
}
