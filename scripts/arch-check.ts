import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface ArchViolation {
  file: string;
  importSpec: string;
  rule: string;
}

const FORBIDDEN_DOMAIN_NODE_MODULES = new Set([
  "fs",
  "fs/promises",
  "node:fs",
  "node:fs/promises",
  "child_process",
  "node:child_process",
  "http",
  "node:http",
  "https",
  "node:https",
  "net",
  "node:net",
  "sqlite",
  "node:sqlite",
  "ws",
]);

function stripComments(source: string): string {
  return source.replace(
    /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
    (match) =>
      match.startsWith("//") || match.startsWith("/*")
        ? match.replace(/[^\n]/g, " ")
        : match
  );
}

function isUnderLayer(resolved: string, layerDir: string): boolean {
  return resolved === layerDir || resolved.startsWith(`${layerDir}/`);
}

export function extractImports(source: string): string[] {
  const cleaned = stripComments(source);
  const specs: string[] = [];
  const regex = /(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(cleaned)) !== null) {
    const spec = match[1] ?? match[2];
    if (spec) specs.push(spec);
  }
  return specs;
}

export function checkFileBoundaries(
  relFilePath: string,
  source: string
): ArchViolation[] {
  const normalized = relFilePath.replace(/\\/g, "/");
  const imports = extractImports(source);
  const violations: ArchViolation[] = [];

  const isDomain = normalized.startsWith("apps/server/src/domain/");
  const isPorts = normalized.startsWith("apps/server/src/ports/");
  const isApplication = normalized.startsWith("apps/server/src/application/");

  if (!isDomain && !isPorts && !isApplication) {
    return violations;
  }

  const fileDir = path.posix.dirname(normalized);

  for (const spec of imports) {
    if (isDomain && FORBIDDEN_DOMAIN_NODE_MODULES.has(spec)) {
      violations.push({
        file: normalized,
        importSpec: spec,
        rule: "domain must remain pure (no I/O or network modules)",
      });
      continue;
    }

    if (spec.startsWith(".")) {
      const resolved = path.posix.normalize(path.posix.join(fileDir, spec));
      if (isDomain) {
        if (
          isUnderLayer(resolved, "apps/server/src/application") ||
          isUnderLayer(resolved, "apps/server/src/ports") ||
          isUnderLayer(resolved, "apps/server/src/adapters")
        ) {
          violations.push({
            file: normalized,
            importSpec: spec,
            rule: "domain must not depend on application, ports, or adapters",
          });
        }
      } else if (isPorts) {
        if (
          isUnderLayer(resolved, "apps/server/src/application") ||
          isUnderLayer(resolved, "apps/server/src/adapters")
        ) {
          violations.push({
            file: normalized,
            importSpec: spec,
            rule: "ports must not depend on application or adapters",
          });
        }
      } else if (isApplication) {
        if (isUnderLayer(resolved, "apps/server/src/adapters")) {
          violations.push({
            file: normalized,
            importSpec: spec,
            rule: "application must not depend on adapters (depend on domain & ports only)",
          });
        }
      }
    }
  }

  return violations;
}

function walkTsFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTsFiles(full, out);
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      out.push(full);
    }
  }
  return out;
}

export function checkWorkspaceArchitecture(rootDir: string): ArchViolation[] {
  const serverSrc = path.join(rootDir, "apps", "server", "src");
  const files = walkTsFiles(serverSrc);
  const allViolations: ArchViolation[] = [];

  for (const file of files) {
    const rel = path.relative(rootDir, file).replace(/\\/g, "/");
    const content = fs.readFileSync(file, "utf8");
    allViolations.push(...checkFileBoundaries(rel, content));
  }

  return allViolations;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const violations = checkWorkspaceArchitecture(rootDir);
  if (violations.length > 0) {
    console.error("Hexagonal architecture boundary violations detected:");
    for (const v of violations) {
      console.error(`  - ${v.file} imports "${v.importSpec}" (${v.rule})`);
    }
    process.exit(1);
  } else {
    console.log("Hexagonal architecture check passed (domain <- ports <- application <- adapters).");
  }
}
