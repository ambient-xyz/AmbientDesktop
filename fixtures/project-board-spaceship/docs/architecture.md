# Architecture Notes

The prototype should use Three.js on top of WebGL. Rendering should stay separate from deterministic game logic so Local Task runs can test important behavior without needing a full browser harness every time.

Proposed boundaries:

- `GameState`: pure state for player ship, enemies, hazards, score, health, session state, and spawn timers.
- `InputAdapter`: turns keyboard events into normalized intent such as thrust, brake, rotate, or fire.
- `Renderer`: owns the Three.js scene, camera, mesh lifecycle, resize handling, and frame presentation.
- `GameLoop`: fixed or semi-fixed update step that advances state, then asks Renderer to draw the current state.
- `Proof`: unit tests for pure state and a browser/manual proof path for nonblank canvas rendering.

Open architectural risks:

- The renderer may tempt future cards to hide gameplay state in meshes. Avoid that.
- We need one obvious place to record proof artifacts after a Local Task run.
- A visual smoke test may be valuable later, but the current implementation plan should not depend on full visual regression infrastructure.
