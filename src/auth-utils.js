/**
 * Authentication utilities
 */

const CODE_DURATION = 10 * 60 * 1000; // 10 minutes
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export function generateLoginCode() {
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
export async function generatePendingToken(email, code, env) {
    const timestamp = Date.now();
    const data = `${email}:${code}:${timestamp}`;
    const signature = await createHmac(data, env.ADMIN_SECRET || 'default-secret');
    return btoa(JSON.stringify({ email, code, timestamp, signature }));
}

// Verify pending token and code
export async function verifyPendingToken(pendingToken, submittedCode, env) {
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
export async function generateSessionToken(email, env) {
    const timestamp = Date.now();
    const sessionId = crypto.randomUUID();
    const data = `${email}:${sessionId}:${timestamp}`;
    const signature = await createHmac(data, env.ADMIN_SECRET || 'default-secret');
    return btoa(JSON.stringify({ email, sessionId, timestamp, signature }));
}

// Validate session token
export async function validateSessionToken(token, env) {
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
export async function isAuthenticated(request, env) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return false;
    }
    const token = authHeader.substring(7);
    const result = await validateSessionToken(token, env);
    return result.valid;
}

// Send email (development vs production)
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
export async function sendLoginCodeEmail(env, email, code) {
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
