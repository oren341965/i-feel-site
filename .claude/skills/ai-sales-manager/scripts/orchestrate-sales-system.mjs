const MATURITY_DRY_RUN = 0;

export const SALES_SYSTEM_CONSTANTS = Object.freeze({
  maturity: MATURITY_DRY_RUN,
  mondayBoardId: '2732725332',
  googleAdsAccountId: '251-497-1872',
  timezone: 'Asia/Jerusalem',
  vaultRootEnvironmentVariable: 'VAULT_ROOT',
});

export const ATTRIBUTION_FIELDS = Object.freeze([
  'monday_item_id',
  'how_did_you_hear',
  'first_touch',
  'last_touch',
  'referrer',
  'gclid',
  'fbclid',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'phone_source',
  'whatsapp_source',
  'revenue_engine',
  'electrical_planning_stage',
  'qualification',
  'competitor',
  'potential_value',
  'loss_reason',
  'proposal',
  'won',
  'revenue',
]);

export const GOOGLE_ADS_AUDIT_CHECKS = Object.freeze([
  'conversion_tracking_health',
  'dali_irrelevant_searches',
  'smart_home_campaign_cannibalization',
  'qualified_cpl',
  'proposal_and_win_attribution',
]);

export const META_ADS_AUDIT_CHECKS = Object.freeze([
  'campaigns_and_ad_sets',
  'creatives_and_audiences',
  'frequency_ctr_cpc_cpm_cpl',
  'lead_forms_and_whatsapp_leads',
  'retargeting',
  'qualified_leads',
  'proposal_and_win_attribution',
]);

export const ORCHESTRATED_COMPONENTS = Object.freeze([
  { name: 'ai-sales-manager', ownership: 'existing-local', role: 'orchestrator' },
  { name: 'ai-service-manager', ownership: 'existing-local', role: 'service-signal' },
  { name: 'google-ads-manager', ownership: 'new-required', role: 'paid-media' },
  { name: 'meta-ads-manager', ownership: 'new-required', role: 'paid-media' },
  { name: 'lead-attribution-feedback', ownership: 'new-required', role: 'attribution' },
  { name: 'daily-seo-crawl', ownership: 'existing', role: 'website-growth' },
  { name: 'new-page', ownership: 'existing', role: 'website-growth' },
  { name: 'deploy-ifeel', ownership: 'existing', role: 'website-delivery' },
  { name: 'verify-live', ownership: 'existing', role: 'website-verification' },
  { name: 'gallery-add', ownership: 'existing', role: 'project-content' },
  { name: 'video-add', ownership: 'existing', role: 'project-content' },
  { name: 'private-home-case-study', ownership: 'existing', role: 'project-content' },
  { name: 'mailing-list-collector', ownership: 'existing', role: 'existing-customers' },
  { name: 'autopilot-ifeel', ownership: 'existing', role: 'safety-governance' },
  { name: 'maya-agent', ownership: 'external-existing', role: 'maya' },
  { name: 'developer-outreach', ownership: 'external-existing', role: 'referrals' },
  { name: 'plans-chase', ownership: 'external-existing', role: 'plans' },
  { name: 'ifeel-plans-intake', ownership: 'external-existing', role: 'plans' },
  { name: 'project-handoff', ownership: 'external-existing', role: 'project-operations' },
  { name: 'project-closeout', ownership: 'external-existing', role: 'existing-customers' },
  { name: 'service-quality', ownership: 'external-existing', role: 'service-signal' },
  { name: 'service-revenue-audit', ownership: 'external-existing', role: 'existing-customers' },
  { name: 'ifeel-project-video', ownership: 'external-existing', role: 'project-content' },
  { name: 'social-media-poster', ownership: 'external-existing', role: 'social-content' },
  { name: 'inbox-oren', ownership: 'external-existing', role: 'inbox-signal' },
  { name: 'monday-sales-represntative-', ownership: 'legacy-existing', role: 'legacy-input-only' },
  { name: 'skill-maturity', ownership: 'external-existing', role: 'safety-governance' },
]);

export const DAILY_BRIEF_SECTIONS = Object.freeze([
  'target_progress',
  'new_qualified_or_needs_qualification',
  'sales_exceptions',
  'google_ads',
  'meta_ads',
  'daily_website_improvement',
  'daily_seo',
  'project_video_and_social_reuse',
  'maya_and_plans',
  'referral_opportunities',
  'existing_customer_revenue',
  'service_quality_signals',
  'project_handoff_and_closeout',
  'capacity',
  'highest_value_action',
]);

const FORBIDDEN_DATA_KEYS = new Set([
  'address',
  'customername',
  'email',
  'fullname',
  'password',
  'phone',
  'rawemail',
  'rawmessage',
  'secret',
  'token',
  'updates',
]);

const EMAIL_VALUE_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const ISRAELI_PHONE_VALUE_PATTERN = /(?:^|\D)(?:\+?972[-\s]?|0)(?:[23489]|5\d)[-\s]?\d{3}[-\s]?\d{4}(?:$|\D)/;

function normalizedKey(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function hasValue(value) {
  return value !== undefined && value !== null && value !== '';
}

function finiteNonNegativeNumber(value) {
  if (!hasValue(value)) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return numeric;
}

export function findForbiddenDataKeys(value, path = '$', findings = []) {
  if (typeof value === 'string') {
    if (EMAIL_VALUE_PATTERN.test(value) || ISRAELI_PHONE_VALUE_PATTERN.test(value)) findings.push(path);
    return findings;
  }
  if (!value || typeof value !== 'object') return findings;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => findForbiddenDataKeys(entry, `${path}[${index}]`, findings));
    return findings;
  }

  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_DATA_KEYS.has(normalizedKey(key))) findings.push(`${path}.${key}`);
    findForbiddenDataKeys(child, `${path}.${key}`, findings);
  }
  return findings;
}

export function evaluateLiveConnection(connection) {
  if (connection?.connected === true && connection?.liveVerified === true) {
    return {
      status: 'CONNECTED_READ_ONLY',
      readAllowed: true,
      writesAllowed: false,
    };
  }
  return {
    status: 'CONNECTION_MISSING',
    readAllowed: false,
    writesAllowed: false,
  };
}

export function evaluateCapacity(input = {}) {
  const plansDays = finiteNonNegativeNumber(input.plansToProposalBusinessDays);
  const activeUnowned = finiteNonNegativeNumber(input.activeUnownedLeads);
  const threshold = finiteNonNegativeNumber(input.unownedLeadThreshold);
  const reasons = [];

  if (plansDays !== null && plansDays > 7) reasons.push('PLANS_TO_PROPOSAL_OVER_7_BUSINESS_DAYS');
  if (threshold !== null && activeUnowned !== null && activeUnowned > threshold) {
    reasons.push('ACTIVE_UNOWNED_LEADS_OVER_THRESHOLD');
  }

  if (reasons.length > 0) {
    return {
      status: 'CAPACITY_BLOCKED',
      capacityBlocked: true,
      budgetGrowthAllowed: false,
      thresholdMissing: threshold === null,
      reasons,
    };
  }

  if (threshold === null) {
    return {
      status: 'CAPACITY_THRESHOLD_MISSING',
      capacityBlocked: false,
      budgetGrowthAllowed: false,
      thresholdMissing: true,
      reasons: ['UNOWNED_LEAD_THRESHOLD_X_NOT_CONFIGURED'],
    };
  }

  if (plansDays === null || activeUnowned === null) {
    return {
      status: 'CAPACITY_INPUT_MISSING',
      capacityBlocked: false,
      budgetGrowthAllowed: false,
      thresholdMissing: false,
      reasons: ['CAPACITY_INPUT_NOT_AVAILABLE'],
    };
  }

  return {
    status: 'CAPACITY_OK',
    capacityBlocked: false,
    budgetGrowthAllowed: true,
    thresholdMissing: false,
    reasons: [],
  };
}

export function authorizeOperation(operation = {}, context = {}) {
  const maturity = Number.isInteger(context.maturity) ? context.maturity : MATURITY_DRY_RUN;
  const capacity = context.capacity ?? evaluateCapacity();

  if (operation.approvalRequired === true && operation.approvalStatus !== 'approved') {
    return { allowed: false, status: 'APPROVAL_REQUIRED' };
  }

  if (operation.budgetIncrease === true && capacity.budgetGrowthAllowed !== true) {
    return { allowed: false, status: capacity.status };
  }

  if (maturity === MATURITY_DRY_RUN && (
    operation.externalWrite === true
    || operation.irreversible === true
    || operation.budgetChange === true
    || operation.mondayMutation === true
  )) {
    return { allowed: false, status: 'MATURITY_0_DRY_RUN' };
  }

  return { allowed: true, status: 'ALLOWED' };
}

export function normalizeAttribution(input = {}) {
  const normalized = {};
  for (const field of ATTRIBUTION_FIELDS) {
    if (hasValue(input[field])) normalized[field] = input[field];
  }
  return normalized;
}

export function mergeAttribution(existing = {}, incoming = {}) {
  const current = normalizeAttribution(existing);
  const next = normalizeAttribution(incoming);
  if (hasValue(current.monday_item_id) && hasValue(next.monday_item_id)
    && String(current.monday_item_id) !== String(next.monday_item_id)) {
    throw new Error('monday_item_id mismatch');
  }

  const merged = { ...current, ...next };
  for (const preserved of ['monday_item_id', 'how_did_you_hear', 'first_touch', 'referrer', 'gclid', 'fbclid']) {
    if (hasValue(current[preserved])) merged[preserved] = current[preserved];
  }
  if (!hasValue(merged.first_touch) && hasValue(merged.last_touch)) merged.first_touch = merged.last_touch;
  return merged;
}

export function validateBusMessage(message, options = {}) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return { accepted: false, status: 'BUS_MESSAGE_INVALID' };
  }

  const runtimeV1 = hasValue(message.schema_version) || hasValue(message.request_id);
  const required = runtimeV1
    ? ['request_id', 'schema_version', 'generated_at', 'source', 'type', 'payload', 'max_age_hours']
    : ['id', 'schemaVersion', 'createdAt', 'source', 'target', 'type', 'payload'];
  if (required.some((field) => !hasValue(message[field]))) {
    return { accepted: false, status: 'BUS_MESSAGE_INVALID' };
  }
  const schemaVersion = runtimeV1 ? message.schema_version : message.schemaVersion;
  if (schemaVersion !== 1 || typeof message.payload !== 'object' || Array.isArray(message.payload)) {
    return { accepted: false, status: 'BUS_MESSAGE_INVALID' };
  }
  if (runtimeV1 && (
    !/^morning-sales-judgment-\d{4}-\d{2}-\d{2}$/.test(String(message.request_id))
    || message.source !== 'codex'
    || message.type !== 'MORNING_SALES_JUDGMENT_REQUEST'
    || message.dry_run !== true
    || message.approval_required !== false
    || typeof message.max_age_hours !== 'number'
  )) return { accepted: false, status: 'BUS_MESSAGE_POLICY_INVALID' };

  const seenIds = new Set(options.seenIds ?? []);
  const messageId = runtimeV1 ? message.request_id : message.id;
  if (seenIds.has(String(messageId))) {
    return { accepted: false, status: 'BUS_MESSAGE_DUPLICATE' };
  }

  const now = new Date(options.now ?? Date.now());
  const createdAt = new Date(runtimeV1 ? message.generated_at : message.createdAt);
  if (Number.isNaN(now.getTime()) || Number.isNaN(createdAt.getTime())) {
    return { accepted: false, status: 'BUS_MESSAGE_INVALID_TIMESTAMP' };
  }
  const ageMinutes = (now.getTime() - createdAt.getTime()) / 60_000;
  const messageMaxAge = runtimeV1 ? finiteNonNegativeNumber(message.max_age_hours) : null;
  if (runtimeV1 && (messageMaxAge === null || messageMaxAge === 0)) {
    return { accepted: false, status: 'BUS_MESSAGE_INVALID_MAX_AGE' };
  }
  const maxAgeMinutes = options.maxAgeMinutes ?? (messageMaxAge === null ? 24 * 60 : messageMaxAge * 60);
  if (ageMinutes > maxAgeMinutes || ageMinutes < -5) {
    return { accepted: false, status: 'BUS_MESSAGE_STALE' };
  }

  const forbidden = findForbiddenDataKeys(message.payload);
  if (forbidden.length > 0) {
    return { accepted: false, status: 'BUS_MESSAGE_FORBIDDEN_DATA', forbidden };
  }

  return { accepted: true, status: 'BUS_MESSAGE_ACCEPTED' };
}

export function createJudgmentRequest(input = {}) {
  const message = {
    id: input.id,
    schemaVersion: 1,
    createdAt: input.createdAt,
    correlationId: input.correlationId ?? input.id,
    source: 'codex',
    target: 'claude',
    type: 'judgment_request',
    payload: {
      caseReference: input.caseReference ?? null,
      question: input.question ?? null,
      facts: Array.isArray(input.facts) ? input.facts.map(String) : [],
      approvalRequired: input.approvalRequired === true,
      approvalStatus: input.approvalRequired === true ? 'pending' : 'not_required',
    },
  };
  const validation = validateBusMessage(message, { now: input.createdAt });
  if (!validation.accepted) throw new Error(validation.status);
  return message;
}

export function evaluateJudgmentResponse(message, options = {}) {
  const validation = validateBusMessage(message, options);
  if (!validation.accepted) return { accepted: false, executable: false, status: validation.status };
  if (message.type !== 'judgment_response' || message.source !== 'claude' || message.target !== 'codex') {
    return { accepted: false, executable: false, status: 'JUDGMENT_RESPONSE_ROUTE_INVALID' };
  }
  if (options.expectedCorrelationId && message.correlationId !== options.expectedCorrelationId) {
    return { accepted: false, executable: false, status: 'JUDGMENT_RESPONSE_CORRELATION_MISMATCH' };
  }

  const approvalRequired = message.payload.approvalRequired === true;
  const approved = message.payload.approvalStatus === 'approved';
  if (approvalRequired && !approved) {
    return { accepted: true, executable: false, status: 'APPROVAL_REQUIRED' };
  }
  return { accepted: true, executable: true, status: 'JUDGMENT_RESPONSE_READY' };
}

function componentInventory(availableSkills = []) {
  const available = new Set(availableSkills.filter((name) => typeof name === 'string'));
  return ORCHESTRATED_COMPONENTS.map((component) => ({
    ...component,
    status: available.has(component.name) ? 'READY' : 'MISSING_LOCAL',
  }));
}

export function orchestrateSalesSystem(input = {}) {
  const maturity = MATURITY_DRY_RUN;
  const capacity = evaluateCapacity(input.capacity);
  const googleAds = evaluateLiveConnection(input.connections?.googleAds);
  const metaAds = evaluateLiveConnection(input.connections?.metaAds);
  const components = componentInventory(input.availableSkills);
  const requestedOperations = Array.isArray(input.requestedOperations) ? input.requestedOperations : [];
  const operationDecisions = requestedOperations.map((operation) => ({
    id: String(operation?.id ?? 'unnamed-operation'),
    ...authorizeOperation(operation, { maturity, capacity }),
  }));
  const preRunIssues = [];

  if (String(input.mondayBoardId ?? SALES_SYSTEM_CONSTANTS.mondayBoardId)
    !== SALES_SYSTEM_CONSTANTS.mondayBoardId) preRunIssues.push('MONDAY_BOARD_MISMATCH');
  if (input.requestedMondayStructuralChange === true) preRunIssues.push('MONDAY_STRUCTURE_CHANGE_FORBIDDEN');

  return {
    schemaVersion: 1,
    mode: 'DRY_RUN',
    maturity,
    preRunChecks: {
      passed: preRunIssues.length === 0,
      issues: preRunIssues,
      mondayReadOnly: true,
      externalActionsAllowed: false,
      irreversibleActionsAllowed: false,
    },
    monday: {
      boardId: SALES_SYSTEM_CONSTANTS.mondayBoardId,
      structuralChangesAllowed: false,
      enrichmentStoredExternally: true,
    },
    connections: {
      googleAds: {
        ...googleAds,
        accountId: SALES_SYSTEM_CONSTANTS.googleAdsAccountId,
        auditChecks: [...GOOGLE_ADS_AUDIT_CHECKS],
        historicalReference: {
          referenceOnly: true,
          periodDays: 30,
          spendNis: 6553,
          clicks: 955,
          conversions: 5,
          conversionRatePercent: 0.43,
        },
      },
      metaAds: {
        ...metaAds,
        auditChecks: [...META_ADS_AUDIT_CHECKS],
      },
    },
    capacity,
    components,
    dailyWebsiteImprovement: {
      included: true,
      resultContract: 'ONE_EVIDENCE_BACKED_IMPROVEMENT_OR_NO_CHANGE',
      acceptedSalesFeedback: [
        'qualified_lead_pages',
        'converting_search_terms',
        'objections',
        'selling_project_types',
        'competitors',
        'content_gaps',
      ],
    },
    attribution: {
      storage: 'EXTERNAL_BY_MONDAY_ITEM_ID',
      mondayStructureChanged: false,
      fields: [...ATTRIBUTION_FIELDS],
    },
    vault: input.vault ?? {
      status: 'MISSING',
      root: null,
      obsidianDetected: false,
      busReady: false,
      writable: false,
      foldersChecked: [],
      rootEnvironmentVariable: SALES_SYSTEM_CONSTANTS.vaultRootEnvironmentVariable,
      liveDatabaseAllowed: false,
      snapshotsOnly: true,
    },
    claudeBridge: {
      phase: 'FILE_BRIDGE',
      directApiEnabled: false,
      approvalRule: 'EXECUTE_ONLY_WHEN_NOT_REQUIRED_OR_APPROVED',
    },
    dailyBriefSections: [...DAILY_BRIEF_SECTIONS],
    operationDecisions,
    postRunSelfCheck: {
      externalActionsPerformed: false,
      mondayMutationsPerformed: false,
      budgetChangesPerformed: false,
      irreversibleActionsPerformed: false,
      internalStateWritesAllowed: true,
      dryRunBusWritesAllowed: true,
    },
  };
}
