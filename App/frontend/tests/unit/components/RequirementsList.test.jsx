import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RequirementsList from "../../../src/components/booking/RequirementsList";

describe("RequirementsList", () => {
  it("shows the empty state when requirements are missing or empty", () => {
    // Reservations created before this feature may omit requirements entirely,
    // while newer reservations may explicitly provide an empty array.
    const { rerender } = render(<RequirementsList requirements={[]} />);
    expect(screen.getByText("No requirements")).toBeInTheDocument();

    rerender(<RequirementsList />);
    expect(screen.getByText("No requirements")).toBeInTheDocument();
  });

  it("renders each requirement's people count and description", () => {
    // A row must retain its per-subset count so the kitchen can distinguish
    // requirements applying to different members of the same party.
    render(
      <RequirementsList
        requirements={[
          { id: 1, peopleCount: 1, hasAllergies: true, description: "Peanut allergy" },
          { id: 2, peopleCount: 2, hasAllergies: false, description: "Vegetarian" },
        ]}
      />,
    );

    expect(screen.getByText("1 × Peanut allergy (allergy)")).toBeInTheDocument();
    expect(screen.getByText("2 × Vegetarian")).toBeInTheDocument();
  });

  it("puts allergy requirements before diets without mutating the supplied array", () => {
    // Allergy notes need to be prominent for safe preparation, but sorting for
    // display must not reorder the booking data held by the caller.
    const requirements = [
      { id: 1, peopleCount: 2, hasAllergies: false, description: "Vegetarian" },
      { id: 2, peopleCount: 1, hasAllergies: true, description: "Peanuts" },
      { id: 3, peopleCount: 1, hasAllergies: false, description: "Vegan" },
      { id: 4, peopleCount: 1, hasAllergies: true, description: "Shellfish" },
    ];
    const originalOrder = [...requirements];
    render(<RequirementsList requirements={requirements} />);

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(4);
    expect(within(rows[0]).getByText("1 × Peanuts (allergy)")).toBeInTheDocument();
    expect(within(rows[1]).getByText("1 × Shellfish (allergy)")).toBeInTheDocument();
    expect(within(rows[2]).getByText("2 × Vegetarian")).toBeInTheDocument();
    expect(within(rows[3]).getByText("1 × Vegan")).toBeInTheDocument();
    expect(requirements).toEqual(originalOrder);
  });

  it("marks allergy and diet entries with accessible text and hides decorative icons", () => {
    // The allergy signal cannot depend on color alone; icon graphics are
    // decorative and should not produce duplicate announcements for screen readers.
    const { container } = render(
      <RequirementsList
        requirements={[
          { peopleCount: 1, hasAllergies: true, description: "Nuts" },
          { peopleCount: 1, hasAllergies: false, description: "Lactose-free" },
        ]}
      />,
    );

    expect(screen.getByText("1 × Nuts (allergy)")).toBeInTheDocument();
    expect(screen.getByText("1 × Lactose-free")).toBeInTheDocument();
    expect(container.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(2);
  });
});
