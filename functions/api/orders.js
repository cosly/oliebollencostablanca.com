const PRICES = {
    oliebol_krenten: 1.10,
    oliebol_naturel: 1.00,
    appelbeignet: 1.25
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

// GET /api/orders
export async function onRequestGet(context) {
    const { env } = context;

    try {
        const { results } = await env.DB.prepare(
            `SELECT * FROM orders ORDER BY created_at DESC`
        ).all();

        // Parse JSON fields
        const orders = results.map(order => ({
            ...order,
            orderNumber: order.order_number,
            customer: JSON.parse(order.customer_data || '{}'),
            products: JSON.parse(order.products || '{}'),
            timeslot: order.timeslot_id
        }));

        return Response.json(orders);
    } catch (error) {
        console.error('Database error:', error);
        return Response.json({ error: 'Database error', details: error.message }, { status: 500 });
    }
}

// POST /api/orders
export async function onRequestPost(context) {
    const { env } = context;
    const data = await context.request.json();

    if (!data.products || !data.customer || !data.timeslot) {
        return Response.json({ error: 'Missing fields' }, { status: 400 });
    }

    const orderNumber = generateOrderNumber();
    const total = data.total || calculateTotal(data.products);
    const totalItems = calculateTotalItems(data.products);
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${orderNumber}`;
    const createdAt = new Date().toISOString();

    // Check capacity per product before placing order
    try {
        // Get timeslot to find hour_block
        const { results: timeslots } = await env.DB.prepare(
            `SELECT hour_block FROM timeslots WHERE id = ?`
        ).bind(data.timeslot).all();

        if (timeslots.length === 0) {
            return Response.json({ error: 'Tijdslot niet gevonden' }, { status: 400 });
        }

        const hourBlock = timeslots[0].hour_block;

        // Check capacity for each product
        for (const [productId, quantity] of Object.entries(data.products)) {
            if (quantity > 0) {
                const { results } = await env.DB.prepare(
                    `SELECT capacity, booked FROM product_capacity WHERE hour_block = ? AND product_id = ?`
                ).bind(hourBlock, productId).all();

                if (results.length === 0) {
                    return Response.json({
                        error: 'Product capaciteit niet gevonden',
                        product: productId
                    }, { status: 400 });
                }

                const productCap = results[0];
                const available = productCap.capacity - productCap.booked;

                if (quantity > available) {
                    const productNames = {
                        'oliebol_krenten': 'oliebollen met krenten',
                        'oliebol_naturel': 'oliebollen zonder krenten',
                        'appelbeignet': 'appelbeignets'
                    };
                    return Response.json({
                        error: 'Onvoldoende capaciteit',
                        message: `Er zijn nog maar ${available} ${productNames[productId] || productId} beschikbaar in dit tijdslot.`,
                        product: productId,
                        available: available,
                        requested: quantity
                    }, { status: 400 });
                }
            }
        }
    } catch (error) {
        console.error('Capacity check error:', error);
        return Response.json({ error: 'Database error', details: error.message }, { status: 500 });
    }

    // Save to database
    try {
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

        // Update product capacity booked counts per product
        const { results: timeslots } = await env.DB.prepare(
            `SELECT hour_block FROM timeslots WHERE id = ?`
        ).bind(data.timeslot).all();

        const hourBlock = timeslots[0].hour_block;

        for (const [productId, quantity] of Object.entries(data.products)) {
            if (quantity > 0) {
                await env.DB.prepare(
                    `UPDATE product_capacity SET booked = booked + ? WHERE hour_block = ? AND product_id = ?`
                ).bind(quantity, hourBlock, productId).run();
            }
        }

    } catch (error) {
        console.error('Database error:', error);
        return Response.json({ error: 'Database error', details: error.message }, { status: 500 });
    }

    // Send confirmation email
    if (env.RESEND_API_KEY) {
        context.waitUntil(sendConfirmationEmail(env, data.customer, orderNumber, data, total));
    }

    return Response.json({ orderNumber, qrCode: qrCodeUrl, total });
}

async function sendConfirmationEmail(env, customer, orderNumber, orderData, total) {
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${orderNumber}`;

    let productsHtml = '';
    for (const [product, qty] of Object.entries(orderData.products)) {
        if (qty > 0) {
            const subtotal = qty * PRICES[product];
            productsHtml += `<tr>
                <td style="padding:8px;border-bottom:1px solid #eee">${qty}x</td>
                <td style="padding:8px;border-bottom:1px solid #eee">${PRODUCT_NAMES[product]}</td>
                <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">€ ${subtotal.toFixed(2).replace('.', ',')}</td>
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
                        <td style="padding:15px 8px 8px 8px;text-align:right;color:#e67e22">€ ${total.toFixed(2).replace('.', ',')}</td>
                    </tr>
                </table>
            </div>

            <div style="background:#f8f9fa;border-radius:8px;padding:20px;margin:20px 0">
                <h3 style="margin:0 0 10px 0;color:#2c3e50">Ophalen</h3>
                <p style="margin:0"><strong>Datum:</strong> 31 december 2025</p>
                <p style="margin:5px 0 0 0"><strong>Tijd:</strong> ${orderData.timeslotLabel || orderData.timeslot}</p>
                <p style="margin:10px 0 0 0"><strong>Adres:</strong></p>
                <p style="margin:5px 0 0 0">Camí dels Magros 128<br>03724 Teulada (Moraira), Alicante</p>
                <p style="margin:15px 0 0 0">
                    <a href="https://maps.google.com/?q=38.6919,-0.1264"
                       style="display:inline-block;background:#e67e22;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold">
                        📍 Open in Google Maps
                    </a>
                </p>
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
        const response = await fetch('https://api.resend.com/emails', {
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

        const result = await response.json();
        console.log('Email result:', result);
    } catch (error) {
        console.error('Email error:', error);
    }
}
