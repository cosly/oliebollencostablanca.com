// ===== CORS Utilities =====
const ALLOWED_ORIGINS = [
    'http://localhost:8081',
    'http://localhost:8080',
    'http://127.0.0.1:8081',
    'http://127.0.0.1:8080',
    'https://oliebollencostablanca.com',
    'https://www.oliebollencostablanca.com'
];

function corsHeaders(request) {
    const origin = request?.headers?.get('Origin') || '*';
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400'
    };
}

// Authorization check
function checkAuth(request) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return false;
    }
    return true;
}

// OPTIONS - CORS preflight
export async function onRequestOptions(context) {
    return new Response(null, { headers: corsHeaders(context.request) });
}

// GET /api/newsletter - Get all newsletter signups (admin only)
export async function onRequestGet(context) {
    const { env, request } = context;

    if (!checkAuth(request)) {
        return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(request) });
    }

    try {
        const { results } = await env.DB.prepare(
            `SELECT id, email, opted_in_at, created_at FROM newsletter ORDER BY created_at DESC`
        ).all();

        return Response.json(results, { headers: corsHeaders(request) });
    } catch (error) {
        console.error('Database error:', error);
        return Response.json({ error: 'Database error', details: error.message }, { status: 500, headers: corsHeaders(request) });
    }
}

// POST /api/newsletter - Subscribe to newsletter (public)
export async function onRequestPost(context) {
    const { env, request } = context;

    try {
        const data = await request.json();

        // Validate required fields
        if (!data.email) {
            return Response.json({ error: 'Email is verplicht' }, { status: 400, headers: corsHeaders(request) });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(data.email)) {
            return Response.json({ error: 'Ongeldig email formaat' }, { status: 400, headers: corsHeaders(request) });
        }

        // Check opt-in
        if (!data.optIn) {
            return Response.json({ error: 'Je moet akkoord gaan met het ontvangen van de e-mail' }, { status: 400, headers: corsHeaders(request) });
        }

        // Get IP address for audit trail
        const ipAddress = request.headers.get('CF-Connecting-IP') ||
                          request.headers.get('X-Forwarded-For') ||
                          'unknown';

        // Insert into newsletter table
        await env.DB.prepare(`
            INSERT INTO newsletter (email, ip_address)
            VALUES (?, ?)
        `).bind(data.email.toLowerCase().trim(), ipAddress).run();

        return Response.json({ success: true, message: 'Bedankt voor je aanmelding!' }, { headers: corsHeaders(request) });

    } catch (error) {
        // Handle duplicate email
        if (error.message && error.message.includes('UNIQUE constraint failed')) {
            return Response.json({ success: true, message: 'Dit emailadres is al aangemeld!' }, { headers: corsHeaders(request) });
        }

        console.error('Database error:', error);
        return Response.json({ error: 'Database error', details: error.message }, { status: 500, headers: corsHeaders(request) });
    }
}

// DELETE /api/newsletter - Delete a newsletter signup (admin only)
export async function onRequestDelete(context) {
    const { env, request } = context;

    if (!checkAuth(request)) {
        return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(request) });
    }

    try {
        const url = new URL(request.url);
        const id = url.searchParams.get('id');

        if (!id) {
            return Response.json({ error: 'Missing id' }, { status: 400, headers: corsHeaders(request) });
        }

        await env.DB.prepare('DELETE FROM newsletter WHERE id = ?').bind(id).run();

        return Response.json({ success: true }, { headers: corsHeaders(request) });

    } catch (error) {
        console.error('Database error:', error);
        return Response.json({ error: 'Database error', details: error.message }, { status: 500, headers: corsHeaders(request) });
    }
}
