# Application UI style

All routed screens use the same control roles, defined in src/index.css. The source audit covers pages and their shared components; browser QA covers populated screens and public authentication/error routes.

- **Actions, action links, tabs and filters:** pill outline, shared spacing and type, visible keyboard focus, and clear disabled state. Primary actions retain amber fill and destructive actions retain red styling.
- **Icon actions:** compact circular controls. Preserve accessible labels and tooltips.
- **Status badges:** pill shape without implying they are clickable.
- **Fields:** rounded corners, minimum height, amber keyboard focus, and connected labels in shared field components.
- **Cards and dialogs:** consistent rounded surfaces. Heatmap cells, selectable record rows and rich option cards retain their useful content shape.
- **Disclosures:** rounded expandable rows. Ordinary citations remain text links so evidence is distinguishable from an action.
- **Sidebar:** equally sized pill links, consistent spacing, and a visible selected border.

Use WrButton (with asChild for a Link) or WorkflowButton for new actions. Existing native controls and links have explicit data-ui roles: action, icon, card, surface, disclosure, badge, reference, or brand. A switch keeps its native switch shape. Do not place a button inside a link. WrInput and WrSelect forward native attributes and connect their visible labels with useId.

Browser coverage: welcome/sign-in/sign-up, Session Tracker, guided start, decision start, session history, advanced setup, manual workspace, facilitated debate, live panel, results, domains/heatmap, SME library, scenarios, threats, chains, decisions and decision detail, knowledge base, threat map, SME analytics, comparison, prompts, settings, user guide, reports, chain breaker, simulator, compatibility routes, and not-found screen. Guided transcript/progress and saved assessment interactions are additionally covered by the workflow browser checks.
