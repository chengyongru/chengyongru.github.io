import { existsSync, promises as fs } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Loader } from 'astro/loaders';
import pLimit from 'p-limit';
import { glob as tinyglobby } from 'tinyglobby';

interface GenerateIdOptions {
  entry: string;
  base: URL;
  data: Record<string, unknown>;
}

interface SafeContentGlobOptions {
  pattern: string | string[];
  base: string | URL;
  generateId: (options: GenerateIdOptions) => string;
  cacheDependencies?: string[];
  retainBody?: boolean;
  shouldSkipEntry?: (entry: string) => boolean;
}

function toPosixRelative(from: string, to: string): string {
  return relative(from, to).split(/[\\/]+/).join('/');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function cacheDependencyDigest(
  root: URL,
  dependencies: string[] | undefined,
  generateDigest: (input: string) => string,
): Promise<string> {
  if (!dependencies?.length) return '';

  const parts = await Promise.all(
    dependencies.map(async (dependency) => {
      const fileUrl = new URL(dependency, root);
      const contents = await fs.readFile(fileUrl, 'utf-8').catch((error) => {
        return `missing:${errorMessage(error)}`;
      });
      return `${dependency}:${generateDigest(contents)}`;
    }),
  );

  return generateDigest(parts.join('\n'));
}

export function safeContentGlob(options: SafeContentGlobOptions): Loader {
  return {
    name: 'safe-content-glob-loader',
    load: async (context: any) => {
      const {
        config,
        collection,
        logger,
        watcher,
        parseData,
        store,
        generateDigest,
        entryTypes,
      } = context;

      const renderFunctionByContentType = new WeakMap<object, any>();
      const untouchedEntries = new Set<string>(store.keys());
      const fileToIdMap = new Map<string, string>();
      let baseDir = options.base ? new URL(options.base, config.root) : config.root;
      if (!baseDir.pathname.endsWith('/')) {
        baseDir.pathname = `${baseDir.pathname}/`;
      }

      const basePath = fileURLToPath(baseDir);
      if (!existsSync(baseDir)) {
        logger.warn(`The base directory "${basePath}" does not exist.`);
        return;
      }

      const files = (await tinyglobby(options.pattern, {
        cwd: basePath,
        expandDirectories: false,
      })).filter(entry => !options.shouldSkipEntry?.(entry));

      if (files.length === 0) {
        logger.warn(`No files found matching "${options.pattern}" in collection "${collection}".`);
        return;
      }

      const renderCacheDigest = await cacheDependencyDigest(
        config.root,
        options.cacheDependencies,
        generateDigest,
      );

      function entryTypeFor(entry: string) {
        const ext = entry.split('.').at(-1);
        return ext ? entryTypes.get(`.${ext}`) : undefined;
      }

      async function syncData(entry: string, base: URL, oldId?: string) {
        const entryType = entryTypeFor(entry);
        if (!entryType) {
          logger.warn(`Skipping ${entry}: no entry type found.`);
          return;
        }

        const fileUrl = new URL(encodeURI(entry), base);
        const filePath = fileURLToPath(fileUrl);
        const contents = await fs.readFile(fileUrl, 'utf-8').catch((error) => {
          logger.warn(`Skipping ${entry}: ${errorMessage(error)}`);
          return undefined;
        });
        if (contents === undefined) return;

        let info: { body: string; data: Record<string, unknown> };
        try {
          info = await entryType.getEntryInfo({ contents, fileUrl });
        } catch (error) {
          if (oldId) store.delete(oldId);
          logger.warn(`Skipping ${entry}: invalid frontmatter (${errorMessage(error)})`);
          return;
        }

        const id = options.generateId({ entry, base, data: info.data });
        if (oldId && oldId !== id) {
          store.delete(oldId);
        }
        untouchedEntries.delete(id);

        const existingEntry = store.get(id);
        const contentDigest = generateDigest(contents);
        const digest = renderCacheDigest
          ? generateDigest(`${contentDigest}:${renderCacheDigest}`)
          : contentDigest;
        if (existingEntry && existingEntry.digest === digest && existingEntry.filePath) {
          if (existingEntry.deferredRender) {
            store.addModuleImport(existingEntry.filePath);
          }
          if (existingEntry.assetImports?.length) {
            store.addAssetImports(existingEntry.assetImports, existingEntry.filePath);
          }
          fileToIdMap.set(filePath, id);
          return;
        }

        const normalizedFilePath = toPosixRelative(fileURLToPath(config.root), filePath);
        let parsedData: Record<string, unknown>;
        try {
          parsedData = await parseData({ id, data: info.data, filePath });
        } catch (error) {
          store.delete(id);
          if (oldId) store.delete(oldId);
          logger.warn(`Skipping ${entry}: schema validation failed (${errorMessage(error)})`);
          return;
        }

        if (existingEntry && existingEntry.filePath && existingEntry.filePath !== normalizedFilePath) {
          const oldFilePath = new URL(existingEntry.filePath, config.root);
          if (existsSync(oldFilePath)) {
            logger.warn(`Duplicate id "${id}" found in ${filePath}. Later items overwrite earlier ones.`);
          }
        }

        if (entryType.getRenderFunction) {
          let render = renderFunctionByContentType.get(entryType);
          if (!render) {
            render = await entryType.getRenderFunction(config);
            renderFunctionByContentType.set(entryType, render);
          }

          let rendered;
          try {
            rendered = await render({
              id,
              data: parsedData,
              body: info.body,
              filePath,
              digest,
            });
          } catch (error) {
            logger.warn(`Rendering ${entry} failed: ${errorMessage(error)}`);
          }

          store.set({
            id,
            data: parsedData,
            body: options.retainBody === false ? undefined : info.body,
            filePath: normalizedFilePath,
            digest,
            rendered,
            assetImports: rendered?.metadata?.imagePaths,
          });
        } else if ('contentModuleTypes' in entryType) {
          store.set({
            id,
            data: parsedData,
            body: options.retainBody === false ? undefined : info.body,
            filePath: normalizedFilePath,
            digest,
            deferredRender: true,
          });
        } else {
          store.set({
            id,
            data: parsedData,
            body: options.retainBody === false ? undefined : info.body,
            filePath: normalizedFilePath,
            digest,
          });
        }

        fileToIdMap.set(filePath, id);
      }

      const limit = pLimit(10);
      await Promise.all(files.map(entry => limit(() => syncData(entry, baseDir))));
      untouchedEntries.forEach((id: string) => store.delete(id));

      if (!watcher) return;

      watcher.add(basePath);
      const matchesCandidate = (entry: string) => (
        !entry.startsWith('../') &&
        entry.toLowerCase().endsWith('.md') &&
        !options.shouldSkipEntry?.(entry)
      );

      async function onChange(changedPath: string) {
        const entry = toPosixRelative(basePath, changedPath);
        if (!matchesCandidate(entry)) return;

        const oldId = fileToIdMap.get(changedPath);
        await syncData(entry, baseDir, oldId);
      }

      watcher.on('change', onChange);
      watcher.on('add', onChange);
      watcher.on('unlink', async (deletedPath: string) => {
        const entry = toPosixRelative(basePath, deletedPath);
        if (!matchesCandidate(entry)) return;

        const id = fileToIdMap.get(deletedPath);
        if (id) {
          store.delete(id);
          fileToIdMap.delete(deletedPath);
        }
      });
    },
  };
}
