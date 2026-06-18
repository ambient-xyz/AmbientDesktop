const envTemplateBasenames = new Set([".env.example", ".env.sample", ".env.template", "example.env", "sample.env"]);

export function pathBasename(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  return (lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized).toLowerCase();
}

export function isEnvTemplatePath(path: string): boolean {
  return envTemplateBasenames.has(pathBasename(path));
}

export function isDotEnvPath(path: string): boolean {
  const basename = pathBasename(path);
  return basename === ".env" || basename.startsWith(".env.");
}
