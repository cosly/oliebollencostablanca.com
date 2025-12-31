// POST /api/orders/:orderNumber/complete - Mark order as completed

const ALLOWED_ORIGINS = [
    'http://localhost:8081',
    'http://localhost:8080',
    'http://localhost:8888',
    'http://127.0.0.1:8081',
    'http://127.0.0.1:8080',
    'http://127.0.0.1:8888',
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

export async function onRequestOptions(context) {
    return new Response(null, {
        status: 204,
        headers: corsHeaders(context.request)
    });
}

export async function onRequestPost(context) {
    const { request, env, params } = context;
    const { orderNumber } = params;

    try {
        // Check if order exists
        const { results } = await env.DB.prepare(
            `SELECT * FROM orders WHERE order_number = ? AND deleted_at IS NULL LIMIT 1`
        ).bind(orderNumber).all();

        if (results.length === 0) {
            return Response.json(
                { error: 'Order not found' },
                { status: 404, headers: corsHeaders(request) }
            );
        }

        // Update status to completed
        await env.DB.prepare(
            `UPDATE orders SET status = 'completed' WHERE order_number = ?`
        ).bind(orderNumber).run();

        return Response.json({
            success: true,
            orderNumber,
            status: 'completed'
        }, { headers: corsHeaders(request) });

    } catch (error) {
        console.error('Complete order error:', error);
        return Response.json(
            { error: 'Failed to complete order', details: error.message },
            { status: 500, headers: corsHeaders(request) }
        );
    }
}
