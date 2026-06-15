# Gameplay Notes

These notes are intentionally mixed quality. The Build Board interview should identify the unresolved choices instead of pretending they are settled.

Controls:

- Arcade controls might be better for a first playable slice because the ship should feel responsive immediately.
- Inertia-based thrust could feel more spaceship-like and might make dodging hazards more interesting.
- Keyboard first is probably fine, but touch/mobile support would make the demo easier to share.

Encounter pacing:

- Waves are easier to test because each wave can have deterministic enemy counts.
- Endless spawning sounds more replayable and might better match an arcade survival loop.
- The first version should not require boss behavior.

Core feedback:

- Collision should visibly reduce health or end the run.
- Score could be survival time, cargo delivered, enemies dodged, or enemies destroyed.
- Restart should be one button/key and should fully reset gameplay state.
