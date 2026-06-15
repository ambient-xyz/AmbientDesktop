# Generated Capability Management

Generated Ambient capability packages are managed through chat-first Capability Builder flows. The Plugins/Capabilities panel should keep rows compact:

- Row actions: `Details` and `Open source`.
- Details actions: `Validate`, `Plan update`, and `Plan removal`.

Each management action starts a normal chat prompt instead of mutating package state directly from the UI. Pi should inspect the generated provenance, use `ambient_capability_builder_update_plan` for update/rebuild planning, use `ambient_capability_builder_removal_plan` for removal/deactivation planning, use `ambient_capability_builder_preview` for validation inspection when source exists, and then propose or perform the next step only within the existing Capability Builder approval boundaries.

Planning prompts must keep inspection inside Capability Builder tools. Pi should not use shell, browser, `ambient_cli`, direct filesystem, or package install tools during update/removal planning.

For generated update/rebuild requests, Pi should prefer `ambient_capability_builder_update_plan` over a loose prompt-only preview. The tool is read-only, allowed in Planner Mode, and returns a structured plan with preview facts, approval checkpoints, rollback guidance, warnings/errors, descriptor metadata, artifact/env details, and builder provenance refs. Pi should not call `ambient_capability_builder_preview` separately during update planning unless the user explicitly asks for a separate static preview diagnostic.

For generated removal/deactivation requests, Pi should prefer `ambient_capability_builder_removal_plan` over a loose prompt-only preview. The tool is read-only, allowed in Planner Mode, and returns installed state, builder source state, package Git/provenance refs, validation/dependency logs, possible artifacts, env requirements, registry visibility, preserve-by-default items, approval checkpoints, and rollback steps. Pi should not call `ambient_capability_builder_preview` separately during removal planning unless the user explicitly asks for a separate static preview diagnostic.

For generated capability discovery after unregister, Pi should use `ambient_capability_builder_history`. Ambient CLI search only sees currently installed packages, while Capability Builder history sees preserved source packages under `.ambient/capability-builder/packages/`, including unregistered packages that can be previewed, validated, re-registered, updated, or safely removed.

Expected behavior:

- `History`: call `ambient_capability_builder_history` when a generated capability is no longer searchable but may have preserved builder source.
- `Generated sources UI`: the Plugins/Capabilities Sources tab should display preserved Capability Builder history and launch chat-first preview, re-register, update-plan, and removal-plan prompts for each source.
- `Validate`: preview the builder source, summarize risks, then ask for approval before calling `ambient_capability_builder_validate`.
- `Plan update`: call `ambient_capability_builder_update_plan` and propose file, dependency, env/permission, artifact, version/ref, registration, validation, and rollback steps before any mutation.
- `Plan removal`: call `ambient_capability_builder_removal_plan` and distinguish installed Ambient CLI package state from managed builder source, Git history, validation logs, artifacts, env/secret metadata, and registry visibility before any deletion or unregistering.
- `Unregister`: after an approved removal plan, call `ambient_capability_builder_unregister` for least-destructive deactivation. It removes only the installed generated Ambient CLI package copy and preserves builder source, package Git history, validation/dependency logs, artifacts, and env/secret metadata.
- `Rollback/re-register`: call `ambient_capability_builder_register` on the preserved builder source. If validation metadata still matches current package content, registration can proceed with approval; if the source changed, run validation again first.

Least-destructive defaults:

- Preserve builder source, package Git history, validation logs, and generated artifacts unless the user explicitly approves deletion.
- Do not remove secrets, unregister packages, edit package state, install dependencies, validate, or register from these planning prompts unless the user approves a specific follow-up step.
- Use `ambient_capability_builder_unregister` instead of generic `ambient_cli_package_uninstall` for generated capability unregister/deactivation, because the Capability Builder tool preserves builder provenance and records source status.
- Use `ambient_capability_builder_register` for rollback after least-destructive unregister. Do not recreate source or reinstall from generic package state when the builder source is preserved.

Live dogfood:

- `AMBIENT_PLUGIN_CHAT_LIVE=1 AMBIENT_API_KEY=<key> bash scripts/test-node-native.sh src/main/pluginDogfood.test.ts -t "plans a generated Ambient capability update through the read-only Capability Builder tool"`
- `AMBIENT_PLUGIN_CHAT_LIVE=1 AMBIENT_API_KEY=<key> bash scripts/test-node-native.sh src/main/pluginDogfood.test.ts -t "plans generated Ambient capability removal through the read-only Capability Builder tool"`
- `AMBIENT_PLUGIN_CHAT_LIVE=1 AMBIENT_API_KEY=<key> bash scripts/test-node-native.sh src/main/pluginDogfood.test.ts -t "unregisters a generated Ambient capability through Capability Builder while preserving source"`
- `AMBIENT_PLUGIN_CHAT_LIVE=1 AMBIENT_API_KEY=<key> bash scripts/test-node-native.sh src/main/pluginDogfood.test.ts -t "re-registers an unregistered generated Ambient capability through Capability Builder"`
- `AMBIENT_PLUGIN_CHAT_LIVE=1 AMBIENT_API_KEY=<key> bash scripts/test-node-native.sh src/main/pluginDogfood.test.ts -t "discovers unregistered generated Ambient capability source through Capability Builder history"`
- `AMBIENT_PLUGIN_CHAT_LIVE=1 AMBIENT_API_KEY=<key> bash scripts/test-node-native.sh src/main/pluginDogfood.test.ts -t "dogfoods generated capability management planning prompts"`
- The dogfood uses the same renderer prompt builders as the UI, verifies Pi calls the read-only update-plan/removal-plan paths for management planning, and asserts no approval-gated validation or registration tool runs during planning-only turns.
