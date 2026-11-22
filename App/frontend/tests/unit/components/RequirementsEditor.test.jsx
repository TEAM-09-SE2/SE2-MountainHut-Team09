import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import RequirementsEditor from "../../../src/components/booking/RequirementsEditor";

describe("RequirementsEditor", () => {
  it("explains that requirements are optional and shows the empty-party total", () => {
    // An empty requirements list is valid: hikers must be able to continue without
    // dietary notes, while still seeing how many guests could be covered.
    render(
      <RequirementsEditor requirements={[]} partySize={3} onChange={vi.fn()} />,
    );

    expect(screen.getByText("No requirements. Add one if someone in the party has allergies or a special diet.")).toBeInTheDocument();
    expect(screen.getByText("0 of 3 people associated · maximum 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add requirement" })).toBeEnabled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("adds a blank requirement with one person, no allergy flag, and an empty description", async () => {
    // The parent owns the list state, so adding a row must report a new list rather
    // than mutating the caller's existing array.
    const user = userEvent.setup();
    const onChange = vi.fn();
    const requirements = [];
    render(
      <RequirementsEditor
        requirements={requirements}
        partySize={2}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add requirement" }));

    expect(onChange).toHaveBeenCalledWith([
      { peopleCount: 1, hasAllergies: false, description: "" },
    ]);
    expect(requirements).toEqual([]);
  });

  it("edits people, description, and allergy status independently for a row", async () => {
    // Editing one field must preserve the other values on that requirement, and the
    // allergy badge must communicate the selected state with text as well as color.
    const user = userEvent.setup();
    const onChange = vi.fn();
    const requirements = [
      { peopleCount: 1, hasAllergies: false, description: "Vegetarian" },
      { peopleCount: 1, hasAllergies: true, description: "Peanuts" },
    ];
    const { rerender } = render(
      <RequirementsEditor
        requirements={requirements}
        partySize={3}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByRole("spinbutton", { name: "People for requirement 1" }), {
      target: { value: "2" },
    });
    expect(onChange).toHaveBeenLastCalledWith([
      { ...requirements[0], peopleCount: "2" },
      requirements[1],
    ]);

    onChange.mockClear();
    fireEvent.change(screen.getByRole("textbox", { name: "Description for requirement 1" }), {
      target: { value: "Vegan" },
    });
    expect(onChange).toHaveBeenLastCalledWith([
      { ...requirements[0], description: "Vegan" },
      requirements[1],
    ]);

    onChange.mockClear();
    await user.click(screen.getAllByRole("checkbox", { name: "Allergy or intolerance" })[0]);
    expect(onChange).toHaveBeenLastCalledWith([
      { ...requirements[0], hasAllergies: true },
      requirements[1],
    ]);

    rerender(
      <RequirementsEditor
        requirements={[
          { ...requirements[0], peopleCount: "2", hasAllergies: true, description: "Vegan" },
          requirements[1],
        ]}
        partySize={3}
        onChange={onChange}
      />,
    );
    expect(screen.getAllByText("Allergy")).toHaveLength(2);
    expect(screen.getByText("3 of 3 people associated · maximum 3")).toBeInTheDocument();
  });

  it("removes only the selected requirement and reports a new array", async () => {
    // Index-specific accessible names make removal unambiguous when several rows
    // are present; the remaining entries must retain their order.
    const user = userEvent.setup();
    const onChange = vi.fn();
    const requirements = [
      { peopleCount: 1, hasAllergies: true, description: "Peanuts" },
      { peopleCount: 2, hasAllergies: false, description: "Vegetarian" },
    ];
    render(
      <RequirementsEditor
        requirements={requirements}
        partySize={3}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Remove requirement 1" }));

    expect(onChange).toHaveBeenCalledWith([requirements[1]]);
    expect(requirements).toHaveLength(2);
  });

  it("shows a row error for a non-positive or fractional people count", () => {
    // Counts describe whole guests, so zero and fractional values are rejected even
    // if the browser's number input lets an intermediate value be entered.
    const requirements = [
      { peopleCount: "0", hasAllergies: false, description: "Vegetarian" },
      { peopleCount: "1.5", hasAllergies: false, description: "Vegan" },
    ];
    render(
      <RequirementsEditor
        requirements={requirements}
        partySize={4}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("alert")).toHaveLength(2);
    expect(screen.getAllByRole("alert")[0]).toHaveTextContent(
      "Each requirement needs at least 1 person.",
    );
    expect(screen.getAllByRole("alert")[1]).toHaveTextContent(
      "Each requirement needs at least 1 person.",
    );
  });

  it("requires a non-blank description and rejects descriptions over 500 characters", () => {
    // Whitespace alone is not actionable meal guidance, and the editor's limit must
    // match API validation instead of silently accepting truncated text.
    const requirements = [
      { peopleCount: 1, hasAllergies: false, description: "   " },
      { peopleCount: 1, hasAllergies: true, description: "A".repeat(501) },
    ];
    render(
      <RequirementsEditor
        requirements={requirements}
        partySize={3}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("alert")[0]).toHaveTextContent(
      "Describe the requirement.",
    );
    expect(screen.getAllByRole("alert")[1]).toHaveTextContent(
      "The description can have at most 500 characters.",
    );
  });

  it("accepts a description at the 500-character limit and allows a total equal to the party size", () => {
    // The length and party-size limits are inclusive: exactly 500 characters and
    // exactly one entry per guest are both valid states.
    const requirements = [
      { peopleCount: 2, hasAllergies: false, description: "A".repeat(500) },
      { peopleCount: 1, hasAllergies: true, description: "Shellfish allergy" },
    ];
    render(
      <RequirementsEditor
        requirements={requirements}
        partySize={3}
        onChange={vi.fn()}
      />,
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("3 of 3 people associated · maximum 3")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Description for requirement 1" })).toHaveValue("A".repeat(500));
  });

  it("reports when the sum of requirement people exceeds the party size", () => {
    // Rows may each be valid while their combined assignment is not; communicate
    // the aggregate failure separately so users can correct the party coverage.
    const requirements = [
      { peopleCount: 2, hasAllergies: true, description: "Peanuts" },
      { peopleCount: 2, hasAllergies: false, description: "Vegetarian" },
    ];
    render(
      <RequirementsEditor
        requirements={requirements}
        partySize={3}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The requirements cover 4 people, but the party has only 3.",
    );
  });

  it("uses the current value of each controlled input when it changes", () => {
    // Direct change events cover intermediate number-input values (including an
    // empty field) that user-event may normalize while simulating keyboard input.
    const onChange = vi.fn();
    const requirements = [
      { peopleCount: 1, hasAllergies: false, description: "Vegetarian" },
    ];
    render(
      <RequirementsEditor
        requirements={requirements}
        partySize={2}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByRole("spinbutton", { name: "People for requirement 1" }), {
      target: { value: "" },
    });

    expect(onChange).toHaveBeenCalledWith([
      { ...requirements[0], peopleCount: "" },
    ]);
  });
});
