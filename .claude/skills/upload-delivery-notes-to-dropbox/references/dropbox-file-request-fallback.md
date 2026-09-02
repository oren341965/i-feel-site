# Dropbox File Request fallback

Use this fallback only when the normal byte-preserving Dropbox upload path and a verified local Dropbox sync root are unavailable.

## Authorization

Oren has approved this worker to create a temporary Dropbox File Request for routine delivery-note filing without asking for a separate per-file approval, but only when all normal `ready` conditions are already satisfied. This standing authorization belongs only to `upload-delivery-notes-to-dropbox` and does not expand the permissions of `ai-operations-manager` or any other worker.

If the authenticated Dropbox account rejects File Request deadlines because of plan limitations, this worker may create the request **without a deadline**. A no-deadline request is still temporary operational transport and must remain in the worker's cleanup register until it is closed or removed through a supported Dropbox surface.

## Preconditions

Before creating a File Request, verify all of the following:

- the delivery note is `ready` under the canonical intake contract;
- the exact `מפתח` is authoritative and the destination delivery-note folder is already verified;
- every expected source page/part is accounted for;
- the original supported attachment bytes are available in the private run workspace;
- there is no verified duplicate and no overwrite is required;
- direct binary upload is unavailable and no verified local Dropbox sync root can perform the copy;
- the active execution surface can submit the local file bytes to the File Request during the same run, or an already-approved managed Host with those bytes is explicitly taking over the transport.

Do not create a new File Request merely to defer a transport problem. If the current surface cannot submit the bytes and no managed Host is taking over, classify the record as `transport-blocked` and keep it in carry-over.

## Execution

1. Re-verify Dropbox identity, write permission, and the exact destination folder immediately before request creation.
2. Create one batch-scoped File Request pointing directly to the verified delivery-note destination. Reuse one request for multiple ready notes only when they share that exact destination folder.
3. Prefer a deadline when the account supports it. If Dropbox rejects deadlines for the account plan, create the request without a deadline under the standing authorization above.
4. Keep the File Request URL private. Do not send it to customers, suppliers, technicians, or unrelated recipients and do not write it to Git, telemetry, email summaries, or shared logs.
5. Prepare a private temporary copy of each attachment using the planned canonical destination filename. Renaming the private transport copy is allowed; do not alter the original file bytes.
6. Submit the original bytes through the supported browser/HTTP/File Request surface. Request creation alone is not an upload and must never increment the uploaded count.
7. Verify the resulting Dropbox file in the exact destination folder. Confirm filename, non-zero size, and document identity; compare hash or equivalent byte evidence when the surface exposes it. Only then mark the delivery note filed and remove it from `upload-pending` carry-over.
8. Never overwrite an existing destination. A collision or uncertain duplicate returns the record to review.
9. After the batch upload is verified, close or remove the File Request immediately when the available Dropbox surface supports that action. If closure is not available from the active connector, record `OPEN_FILE_REQUEST_CLEANUP` privately and include the count in the completion handoff; keep rechecking it until the request is closed through an approved Dropbox surface.
10. Remove private temporary transport copies after verification, subject to the normal minimum-state rules.

## Failure states

- `FILE_REQUEST_CREATE_FAILED` — request could not be created.
- `FILE_REQUEST_PLAN_LIMIT_NO_DEADLINE` — deadline was rejected by the account plan; retry without a deadline only under the standing authorization.
- `TRANSPORT_BLOCKED` — the source bytes are available but the active surface cannot submit them and no managed Host took over.
- `FILE_REQUEST_UPLOAD_FAILED` — byte submission failed or could not be verified.
- `OPEN_FILE_REQUEST_CLEANUP` — filing succeeded but the temporary request still needs to be closed/removed.

A delivery note remains unresolved until the actual file is verified in its canonical Dropbox destination. Never report a File Request URL, request creation, browser selection, or local temporary copy as a completed upload.
