// Ingest — turn a repo into durable memories.
//
// Scans a directory tree and extracts the kinds of facts a coding
// assistant actually forgets between sessions:
//   - decisions recorded in ADR files / DECISION: comments
//   - conventions from NEVER/ALWAYS/RULE comments and CONTRIBUTING files
//   - gotchas from TODO / FIXME / HACK / XXX notes
//   - facts from README purpose lines and exported symbols
// Everything extracted is labelled with its file + line as provenance.
// Nothing is invented: a file that says nothing yields no memory.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '__pycache__', '.venv', 'vendor']);
const TEXT_EXTS = new Set(['.js', '.mjs', '.ts', '.tsx', '.py', '.go', '.rs', '.java', '.md', '.txt', '.json', '.yaml', '.yml', '.toml', '.sh']);
const MAX_FILE_BYTES = 200_000;

const PATTERNS = [
  { type: 'decision', re: /\bDECISION\s*:\s*(.+)/i, confidence: 0.9 },
  { type: 'decision', re: /\bADR\s*[-#:]?\s*\d*\s*[:\-]?\s*(.+)/i, confidence: 0.8 },
  // NEVER / ALWAYS / MUST must be ALL-CAPS in source — lowercase "never"
  // in normal prose ("we never cache here") is not a convention.
  { type: 'convention', re: /\b(?:NEVER|ALWAYS|MUST)\b(.+)/, confidence: 0.85 },
  { type: 'convention', re: /\b(?:DO NOT|DON'T)\b(.+)/i, confidence: 0.85 },
  { type: 'convention', re: /\bRULE\s*:\s*(.+)/i, confidence: 0.85 },
  { type: 'gotcha', re: /\b(?:FIXME|HACK|XXX|BUG)\s*[:\-]?\s*(.+)/i, confidence: 0.8 },
  { type: 'todo', re: /\bTODO\s*[:\-]?\s*(.+)/i, confidence: 0.7 },
];

export function walkFiles(rootDir) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) walk(join(dir, entry.name));
      } else if (entry.isFile() && TEXT_EXTS.has(extname(entry.name).toLowerCase())) {
        out.push(join(dir, entry.name));
      }
    }
  };
  walk(rootDir);
  return out.sort();
}

function extractFromFile(filePath, rootDir) {
  const rel = relative(rootDir, filePath);
  let content;
  try {
    if (statSync(filePath).size > MAX_FILE_BYTES) return [];
    content = readFileSync(filePath, 'utf8');
  } catch { return []; }
  const memories = [];
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    for (const { type, re, confidence } of PATTERNS) {
      const m = line.match(re);
      if (m && m[1] && m[1].trim().length > 3) {
        const clean = m[1]
          .replace(/^[\s*#>`\-]+/, '') // leading comment/bullet markers only
          .replace(/[`*]+/g, '') // inline markdown, without eating spaces
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 280);
        if (clean.length <= 3) continue;
        memories.push({
          text: clean,
          type,
          confidence,
          source: { file: rel, line: idx + 1, origin: 'ingest' },
        });
        break; // one memory per line at most
      }
    }
  });
  // README purpose: first non-heading, non-empty line of a README.
  if (/^readme\.md$/i.test(rel.split('/').pop())) {
    const purposeIdx = lines.findIndex((l) => { const t = l.trim(); return t && !t.startsWith('#') && !t.startsWith('!['); });
    if (purposeIdx >= 0) {
      const purpose = lines[purposeIdx].trim();
      if (purpose.length > 10) {
        memories.unshift({ text: purpose.slice(0, 280), type: 'fact', confidence: 0.8, source: { file: rel, line: purposeIdx + 1, origin: 'ingest' } });
      }
    }
  }
  // Exported symbols: "export function foo" / "export class Bar" / "export const x"
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*export\s+(?:async\s+)?(?:function|class|const|let)\s+([A-Za-z_$][\w$]*)/);
    if (m) {
      memories.push({
        text: `${rel} exports ${m[1]} — part of this project's public surface`,
        type: 'fact',
        confidence: 0.6,
        source: { file: rel, line: i + 1, origin: 'ingest' },
      });
    }
  }
  return memories;
}

/** Scan rootDir, return extracted memory inputs (not yet stored). */
export function ingestDirectory(rootDir) {
  if (!existsSync(rootDir)) throw new Error(`directory not found: ${rootDir}`);
  const files = walkFiles(rootDir);
  const memories = [];
  for (const f of files) memories.push(...extractFromFile(f, rootDir));
  // Dedupe identical text+type.
  const seen = new Set();
  return memories.filter((m) => {
    const key = `${m.type}::${m.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
