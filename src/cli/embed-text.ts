import { createId, hashText } from "../core/ids.js";
import { paths } from "../core/config.js";
import { readJsonl, writeJsonl } from "../core/jsonl.js";
import type { Atom, Block, EmbeddingRecord, TopicProfile, Work } from "../core/schema.js";
import { embedText } from "../embeddings/embeddingClient.js";
import { topicText } from "../llm/topicExtractor.js";
import { getDomainAdapter } from "../domains/domainAdapter.js";

const works = await readJsonl<Work>(paths.works);
const blocks = await readJsonl<Block>(paths.blocks);
const atoms = await readJsonl<Atom>(paths.atoms);
const topics = await readJsonl<TopicProfile>(paths.topics);
const adapter = getDomainAdapter(works[0]?.domain);

async function record(ownerType: EmbeddingRecord["ownerType"], ownerId: string, scope: string, text: string): Promise<EmbeddingRecord> {
  const embedded = await embedText(text);
  return {
    id: createId("emb", embedded.model, ownerType, ownerId, scope, hashText(text)),
    ownerType,
    ownerId,
    scope,
    model: embedded.model,
    textHash: hashText(embedded.model, ownerType, ownerId, scope, text),
    vector: embedded.vector
  };
}

const workEmbeddings: EmbeddingRecord[] = [];
for (const work of works) {
  workEmbeddings.push(await record("work", work.id, "work", `${work.title}\n${work.text}`));
  const workBlocks = blocks.filter((block) => block.workId === work.id);
  for (const scope of adapter.extraWorkScopes(workBlocks, work.title)) {
    workEmbeddings.push(await record("work", work.id, scope.scope, scope.text));
  }
}
await writeJsonl(paths.workEmbeddings, workEmbeddings);
await writeJsonl(paths.blockEmbeddings, await Promise.all(blocks.map((block) => record("block", block.id, "block", block.text))));
await writeJsonl(paths.atomEmbeddings, await Promise.all(atoms.map((atom) => record("atom", atom.id, "atom", atom.text))));

const topicEmbeddings: EmbeddingRecord[] = [];
for (const topic of topics) {
  for (const field of ["mainTheme", "emotionalSubject", "centralSituation", "centralImage", "contentOnlySummary"] as const) {
    topicEmbeddings.push(await record("topic", topic.workId, field, topic[field]));
  }
  topicEmbeddings.push(await record("topic", topic.workId, "combined_topic_profile", topicText(topic)));
}
await writeJsonl(paths.topicEmbeddings, topicEmbeddings);
console.log(`Embedded ${workEmbeddings.length} work scopes, ${blocks.length} blocks, ${atoms.length} atoms, ${topicEmbeddings.length} topic scopes.`);
