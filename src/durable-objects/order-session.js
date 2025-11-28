/**
 * OrderSession Durable Object
 * Handles WebSocket connections for real-time order status updates
 */
export class OrderSession {
    constructor(state, env) {
        this.state = state;
        this.env = env;
        this.sessions = new Map(); // WebSocket connections
    }

    async fetch(request) {
        const url = new URL(request.url);

        // Handle WebSocket upgrade
        if (request.headers.get('Upgrade') === 'websocket') {
            return this.handleWebSocket(request);
        }

        // Handle status update from admin
        if (url.pathname.endsWith('/complete') && request.method === 'POST') {
            return this.handleComplete(request);
        }

        return new Response('Not found', { status: 404 });
    }

    async handleWebSocket(request) {
        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);

        // Accept the WebSocket
        server.accept();

        // Generate session ID
        const sessionId = crypto.randomUUID();

        // Store the connection
        this.sessions.set(sessionId, server);

        // Handle messages from client
        server.addEventListener('message', async (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'ping') {
                    server.send(JSON.stringify({ type: 'pong' }));
                }
            } catch (e) {
                // Ignore invalid JSON
            }
        });

        // Handle close
        server.addEventListener('close', () => {
            this.sessions.delete(sessionId);
        });

        // Handle errors
        server.addEventListener('error', () => {
            this.sessions.delete(sessionId);
        });

        // Send initial connection success
        server.send(JSON.stringify({
            type: 'connected',
            sessionId: sessionId
        }));

        return new Response(null, {
            status: 101,
            webSocket: client
        });
    }

    async handleComplete(request) {
        // Broadcast completion to all connected clients
        const message = JSON.stringify({
            type: 'completed',
            timestamp: new Date().toISOString()
        });

        let sentCount = 0;
        for (const [sessionId, ws] of this.sessions) {
            try {
                ws.send(message);
                sentCount++;
            } catch (e) {
                // Remove dead connections
                this.sessions.delete(sessionId);
            }
        }

        return Response.json({
            success: true,
            notified: sentCount
        });
    }
}
