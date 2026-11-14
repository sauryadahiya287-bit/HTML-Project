CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  name VARCHAR(140) NOT NULL,
  venue VARCHAR(180) NOT NULL,
  event_date DATE NOT NULL,
  price INTEGER NOT NULL CHECK (price >= 0),
  category VARCHAR(32) NOT NULL CHECK (category IN ('tech', 'campus', 'music', 'design', 'community')),
  category_label VARCHAR(60) NOT NULL DEFAULT 'Community',
  description VARCHAR(1000) NOT NULL DEFAULT '',
  capacity INTEGER NOT NULL DEFAULT 1500 CHECK (capacity BETWEEN 1 AND 500000),
  is_sample BOOLEAN NOT NULL DEFAULT FALSE,
  creator_session_hash VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS events_date_idx ON events (event_date, created_at);
CREATE INDEX IF NOT EXISTS events_creator_idx ON events (creator_session_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS bookings (
  id VARCHAR(40) PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  session_hash VARCHAR(64) NOT NULL,
  attendee_name VARCHAR(120) NOT NULL,
  attendee_email VARCHAR(254) NOT NULL,
  tier VARCHAR(16) NOT NULL CHECK (tier IN ('standard', 'student', 'vip')),
  tier_name VARCHAR(60) NOT NULL,
  quantity SMALLINT NOT NULL CHECK (quantity BETWEEN 1 AND 5),
  unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
  subtotal INTEGER NOT NULL CHECK (subtotal >= 0),
  service_fee INTEGER NOT NULL CHECK (service_fee >= 0),
  total INTEGER NOT NULL CHECK (total = subtotal + service_fee),
  status VARCHAR(32) NOT NULL DEFAULT 'payment_required'
    CHECK (status IN ('payment_required', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bookings_session_idx ON bookings (session_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS bookings_event_idx ON bookings (event_id, created_at DESC);

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  email VARCHAR(254) PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
