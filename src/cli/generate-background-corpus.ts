import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dataPath } from "../core/config.js";

interface ControlLyric {
  type: string;
  title: string;
  text: string;
}

const controls: ControlLyric[] = [
  lyric("generic_pop", "Neon Heart", "We dance until the city fades", "Tonight we fly, we touch the sky", "Nothing can stop this fire inside"),
  lyric("generic_pop", "Radio Forever", "Your lipstick shines under midnight rain", "Turn it up and say my name", "We are young and we are flame"),
  lyric("generic_pop", "Gravity Kiss", "Every sidewalk turns to gold", "Hold me close and don't let go", "Love is all we need to know"),
  lyric("generic_pop", "Weekend Crown", "Friday saves me from the week", "Put a crown on every heartbeat", "We own the night, we own the street"),
  lyric("generic_indie", "Polaroid Weather", "Coffee cools beside the window", "Everything is almost something", "Everything is almost gone"),
  lyric("generic_indie", "Basement Fern", "A fern leans into rented light", "I keep your sweater in the hall", "The afternoon forgets us all"),
  lyric("generic_indie", "Cardboard Moon", "The cardboard moon above the bed", "Hums like a thrift-store radio", "I leave before the credits roll"),
  lyric("generic_indie", "Quiet Bicycle", "A bicycle sleeps behind the stairs", "The tires remember summer air", "I almost call but leave it there"),
  lyric("generic_worship_or_spiritual", "Higher Morning", "I lift my hands above the storm", "You are good, You are light", "You turn my darkness into praise"),
  lyric("generic_worship_or_spiritual", "Mercy River", "Your river washes every fear", "Glory rises, heaven near", "I surrender, You appear"),
  lyric("generic_worship_or_spiritual", "Altar Fire", "At the altar I am new", "Every chain is broken through", "All my hope returns to You"),
  lyric("generic_worship_or_spiritual", "Endless Hallelujah", "Mountains bow before Your name", "Every heart declares the same", "Hallelujah, fan the flame"),
  lyric("ornate_poetic", "Velvet Cathedrals", "Beneath vermilion balconies of grief", "O radiant sorrow, crown my sleep", "With silver hymns and perfumed ruin"),
  lyric("ornate_poetic", "Amethyst Funeral", "Amethyst bells in the orchard of dusk", "My velvet anguish drinks the rain", "And crowns the ash with jeweled pain"),
  lyric("ornate_poetic", "Opaline Lament", "Opaline birds of sorrow wheel", "Across the citadel of breath", "Where roses argue soft with death"),
  lyric("ornate_poetic", "Moonlit Reliquary", "Within the moonlit reliquary", "My perfumed grief becomes a psalm", "A wounded star, a jeweled calm"),
  lyric("nihilistic", "No Exit Sign", "The clock is cracked, the room is bare", "There is no meaning in the flame", "Nobody comes and nobody cares"),
  lyric("nihilistic", "Ash Wednesday Again", "Every answer turns to dust", "Nothing loves us, nothing must", "I name the dark and call it just"),
  lyric("nihilistic", "Static Grave", "Static speaks from every wall", "All our little heavens fall", "No one hears the final call"),
  lyric("nihilistic", "Empty Trophy", "I won the race to disappear", "The crowd was gone, the road was clear", "No victory, no witness here"),
  lyric("overly_preachy", "Lesson Learned", "You made a mistake and now you know", "Be better, do better, follow the rule", "Only the foolish keep acting cruel"),
  lyric("overly_preachy", "Choices Matter", "Bad decisions make bad days", "Good people always change their ways", "Listen close and earn your praise"),
  lyric("overly_preachy", "Moral Compass", "Point your compass to the right", "Never argue, never fight", "Truth is simple, black and white"),
  lyric("overly_preachy", "Helpful Advice", "If you are sad, just choose to smile", "Work much harder for a while", "Pain is solved by proper style"),
  lyric("topic_matched_wrong_style", "Mirror Anthem", "I look at myself and choose to rise", "I am powerful, I am free", "The mirror shows the best of me"),
  lyric("topic_matched_wrong_style", "Bulletproof Victory", "You shot your words but I survived", "I dodged the pain, I came alive", "Now I shine because I thrive"),
  lyric("topic_matched_wrong_style", "Mold Motivation", "Mold may grow but so do I", "Clean the room and touch the sky", "Every stain can teach you why"),
  lyric("topic_matched_wrong_style", "Trust Slogan", "Trust was broken, that's okay", "Positive thoughts will save the day", "I forgive in a simple way"),
  lyric("mutated_target_style", "Generic Bullet", "Someone hurt me and that was sad", "Pain is hard but I will cope", "I keep believing in generic hope"),
  lyric("mutated_target_style", "Mirror Checklist", "I look in mirrors every day", "I should improve in every way", "Growing up is what I say"),
  lyric("mutated_target_style", "Flat Mold", "There is mold and it is bad", "It makes me feel a little sad", "I wish the room was clean and glad"),
  lyric("mutated_target_style", "Trust Poster", "Trust is good and lies are wrong", "This is why I wrote this song", "Stand for truth and you'll be strong"),
  lyric("llm_generated_near_miss", "Almost Mold", "A stain appears inside my mind", "It grows because life is unfair", "I cannot stop the feeling there"),
  lyric("llm_generated_near_miss", "Almost Mirror", "The mirror says I am still small", "But then I learn to stand up tall", "And now I overcome it all"),
  lyric("llm_generated_near_miss", "Almost Journal", "You wrote my name inside a page", "I felt confused by all my rage", "Then I stepped outside the cage"),
  lyric("llm_generated_near_miss", "Almost December", "The winter made me feel alone", "I texted you beside my phone", "Now I heal and I have grown")
];

const backgroundDir = dataPath("raw/background/lyrics");
await mkdir(backgroundDir, { recursive: true });
for (const entry of await readdir(backgroundDir, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith(".txt")) await rm(join(backgroundDir, entry.name));
}
for (const control of controls) {
  const fileName = `${control.type}__${slug(control.title)}.txt`;
  await writeFile(join(backgroundDir, fileName), `Title: ${control.title}\nSynthetic-Control-Type: ${control.type}\n\n${control.text}\n`, "utf8");
}
console.log(`Generated ${controls.length} synthetic background/control lyrics across ${new Set(controls.map((control) => control.type)).size} control types.`);

function lyric(type: string, title: string, verse: string, chorus: string, closing: string): ControlLyric {
  return {
    type,
    title,
    text: `[Verse 1]\n${verse}\n${closing}\n${verse.replace(/\bI\b/g, "We")}\n${closing}\n\n[Chorus]\n${chorus}\n${closing}\n${chorus}\n${closing}\n\n[Verse 2]\n${verse}\n${closing.replace(/\bI\b/g, "You")}\n${verse.replace(/\bmy\b/g, "the")}\n${closing}\n\n[Chorus]\n${chorus}\n${closing}\n${chorus}\n${closing}\n\n[Bridge]\n${verse}\n${chorus}\n${closing}\n${chorus}\n\n[Final Chorus]\n${chorus}\n${closing}\n${chorus.toUpperCase()}\n${closing}`
  };
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");
}
