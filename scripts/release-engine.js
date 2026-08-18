import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

/**
 * Enterprise Release Engine for KwakoPos SaaS
 * Calculates SemVer based on Conventional Commits, updates CHANGELOG.md,
 * and outputs release metadata for GitHub Releases and DB persistence.
 */

function getGitCommitsSinceLastTag() {
  try {
    let lastTag = '';
    try {
      lastTag = execSync('git describe --tags --abbrev=0', { cwd: rootDir, encoding: 'utf8' }).trim();
    } catch (_) {
      lastTag = '';
    }

    const gitLogCmd = lastTag 
      ? `git log ${lastTag}..HEAD --pretty=format:"%h|%s|%an|%ad"`
      : `git log -n 50 --pretty=format:"%h|%s|%an|%ad"`;

    const logOutput = execSync(gitLogCmd, { cwd: rootDir, encoding: 'utf8' }).trim();
    if (!logOutput) return [];

    return logOutput.split('\n').map(line => {
      const [hash, subject, author, date] = line.split('|');
      return { hash, subject, author, date };
    });
  } catch (err) {
    console.warn('[Release Engine] Warning fetching git commits:', err.message);
    return [];
  }
}

function parseSemVer(versionStr) {
  const clean = versionStr.replace(/^v/, '');
  const [major, minor, patch] = clean.split('.').map(Number);
  return { major: major || 1, minor: minor || 0, patch: patch || 0 };
}

function calculateNextVersion(currentVersion, commits) {
  const { major, minor, patch } = parseSemVer(currentVersion);
  let hasBreaking = false;
  let hasFeat = false;
  let hasFix = false;

  commits.forEach(c => {
    const s = c.subject || '';
    if (s.includes('BREAKING CHANGE') || s.includes('BREAKING:')) {
      hasBreaking = true;
    } else if (s.startsWith('feat') || s.includes('feat:')) {
      hasFeat = true;
    } else if (s.startsWith('fix') || s.startsWith('perf') || s.startsWith('security') || s.startsWith('refactor')) {
      hasFix = true;
    }
  });

  if (hasBreaking) {
    return `${major + 1}.0.0`;
  }
  if (hasFeat) {
    return `${major}.${minor + 1}.0`;
  }
  if (hasFix || commits.length > 0) {
    return `${major}.${minor}.${patch + 1}`;
  }
  return currentVersion;
}

function groupCommits(commits) {
  const groups = {
    features: [],
    fixes: [],
    security: [],
    performance: [],
    refactoring: [],
    others: []
  };

  commits.forEach(c => {
    const s = c.subject || '';
    if (s.startsWith('feat') || s.includes('feat:')) {
      groups.features.push(c);
    } else if (s.startsWith('fix') || s.includes('fix:')) {
      groups.fixes.push(c);
    } else if (s.startsWith('security') || s.includes('security:')) {
      groups.security.push(c);
    } else if (s.startsWith('perf') || s.includes('perf:')) {
      groups.performance.push(c);
    } else if (s.startsWith('refactor') || s.includes('refactor:')) {
      groups.refactoring.push(c);
    } else {
      groups.others.push(c);
    }
  });

  return groups;
}

function generateChangelogEntry(version, dateStr, grouped) {
  let md = `## [${version}] - ${dateStr}\n\n`;

  if (grouped.features.length > 0) {
    md += `### 🚀 New Features\n`;
    grouped.features.forEach(c => { md += `- ${c.subject} (${c.hash}) - @${c.author}\n`; });
    md += `\n`;
  }

  if (grouped.fixes.length > 0) {
    md += `### 🐛 Bug Fixes\n`;
    grouped.fixes.forEach(c => { md += `- ${c.subject} (${c.hash}) - @${c.author}\n`; });
    md += `\n`;
  }

  if (grouped.security.length > 0) {
    md += `### 🔒 Security Enhancements\n`;
    grouped.security.forEach(c => { md += `- ${c.subject} (${c.hash}) - @${c.author}\n`; });
    md += `\n`;
  }

  if (grouped.performance.length > 0) {
    md += `### ⚡ Performance Improvements\n`;
    grouped.performance.forEach(c => { md += `- ${c.subject} (${c.hash}) - @${c.author}\n`; });
    md += `\n`;
  }

  if (grouped.refactoring.length > 0) {
    md += `### 🛠️ Refactoring & Architectural Updates\n`;
    grouped.refactoring.forEach(c => { md += `- ${c.subject} (${c.hash}) - @${c.author}\n`; });
    md += `\n`;
  }

  if (grouped.others.length > 0) {
    md += `### 📦 Maintenance & Other Changes\n`;
    grouped.others.forEach(c => { md += `- ${c.subject} (${c.hash}) - @${c.author}\n`; });
    md += `\n`;
  }

  return md;
}

function run() {
  const pkgPath = path.join(rootDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const currentVersion = pkg.version || '1.0.0';

  const commits = getGitCommitsSinceLastTag();
  const nextVersion = calculateNextVersion(currentVersion, commits);
  const dateStr = new Date().toISOString().split('T')[0];

  console.log(`[Release Engine] Current Version: ${currentVersion}`);
  console.log(`[Release Engine] Analyzed Commits: ${commits.length}`);
  console.log(`[Release Engine] Target Next Version: ${nextVersion}`);

  // Update package.json version if changed
  if (nextVersion !== currentVersion) {
    pkg.version = nextVersion;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`[Release Engine] Updated package.json version to ${nextVersion}`);
  }

  const grouped = groupCommits(commits);
  const changelogEntry = generateChangelogEntry(nextVersion, dateStr, grouped);

  const changelogPath = path.join(rootDir, 'CHANGELOG.md');
  let existingChangelog = '';
  if (fs.existsSync(changelogPath)) {
    existingChangelog = fs.readFileSync(changelogPath, 'utf8');
  }

  const newChangelog = `# KwakoPos SaaS Changelog\n\n${changelogEntry}\n${existingChangelog.replace('# KwakoPos SaaS Changelog\n\n', '').replace('# DukaPos SaaS Changelog\n\n', '')}`;
  fs.writeFileSync(changelogPath, newChangelog);
  console.log(`[Release Engine] Updated CHANGELOG.md`);

  // Write release output for GitHub Actions / CLI
  const releaseOutput = {
    version: nextVersion,
    tag: `v${nextVersion}`,
    date: dateStr,
    buildNumber: `${dateStr.replace(/-/g, '')}.${commits.length || 93}`,
    changelogEntry,
    commitCount: commits.length
  };

  const outputPath = path.join(rootDir, 'release-metadata.json');
  fs.writeFileSync(outputPath, JSON.stringify(releaseOutput, null, 2));
  console.log(`[Release Engine] Generated release-metadata.json`);

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${nextVersion}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `tag=v${nextVersion}\n`);
  }
}

run();
