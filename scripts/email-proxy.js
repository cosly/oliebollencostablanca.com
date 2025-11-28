#!/usr/bin/env node
/**
 * Email Proxy Server
 * Receives emails from Cloudflare Worker and forwards to Mailpit SMTP
 */

const http = require('http');
const nodemailer = require('nodemailer');

const PORT = 8026;

// Create SMTP transport to Mailpit
const transporter = nodemailer.createTransport({
    host: '127.0.0.1',
    port: 1025,
    secure: false,
    tls: {
        rejectUnauthorized: false
    }
});

const server = http.createServer(async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    if (req.method === 'POST' && req.url === '/send') {
        let body = '';

        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', async () => {
            try {
                const emailData = JSON.parse(body);

                // Extract email address from "Name <email@domain.com>" format
                const fromEmail = emailData.from.match(/<(.+)>/)?.[1] || emailData.from;
                const fromName = emailData.from.match(/^(.+) </)?.[1] || '';

                // Send via Mailpit SMTP
                const info = await transporter.sendMail({
                    from: fromName ? `"${fromName}" <${fromEmail}>` : fromEmail,
                    to: emailData.to,
                    subject: emailData.subject,
                    html: emailData.html
                });

                console.log(`✅ Email forwarded to Mailpit: ${emailData.subject}`);
                console.log(`   To: ${emailData.to}`);
                console.log(`   Message ID: ${info.messageId}`);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, messageId: info.messageId }));
            } catch (error) {
                console.error('❌ Error forwarding email:', error.message);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
            }
        });
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

server.listen(PORT, '127.0.0.1', () => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📧 Email Proxy Server');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ Listening on http://127.0.0.1:${PORT}/send`);
    console.log(`✅ Forwarding emails to Mailpit SMTP (port 1025)`);
    console.log(`📬 View emails at http://localhost:8025`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});
