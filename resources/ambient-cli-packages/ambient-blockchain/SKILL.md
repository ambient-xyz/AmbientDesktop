---
name: ambient-blockchain
description: Safely observe the Ambient Blockchain, plan Tool Oracle and x402 interactions, prepare Ambient program deployment work, and run local live-test evidence gates.
---

# Ambient Blockchain Adapter

Use this capability when the user wants Ambient Desktop or Pi to inspect Ambient chain state, plan funded Tool Oracle requests, work with x402 endpoints, scaffold/validate Ambient program deployment work, or collect live evidence for this blockchain integration.

## Discovery And Setup

- Find this package with `ambient_cli_search` using terms like `Ambient Blockchain`, `Solana RPC`, `Tool Oracle`, `x402`, `program deploy`, or `live gate`.
- Call `ambient_cli_describe` before first use so the exact commands, env bindings, and safety gates are visible.
- Run `ambient_chain_doctor --json` before other commands. The health check is deterministic and does not touch the network unless `--network` is passed.
- Safe live-read is the default live lane: `ambient_blockchain_live_gate --live-read --json` tests `getHealth`, `getVersion`, and `getSlot` without secrets or spend.
- The default RPC is `http://rpc.ambient.xyz:8899/`; set `AMBIENT_BLOCKCHAIN_RPC_URL` only when a local or alternate Ambient-compatible endpoint is intended.
- Keypair env bindings are acceptable for now, but treat them like browser/Electron wallet secrets: bind through Ambient-managed secret/file flows, never paste key material into chat, and only use signer-backed lanes after explicit spend approval.
- Use `ambient_keypair_status --json` before any signer-backed plan. It reports configured booleans, path hashes, file metadata, and public keys only; it never prints keypair paths or private bytes.
- Use `ambient_approval_verify --plan-artifact <path> --approval-sha256 <sha> --require-signer --json` immediately before any submit, payment, deploy, upgrade, or authority command.

## Commands

- `ambient_chain_doctor --json`: reports package readiness, pinned contract IDs, env configured booleans, and live-test lanes. Add `--network` to probe read-only RPC reachability.
- `ambient_chain_rpc --method <read-only-method> --params-json '<json-array>' --json`: calls an allowlisted read-only JSON-RPC method and writes the full response under `.ambient/blockchain/rpc/`.
- `ambient_chain_account --address <pubkey> --json`: reads balance and account metadata, then writes full evidence under `.ambient/blockchain/account/`.
- `ambient_chain_transaction --signature <sig> --json`: reads one transaction, summarizes status and logs, and writes the raw response under `.ambient/blockchain/transaction/`. Use `--address <pubkey> --limit <n>` instead to list recent signatures for an address.
- `ambient_chain_program_observe --program-id <pubkey> --filters-json '<json-array>' --json`: reads program accounts with bounded data slices, account summaries, and a full artifact. Use `--allow-unfiltered` only when the user explicitly wants a broad scan.
- `ambient_keypair_status --json [--kind chain|x402]`: validates signer bindings without exposing paths or secrets, and writes the same redacted status under `.ambient/blockchain/keypair/`.
- `ambient_approval_verify --plan-artifact <path> --approval-sha256 <sha> --json`: recomputes a plan approval digest, checks optional cap bounds, and optionally verifies the current signer still matches the plan. This command does not sign or submit anything.
- `ambient_auction_inspect --json [--account <pubkey>]`: returns pinned Auction and Tool Oracle contract metadata; with `--account`, verifies one account owner through read-only RPC.
- `ambient_oracle_request_plan --prompt <text> --escrow-lamports <n> --json`: creates a non-mutating Tool Oracle funded-request plan with prompt hash, caps, approval digest/copy, signer summary, and evidence artifact.
- `ambient_oracle_request_submit --plan-artifact <path> --approval-sha256 <sha> --max-lamports <n> --require-signer --client-command-json '<json-array>' --json`: submits an approved Tool Oracle request through an explicit client command template. Supported placeholders include `<KEYPAIR_FILE>`, `<RPC_URL>`, `<WS_URL>`, `<PROMPT_FILE>`, `<ESCROW_LAMPORTS>`, `<MAX_RESPONSES>`, and `<FILTER>`; signer path, prompt text, and prompt-file path are redacted from output artifacts.
- `ambient_oracle_request_wait --submit-artifact <path> --max-attempts <n> --json`: polls the request account with read-only RPC and writes every observation plus bounded decoded state evidence.
- `ambient_oracle_response_decode --wait-artifact <path> --json`: decodes preserved Tool Oracle account data from a wait/account artifact or `--data-base64` payload.
- `ambient_oracle_reclaim_plan --submit-artifact <path> --json`: creates a non-mutating cleanup plan for reclaiming lamports from a completed or failed request account.
- `ambient_oracle_reclaim_execute --plan-artifact <path> --approval-sha256 <sha> --max-lamports <n> --require-signer --client-command-json '<json-array>' --json`: executes approved cleanup through an explicit client command template with `<REQUEST_ACCOUNT>`, `<KEYPAIR_FILE>`, and `<RPC_URL>` placeholders.
- `ambient_x402_quote --endpoint <url> --max-micro-usdc <n> --json [--live]`: prepares an x402 quote/payment plan with separate lamport and micro-USDC caps; `--live` may probe for payment metadata but still does not submit payment.
- `ambient_x402_request_execute --quote-artifact <path> --approval-sha256 <sha> --max-lamports <n> --max-micro-usdc <n> --payment-header-file <path> --json`: executes an approved x402 paid HTTP request using a one-use payment header file. It replays approval, cap, method, endpoint, and signer checks, captures receipt headers and full response body, and redacts the payment header.
- `ambient_program_doctor --json`: checks local Rust/Solana/Anchor toolchain readiness without installing anything.
- `ambient_program_scaffold --project-dir <dir> --template native-rust|anchor|oracle-client|auction-cpi --json`: writes a local program workbench project. The default `native-rust` template is dependency-free and suitable for offline build/test validation.
- `ambient_program_build --project-dir <dir> --json`: runs `cargo build`, preserves full stdout/stderr in `.ambient/blockchain/program/`, and returns bounded previews.
- `ambient_program_test --project-dir <dir> --json`: runs `cargo test`, preserves full stdout/stderr in `.ambient/blockchain/program/`, and returns bounded previews.
- `ambient_program_deploy_plan --binary <path> --json`: hashes a local program artifact and produces a non-mutating deployment plan with signer and lamport gates.
- `ambient_program_deploy_execute --plan-artifact <path> --approval-sha256 <sha> --max-lamports <n> --require-signer --json`: executes an approved Solana CLI program deploy only after approval verification, binary hash replay, lamport cap replay, and signer binding checks. It preserves full redacted stdout/stderr, signature, and command evidence under `.ambient/blockchain/program/`.
- `ambient_program_upgrade_plan --program-id <pubkey> --binary <path> --json`: hashes a local program artifact and produces a non-mutating upgrade plan for an existing program id.
- `ambient_program_upgrade_execute --plan-artifact <path> --approval-sha256 <sha> --max-lamports <n> --require-signer --json`: executes an approved Solana CLI program upgrade only after approval verification, binary hash replay, lamport cap replay, and signer binding checks.
- `ambient_program_authority_plan --program-id <pubkey> --new-authority <pubkey> --json`: creates a non-mutating upgrade-authority change plan. Use `--final` instead of `--new-authority` only when the user explicitly wants irreversible authority removal.
- `ambient_program_authority_execute --plan-artifact <path> --approval-sha256 <sha> --max-lamports <n> --require-signer --json`: executes an approved upgrade-authority change with redacted signer evidence.
- `ambient_local_validator_gate --json [--start-validator]`: checks local `solana-test-validator` readiness, or starts/stops a bounded validator lifecycle only when explicitly requested, preserving logs and redacting ledger paths.
- `ambient_desktop_pi_dogfood --json`: runs deterministic package discovery dogfood for Desktop/Pi without network, secrets, signing, or spend. It verifies the manifest, skill discovery flow, safety gates, and local doctor health check, then writes evidence under `.ambient/blockchain/dogfood/`.
- `ambient_blockchain_live_gate --json`: runs the local release gate and writes JSON plus Markdown evidence. Add `--desktop-pi`, `--live-read`, `--x402`, `--oracle`, `--program`, or `--local-validator` to exercise those lanes. Add `--oracle-funded` only when the user explicitly approves a low-escrow Tool Oracle submit/wait/decode/reclaim lifecycle with signer and caps configured; use `--oracle-fake-wait` only for deterministic local evidence. Add `--x402-paid` only when the user explicitly approves a capped paid request with signer and one-use payment header configured. Add `--program-lifecycle` to scaffold/build/test a local workbench; add `--program-deploy` only when the user explicitly approves a capped deploy with signer configured; add `--program-observe` to collect bounded read-only post-deploy observation evidence. Add `--start-validator` only for an opt-in validator lifecycle.

## Live Testing Expectations

- Always collect immutable local evidence for live work. Use `.ambient/blockchain/live-gate/` for release-gate JSON/Markdown reports and command-specific subdirectories for raw RPC, account, x402, oracle, validator, and program artifacts.
- Live-gate reports include an `evidenceIndex` with per-lane artifact references, signatures, receipts, and cost/cap summaries. Use it first when reporting what a live run proved.
- Desktop/Pi discovery dogfood is the non-network product lane: run `ambient_desktop_pi_dogfood --json` directly or `ambient_blockchain_live_gate --desktop-pi --json` to prove Pi can discover, describe, health-check, and respect safety guidance for the bundled package.
- Safe live-read is the default live lane: `ambient_blockchain_live_gate --live-read --json` should test `getHealth`, `getVersion`, and `getSlot` without secrets or spend.
- Funded Tool Oracle and x402 lanes must be quote/plan-first. Tool Oracle submit/reclaim commands require a configured signer, explicit lamport cap, visible approval, explicit oracle client command template or explicit fake test mode, transaction signature artifact, wait/decode evidence, and cleanup evidence; `ambient_blockchain_live_gate --oracle --oracle-funded --json` runs that approved lifecycle through the same commands and records redacted lane evidence. x402 execution requires separate lamport and micro-USDC caps, visible approval, one-use payment header file, receipt artifact, and response evidence; `ambient_blockchain_live_gate --x402 --x402-paid --json` runs that approved paid path through the same executor and records redacted lane evidence.
- Approval digests are part of the plan contract. Submit/payment/deploy commands must run `ambient_approval_verify` and verify the user approved the same `approvalSha256` before signing, paying, or deploying.
- Program deployment lanes must separate scaffold, local build/test readiness, deploy/upgrade/authority plan, execution, observe, and teardown. Run program execution commands only after `ambient_approval_verify` succeeds for the exact plan digest; each command re-verifies internally, redacts the keypair path, and preserves logs/signature evidence. `ambient_blockchain_live_gate --program --program-lifecycle --json` records scaffold/build/test evidence, `--program-deploy` adds approved deploy-plan/deploy execution evidence, and `--program-observe` adds bounded read-only post-deploy observation evidence.
- Local validator lifecycle runs are opt-in. Use `ambient_local_validator_gate --start-validator --json` or `ambient_blockchain_live_gate --local-validator --start-validator --json`; otherwise the validator lane only reports readiness or setup gaps.
- Prefer live Ambient/Pi/Desktop validation for product behavior, but keep funded and deploy actions behind explicit opt-in flags and approval boundaries.

## Safety And Boundaries

- The bundled commands are read-only or non-mutating planners except `ambient_x402_request_execute`, `ambient_program_deploy_execute`, `ambient_program_upgrade_execute`, and `ambient_program_authority_execute`, which are signer-backed funded lanes gated by approval digest, cap replay, and signer binding checks.
- Generic RPC is allowlisted. Transaction submission, airdrops, and simulation of signed payloads are blocked by default.
- Prefer the purpose-built account, transaction, and program observation commands over generic RPC so the chat transcript stays bounded and full evidence is preserved.
- Stdout is bounded for the chat transcript. Full JSON responses and logs are written as workspace artifacts with path, size, and hash metadata.
- Do not expose keypair paths, key material, payment secrets, or API keys in chat output, descriptor text, logs, or artifacts.
- Payment headers must come from `--payment-header-file` or `AMBIENT_X402_PAYMENT_HEADER_FILE`; do not pass one-use x402 payment values in chat text or command arguments.
- If a live lane fails because the Ambient RPC, JumpGate, or local toolchain is unavailable, report the exact lane and artifact path instead of broad retry advice.
