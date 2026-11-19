// Find an existing hiker without exposing password data to the service.
async function findHikerById(client, hikerId) {
  const { rows } = await client.query(
    `SELECT id, email, first_name, last_name, phone, is_temporary
     FROM app_user
     WHERE id = $1 AND role = 'hiker'`,
    [hikerId],
  );
  return rows[0] ?? null;
}

// Insert a new registered or temporary hiker using the current booking transaction.
async function insertHiker(client, hiker, passwordHash, salt) {
  const { rows } = await client.query(
    `INSERT INTO app_user (
       email, password_hash, salt, first_name, last_name, phone,
       emergency_contact_name, emergency_contact_phone, notes,
       must_change_password, is_temporary, role
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'hiker')
     RETURNING id, email, first_name, last_name, phone, is_temporary`,
    [
      hiker.email,
      passwordHash,
      salt,
      hiker.firstName,
      hiker.lastName,
      hiker.phone,
      hiker.emergencyContactName,
      hiker.emergencyContactPhone,
      hiker.notes,
      !hiker.isTemporary,
      hiker.isTemporary,
    ],
  );
  return rows[0];
}

// Load the staff identity that will be recorded on the reservation and returned to the caller.
async function findStaffMemberById(client, staffId) {
  const { rows } = await client.query(
    `SELECT id, first_name AS "firstName", last_name AS "lastName", role
     FROM app_user
     WHERE id = $1 AND role IN ('employee', 'warden')`,
    [staffId],
  );
  return rows[0] ?? null;
}

// Insert a confirmed reservation attributed to the staff member who entered it.
async function insertStaffReservation(client, hikerId, slotId, partySize, staffId) {
  const { rows } = await client.query(
    `INSERT INTO reservation (hiker_id, slot_id, party_size, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [hikerId, slotId, partySize, staffId],
  );
  return rows[0].id;
}

export default {findHikerById, insertHiker, findStaffMemberById, insertStaffReservation};
