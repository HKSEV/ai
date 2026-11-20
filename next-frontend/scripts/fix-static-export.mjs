import { copyFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

function copySegments(directory, targetDirectory, prefix) {
  for (const entry of readdirSync(directory, {withFileTypes: true})) {
    const source = join(directory, entry.name);
    const filename = `${prefix}.${entry.name}`;

    if (entry.isDirectory()) {
      copySegments(source, targetDirectory, filename);
    } else if (entry.isFile() && entry.name.endsWith(".txt")) {
      copyFileSync(source, join(targetDirectory, filename));
    }
  }
}

function fixRoutes(directory) {
  for (const entry of readdirSync(directory, {withFileTypes: true})) {
    if (!entry.isDirectory())
      continue;

    const source = join(directory, entry.name);

    if (entry.name.startsWith("__next.")) {
      copySegments(source, directory, entry.name);
    } else {
      fixRoutes(source);
    }
  }
}

const outDirectory = fileURLToPath(new URL("../out/", import.meta.url));
fixRoutes(outDirectory);

console.log("RSC 파일 경로 보정 완료.");