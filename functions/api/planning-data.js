/**
 * Planning Data API
 * Returns aggregated orders per hour and product for planning simulation
 */

const corsHeaders = (request) => ({
    'Access-Control-Allow-Origin': request.headers.get('Origin') || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
});

export async function onRequestOptions(context) {
    return new Response(null, {
        headers: corsHeaders(context.request)
    });
}

/**
 * GET /api/planning-data?date=2025-12-31
 * Returns orders aggregated by pickup hour and product
 */
export async function onRequestGet(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const date = url.searchParams.get('date');

    if (!date) {
        return Response.json(
            { error: 'Date parameter required (format: YYYY-MM-DD)' },
            { status: 400, headers: corsHeaders(request) }
        );
    }

    try {
        // Get all orders with their timeslot info
        // Orders have: timeslot_id, timeslot_label, products (JSON)
        const ordersQuery = await env.DB.prepare(`
            SELECT
                o.id,
                o.timeslot_id,
                o.timeslot_label,
                o.products,
                o.status,
                t.hour_block
            FROM orders o
            LEFT JOIN timeslots t ON o.timeslot_id = t.id
            WHERE o.status != 'cancelled'
            AND DATE(o.created_at) >= DATE(?, '-7 days')
        `).bind(date).all();

        // Aggregate by hour and product
        const slotData = {};
        const totals = { plain: 0, raisin: 0, apple: 0 };
        let orderCount = 0;

        for (const order of ordersQuery.results) {
            // Parse hour from timeslot_label (e.g., "10:00 - 10:30" or hour_block "10:00-11:00")
            let hour = null;
            if (order.hour_block) {
                hour = parseInt(order.hour_block.split(':')[0]);
            } else if (order.timeslot_label) {
                hour = parseInt(order.timeslot_label.split(':')[0]);
            }

            if (hour === null) continue;
            orderCount++;

            const slotId = `${hour.toString().padStart(2, '0')}:00`;
            if (!slotData[slotId]) {
                slotData[slotId] = { plain: 0, raisin: 0, apple: 0 };
            }

            // Parse products JSON
            try {
                const products = JSON.parse(order.products);
                for (const product of products) {
                    const qty = product.quantity || product.qty || 1;
                    const name = (product.name || product.product || '').toLowerCase();

                    if (name.includes('rozijn') || name.includes('krenten')) {
                        slotData[slotId].raisin += qty;
                        totals.raisin += qty;
                    } else if (name.includes('naturel') || name.includes('zonder')) {
                        slotData[slotId].plain += qty;
                        totals.plain += qty;
                    } else if (name.includes('appel') || name.includes('beignet')) {
                        slotData[slotId].apple += qty;
                        totals.apple += qty;
                    } else {
                        // Default to plain for unknown
                        slotData[slotId].plain += qty;
                        totals.plain += qty;
                    }
                }
            } catch (e) {
                console.error('Failed to parse products JSON:', e);
            }
        }

        // Convert to flat array for planning engine
        const orders = [];
        for (const [slotId, demand] of Object.entries(slotData)) {
            const hour = parseInt(slotId.split(':')[0]);
            if (demand.raisin > 0) {
                orders.push({ pickup_hour: hour, product_id: 'raisin', quantity: demand.raisin });
            }
            if (demand.plain > 0) {
                orders.push({ pickup_hour: hour, product_id: 'plain', quantity: demand.plain });
            }
            if (demand.apple > 0) {
                orders.push({ pickup_hour: hour, product_id: 'apple', quantity: demand.apple });
            }
        }

        return Response.json({
            date: date,
            order_count: orderCount,
            totals: totals,
            slots: slotData,
            orders: orders
        }, { headers: corsHeaders(request) });

    } catch (error) {
        console.error('Planning data error:', error);
        return Response.json(
            { error: 'Database error', details: error.message },
            { status: 500, headers: corsHeaders(request) }
        );
    }
}
