const PRICES = {
    oliebol_krenten: 1.00,
    oliebol_naturel: 1.00,
    appelbeignet: 1.10
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

// GET /api/orders
export async function onRequestGet(context) {
    return Response.json([]);
}

// POST /api/orders
export async function onRequestPost(context) {
    const data = await context.request.json();

    if (!data.products || !data.customer || !data.timeslot) {
        return Response.json({ error: 'Missing fields' }, { status: 400 });
    }

    const orderNumber = generateOrderNumber();
    const total = data.total || calculateTotal(data.products);
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${orderNumber}`;

    return Response.json({ orderNumber, qrCode: qrCodeUrl, total });
}
