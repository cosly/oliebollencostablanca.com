-- Oliebollen Costa Blanca - Database Schema
-- Run with: wrangler d1 execute oliebollen-db --file=./api/schema.sql

-- Timeslots table
CREATE TABLE IF NOT EXISTS timeslots (
    id TEXT PRIMARY KEY,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    capacity INTEGER DEFAULT 10,
    date TEXT DEFAULT '2025-12-31',
    created_at TEXT DEFAULT (datetime('now'))
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT UNIQUE NOT NULL,
    customer_data TEXT NOT NULL,  -- JSON: {naam, email, telefoon, opmerkingen}
    products TEXT NOT NULL,        -- JSON: {oliebol_krenten, oliebol_naturel, appelbeignet}
    timeslot_id TEXT NOT NULL,
    timeslot_label TEXT,
    total REAL NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, completed, noshow, cancelled
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (timeslot_id) REFERENCES timeslots(id)
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_timeslot ON orders(timeslot_id);
CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(order_number);

-- Insert default timeslots (31 december 2025, 10:00 - 18:00, every 30 min)
INSERT OR IGNORE INTO timeslots (id, start_time, end_time, capacity) VALUES
    ('slot_1000', '10:00', '10:30', 10),
    ('slot_1030', '10:30', '11:00', 10),
    ('slot_1100', '11:00', '11:30', 10),
    ('slot_1130', '11:30', '12:00', 10),
    ('slot_1200', '12:00', '12:30', 10),
    ('slot_1230', '12:30', '13:00', 10),
    ('slot_1300', '13:00', '13:30', 10),
    ('slot_1330', '13:30', '14:00', 10),
    ('slot_1400', '14:00', '14:30', 10),
    ('slot_1430', '14:30', '15:00', 10),
    ('slot_1500', '15:00', '15:30', 10),
    ('slot_1530', '15:30', '16:00', 10),
    ('slot_1600', '16:00', '16:30', 10),
    ('slot_1630', '16:30', '17:00', 10),
    ('slot_1700', '17:00', '17:30', 10),
    ('slot_1730', '17:30', '18:00', 10);
