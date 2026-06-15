# Implementation Plan

## Phase 1: Shell

Create the browser app shell, mount one canvas, initialize Three.js, render a nonblank starfield, and keep resize behavior stable.

Proof ideas:

- App starts locally.
- Canvas exists and is nonblank.
- Render loop can be paused or inspected without breaking state.

## Phase 2: Player

Add the player ship and movement. Keep input mapping separate from state updates. The control model is not finalized.

Proof ideas:

- Unit tests cover input-to-motion updates.
- Manual pass confirms the ship moves on key press and stays in bounds.

## Phase 3: Encounters

Add the first hazards or enemies, spawn timing, collision detection, and health/failure handling.

Proof ideas:

- Collision logic is testable without a browser.
- The playable scene visibly shows an encounter.

## Phase 4: Loop And HUD

Add start/play/game-over states, score or survival timer, health display, and restart behavior.

Proof ideas:

- Restart resets state.
- HUD changes during a run.

## Phase 5: Board Proof

Document the proof packet a future Local Task should emit for this project: commands run, screenshot/manual checks, and follow-up issues.
