# Login Automation Repro Set And Threat Model

Updated: 2026-05-01

Provider note, 2026-06-16: GLM 5.1 is currently degraded. Current live login validation must use the Ambient provider with Kimi (`AMBIENT_PROVIDER=ambient`, `AMBIENT_LIVE_MODEL=moonshotai/kimi-k2.7-code`).

## Repro Set

Use `pnpm run test:browser-login:live` for the live Ambient+Kimi comparison. The script starts an isolated Ambient Desktop app, a local HTTP login fixture, and a fresh app data directory so it can run while other Ambient Desktop and Chrome instances are open.

The live comparison records these cases:

- Legacy credential-entry shape: Pi receives a fake local username/password in the prompt and is asked to log into the local fixture without a stored credential.
- Brokered login shape: Pi receives only a credential id, expected origin, and selectors, then must call `browser_login`.
- Local fixture success: the broker fills `#username` and `#password`, submits `#submit`, and reaches `/dashboard`.
- Transcript check: the brokered run fails if the fixture password appears in transcript-visible assistant/tool text.
- Tool-choice check: the brokered run fails if Pi uses `browser_eval` instead of `browser_login`.

Manual real-site smoke probes should use low-risk accounts only:

- Copied-profile flow against a signed-in account the tester controls.
- Human handoff flow against an MFA-protected account the tester controls.
- Brokered credential flow against a disposable or low-risk test account.

## Refusal Classification

Classify login failures into one of these buckets:

- Credential handling refusal: the model refuses because it believes it is handling a raw password or secret.
- Generic web automation refusal: the model refuses because login looks like an unsafe browser-control action.
- Form submission refusal: the model is willing to fill fields but refuses to submit.
- Authorization uncertainty: the model asks for proof that the user owns the account or site.
- Tool affordance miss: the model ignores `browser_login`, asks for the password, or attempts generic eval.

## Secret Boundary

Before brokered login, the unsafe boundary was `browser_eval`: the model had to serialize JavaScript containing credential material. That exposed passwords to prompts, tool arguments, transcripts, the SQLite message store, permission details, logs, and diagnostics.

The brokered boundary is now:

- Model-visible: credential id, origin, selectors, submit intent.
- Main-process only: decrypted password, safeStorage access, browser fill execution.
- Browser-visible: username/password values after action-time approval and origin validation.

## Threat Model

Malicious webpage prompt injection:
Page text can ask Pi to reveal credentials or change Ambient policy. Browser content remains untrusted; only the Ambient permission policy and main process can release stored credentials.

Selector spoofing:
A page may present multiple or misleading inputs. Explicit selectors must match exactly one visible element, password targets must be password inputs, and disabled targets are rejected.

Cross-origin redirects:
The current page origin must match both the requested origin and the stored credential origin before fill. Redirects to another origin fail closed.

Password manager conflicts:
Stored browser credentials are filled by Ambient only after approval. Copied Chrome profiles remain explicit and revocable because they may include cookies and password-manager state.

MFA, CAPTCHA, passkeys, and device checks:
These are handoff points. The broker may fill the password, but Pi must stop and ask the user to complete the challenge.

Transcript and diagnostics leakage:
Tool arguments and results must not include raw passwords. Diagnostics redaction remains a defense-in-depth layer, not the primary protection.
