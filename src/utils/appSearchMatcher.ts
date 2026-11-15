import type { WindowsPinnedAppItem } from "../hooks/useWindowsPinnedApps";

export function getAppCacheKey(app: WindowsPinnedAppItem): string {
  return app.lnk_path || app.target_path || `${app.id}:${app.name}`;
}

function cleanLnkSearchText(lnkPath: string): string {
  if (!lnkPath) return "";
  if (lnkPath.startsWith("shell:AppsFolder\\")) {
    const raw = lnkPath.slice("shell:AppsFolder\\".length);
    const noGuid = raw.replace(/^\{[0-9a-f-]+\}\\/i, "");
    const noPublisher = noGuid.replace(/_[a-z0-9]{10,16}!/i, " ");
    return noPublisher.replace(/\.(exe|lnk|url|msc)$/i, "").toLowerCase();
  }
  const slashIdx = Math.max(lnkPath.lastIndexOf("\\"), lnkPath.lastIndexOf("/"));
  const fileName = slashIdx >= 0 ? lnkPath.slice(slashIdx + 1) : lnkPath;
  return fileName.replace(/\.(lnk|url|exe|msc)$/i, "").toLowerCase();
}

function getExeStem(targetPath: string): string {
  if (!targetPath) return "";
  const slashIdx = Math.max(targetPath.lastIndexOf("\\"), targetPath.lastIndexOf("/"));
  const fileName = slashIdx >= 0 ? targetPath.slice(slashIdx + 1) : targetPath;
  return fileName.replace(/\.(exe|lnk|url|msc)$/i, "").toLowerCase();
}

function matchesWordPrefixChain(
  words: string[],
  wordIdx: number,
  compactQuery: string,
  qIdx: number
): boolean {
  if (qIdx >= compactQuery.length) return true;
  if (wordIdx >= words.length) return false;

  const word = words[wordIdx];
  const maxPrefix = Math.min(word.length, compactQuery.length - qIdx);
  for (let len = 1; len <= maxPrefix; len++) {
    if (word.startsWith(compactQuery.slice(qIdx, qIdx + len))) {
      if (matchesWordPrefixChain(words, wordIdx + 1, compactQuery, qIdx + len)) {
        return true;
      }
    } else {
      break;
    }
  }

  return matchesWordPrefixChain(words, wordIdx + 1, compactQuery, qIdx);
}

/**
 * Returns a positive relevance score if the app matches the normalized query,
 * or 0 when it does not match.
 */
export function scoreAppSearchMatch(
  app: WindowsPinnedAppItem,
  normalizedQuery: string,
  isPinned: boolean
): number {
  const pinnedBoost = isPinned ? 20 : 0;
  if (!normalizedQuery) return 1 + pinnedBoost;

  const nameLower = app.name.trim().toLowerCase();
  const exeStem = getExeStem(app.target_path);
  const lnkClean = cleanLnkSearchText(app.lnk_path);
  const idLower = app.id.toLowerCase();
  const words = nameLower.split(/[^a-z0-9]+/).filter(Boolean).slice(0, 8);

  if (nameLower === normalizedQuery) return 1000 + pinnedBoost;
  if (nameLower.startsWith(normalizedQuery)) return 850 + pinnedBoost;
  if (words.some((w) => w.startsWith(normalizedQuery))) return 700 + pinnedBoost;
  if (nameLower.includes(normalizedQuery)) return 560 + pinnedBoost;

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const combinedHaystack = `${nameLower} ${exeStem} ${idLower} ${lnkClean}`;
  if (tokens.length > 1 && tokens.every((t) => combinedHaystack.includes(t))) {
    return 460 + pinnedBoost;
  }

  if (exeStem && (exeStem === normalizedQuery || exeStem.startsWith(normalizedQuery))) {
    return 420 + pinnedBoost;
  }
  if (
    (exeStem && exeStem.includes(normalizedQuery)) ||
    idLower.includes(normalizedQuery) ||
    lnkClean.includes(normalizedQuery)
  ) {
    return 330 + pinnedBoost;
  }

  const compactQuery = normalizedQuery.replace(/\s+/g, "");
  if (
    compactQuery.length >= 2 &&
    words.length >= 2 &&
    matchesWordPrefixChain(words, 0, compactQuery, 0)
  ) {
    return 250 + pinnedBoost;
  }

  return 0;
}
