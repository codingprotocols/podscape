// Shared decision helper for destructive actions.
//
// Podscape only prompts the user to confirm destructive operations (delete,
// helm rollback, …) when the active context is marked as "Production". In every
// other context the action runs immediately. This centralises that branch so
// the three call sites (single delete, bulk delete, helm rollback) stay
// consistent and the rule is unit-testable in isolation.

/**
 * Run `showConfirm` when in a production-marked context, otherwise run
 * `performAction` directly.
 *
 * @param isProduction whether the active context is marked Production
 * @param showConfirm   opens the confirmation UI (prod path)
 * @param performAction executes the destructive action without confirmation (non-prod path)
 */
export function confirmIfProduction(
  isProduction: boolean,
  showConfirm: () => void,
  performAction: () => void,
): void {
  if (isProduction) {
    showConfirm()
  } else {
    performAction()
  }
}
