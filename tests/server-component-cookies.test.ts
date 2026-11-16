import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function serverComponents(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return serverComponents(path);
    return /(?:page|layout)\.tsx$/.test(entry.name) ? [path] : [];
  });
}

describe("Server Components schrijven geen cookies", () => {
  it("houdt CSRF-uitgifte buiten alle pages en layouts", () => {
    for (const path of serverComponents(join(process.cwd(), "app"))) {
      const source = readFileSync(path, "utf8");
      expect(source, path).not.toContain("csrfToken(");
      expect(source, path).not.toMatch(/cookies\s*\(.*\.set\s*\(/s);
    }
  });
});
