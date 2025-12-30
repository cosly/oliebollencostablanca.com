// GET /api/orders/:orderNumber - Get single order by order number

// ===== CORS Utilities =====
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

export async function onRequestGet(context) {
    const { request, env, params } = context;
    const { orderNumber } = params;

    try {
        const { results } = await env.DB.prepare(
            `SELECT * FROM orders WHERE order_number = ? AND deleted_at IS NULL LIMIT 1`
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

const PRICES = {
    oliebol_krenten: 1.10,
    oliebol_naturel: 1.00,
    appelbeignet: 1.25
};

function calculateTotal(products) {
    let total = 0;
    for (const [product, qty] of Object.entries(products)) {
        total += (qty || 0) * (PRICES[product] || 0);
    }
    return Math.round(total * 100) / 100;
}

// PUT /api/orders/:orderNumber - Update order
export async function onRequestPut(context) {
    const { request, env, params } = context;
    const { orderNumber } = params;

    try {
        const data = await request.json();

        // Get current order
        const { results } = await env.DB.prepare(
            `SELECT * FROM orders WHERE order_number = ? AND deleted_at IS NULL LIMIT 1`
        ).bind(orderNumber).all();

        if (results.length === 0) {
            return Response.json(
                { error: 'Order not found' },
                { status: 404, headers: corsHeaders(request) }
            );
        }

        const currentOrder = results[0];
        const currentProducts = JSON.parse(currentOrder.products || '{}');

        // Get old timeslot hour_block
        const { results: oldTimeslotResults } = await env.DB.prepare(
            `SELECT hour_block FROM timeslots WHERE id = ?`
        ).bind(currentOrder.timeslot_id).all();
        const oldHourBlock = oldTimeslotResults[0]?.hour_block;

        // Determine new values
        const newProducts = data.products || currentProducts;
        const newTimeslotId = data.timeslot_id || currentOrder.timeslot_id;
        const newTimeslotLabel = data.timeslot_label || currentOrder.timeslot_label;
        const newTotal = calculateTotal(newProducts);

        // Get new timeslot hour_block
        const { results: newTimeslotResults } = await env.DB.prepare(
            `SELECT hour_block FROM timeslots WHERE id = ?`
        ).bind(newTimeslotId).all();
        const newHourBlock = newTimeslotResults[0]?.hour_block;

        // Update capacity: release old, book new
        if (oldHourBlock) {
            for (const [productId, quantity] of Object.entries(currentProducts)) {
                if (quantity > 0) {
                    await env.DB.prepare(
                        `UPDATE product_capacity SET booked = booked - ? WHERE hour_block = ? AND product_id = ?`
                    ).bind(quantity, oldHourBlock, productId).run();
                }
            }
        }

        if (newHourBlock) {
            for (const [productId, quantity] of Object.entries(newProducts)) {
                if (quantity > 0) {
                    await env.DB.prepare(
                        `UPDATE product_capacity SET booked = booked + ? WHERE hour_block = ? AND product_id = ?`
                    ).bind(quantity, newHourBlock, productId).run();
                }
            }
        }

        // Update order
        await env.DB.prepare(
            `UPDATE orders SET products = ?, timeslot_id = ?, timeslot_label = ?, total = ? WHERE order_number = ?`
        ).bind(
            JSON.stringify(newProducts),
            newTimeslotId,
            newTimeslotLabel,
            newTotal,
            orderNumber
        ).run();

        return Response.json({
            success: true,
            orderNumber,
            total: newTotal
        }, { headers: corsHeaders(request) });

    } catch (error) {
        console.error('Update error:', error);
        return Response.json(
            { error: 'Update failed', details: error.message },
            { status: 500, headers: corsHeaders(request) }
        );
    }
}

// DELETE /api/orders/:orderNumber - Soft delete order
export async function onRequestDelete(context) {
    const { request, env, params } = context;
    const { orderNumber } = params;

    try {
        // Get current order to release capacity
        const { results } = await env.DB.prepare(
            `SELECT * FROM orders WHERE order_number = ? AND deleted_at IS NULL LIMIT 1`
        ).bind(orderNumber).all();

        if (results.length === 0) {
            return Response.json(
                { error: 'Order not found' },
                { status: 404, headers: corsHeaders(request) }
            );
        }

        const order = results[0];
        const products = JSON.parse(order.products || '{}');

        // Get timeslot hour_block
        const { results: timeslotResults } = await env.DB.prepare(
            `SELECT hour_block FROM timeslots WHERE id = ?`
        ).bind(order.timeslot_id).all();
        const hourBlock = timeslotResults[0]?.hour_block;

        // Release capacity
        if (hourBlock) {
            for (const [productId, quantity] of Object.entries(products)) {
                if (quantity > 0) {
                    await env.DB.prepare(
                        `UPDATE product_capacity SET booked = booked - ? WHERE hour_block = ? AND product_id = ?`
                    ).bind(quantity, hourBlock, productId).run();
                }
            }
        }

        // Soft delete
        const deletedAt = new Date().toISOString();
        await env.DB.prepare(
            `UPDATE orders SET deleted_at = ? WHERE order_number = ?`
        ).bind(deletedAt, orderNumber).run();

        return Response.json({
            success: true,
            orderNumber,
            deletedAt
        }, { headers: corsHeaders(request) });

    } catch (error) {
        console.error('Delete error:', error);
        return Response.json(
            { error: 'Delete failed', details: error.message },
            { status: 500, headers: corsHeaders(request) }
        );
    }
}
