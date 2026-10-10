// Returns the confirmation prompt to show before changing a section's type,
// or null when the section has no questions to remove.
export function getSectionTypeChangeConfirmMessage(questionCount: number): string | null {
  if (questionCount === 0) return null;
  return `Changing the question type will remove the ${questionCount} existing question(s) in this section. Continue?`;
}
