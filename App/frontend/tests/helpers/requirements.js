import { screen } from "@testing-library/react";

//MH-05: adds two requirements in the editor, the first one with the Allergy checkbox ticked
export async function addAllergyAndDiet(user, allergy, diet) {
  await user.click(screen.getByRole("button", { name: "Add requirement" }));
  await user.type(
    screen.getByRole("textbox", { name: "Description for requirement 1" }),
    allergy,
  );
  await user.click(screen.getByRole("checkbox", { name: "Allergy" }));
  await user.click(screen.getByRole("button", { name: "Add requirement" }));
  await user.type(
    screen.getByRole("textbox", { name: "Description for requirement 2" }),
    diet,
  );
}
