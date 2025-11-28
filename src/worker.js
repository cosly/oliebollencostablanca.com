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

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
    'https://oliebollencostablanca.com',
    'https://www.oliebollencostablanca.com',
    'http://localhost:8788',  // Local dev
    'http://127.0.0.1:8788'
];

// CORS headers
function corsHeaders(request) {
    const origin = request?.headers?.get('Origin') || '';
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };
}

// Session token generation and validation
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

async function generateSessionToken(password, env) {
    const timestamp = Date.now();
    const data = `${password}:${timestamp}:${env.ADMIN_PASSWORD}`;
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return `${hash}:${timestamp}`;
}

async function validateSessionToken(token, env) {
    if (!token || !env.ADMIN_PASSWORD) return false;

    const parts = token.split(':');
    if (parts.length !== 2) return false;

    const [hash, timestamp] = parts;
    const tokenTime = parseInt(timestamp);

    // Check if token is expired
    if (Date.now() - tokenTime > SESSION_DURATION) {
        return false;
    }

    // Verify the hash
    const data = `${env.ADMIN_PASSWORD}:${timestamp}:${env.ADMIN_PASSWORD}`;
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const expectedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return hash === expectedHash;
}

// Check if request is authenticated for admin routes
async function isAuthenticated(request, env) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return false;
    }
    const token = authHeader.substring(7);
    return await validateSessionToken(token, env);
}

// Admin-only routes that require authentication
const ADMIN_ROUTES = [
    '/api/orders',
    '/api/timeslots'
];

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;

        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders(request) });
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
        // POST /api/auth/login - No auth required
        if (path === '/api/auth/login' && request.method === 'POST') {
            return await handleLogin(request, env);
        }

        // POST /api/auth/verify - Verify token is still valid
        if (path === '/api/auth/verify' && request.method === 'POST') {
            return await handleVerify(request, env);
        }

        // Check authentication for admin routes
        const requiresAuth = ADMIN_ROUTES.some(route => path.startsWith(route));
        if (requiresAuth) {
            // Allow public order creation (customers creating orders)
            const isPublicOrderCreation = path === '/api/orders' && request.method === 'POST';

            if (!isPublicOrderCreation && !(await isAuthenticated(request, env))) {
                return Response.json(
                    { error: 'Unauthorized', message: 'Authenticatie vereist' },
                    { status: 401, headers: corsHeaders(request) }
                );
            }
        }

        // GET /api/orders
        if (path === '/api/orders' && request.method === 'GET') {
            return await getOrders(request, env);
        }

        // POST /api/orders
        if (path === '/api/orders' && request.method === 'POST') {
            return await createOrder(request, env, ctx);
        }

        // GET /api/orders/:id
        const orderMatch = path.match(/^\/api\/orders\/([A-Z0-9-]+)$/i);
        if (orderMatch && request.method === 'GET') {
            return await getOrder(request, env, orderMatch[1]);
        }

        // POST /api/orders/:id/complete
        const completeMatch = path.match(/^\/api\/orders\/([A-Z0-9-]+)\/complete$/i);
        if (completeMatch && request.method === 'POST') {
            return await completeOrder(request, env, completeMatch[1]);
        }

        // POST /api/orders/:id/noshow
        const noshowMatch = path.match(/^\/api\/orders\/([A-Z0-9-]+)\/noshow$/i);
        if (noshowMatch && request.method === 'POST') {
            return await markNoshow(request, env, noshowMatch[1]);
        }

        // GET /api/timeslots
        if (path === '/api/timeslots' && request.method === 'GET') {
            return await getTimeslots(request, env);
        }

        // PUT /api/timeslots
        if (path === '/api/timeslots' && request.method === 'PUT') {
            return await updateTimeslot(request, env);
        }

        // POST /api/timeslots/capacity
        if (path === '/api/timeslots/capacity' && request.method === 'POST') {
            return await updateCapacity(request, env);
        }

        return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders(request) });
    } catch (error) {
        console.error('API error:', error);
        return Response.json({ error: error.message }, { status: 500, headers: corsHeaders(request) });
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
async function getOrders(request, env) {
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

    return Response.json(orders, { headers: corsHeaders(request) });
}

async function getOrder(request, env, orderNumber) {
    const { results } = await env.DB.prepare(
        `SELECT * FROM orders WHERE order_number = ?`
    ).bind(orderNumber).all();

    if (results.length === 0) {
        return Response.json({ error: 'Order not found' }, { status: 404, headers: corsHeaders(request) });
    }

    const order = results[0];
    return Response.json({
        ...order,
        orderNumber: order.order_number,
        customer: JSON.parse(order.customer_data || '{}'),
        products: JSON.parse(order.products || '{}'),
        timeslot: order.timeslot_id,
        timeslotLabel: order.timeslot_label
    }, { headers: corsHeaders(request) });
}

async function createOrder(request, env, ctx) {
    const data = await request.json();

    if (!data.products || !data.customer || !data.timeslot) {
        return Response.json({ error: 'Missing fields' }, { status: 400, headers: corsHeaders(request) });
    }

    // Input validation
    const customer = data.customer;
    if (!customer.naam || customer.naam.length > 100) {
        return Response.json({ error: 'Ongeldige naam' }, { status: 400, headers: corsHeaders(request) });
    }
    if (!customer.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
        return Response.json({ error: 'Ongeldig email adres' }, { status: 400, headers: corsHeaders(request) });
    }
    if (customer.opmerkingen && customer.opmerkingen.length > 500) {
        return Response.json({ error: 'Opmerkingen te lang (max 500 tekens)' }, { status: 400, headers: corsHeaders(request) });
    }

    // Generate order number with collision check
    let orderNumber;
    let attempts = 0;
    while (attempts < 5) {
        orderNumber = generateOrderNumber();
        const existing = await env.DB.prepare(
            `SELECT 1 FROM orders WHERE order_number = ?`
        ).bind(orderNumber).first();
        if (!existing) break;
        attempts++;
    }
    if (attempts >= 5) {
        return Response.json({ error: 'Kon geen bestelnummer genereren' }, { status: 500, headers: corsHeaders(request) });
    }

    const total = data.total || calculateTotal(data.products);
    const totalItems = calculateTotalItems(data.products);
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${orderNumber}`;
    const createdAt = new Date().toISOString();

    // Check capacity
    const { results } = await env.DB.prepare(
        `SELECT capacity, booked FROM timeslots WHERE id = ?`
    ).bind(data.timeslot).all();

    if (results.length === 0) {
        return Response.json({ error: 'Tijdslot niet gevonden' }, { status: 400, headers: corsHeaders(request) });
    }

    const slot = results[0];
    const available = slot.capacity - (slot.booked || 0);

    if (totalItems > available) {
        return Response.json({
            error: 'Onvoldoende capaciteit',
            message: `Er zijn nog maar ${available} stuks beschikbaar in dit tijdslot. Je bestelling is ${totalItems} stuks.`,
            available: available,
            requested: totalItems
        }, { status: 400, headers: corsHeaders(request) });
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

    return Response.json({ orderNumber, qrCode: qrCodeUrl, total }, { headers: corsHeaders(request) });
}

async function completeOrder(request, env, orderNumber) {
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

    return Response.json({ success: true, orderNumber }, { headers: corsHeaders(request) });
}

async function markNoshow(request, env, orderNumber) {
    await env.DB.prepare(
        `UPDATE orders SET status = 'noshow' WHERE order_number = ?`
    ).bind(orderNumber).run();

    return Response.json({ success: true, orderNumber }, { headers: corsHeaders(request) });
}

// =====================
// Timeslots API
// =====================
async function getTimeslots(request, env) {
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

    return Response.json(slots, { headers: corsHeaders(request) });
}

async function updateTimeslot(request, env) {
    const data = await request.json();

    if (!data.id || data.capacity === undefined) {
        return Response.json({ error: 'Missing id or capacity' }, { status: 400, headers: corsHeaders(request) });
    }

    await env.DB.prepare(
        `UPDATE timeslots SET capacity = ? WHERE id = ?`
    ).bind(data.capacity, data.id).run();

    return Response.json({ success: true }, { headers: corsHeaders(request) });
}

async function updateCapacity(request, env) {
    const updates = await request.json();

    for (const update of updates) {
        await env.DB.prepare(
            `UPDATE timeslots SET capacity = ? WHERE id = ?`
        ).bind(update.capacity, update.id).run();
    }

    return Response.json({ success: true }, { headers: corsHeaders(request) });
}

// =====================
// Authentication
// =====================
async function handleLogin(request, env) {
    const data = await request.json();
    const { password } = data;

    if (!password) {
        return Response.json(
            { error: 'Password required' },
            { status: 400, headers: corsHeaders(request) }
        );
    }

    // Check password against environment variable
    if (!env.ADMIN_PASSWORD) {
        console.error('ADMIN_PASSWORD not configured');
        return Response.json(
            { error: 'Server configuration error' },
            { status: 500, headers: corsHeaders(request) }
        );
    }

    if (password !== env.ADMIN_PASSWORD) {
        return Response.json(
            { error: 'Invalid password', message: 'Onjuist wachtwoord' },
            { status: 401, headers: corsHeaders(request) }
        );
    }

    // Generate session token
    const token = await generateSessionToken(password, env);

    return Response.json(
        { success: true, token, expiresIn: SESSION_DURATION },
        { headers: corsHeaders(request) }
    );
}

async function handleVerify(request, env) {
    const isValid = await isAuthenticated(request, env);

    if (isValid) {
        return Response.json(
            { valid: true },
            { headers: corsHeaders(request) }
        );
    }

    return Response.json(
        { valid: false, message: 'Token verlopen of ongeldig' },
        { status: 401, headers: corsHeaders(request) }
    );
}

// =====================
// Email
// =====================
async function sendConfirmationEmail(env, customer, orderNumber, orderData, total) {
    // Link to order page instead of embedding QR
    const orderPageUrl = `https://oliebollencostablanca.com/order.html?id=${orderNumber}`;

    let productsHtml = '';
    for (const [product, qty] of Object.entries(orderData.products)) {
        if (qty > 0) {
            const subtotal = qty * PRICES[product];
            productsHtml += `<tr>
                <td style="padding:6px 4px;border-bottom:1px solid #eee">${qty}x</td>
                <td style="padding:6px 4px;border-bottom:1px solid #eee">${PRODUCT_NAMES[product]}</td>
                <td style="padding:6px 4px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${subtotal.toFixed(2).replace('.', ',')},-</td>
            </tr>`;
        }
    }

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;margin:0;padding:0;background:#f5f5f5;-webkit-text-size-adjust:100%">
    <div style="max-width:400px;margin:0 auto;padding:12px">
        <div style="background:#e67e22;color:white;padding:20px 16px;text-align:center;border-radius:12px 12px 0 0">
            <h1 style="margin:0;font-size:20px;line-height:1.3">Oliebollen Costa Blanca</h1>
            <p style="margin:8px 0 0 0;font-size:14px;opacity:0.9">Bedankt voor je bestelling!</p>
        </div>
        <div style="background:white;padding:20px 16px;border-radius:0 0 12px 12px">
            <p style="font-size:15px;margin:0 0 12px 0;line-height:1.4">Hoi ${customer.naam.split(' ')[0]},</p>
            <p style="font-size:14px;margin:0 0 20px 0;line-height:1.5;color:#444">Je bestelling is bevestigd! Tik op de knop hieronder om je QR-code te bekijken.</p>

            <div style="text-align:center;margin:20px 0">
                <a href="${orderPageUrl}" style="display:block;background:#e67e22;color:white;padding:16px 20px;border-radius:8px;text-decoration:none;font-size:16px;font-weight:bold;text-align:center">
                    Bekijk mijn bestelling
                </a>
            </div>

            <div style="text-align:center;margin:16px 0;padding:12px;background:#f8f9fa;border-radius:8px">
                <p style="margin:0;font-size:20px;font-weight:bold;color:#2c3e50;letter-spacing:1px">${orderNumber}</p>
                <p style="margin:4px 0 0 0;font-size:11px;color:#666">Je bestelnummer</p>
            </div>

            <div style="background:#f8f9fa;border-radius:8px;padding:14px;margin:16px 0">
                <h3 style="margin:0 0 10px 0;color:#2c3e50;font-size:14px">Je bestelling</h3>
                <table style="width:100%;border-collapse:collapse;font-size:13px">
                    ${productsHtml}
                    <tr style="font-weight:bold">
                        <td style="padding:10px 4px 4px 4px" colspan="2">Totaal:</td>
                        <td style="padding:10px 4px 4px 4px;text-align:right;color:#e67e22;font-size:15px">EUR ${total.toFixed(2).replace('.', ',')}</td>
                    </tr>
                </table>
            </div>

            <div style="background:#e8f5e9;border:2px solid #27ae60;border-radius:8px;padding:14px;margin:16px 0;text-align:center">
                <p style="margin:0;font-size:11px;color:#2e7d32;font-weight:bold;text-transform:uppercase">Ophalen</p>
                <p style="margin:6px 0 0 0;font-size:18px;font-weight:bold;color:#27ae60">31 december 2025</p>
                <p style="margin:2px 0 0 0;font-size:16px;color:#2e7d32">${orderData.timeslotLabel || orderData.timeslot}</p>
            </div>

            <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:12px;margin:16px 0;text-align:center">
                <p style="margin:0;font-size:13px"><strong>Betaling:</strong> Contant - graag gepast!</p>
            </div>

            <p style="text-align:center;font-size:12px;color:#999;margin:20px 0 0 0;line-height:1.4">
                Tip: Voeg de bestelpagina toe aan je startscherm!
            </p>

            <p style="text-align:center;color:#666;margin:16px 0 0 0;font-size:14px">Tot 31 december!</p>
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
                subject: `Je oliebollen bestelling ${orderNumber}`,
                html: emailHtml
            })
        });
    } catch (error) {
        console.error('Email error:', error);
    }
}
