/**
 * Whether `email` is one of the operators in `setting`, the comma-separated
 * OPERATOR_EMAILS. Emails compare without case; an empty setting has no operators.
 */
export function isOperator(email: string, setting: string | undefined): boolean {
  const operators = (setting ?? "")
    .split(",")
    .map((operator) => operator.trim().toLowerCase())
    .filter(Boolean);
  return operators.includes(email.trim().toLowerCase());
}
