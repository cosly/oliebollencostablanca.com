/**
 * Oliebollen Costa Blanca - Cloudflare Worker
 * Handles API routes, static assets served automatically via assets config
 */

// Product prices
const PRICES = {
    oliebol_krenten: 1.00,
    oliebol_naturel: 1.00,
    appelbeignet: 1.10
};

const PRODUCT_NAMES = {
    oliebol_krenten: 'Oliebollen met krenten',
    oliebol_naturel: 'Oliebollen zonder krenten',
    appelbeignet: 'Appelbeignets'
};

// CORS headers
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;

        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        // API routes
        if (path.startsWith('/api/')) {
            return handleAPI(request, env, path);
        }

        // Let static assets be handled by the assets config
        return env.ASSETS.fetch(request);
    }
};

async function handleAPI(request, env, path) {
    try {
        // GET /api/timeslots
        if (path === '/api/timeslots' && request.method === 'GET') {
            return getTimeslots(env);
        }

        // POST /api/timeslots/capacity
        if (path === '/api/timeslots/capacity' && request.method === 'POST') {
            return updateCapacity(request, env);
        }

        // GET /api/orders
        if (path === '/api/orders' && request.method === 'GET') {
            return getOrders(env);
        }

        // POST /api/orders
        if (path === '/api/orders' && request.method === 'POST') {
            return createOrder(request, env);
        }

        // GET /api/orders/:orderNumber
        const orderMatch = path.match(/^\/api\/orders\/([\w-]+)$/);
        if (orderMatch && request.method === 'GET') {
            return getOrder(orderMatch[1], env);
        }

        // POST /api/orders/:orderNumber/complete
        const completeMatch = path.match(/^\/api\/orders\/([\w-]+)\/complete$/);
        if (completeMatch && request.method === 'POST') {
            return completeOrder(completeMatch[1], env);
        }

        // POST /api/orders/:orderNumber/noshow
        const noshowMatch = path.match(/^\/api\/orders\/([\w-]+)\/noshow$/);
        if (noshowMatch && request.method === 'POST') {
            return markNoshow(noshowMatch[1], env);
        }

        // GET /api/stats
        if (path === '/api/stats' && request.method === 'GET') {
            return getStats(env);
        }

        return jsonResponse({ error: 'Not found' }, 404);

    } catch (error) {
        console.error('API Error:', error);
        return jsonResponse({ error: 'Internal server error' }, 500);
    }
}

// Helper functions
function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
}

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

function generateDefaultTimeslots() {
    const slots = [];
    for (let hour = 10; hour < 18; hour++) {
        for (let min = 0; min < 60; min += 30) {
            const start = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
            const endMin = (min + 30) % 60;
            const endHr = min + 30 >= 60 ? hour + 1 : hour;
            const end = `${endHr.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`;
            slots.push({
                id: `slot_${start.replace(':', '')}`,
                start, end,
                label: `${start} - ${end}`,
                capacity: 10, booked: 0, available: 10
            });
        }
    }
    return slots;
}

// API Handlers
async function getTimeslots(env) {
    if (!env.DB) return jsonResponse(generateDefaultTimeslots());

    try {
        const { results } = await env.DB.prepare(`
            SELECT t.*, COALESCE(COUNT(o.id), 0) as booked
            FROM timeslots t
            LEFT JOIN orders o ON t.id = o.timeslot_id AND o.status != 'cancelled'
            GROUP BY t.id ORDER BY t.start_time
        `).all();

        return jsonResponse(results.map(row => ({
            id: row.id,
            start: row.start_time,
            end: row.end_time,
            label: `${row.start_time} - ${row.end_time}`,
            capacity: row.capacity,
            booked: row.booked,
            available: Math.max(0, row.capacity - row.booked)
        })));
    } catch (e) {
        return jsonResponse(generateDefaultTimeslots());
    }
}

async function updateCapacity(request, env) {
    if (!env.DB) return jsonResponse({ success: true });
    const updates = await request.json();

    for (const { id, capacity } of updates) {
        await env.DB.prepare('UPDATE timeslots SET capacity = ? WHERE id = ?')
            .bind(capacity, id).run();
    }
    return jsonResponse({ success: true });
}

async function getOrders(env) {
    if (!env.DB) return jsonResponse([]);

    try {
        const { results } = await env.DB.prepare(
            'SELECT * FROM orders ORDER BY created_at DESC'
        ).all();

        return jsonResponse(results.map(row => ({
            orderNumber: row.order_number,
            customer: JSON.parse(row.customer_data),
            products: JSON.parse(row.products),
            timeslot: row.timeslot_id,
            timeslotLabel: row.timeslot_label,
            total: row.total,
            status: row.status,
            createdAt: row.created_at
        })));
    } catch (e) {
        return jsonResponse([]);
    }
}

async function getOrder(orderNumber, env) {
    if (!env.DB) return jsonResponse({ error: 'No database' }, 500);

    const row = await env.DB.prepare(
        'SELECT * FROM orders WHERE order_number = ?'
    ).bind(orderNumber).first();

    if (!row) return jsonResponse({ error: 'Not found' }, 404);

    return jsonResponse({
        orderNumber: row.order_number,
        customer: JSON.parse(row.customer_data),
        products: JSON.parse(row.products),
        timeslot: row.timeslot_id,
        timeslotLabel: row.timeslot_label,
        total: row.total,
        status: row.status,
        createdAt: row.created_at
    });
}

async function createOrder(request, env) {
    const data = await request.json();

    if (!data.products || !data.customer || !data.timeslot) {
        return jsonResponse({ error: 'Missing fields' }, 400);
    }

    const orderNumber = generateOrderNumber();
    const total = data.total || calculateTotal(data.products);
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${orderNumber}`;

    if (!env.DB) {
        return jsonResponse({ orderNumber, qrCode: qrCodeUrl, total });
    }

    try {
        // Check capacity
        const slot = await env.DB.prepare(`
            SELECT t.capacity, COUNT(o.id) as booked
            FROM timeslots t
            LEFT JOIN orders o ON t.id = o.timeslot_id AND o.status != 'cancelled'
            WHERE t.id = ? GROUP BY t.id
        `).bind(data.timeslot).first();

        if (slot && slot.booked >= slot.capacity) {
            return jsonResponse({ error: 'Tijdslot is vol' }, 400);
        }

        await env.DB.prepare(`
            INSERT INTO orders (order_number, customer_data, products, timeslot_id,
                timeslot_label, total, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
        `).bind(
            orderNumber,
            JSON.stringify(data.customer),
            JSON.stringify(data.products),
            data.timeslot,
            data.timeslotLabel || data.timeslot,
            total
        ).run();

        // Send email async
        ctx.waitUntil(sendEmail(data.customer, orderNumber, data, total, env));

        return jsonResponse({ orderNumber, qrCode: qrCodeUrl, total });
    } catch (e) {
        console.error('Create order error:', e);
        return jsonResponse({ error: 'Failed to create order' }, 500);
    }
}

async function completeOrder(orderNumber, env) {
    if (!env.DB) return jsonResponse({ success: true });
    await env.DB.prepare(
        "UPDATE orders SET status = 'completed' WHERE order_number = ?"
    ).bind(orderNumber).run();
    return jsonResponse({ success: true });
}

async function markNoshow(orderNumber, env) {
    if (!env.DB) return jsonResponse({ success: true });
    await env.DB.prepare(
        "UPDATE orders SET status = 'noshow' WHERE order_number = ?"
    ).bind(orderNumber).run();
    return jsonResponse({ success: true });
}

async function getStats(env) {
    if (!env.DB) {
        return jsonResponse({
            totalOrders: 0, totalRevenue: 0,
            products: { oliebol_krenten: 0, oliebol_naturel: 0, appelbeignet: 0 }
        });
    }

    const totals = await env.DB.prepare(`
        SELECT COUNT(*) as total_orders, SUM(total) as total_revenue,
            SUM(json_extract(products, '$.oliebol_krenten')) as krenten,
            SUM(json_extract(products, '$.oliebol_naturel')) as naturel,
            SUM(json_extract(products, '$.appelbeignet')) as appel
        FROM orders WHERE status != 'cancelled'
    `).first();

    return jsonResponse({
        totalOrders: totals.total_orders || 0,
        totalRevenue: totals.total_revenue || 0,
        products: {
            oliebol_krenten: totals.krenten || 0,
            oliebol_naturel: totals.naturel || 0,
            appelbeignet: totals.appel || 0
        }
    });
}

async function sendEmail(customer, orderNumber, orderData, total, env) {
    if (!env.RESEND_API_KEY) return;

    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${orderNumber}`;

    let productsHtml = '';
    for (const [product, qty] of Object.entries(orderData.products)) {
        if (qty > 0) {
            productsHtml += `<tr><td>${qty}x</td><td>${PRODUCT_NAMES[product]}</td><td>€${(qty * PRICES[product]).toFixed(2).replace('.', ',')}</td></tr>`;
        }
    }

    const html = `
    <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto">
        <div style="background:#e67e22;color:white;padding:20px;text-align:center;border-radius:8px 8px 0 0">
            <h1>🍩 Oliebollen Costa Blanca</h1>
            <p>Bedankt voor je bestelling!</p>
        </div>
        <div style="background:#f8f9fa;padding:20px;border-radius:0 0 8px 8px">
            <p>Hoi ${customer.naam.split(' ')[0]},</p>
            <p>Je bestelling is ontvangen!</p>
            <div style="text-align:center;margin:20px 0">
                <img src="${qrCodeUrl}" alt="QR Code" width="200" height="200" style="border:4px solid white;border-radius:8px">
                <p><strong>${orderNumber}</strong></p>
            </div>
            <div style="background:white;padding:16px;border-radius:8px;margin:16px 0">
                <h3>📦 Je bestelling</h3>
                <table style="width:100%">${productsHtml}
                    <tr style="border-top:2px solid #ddd"><td colspan="2"><strong>Totaal:</strong></td><td><strong>€${total.toFixed(2).replace('.', ',')}</strong></td></tr>
                </table>
            </div>
            <p><strong>Ophalen:</strong> 31 december 2025, ${orderData.timeslotLabel || orderData.timeslot}</p>
            <p><strong>Betaling:</strong> Contant - graag gepast!</p>
        </div>
    </div>`;

    await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            from: env.FROM_EMAIL || 'Oliebollen <noreply@oliebollencostablanca.com>',
            to: customer.email,
            subject: `🍩 Bevestiging bestelling ${orderNumber}`,
            html
        })
    });
}
