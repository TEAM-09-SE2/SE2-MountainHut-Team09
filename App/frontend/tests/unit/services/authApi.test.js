import {
  loginUser,
  registerUser,
  fetchCurrentUser,
  logoutUser,
  changePassword,
} from "../../../src/services/authApi";

const AUTH_URL = "http://localhost:4000/api/v1/auth";

//Fake fetch response with the given HTTP status and JSON body
const mockFetch = (status, body) =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });

afterEach(() => vi.restoreAllMocks());

describe("authApi", () => {
  it("changes the password with PUT and the session cookie, accepting an empty 204 response", async () => {
    const json = vi.fn();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, status: 204, json });
    await expect(changePassword("Temporary123!", "Permanent123!")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(`${AUTH_URL}/password`, {
      method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: "Temporary123!", newPassword: "Permanent123!" }),
    });
    expect(json).not.toHaveBeenCalled();
  });

  it.each([[400, "INVALID_INPUT"], [401, "INVALID_CREDENTIALS"], [401, "NOT_AUTHENTICATED"]])(
    "preserves password-change error %s %s", async (status, code) => {
      mockFetch(status, { error: code, message: "Password change failed." });
      await expect(changePassword("Temporary123!", "Permanent123!")).rejects.toMatchObject({
        status, code, message: "Password change failed.",
      });
    },
  );

  it("loginUser sends email and password with the session cookie and returns the user", async () => {
    const user = { id: 7, email: "anna@example.com", firstName: "Anna", lastName: "Neri", role: "hiker" };
    const fetchMock = mockFetch(200, user);

    const result = await loginUser("anna@example.com", "Hiker123!");

    expect(result).toEqual(user);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${AUTH_URL}/login`);
    expect(options).toMatchObject({ method: "POST", credentials: "include" });
    expect(JSON.parse(options.body)).toEqual({ email: "anna@example.com", password: "Hiker123!" });
  });

  it("loginUser rejects with the status, code and message of a 401", async () => {
    mockFetch(401, { error: "INVALID_CREDENTIALS", message: "Invalid email or password." });

    await expect(loginUser("anna@example.com", "wrong")).rejects.toMatchObject({
      status: 401,
      code: "INVALID_CREDENTIALS",
      message: "Invalid email or password.",
    });
  });

  it("registerUser sends the new optional fields as they are", async () => {
    const fetchMock = mockFetch(201, { id: 8 });
    const payload = {
      firstName: "Anna",
      lastName: "Neri",
      email: "anna@example.com",
      password: "Hiker123!",
      emergencyContactName: "Marco Neri",
      emergencyContactPhone: "3337654321",
      notes: "Arriving by bike",
    };

    await registerUser(payload);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${AUTH_URL}/register`);
    expect(options).toMatchObject({ method: "POST", credentials: "include" });
    expect(JSON.parse(options.body)).toEqual(payload);
  });

  it("fetchCurrentUser returns the full profile from /me", async () => {
    const profile = {
      id: 7,
      email: "anna@example.com",
      firstName: "Anna",
      lastName: "Neri",
      phone: null,
      emergencyContactName: "Marco Neri",
      emergencyContactPhone: "3337654321",
      notes: null,
      role: "hiker",
      mustChangePassword: false,
    };
    const fetchMock = mockFetch(200, profile);

    await expect(fetchCurrentUser()).resolves.toEqual(profile);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${AUTH_URL}/me`);
    expect(options).toMatchObject({ method: "GET", credentials: "include" });
  });

  it("logoutUser returns null on 204 without reading a body", async () => {
    const json = vi.fn();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, status: 204, json });

    await expect(logoutUser()).resolves.toBeNull();
    expect(json).not.toHaveBeenCalled();
  });

  it("uses a generic message when the error response has no JSON body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => { throw new SyntaxError("Unexpected end of JSON input"); },
    });

    await expect(loginUser("anna@example.com", "Hiker123!")).rejects.toMatchObject({
      status: 500,
      code: "UNKNOWN_ERROR",
      message: "An unexpected error occurred.",
    });
  });
});
