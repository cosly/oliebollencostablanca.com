// POST /api/auth/request - Request login code via email

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
function generateLoginCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

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

async function generatePendingToken(email, code, env) {
    const timestamp = Date.now();
    const data = `${email}:${code}:${timestamp}`;
    const signature = await createHmac(data, env.ADMIN_SECRET || 'default-secret');
    return btoa(JSON.stringify({ email, code, timestamp, signature }));
}

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

// ===== Main Handler =====
export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const email = env.ADMIN_EMAIL;

        // Generate login code
        const code = generateLoginCode();

        // Log code in development for easy access
        if (env.ENVIRONMENT === 'development') {
            console.log('═══════════════════════════════════════');
            console.log('🔐 ADMIN LOGIN CODE:', code);
            console.log('📧 Email:', email);
            console.log('═══════════════════════════════════════');
        }

        // Generate pending token
        const pendingToken = await generatePendingToken(email, code, env);

        // Send code via email (works with both Mailpit and Resend)
        await sendLoginCodeEmail(env, email, code);

        return Response.json(
            { success: true, pendingToken, message: 'Code verstuurd naar je email' },
            { headers: corsHeaders(request) }
        );
    } catch (error) {
        console.error('Request code error:', error);
        return Response.json(
            { error: 'Failed to send code', details: error.message },
            { status: 500, headers: corsHeaders(request) }
        );
    }
}
