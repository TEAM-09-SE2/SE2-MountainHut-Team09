import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import hikersService from "../../../src/services/hikers.service.js";
import hikersRepository from "../../../src/database/hikers.repository.js";

afterEach(() => {
  mock.reset();
});

describe("hikers service unit tests (MH-07)", () => {
  it("delegates searchHikers to hikersRepository and returns matching hikers", async () => {
    const matches = [
      { id: 4, firstName: "Anna", lastName: "Neri", email: "anna@example.com", isTemporary: false },
      { id: 9, firstName: "Luca", lastName: "Neri", email: null, isTemporary: true },
    ];
    const repoMock = mock.method(hikersRepository, "searchHikers", async () => matches);

    const result = await hikersService.searchHikers("Neri");

    assert.deepEqual(result, matches);
    assert.deepEqual(repoMock.mock.calls[0].arguments, ["Neri"]);
  });

  it("propagates repository errors", async () => {
    mock.method(hikersRepository, "searchHikers", async () => {
      throw new Error("database unavailable");
    });

    await assert.rejects(
      () => hikersService.searchHikers("Neri"),
      { message: "database unavailable" },
    );
  });
});