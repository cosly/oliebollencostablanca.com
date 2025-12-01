// Script to update timeslot_label in orders table with readable labels

async function updateTimeslotLabels() {
    console.log('🔄 Updating timeslot labels in database...\n');

    // Function to convert slot_HHMM to readable label
    function getTimeslotLabel(timeslotId) {
        if (!timeslotId || !timeslotId.startsWith('slot_')) {
            return timeslotId;
        }

        const time = timeslotId.replace('slot_', '');
        const hour = time.substring(0, 2);
        const minute = time.substring(2, 4);
        const startTime = `${hour}:${minute}`;

        // Calculate end time (15 minutes later)
        let endHour = parseInt(hour);
        let endMinute = parseInt(minute) + 15;
        if (endMinute >= 60) {
            endHour++;
            endMinute -= 60;
        }
        const endTime = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;

        return `${startTime} - ${endTime}`;
    }

    try {
        // Get all orders
        const response = await fetch('http://localhost:8081/api/orders');
        const orders = await response.json();

        console.log(`Found ${orders.length} orders to update\n`);

        let updated = 0;
        let skipped = 0;

        for (const order of orders) {
            const currentLabel = order.timeslot_label || order.timeslotLabel;
            const newLabel = getTimeslotLabel(order.timeslot_id || order.timeslot);

            // Skip if already has correct label
            if (currentLabel && !currentLabel.startsWith('slot_')) {
                console.log(`⏭️  Skipping ${order.order_number}: already has label "${currentLabel}"`);
                skipped++;
                continue;
            }

            console.log(`✏️  Updating ${order.order_number}: "${order.timeslot_id || order.timeslot}" → "${newLabel}"`);

            // Update via API
            const updateResponse = await fetch(`http://localhost:8081/api/orders/${order.order_number}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    timeslotLabel: newLabel
                })
            });

            if (updateResponse.ok) {
                updated++;
            } else {
                console.error(`❌ Failed to update ${order.order_number}`);
            }
        }

        console.log(`\n✅ Update complete!`);
        console.log(`   Updated: ${updated} orders`);
        console.log(`   Skipped: ${skipped} orders`);

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

updateTimeslotLabels().catch(console.error);
