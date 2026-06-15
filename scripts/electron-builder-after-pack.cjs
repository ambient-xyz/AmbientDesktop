const { readdirSync, statSync } = require("node:fs");
const { dirname, join } = require("node:path");
const { spawnSync } = require("node:child_process");

module.exports = async function afterPack(context) {
  const projectDir = context.packager.projectDir;
  const verifyScript = join(projectDir, "scripts", "verify-electron-native-modules.mjs");
  const args = [verifyScript];

  const appPath = findPackagedApp(context);
  const resourcesPath = findPackagedResourcesPath(context, appPath);
  if (context.electronPlatformName === "darwin") {
    args.push("--app", appPath);
  } else {
    args.push("--executable", appPath);
  }

  const result = spawnSync(process.execPath, args, {
    cwd: projectDir,
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Electron native module verification failed with exit code ${result.status}`);
  }

  const runtimeArchitectureArgs = [
    join(projectDir, "scripts", "verify-runtime-architecture.mjs"),
    context.electronPlatformName === "darwin" ? "--app" : "--executable",
    appPath,
    "--resources",
    resourcesPath,
    "--expected-platform",
    context.electronPlatformName,
    "--expected-arch",
    normalizeElectronBuilderArch(context.arch),
  ];
  const runtimeArchitectureResult = spawnSync(process.execPath, runtimeArchitectureArgs, {
    cwd: projectDir,
    env: process.env,
    stdio: "inherit",
  });

  if (runtimeArchitectureResult.error) throw runtimeArchitectureResult.error;
  if (runtimeArchitectureResult.status !== 0) {
    throw new Error(`Runtime architecture verification failed with exit code ${runtimeArchitectureResult.status}`);
  }

  const toolHiveResult = spawnSync(process.execPath, [
    join(projectDir, "scripts", "verify-toolhive-bundle.mjs"),
    "--resources",
    resourcesPath,
    "--platform",
    context.electronPlatformName,
    "--arch",
    normalizeElectronBuilderArch(context.arch),
  ], {
    cwd: projectDir,
    env: process.env,
    stdio: "inherit",
  });

  if (toolHiveResult.error) throw toolHiveResult.error;
  if (toolHiveResult.status !== 0) {
    throw new Error(`ToolHive bundle verification failed with exit code ${toolHiveResult.status}`);
  }

  const mcpDefaultCatalogResult = spawnSync(process.execPath, [
    join(projectDir, "scripts", "verify-mcp-default-catalog.mjs"),
    "--resources",
    resourcesPath,
  ], {
    cwd: projectDir,
    env: process.env,
    stdio: "inherit",
  });

  if (mcpDefaultCatalogResult.error) throw mcpDefaultCatalogResult.error;
  if (mcpDefaultCatalogResult.status !== 0) {
    throw new Error(`MCP default catalog verification failed with exit code ${mcpDefaultCatalogResult.status}`);
  }

  signWindowsSelfSignedIfRequested(context, appPath);
};

function findPackagedApp(context) {
  const entries = readdirSync(context.appOutDir);
  if (context.electronPlatformName === "darwin") {
    const preferred = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
    if (existsAsDirectory(preferred)) return preferred;
    const found = entries.find((entry) => entry.endsWith(".app") && existsAsDirectory(join(context.appOutDir, entry)));
    if (found) return join(context.appOutDir, found);
  }

  if (context.electronPlatformName === "win32") {
    const preferred = join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
    if (existsAsFile(preferred)) return preferred;
    const found = entries.find((entry) => entry.endsWith(".exe") && existsAsFile(join(context.appOutDir, entry)));
    if (found) return join(context.appOutDir, found);
  }

  const preferredNames = [
    context.packager.executableName,
    context.packager.appInfo.productFilename,
    context.packager.appInfo.sanitizedName,
    "ambient-desktop",
    "ambient-codex-desktop",
    "Ambient Desktop",
  ].filter(Boolean);
  for (const name of preferredNames) {
    const candidate = join(context.appOutDir, name);
    if (existsAsFile(candidate)) return candidate;
  }

  const executable = entries
    .map((entry) => join(context.appOutDir, entry))
    .find((entry) => existsAsFile(entry) && (statSync(entry).mode & 0o111) !== 0);
  if (executable) return executable;

  throw new Error(`Could not find packaged executable in ${context.appOutDir}`);
}

function findPackagedResourcesPath(context, appPath) {
  if (context.electronPlatformName === "darwin") return join(appPath, "Contents", "Resources");
  const candidate = join(dirname(appPath), "resources");
  if (existsAsDirectory(candidate)) return candidate;
  return join(context.appOutDir, "resources");
}

function normalizeElectronBuilderArch(arch) {
  if (arch === "arm64" || arch === 3) return "arm64";
  if (arch === "x64" || arch === "amd64" || arch === 1) return "x64";
  if (arch === "ia32" || arch === 0) return "ia32";
  if (arch === "universal" || arch === 4) return process.arch === "arm64" ? "arm64" : "x64";
  return String(arch || process.arch);
}

function existsAsDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function existsAsFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function signWindowsSelfSignedIfRequested(context, appPath) {
  const thumbprint = process.env.AMBIENT_WINDOWS_SELF_SIGN_THUMBPRINT;
  if (context.electronPlatformName !== "win32" || !thumbprint) return;

  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$cert = Get-ChildItem Cert:\\CurrentUser\\My,Cert:\\LocalMachine\\My -CodeSigningCert | Where-Object Thumbprint -eq '${String(thumbprint).replace(/'/g, "''")}' | Select-Object -First 1`,
    "if (-not $cert) { throw 'Self-signing certificate not found.' }",
    `$targets = @('${String(appPath).replace(/'/g, "''")}')`,
    `$targets += Get-ChildItem -LiteralPath '${String(context.appOutDir).replace(/'/g, "''")}' -Recurse -File | Where-Object Extension -eq '.exe' | Select-Object -ExpandProperty FullName`,
    "$targets = $targets | Sort-Object -Unique",
    "foreach ($target in $targets) {",
    "  $signature = Set-AuthenticodeSignature -FilePath $target -Certificate $cert -HashAlgorithm SHA256",
    "  if ($signature.Status -ne 'Valid') { throw \"Failed to self-sign ${target}: $($signature.Status) $($signature.StatusMessage)\" }",
    "  Write-Host \"Self-signed $target\"",
    "}",
  ].join("; ");

  const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    cwd: context.packager.projectDir,
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Windows self-signing failed with exit code ${result.status}`);
  }
}
