// Owner excluded Meta from Shark's work on 2026-11-08, reaffirmed 2026-11-28.
// This is a workflow scope decision, never a claim about connector health or spend.
export function excludedMetaSource() {
  return { status: 'EXCLUDED_BY_OWNER_TEMPORARY', reason: 'OUTSIDE_SALES_MANAGER_SCOPE' };
}
