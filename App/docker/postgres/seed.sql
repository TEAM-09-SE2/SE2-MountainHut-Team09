SET TIME ZONE 'Europe/Rome';

TRUNCATE password_reset_token, reservation_requirement, reservation_seat, reservation, slot_table, slot, app_user
RESTART IDENTITY CASCADE;

-- Users: one warden, three employees, five regular hikers, and one temporary hiker.
-- Development passwords for users 1-7: Warden123! for the warden, Employee123! for employees,
-- and Hiker123! for hikers. The hiker email aliases deliver to mountainhut.09@gmail.com.
-- Users 8 and 9 have separate generated temporary passwords and must change them at first login.
INSERT INTO app_user (
    id, email, password_hash, salt, first_name, last_name, phone,
    emergency_contact_name, emergency_contact_phone, notes,
    must_change_password, is_temporary, role
) VALUES
 (1, 'warden@rifugio.it',              'd5982775c2f7693fa35ba0ec8d61de39a816c29042ac62cbce4bf27d71692f49', '9595c847c5e23439c154cbd9bc4b7287', 'Marco',  'Rossi',   '3331112222', NULL,         NULL,         NULL,                                       false, false, 'warden'),
 (2, 'giulia@rifugio.it',              '0cf3200742a7bda3b7690b5491cedfb8c3ee937a7c1193d3db6efb9aec9bbfd2', 'c27ee90ec7203621f15140fb0fccac32', 'Giulia', 'Bianchi', '3332223333', NULL,         NULL,         NULL,                                       false, false, 'employee'),
 (3, 'luca@rifugio.it',                'bc671a234586fb37928cd2998f607fa3b8117f39f73113e20219d7141eaaf110', 'adf7accd7b576ca244fbc42a4b8cdf9e', 'Luca',   'Verdi',   '3333334444', NULL,         NULL,         NULL,                                       false, false, 'employee'),
 (4, 'mountainhut.09+anna@gmail.com',  'e38689fd629ff3872191353eff327bf625ded9ac5abbf0a83b89bf82f6738bf6', '495154581e7d6e23f63869c44be19d22', 'Anna',   'Neri',    '3471234567', 'Paola Neri', '3334445566', 'Peanut allergy; vegetarian meals preferred.', false, false, 'hiker'),
 (5, 'mountainhut.09+paolo@gmail.com', '2415de689ba8e819c9d8e8c6ab098d458646371529c7ae49b5266b7e71fd6f93', 'c9ae1724595112532ae26451c04eefa9', 'Paolo',  'Gallo',   '3487654321', NULL,         NULL,         NULL,                                       false, false, 'hiker'),
 (6, 'mountainhut.09+sara@gmail.com',  'd2c601e99c7303e047fe81308fb6a8824c782c2057bc9455fc866dae7558ef81', 'eca2427991e2fc01564b0013cba2dfdb', 'Sara',   'Conti',   '3201112233', 'Mario Conti','3391112222', NULL,                                       false, false, 'hiker'),
 (7, 'mountainhut.09+tom@gmail.com',   '6638926aa42c8143eec0fb8f0082fd7505859084d4fd3bd45e8cd1b76fccc30b', '023f1c6b1903672e9dc2f8070d7b4906', 'Tom',    'Smith',   NULL,         NULL,         NULL,         NULL,                                       false, false, 'hiker'),
 (8, 'alessandro@rifugio.it',          'c614d6e8fc22ae1a95490c8c19fabf17ffdc87f0c1b597ec1aa8376e1eba8757', '8f6866ce2cb7fd1ae95ddd8d56588277', 'Alessandro',  'Serra',   '3335556677', NULL,         NULL,         NULL,                                  true,  false, 'employee'),
 (9, 'mountainhut.09+elena@gmail.com', '37ec0baa8b633720797f2d81a1b535eeee814da728160c6120fd122f22d6a501', 'e12f8d438550654dfb00854c8fdc9ddc', 'Elena',  'Fontana', '3491234567', 'Elena Fontana', '3395556677', 'Vegetarian meals preferred.',           true,  false, 'hiker'),
 (10, NULL, NULL, NULL, 'Giovanni', 'Riva', '3401234567', NULL, NULL, NULL, false, true, 'hiker');

-- Meal slots (D is midnight at the start of today).
INSERT INTO slot (id, start_at, end_at, created_by) VALUES
 -- 1: yesterday at lunch, already past
 (1, current_date - 1 + time '12:00', current_date - 1 + time '13:00', 2),
 -- 2: starts in one hour, inside the two-hour booking cutoff
 (2, date_trunc('hour', now()) + interval '1 hour', date_trunc('hour', now()) + interval '2 hours', 2),
 -- 3: tomorrow at lunch, first seating with the sunny-weather layout
 (3, current_date + 1 + time '12:00', current_date + 1 + time '13:00', 2),
 -- 4: tomorrow at lunch, second seating with a copy of slot 3's layout
 (4, current_date + 1 + time '13:00', current_date + 1 + time '14:00', 3),
 -- 5: tomorrow at dinner, fully booked
 (5, current_date + 1 + time '19:30', current_date + 1 + time '21:00', 1),
 -- 6: the day after tomorrow, rainy-weather layout with scattered free seats
 (6, current_date + 2 + time '12:00', current_date + 2 + time '13:30', 3),
 -- 7: one week ahead, used for staff-entered bookings
 (7, current_date + 7 + time '12:00', current_date + 7 + time '13:00', 1);

-- Tables
INSERT INTO slot_table (id, slot_id, table_number, seats) VALUES
 -- Slot 1: three tables
 ( 1, 1, 1, 4), ( 2, 1, 2, 4), ( 3, 1, 3, 2),
 -- Slot 2: two tables
 ( 4, 2, 1, 4), ( 5, 2, 2, 6),
 -- Slot 3: 24 seats
 ( 6, 3, 1, 4), ( 7, 3, 2, 4), ( 8, 3, 3, 6), ( 9, 3, 4, 6), (10, 3, 5, 2), (11, 3, 6, 2),
 -- Slot 4: copied layout from slot 3
 (12, 4, 1, 4), (13, 4, 2, 4), (14, 4, 3, 6), (15, 4, 4, 6), (16, 4, 5, 2), (17, 4, 6, 2),
 -- Slot 5: 20 seats, fully booked
 (18, 5, 1, 8), (19, 5, 2, 6), (20, 5, 3, 4), (21, 5, 4, 2),
 -- Slot 6: 14 seats, with scattered availability
 (22, 6, 1, 4), (23, 6, 2, 4), (24, 6, 3, 2), (25, 6, 4, 4),
 -- Slot 7: 16 seats
 (26, 7, 1, 4), (27, 7, 2, 4), (28, 7, 3, 4), (29, 7, 4, 4);

-- Reservations
INSERT INTO reservation (
    id, hiker_id, slot_id, party_size, status, created_at, confirmation_sent_at,
    updated_at, created_by, cancelled_at, cancelled_by
) VALUES
 -- Slot 1: past bookings, including a cancellation by the hiker
 ( 1, 4, 1, 4, 'confirmed', now() - interval '5 days', now() - interval '5 days', NULL, NULL, NULL, NULL),
 ( 2, 5, 1, 2, 'cancelled', now() - interval '4 days', now() - interval '4 days', NULL, NULL, now() - interval '4 days', 5),
 -- Slot 2: starts in one hour
 ( 3, 6, 2, 3, 'confirmed', now() - interval '1 day',  now() - interval '1 day',  NULL, NULL, NULL, NULL),
 -- Slot 3: 13 of 24 seats booked; reservation 4 was changed by the hiker
 ( 4, 4, 3, 6, 'confirmed', now() - interval '2 days', now() - interval '2 days', now() - interval '1 day', NULL, NULL, NULL),
 ( 5, 5, 3, 5, 'confirmed', now() - interval '2 days', now() - interval '2 days', NULL, NULL, NULL, NULL),
 ( 6, 7, 3, 2, 'confirmed', now() - interval '1 day',  now() - interval '1 day',  NULL, NULL, NULL, NULL),
 ( 7, 6, 3, 3, 'cancelled', now() - interval '3 days', now() - interval '3 days', NULL, NULL, now() - interval '3 days', 6),
 -- Slot 5: fully booked
 ( 8, 4, 5, 8, 'confirmed', now() - interval '3 days', now() - interval '3 days', NULL, NULL, NULL, NULL),
 ( 9, 5, 5, 6, 'confirmed', now() - interval '3 days', now() - interval '3 days', NULL, NULL, NULL, NULL),
 (10, 6, 5, 4, 'confirmed', now() - interval '2 days', now() - interval '2 days', NULL, NULL, NULL, NULL),
 (11, 7, 5, 2, 'confirmed', now() - interval '1 day',  NULL,                          NULL, NULL, NULL, NULL), -- confirmation email not sent
 -- Slot 6: 2 + 3 + 1 seats remain free
 (12, 4, 6, 2, 'confirmed', now() - interval '1 day', now() - interval '1 day', NULL, NULL, NULL, NULL),
 (13, 6, 6, 5, 'confirmed', now() - interval '1 day', now() - interval '1 day', NULL, NULL, NULL, NULL),
 (14, 7, 6, 1, 'confirmed', now() - interval '1 day', now() - interval '1 day', NULL, NULL, NULL, NULL),
 -- Slot 7: a staff-entered booking for a full account created with a temporary password
 (15, 9, 7, 4, 'confirmed', now() - interval '2 days', now() - interval '2 days', now() - interval '1 day', 2, NULL, NULL),
 -- Slot 7: staff-entered booking for a temporary hiker; no confirmation email is sent
 (16, 10, 7, 2, 'confirmed', now() - interval '1 day', NULL, NULL, 2, NULL, NULL);

-- Assigned seats. Cancelled bookings keep their seat allocations as history.
INSERT INTO reservation_seat (reservation_id, slot_table_id, slot_id, seats) VALUES
 ( 1,  1, 1, 4),
 ( 2,  3, 1, 2),
 ( 3,  4, 2, 3),
 ( 4,  8, 3, 6),
 ( 5,  9, 3, 5),
 ( 6, 10, 3, 2),
 ( 7,  6, 3, 3),
 ( 8, 18, 5, 8),
 ( 9, 19, 5, 6),
 (10, 20, 5, 4),
 (11, 21, 5, 2),
 (12, 22, 6, 2),
 (13, 25, 6, 4), (13, 23, 6, 1),
 (14, 24, 6, 1),
 (15, 26, 7, 4),
 (16, 27, 7, 2);

-- Dietary requirements; each reservation's people_count total stays within its party_size.
INSERT INTO reservation_requirement (reservation_id, people_count, has_allergies, description) VALUES
 -- A web booking with several requirements, including multiple allergies
 (4, 1, true,  'Vegan, peanut allergy'),
 (4, 1, true,  'Shellfish allergy'),
 (4, 2, false, 'Vegetarian'),
 -- Requirements remain attached to a cancelled booking as history
 (7, 1, true,  'Peanut allergy'),
 -- Staff-entered full-account booking
 (15, 1, true,  'Lactose allergy'),
 (15, 1, false, 'Vegan'),
 (15, 2, false, 'Vegetarian'),
 -- Staff-entered temporary-hiker booking
 (16, 1, true,  'Gluten allergy'),
 (16, 1, false, 'Vegetarian');

-- Password reset tokens: one unused valid token, one used token, and one expired token.
-- Only SHA-256 token hashes are stored; the corresponding raw tokens are not included.
INSERT INTO password_reset_token (id, user_id, token_hash, expires_at, used_at, created_at) VALUES
 (1, 4, '012bd7a8cf7ad0c949f161750a2094783ec3d4a9ad42ba2a438f16680ba1d468', now() + interval '23 hours', NULL, now() - interval '1 hour'),
 (2, 5, '59a70199e9d06a60d04f065935e181a444525061d3078190377b00f60501b46f', now() + interval '22 hours', now() - interval '30 minutes', now() - interval '2 hours'),
 (3, 6, 'fe4ddfdf32cdcaed77553f67b2dd94c6cb8d34638f3ac948a1efc3a5a9c4bd4b', now() - interval '1 day', NULL, now() - interval '2 days');

-- Align SERIAL counters after inserting explicit IDs.
SELECT setval('app_user_id_seq', (SELECT max(id) FROM app_user));
SELECT setval('slot_id_seq', (SELECT max(id) FROM slot));
SELECT setval('slot_table_id_seq', (SELECT max(id) FROM slot_table));
SELECT setval('reservation_id_seq', (SELECT max(id) FROM reservation));
SELECT setval('reservation_requirement_id_seq', (SELECT max(id) FROM reservation_requirement));
SELECT setval('password_reset_token_id_seq', (SELECT max(id) FROM password_reset_token));
