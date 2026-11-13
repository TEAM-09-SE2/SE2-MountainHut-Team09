import { describe, it, expect } from "vitest";
import {
  validateRequirements,
  toRequirementsPayload,
} from "../../../src/utils/bookingFormat";

describe("bookingFormat utilities", () => {
  describe("validateRequirements", () => {
    it("returns no errors when valid", () => {
      const requirements = [
        { peopleCount: 2, hasAllergies: true, description: "Gluten free" },
      ];
      const result = validateRequirements(requirements, 4);

      expect(result.rowErrors).toEqual([null]);
      expect(result.total).toBe(2);
      expect(result.totalError).toBeNull();
    });

    it("fails when people count is invalid or < 1", () => {
      const requirements = [
        { peopleCount: 0, hasAllergies: false, description: "Vegan" },
        { peopleCount: 1.5, hasAllergies: false, description: "Vegan" },
      ];
      const result = validateRequirements(requirements, 4);

      expect(result.rowErrors[0]).toMatch(/at least 1 person/);
      expect(result.rowErrors[1]).toMatch(/at least 1 person/);
    });

    it("fails when description is empty or too long", () => {
      const longText = "A".repeat(501);
      const requirements = [
        { peopleCount: 1, hasAllergies: false, description: "   " },
        { peopleCount: 1, hasAllergies: false, description: longText },
      ];
      const result = validateRequirements(requirements, 4);

      expect(result.rowErrors[0]).toMatch(/Describe the requirement/);
      expect(result.rowErrors[1]).toMatch(/at most 500 characters/);
    });

    it("fails when the total people in requirements exceeds the party size (MH-05/06 rule)", () => {
      const requirements = [
        { peopleCount: 3, hasAllergies: true, description: "Nut allergy" },
        { peopleCount: 2, hasAllergies: false, description: "Vegan" },
      ];
      const result = validateRequirements(requirements, 4);

      expect(result.total).toBe(5);
      expect(result.totalError).toMatch(
        /cover 5 people, but the party has only 4/
      );
    });
  });

  describe("toRequirementsPayload", () => {
    it("trims descriptions and forces correct types", () => {
      const editable = [
        { peopleCount: "2", hasAllergies: "true", description: "  Vegan  " },
      ];
      const payload = toRequirementsPayload(editable);

      expect(payload).toEqual([
        { peopleCount: 2, hasAllergies: true, description: "Vegan" },
      ]);
    });
  });
});