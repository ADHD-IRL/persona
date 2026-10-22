# Streamlined analyst workflow

The streamlined Session Tracker opens with a decision summary and the highest-priority unresolved findings. Review next finding opens a side panel with review status, confidence, analyst notes, decision impact, evidence verification and linked follow-up. Save and next moves through findings without leaving the session. The panel confirms before discarding unsaved review edits. Search and comparison tools are collapsed; comparisons appear only when an earlier completed debate exists. The analysis brief and suggested actions are available in Overview. Evidence contains the debate, live messages, and saved knowledge passages; Run details provides advanced controls.

Choose your session groups debates by scenario and shows the question, date, debate state and saved analyst-review state. Recent, Needs attention and Completed debates filters help narrow the list. Needs attention includes unfinished debates and sessions without a completed analyst review; the open dashboard checks whether saved reviews need reassessment. The last selected session is remembered.

Closeout notes autosave to the local database as a draft after a short pause. Saving, Saved and Failed feedback reports the result; Retry draft save is available after a failure. A browser copy protects pending edits. Save session review explicitly confirms the selected review state; autosave never completes a review.

Start session begins with the scenario, then the question and recommended SME panel. Saved context is included by default when available. Uncheck the context box to add session-specific information. Edit this scenario and Edit options, criteria, and assumptions open a drawer without losing the setup draft. Constraints, assumptions, threats/chains and source selection are optional disclosures. Source selection can use automatic retrieval or an explicit selection from Knowledge Base; an empty explicit selection uses no knowledge documents. Up to five matching passages enter a guided analysis. Evidence lists which selected sources contributed passages and shows the saved text. Verification can reuse a Knowledge Base document by reference, so edits to the original require rechecking; this does not establish its reliability.

The sidebar reports local server/database connectivity, not LLM health. Test the model connection in Settings. Tracker polling checks run status and reloads session material when progress changes; wider scenario material is fetched when its attachment controls are opened.

## Connection, loading, and action hierarchy

The sidebar starts at Not checked and checks local server/database health every 30 seconds; model availability is tested separately in Settings. Session Tracker uses compact session/scenario metadata, refreshed every 30 seconds or on focus and analysis stage changes. Pending-analysis checks omit results and snapshots; selected-session records load only for that session. Hidden tabs pause background queue/index checks.

Amber filled pills identify the main action in each task. Secondary actions use quiet outlined pills; source citations and wider-library references use ordinary links. Contextual progress cards appear for preparing, running, or failed analyses. Run details opens the full record.
