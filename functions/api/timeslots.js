// GET /api/timeslots
export async function onRequestGet(context) {
    const slots = [];
    for (let hour = 10; hour < 18; hour++) {
        for (let min = 0; min < 60; min += 30) {
            const start = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
            const endMin = (min + 30) % 60;
            const endHr = min + 30 >= 60 ? hour + 1 : hour;
            const end = `${endHr.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`;
            slots.push({
                id: `slot_${start.replace(':', '')}`,
                start, end,
                label: `${start} - ${end}`,
                capacity: 10, booked: 0, available: 10
            });
        }
    }
    return Response.json(slots);
}
