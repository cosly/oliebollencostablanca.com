/**
 * Oliebollen Costa Blanca - Cloudflare Worker API
 * Handles orders, timeslots, and email notifications
 */

// CORS headers
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

// Product prices
const PRICES = {
    oliebol_krenten: 1.00,
    oliebol_naturel: 1.00,
    appelbeignet: 1.10
};

export default {
    async fetch(request, env, ctx) {
        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        const url = new URL(request.url);
        const path = url.pathname;

        try {
            // Route handling
            if (path === '/api/timeslots' && request.method === 'GET') {
                return await getTimeslots(env);
            }

            if (path === '/api/timeslots/capacity' && request.method === 'POST') {
                return await updateCapacity(request, env);
            }

            if (path === '/api/orders' && request.method === 'GET') {
                return await getOrders(env);
            }

            if (path === '/api/orders' && request.method === 'POST') {
                return await createOrder(request, env);
            }

            if (path.match(/^\/api\/orders\/[\w-]+$/) && request.method === 'GET') {
                const orderNumber = path.split('/').pop();
                return await getOrder(orderNumber, env);
            }

            if (path.match(/^\/api\/orders\/[\w-]+\/complete$/) && request.method === 'POST') {
                const orderNumber = path.split('/')[3];
                return await completeOrder(orderNumber, env);
            }

            if (path.match(/^\/api\/orders\/[\w-]+\/noshow$/) && request.method === 'POST') {
                const orderNumber = path.split('/')[3];
                return await markNoshow(orderNumber, env);
            }

            if (path === '/api/stats' && request.method === 'GET') {
                return await getStats(env);
            }

            // 404 for unknown API routes
            return jsonResponse({ error: 'Not found' }, 404);

        } catch (error) {
            console.error('API Error:', error);
            return jsonResponse({ error: 'Internal server error' }, 500);
        }
    }
};

// Helper: JSON response
function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
        }
    });
}

// Helper: Generate order number
function generateOrderNumber() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = 'OB-';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Helper: Calculate order total
function calculateTotal(products) {
    let total = 0;
    for (const [product, qty] of Object.entries(products)) {
        total += (qty || 0) * (PRICES[product] || 0);
    }
    return Math.round(total * 100) / 100;
}

// =====================
// Timeslots
// =====================
async function getTimeslots(env) {
    try {
        // Get timeslots from D1
        const { results } = await env.DB.prepare(`
            SELECT t.*,
                   COALESCE(COUNT(o.id), 0) as booked
            FROM timeslots t
            LEFT JOIN orders o ON t.id = o.timeslot_id AND o.status != 'cancelled'
            GROUP BY t.id
            ORDER BY t.start_time
        `).all();

        const timeslots = results.map(row => ({
            id: row.id,
            start: row.start_time,
            end: row.end_time,
            label: `${row.start_time} - ${row.end_time}`,
            capacity: row.capacity,
            booked: row.booked,
            available: Math.max(0, row.capacity - row.booked)
        }));

        return jsonResponse(timeslots);
    } catch (error) {
        // Return default timeslots if DB not available
        return jsonResponse(generateDefaultTimeslots());
    }
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
                start,
                end,
                label: `${start} - ${end}`,
                capacity: 10,
                booked: 0,
                available: 10
            });
        }
    }
    return slots;
}

async function updateCapacity(request, env) {
    const updates = await request.json();

    try {
        for (const { id, capacity } of updates) {
            await env.DB.prepare(`
                UPDATE timeslots SET capacity = ? WHERE id = ?
            `).bind(capacity, id).run();
        }
        return jsonResponse({ success: true });
    } catch (error) {
        return jsonResponse({ error: 'Failed to update capacity' }, 500);
    }
}

// =====================
// Orders
// =====================
async function getOrders(env) {
    try {
        const { results } = await env.DB.prepare(`
            SELECT * FROM orders ORDER BY created_at DESC
        `).all();

        const orders = results.map(row => ({
            orderNumber: row.order_number,
            customer: JSON.parse(row.customer_data),
            products: JSON.parse(row.products),
            timeslot: row.timeslot_id,
            timeslotLabel: row.timeslot_label,
            total: row.total,
            status: row.status,
            createdAt: row.created_at
        }));

        return jsonResponse(orders);
    } catch (error) {
        return jsonResponse([]);
    }
}

async function getOrder(orderNumber, env) {
    try {
        const row = await env.DB.prepare(`
            SELECT * FROM orders WHERE order_number = ?
        `).bind(orderNumber).first();

        if (!row) {
            return jsonResponse({ error: 'Order not found' }, 404);
        }

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
    } catch (error) {
        return jsonResponse({ error: 'Failed to get order' }, 500);
    }
}

async function createOrder(request, env) {
    const data = await request.json();

    // Validate
    if (!data.products || !data.customer || !data.timeslot) {
        return jsonResponse({ error: 'Missing required fields' }, 400);
    }

    const orderNumber = generateOrderNumber();
    const total = data.total || calculateTotal(data.products);

    try {
        // Check timeslot availability
        const slot = await env.DB.prepare(`
            SELECT t.capacity, COUNT(o.id) as booked
            FROM timeslots t
            LEFT JOIN orders o ON t.id = o.timeslot_id AND o.status != 'cancelled'
            WHERE t.id = ?
            GROUP BY t.id
        `).bind(data.timeslot).first();

        if (slot && slot.booked >= slot.capacity) {
            return jsonResponse({ error: 'Tijdslot is vol' }, 400);
        }

        // Create order
        await env.DB.prepare(`
            INSERT INTO orders (
                order_number, customer_data, products, timeslot_id,
                timeslot_label, total, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
        `).bind(
            orderNumber,
            JSON.stringify(data.customer),
            JSON.stringify(data.products),
            data.timeslot,
            data.timeslotLabel || data.timeslot,
            total
        ).run();

        // Generate QR code data URL
        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${orderNumber}`;

        // Send confirmation email (async, don't wait)
        sendConfirmationEmail(data.customer, orderNumber, data, total, env);

        return jsonResponse({
            orderNumber,
            qrCode: qrCodeUrl,
            total
        });

    } catch (error) {
        console.error('Create order error:', error);
        return jsonResponse({ error: 'Failed to create order' }, 500);
    }
}

async function completeOrder(orderNumber, env) {
    try {
        await env.DB.prepare(`
            UPDATE orders SET status = 'completed' WHERE order_number = ?
        `).bind(orderNumber).run();

        return jsonResponse({ success: true });
    } catch (error) {
        return jsonResponse({ error: 'Failed to complete order' }, 500);
    }
}

async function markNoshow(orderNumber, env) {
    try {
        await env.DB.prepare(`
            UPDATE orders SET status = 'noshow' WHERE order_number = ?
        `).bind(orderNumber).run();

        return jsonResponse({ success: true });
    } catch (error) {
        return jsonResponse({ error: 'Failed to mark no-show' }, 500);
    }
}

// =====================
// Statistics
// =====================
async function getStats(env) {
    try {
        const totals = await env.DB.prepare(`
            SELECT
                COUNT(*) as total_orders,
                SUM(total) as total_revenue,
                SUM(json_extract(products, '$.oliebol_krenten')) as krenten,
                SUM(json_extract(products, '$.oliebol_naturel')) as naturel,
                SUM(json_extract(products, '$.appelbeignet')) as appel
            FROM orders
            WHERE status != 'cancelled'
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
    } catch (error) {
        return jsonResponse({ error: 'Failed to get stats' }, 500);
    }
}

// =====================
// Email
// =====================
async function sendConfirmationEmail(customer, orderNumber, orderData, total, env) {
    // Using Resend, Mailgun, or another email service
    // This is an example using Resend API

    const PRODUCT_NAMES = {
        oliebol_krenten: 'Oliebollen met krenten',
        oliebol_naturel: 'Oliebollen zonder krenten',
        appelbeignet: 'Appelbeignets'
    };

    let productsHtml = '';
    for (const [product, qty] of Object.entries(orderData.products)) {
        if (qty > 0) {
            const subtotal = qty * PRICES[product];
            productsHtml += `<tr>
                <td>${qty}x</td>
                <td>${PRODUCT_NAMES[product]}</td>
                <td>€ ${subtotal.toFixed(2).replace('.', ',')}</td>
            </tr>`;
        }
    }

    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${orderNumber}`;

    const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 500px; margin: 0 auto; padding: 20px; }
            .header { background: #e67e22; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f8f9fa; padding: 20px; border-radius: 0 0 8px 8px; }
            .qr-code { text-align: center; margin: 20px 0; }
            .qr-code img { border: 4px solid #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
            .details { background: white; padding: 16px; border-radius: 8px; margin: 16px 0; }
            table { width: 100%; }
            td { padding: 4px 0; }
            .total { font-size: 1.2em; font-weight: bold; border-top: 2px solid #ddd; padding-top: 8px; margin-top: 8px; }
            .footer { text-align: center; font-size: 0.9em; color: #666; margin-top: 20px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🍩 Oliebollen Costa Blanca</h1>
                <p>Bedankt voor je bestelling!</p>
            </div>
            <div class="content">
                <p>Hoi ${customer.naam.split(' ')[0]},</p>
                <p>Je bestelling is ontvangen! Hieronder vind je de details en je QR-code voor ophalen.</p>

                <div class="qr-code">
                    <img src="${qrCodeUrl}" alt="QR Code" width="200" height="200">
                    <p><strong>${orderNumber}</strong></p>
                </div>

                <div class="details">
                    <h3>📦 Je bestelling</h3>
                    <table>
                        ${productsHtml}
                        <tr class="total">
                            <td colspan="2"><strong>Totaal:</strong></td>
                            <td><strong>€ ${total.toFixed(2).replace('.', ',')}</strong></td>
                        </tr>
                    </table>
                </div>

                <div class="details">
                    <h3>🕐 Ophalen</h3>
                    <p><strong>Datum:</strong> 31 december 2025</p>
                    <p><strong>Tijd:</strong> ${orderData.timeslotLabel || orderData.timeslot}</p>
                    <p><strong>Locatie:</strong> Wordt nog bekendgemaakt</p>
                </div>

                <div class="details">
                    <h3>💶 Betaling</h3>
                    <p>Contant bij ophalen - graag gepast betalen!</p>
                </div>

                <div class="footer">
                    <p>Kun je niet komen? Laat het ons weten via WhatsApp!</p>
                    <p>Tot 31 december! 🎉</p>
                </div>
            </div>
        </div>
    </body>
    </html>
    `;

    // Send via Resend (configure API key in environment)
    if (env.RESEND_API_KEY) {
        try {
            await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${env.RESEND_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    from: 'Oliebollen Costa Blanca <noreply@oliebollencostablanca.com>',
                    to: customer.email,
                    subject: `🍩 Bevestiging bestelling ${orderNumber}`,
                    html: emailHtml
                })
            });
        } catch (error) {
            console.error('Email send error:', error);
        }
    }

    // Also send notification to admin
    if (env.ADMIN_EMAIL && env.RESEND_API_KEY) {
        try {
            await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${env.RESEND_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    from: 'Oliebollen Costa Blanca <noreply@oliebollencostablanca.com>',
                    to: env.ADMIN_EMAIL,
                    subject: `📥 Nieuwe bestelling ${orderNumber}`,
                    html: emailHtml
                })
            });
        } catch (error) {
            console.error('Admin email error:', error);
        }
    }
}
