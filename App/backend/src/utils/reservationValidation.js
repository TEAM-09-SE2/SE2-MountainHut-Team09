import { BadRequestError } from "../errors/ErrorClass.js";

const MAX_POSTGRES_INTEGER = 2147483647;

// Check whether a value is a positive integer supported by PostgreSQL's INTEGER type.
export function isPositivePostgresInteger(value) {
  return (
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_POSTGRES_INTEGER
  );
}

// Validate and normalize optional party requirements against the party size.
export function validateRequirements(requirements, partySize) {
  if (requirements === undefined) return [];
  if (!Array.isArray(requirements)) {
    throw new BadRequestError(
      "requirements must be a list.",
      "INVALID_INPUT",
    );
  }

  let totalPeople = 0;
  const normalizedRequirements = [];
  for (const requirement of requirements) {
    if (
      !requirement ||
      typeof requirement !== "object" ||
      Array.isArray(requirement) ||
      !isPositivePostgresInteger(requirement.peopleCount) ||
      typeof requirement.hasAllergies !== "boolean" ||
      typeof requirement.description !== "string"
    ) {
      throw new BadRequestError(
        "Each requirement must have a positive peopleCount, a hasAllergies boolean, and a description.",
        "INVALID_INPUT",
      );
    }

    const description = requirement.description.trim();
    if (!description || description.length > 500) {
      throw new BadRequestError(
        "Requirement descriptions must contain 1 to 500 characters after trimming.",
        "INVALID_INPUT",
      );
    }

    totalPeople += requirement.peopleCount;
    normalizedRequirements.push({
      peopleCount: requirement.peopleCount,
      hasAllergies: requirement.hasAllergies,
      description,
    });
  }

  if (totalPeople > partySize) {
    throw new BadRequestError(
      "The total peopleCount in requirements cannot exceed partySize.",
      "INVALID_INPUT",
    );
  }

  return normalizedRequirements;
}
