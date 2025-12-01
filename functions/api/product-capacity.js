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

// GET /api/product-capacity - Get current capacity usage per hour block
export async function onRequestGet(context) {
    const { env, request } = context;

    try {
        const { results } = await env.DB.prepare(`
            SELECT
                hour_block,
                used_krenten,
                used_naturel,
                used_appelbeignet
            FROM product_capacity
            ORDER BY hour_block ASC
        `).all();

        return Response.json(results, { headers: corsHeaders(request) });
    } catch (error) {
        console.error('Database error:', error);
        return Response.json({ error: 'Database error', details: error.message }, { status: 500, headers: corsHeaders(request) });
    }
}
