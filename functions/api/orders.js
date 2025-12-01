const PRICES = {
    oliebol_krenten: 1.10,
    oliebol_naturel: 1.00,
    appelbeignet: 1.25
};

const PRODUCT_NAMES = {
    oliebol_krenten: 'Oliebollen met rozijnen',
    oliebol_naturel: 'Oliebollen zonder rozijnen',
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
                        'oliebol_krenten': 'oliebollen met rozijnen',
                        'oliebol_naturel': 'oliebollen zonder rozijnen',
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
    // Use Cloudflare's QR code generator API with base64 output
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${orderNumber}&format=png`;

    let qrCodeDataUrl = qrApiUrl; // Fallback to external URL

    // Try to fetch and convert to base64
    try {
        const qrResponse = await fetch(qrApiUrl);
        if (qrResponse.ok) {
            const qrBuffer = await qrResponse.arrayBuffer();
            const qrBase64 = btoa(String.fromCharCode(...new Uint8Array(qrBuffer)));
            qrCodeDataUrl = `data:image/png;base64,${qrBase64}`;
        }
    } catch (error) {
        console.error('Failed to generate base64 QR code:', error);
        // Keep using external URL as fallback
    }

    let productsHtml = '';
    for (const [product, qty] of Object.entries(orderData.products)) {
        if (qty > 0) {
            const subtotal = qty * PRICES[product];
            productsHtml += `<tr class="product-row">
                <td style="padding:6px 5px;border-bottom:1px solid #eee;font-size:14px">${qty}x</td>
                <td style="padding:6px 5px;border-bottom:1px solid #eee;font-size:14px">${PRODUCT_NAMES[product]}</td>
                <td style="padding:6px 5px;border-bottom:1px solid #eee;text-align:right;font-size:14px">€&nbsp;${subtotal.toFixed(2).replace('.', ',')}</td>
            </tr>`;
        }
    }

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <style>
        @media only screen and (max-width: 600px) {
            .container { padding: 8px !important; }
            .header { padding: 16px !important; }
            .header h1 { font-size: 18px !important; }
            .header p { font-size: 13px !important; }
            .content { padding: 12px !important; }
            .content p { font-size: 14px !important; }
            .qr-section { padding: 12px !important; margin: 12px 0 !important; }
            .qr-section img { width: 140px !important; height: 140px !important; }
            .order-number { font-size: 16px !important; }
            .section { padding: 12px !important; margin: 12px 0 !important; }
            .section h3 { font-size: 14px !important; margin-bottom: 8px !important; }
            .section p { font-size: 13px !important; }
            .product-row td { padding: 6px 4px !important; font-size: 13px !important; }
            .total-row td { padding: 10px 4px 6px 4px !important; font-size: 15px !important; }
            .btn { padding: 10px 16px !important; font-size: 13px !important; }
            .payment-notice { padding: 12px !important; margin: 12px 0 !important; }
            .payment-notice p { font-size: 14px !important; }
        }
    </style>
</head>
<body style="font-family:Arial,sans-serif;margin:0;padding:0;background:#f5f5f5">
    <div class="container" style="max-width:500px;margin:0 auto;padding:12px">
        <div class="header" style="background:#e67e22;color:white;padding:20px;text-align:center;border-radius:12px 12px 0 0">
            <h1 style="margin:0;font-size:20px">Oliebollen Costa Blanca</h1>
            <p style="margin:8px 0 0 0;opacity:0.9;font-size:14px">Bedankt voor je bestelling!</p>
        </div>
        <div class="content" style="background:white;padding:16px;border-radius:0 0 12px 12px">
            <p style="font-size:15px;margin:0 0 10px 0">Hoi ${customer.naam.split(' ')[0]},</p>
            <p style="font-size:14px;margin:0 0 15px 0">Je bestelling is ontvangen! Hieronder vind je de details en je QR-code.</p>

            <div class="qr-section" style="text-align:center;margin:16px 0;padding:14px;background:#f8f9fa;border-radius:8px">
                <img src="${qrCodeDataUrl}" alt="QR Code" width="160" height="160" style="border-radius:8px;display:block;margin:0 auto;max-width:100%">
                <p class="order-number" style="margin:12px 0 0 0;font-size:18px;font-weight:bold;color:#2c3e50">${orderNumber}</p>
                <p style="margin:4px 0 0 0;font-size:11px;color:#666">Toon deze code bij ophalen</p>
                <p style="margin:12px 0 0 0">
                    <a href="https://oliebollencostablanca.com/order.html?order=${orderNumber}"
                       class="btn" style="display:inline-block;background:#e67e22;color:white;padding:10px 18px;text-decoration:none;border-radius:6px;font-size:13px">
                        Zie je geen QR code? Klik hier
                    </a>
                </p>
            </div>

            <div class="section" style="background:#f8f9fa;border-radius:8px;padding:14px;margin:14px 0">
                <h3 style="margin:0 0 10px 0;color:#2c3e50;font-size:15px">Je bestelling</h3>
                <table style="width:100%;border-collapse:collapse" cellpadding="0" cellspacing="0" border="0">
                    ${productsHtml}
                    <tr class="total-row" style="font-weight:bold;font-size:16px">
                        <td style="padding:12px 6px 6px 6px" colspan="2">Totaal:</td>
                        <td style="padding:12px 6px 6px 6px;text-align:right;color:#e67e22">€&nbsp;${total.toFixed(2).replace('.', ',')}</td>
                    </tr>
                </table>
            </div>

            <div class="section" style="background:#f8f9fa;border-radius:8px;padding:14px;margin:14px 0">
                <h3 style="margin:0 0 8px 0;color:#2c3e50;font-size:15px">Ophalen</h3>
                <p style="margin:0;font-size:14px"><strong>Datum:</strong> 31 december 2025</p>
                <p style="margin:4px 0 0 0;font-size:14px"><strong>Tijd:</strong> ${orderData.timeslotLabel || orderData.timeslot}</p>
                <p style="margin:8px 0 0 0;font-size:14px"><strong>Adres:</strong></p>
                <p style="margin:4px 0 0 0;font-size:14px">Calle Meliso, 21<br>03739 Jávea, Alicante</p>
                <p style="margin:12px 0 0 0">
                    <a href="https://maps.app.goo.gl/EUdC5Mbwmx3LsMTL8"
                       class="btn" style="display:inline-block;background:#e67e22;color:white;padding:10px 18px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:13px">
                        📍 Open in Google Maps
                    </a>
                </p>
            </div>

            <div class="payment-notice" style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:14px;margin:14px 0;text-align:center">
                <p style="margin:0;font-size:15px"><strong>Betaling:</strong> Contant</p>
                <p style="margin:4px 0 0 0;color:#666;font-size:13px">Graag gepast betalen!</p>
            </div>

            <p style="text-align:center;color:#666;margin-top:20px;font-size:13px">Tot 31 december!</p>
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
