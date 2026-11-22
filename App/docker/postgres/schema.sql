-- app_user 
CREATE TABLE IF NOT EXISTS app_user (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(64),
    salt VARCHAR(32),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone VARCHAR(10),
    emergency_contact_name VARCHAR(100),
    emergency_contact_phone VARCHAR(10),
    notes VARCHAR(1000),
    must_change_password BOOLEAN NOT NULL DEFAULT false,
    is_temporary BOOLEAN NOT NULL DEFAULT false,
    role VARCHAR(20) NOT NULL DEFAULT 'hiker' CHECK (role IN ('hiker', 'employee', 'warden')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
        (is_temporary = false AND email IS NOT NULL AND password_hash IS NOT NULL AND salt IS NOT NULL)
        OR
        (is_temporary = true AND role = 'hiker' AND email IS NULL AND password_hash IS NULL
         AND salt IS NULL AND must_change_password = false)
    ),
    CHECK ((emergency_contact_name IS NULL) = (emergency_contact_phone IS NULL))
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
    confirmation_sent_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    created_by INTEGER REFERENCES app_user(id),
    cancelled_at TIMESTAMPTZ,
    cancelled_by INTEGER REFERENCES app_user(id),
    CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL)),
    CHECK ((status = 'cancelled') = (cancelled_by IS NOT NULL))
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

-- reservation_requirement
CREATE TABLE IF NOT EXISTS reservation_requirement (
    id SERIAL PRIMARY KEY,
    reservation_id INTEGER NOT NULL REFERENCES reservation(id) ON DELETE CASCADE,
    people_count INTEGER NOT NULL CHECK (people_count > 0),
    has_allergies BOOLEAN NOT NULL DEFAULT false,
    description VARCHAR(500) NOT NULL CHECK (length(trim(description)) > 0)
);

-- password_reset_token
CREATE TABLE IF NOT EXISTS password_reset_token (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
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