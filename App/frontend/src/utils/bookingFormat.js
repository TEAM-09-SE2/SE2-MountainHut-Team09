//Slots are at the hut: dates and times are shown in hut time, whatever the browser's time zone
export const HUT_TIME_ZONE = "Europe/Rome";

// "en-CA" gives YYYY-MM-DD, the format of the date input
export const toHutDate = (isoString) =>
  new Date(isoString).toLocaleDateString("en-CA", { timeZone: HUT_TIME_ZONE });

export const todayAtHut = () => toHutDate(new Date());

export const formatLongDate = (isoString) =>
  new Date(isoString).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: HUT_TIME_ZONE,
  });

export const formatTime = (isoString) =>
  new Date(isoString).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: HUT_TIME_ZONE,
  });

export const formatTimeRange = (startAt, endAt) =>
  `${formatTime(startAt)} – ${formatTime(endAt)}`;

//Same booking reference as in the confirmation email (MH-03)
export const bookingReference = (id) => `MH-${id}`;

export const peopleLabel = (count) =>
  `${count} ${count === 1 ? "person" : "people"}`;

export const MAX_DESCRIPTION_LENGTH = 500;

//Same rules as the API (MH-05); returns an error message per row, or an empty list when valid
export const validateRequirements = (requirements, partySize) => {
  const rowErrors = requirements.map((row) => {
    const people = Number(row.peopleCount);
    if (!Number.isInteger(people) || people < 1) {
      return "Each requirement needs at least 1 person.";
    }
    const description = row.description.trim();
    if (!description) return "Describe the requirement.";
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      return `The description can have at most ${MAX_DESCRIPTION_LENGTH} characters.`;
    }
    return null;
  });

  const total = requirements.reduce(
    (sum, row) => sum + (Number(row.peopleCount) || 0),
    0,
  );
  const totalError =
    total > partySize
      ? `The requirements cover ${total} people, but the party has only ${partySize}.`
      : null;

  return { rowErrors, total, totalError };
};

//The body of the API wants clean values: trimmed text and no editing-only fields
export const toRequirementsPayload = (requirements) =>
  requirements.map((row) => ({
    peopleCount: Number(row.peopleCount),
    hasAllergies: Boolean(row.hasAllergies),
    description: row.description.trim(),
  }));

export const requirementsKey = (requirements) =>
  JSON.stringify(toRequirementsPayload(requirements));
