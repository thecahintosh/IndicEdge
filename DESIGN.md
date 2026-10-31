---
name: IndicEdge monochrome workspace
description: A black, minimalist workspace for repeatable work and explicit disclosure.
colors:
  canvas: "#0b0b0b"
  surface: "#101010"
  raised: "#171717"
  ink: "#ededed"
  muted: "#a3a3a3"
  faint: "#858585"
  line: "#292929"
  line-strong: "#3e3e3e"
  accent: "#e7e7e7"
  action-ink: "#111111"
  active-nav: "#222"
typography:
  display:
    fontFamily: "Geist, 'Segoe UI', sans-serif"
    fontSize: "clamp(30px, 3.6vw, 48px)"
    fontWeight: 500
    lineHeight: 1.14
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Geist, 'Segoe UI', sans-serif"
    fontSize: "15px"
    fontWeight: 550
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Geist, 'Segoe UI', sans-serif"
    fontSize: "14px"
    lineHeight: 1.6
  instruction:
    fontFamily: "Geist, 'Segoe UI', sans-serif"
    fontSize: "17px"
    lineHeight: 1.6
  label:
    fontFamily: "Geist, 'Segoe UI', sans-serif"
    fontSize: "11px"
  data:
    fontFamily: "Consolas, monospace"
    fontSize: "11px"
    lineHeight: 1.8
rounded:
  compact: "4px"
  field: "5px"
  control: "6px"
  container: "8px"
  major: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  section: "28px"
  desktop-gutter: "40px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.action-ink}"
    rounded: "{rounded.control}"
    padding: "8px 14px"
  button-secondary:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 14px"
  button-subtle:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 14px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "8px 10px"
    height: "39px"
  navigation-active:
    backgroundColor: "{colors.active-nav}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "10px 12px"
  badge:
    textColor: "{colors.muted}"
    rounded: "{rounded.compact}"
    padding: "3px 7px"
  workbench:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.major}"
    padding: "22px 24px 0"
---

# Design System: IndicEdge

## Overview

**Creative North Star: "Operate workspace"**

A black, minimalist working surface puts the instruction, editable rules, source boundary and execution together. Secondary views hold saved plans, source inspection and evidence. The hierarchy comes from typography, spacing and quiet boundaries; motion explains feedback and state changes.

**Key Characteristics:**
- Monochrome surfaces and a light primary action.
- Compact supporting information with readable type.
- Stable navigation and purposeful, brief motion.
- Explicit source, execution and disclosure boundaries.

## Colors

### Primary

The light accent identifies the main action, paired with dark action ink. Hover brightens it to white on devices with a fine hover pointer.

### Neutral

Canvas is the page background; surface supports the sidebar, workbench, fields and dialogs; raised supports secondary controls. Ink carries primary content, muted carries supporting text and faint carries metadata. Line separates sections; line-strong outlines major boundaries. Active-nav marks the current navigation item. The frontmatter records the normative values.

**The Monochrome Rule.** Use text, shape and contrast to communicate status; status never depends on color alone. Avoid decorative color.

## Typography

Self-hosted variable Geist is the UI face, with Segoe UI and sans-serif fallbacks, including system fallback for Devanagari. Consolas is reserved for serialized data. The shipped visible type floor is (11px), including metadata, mobile labels and payloads.

Display uses the fluid frontmatter scale. At mobile widths it becomes (32px), with line-height (1.2) and a maximum width of (18ch). The workbench title intentionally places its muted continuation on a separate line. Section titles default to (15px, 550); result and dialog titles use (20px, 500). Body defaults to (14px), while supporting copy commonly uses (11–13px). Instructions use (17px) on desktop and (16px) on mobile; editable drafts use (13px) with line-height (1.9). Paragraphs default to at most (72ch). Numeric table cells and navigation counts use tabular figures.

**The Readable Metadata Rule.** Keep visible text at or above the shipped (11px) floor when extending this workspace.

## Layout

The desktop shell has a sticky full-height sidebar (220px) and a flexible content column. Main content is centered with a maximum width of (1480px), desktop horizontal padding (40px) and a topbar (72px) high. The workbench area has a flexible work column plus an execution explainer (224px), separated by a gap (40px). Major spacing generally follows a four-pixel rhythm, with optical exceptions for compact controls and icons.

- At widths of at least (1600px), the explainer grows to (264px), its gap to (56px), and main top padding to (56px).
- At widths up to (1200px), the sidebar becomes (196px), explainer (190px), gap (24px) and content gutters (28px). The run bar stacks, and the quiet language label is hidden.
- At widths up to (1000px), the execution explainer is hidden and the work area becomes a single column. All actual workflow controls remain available.
- At widths up to (700px), navigation becomes a horizontally scrollable row beneath the brand; sidebar footer and note are hidden. Gutters become (20px), topbar height (54px), and workbench padding (18px). Rules become two columns with the date spanning both; run actions share the available width. Result headers, footers, library rows and compute rows stack.

The source table scrolls horizontally inside a named, keyboard-focusable region. Dialog width is the smaller of (520px) and viewport width minus (32px), with maximum height (85dvh) and internal scrolling.

## Elevation & Depth

There are no decorative shadows or gradients. Tonal layering and one-pixel boundaries establish depth. Native dialogs use a black backdrop at (78%) opacity. Keyboard focus uses a light outline (2px) offset by (4px); the instruction field increases the offset to (5px).

## Shapes

Compact badges use gently eased corners; fields and navigation use the field radius; buttons and editable drafts use the control radius. Source tables and empty states use the container radius. Workbench and dialog boundaries use the major radius. Empty states use a dashed border. Icons are monochrome line drawings, generally (13–18px), with larger source symbols where needed.

## Components

### Buttons

Light primary actions, raised secondary actions and transparent subtle actions share a fine border and compact typography (12px by default, often 11px in dense or mobile contexts). Default minimum height is (38px); specialized compact controls override it. Disabled controls use opacity (0.4) and suppress the press transform. Fine hover pointers receive brighter fills and borders. Visible focus follows the global outline.

Button press scales to (0.98) over (160ms), using `cubic-bezier(.23,1,.32,1)`. Background and border feedback use the same duration with `ease`.

### Inputs / Fields

Dark filled fields use a fine divider border, light caret and faint placeholder. Standard fields are (39px) high. The instruction textarea is borderless inside the workbench and resizes vertically; editable draft textareas have a fine boundary and internal padding (12px). Labels stay visible or are programmatically associated when visually hidden.

### Navigation

The current page has a raised dark fill, primary ink and `aria-current="page"`. Other items use muted text. Hover uses a subtle fill on fine-pointer devices; keyboard focus uses the global outline. Desktop items have a minimum height (42px); mobile items use (38px) and remain horizontally scrollable.

### Badges and containers

Badges use fine borders, muted text and no decorative fill. The workbench uses a stronger border; source tables and serialized payloads use the standard line. Sections and draft rows primarily use dividers rather than separate cards. Native dialogs are labelled and retain native modal behavior.

### State feedback

Results, reviewed rules, AI explanations and opened dialogs enter with the Web Animations API: opacity (0.55 → 1), vertical translation (6px → 0), duration (220ms), `cubic-bezier(.23,1,.32,1)` and backwards fill. After local execution finishes, the four completed step icons receive the same reveal with delays (0, 45, 90, 135ms). This is completed-result feedback, never simulated execution progress. Pipeline fills and labels separately transition over (220ms).

Reduced motion skips all JavaScript entry animations and stagger delays, removes button transforms, and shortens button color/border and navigation/pipeline feedback to (100ms). Navigation and data have no entrance transitions or idle animation.

## Do's and Don'ts

### Do:
- **Do** keep visible text at or above 11px, including mobile metadata and serialized data.
- **Do** use monochrome contrast, text-bearing statuses and visible keyboard focus.
- **Do** preserve workflow controls when the execution explainer is hidden.
- **Do** treat step reveals as feedback for an already completed run and respect reduced motion.
- **Do** distinguish browser-local execution, backend persistence and approved remote AI disclosure.

### Don't:
- **Don't** add decorative color, shadows, gradients or idle animation.
- **Don't** present fictional records as customer data or GPU telemetry as acceleration.
- **Don't** imply that browser-reported evidence is independently attested or that signature presence verifies a receipt.
- **Don't** imply source rows or drafts are uploaded when only aggregate run evidence and a source hash are persisted.
