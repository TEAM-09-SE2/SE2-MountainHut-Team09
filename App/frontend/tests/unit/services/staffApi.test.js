import { createEmployee, fetchEmployees } from "../../../src/services/staffApi";

const URL = "http://localhost:4000/api/v1/staff/employees";
const employee = { email: "ada@example.com", firstName: "Ada", lastName: "Lovelace", password: "Temporary123!" };
afterEach(() => vi.restoreAllMocks());

describe("staffApi", () => {
  it("lists employees with the session cookie and preserves the returned order and fields", async () => {
    const list = [{ id: 7, firstName: "Ada", mustChangePassword: true, createdAt: "2026-11-15T12:00:00Z" }];
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, status: 200, json: async () => list });
    await expect(fetchEmployees()).resolves.toEqual(list);
    expect(request).toHaveBeenCalledWith(URL, { method: "GET", credentials: "include" });
  });

  it.each([undefined, "3331234567"])("creates an employee with optional phone %s", async (phone) => {
    const payload = phone ? { ...employee, phone } : employee;
    const saved = { id: 7, ...payload, role: "employee", mustChangePassword: true };
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, status: 201, json: async () => saved });
    await expect(createEmployee(payload)).resolves.toEqual(saved);
    expect(request).toHaveBeenCalledWith(URL, {
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
  });

  it.each([[400, "INVALID_INPUT"], [401, "NOT_AUTHENTICATED"], [403, "FORBIDDEN_ROLE"], [409, "EMAIL_ALREADY_USED"]])(
    "preserves creation error %s %s", async (status, code) => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status, json: async () => ({ error: code, message: "Request rejected." }) });
      await expect(createEmployee(employee)).rejects.toMatchObject({ status, code, message: "Request rejected." });
    },
  );

  it("handles a non-JSON server error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 502, json: async () => { throw new SyntaxError(); } });
    await expect(fetchEmployees()).rejects.toMatchObject({ status: 502, code: "UNKNOWN_ERROR", message: "An unexpected error occurred." });
  });

  it("propagates network failures", async () => {
    const failure = new TypeError("Network unavailable");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(failure);
    await expect(createEmployee(employee)).rejects.toBe(failure);
  });
});
