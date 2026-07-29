import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const outputArgumentIndex = process.argv.indexOf("--output");
const outputDirectory = resolve(
  repositoryRoot,
  outputArgumentIndex >= 0 ? process.argv[outputArgumentIndex + 1] : "dist",
);
const clientID = process.env.NCP_MAPS_CLIENT_ID?.trim();

if (!clientID) {
  throw new Error("NCP_MAPS_CLIENT_ID is required.");
}

if (!/^[A-Za-z0-9_-]+$/.test(clientID)) {
  throw new Error("NCP_MAPS_CLIENT_ID contains unsupported characters.");
}

await rm(outputDirectory, { force: true, recursive: true });
await mkdir(outputDirectory, { recursive: true });
await cp(resolve(repositoryRoot, "src"), outputDirectory, { recursive: true });

const indexPath = resolve(outputDirectory, "v1", "index.html");
const source = await readFile(indexPath, "utf8");
const placeholder = "__NCP_MAPS_CLIENT_ID__";

if (!source.includes(placeholder)) {
  throw new Error(`Missing ${placeholder} in v1/index.html.`);
}

await writeFile(indexPath, source.replaceAll(placeholder, clientID));
await writeFile(resolve(outputDirectory, ".nojekyll"), "");
