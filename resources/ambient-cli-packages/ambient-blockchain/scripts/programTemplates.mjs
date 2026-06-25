export function programTemplateFiles(template, name) {
  if (template === "native-rust") return nativeRustTemplateFiles(name);
  if (template === "anchor") return anchorTemplateFiles(name);
  if (template === "oracle-client") return oracleClientTemplateFiles(name);
  if (template === "auction-cpi") return auctionCpiTemplateFiles(name);
  throw new Error(`Unsupported program template "${template}". Use native-rust, anchor, oracle-client, or auction-cpi.`);
}

function nativeRustTemplateFiles(name) {
  return [
    {
      path: "Cargo.toml",
      content: `[package]
name = "${name}"
version = "0.1.0"
edition = "2021"

[lib]
path = "src/lib.rs"

[features]
default = []
solana = []
`,
    },
    {
      path: "src/lib.rs",
      content: `//! Ambient program workbench scaffold.
//!
//! This default template is dependency-free so Ambient Desktop can build and test it
//! offline before the user opts into Solana/Anchor dependencies or deployment.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CounterState {
    pub value: u64,
}

impl CounterState {
    pub const fn new(value: u64) -> Self {
        Self { value }
    }

    pub fn apply_increment(self, amount: u64) -> Result<Self, &'static str> {
        let value = self.value.checked_add(amount).ok_or("counter overflow")?;
        Ok(Self { value })
    }
}

pub fn ambient_entrypoint_preview(input: &[u8]) -> Result<CounterState, &'static str> {
    let amount = input.first().copied().unwrap_or(1) as u64;
    CounterState::new(0).apply_increment(amount)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn increments_counter() {
        assert_eq!(
            CounterState::new(2).apply_increment(3).unwrap(),
            CounterState::new(5),
        );
    }

    #[test]
    fn entrypoint_preview_defaults_to_one() {
        assert_eq!(ambient_entrypoint_preview(&[]).unwrap(), CounterState::new(1));
    }
}
`,
    },
    {
      path: "README.md",
      content: `# ${name}

Ambient Blockchain program workbench scaffold.

Local validation:

\`\`\`sh
cargo build
cargo test
\`\`\`

This template is intentionally dependency-free. Add Solana or Anchor crates only
after the local scaffold is understood and the target deployment path is planned.
Use \`ambient_program_deploy_plan\` before any signer-backed deployment.
`,
    },
  ];
}

function anchorTemplateFiles(name) {
  return [
    {
      path: "Anchor.toml",
      content: `[features]
seeds = false
skip-lint = false

[programs.localnet]
${name} = "11111111111111111111111111111111"

[provider]
cluster = "Localnet"
wallet = "~/.config/solana/id.json"
`,
    },
    {
      path: "programs/ambient-anchor/Cargo.toml",
      content: `[package]
name = "${name}"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]
name = "${name}"

[dependencies]
anchor-lang = "0.30"
`,
    },
    {
      path: "programs/ambient-anchor/src/lib.rs",
      content: `use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod ${name} {
    use super::*;

    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
`,
    },
    {
      path: "README.md",
      content: `# ${name}

Anchor scaffold for Ambient-compatible Solana programs.

Run \`ambient_program_doctor --json\` before building. Anchor builds may require
network dependency resolution and local Solana/Anchor toolchains.
`,
    },
  ];
}

function oracleClientTemplateFiles(name) {
  return [
    ...nativeRustTemplateFiles(name),
    {
      path: "src/oracle_client.rs",
      content: `//! Tool Oracle client planning helpers.

pub const TOOL_ORACLE_PROGRAM_ID: &str = "721QWDeUzVL77UCzCFHsVGCMBVup8GsAMPaD2YvWvw97";
pub const AUCTION_PROGRAM_ID: &str = "Auction111111111111111111111111111111111111";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OracleRequestPlan {
    pub prompt_sha256: String,
    pub escrow_lamports: u64,
    pub max_responses: u16,
}
`,
    },
  ];
}

function auctionCpiTemplateFiles(name) {
  return [
    ...nativeRustTemplateFiles(name),
    {
      path: "src/auction_cpi.rs",
      content: `//! Auction CPI scaffold placeholders.

pub const AUCTION_PROGRAM_ID: &str = "Auction111111111111111111111111111111111111";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuctionAccountPlan {
    pub auction_program_id: &'static str,
    pub request_account: String,
}
`,
    },
  ];
}

export function safeRustIdentifier(value) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9_ -]+/g, "")
    .replace(/[-\s]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const candidate = normalized || "ambient_program";
  return /^[a-z_]/.test(candidate) ? candidate : `ambient_${candidate}`;
}
