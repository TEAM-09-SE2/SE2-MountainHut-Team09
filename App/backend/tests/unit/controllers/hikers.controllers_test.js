import { afterEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import hikersController from "../../../src/controllers/hikers.controller.js";
import hikersService from "../../../src/services/hikers.service.js";

function createRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

afterEach(() => {
  mock.reset();
});

describe("hikers controller unit tests (MH-07)", () => {
  it("rejects queries shorter than 2 characters or missing with 400 INVALID_INPUT", async () => {
    const serviceMock = mock.method(hikersService, "searchHikers", async () => []);

    for (const q of [undefined, "", " ", "a", "  b  ", 123]) {
      const req = { query: { q } };
      const res = createRes();

      await assert.rejects(
        () => hikersController.searchHikers(req, res),
        (err) => {
          assert.equal(err.statusCode, 400);
          assert.equal(err.code, "INVALID_INPUT");
          return true;
        },
      );
    }

    assert.equal(serviceMock.mock.callCount(), 0);
  });

  it("trims the query, calls hikersService.searchHikers, and returns 200", async () => {
    const expected = [{ id: 10, firstName: "Luca", lastName: "Neri", isTemporary: true }];
    const serviceMock = mock.method(hikersService, "searchHikers", async () => expected);

    const req = { query: { q: "  Luca  " } };
    const res = createRes();

    await hikersController.searchHikers(req, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, expected);
    assert.deepEqual(serviceMock.mock.calls[0].arguments, ["Luca"]);
  });
});