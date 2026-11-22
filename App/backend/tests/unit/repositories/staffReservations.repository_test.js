import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import pool from "../../../src/database/connection.js";
import hikersRepository from "../../../src/database/hikers.repository.js";
import staffReservationsRepository from "../../../src/database/staffReservations.repository.js";

afterEach(() => {
  mock.reset();
});

describe("hikers and staffReservations repositories unit tests (MH-07)", () => {
  it("hikersRepository.searchHikers escapes LIKE wildcards and maps rows to camelCase", async () => {
    const queryMock = mock.method(pool, "query", async () => ({
      rows: [
        {
          id: 4,
          first_name: "Anna",
          last_name: "Neri_100%",
          email: "anna@example.com",
          phone: "3331234567",
          is_temporary: false,
        },
      ],
    }));

    const results = await hikersRepository.searchHikers("Neri_100%\\test");

    assert.equal(queryMock.mock.callCount(), 1);
    const [, params] = queryMock.mock.calls[0].arguments;
    assert.deepEqual(params, ["%Neri\\_100\\%\\\\test%"]);
    assert.deepEqual(results, [
      {
        id: 4,
        firstName: "Anna",
        lastName: "Neri_100%",
        email: "anna@example.com",
        phone: "3331234567",
        isTemporary: false,
      },
    ]);
  });

  it("staffReservationsRepository.findHikerById and findStaffMemberById return row or null", async () => {
    const client = {
      async query(sql, [id]) {
        if (id === 1) {
          return { rows: [{ id: 1, first_name: "Anna" }] };
        }
        return { rows: [] };
      },
    };

    assert.deepEqual(await staffReservationsRepository.findHikerById(client, 1), {
      id: 1,
      first_name: "Anna",
    });
    assert.equal(await staffReservationsRepository.findHikerById(client, 99), null);

    assert.deepEqual(await staffReservationsRepository.findStaffMemberById(client, 1), {
      id: 1,
      first_name: "Anna",
    });
    assert.equal(await staffReservationsRepository.findStaffMemberById(client, 99), null);
  });

  it("staffReservationsRepository.insertHiker sets must_change_password inversely to isTemporary", async () => {
    const capturedParams = [];
    const client = {
      async query(_sql, params) {
        capturedParams.push(params);
        return { rows: [{ id: capturedParams.length, is_temporary: params[10] }] };
      },
    };

    await staffReservationsRepository.insertHiker(
      client,
      {
        email: "anna@example.com",
        firstName: "Anna",
        lastName: "Neri",
        phone: null,
        emergencyContactName: null,
        emergencyContactPhone: null,
        notes: null,
        isTemporary: false,
      },
      "hash-val",
      "salt-val",
    );

    await staffReservationsRepository.insertHiker(
      client,
      {
        email: null,
        firstName: "Luca",
        lastName: "Bianchi",
        phone: null,
        emergencyContactName: null,
        emergencyContactPhone: null,
        notes: null,
        isTemporary: true,
      },
      null,
      null,
    );

    // index 9 is must_change_password, index 10 is is_temporary
    assert.equal(capturedParams[0][9], true);
    assert.equal(capturedParams[0][10], false);
    assert.equal(capturedParams[1][9], false);
    assert.equal(capturedParams[1][10], true);
  });

  it("staffReservationsRepository.insertStaffReservation returns the new reservation id", async () => {
    const client = {
      async query(_sql, params) {
        assert.deepEqual(params, [4, 7, 3, 2]);
        return { rows: [{ id: 88 }] };
      },
    };

    const id = await staffReservationsRepository.insertStaffReservation(client, 4, 7, 3, 2);
    assert.equal(id, 88);
  });
});