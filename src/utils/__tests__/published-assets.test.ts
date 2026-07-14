// @vitest-environment node

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  extractPublishedAssetPaths,
  syncPublishedAssets,
} from "../published-assets";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe("published content assets", () => {
  it("extracts unique local image references from generated documents", () => {
    expect(
      extractPublishedAssetPaths([
        '<img src="/img/cover.png"><a href="/img/report.pdf?download=1">report</a>',
        '{"html":"<img src=\\"/img/%E5%9B%BE.png\\">"}',
        '<img src="https://example.com/img/external.png"><img src="/img/cover.png">',
      ]),
    ).toEqual(["cover.png", "report.pdf", "图.png"]);
  });

  it("rejects encoded traversal and malformed asset paths", () => {
    expect(
      extractPublishedAssetPaths([
        '<img src="/img/%2e%2e/private.png">',
        '<img src="/img/folder//private.png">',
        '<img src="/img/C:%5Cprivate.png">',
      ]),
    ).toEqual([]);
  });

  it("removes unreferenced files and copies only assets used by published output", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "published-assets-"));
    tempDirectories.push(root);
    const outputDir = path.join(root, "dist");
    const sourceDir = path.join(root, "content-img");

    await fs.mkdir(path.join(outputDir, "blog", "post"), { recursive: true });
    await fs.mkdir(path.join(outputDir, "img"), { recursive: true });
    await fs.mkdir(path.join(sourceDir, "nested"), { recursive: true });
    await fs.writeFile(
      path.join(outputDir, "blog", "post", "index.html"),
      '<img src="/img/public.png"><img src="/img/nested/chart.png">',
    );
    await fs.writeFile(
      path.join(outputDir, "img", "previously-leaked.pdf"),
      "private",
    );
    await fs.writeFile(path.join(sourceDir, "public.png"), "public");
    await fs.writeFile(path.join(sourceDir, "nested", "chart.png"), "chart");
    await fs.writeFile(path.join(sourceDir, "private.png"), "private");

    await expect(syncPublishedAssets(outputDir, sourceDir)).resolves.toEqual({
      referenced: 2,
      copied: 2,
      missing: [],
    });
    await expect(
      fs.readFile(path.join(outputDir, "img", "public.png"), "utf8"),
    ).resolves.toBe("public");
    await expect(
      fs.readFile(path.join(outputDir, "img", "nested", "chart.png"), "utf8"),
    ).resolves.toBe("chart");
    await expect(
      fs.stat(path.join(outputDir, "img", "private.png")),
    ).rejects.toThrow();
    await expect(
      fs.stat(path.join(outputDir, "img", "previously-leaked.pdf")),
    ).rejects.toThrow();
  });
});
