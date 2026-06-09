export type DomainName = string;
export type DatasetSet = "target" | "background" | "candidate";
export type SplitName = "train" | "validation" | "test";

export interface Work {
  id: string;
  domain: DomainName;
  set: DatasetSet;
  title: string;
  sourcePath: string;
  text: string;
  metadata?: Record<string, unknown>;
}

export interface Block {
  id: string;
  workId: string;
  domain: DomainName;
  type: string;
  index: number;
  text: string;
  atomIds: string[];
}

export interface Atom {
  id: string;
  workId: string;
  blockId: string;
  domain: DomainName;
  indexInWork: number;
  indexInBlock: number;
  text: string;
}

export interface TopicProfile {
  workId: string;
  mainTheme: string;
  emotionalSubject: string;
  centralSituation: string;
  centralImage: string;
  contentOnlySummary: string;
  synthetic?: boolean;
  extractor?: string;
}

export interface EmbeddingRecord {
  id: string;
  ownerType: "work" | "block" | "atom" | "topic";
  ownerId: string;
  scope: string;
  model: string;
  textHash: string;
  vector: number[];
}

export interface ResidualRecord {
  id: string;
  ownerType: "work" | "block" | "atom";
  ownerId: string;
  workId: string;
  scope: string;
  blockType?: string;
  sourceEmbeddingId: string;
  topicEmbeddingIds: string[];
  vector: number[];
}

export interface CentroidRecord {
  id: string;
  set: "target" | "background";
  domain: DomainName;
  ownerType: "work" | "block" | "atom";
  scope: string;
  blockType?: string;
  count: number;
  vector: number[];
}

export interface SplitRecord {
  workId: string;
  set: DatasetSet;
  split: SplitName;
  seed: number;
  sourcePath: string;
  title: string;
}
