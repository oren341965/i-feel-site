import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function runEveningCloseDryRun(input = {}) {
  return {
    schemaVersion: 1,
    job: 'evening-close',
    mode: 'DRY_RUN',
    maturity: 0,
    scheduledLocalTime: input.scheduledLocalTime ?? '17:30',
    processedMessageIdsObserved: Array.isArray(input.processedMessageIds)
      ? input.processedMessageIds.map(String)
      : [],
    stateWritePerformed: false,
    archivePerformed: false,
    vaultSnapshotWritten: false,
    externalActionPerformed: false,
    nextStep: 'Review the proposed close summary and approve a future writable maturity level separately.',
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(runEveningCloseDryRun(), null, 2)}\n`);
}
