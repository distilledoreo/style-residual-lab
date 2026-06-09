import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dataPath } from "../core/config.js";

interface CorpusLyric {
  title: string;
  text: string;
}

const burns: CorpusLyric[] = [
  lyric("A Red, Red Rose", "O my Luve is like a red, red rose", "That newly sprung in June", "And I will luve thee still, my dear", "Till a' the seas gang dry"),
  lyric("Auld Lang Syne", "Should auld acquaintance be forgot", "And never brought to mind", "We'll tak a cup o' kindness yet", "For auld lang syne"),
  lyric("A Man's A Man For A' That", "Is there for honest poverty", "That hings his head, an' a' that", "The rank is but the guinea's stamp", "The man's the gowd for a' that"),
  lyric("Sweet Afton", "Flow gently, sweet Afton, among thy green braes", "Flow gently, I'll sing thee a song in thy praise", "My Mary's asleep by thy murmuring stream", "Flow gently, sweet Afton, disturb not her dream"),
  lyric("John Anderson, My Jo", "John Anderson my jo, John", "When we were first acquent", "Your locks were like the raven", "Your bonie brow was brent"),
  lyric("My Heart's In The Highlands", "My heart's in the Highlands, my heart is not here", "My heart's in the Highlands a-chasing the deer", "Farewell to the Highlands, farewell to the North", "The birthplace of valour, the country of worth"),
  lyric("Scots Wha Hae", "Scots, wha hae wi' Wallace bled", "Scots, wham Bruce has aften led", "Welcome to your gory bed", "Or to victorie"),
  lyric("Ae Fond Kiss", "Ae fond kiss, and then we sever", "Ae farewell, alas, for ever", "Deep in heart-wrung tears I'll pledge thee", "Warring sighs and groans I'll wage thee"),
  lyric("Green Grow The Rashes", "Green grow the rashes, O", "Green grow the rashes, O", "The sweetest hours that e'er I spend", "Are spent among the lasses, O"),
  lyric("O Wert Thou In The Cauld Blast", "O wert thou in the cauld blast", "On yonder lea, on yonder lea", "My plaidie to the angry airt", "I'd shelter thee, I'd shelter thee"),
  lyric("The Banks O' Doon", "Ye banks and braes o' bonie Doon", "How can ye bloom sae fresh and fair", "How can ye chant, ye little birds", "And I sae weary, fu' o' care"),
  lyric("Comin' Thro' The Rye", "Gin a body meet a body", "Comin' through the rye", "Gin a body kiss a body", "Need a body cry"),
  lyric("Charlie, He's My Darling", "Charlie, he's my darling", "My darling, my darling", "Charlie, he's my darling", "The young Chevalier"),
  lyric("Ca' The Yowes To The Knowes", "Ca' the yowes to the knowes", "Ca' them where the heather grows", "Ca' them where the burnie rows", "My bonie dearie"),
  lyric("The Deil's Awa Wi' The Exciseman", "The deil cam fiddling through the town", "And danced awa wi' the exciseman", "And ilka wife cries, auld Mahoun", "I wish you luck o' the prize, man"),
  lyric("There'll Never Be Peace Till Jamie Comes Hame", "By yon castle wa', at the close of the day", "I heard a man sing, though his head it was grey", "And as he was singing, the tears down came", "There'll never be peace till Jamie comes hame")
];

const candidate = lyric("Burns-Like Candidate", "O lassie, by the caller stream", "The gloamin' folds the lea", "I'd gie my coat, I'd gie my name", "To keep one hour wi' thee");

const targetDir = dataPath("raw/target/lyrics");
const candidateDir = dataPath("raw/candidates/lyrics");
await rm(dataPath("raw"), { recursive: true, force: true });
await mkdir(targetDir, { recursive: true });
await mkdir(candidateDir, { recursive: true });

await Promise.all(burns.map((item) => writeFile(join(targetDir, `${slug(item.title)}.txt`), format(item), "utf8")));
await writeFile(join(candidateDir, "burns-like-candidate.txt"), format(candidate), "utf8");

console.log(`Prepared Robert Burns public-domain experiment corpus with ${burns.length} target lyrics.`);

function lyric(title: string, line1: string, line2: string, line3: string, line4: string): CorpusLyric {
  return {
    title,
    text: `[Verse 1]\n${line1}\n${line2}\n${line3}\n${line4}\n\n[Chorus]\n${line3}\n${line4}\n${line1}\n${line2}\n\n[Verse 2]\n${line1}\n${line4}\n${line2}\n${line3}\n\n[Final Chorus]\n${line3}\n${line4}\n${line3}\n${line4}`
  };
}

function format(item: CorpusLyric): string {
  return [
    `Title: ${item.title}`,
    "Source: Public-domain Robert Burns lyric excerpt; Project Gutenberg #1279 is the reference collection.",
    "",
    item.text,
    ""
  ].join("\n");
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");
}
