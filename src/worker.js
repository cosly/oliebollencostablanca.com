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

// Token durations
const CODE_DURATION = 10 * 60 * 1000; // 10 minutes for login code
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours for session

// Generate a 6-digit code
function generateLoginCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Create HMAC signature
async function createHmac(data, secret) {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
    return Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

// Verify HMAC signature
async function verifyHmac(data, signature, secret) {
    const expectedSignature = await createHmac(data, secret);
    return signature === expectedSignature;
}

// Generate pending token (contains encrypted code info)
async function generatePendingToken(email, code, env) {
    const timestamp = Date.now();
    const data = `${email}:${code}:${timestamp}`;
    const signature = await createHmac(data, env.ADMIN_SECRET || 'default-secret');
    return btoa(JSON.stringify({ email, code, timestamp, signature }));
}

// Verify pending token and code
async function verifyPendingToken(pendingToken, submittedCode, env) {
    try {
        const decoded = JSON.parse(atob(pendingToken));
        const { email, code, timestamp, signature } = decoded;

        // Check expiry
        if (Date.now() - timestamp > CODE_DURATION) {
            return { valid: false, error: 'Code verlopen' };
        }

        // Verify signature
        const data = `${email}:${code}:${timestamp}`;
        if (!(await verifyHmac(data, signature, env.ADMIN_SECRET || 'default-secret'))) {
            return { valid: false, error: 'Ongeldige token' };
        }

        // Check code
        if (code !== submittedCode) {
            return { valid: false, error: 'Onjuiste code' };
        }

        return { valid: true, email };
    } catch (e) {
        return { valid: false, error: 'Ongeldige token' };
    }
}

// Generate session token
async function generateSessionToken(email, env) {
    const timestamp = Date.now();
    const sessionId = crypto.randomUUID();
    const data = `${email}:${sessionId}:${timestamp}`;
    const signature = await createHmac(data, env.ADMIN_SECRET || 'default-secret');
    return btoa(JSON.stringify({ email, sessionId, timestamp, signature }));
}

// Validate session token
async function validateSessionToken(token, env) {
    if (!token) return { valid: false };

    try {
        const decoded = JSON.parse(atob(token));
        const { email, sessionId, timestamp, signature } = decoded;

        // Check expiry
        if (Date.now() - timestamp > SESSION_DURATION) {
            return { valid: false, expired: true };
        }

        // Verify signature
        const data = `${email}:${sessionId}:${timestamp}`;
        if (!(await verifyHmac(data, signature, env.ADMIN_SECRET || 'default-secret'))) {
            return { valid: false };
        }

        return { valid: true, email, sessionId };
    } catch (e) {
        return { valid: false };
    }
}

// Check if request is authenticated for admin routes
async function isAuthenticated(request, env) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return false;
    }
    const token = authHeader.substring(7);
    const result = await validateSessionToken(token, env);
    return result.valid;
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

        // Serve static assets
        if (env.ASSETS) {
            return env.ASSETS.fetch(request);
        }

        // Fallback for local dev without ASSETS binding
        return new Response('Not found', { status: 404 });
    }
};

async function handleAPI(request, env, ctx, path) {
    try {
        // POST /api/auth/request - Request login code via email
        if (path === '/api/auth/request' && request.method === 'POST') {
            return await handleRequestCode(request, env);
        }

        // POST /api/auth/verify-code - Verify the login code and get session token
        if (path === '/api/auth/verify-code' && request.method === 'POST') {
            return await handleVerifyCode(request, env);
        }

        // POST /api/auth/verify - Verify session token is still valid
        if (path === '/api/auth/verify' && request.method === 'POST') {
            return await handleVerifySession(request, env);
        }

        // Check authentication for admin routes
        const requiresAuth = ADMIN_ROUTES.some(route => path.startsWith(route));
        if (requiresAuth) {
            // Allow public routes (customers need these)
            const isPublicRoute =
                (path === '/api/orders' && request.method === 'POST') ||  // Create order
                (path === '/api/timeslots' && request.method === 'GET');  // View timeslots

            if (!isPublicRoute && !(await isAuthenticated(request, env))) {
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

        // POST /api/product-capacity
        if (path === '/api/product-capacity' && request.method === 'POST') {
            return await updateProductCapacity(request, env);
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

    // Check capacity per product
    // First get the hour_block for this timeslot
    const { results: slotResults } = await env.DB.prepare(
        `SELECT hour_block FROM timeslots WHERE id = ?`
    ).bind(data.timeslot).all();

    if (slotResults.length === 0) {
        return Response.json({ error: 'Tijdslot niet gevonden' }, { status: 400, headers: corsHeaders(request) });
    }

    const hourBlock = slotResults[0].hour_block;

    // Check capacity for each product
    for (const [productId, quantity] of Object.entries(data.products)) {
        if (quantity <= 0) continue;

        const { results: capacityResults } = await env.DB.prepare(
            `SELECT capacity, booked FROM product_capacity WHERE hour_block = ? AND product_id = ?`
        ).bind(hourBlock, productId).all();

        if (capacityResults.length === 0) {
            return Response.json({
                error: 'Product capaciteit niet geconfigureerd',
                product: productId,
                hourBlock
            }, { status: 400, headers: corsHeaders(request) });
        }

        const productCapacity = capacityResults[0];
        const available = productCapacity.capacity - (productCapacity.booked || 0);

        if (quantity > available) {
            const productNames = {
                'oliebol_krenten': 'Oliebollen met krenten',
                'oliebol_naturel': 'Oliebollen zonder krenten',
                'appelbeignet': 'Appelbeignets'
            };

            return Response.json({
                error: 'Onvoldoende capaciteit',
                message: `Er zijn nog maar ${available} ${productNames[productId]} beschikbaar in dit uur. Je bestelling is ${quantity} stuks.`,
                available: available,
                requested: quantity,
                product: productId,
                hourBlock
            }, { status: 400, headers: corsHeaders(request) });
        }
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

    // Update product capacity booked counts
    for (const [productId, quantity] of Object.entries(data.products)) {
        if (quantity <= 0) continue;

        await env.DB.prepare(
            `UPDATE product_capacity SET booked = booked + ? WHERE hour_block = ? AND product_id = ?`
        ).bind(quantity, hourBlock, productId).run();
    }

    // Send confirmation email (works with both Mailpit and Resend)
    ctx.waitUntil(sendConfirmationEmail(env, data.customer, orderNumber, data, total));

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
    const { results: timeslots } = await env.DB.prepare(
        `SELECT * FROM timeslots ORDER BY id`
    ).all();

    // Get all product capacities
    const { results: capacities } = await env.DB.prepare(
        `SELECT * FROM product_capacity`
    ).all();

    // Group capacities by hour_block
    const capacityByHour = {};
    for (const cap of capacities) {
        if (!capacityByHour[cap.hour_block]) {
            capacityByHour[cap.hour_block] = {};
        }
        capacityByHour[cap.hour_block][cap.product_id] = {
            capacity: cap.capacity,
            booked: cap.booked || 0,
            available: cap.capacity - (cap.booked || 0)
        };
    }

    const slots = timeslots.map(slot => ({
        id: slot.id,
        start: slot.start_time,
        end: slot.end_time,
        label: `${slot.start_time} - ${slot.end_time}`,
        hourBlock: slot.hour_block,
        products: capacityByHour[slot.hour_block] || {}
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

async function updateProductCapacity(request, env) {
    const updates = await request.json();

    for (const update of updates) {
        await env.DB.prepare(
            `UPDATE product_capacity SET capacity = ? WHERE hour_block = ? AND product_id = ?`
        ).bind(update.capacity, update.hourBlock, update.productId).run();
    }

    return Response.json({ success: true }, { headers: corsHeaders(request) });
}

// =====================
// Authentication
// =====================

// Step 1: Request login code (sent to ADMIN_EMAIL)
async function handleRequestCode(request, env) {
    // Check if ADMIN_EMAIL is configured
    if (!env.ADMIN_EMAIL) {
        console.error('ADMIN_EMAIL not configured');
        return Response.json(
            { error: 'Server configuration error', message: 'Admin email niet geconfigureerd' },
            { status: 500, headers: corsHeaders(request) }
        );
    }

    const email = env.ADMIN_EMAIL;

    // Generate login code
    const code = generateLoginCode();

    // Generate pending token
    const pendingToken = await generatePendingToken(email, code, env);

    // Send code via email (works with both Mailpit and Resend)
    await sendLoginCodeEmail(env, email, code);

    return Response.json(
        { success: true, pendingToken, message: 'Code verstuurd naar je email' },
        { headers: corsHeaders(request) }
    );
}

// Step 2: Verify the code and issue session token
async function handleVerifyCode(request, env) {
    const data = await request.json();
    const { pendingToken, code } = data;

    if (!pendingToken || !code) {
        return Response.json(
            { error: 'Missing data', message: 'Token en code zijn verplicht' },
            { status: 400, headers: corsHeaders(request) }
        );
    }

    // Verify pending token and code
    const result = await verifyPendingToken(pendingToken, code, env);

    if (!result.valid) {
        return Response.json(
            { error: 'Invalid code', message: result.error },
            { status: 401, headers: corsHeaders(request) }
        );
    }

    // Generate session token
    const sessionToken = await generateSessionToken(result.email, env);

    return Response.json(
        { success: true, token: sessionToken, expiresIn: SESSION_DURATION },
        { headers: corsHeaders(request) }
    );
}

// Verify existing session token
async function handleVerifySession(request, env) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return Response.json(
            { valid: false, message: 'Geen token' },
            { status: 401, headers: corsHeaders(request) }
        );
    }

    const token = authHeader.substring(7);
    const result = await validateSessionToken(token, env);

    if (result.valid) {
        return Response.json(
            { valid: true, email: result.email },
            { headers: corsHeaders(request) }
        );
    }

    return Response.json(
        { valid: false, message: result.expired ? 'Sessie verlopen' : 'Ongeldige sessie' },
        { status: 401, headers: corsHeaders(request) }
    );
}

// Send email via Resend or local proxy for development
async function sendEmail(env, { from, to, subject, html }) {
    // For local development, use email proxy that forwards to Mailpit
    if (env.ENVIRONMENT === 'development' || !env.RESEND_API_KEY) {
        try {
            await fetch('http://127.0.0.1:8026/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ from, to, subject, html })
            });
            console.log(`📧 Email sent to ${to} via proxy → Mailpit (http://localhost:8025)`);
        } catch (error) {
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('⚠️  Email proxy not running! Start it with:');
            console.log('   node scripts/email-proxy.js');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('📧 EMAIL (would be sent):');
            console.log(`From: ${from}`);
            console.log(`To: ${to}`);
            console.log(`Subject: ${subject}`);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        }
        return;
    }

    // Use Resend for production
    try {
        await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${env.RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ from, to, subject, html })
        });
    } catch (error) {
        console.error('Resend email error:', error);
    }
}

// Send login code email
async function sendLoginCodeEmail(env, email, code) {
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;margin:0;padding:0;background:#f5f5f5">
    <div style="max-width:400px;margin:0 auto;padding:20px">
        <div style="background:#2c3e50;color:white;padding:24px;text-align:center;border-radius:12px 12px 0 0">
            <h1 style="margin:0;font-size:20px">Admin Login</h1>
            <p style="margin:8px 0 0;opacity:0.9;font-size:14px">Oliebollen Costa Blanca</p>
        </div>
        <div style="background:white;padding:24px;border-radius:0 0 12px 12px">
            <p style="font-size:15px;margin:0 0 20px;color:#444">
                Je login code is:
            </p>
            <div style="background:#f8f9fa;border-radius:8px;padding:20px;text-align:center;margin:0 0 20px">
                <p style="margin:0;font-size:32px;font-weight:bold;letter-spacing:8px;color:#2c3e50">${code}</p>
            </div>
            <p style="font-size:13px;color:#666;margin:0">
                Deze code is 10 minuten geldig. Deel deze code met niemand.
            </p>
        </div>
    </div>
</body>
</html>`;

    await sendEmail(env, {
        from: 'Oliebollen Costa Blanca <noreply@oliebollencostablanca.com>',
        to: email,
        subject: `Je login code: ${code}`,
        html: emailHtml
    });
}

// =====================
// Email
// =====================
async function sendConfirmationEmail(env, customer, orderNumber, orderData, total) {
    // Link to order page instead of embedding QR
    const baseUrl = env.ENVIRONMENT === 'development'
        ? 'http://localhost:8080'
        : 'https://oliebollencostablanca.com';
    const orderPageUrl = `${baseUrl}/order.html?id=${orderNumber}`;

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

    await sendEmail(env, {
        from: 'Oliebollen Costa Blanca <bestelling@oliebollencostablanca.com>',
        to: customer.email,
        subject: `Je oliebollen bestelling ${orderNumber}`,
        html: emailHtml
    });
}
