# Compatibility bridge for professional social relations

The canonical ownership contract moved to `../../ai-marketing-manager/references/instagram-relations-program.md`. `ai-sales-manager` now supplies the reconciled Monday roster, verified project evidence and sales-capacity context; it no longer owns marketing strategy or watchlist policy. Existing callers should route program decisions to `ai-marketing-manager` and keep Maya as the bounded worker. The approval and privacy boundaries below remain unchanged during migration.

## Ownership map

| Responsibility | Owner | Boundary |
| --- | --- | --- |
| Program idea and backlog | `ai-marketing-manager` | May initiate relationship-nurturing ideas and propose improvements; cannot authorize its own external action. |
| Monday candidate roster and project evidence | `ai-sales-manager` | Reconciles existing architects/designers from the approved Monday boards and returns bounded evidence. |
| Watchlist, voice, selection criteria and contact limits | `ai-marketing-manager` | Maintains the canonical policy through a repository work branch and Pull Request, never by editing Maya's installed copy. |
| Instagram/Facebook profile resolution and monthly evidence | Maya through `maya-instagram-relations` | Uses the manager's Monday roster, verifies public professional profiles in Maya's sessions, selects evidence and prepares exact drafts. |
| Quality review and program learning | `ai-marketing-manager` | Reviews aggregate outcomes and sampled approved wording, detects generic or sales-heavy patterns and proposes bounded changes. |
| External send | Maya after explicit approval | Requires the exact verified handle, source item and final message text; the manager cannot convert a recommendation into approval. |
| Business exceptions and final authority | Oren | Approves protected actions, new outreach scope, merge, installation and scheduler activation. |

## Program-management cycle

1. Before the monthly window, the AI Marketing Manager reads the professional-contacts and sales boards in full, reconciles the relevant records with the three canonical project boards, and maintains the program brief: candidate-roster version, approved watchlist version, current relationship objective and bounded tone guidance. It must not infer profession, profile identity, project relationships or campaign priorities from a name alone.
2. Maya runs the public-profile lookup and monthly read-only review under the worker skill. It returns match evidence, candidate/exclusion counts, project relationship state, source references and proposed wording for human approval; it does not change strategy or its own instructions.
3. The AI Marketing Manager checks that each proposal is specific, sincere, useful for a long-term professional relationship and compliant with cadence, duplicate, opt-out and unanswered-attempt limits. No-message is a valid outcome.
4. Oren approves or rejects the exact outbound batch, including the chosen single platform. Maya performs only an approved send and verifies the intended direct thread; the same reason is never messaged on both platforms.
5. After the cycle, the AI Marketing Manager reviews bounded aggregates: profiles reviewed, meaningful updates, drafts proposed and approved, replies, relationship-progressing responses, cooldowns and opt-outs. It must not optimize for raw message volume.
6. When the evidence supports a change, the AI Marketing Manager proposes an update to the canonical skill or policy through the normal GitHub PR path. Runtime self-editing, silent watchlist expansion and scheduler activation are forbidden.

## Evidence and privacy

The exact approval batch stays in the authorized review surface and is not copied into aggregate telemetry. Management System reporting may contain only counts, program version, run status and bounded blocker codes. Never send Monday rows, private messages, captions, handles, profile URLs, project names or personal details through the shared Vault or ordinary logs. Monday remains read-only.

The monthly cadence is a relationship-quality control, not a device for concealing automation. Every note must remain honest, concrete and defensible if the recipient asks why I Feel contacted them.
