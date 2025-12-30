// POST /api/orders/admin - Create order bypassing capacity checks (admin only)

const PRICES = {
    oliebol_krenten: 1.10,
    oliebol_naturel: 1.00,
    appelbeignet: 1.25
};

function generateOrderNumber() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = 'OB-';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function calculateTotal(products) {
    let total = 0;
    for (const [product, qty] of Object.entries(products)) {
        total += (qty || 0) * (PRICES[product] || 0);
    }
    return Math.round(total * 100) / 100;
}

export async function onRequestPost(context) {
    const { request, env } = context;

    // Note: In production, you should verify admin auth token here
    // For now we trust the request comes from authenticated admin

    try {
        const data = await request.json();

        if (!data.products || !data.customer || !data.timeslot) {
            return Response.json({ error: 'Missing fields' }, { status: 400 });
        }

        const orderNumber = generateOrderNumber();
        const total = calculateTotal(data.products);
        const createdAt = new Date().toISOString();

        // Save to database WITHOUT checking capacity
        await env.DB.prepare(
            `INSERT INTO orders (order_number, customer_data, products, timeslot_id, timeslot_label, total, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
            orderNumber,
            JSON.stringify(data.customer),
            JSON.stringify(data.products),
            data.timeslot,
            data.timeslotLabel || data.timeslot,
            total,
            'pending',
            createdAt
        ).run();

        // Update product capacity booked counts (still track capacity, just don't enforce it)
        try {
            const { results: timeslots } = await env.DB.prepare(
                `SELECT hour_block FROM timeslots WHERE id = ?`
            ).bind(data.timeslot).all();

            if (timeslots.length > 0) {
                const hourBlock = timeslots[0].hour_block;

                for (const [productId, quantity] of Object.entries(data.products)) {
                    if (quantity > 0) {
                        await env.DB.prepare(
                            `UPDATE product_capacity SET booked = booked + ? WHERE hour_block = ? AND product_id = ?`
                        ).bind(quantity, hourBlock, productId).run();
                    }
                }
            }
        } catch (e) {
            console.log('Could not update capacity (non-critical):', e.message);
        }

        return Response.json({
            success: true,
            orderNumber,
            total
        });

    } catch (error) {
        console.error('Admin order creation error:', error);
        return Response.json({
            error: 'Database error',
            details: error.message
        }, { status: 500 });
    }
}
