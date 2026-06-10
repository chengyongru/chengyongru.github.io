import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const candidates = ['dist/img', 'public/img'].map(p => path.join(root, p));
const imageBudget = 500 * 1024;
const documentBudget = 2 * 1024 * 1024;
const topLimit = 12;

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function budgetFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif'].includes(ext)) return imageBudget;
  if (['.pdf', '.zip', '.7z', '.rar'].includes(ext)) return documentBudget;
  return null;
}

const target = await (async () => {
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  return null;
})();

if (!target) {
  console.log('No asset directory found. Run npm run build first or add files under public/img.');
  process.exit(0);
}

const assets = await Promise.all((await walk(target)).map(async filePath => ({
  filePath,
  relative: path.relative(root, filePath).replaceAll(path.sep, '/'),
  size: (await stat(filePath)).size,
})));

assets.sort((a, b) => b.size - a.size);

console.log(`Asset audit target: ${path.relative(root, target).replaceAll(path.sep, '/')}`);
console.log(`Files scanned: ${assets.length}`);
console.log('\nLargest assets:');
for (const asset of assets.slice(0, topLimit)) {
  console.log(`- ${formatSize(asset.size).padStart(8)}  ${asset.relative}`);
}

const overBudget = assets.filter(asset => {
  const budget = budgetFor(asset.filePath);
  return budget !== null && asset.size > budget;
});

if (overBudget.length > 0) {
  console.log('\nOver recommended budget:');
  for (const asset of overBudget.slice(0, topLimit)) {
    const budget = budgetFor(asset.filePath);
    console.log(`- ${asset.relative}: ${formatSize(asset.size)} > ${formatSize(budget)}`);
  }
  console.log('\nRecommendation: compress screenshots, prefer WebP/AVIF for large raster images, and link large PDFs/downloads instead of placing them in the default image path.');
} else {
  console.log('\nAll scanned assets are within the recommended budget.');
}
