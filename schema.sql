-- Oliebollen Costa Blanca Database Schema
-- Run this in the Cloudflare D1 Console if tables need to be recreated

-- Drop existing tables (careful - this deletes all data!)
-- DROP TABLE IF EXISTS orders;
-- DROP TABLE IF EXISTS timeslots;

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT UNIQUE NOT NULL,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT,
    products TEXT NOT NULL,  -- JSON string
    timeslot TEXT NOT NULL,
    timeslot_label TEXT,
    total REAL NOT NULL,
    status TEXT DEFAULT 'pending',  -- pending, completed, noshow
    created_at TEXT NOT NULL
);

-- Timeslots table
CREATE TABLE IF NOT EXISTS timeslots (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    capacity INTEGER DEFAULT 10,
    booked INTEGER DEFAULT 0
);

-- Initialize timeslots (30-minute intervals from 10:00 to 18:00)
INSERT OR IGNORE INTO timeslots (id, label, capacity, booked) VALUES
    ('slot_1000', '10:00 - 10:30', 10, 0),
    ('slot_1030', '10:30 - 11:00', 10, 0),
    ('slot_1100', '11:00 - 11:30', 10, 0),
    ('slot_1130', '11:30 - 12:00', 10, 0),
    ('slot_1200', '12:00 - 12:30', 10, 0),
    ('slot_1230', '12:30 - 13:00', 10, 0),
    ('slot_1300', '13:00 - 13:30', 10, 0),
    ('slot_1330', '13:30 - 14:00', 10, 0),
    ('slot_1400', '14:00 - 14:30', 10, 0),
    ('slot_1430', '14:30 - 15:00', 10, 0),
    ('slot_1500', '15:00 - 15:30', 10, 0),
    ('slot_1530', '15:30 - 16:00', 10, 0),
    ('slot_1600', '16:00 - 16:30', 10, 0),
    ('slot_1630', '16:30 - 17:00', 10, 0),
    ('slot_1700', '17:00 - 17:30', 10, 0),
    ('slot_1730', '17:30 - 18:00', 10, 0);

-- Create index for faster order lookups
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_timeslot ON orders(timeslot);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
