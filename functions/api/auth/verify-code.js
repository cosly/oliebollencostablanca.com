// POST /api/auth/verify-code - Verify the login code and get session token

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
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400'
    };
}

// ===== Auth Utilities =====
const CODE_DURATION = 10 * 60 * 1000; // 10 minutes
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

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

async function verifyHmac(data, signature, secret) {
    const expectedSignature = await createHmac(data, secret);
    return signature === expectedSignature;
}

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

async function generateSessionToken(email, env) {
    const timestamp = Date.now();
    const sessionId = crypto.randomUUID();
    const data = `${email}:${sessionId}:${timestamp}`;
    const signature = await createHmac(data, env.ADMIN_SECRET || 'default-secret');
    return btoa(JSON.stringify({ email, sessionId, timestamp, signature }));
}

// ===== Main Handler =====
export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const data = await request.json();
        const { pendingToken, code } = data;

        if (!pendingToken || !code) {
            return Response.json(
                { error: 'Missing pendingToken or code' },
                { status: 400, headers: corsHeaders(request) }
            );
        }

        const result = await verifyPendingToken(pendingToken, code, env);

        if (!result.valid) {
            return Response.json(
                { error: result.error || 'Verification failed' },
                { status: 401, headers: corsHeaders(request) }
            );
        }

        // Generate session token
        const sessionToken = await generateSessionToken(result.email, env);

        return Response.json(
            { success: true, sessionToken },
            { headers: corsHeaders(request) }
        );
    } catch (error) {
        console.error('Verify code error:', error);
        return Response.json(
            { error: 'Verification failed', details: error.message },
            { status: 500, headers: corsHeaders(request) }
        );
    }
}
