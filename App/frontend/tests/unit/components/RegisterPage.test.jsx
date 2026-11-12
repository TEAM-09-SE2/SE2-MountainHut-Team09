import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import RegisterPage from "../../../src/components/auth/RegisterPage";
import { registerUser } from "../../../src/services/authApi";

//No real backend: each test decides what the API returns
vi.mock("../../../src/services/authApi", () => ({
  registerUser: vi.fn(),
}));

const PAIR_HINT = "Provide both emergency contact name and phone, or leave both blank.";

function renderRegister() {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <RegisterPage />
    </MemoryRouter>,
  );
  return user;
}

//Fills only the required fields with valid values
async function fillRequiredFields(user) {
  await user.type(screen.getByLabelText("First name"), "Anna");
  await user.type(screen.getByLabelText("Last name"), "Neri");
  await user.type(screen.getByLabelText("Email"), "anna@example.com");
  await user.type(screen.getByLabelText("Password"), "Hiker123");
  await user.type(screen.getByLabelText("Confirm password"), "Hiker123");
}

const submit = (user) => user.click(screen.getByRole("button", { name: /Create my account/ }));

beforeEach(() => {
  vi.clearAllMocks();
  registerUser.mockResolvedValue({ id: 8 });
});

describe("RegisterPage", () => {
  it("sends only the required fields when the optional ones are empty", async () => {
    const user = renderRegister();
    await fillRequiredFields(user);

    await submit(user);

    expect(await screen.findByText("Account created successfully")).toBeInTheDocument();
    expect(registerUser).toHaveBeenCalledWith({
      firstName: "Anna",
      lastName: "Neri",
      email: "anna@example.com",
      password: "Hiker123",
    });
  });

  it("sends the emergency contact and the notes trimmed", async () => {
    const user = renderRegister();
    await fillRequiredFields(user);
    await user.type(screen.getByLabelText("Emergency contact name (optional)"), "  Marco Neri ");
    await user.type(screen.getByLabelText("Emergency contact phone (optional)"), "3337654321");
    await user.type(screen.getByLabelText("Notes (optional)"), " Arriving by bike ");

    await submit(user);

    await waitFor(() => expect(registerUser).toHaveBeenCalledTimes(1));
    expect(registerUser.mock.calls[0][0]).toMatchObject({
      emergencyContactName: "Marco Neri",
      emergencyContactPhone: "3337654321",
      notes: "Arriving by bike",
    });
  });

  it("does not submit an emergency contact name without its phone", async () => {
    const user = renderRegister();
    await fillRequiredFields(user);
    await user.type(screen.getByLabelText("Emergency contact name (optional)"), "Marco Neri");

    await submit(user);

    //The pair rule is shown by the hint below the two fields, which turns amber
    expect(screen.getByText(PAIR_HINT)).toHaveClass("text-amber-700");
    expect(registerUser).not.toHaveBeenCalled();
  });

  it("does not submit an emergency contact phone without its name", async () => {
    const user = renderRegister();
    await fillRequiredFields(user);
    await user.type(screen.getByLabelText("Emergency contact phone (optional)"), "3337654321");

    await submit(user);

    expect(screen.getByText(PAIR_HINT)).toHaveClass("text-amber-700");
    expect(registerUser).not.toHaveBeenCalled();
  });

  it("keeps the pair hint neutral when both emergency fields are empty or both filled", async () => {
    const user = renderRegister();

    expect(screen.getByText(PAIR_HINT)).toHaveClass("text-slate-500");

    await user.type(screen.getByLabelText("Emergency contact name (optional)"), "Marco Neri");
    await user.type(screen.getByLabelText("Emergency contact phone (optional)"), "3337654321");

    expect(screen.getByText(PAIR_HINT)).toHaveClass("text-slate-500");
  });

  it("shows an error for an emergency contact phone with non-digits", async () => {
    const user = renderRegister();
    await fillRequiredFields(user);
    await user.type(screen.getByLabelText("Emergency contact name (optional)"), "Marco Neri");
    await user.type(screen.getByLabelText("Emergency contact phone (optional)"), "333-765");

    await submit(user);

    expect(await screen.findByText("Emergency contact phone can only contain digits.")).toBeInTheDocument();
    expect(registerUser).not.toHaveBeenCalled();
  });

  it("shows an error when the notes are longer than 1000 characters", async () => {
    const user = renderRegister();
    await fillRequiredFields(user);
    //The textarea has maxLength=1000, so typing stops there: the value is set directly to test the schema
    fireEvent.change(screen.getByLabelText("Notes (optional)"), { target: { value: "N".repeat(1001) } });

    await submit(user);

    expect(await screen.findByText("Notes cannot exceed 1000 characters.")).toBeInTheDocument();
    expect(registerUser).not.toHaveBeenCalled();
  });

  it("explains that the email is already registered on a 409", async () => {
    registerUser.mockRejectedValue(
      Object.assign(new Error("An account with this email already exists."), { status: 409, code: "EMAIL_ALREADY_USED" }),
    );
    const user = renderRegister();
    await fillRequiredFields(user);

    await submit(user);

    expect(
      await screen.findByText("This email is already registered. Try logging in or use a different email."),
    ).toBeInTheDocument();
  });
});
