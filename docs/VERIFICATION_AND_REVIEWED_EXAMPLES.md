# Evidence verification and analyst-reviewed examples

Implemented 2026-10-17. Open **Session Tracker → Verify findings** under Explore and prioritize.

## Analyst workflow

1. New guided analyses automatically verify active findings and chains after synthesis and brief creation. Failed checks are saved as failed, with the debate preserved. Existing sessions use **Check new or changed findings**. Each finding can be rechecked independently.
2. Review atomic claims, their type, support/contradiction passages, exact quotations, source versions, publication age, and next verification action. **Strong support is an evidence rating, not verified truth.** Semantic support and claim extraction are model-assisted.
3. Add supporting AND opposing source text. Sources enter only this session; the workspace knowledge library is also searched. Repeated reporting should share the same original-source name. Quality and lineage are analyst declarations, not automatic authentication.
4. Optional **Retrieve text from an approved public source** fetches the exact HTTPS URL from www.cisa.gov, www.nist.gov, nvlpubs.nist.gov, attack.mitre.org or www.mitre.org. It sends no finding or debate text to that host. Redirects, private network addresses and responses over 1 MB are rejected. HTML/plain text is supported; PDF extracts must be added as text with provenance. Access restrictions and VPN/TLS issues can prevent a fetch. The saved text is the extracted readable snapshot, not an independently authenticated original document.
5. High decision-impact findings with weak evidence appear first. Add a verification follow-up to track a concrete evidence collection task. Refresh the session before viewing newly saved follow-up elsewhere.
6. Changed finding text, sources, model or verification policy invalidate a check. Daily reassessment also refreshes the date screen. Changed completed checks are automatically rerun while the verification panel is open unless its checkbox is cleared. New/manual and failed checks require a button click. Opening a panel can therefore use the configured LLM. Checks do not run continuously while the application is closed.
7. Save your own judgment and rationale for EVERY extracted claim. Supports, partial, contradicts and mixed judgments require exact source quotations; mixed requires at least two. Insufficient and non-factual judgments still require rationale. If a needed source was not retrieved, add it or refine the finding and rerun rather than inventing a reference.
8. Export analyst-reviewed examples as local JSONL. No training or upload occurs. Earlier runs and analyst judgments remain stored. Single-analyst reviews are explicitly labeled; they are not adjudicated gold data.

## Rating rules and limits

- Fact supported by an exact, model-assessed supporting passage: Partial support. Strong support additionally requires a declared primary source, a known declared origin, and a publication date within 365 days. This date rule is a conservative screening default, not a validated domain-specific threshold or proof of applicability.
- Supporting and opposing passages: Contested. Opposing evidence without support: Contradicted.
- Predictions, assumptions, recommendations and deductions remain Inference. No relevant factual evidence: Unverified.
- Scenario premises and model text do not count as independent support. Missing evidence does not prove a claim false. Primary and secondary documents can themselves be inaccurate.
- Keyword retrieval selects at most 24 overlapping passages, each up to 2,200 characters, from local source documents. Source character offsets and content versions are retained. Exact duplicate passages are deduplicated; copying with changed wording still needs analyst lineage review. Retrieval scope/limits are visible and absence of retrieved evidence is not absence of evidence globally.
- Up to 12 atomic claims per finding. Findings over 16,000 characters or incomplete/invalid responses fail explicitly. Quotation checks are deterministic; the model's claim-coverage assertion is not proof that it extracted everything.
- No numerical truth score is produced. Multiple SMEs using one model are not independent corroboration. Record snapshots are retained in workspace-scoped AppConfig records; original findings are not overwritten.
- Verification evidence is searchable in Session Tracker. Changed saved checks and analyst reviews invalidate analyst closeout fingerprints after refresh and appear in downloaded session briefs.

## Candidate datasets researched

These are evaluation/training candidates, not domain-specific guarantees. Start with a small evaluation subset and document the exact version, license and attribution before incorporating material. Do not interpret a code license as the dataset license.

| Dataset | Best use for AgentDebate | Important limitations and terms |
|---|---|---|
| [AVeriTeC](https://fever.ai/dataset/averitec.html) | Closest workflow match: real-world claims, evidence questions/answers, verdict explanations, conflicting-evidence cases. The original release has 4,568 claims from 50 fact-checking organizations. | Public fact-checking differs from operational risk analysis. The official page links [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/); assess permitted organizational use before training or redistributing. Use source material rather than verdict-bearing fact-check articles as verifier input. |
| [SciFact](https://github.com/allenai/scifact) | Scientific claim support/refutation and evidence rationale selection; useful for checking qualification and whether a passage actually supports a claim. | Scientific abstracts differ from enterprise scenarios. [Licenses](https://github.com/allenai/scifact/blob/master/LICENSE.md): claims/evidence annotations CC BY 4.0; abstract corpus ODC-By 1.0; code Apache 2.0. Keep these distinct. |
| [FEVER](https://fever.ai/dataset/fever.html) | Large baseline for supports/refutes/not-enough-information, with annotated evidence sentences: 185,445 altered Wikipedia claims. | Synthetic claim construction, older encyclopedia evidence and domain mismatch. [Terms](https://fever.ai/download/fever/license.html) follow applicable Wikipedia article licenses, with CC BY-SA 3.0 fallback. Useful as a diagnostic baseline, not deployment acceptance data. |
| [FEVEROUS](https://fever.ai/dataset/feverous.html) | Later expansion when checking tables and structured evidence matters. | This implementation retrieves plain-text passages; it does not yet preserve table-cell structure. Treat this as a future structured-evidence benchmark. |

[MITRE ATT&CK data](https://attack.mitre.org/resources/attack-data-and-tools/) is useful domain evidence available as STIX and through TAXII. It is not a labeled set of true/false AgentDebate findings. Analyst-authored claims tied to versioned ATT&CK records can provide domain examples, but mention of a technique alone does not establish that a local environment is vulnerable or that a proposed chain is feasible.

## Recommended local evaluation program

Start with 150–300 atomic claims from roughly 20–30 varied completed scenarios. This is a proposed pilot size, not a statistical guarantee. Include factual, conditional, numerical and time-sensitive claims; unsupported claims; contradictions; missing evidence; duplicated reporting; and plausible but invalid inferences. Include ordinary low-impact claims as well as decision-changing ones so the set is not solely a difficult-case sample.

Use the new analyst review form to capture labels, rationale, evidence passages and source versions. For a trustworthy held-out set, have a second analyst independently review a substantial sample and all high-impact disagreements. Keep model labels hidden during that independent pass. Adjudicate disagreements and track changes. In a single-user deployment, export a redacted review pack for a second reviewer outside the application; a delayed self-review is useful quality control but is not independent review.

Keep all claims from the same scenario, incident, source lineage and near-duplicate report in one partition. Start with approximately 60% development/training, 20% validation and 20% held-out testing, adjusting by groups rather than individual rows. Reserve newer cases as a temporal holdout. Select one adjudicated label per claim/version; exports intentionally retain revisions, so do not count every review revision as a separate independent example.

Public benchmark mappings: FEVER SUPPORTS → supports; REFUTES → contradicts; NOT ENOUGH INFO → insufficient. AVeriTeC conflicting evidence → mixed. Its other three labels map accordingly. Preserve original labels alongside mappings. Public datasets do not directly supply the app's partial/non_factual classes, source-quality declarations or local decision-impact judgments.

First evaluate with supplied gold evidence (semantic support classification), then with automatic retrieval (end-to-end). Measure retrieval recall, exact quote validity, human-assessed citation support, contradiction recall, false support, label confusion, abstention/insufficient-evidence rate, latency and review time. Report sample counts and uncertainty. Success on a public benchmark can reflect model exposure to that benchmark; fresh local held-out examples are essential.

Use reviewed examples first to improve prompts, retrieval and deterministic rules. Fine-tuning the MITRE-hosted model requires a supported training path and applicable data permissions; neither is assumed here. Only offer calibrated probability estimates after independent held-out testing demonstrates calibration, and keep them specific to the evaluated domain.

## Local scoring utility

Run from the repository:

    node scripts/evaluate-verification.mjs reviewed.jsonl
    node scripts/evaluate-verification.mjs reviewed.jsonl predictions.jsonl

The first command evaluates saved model labels against exported analyst labels. The second compares another model/prompt's predictions, one JSON object per line with matching id and label. Supported labels are supports, partial, contradicts, mixed, insufficient, non_factual. Missing predictions reduce accuracy/recall; duplicate or unknown IDs are rejected. Output includes confusion, per-label precision/recall/F1, macro F1 over present labels, coverage and false-support fraction. It performs no LLM calls or training and does not score semantic evidence correctness.

For independent annotation, provide claim text and source snapshots but remove model_prediction, model verdicts, rationales and evidence selections. Keep originals separately for evaluation. For actual training, omit all test/validation labels and examples from prompts, retrieval indexes and training files. The export contains potentially sensitive original evidence and reviewer IDs; review/redact it before any external sharing.
