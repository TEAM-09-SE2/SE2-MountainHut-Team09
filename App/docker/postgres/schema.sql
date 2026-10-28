-- app_user 
CREATE TABLE IF NOT EXISTS app_user (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    salt VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(10),
    role VARCHAR(20) NOT NULL DEFAULT 'hiker' CHECK (role IN ('hiker', 'employee', 'warden')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- slot
CREATE TABLE IF NOT EXISTS slot (
    id SERIAL PRIMARY KEY,
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL CHECK (end_at > start_at),
    created_by INTEGER REFERENCES app_user(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- slot_table
CREATE TABLE IF NOT EXISTS slot_table (
    id SERIAL PRIMARY KEY,
    slot_id INTEGER NOT NULL REFERENCES slot(id) ON DELETE CASCADE,
    table_number INTEGER NOT NULL,
    seats INTEGER NOT NULL CHECK (seats > 0),
    UNIQUE (slot_id, table_number)
);

-- reservation
CREATE TABLE IF NOT EXISTS reservation (
    id SERIAL PRIMARY KEY,
    hiker_id INTEGER NOT NULL REFERENCES app_user(id),
    slot_id INTEGER NOT NULL REFERENCES slot(id),
    party_size INTEGER NOT NULL CHECK (party_size > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmation_sent_at TIMESTAMPTZ
);

-- reservation_seat
-- For implementing composite constraints (reservation_id, slot_id) and (slot_table_id, slot_id)
-- an additional UNIQUE constraint is needed.
ALTER TABLE reservation ADD CONSTRAINT reservation_slot_unique UNIQUE (id, slot_id);
ALTER TABLE slot_table ADD CONSTRAINT slot_table_slot_unique UNIQUE (id, slot_id);

CREATE TABLE IF NOT EXISTS reservation_seat (
    reservation_id INTEGER NOT NULL,
    slot_table_id INTEGER NOT NULL,
    slot_id INTEGER NOT NULL,
    seats INTEGER NOT NULL CHECK (seats > 0),
    PRIMARY KEY (reservation_id, slot_table_id),
    FOREIGN KEY (reservation_id) REFERENCES reservation(id) ON DELETE CASCADE,
    FOREIGN KEY (slot_table_id) REFERENCES slot_table(id),
    FOREIGN KEY (reservation_id, slot_id) REFERENCES reservation(id, slot_id),
    FOREIGN KEY (slot_table_id, slot_id) REFERENCES slot_table(id, slot_id)
);

-- View slot_table_free
CREATE OR REPLACE VIEW slot_table_free AS
SELECT 
    st.slot_id,
    st.id AS slot_table_id,
    st.table_number,
    st.seats,
    (st.seats - COALESCE(SUM(rs.seats), 0)) AS free_seats
FROM 
    slot_table st
LEFT JOIN 
    reservation r ON r.slot_id = st.slot_id AND r.status = 'confirmed'
LEFT JOIN 
    reservation_seat rs ON st.id = rs.slot_table_id AND rs.reservation_id = r.id
GROUP BY 
    st.slot_id, st.id, st.table_number, st.seats;