SET TIME ZONE 'Europe/Rome';
 
TRUNCATE reservation_seat, reservation, slot_table, slot, app_user RESTART IDENTITY CASCADE;
 
-- ---------------------------------------------------------------
-- Utenti: 1 warden, 2 employee, 4 hiker
-- Password (hash PBKDF2 come in cryptoUtils.js): warden Warden123!, employee Employee123!,
-- hiker Hiker123! (elenco completo nel README)
-- Gli hiker usano indirizzi "+" della casella del progetto: le email di conferma
-- (MH-03) arrivano davvero, tutte in mountainhut.09@gmail.com
-- ---------------------------------------------------------------
INSERT INTO app_user (id, email, password_hash, salt, first_name, last_name, phone, role) VALUES
 (1, 'warden@rifugio.it',              'd5982775c2f7693fa35ba0ec8d61de39a816c29042ac62cbce4bf27d71692f49', '9595c847c5e23439c154cbd9bc4b7287', 'Marco',  'Rossi',   '3331112222', 'warden'),
 (2, 'giulia@rifugio.it',              '0cf3200742a7bda3b7690b5491cedfb8c3ee937a7c1193d3db6efb9aec9bbfd2', 'c27ee90ec7203621f15140fb0fccac32', 'Giulia', 'Bianchi', '3332223333', 'employee'),
 (3, 'luca@rifugio.it',                'bc671a234586fb37928cd2998f607fa3b8117f39f73113e20219d7141eaaf110', 'adf7accd7b576ca244fbc42a4b8cdf9e', 'Luca',   'Verdi',   '3333334444', 'employee'),
 (4, 'mountainhut.09+anna@gmail.com',  'e38689fd629ff3872191353eff327bf625ded9ac5abbf0a83b89bf82f6738bf6', '495154581e7d6e23f63869c44be19d22', 'Anna',   'Neri',    '3471234567', 'hiker'),
 (5, 'mountainhut.09+paolo@gmail.com', '2415de689ba8e819c9d8e8c6ab098d458646371529c7ae49b5266b7e71fd6f93', 'c9ae1724595112532ae26451c04eefa9', 'Paolo',  'Gallo',   '3487654321', 'hiker'),
 (6, 'mountainhut.09+sara@gmail.com',  'd2c601e99c7303e047fe81308fb6a8824c782c2057bc9455fc866dae7558ef81', 'eca2427991e2fc01564b0013cba2dfdb', 'Sara',   'Conti',   '3201112233', 'hiker'),
 (7, 'mountainhut.09+tom@gmail.com',   '6638926aa42c8143eec0fb8f0082fd7505859084d4fd3bd45e8cd1b76fccc30b', '023f1c6b1903672e9dc2f8070d7b4906', 'Tom',    'Smith',   NULL,         'hiker');
 
-- ---------------------------------------------------------------
-- Slot (D = oggi a mezzanotte)
-- ---------------------------------------------------------------
INSERT INTO slot (id, start_at, end_at, created_by) VALUES
 -- 1: ieri a pranzo, gia' passato
 (1, current_date - 1 + time '12:00', current_date - 1 + time '13:00', 2),
 -- 2: inizia tra un'ora -> prenotazioni chiuse (regola delle 2 ore)
 (2, date_trunc('hour', now()) + interval '1 hour', date_trunc('hour', now()) + interval '2 hours', 2),
 -- 3: domani pranzo, primo turno (disposizione "bel tempo")
 (3, current_date + 1 + time '12:00', current_date + 1 + time '13:00', 2),
 -- 4: domani pranzo, secondo turno, stessi tavoli copiati dal 3, vuoto
 (4, current_date + 1 + time '13:00', current_date + 1 + time '14:00', 3),
 -- 5: domani cena, completamente pieno
 (5, current_date + 1 + time '19:30', current_date + 1 + time '21:00', 1),
 -- 6: dopodomani pranzo (disposizione "pioggia"), posti liberi sparsi 2 + 3 + 1
 (6, current_date + 2 + time '12:00', current_date + 2 + time '13:30', 3),
 -- 7: tra una settimana, tutto libero
 (7, current_date + 7 + time '12:00', current_date + 7 + time '13:00', 1);
 
-- ---------------------------------------------------------------
-- Tavoli
-- ---------------------------------------------------------------
INSERT INTO slot_table (id, slot_id, table_number, seats) VALUES
 -- slot 1 (ieri): 3 tavoli
 ( 1, 1, 1, 4), ( 2, 1, 2, 4), ( 3, 1, 3, 2),
 -- slot 2 (tra un'ora): 2 tavoli
 ( 4, 2, 1, 4), ( 5, 2, 2, 6),
 -- slot 3 (domani 12-13, bel tempo): 24 posti
 ( 6, 3, 1, 4), ( 7, 3, 2, 4), ( 8, 3, 3, 6), ( 9, 3, 4, 6), (10, 3, 5, 2), (11, 3, 6, 2),
 -- slot 4 (domani 13-14): copia esatta dei tavoli dello slot 3
 (12, 4, 1, 4), (13, 4, 2, 4), (14, 4, 3, 6), (15, 4, 4, 6), (16, 4, 5, 2), (17, 4, 6, 2),
 -- slot 5 (domani cena): 20 posti, tutti occupati
 (18, 5, 1, 8), (19, 5, 2, 6), (20, 5, 3, 4), (21, 5, 4, 2),
 -- slot 6 (dopodomani, pioggia): 14 posti
 (22, 6, 1, 4), (23, 6, 2, 4), (24, 6, 3, 2), (25, 6, 4, 4),
 -- slot 7 (tra una settimana): 16 posti
 (26, 7, 1, 4), (27, 7, 2, 4), (28, 7, 3, 4), (29, 7, 4, 4);
 
-- ---------------------------------------------------------------
-- Prenotazioni
-- ---------------------------------------------------------------
INSERT INTO reservation (id, hiker_id, slot_id, party_size, status, created_at, confirmation_sent_at) VALUES
 -- slot 1 (passato)
 ( 1, 4, 1, 4, 'confirmed', now() - interval '5 days', now() - interval '5 days'),
 ( 2, 5, 1, 2, 'cancelled', now() - interval '4 days', now() - interval '4 days'),
 -- slot 2 (tra un'ora)
 ( 3, 6, 2, 3, 'confirmed', now() - interval '1 day',  now() - interval '1 day'),
 -- slot 3 (domani 12-13): 13 posti presi su 24
 ( 4, 4, 3, 6, 'confirmed', now() - interval '2 days', now() - interval '2 days'),
 ( 5, 5, 3, 5, 'confirmed', now() - interval '2 days', now() - interval '2 days'),
 ( 6, 7, 3, 2, 'confirmed', now() - interval '1 day',  now() - interval '1 day'),
 ( 7, 6, 3, 3, 'cancelled', now() - interval '3 days', now() - interval '3 days'),
 -- slot 5 (domani cena): pieno
 ( 8, 4, 5, 8, 'confirmed', now() - interval '3 days', now() - interval '3 days'),
 ( 9, 5, 5, 6, 'confirmed', now() - interval '3 days', now() - interval '3 days'),
 (10, 6, 5, 4, 'confirmed', now() - interval '2 days', now() - interval '2 days'),
 (11, 7, 5, 2, 'confirmed', now() - interval '1 day',  NULL),  -- mail di conferma non inviata
 -- slot 6 (dopodomani): restano liberi 2 + 3 + 1
 (12, 4, 6, 2, 'confirmed', now() - interval '1 day',  now() - interval '1 day'),
 (13, 6, 6, 5, 'confirmed', now() - interval '1 day',  now() - interval '1 day'),  -- comitiva divisa su 2 tavoli
 (14, 7, 6, 1, 'confirmed', now() - interval '1 day',  now() - interval '1 day');
 
-- ---------------------------------------------------------------
-- Posti assegnati (reservation_id, slot_table_id, slot_id, seats)
-- ---------------------------------------------------------------
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
 (14, 24, 6, 1);
 
-- Riallinea i contatori SERIAL dopo gli id inseriti a mano
SELECT setval('app_user_id_seq',    (SELECT max(id) FROM app_user));
SELECT setval('slot_id_seq',        (SELECT max(id) FROM slot));
SELECT setval('slot_table_id_seq',  (SELECT max(id) FROM slot_table));
SELECT setval('reservation_id_seq', (SELECT max(id) FROM reservation));
 