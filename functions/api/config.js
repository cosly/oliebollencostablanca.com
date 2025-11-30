// GET /api/config - Get all configuration
export async function onRequestGet(context) {
    const { env } = context;

    try {
        const { results } = await env.DB.prepare(
            `SELECT key, value, description FROM config`
        ).all();

        // Convert array to object for easier use
        const config = {};
        results.forEach(row => {
            config[row.key] = {
                value: row.value,
                description: row.description
            };
        });

        return Response.json(config);
    } catch (error) {
        console.error('Database error:', error);
        return Response.json({ error: 'Database error', details: error.message }, { status: 500 });
    }
}

// PUT /api/config - Update configuration
export async function onRequestPut(context) {
    const { env, request } = context;

    try {
        const updates = await request.json();

        if (!updates || typeof updates !== 'object') {
            return Response.json({ error: 'Invalid request body' }, { status: 400 });
        }

        // Update each config value
        for (const [key, value] of Object.entries(updates)) {
            await env.DB.prepare(
                `UPDATE config SET value = ? WHERE key = ?`
            ).bind(value, key).run();
        }

        return Response.json({ success: true });
    } catch (error) {
        console.error('Database error:', error);
        return Response.json({ error: 'Database error', details: error.message }, { status: 500 });
    }
}
