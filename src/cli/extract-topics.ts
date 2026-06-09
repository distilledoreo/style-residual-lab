import { paths } from "../core/config.js";
import { readJsonl, writeJsonl } from "../core/jsonl.js";
import type { TopicProfile, Work } from "../core/schema.js";
import { extractTopicProfile } from "../llm/topicExtractor.js";

const force = process.argv.includes("--force");
const works = await readJsonl<Work>(paths.works);
const currentWorkIds = new Set(works.map((work) => work.id));
const existing = force ? [] : await readJsonl<TopicProfile>(paths.topics);
const byWork = new Map(existing.filter((topic) => currentWorkIds.has(topic.workId)).map((topic) => [topic.workId, topic]));
for (const work of works) {
  if (!byWork.has(work.id)) byWork.set(work.id, await extractTopicProfile(work));
}
await writeJsonl(paths.topics, [...byWork.values()]);
console.log(`Topic profiles available for ${byWork.size} works.`);
