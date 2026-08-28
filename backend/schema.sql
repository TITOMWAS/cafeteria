-- Campus Cafeteria Database Schema
-- Run this against your PostgreSQL database: cafeteria_db

-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  student_id VARCHAR(50) UNIQUE,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  role VARCHAR(20) DEFAULT 'student' CHECK (role IN ('student', 'staff', 'admin')),
  theme_preference VARCHAR(10) DEFAULT 'light' CHECK (theme_preference IN ('dark', 'light')),
  totp_secret VARCHAR(64),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Migration guard for existing databases
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(64);
DO $$ BEGIN
  ALTER TABLE transactions ADD CONSTRAINT transactions_payment_reference_key UNIQUE (payment_reference);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN invalid_table_definition THEN NULL; END $$;

-- Meals Table
CREATE TABLE IF NOT EXISTS meals (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  image_url TEXT,
  category VARCHAR(20) NOT NULL CHECK (category IN ('breakfast', 'lunch', 'supper')),
  quantity_available INTEGER DEFAULT 0,
  availability BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Orders Table
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  guest_name VARCHAR(100),
  phone_number VARCHAR(20) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'preparing', 'ready', 'served', 'expired')),
  total_amount DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  served_at TIMESTAMP
);

-- Migration guard for existing databases
ALTER TABLE orders ADD COLUMN IF NOT EXISTS served_at TIMESTAMP;

-- Order Items Table
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  meal_id INTEGER REFERENCES meals(id) ON DELETE SET NULL,
  meal_name VARCHAR(100),
  quantity INTEGER NOT NULL DEFAULT 1
);

-- Transactions Table
CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'success', 'failed')),
  payment_reference VARCHAR(100) UNIQUE,
  payment_method VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Notifications Table (admin broadcasts to roles / everyone)
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(20) DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error')),
  target_role VARCHAR(20) DEFAULT 'all' CHECK (target_role IN ('all', 'student', 'staff', 'admin')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Per-user read receipts for notifications
CREATE TABLE IF NOT EXISTS notification_reads (
  notification_id INTEGER REFERENCES notifications(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (notification_id, user_id)
);

-- Missed-meal carryovers: uncollected orders are swept here at the end of their
-- serving session and can be redeemed during the NEXT session the same day.
-- e.g. a missed lunch (12:00-15:00) becomes redeemable at supper (18:00-21:00).
CREATE TABLE IF NOT EXISTS meal_carryovers (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  guest_name VARCHAR(100),
  phone_number VARCHAR(20),
  code VARCHAR(8) UNIQUE,
  items JSONB NOT NULL DEFAULT '[]',
  total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  original_session VARCHAR(20) NOT NULL CHECK (original_session IN ('breakfast', 'lunch', 'supper')),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'redeemed', 'expired')),
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL
);

-- Student favourite meals (one-tap reorder support)
CREATE TABLE IF NOT EXISTS favourites (
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  meal_id INTEGER REFERENCES meals(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, meal_id)
);

-- Meal ratings (1-5 stars) submitted after an order is served
CREATE TABLE IF NOT EXISTS meal_ratings (
  id SERIAL PRIMARY KEY,
  meal_id INTEGER REFERENCES meals(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (meal_id, user_id)
);

-- Audit trail for privileged actions (admin accountability)
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_name VARCHAR(100),
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(40),
  entity_id VARCHAR(40),
  details JSONB,
  ip VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Password reset tokens (single-use, time-limited)
CREATE TABLE IF NOT EXISTS password_resets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(128) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Seed: Default users (password for ALL seeded accounts: password)
-- 2FA: no TOTP secret is seeded - staff/admin enroll via the Secure Access page on first login.
-- Student accounts must follow the strict reg-number format: CT207/119148/24
INSERT INTO users (student_id, name, email, password_hash, phone, role) VALUES
  ('ADMIN001', 'Cafeteria Admin', 'admin@cafeteria.ac.ke', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', '0700000001', 'admin'),
  ('STAFF001', 'Counter Staff', 'staff@cafeteria.ac.ke', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', '0700000002', 'staff'),
  ('CT207/119148/24', 'Demo Student', 'student@synapse.ac.ke', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', '0700000003', 'student')
ON CONFLICT DO NOTHING;

-- Migrate legacy demo student IDs to the strict format on existing databases
UPDATE users SET student_id = 'CT207/119148/24' WHERE student_id = 'STUDENT001' AND role = 'student';

-- Seed: Meal data
-- Remove duplicate meals first (databases seeded before the name constraint existed)
DELETE FROM meals a USING meals b WHERE a.id > b.id AND a.name = b.name;
CREATE UNIQUE INDEX IF NOT EXISTS idx_meals_name_unique ON meals(name);

INSERT INTO meals (name, description, price, image_url, category, quantity_available) VALUES
  -- Breakfast
  ('Pancakes & Maple Syrup', 'Fluffy golden pancakes served with rich maple syrup and butter', 150, 'https://images.unsplash.com/photo-1528207776546-365bb710ee93?auto=format&fit=crop&w=600&q=80', 'breakfast', 30),
  ('Spanish Omelet', 'Three-egg omelet with tomatoes, onions, bell peppers and cheese', 100, 'https://images.unsplash.com/photo-1510693060754-07e0ea94f5fb?auto=format&fit=crop&w=600&q=80', 'breakfast', 25),
  ('Mandazi & Tea', 'Crispy East African doughnuts served with a cup of hot milk tea', 80, 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=600&q=80', 'breakfast', 40),
  ('Porridge & Bread', 'Creamy sorghum porridge served with two slices of toasted bread', 70, 'https://images.unsplash.com/photo-1517686469429-8bdb88b9f907?auto=format&fit=crop&w=600&q=80', 'breakfast', 50),
  -- Lunch
  ('Chicken Pilau', 'Aromatic spiced rice cooked with tender chicken chunks and pilau masala', 200, 'https://images.unsplash.com/photo-1604152135912-04a022e23696?auto=format&fit=crop&w=600&q=80', 'lunch', 35),
  ('Chapati & Beans', 'Soft layered flatbread served with well-spiced kidney beans stew', 120, 'https://plus.unsplash.com/premium_photo-1663089688180-2a3a0e6981be?auto=format&fit=crop&w=600&q=80', 'lunch', 40),
  ('Rice & Chicken Stew', 'Steamed white rice served with a rich tomato-based chicken stew', 180, 'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=600&q=80', 'lunch', 30),
  ('Ugali & Beef', 'Traditional ugali paired with slow-cooked tender beef stew and vegetables', 160, 'https://images.unsplash.com/photo-1625937175440-cc5441d6b1d4?auto=format&fit=crop&w=600&q=80', 'lunch', 45),
  -- Supper
  ('Githeri Special', 'Mixed maize and beans slow-cooked with tomatoes, onions and spices', 100, 'https://images.unsplash.com/photo-1540914124281-342587941389?auto=format&fit=crop&w=600&q=80', 'supper', 35),
  ('Pasta Bolognese', 'Al dente penne pasta in a rich tomato and minced beef sauce', 220, 'https://images.unsplash.com/photo-1551892374-ecf8754cf8b0?auto=format&fit=crop&w=600&q=80', 'supper', 20),
  ('Sukuma Wiki & Ugali', 'Collard greens sautéed with onions, served with ugali and fried fish', 130, 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=600&q=80', 'supper', 40)
ON CONFLICT DO NOTHING;

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(DATE(created_at));
CREATE INDEX IF NOT EXISTS idx_meals_category ON meals(category);
CREATE INDEX IF NOT EXISTS idx_notifications_role ON notifications(target_role, created_at);
CREATE INDEX IF NOT EXISTS idx_carryovers_status ON meal_carryovers(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ratings_meal ON meal_ratings(meal_id);

-- Seed: welcome notifications
INSERT INTO notifications (title, message, type, target_role) VALUES
  ('Welcome to Synapse Cafeteria', 'Pre-order your meals and skip the queue. Pay with M-Pesa in seconds.', 'info', 'all'),
  ('Breakfast served 06:00 – 10:00', 'Order before 10:00 AM and pick up at the counter without waiting.', 'info', 'student')
ON CONFLICT DO NOTHING;
