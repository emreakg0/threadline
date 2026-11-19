# Focus City design system

Focus City is a calm, private workspace in which saved work takes physical shape. The miniature city is the primary canvas; task management remains one action away. Preserve real data, persistent lots, authentication and the accessible List View.

## Hierarchy and layout

Use a compact structural sidebar, a short workspace heading, a segmented City/List control and a generous city canvas. Progress is a quiet inline summary, not a row of dashboard cards. Neighborhood controls sit near the canvas. A selected building reveals a nonmodal inspector without a dimming scrim. Editing is a focused native dialog with a scrim and contained keyboard focus. List View gives tasks the full content width. Mobile navigation becomes a horizontal neighborhood rail; task editing becomes a bottom sheet.

## Type, color and materials

Platform system fonts, optical sizing and size-dependent tracking: tight headings, neutral body copy and slightly spaced small labels. Body text is 0.875rem with comfortable leading. Deep ink (#0b1217), slate surfaces (#121e25), readable cool gray text and restrained mint (#a0e7ce) establish hierarchy. Amber means high priority; mint means completion. Status is always also written in text. Use solid surfaces for task content and translucent materials only for floating chrome and sheets. Limit blur to small functional areas; preserve the existing demand-rendered city.

Spacing follows a 0.25rem rhythm, with 0.75–1rem control gaps and 1.5–2rem section spacing. Rounded rectangles share 0.75rem control and 1.25rem surface radii. Controls have immediate press feedback and at least 2.75rem touch targets. Focus outlines remain visible.

## Interaction

The task editor enters and leaves along the same axis: right on desktop, bottom on mobile. A critically damped requestAnimationFrame spring carries current position and velocity when retargeted; it never locks input during motion. Native dialog provides Escape, focus containment and focus restoration. N creates a task outside text fields. Save feedback follows persisted success, and failures remain visible. Completion uses existing real-task status changes and building illumination/pulse. Camera gestures retain direct OrbitControls manipulation and interrupt camera travel on input. No decorative task buildings or simulated activity.

Reduced motion snaps the spring and disables city travel/pulses; feedback remains textual/color based. Reduced transparency removes blur and uses solid materials. Increased contrast strengthens borders and text. No new runtime dependencies. Motion should reinforce actions, never delay them.

## Verification boundaries

Automated browser fixtures use real isolated database records and software WebGL. They establish rendering, selection, editing and responsive layout, not physical GPU performance or live Google consent. Those remain manual acceptance items. Project rename/delete and task moves are existing product gaps, outside this visual milestone.

## Continued interface refinement — 2026-11-12

Search and status controls sit above both City and List View so their scope is clear. Filtered empty cities explain the active filters; Clear filters restores the view without changing data. The City/List selection surface uses independent position and width springs, preserving velocity on reversal and adapting to text/viewport resizing. Reduced motion snaps the surface.

Task inspection separates neighborhood context, state, title, notes and deadline. Previous/next controls browse the visible tasks in the active neighborhood with explicit boundaries and a position count; selection continues to drive the existing camera. Close stays in the panel header, Escape dismisses inspection outside the editor, and the inspector enters/exits vertically on mobile and horizontally on desktop. Editor text fields use 1rem text and retain their close control in a sticky header. Mobile neighborhood navigation forms a horizontally scrollable rail rather than consuming rows above the workspace.

Editor, inspector and selection controls share exact critically damped spring integration. Their pace follows elapsed time even on delayed frames; changing a target preserves position and velocity. Automated tests compare frame rates, reversal and long-frame stability.

## Threadline capture — Phase 2A, 2026-11-16

The additive Capture workspace follows THREADLINE_ARCHITECTURE.md's graphite/lavender
tokens, solid document surfaces, compact library and source-first hierarchy. Scoped
capture.css leaves Focus City's existing styling intact. No installed shadcn/Geist/
Lucide/Motion primitives are assumed; existing React, system fonts and native controls
supply the interface. New capture/editor/state modules are separate because the old
task forms do not represent immutable document revisions or concurrency comparison.

Manual save has truthful saved/unsaved/failure feedback. Conflicts retain the draft
and reveal the saved version; source history never mutates the editor. Controls use
44px minimum targets, explicit labels, visible focus and 160ms interaction transitions;
reduced motion removes transitions. Mobile uses a stacked navigation/library/editor,
with bounded library scrolling and no horizontal overflow. No decorative graph or
fake processing state. Desktop/mobile screenshots inspected in this milestone; no
physical-device keyboard/GPU claim. Gemini processing remains absent.

## Phase 3 — recorded execution view (2026-11-17)

How It Works is a bounded addition to Capture, not a workspace redesign. Graphite
surfaces and lavender selection outline frame five connected stages, with text labels
and mint/amber/error borders derived from recorded observations. Unknown legacy keys
remain inspectable. No floating particles, decorative 3D or simulated activity.

Desktop: compact run-history rail, connected horizontal nodes, replay controls and
scrollable event log beside a metadata inspector. Mobile: stacked stages and inspector,
bounded history/event scrolling, no horizontal overflow. Scope inspector styles to
avoid inheriting Focus City's responsive navigation-aside layout. Native range/select/
buttons retain keyboard and 44px touch targets. Focus moves to the view heading on
run navigation; node/event controls expose selection and cursor announcements.

Replay intervals clamp to 0.3–1.8 seconds at 1x and are explicitly scaled; actual step
wall times are separately identified. Reduced motion uses manual steps/log/range and
no autoplay. Recovery and cancellation remain distinct from success. Capture drafts
stay mounted while viewing history. Desktop/mobile screenshots inspected from real
isolated mock traces; software browser tests do not establish physical-device quality.

## Threadline Phase 4 workspace

The sidebar carries Capture, Knowledge, Review, Collections and How It Works.
The workspace header holds the current section and command palette. Focus City
and the signed-in account are available from the sidebar. On smaller screens the
section navigation moves into a two-row header with at least 44px touch targets.
The document editor has a solid graphite writing surface, editable title,
plain source text and a compact save bar. Quiet document controls link to source
history, review and organization.

Threadline scopes its tokens to the workspace. Graphite surfaces use #0D1016,
#11151C and #191E29 with #EBEAF3 primary text and #9AA2B2 secondary text. Lavender
marks selection, focus and primary actions. Mint and amber accompany written
save and review statuses. Geist is preferred if available locally, with a system
fallback. Only the floating command palette uses translucent material.

Navigation changes use short 160–180ms transitions. Review content and the
native dialog use 220–240ms entrances, with a brief stagger on loaded blocks.
Escape returns palette focus to the previous control. Focus follows document
selection. Reduced motion removes transitions, increased contrast strengthens
surface boundaries and reduced transparency makes the palette opaque.

## Threadline Phase 4.1

Capture treats the title and source as a single reading surface. The native
title field wraps, and the source uses a bounded reading measure with vertical
resize. A sticky save bar keeps the write action separate from the text. Saved
documents place the next review action above document details in a separate
column, which follows the manuscript on mobile.

Knowledge uses compact rows with distinct collection, tag, date, and review
metadata. Collections adds a folder navigator and a scoped pane using the same
rows and filters. Review separates current text and its provenance from an
expandable original quotation. Amber and mint carry written review statuses.
When no blocks exist, the view explains why, shows the review workflow, and
links to recorded execution.

A shared set of line icons connects navigation, document rows, review, and the
grouped command palette. The palette uses lighter backdrop blur and has one
scrolling results area with a fixed search field and footer. The shell uses a
compact tablet and phone header, with an icon-only capture button at the
narrowest widths. Motion remains short and respects reduced-motion preferences.
