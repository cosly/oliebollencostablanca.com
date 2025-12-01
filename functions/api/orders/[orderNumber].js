// GET /api/orders/:orderNumber - Get single order by order number

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

export async function onRequestGet(context) {
    const { request, env, params } = context;
    const { orderNumber } = params;

    try {
        const { results } = await env.DB.prepare(
            `SELECT * FROM orders WHERE order_number = ? LIMIT 1`
        ).bind(orderNumber).all();

        if (results.length === 0) {
            return Response.json(
                { error: 'Order not found' },
                { status: 404, headers: corsHeaders(request) }
            );
        }

        const order = results[0];

        // Parse JSON fields
        const formattedOrder = {
            ...order,
            orderNumber: order.order_number,
            customer: JSON.parse(order.customer_data || '{}'),
            products: JSON.parse(order.products || '{}'),
            timeslot: order.timeslot_id,
            timeslotLabel: order.timeslot_label
        };

        return Response.json(formattedOrder, { headers: corsHeaders(request) });
    } catch (error) {
        console.error('Database error:', error);
        return Response.json(
            { error: 'Database error', details: error.message },
            { status: 500, headers: corsHeaders(request) }
        );
    }
}

export async function onRequestOptions(context) {
    return new Response(null, {
        status: 204,
        headers: corsHeaders(context.request)
    });
}
