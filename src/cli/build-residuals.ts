import { createId } from "../core/ids.js";
import { paths } from "../core/config.js";
import { readJsonl, writeJsonl } from "../core/jsonl.js";
import type { Block, EmbeddingRecord, ResidualRecord } from "../core/schema.js";
import { residualize } from "../core/vector.js";
import { buildContentBasisVectors } from "../residuals/contentBasis.js";

const blocks = await readJsonl<Block>(paths.blocks);
const workEmbeddings = await readJsonl<EmbeddingRecord>(paths.workEmbeddings);
const blockEmbeddings = await readJsonl<EmbeddingRecord>(paths.blockEmbeddings);
const topicEmbeddings = await readJsonl<EmbeddingRecord>(paths.topicEmbeddings);
const blockById = new Map(blocks.map((block) => [block.id, block]));
const residuals: ResidualRecord[] = [];

for (const embedding of [...workEmbeddings, ...blockEmbeddings]) {
  const block = embedding.ownerType === "block" ? blockById.get(embedding.ownerId) : undefined;
  const workId = embedding.ownerType === "work" ? embedding.ownerId : block?.workId;
  if (!workId) continue;
  const topics = topicEmbeddings.filter((topic) => topic.ownerId === workId);
  if (!topics.length) continue;
  const contentBasisVectors = buildContentBasisVectors(topics);
  if (!contentBasisVectors.length) continue;
  residuals.push({
    id: createId("res", embedding.id),
    ownerType: embedding.ownerType as "work" | "block",
    ownerId: embedding.ownerId,
    workId,
    scope: embedding.scope,
    blockType: block?.type,
    sourceEmbeddingId: embedding.id,
    topicEmbeddingIds: topics.map((topic) => topic.id),
    vector: residualize(embedding.vector, contentBasisVectors)
  });
}
await writeJsonl(paths.residualEmbeddings, residuals);
console.log(`Built ${residuals.length} topic-normalized residual vectors.`);
