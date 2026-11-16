import { describe, it, expect } from "vitest";
import {
  validateRequirements,
  toRequirementsPayload,
} from "../../../src/utils/bookingFormat";

describe("bookingFormat utilities", () => {
  describe("validateRequirements", () => {
    it("returns no errors when valid", () => {
      // One subset may carry an allergy flag while another part of the party is
      // unaffected; validation should accept a valid individual requirement.
      const requirements = [
        { peopleCount: 2, hasAllergies: true, description: "Gluten free" },
      ];
      const result = validateRequirements(requirements, 4);

      expect(result.rowErrors).toEqual([null]);
      expect(result.total).toBe(2);
      expect(result.totalError).toBeNull();
    });

    it("fails when people count is invalid or < 1", () => {
      // Each row represents one or more whole guests, so zero and fractional
      // counts must be rejected independently for every requirement.
      const requirements = [
        { peopleCount: 0, hasAllergies: false, description: "Vegan" },
        { peopleCount: 1.5, hasAllergies: false, description: "Vegan" },
      ];
      const result = validateRequirements(requirements, 4);

      expect(result.rowErrors[0]).toMatch(/at least 1 person/);
      expect(result.rowErrors[1]).toMatch(/at least 1 person/);
    });

    it("fails when description is empty or too long", () => {
      // Descriptions are the meal-preparation instructions; blank text is not
      // useful and the limit must be enforced before sending the booking.
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
      // Different requirements can apply to subsets, but those subsets cannot
      // collectively contain more people than the booking itself.
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

    it("accepts an empty list and a total exactly equal to the party size", () => {
      // Requirements are optional, and full coverage is valid when the final
      // subset accounts for exactly all booked guests.
      expect(validateRequirements([], 2)).toEqual({
        rowErrors: [],
        total: 0,
        totalError: null,
      });

      const result = validateRequirements(
        [
          { peopleCount: "1", hasAllergies: true, description: "Peanuts" },
          { peopleCount: "2", hasAllergies: false, description: "Vegetarian" },
        ],
        3,
      );
      expect(result.rowErrors).toEqual([null, null]);
      expect(result.total).toBe(3);
      expect(result.totalError).toBeNull();
    });

    it("accepts the maximum description length and rejects the first character over it", () => {
      // The boundary is inclusive: text of length 500 is valid, while 501 is
      // rejected so the frontend remains aligned with the API limit.
      const result = validateRequirements(
        [
          { peopleCount: 1, hasAllergies: false, description: "A".repeat(500) },
          { peopleCount: 1, hasAllergies: true, description: "A".repeat(501) },
        ],
        2,
      );

      expect(result.rowErrors).toEqual([
        null,
        "The description can have at most 500 characters.",
      ]);
    });

    it("reports all invalid rows while calculating the aggregate from numeric values", () => {
      // Validation should return one result per input row and still calculate
      // the aggregate count when editable controls provide numeric strings.
      const result = validateRequirements(
        [
          { peopleCount: "2", hasAllergies: false, description: "Vegan" },
          { peopleCount: "", hasAllergies: false, description: "   " },
        ],
        3,
      );

      expect(result.total).toBe(2);
      expect(result.rowErrors).toEqual([
        null,
        "Each requirement needs at least 1 person.",
      ]);
      expect(result.totalError).toBeNull();
    });
  });

  describe("toRequirementsPayload", () => {
    it("trims descriptions and forces correct types", () => {
      // Inputs are controlled by the editor and may be strings while being
      // edited; the API payload must contain normalized numeric and text values.
      const editable = [
        { peopleCount: "2", hasAllergies: "true", description: "  Vegan  " },
      ];
      const payload = toRequirementsPayload(editable);

      expect(payload).toEqual([
        { peopleCount: 2, hasAllergies: true, description: "Vegan" },
      ]);
    });

    it("preserves the order and separate allergy flags of multiple party subsets", () => {
      // Requirements are distinct notes for different groups, so serialization
      // must not merge, reorder, or lose their per-row allergy indicators.
      const editable = [
        { peopleCount: "1", hasAllergies: true, description: "  Peanut allergy " },
        { peopleCount: 2, hasAllergies: false, description: "Vegetarian  " },
      ];

      expect(toRequirementsPayload(editable)).toEqual([
        { peopleCount: 1, hasAllergies: true, description: "Peanut allergy" },
        { peopleCount: 2, hasAllergies: false, description: "Vegetarian" },
      ]);
    });

    it("serializes an empty list as an empty list", () => {
      // A hiker who has no requirements still submits an explicit empty array
      // rather than omitting the field or fabricating a requirement.
      expect(toRequirementsPayload([])).toEqual([]);
    });
  });
});