import { promises as fs } from "node:fs";
import path from "node:path";

const CONTENT_ASSET_ATTRIBUTE =
  /\b(?:src|href)=["'](\/img\/[^"'?#]+)(?:[?#][^"']*)?["']/g;
const GENERATED_DOCUMENT_EXTENSIONS = new Set([".html", ".json"]);

function normalizeAssetPath(urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }

  const relativePath = decoded.slice("/img/".length).replace(/\\/g, "/");
  const parts = relativePath.split("/");
  if (
    parts.length === 0 ||
    parts.some(
      (part) =>
        !part ||
        part === "." ||
        part === ".." ||
        part.includes(":") ||
        part.includes("\0"),
    )
  ) {
    return null;
  }

  return parts.join("/");
}

export function extractPublishedAssetPaths(
  documents: readonly string[],
): string[] {
  const assets = new Set<string>();

  for (const document of documents) {
    const normalizedDocument = document.replaceAll('\\"', '"');
    for (const match of normalizedDocument.matchAll(CONTENT_ASSET_ATTRIBUTE)) {
      const assetPath = normalizeAssetPath(match[1]);
      if (assetPath) assets.add(assetPath);
    }
  }

  return [...assets].sort();
}

async function collectGeneratedDocuments(root: string): Promise<string[]> {
  const documents: string[] = [];

  async function visit(directory: string) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "img" && directory === root) continue;
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (
        entry.isFile() &&
        GENERATED_DOCUMENT_EXTENSIONS.has(path.extname(entry.name))
      ) {
        documents.push(await fs.readFile(entryPath, "utf8"));
      }
    }
  }

  await visit(root);
  return documents;
}

function isInside(parent: string, child: string): boolean {
  const relativePath = path.relative(parent, child);
  return (
    relativePath !== "" &&
    !relativePath.startsWith(`..${path.sep}`) &&
    relativePath !== ".." &&
    !path.isAbsolute(relativePath)
  );
}

export interface PublishedAssetSyncResult {
  referenced: number;
  copied: number;
  missing: string[];
}

export async function syncPublishedAssets(
  outputDir: string,
  sourceDir: string,
): Promise<PublishedAssetSyncResult> {
  const documents = await collectGeneratedDocuments(outputDir);
  const assetPaths = extractPublishedAssetPaths(documents);
  const targetDir = path.join(outputDir, "img");
  const sourceRoot = await fs.realpath(sourceDir);
  const missing: string[] = [];
  let copied = 0;

  await fs.rm(targetDir, { recursive: true, force: true });

  for (const assetPath of assetPaths) {
    const sourcePath = path.join(sourceRoot, ...assetPath.split("/"));
    let realSourcePath: string;
    try {
      realSourcePath = await fs.realpath(sourcePath);
    } catch {
      missing.push(assetPath);
      continue;
    }

    if (
      !isInside(sourceRoot, realSourcePath) ||
      !(await fs.stat(realSourcePath)).isFile()
    ) {
      missing.push(assetPath);
      continue;
    }

    const targetPath = path.join(targetDir, ...assetPath.split("/"));
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.copyFile(realSourcePath, targetPath);
    copied += 1;
  }

  return { referenced: assetPaths.length, copied, missing };
}
