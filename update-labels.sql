-- Update timeslot_label for all orders with slot_HHMM format

-- slot_1000 -> 10:00 - 10:15
UPDATE orders
SET timeslot_label = '10:00 - 10:15'
WHERE timeslot_id = 'slot_1000' AND (timeslot_label IS NULL OR timeslot_label = 'slot_1000' OR timeslot_label = '');

-- slot_1100 -> 11:00 - 11:15
UPDATE orders
SET timeslot_label = '11:00 - 11:15'
WHERE timeslot_id = 'slot_1100' AND (timeslot_label IS NULL OR timeslot_label = 'slot_1100' OR timeslot_label = '');

-- slot_1200 -> 12:00 - 12:15
UPDATE orders
SET timeslot_label = '12:00 - 12:15'
WHERE timeslot_id = 'slot_1200' AND (timeslot_label IS NULL OR timeslot_label = 'slot_1200' OR timeslot_label = '');

-- slot_1330 -> 13:30 - 13:45
UPDATE orders
SET timeslot_label = '13:30 - 13:45'
WHERE timeslot_id = 'slot_1330' AND (timeslot_label IS NULL OR timeslot_label = 'slot_1330' OR timeslot_label = '');

-- Show results
SELECT order_number, timeslot_id, timeslot_label
FROM orders
ORDER BY created_at DESC
LIMIT 20;
