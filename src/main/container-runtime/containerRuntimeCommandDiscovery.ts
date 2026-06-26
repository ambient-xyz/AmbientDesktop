import { posix, win32 } from "node:path";

export type ContainerRuntimeCommandKind = "docker" | "podman" | "colima" | "wsl2";
export type ContainerRuntimeCliKind = Exclude<ContainerRuntimeCommandKind, "wsl2">;

export interface ContainerRuntimeCommandHint {
  kind: ContainerRuntimeCommandKind;
  executablePath?: string;
  applicationPath?: string;
}

export function containerRuntimeCommandCandidates(
  kind: ContainerRuntimeCommandKind,
  platform: NodeJS.Platform | string,
  hints: ContainerRuntimeCommandHint[] = [],
): string[] {
  return unique([
    ...bareRuntimeCommands(kind, platform),
    ...containerRuntimeProcessHintCommandCandidates(kind, platform, hints),
    ...knownRuntimeCommandCandidates(kind, platform),
  ]);
}

export function containerRuntimeDockerCommandCandidates(platform: NodeJS.Platform | string, hints: ContainerRuntimeCommandHint[] = []): string[] {
  return containerRuntimeCommandCandidates("docker", platform, hints);
}

export function containerRuntimePodmanCommandCandidates(platform: NodeJS.Platform | string, hints: ContainerRuntimeCommandHint[] = []): string[] {
  return containerRuntimeCommandCandidates("podman", platform, hints);
}

export function containerRuntimeColimaCommandCandidates(platform: NodeJS.Platform | string, hints: ContainerRuntimeCommandHint[] = []): string[] {
  return containerRuntimeCommandCandidates("colima", platform, hints);
}

export function containerRuntimeWslCommandCandidates(platform: NodeJS.Platform | string, hints: ContainerRuntimeCommandHint[] = []): string[] {
  return containerRuntimeCommandCandidates("wsl2", platform, hints);
}

export function containerRuntimeExecutableSearchDirs(platform: NodeJS.Platform | string): string[] {
  if (platform === "darwin") {
    return [
      "/opt/podman/bin",
      "/Applications/Docker.app/Contents/Resources/bin",
      "/opt/homebrew/bin",
      "/opt/homebrew/sbin",
      "/usr/local/bin",
      "/usr/local/sbin",
      "/usr/bin",
      "/bin",
      "/usr/sbin",
      "/sbin",
    ];
  }
  if (platform === "win32") {
    return [
      "C:\\Program Files\\Docker\\Docker\\resources\\bin",
      "C:\\Program Files\\Docker\\Docker\\resources",
      "C:\\ProgramData\\DockerDesktop\\version-bin",
      "C:\\Program Files\\RedHat\\Podman",
      "C:\\Program Files\\RedHat\\Podman Desktop\\resources\\bin",
      "C:\\Program Files\\Podman Desktop\\resources\\bin",
      "C:\\Windows\\System32",
      "C:\\Windows\\Sysnative",
    ];
  }
  return [
    "/usr/bin",
    "/usr/local/bin",
    "/home/linuxbrew/.linuxbrew/bin",
    "/usr/local/sbin",
    "/usr/sbin",
    "/sbin",
    "/snap/bin",
  ];
}

function bareRuntimeCommands(kind: ContainerRuntimeCommandKind, platform: NodeJS.Platform | string): string[] {
  if (platform === "win32") {
    if (kind === "wsl2") return ["wsl.exe"];
    return [`${kind}.exe`];
  }
  if (kind === "wsl2") return [];
  return [kind];
}

function knownRuntimeCommandCandidates(kind: ContainerRuntimeCommandKind, platform: NodeJS.Platform | string): string[] {
  if (kind === "wsl2") {
    if (platform !== "win32") return [];
    return ["C:\\Windows\\System32\\wsl.exe", "C:\\Windows\\Sysnative\\wsl.exe"];
  }
  if (platform === "win32" && kind === "docker") {
    return [
      "C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe",
      "C:\\Program Files\\Docker\\Docker\\resources\\docker.exe",
      "C:\\Program Files\\Docker\\Docker\\resources\\com.docker.cli.exe",
      "C:\\ProgramData\\DockerDesktop\\version-bin\\docker.exe",
    ];
  }
  const names = bareRuntimeCommands(kind, platform);
  return knownRuntimeExecutableDirs(kind, platform).flatMap((dir) => names.map((name) => joinRuntimePath(platform, dir, name)));
}

function knownRuntimeExecutableDirs(kind: ContainerRuntimeCliKind, platform: NodeJS.Platform | string): string[] {
  if (platform === "darwin") {
    if (kind === "docker") return ["/Applications/Docker.app/Contents/Resources/bin", "/opt/homebrew/bin", "/usr/local/bin"];
    if (kind === "podman") return ["/opt/podman/bin", "/opt/homebrew/bin", "/usr/local/bin"];
    return ["/opt/homebrew/bin", "/usr/local/bin"];
  }
  if (platform === "win32") {
    if (kind === "docker") {
      return [
        "C:\\Program Files\\Docker\\Docker\\resources\\bin",
        "C:\\Program Files\\Docker\\Docker\\resources",
        "C:\\ProgramData\\DockerDesktop\\version-bin",
      ];
    }
    if (kind === "podman") {
      return [
        "C:\\Program Files\\RedHat\\Podman",
        "C:\\Program Files\\RedHat\\Podman Desktop\\resources\\bin",
        "C:\\Program Files\\Podman Desktop\\resources\\bin",
      ];
    }
    return [];
  }
  if (kind === "colima") return ["/usr/local/bin", "/usr/bin", "/home/linuxbrew/.linuxbrew/bin"];
  return ["/usr/bin", "/usr/local/bin", "/home/linuxbrew/.linuxbrew/bin", "/usr/local/sbin", "/usr/sbin", "/sbin", "/snap/bin"];
}

export function containerRuntimeProcessHintCommandCandidates(
  kind: ContainerRuntimeCommandKind,
  platform: NodeJS.Platform | string,
  hints: ContainerRuntimeCommandHint[] = [],
): string[] {
  return unique(hints
    .filter((hint) => hint.kind === kind)
    .flatMap((hint) => commandCandidatesFromProcessHint(kind, platform, hint)));
}

function commandCandidatesFromProcessHint(
  kind: ContainerRuntimeCommandKind,
  platform: NodeJS.Platform | string,
  hint: ContainerRuntimeCommandHint,
): string[] {
  if (kind === "wsl2") return [];
  const candidates: string[] = [];
  const executablePath = hint.executablePath;
  if (executablePath && runtimeExecutableNameMatches(kind, platform, executablePath)) candidates.push(executablePath);

  const applicationPath = hint.applicationPath ?? applicationPathFromExecutablePath(platform, executablePath);
  if (applicationPath) {
    candidates.push(...applicationRuntimeCommandCandidates(kind, platform, applicationPath));
  }

  if (executablePath) {
    candidates.push(...siblingRuntimeCommandCandidates(kind, platform, executablePath));
  }

  return candidates
    .map((candidate) => normalizeRuntimeCommandCandidate(platform, candidate))
    .filter((candidate): candidate is string => Boolean(candidate && trustedRuntimeCommandCandidate(kind, platform, candidate)));
}

function applicationRuntimeCommandCandidates(
  kind: ContainerRuntimeCliKind,
  platform: NodeJS.Platform | string,
  applicationPath: string,
): string[] {
  if (platform === "darwin") {
    if (kind === "docker") {
      return [
        posix.join(applicationPath, "Contents", "Resources", "bin", "docker"),
        posix.join(applicationPath, "Contents", "Resources", "docker"),
        posix.join(applicationPath, "Contents", "Resources", "com.docker.cli"),
      ];
    }
    if (kind === "podman") {
      return [
        posix.join(applicationPath, "Contents", "Resources", "bin", "podman"),
        "/opt/podman/bin/podman",
      ];
    }
  }
  if (platform === "win32") {
    const root = win32.dirname(applicationPath);
    if (kind === "docker") {
      return [
        win32.join(root, "resources", "bin", "docker.exe"),
        win32.join(root, "resources", "docker.exe"),
        win32.join(root, "resources", "com.docker.cli.exe"),
      ];
    }
    if (kind === "podman") {
      return [
        win32.join(root, "resources", "bin", "podman.exe"),
        win32.join(root, "podman.exe"),
      ];
    }
  }
  return [];
}

function siblingRuntimeCommandCandidates(
  kind: ContainerRuntimeCliKind,
  platform: NodeJS.Platform | string,
  executablePath: string,
): string[] {
  const path = platform === "win32" ? win32 : posix;
  const sibling = path.join(path.dirname(executablePath), platform === "win32" ? `${kind}.exe` : kind);
  return sibling === executablePath ? [] : [sibling];
}

function runtimeExecutableNameMatches(
  kind: ContainerRuntimeCliKind,
  platform: NodeJS.Platform | string,
  executablePath: string,
): boolean {
  const name = (platform === "win32" ? win32.basename(executablePath) : posix.basename(executablePath)).toLowerCase();
  if (kind === "docker" && (name === "com.docker.cli" || name === "com.docker.cli.exe")) return true;
  return name === (platform === "win32" ? `${kind}.exe` : kind);
}

function applicationPathFromExecutablePath(platform: NodeJS.Platform | string, executablePath: string | undefined): string | undefined {
  if (!executablePath) return undefined;
  const normalized = normalizeRuntimeCommandCandidate(platform, executablePath);
  if (!normalized) return undefined;
  if (platform === "darwin") {
    const match = normalized.match(/^(\/.*?\.app)(?:\/|$)/);
    return match?.[1];
  }
  if (platform === "win32" && /(?:docker|podman) desktop\.exe$/i.test(normalized)) {
    return normalized;
  }
  return undefined;
}

function trustedRuntimeCommandCandidate(
  kind: ContainerRuntimeCliKind,
  platform: NodeJS.Platform | string,
  candidate: string,
): boolean {
  if (!runtimeExecutableNameMatches(kind, platform, candidate)) return false;
  return trustedRuntimeCommandRoots(kind, platform).some((root) => pathIsInsideRoot(platform, candidate, root));
}

function normalizeRuntimeCommandCandidate(platform: NodeJS.Platform | string, candidate: string): string | undefined {
  if (!candidate || /[\0\r\n]/.test(candidate)) return undefined;
  if (platform === "win32") {
    const normalized = win32.normalize(candidate);
    return /^[A-Za-z]:\\|^\\\\/.test(normalized) ? normalized : undefined;
  }
  if (!candidate.startsWith("/")) return undefined;
  return posix.normalize(candidate);
}

function trustedRuntimeCommandRoots(kind: ContainerRuntimeCliKind, platform: NodeJS.Platform | string): string[] {
  if (platform === "darwin") {
    return [
      ...(kind === "docker" ? ["/Applications/Docker.app/Contents/Resources"] : []),
      ...(kind === "podman" ? ["/Applications/Podman Desktop.app/Contents/Resources"] : []),
      ...knownRuntimeExecutableDirs(kind, platform),
    ];
  }
  if (platform === "win32") {
    if (kind === "docker") {
      return [
        "C:\\Program Files\\Docker\\Docker\\resources",
        "C:\\ProgramData\\DockerDesktop\\version-bin",
      ];
    }
    if (kind === "podman") {
      return [
        "C:\\Program Files\\RedHat\\Podman",
        "C:\\Program Files\\RedHat\\Podman Desktop\\resources",
        "C:\\Program Files\\Podman Desktop\\resources",
      ];
    }
    return [];
  }
  return knownRuntimeExecutableDirs(kind, platform);
}

function pathIsInsideRoot(platform: NodeJS.Platform | string, candidate: string, root: string): boolean {
  if (platform === "win32") {
    const normalizedRoot = win32.normalize(root);
    const relative = win32.relative(normalizedRoot, candidate);
    return relative === "" || (!relative.startsWith("..") && !win32.isAbsolute(relative));
  }
  const normalizedRoot = posix.normalize(root);
  const relative = posix.relative(normalizedRoot, candidate);
  return relative === "" || (!relative.startsWith("..") && !posix.isAbsolute(relative));
}

function joinRuntimePath(platform: NodeJS.Platform | string, dir: string, name: string): string {
  return platform === "win32" ? win32.join(dir, name) : posix.join(dir, name);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
