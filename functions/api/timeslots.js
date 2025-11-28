// GET /api/timeslots
export async function onRequestGet(context) {
    const { env } = context;

    try {
        const { results } = await env.DB.prepare(
            `SELECT * FROM timeslots ORDER BY id`
        ).all();

        // Calculate available slots and generate label
        const slots = results.map(slot => ({
            id: slot.id,
            start: slot.start_time,
            end: slot.end_time,
            label: `${slot.start_time} - ${slot.end_time}`,
            capacity: slot.capacity,
            booked: slot.booked || 0,
            available: slot.capacity - (slot.booked || 0)
        }));

        return Response.json(slots);
    } catch (error) {
        console.error('Database error:', error);
        return Response.json({ error: 'Database error', details: error.message }, { status: 500 });
    }
}

// PUT /api/timeslots - Update capacity
export async function onRequestPut(context) {
    const { env } = context;
    const data = await context.request.json();

    if (!data.id || data.capacity === undefined) {
        return Response.json({ error: 'Missing id or capacity' }, { status: 400 });
    }

    try {
        await env.DB.prepare(
            `UPDATE timeslots SET capacity = ? WHERE id = ?`
        ).bind(data.capacity, data.id).run();

        return Response.json({ success: true });
    } catch (error) {
        console.error('Database error:', error);
        return Response.json({ error: 'Database error', details: error.message }, { status: 500 });
    }
}
