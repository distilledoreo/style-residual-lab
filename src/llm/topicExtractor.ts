import OpenAI from "openai";
import type { TopicProfile, Work } from "../core/schema.js";
import { hasOpenAiKey } from "../core/config.js";

const banned = /\b(style|tone|quality|genre|rhyme|structure|diction|voice|poetic|well-written|catchy)\b/gi;

export async function extractTopicProfile(work: Work): Promise<TopicProfile> {
  if (hasOpenAiKey()) {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.chat.completions.create({
      model: process.env.TOPIC_MODEL ?? "gpt-4.1-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Describe what this work is about without describing how it is written. Do not mention style, voice, structure, rhyme, tone, quality, diction, artistic technique, or genre. Return only JSON."
        },
        {
          role: "user",
          content:
            `Domain: ${work.domain}\n\nReturn JSON with mainTheme, emotionalSubject, centralSituation, centralImage, contentOnlySummary.\n\nTitle: ${work.title}\n\nText:\n${work.text}`
        }
      ]
    });
    const parsed = JSON.parse(response.choices[0].message.content ?? "{}") as TopicProfile;
    return sanitizeTopic({ ...parsed, workId: work.id, extractor: process.env.TOPIC_MODEL ?? "gpt-4.1-mini" });
  }
  return localTopicProfile(work);
}

export function localTopicProfile(work: Work): TopicProfile {
  const tokens = work.text.toLowerCase().match(/\b[a-z']{4,}\b/g) ?? [];
  const stop = new Set(["that", "with", "this", "when", "what", "your", "from", "have", "just", "like", "will", "never", "there", "they", "them", "because"]);
  const counts = new Map<string, number>();
  for (const token of tokens) if (!stop.has(token)) counts.set(token, (counts.get(token) ?? 0) + 1);
  const keywords = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([token]) => token);
  const image = keywords.find((word) => !["feel", "think", "know", "want", "need"].includes(word)) ?? keywords[0] ?? "unspecified";
  return sanitizeTopic({
    workId: work.id,
    mainTheme: keywords.slice(0, 3).join(", ") || work.title,
    emotionalSubject: keywords.slice(3, 6).join(", ") || "personal conflict",
    centralSituation: `A narrator works through ${keywords.slice(0, 4).join(", ") || "a personal situation"}.`,
    centralImage: image,
    contentOnlySummary: `The ${work.domain} work concerns ${keywords.join(", ") || work.title}.`,
    synthetic: true,
    extractor: "local-keyword-fallback"
  });
}

function sanitizeTopic(profile: TopicProfile): TopicProfile {
  const clean = (value: string | undefined) => (value ?? "").replace(banned, "").replace(/\s+/g, " ").trim();
  return {
    workId: profile.workId,
    mainTheme: clean(profile.mainTheme),
    emotionalSubject: clean(profile.emotionalSubject),
    centralSituation: clean(profile.centralSituation),
    centralImage: clean(profile.centralImage),
    contentOnlySummary: clean(profile.contentOnlySummary),
    synthetic: profile.synthetic,
    extractor: profile.extractor
  };
}

export function topicText(profile: TopicProfile): string {
  return [
    profile.mainTheme,
    profile.emotionalSubject,
    profile.centralSituation,
    profile.centralImage,
    profile.contentOnlySummary
  ].join("\n");
}
