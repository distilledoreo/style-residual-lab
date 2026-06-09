import type { DatasetSet } from "../core/schema.js";
import { getDomainName } from "../core/config.js";
import { parseLyricsFile } from "./lyrics/parseLyrics.js";
import { atomFeatures, blockFeatures, workFeatures } from "./lyrics/lyricsFeatures.js";
import { parseStructuredTextFile, type ParsedTextCorpus } from "./generic/parseStructuredText.js";

export interface DomainAdapter {
  name: string;
  rawSubdir: string;
  targetSeedFormat: "directory-lyrics" | "flat-text";
  sectionTypes: string[];
  parseFile(sourcePath: string, set: DatasetSet, root?: string): Promise<ParsedTextCorpus>;
  featureExtractors: {
    atom: typeof atomFeatures;
    block: typeof blockFeatures;
    work: typeof workFeatures;
  };
  extraWorkScopes(blocks: Array<{ type: string; text: string }>, title: string): Array<{ scope: string; text: string }>;
}

export function getDomainAdapter(domainName = getDomainName()): DomainAdapter {
  if (domainName === "lyrics") return lyricsAdapter;
  return genericTextAdapter(domainName);
}

const lyricsAdapter: DomainAdapter = {
  name: "lyrics",
  rawSubdir: "lyrics",
  targetSeedFormat: "directory-lyrics",
  sectionTypes: ["verse", "chorus", "bridge"],
  parseFile: parseLyricsFile,
  featureExtractors: {
    atom: atomFeatures,
    block: blockFeatures,
    work: workFeatures
  },
  extraWorkScopes(blocks, title) {
    const scopes: Array<{ scope: string; text: string }> = [];
    const choruses = blocks.filter((block) => block.type === "chorus").map((block) => block.text).join("\n");
    if (choruses) scopes.push({ scope: "all_choruses", text: `${title}\n${choruses}` });
    const bridge = blocks.filter((block) => block.type === "bridge").map((block) => block.text).join("\n");
    if (bridge) scopes.push({ scope: "bridge_only", text: bridge });
    if (choruses) scopes.push({ scope: "title_plus_chorus", text: `${title}\n${choruses}` });
    return scopes;
  }
};

function genericTextAdapter(domainName: string): DomainAdapter {
  return {
    name: domainName,
    rawSubdir: domainName,
    targetSeedFormat: "flat-text",
    sectionTypes: sectionTypesFor(domainName),
    parseFile: (sourcePath, set, root) => parseStructuredTextFile(sourcePath, set, domainName, root),
    featureExtractors: {
      atom: atomFeatures,
      block: blockFeatures,
      work: workFeatures
    },
    extraWorkScopes: () => []
  };
}

function sectionTypesFor(domainName: string): string[] {
  const configured = process.env.STYLE_LAB_SECTION_TYPES;
  if (configured) return configured.split(",").map((value) => value.trim()).filter(Boolean);
  if (domainName === "essay") return ["introduction", "body", "conclusion"];
  if (domainName === "fiction") return ["scene", "dialogue", "description"];
  if (domainName === "screenplay") return ["scene", "action", "dialogue"];
  return ["section"];
}
