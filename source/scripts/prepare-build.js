const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const BUILD_ROOT = path.join(PROJECT_ROOT, 'build');
const BUILD_MODE = process.env.BUILD_MODE === 'steam' ? 'steam' : 'standalone';
const APP_EDITION = normalizeEdition(process.env.APP_EDITION);
const APP_DISTRIBUTION = normalizeDistribution(process.env.APP_DISTRIBUTION);

function normalizeDistribution(dist) {
  const normalized = String(dist || 'support hub').trim().toLowerCase();
  if (normalized === 'f95') return 'f95';
  return 'support hub';
}

function normalizeEdition(edition) {
  const normalizedEdition = String(edition || 'base').trim().toLowerCase();
  if (normalizedEdition === 'gold' || normalizedEdition === 'diamond') {
    return normalizedEdition;
  }
  return 'base';
}

function removePath(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return;
  }

  try {
    fs.rmSync(targetPath, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 250
    });
  } catch (error) {
    const errorCode = error && error.code ? error.code : 'UNKNOWN';
    console.warn(`[prepare-build] Skipping locked path: ${targetPath} (${errorCode})`);
  }
}

function removeMatchingFiles(folderPath, fileMatcher) {
  if (!fs.existsSync(folderPath)) {
    return;
  }

  fs.readdirSync(folderPath).forEach((entryName) => {
    const entryPath = path.join(folderPath, entryName);
    if (fileMatcher(entryName, entryPath)) {
      removePath(entryPath);
    }
  });
}

function removeMatchingDirectories(folderPath, directoryMatcher) {
  if (!fs.existsSync(folderPath)) {
    return;
  }

  fs.readdirSync(folderPath, { withFileTypes: true }).forEach((entry) => {
    if (!entry.isDirectory() || !directoryMatcher(entry.name)) {
      return;
    }

    removePath(path.join(folderPath, entry.name));
  });
}

function cleanStandaloneBuilds() {
  ['base', 'gold', 'diamond'].forEach((edition) => {
    removePath(path.join(BUILD_ROOT, `standalone-${edition}`));
  });

  removeMatchingDirectories(BUILD_ROOT, (entryName) => {
    return /^standalone-(base|gold|diamond)-retry-\d+$/i.test(entryName);
  });

  removePath(path.join(BUILD_ROOT, 'win-unpacked'));
  removeMatchingFiles(BUILD_ROOT, (entryName) => {
    return /^The_Nun_.*\.exe$/i.test(entryName)
      || /^builder-(debug|effective-config)\.ya?ml$/i.test(entryName);
  });
}

function cleanCurrentBuildOutput() {
  removePath(path.join(BUILD_ROOT, `${BUILD_MODE}-${APP_EDITION}`));
}

fs.mkdirSync(BUILD_ROOT, { recursive: true });

if (BUILD_MODE === 'standalone') {
  cleanStandaloneBuilds();
} else {
  cleanCurrentBuildOutput();
}

