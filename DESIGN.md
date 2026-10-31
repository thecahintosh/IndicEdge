# IndicEdge workspace design

User brief: black and minimalist, with motion. Surface mode: Operate.

## Direction
One working surface, organized around a task rather than infrastructure. The workbench keeps instructions, editable rules, source boundary and execution together. Secondary views hold saved plans, source inspection and evidence. The first viewport must make the order workflow understandable and runnable.

## Tokens
- Canvas `#0b0b0b`, surface `#101010`, raised `#171717`.
- Main ink `#ededed`, secondary `#a3a3a3`, tertiary `#858585`.
- Divider `#292929`, stronger boundary `#3e3e3e`.
- Primary action uses `#e7e7e7` with `#111111` text. No decorative color.
- Self-hosted variable Geist for UI. System fallback supports Devanagari. Consolas only for actual serialized data.
- Spacing uses 4px steps. Display tracking `-.035em`, heading size fluid 30–48px.
- Controls 5–6px corners; major source/workbench/dialog boundaries 8–12px. No decorative shadows or gradients.

## Motion
Feedback and state explanation only: button press 160ms; result, rules and disclosure entry 220ms using `cubic-bezier(.23,1,.32,1)`. The completed execution path reveals its step icons in 45ms increments. This is result feedback, never simulated progress. Reduced motion removes transforms and entry effects. Navigation and data stay stable; no idle animation.

## Responsive and accessible behavior
Persistent sidebar on desktop; horizontally scrollable navigation on mobile. Execution explainer recedes below 1000px, while all actual workflow controls remain available. Source table scrolls horizontally in a named focusable region. Native dialogs, visible focus, labelled inputs, semantic headings and text-bearing statuses. No color-only status distinctions.

## Product truth
Example records are explicitly fictional. Browser-local computation is distinct from server persistence and remote AI. GPU telemetry is not acceleration. Run evidence is client-reported, not cryptographically attested. Receipt signature presence is not signature verification.
