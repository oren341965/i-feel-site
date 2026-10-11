// Only these fixed codes may leave the host. Never include raw error messages.
const RULES = [
  [/Vault validation failed/, 'VAULT_NOT_READY'],
  [/Monday snapshot is stale/, 'MONDAY_SNAPSHOT_STALE'],
  [/Monday snapshot file must be an absolute path/, 'MONDAY_SNAPSHOT_PATH_MISSING'],
  [/Monday live refresh failed closed/, 'MONDAY_LIVE_REFRESH_FAILED'],
  [/Monday aggregate snapshot verification failed closed/, 'MONDAY_SNAPSHOT_INVALID'],
  [/Google Ads credential file paths are not configured/, 'GOOGLE_ADS_CONFIG_MISSING'],
  [/Google Ads/, 'GOOGLE_ADS_READ_FAILED'],
  [/verified Meta Graph API version/, 'META_API_VERSION_MISSING'],
  [/Meta Ads/, 'META_ADS_READ_FAILED'],
  [/Attribution snapshot is stale/, 'ATTRIBUTION_SNAPSHOT_STALE'],
  [/Attribution/, 'ATTRIBUTION_READ_FAILED'],
];
const STAGES = new Set(['config', 'vault', 'monday-refresh', 'monday-snapshot',
  'google-ads', 'meta-ads', 'attribution-refresh', 'attribution', 'maya-handshake',
  'persist-artifacts', 'claude-response']);

export function classifyMorningFailure(error) {
  return {
    stage: STAGES.has(error?.morningStage) ? error.morningStage : 'unknown',
    code: RULES.find(([pattern]) => pattern.test(String(error?.message ?? '')))?.[1]
      ?? 'MORNING_RUN_FAILED',
  };
}

export async function morningStage(stage, operation) {
  try { return await operation(); }
  catch (cause) {
    // Retain detail locally while giving the reporter a trusted stage enum.
    const error = new Error(cause?.message ?? 'Morning operation failed', { cause });
    error.morningStage = stage;
    throw error;
  }
}
