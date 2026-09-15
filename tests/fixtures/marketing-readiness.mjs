export function readinessFixture(now) {
  const at = now.toISOString();
  const coverage = Object.fromEntries(['status', 'owner', 'nextAction', 'lastUpdated', 'createdAt']
    .map((key) => [key, { numerator: 10, denominator: 10, rate: 1 }]));
  return {
    salesAnalysis: {
      boardId: '2732725332', generatedAt: at, analysisComplete: true,
      source: { mode: 'live', uniqueIds: 10 },
      counts: { total: 10, open: 10, closed: 0, cancelled: 0, exceptionLeads: 0, healthy: 10, activeUnowned: 0 },
      treatment: { openCount: 0, excludedOpenCount: 10, exceptionCount: 0, healthyCount: 0,
        noOwnerCount: 0, noNextActionCount: 0, overdueCount: 0,
        excludedLeftSalesCount: 0, excludedFutureCount: 10, excludedHandledCount: 0 },
      reconciliation: { populationMatchesTotal: true, uniqueIdsMatchTotal: true,
        treatmentPopulationMatchesOpen: true, treatmentHealthMatchesOpen: true, treatmentExclusionsMatchOpen: true },
      coverage, dataQualityScore: 100,
    },
    attribution: {
      schemaVersion: 1, mode: 'READ_ONLY', generatedAt: at,
      connection: { status: 'LOCAL_SNAPSHOT_READ_ONLY', sourceVerified: true },
      summary: { recordCount: 10, sourceKnownCount: 10, missingSourceCount: 0 },
      records: Array.from({ length: 10 }, (_, i) => ({ monday_item_id: String(i + 1),
        confidence: 'MEDIUM', evidence_timestamp: at, how_did_you_hear: 'website_reported' })),
      safety: { sourceWrites: 0, mondayWrites: 0, externalSends: 0, rawPiiAccepted: false },
    },
    tracking: {
      schemaVersion: 1, accountId: '2514971872', boardId: '2732725332',
      sourceMode: 'verified_end_to_end', observedAt: at, evidenceRef: 'tracking:test-only',
      checks: { successfulSubmissionOnly: true, duplicateSuppressionVerified: true,
        mondayReceiptVerified: true, conversionActionVerified: true },
    },
    capacity: {
      schemaVersion: 1, boardId: '2732725332', sourceMode: 'verified_read_only', observedAt: at,
      salesGeneratedAt: at, evidenceRef: 'capacity:test-only',
      checks: { responseSlaPassed: true, plansToProposalPassed: true, backlogWithinCapacity: true, serviceRiskWithinCapacity: true },
    },
  };
}
