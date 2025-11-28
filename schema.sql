-- Oliebollen Costa Blanca Database Schema
-- Run this in the Cloudflare D1 Console if tables need to be recreated

-- Drop existing tables (careful - this deletes all data!)
-- DROP TABLE IF EXISTS orders;
-- DROP TABLE IF EXISTS timeslots;

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT UNIQUE NOT NULL,
    customer_data TEXT NOT NULL,  -- JSON string with customer info
    products TEXT NOT NULL,  -- JSON string
    timeslot_id TEXT NOT NULL,
    timeslot_label TEXT,
    total REAL NOT NULL,
    status TEXT DEFAULT 'pending',  -- pending, completed, noshow
    completed_at TEXT,
    created_at TEXT NOT NULL
);

-- Timeslots table (half-uur slots)
CREATE TABLE IF NOT EXISTS timeslots (
    id TEXT PRIMARY KEY,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    hour_block TEXT NOT NULL  -- e.g., "10:00-11:00" voor groepering
);

-- Product capacity per hour
-- Elk uur heeft aparte capaciteit per product
CREATE TABLE IF NOT EXISTS product_capacity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hour_block TEXT NOT NULL,  -- e.g., "10:00-11:00"
    product_id TEXT NOT NULL,  -- oliebol_krenten, oliebol_naturel, appelbeignet
    capacity INTEGER NOT NULL,  -- max aantal stuks van dit product in dit uur
    booked INTEGER DEFAULT 0,   -- aantal stuks al geboekt
    UNIQUE(hour_block, product_id)
);

-- Initialize timeslots (30-minute intervals from 10:00 to 18:00)
INSERT OR IGNORE INTO timeslots (id, start_time, end_time, hour_block) VALUES
    ('slot_1000', '10:00', '10:30', '10:00-11:00'),
    ('slot_1030', '10:30', '11:00', '10:00-11:00'),
    ('slot_1100', '11:00', '11:30', '11:00-12:00'),
    ('slot_1130', '11:30', '12:00', '11:00-12:00'),
    ('slot_1200', '12:00', '12:30', '12:00-13:00'),
    ('slot_1230', '12:30', '13:00', '12:00-13:00'),
    ('slot_1300', '13:00', '13:30', '13:00-14:00'),
    ('slot_1330', '13:30', '14:00', '13:00-14:00'),
    ('slot_1400', '14:00', '14:30', '14:00-15:00'),
    ('slot_1430', '14:30', '15:00', '14:00-15:00'),
    ('slot_1500', '15:00', '15:30', '15:00-16:00'),
    ('slot_1530', '15:30', '16:00', '15:00-16:00'),
    ('slot_1600', '16:00', '16:30', '16:00-17:00'),
    ('slot_1630', '16:30', '17:00', '16:00-17:00'),
    ('slot_1700', '17:00', '17:30', '17:00-18:00'),
    ('slot_1730', '17:30', '18:00', '17:00-18:00');

-- Initialize product capacity per hour
-- Standaard: 50 krenten, 50 naturel, 30 appelbeignets per uur
INSERT OR IGNORE INTO product_capacity (hour_block, product_id, capacity, booked) VALUES
    -- 10:00-11:00
    ('10:00-11:00', 'oliebol_krenten', 50, 0),
    ('10:00-11:00', 'oliebol_naturel', 50, 0),
    ('10:00-11:00', 'appelbeignet', 30, 0),
    -- 11:00-12:00
    ('11:00-12:00', 'oliebol_krenten', 50, 0),
    ('11:00-12:00', 'oliebol_naturel', 50, 0),
    ('11:00-12:00', 'appelbeignet', 30, 0),
    -- 12:00-13:00
    ('12:00-13:00', 'oliebol_krenten', 50, 0),
    ('12:00-13:00', 'oliebol_naturel', 50, 0),
    ('12:00-13:00', 'appelbeignet', 30, 0),
    -- 13:00-14:00
    ('13:00-14:00', 'oliebol_krenten', 50, 0),
    ('13:00-14:00', 'oliebol_naturel', 50, 0),
    ('13:00-14:00', 'appelbeignet', 30, 0),
    -- 14:00-15:00
    ('14:00-15:00', 'oliebol_krenten', 50, 0),
    ('14:00-15:00', 'oliebol_naturel', 50, 0),
    ('14:00-15:00', 'appelbeignet', 30, 0),
    -- 15:00-16:00
    ('15:00-16:00', 'oliebol_krenten', 50, 0),
    ('15:00-16:00', 'oliebol_naturel', 50, 0),
    ('15:00-16:00', 'appelbeignet', 30, 0),
    -- 16:00-17:00
    ('16:00-17:00', 'oliebol_krenten', 50, 0),
    ('16:00-17:00', 'oliebol_naturel', 50, 0),
    ('16:00-17:00', 'appelbeignet', 30, 0),
    -- 17:00-18:00
    ('17:00-18:00', 'oliebol_krenten', 50, 0),
    ('17:00-18:00', 'oliebol_naturel', 50, 0),
    ('17:00-18:00', 'appelbeignet', 30, 0);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_timeslot ON orders(timeslot_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_timeslots_hour_block ON timeslots(hour_block);
CREATE INDEX IF NOT EXISTS idx_product_capacity_hour_product ON product_capacity(hour_block, product_id);
