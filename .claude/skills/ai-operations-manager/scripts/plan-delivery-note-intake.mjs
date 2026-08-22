import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { runCli } from '../../upload-delivery-notes-to-dropbox/scripts/plan-delivery-note-intake.mjs';

export * from '../../upload-delivery-notes-to-dropbox/scripts/plan-delivery-note-intake.mjs';

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCli().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
