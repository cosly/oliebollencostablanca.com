/**
 * Oliebollen Costa Blanca - Main Worker
 * Handles API routes, static assets, and Durable Object coordination
 */

import { OrderSession } from './durable-objects/order-session.js';

// Re-export the Durable Object
export { OrderSession };

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

function calculateTotalItems(products) {
    let total = 0;
    for (const qty of Object.values(products)) {
        total += qty || 0;
    }
    return total;
}

// CORS headers
function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    };
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;

        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders() });
        }

        // API Routes
        if (path.startsWith('/api/')) {
            return handleAPI(request, env, ctx, path);
        }

        // WebSocket route for order updates
        if (path.startsWith('/ws/order/')) {
            const orderNumber = path.replace('/ws/order/', '');
            return handleWebSocket(request, env, orderNumber);
        }

        // Let Cloudflare handle static assets
        return env.ASSETS.fetch(request);
    }
};

async function handleAPI(request, env, ctx, path) {
    try {
        // GET /api/orders
        if (path === '/api/orders' && request.method === 'GET') {
            return await getOrders(env);
        }

        // POST /api/orders
        if (path === '/api/orders' && request.method === 'POST') {
            return await createOrder(request, env, ctx);
        }

        // GET /api/orders/:id
        const orderMatch = path.match(/^\/api\/orders\/([A-Z0-9-]+)$/i);
        if (orderMatch && request.method === 'GET') {
            return await getOrder(env, orderMatch[1]);
        }

        // POST /api/orders/:id/complete
        const completeMatch = path.match(/^\/api\/orders\/([A-Z0-9-]+)\/complete$/i);
        if (completeMatch && request.method === 'POST') {
            return await completeOrder(env, completeMatch[1]);
        }

        // POST /api/orders/:id/noshow
        const noshowMatch = path.match(/^\/api\/orders\/([A-Z0-9-]+)\/noshow$/i);
        if (noshowMatch && request.method === 'POST') {
            return await markNoshow(env, noshowMatch[1]);
        }

        // GET /api/timeslots
        if (path === '/api/timeslots' && request.method === 'GET') {
            return await getTimeslots(env);
        }

        // PUT /api/timeslots
        if (path === '/api/timeslots' && request.method === 'PUT') {
            return await updateTimeslot(request, env);
        }

        // POST /api/timeslots/capacity
        if (path === '/api/timeslots/capacity' && request.method === 'POST') {
            return await updateCapacity(request, env);
        }

        return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders() });
    } catch (error) {
        console.error('API error:', error);
        return Response.json({ error: error.message }, { status: 500, headers: corsHeaders() });
    }
}

// WebSocket handler
async function handleWebSocket(request, env, orderNumber) {
    // Get the Durable Object for this order
    const id = env.ORDER_SESSIONS.idFromName(orderNumber);
    const stub = env.ORDER_SESSIONS.get(id);

    // Forward the WebSocket request to the Durable Object
    return stub.fetch(request);
}

// =====================
// Orders API
// =====================
async function getOrders(env) {
    const { results } = await env.DB.prepare(
        `SELECT * FROM orders ORDER BY created_at DESC`
    ).all();

    const orders = results.map(order => ({
        ...order,
        orderNumber: order.order_number,
        customer: JSON.parse(order.customer_data || '{}'),
        products: JSON.parse(order.products || '{}'),
        timeslot: order.timeslot_id,
        timeslotLabel: order.timeslot_label
    }));

    return Response.json(orders, { headers: corsHeaders() });
}

async function getOrder(env, orderNumber) {
    const { results } = await env.DB.prepare(
        `SELECT * FROM orders WHERE order_number = ?`
    ).bind(orderNumber).all();

    if (results.length === 0) {
        return Response.json({ error: 'Order not found' }, { status: 404, headers: corsHeaders() });
    }

    const order = results[0];
    return Response.json({
        ...order,
        orderNumber: order.order_number,
        customer: JSON.parse(order.customer_data || '{}'),
        products: JSON.parse(order.products || '{}'),
        timeslot: order.timeslot_id,
        timeslotLabel: order.timeslot_label
    }, { headers: corsHeaders() });
}

async function createOrder(request, env, ctx) {
    const data = await request.json();

    if (!data.products || !data.customer || !data.timeslot) {
        return Response.json({ error: 'Missing fields' }, { status: 400, headers: corsHeaders() });
    }

    const orderNumber = generateOrderNumber();
    const total = data.total || calculateTotal(data.products);
    const totalItems = calculateTotalItems(data.products);
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${orderNumber}`;
    const createdAt = new Date().toISOString();

    // Check capacity
    const { results } = await env.DB.prepare(
        `SELECT capacity, booked FROM timeslots WHERE id = ?`
    ).bind(data.timeslot).all();

    if (results.length === 0) {
        return Response.json({ error: 'Tijdslot niet gevonden' }, { status: 400, headers: corsHeaders() });
    }

    const slot = results[0];
    const available = slot.capacity - (slot.booked || 0);

    if (totalItems > available) {
        return Response.json({
            error: 'Onvoldoende capaciteit',
            message: `Er zijn nog maar ${available} stuks beschikbaar in dit tijdslot. Je bestelling is ${totalItems} stuks.`,
            available: available,
            requested: totalItems
        }, { status: 400, headers: corsHeaders() });
    }

    // Save to database
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

    // Update timeslot booked count
    await env.DB.prepare(
        `UPDATE timeslots SET booked = booked + ? WHERE id = ?`
    ).bind(totalItems, data.timeslot).run();

    // Send confirmation email
    if (env.RESEND_API_KEY) {
        ctx.waitUntil(sendConfirmationEmail(env, data.customer, orderNumber, data, total));
    }

    return Response.json({ orderNumber, qrCode: qrCodeUrl, total }, { headers: corsHeaders() });
}

async function completeOrder(env, orderNumber) {
    // Update database
    await env.DB.prepare(
        `UPDATE orders SET status = 'completed', completed_at = ? WHERE order_number = ?`
    ).bind(new Date().toISOString(), orderNumber).run();

    // Notify connected WebSocket clients via Durable Object
    try {
        const id = env.ORDER_SESSIONS.idFromName(orderNumber);
        const stub = env.ORDER_SESSIONS.get(id);
        await stub.fetch(new Request('https://dummy/complete', { method: 'POST' }));
    } catch (e) {
        console.log('No active WebSocket sessions for order:', orderNumber);
    }

    return Response.json({ success: true, orderNumber }, { headers: corsHeaders() });
}

async function markNoshow(env, orderNumber) {
    await env.DB.prepare(
        `UPDATE orders SET status = 'noshow' WHERE order_number = ?`
    ).bind(orderNumber).run();

    return Response.json({ success: true, orderNumber }, { headers: corsHeaders() });
}

// =====================
// Timeslots API
// =====================
async function getTimeslots(env) {
    const { results } = await env.DB.prepare(
        `SELECT * FROM timeslots ORDER BY id`
    ).all();

    const slots = results.map(slot => ({
        id: slot.id,
        start: slot.start_time,
        end: slot.end_time,
        label: `${slot.start_time} - ${slot.end_time}`,
        capacity: slot.capacity,
        booked: slot.booked || 0,
        available: slot.capacity - (slot.booked || 0)
    }));

    return Response.json(slots, { headers: corsHeaders() });
}

async function updateTimeslot(request, env) {
    const data = await request.json();

    if (!data.id || data.capacity === undefined) {
        return Response.json({ error: 'Missing id or capacity' }, { status: 400, headers: corsHeaders() });
    }

    await env.DB.prepare(
        `UPDATE timeslots SET capacity = ? WHERE id = ?`
    ).bind(data.capacity, data.id).run();

    return Response.json({ success: true }, { headers: corsHeaders() });
}

async function updateCapacity(request, env) {
    const updates = await request.json();

    for (const update of updates) {
        await env.DB.prepare(
            `UPDATE timeslots SET capacity = ? WHERE id = ?`
        ).bind(update.capacity, update.id).run();
    }

    return Response.json({ success: true }, { headers: corsHeaders() });
}

// =====================
// Email
// =====================
async function sendConfirmationEmail(env, customer, orderNumber, orderData, total) {
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${orderNumber}`;

    let productsHtml = '';
    for (const [product, qty] of Object.entries(orderData.products)) {
        if (qty > 0) {
            const subtotal = qty * PRICES[product];
            productsHtml += `<tr>
                <td style="padding:8px;border-bottom:1px solid #eee">${qty}x</td>
                <td style="padding:8px;border-bottom:1px solid #eee">${PRODUCT_NAMES[product]}</td>
                <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">EUR ${subtotal.toFixed(2).replace('.', ',')}</td>
            </tr>`;
        }
    }

    const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;margin:0;padding:0;background:#f5f5f5">
    <div style="max-width:500px;margin:0 auto;padding:20px">
        <div style="background:#e67e22;color:white;padding:30px;text-align:center;border-radius:12px 12px 0 0">
            <h1 style="margin:0;font-size:24px">Oliebollen Costa Blanca</h1>
            <p style="margin:10px 0 0 0;opacity:0.9">Bedankt voor je bestelling!</p>
        </div>
        <div style="background:white;padding:30px;border-radius:0 0 12px 12px">
            <p style="font-size:16px">Hoi ${customer.naam.split(' ')[0]},</p>
            <p>Je bestelling is ontvangen! Hieronder vind je de details en je QR-code.</p>

            <div style="text-align:center;margin:30px 0;padding:20px;background:#f8f9fa;border-radius:8px">
                <img src="${qrCodeUrl}" alt="QR Code" width="180" height="180" style="border-radius:8px">
                <p style="margin:15px 0 0 0;font-size:20px;font-weight:bold;color:#2c3e50">${orderNumber}</p>
                <p style="margin:5px 0 0 0;font-size:12px;color:#666">Toon deze code bij ophalen</p>
            </div>

            <div style="background:#f8f9fa;border-radius:8px;padding:20px;margin:20px 0">
                <h3 style="margin:0 0 15px 0;color:#2c3e50">Je bestelling</h3>
                <table style="width:100%;border-collapse:collapse">
                    ${productsHtml}
                    <tr style="font-weight:bold;font-size:18px">
                        <td style="padding:15px 8px 8px 8px" colspan="2">Totaal:</td>
                        <td style="padding:15px 8px 8px 8px;text-align:right;color:#e67e22">EUR ${total.toFixed(2).replace('.', ',')}</td>
                    </tr>
                </table>
            </div>

            <div style="background:#f8f9fa;border-radius:8px;padding:20px;margin:20px 0">
                <h3 style="margin:0 0 10px 0;color:#2c3e50">Ophalen</h3>
                <p style="margin:0"><strong>Datum:</strong> 31 december 2025</p>
                <p style="margin:5px 0 0 0"><strong>Tijd:</strong> ${orderData.timeslotLabel || orderData.timeslot}</p>
            </div>

            <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:20px;margin:20px 0;text-align:center">
                <p style="margin:0;font-size:16px"><strong>Betaling:</strong> Contant bij ophalen</p>
                <p style="margin:5px 0 0 0;color:#666">Graag gepast betalen!</p>
            </div>

            <p style="text-align:center;color:#666;margin-top:30px">Tot 31 december!</p>
        </div>
    </div>
</body>
</html>`;

    try {
        await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${env.RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: 'Oliebollen Costa Blanca <bestelling@oliebollencostablanca.com>',
                to: customer.email,
                subject: `Bevestiging bestelling ${orderNumber}`,
                html: emailHtml
            })
        });
    } catch (error) {
        console.error('Email error:', error);
    }
}
