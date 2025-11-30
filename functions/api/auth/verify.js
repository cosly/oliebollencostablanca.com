// POST /api/auth/verify - Verify session token is still valid

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

// ===== Main Handler =====
export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        // Get token from Authorization header
        const authHeader = request.headers.get('Authorization');
        let token = null;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7);
        } else {
            // Fallback: try to read from JSON body
            try {
                const data = await request.json();
                token = data.token;
            } catch (e) {
                // No body or invalid JSON
            }
        }

        if (!token) {
            return Response.json(
                { valid: false },
                { headers: corsHeaders(request) }
            );
        }

        const result = await validateSessionToken(token, env);

        return Response.json(
            { valid: result.valid, expired: result.expired || false },
            { headers: corsHeaders(request) }
        );
    } catch (error) {
        console.error('Verify session error:', error);
        return Response.json(
            { valid: false },
            { headers: corsHeaders(request) }
        );
    }
}
