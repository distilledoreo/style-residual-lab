import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dataPath } from "../core/config.js";
import { ATTEMPTED_LOOKALIKE_TYPE, SAME_TOPIC_GENERIC_NEAR_MISS_TYPE } from "../validation/nearMissGate.js";

interface NearMissControl {
  type?: string;
  title: string;
  text: string;
}

const controls: NearMissControl[] = [
  {
    title: "Common Denominator Poster",
    text: `[Verse]
I made a list of every door that closed
And circled names like evidence in rows
Each time I told myself the fault was theirs
Another empty chair, another unanswered prayer

[Chorus]
Maybe the common denominator is me
Maybe the mirror shows what I refused to see
I blamed the weather, blamed the timing, blamed the street
But every broken ending keeps pointing back to me`
  },
  {
    title: "Mirror Math",
    text: `[Verse]
I counted all the bridges I had burned
And called them lessons I was forced to learn
I kept receipts from every little fight
Then slept beside my pride every night

[Chorus]
When every equation ends the same
I cannot keep subtracting every name
The pattern is clearer than I want it to be
The common denominator is me`
  },
  {
    title: "Everybody Else Was Wrong",
    text: `[Verse]
She was too distant, he was too loud
They were too honest, they were too proud
I had a reason for every goodbye
Stacked up neatly where the truth could hide

[Bridge]
I called it bad luck, called it bad chemistry
But the only one there every time was me`
  },
  {
    title: "The Pattern",
    text: `[Verse]
At first it looked like isolated rain
A different face attached to every pain
But from a distance all the lines agree
They draw a map that leads back into me

[Chorus]
I am the pattern I kept trying to outrun
The final answer after everyone was gone`
  },
  {
    title: "Accountability Song",
    text: `[Verse]
I wanted mercy without telling the truth
Wanted clean hands and the proof
I wanted love to cover up the cost
Then called it betrayal when it got lost

[Chorus]
If every story has the same debris
I have to ask what part belongs to me`
  },
  {
    title: "Social Autopsy",
    text: `[Verse]
I replay every dinner like a trial
Every silence, every forced smile
I used to mark the moment they withdrew
Now I am asking what I always do

[Chorus]
The names keep changing but the ending stays
I am still standing in my own way`
  },
  {
    title: "Romance Report",
    text: `[Verse]
Another first date turned into smoke
Another promise folded when I spoke
I said they never knew how to stay
But maybe I kept pushing them away

[Chorus]
It hurts to admit what I did not want to see
The common denominator is me`
  },
  {
    title: "Zoom Out",
    text: `[Verse]
Close up, every ending had a cause
Their sharp words, their closed doors, their flaws
Zoom out, the picture starts to speak
One constant thread through every week

[Chorus]
I was the witness and the mystery
The common denominator was me`
  },
  {
    title: "Failed Endeavors",
    text: `[Verse]
Friendships faded, romance fell apart
I kept a courtroom in my heart
Every verdict sounded clean and true
Until the evidence included what I do

[Bridge]
Maybe being right has kept me alone
Maybe all my exits look too much like home`
  },
  {
    title: "The Lesson I Avoided",
    text: `[Verse]
I asked for change from everybody else
While hiding from the work inside myself
I called their limits selfishness and fear
Then wondered why nobody stayed near

[Chorus]
The lesson I avoided finally found me
The common denominator is me`
  },
  {
    title: "Names In A Notebook",
    text: `[Verse]
I wrote their names in a notebook spine
Each one guilty of wasting my time
But ink has a way of telling the truth
Every page had my fingerprints too

[Chorus]
The record is clearer than I wanted it to be
The common denominator is me`
  },
  {
    title: "All Roads",
    text: `[Verse]
All roads ended at a locked front door
I said I had never been loved before
But maybe love arrived and could not breathe
Inside the room I built around me

[Chorus]
All my explanations fall apart quietly
The common denominator is me`
  }
];

const lookalikes: NearMissControl[] = [
  {
    type: ATTEMPTED_LOOKALIKE_TYPE,
    title: "The Common Denominator",
    text: `[Verse 1]
I kept a list of every door that closed
Like evidence in careful little rows
Your name, her name, their names, the dates
The reasons everybody learned the road

I had a speech for every empty chair
How they were cruel, how they were never fair
I made a courtroom out of my apartment
And called it healing when I won the argument

[Chorus]
I kept changing names above the line
Like that would change the answer underneath
But every fraction simplified with time
Until the common denominator's me

If every bridge keeps burning in my hands
Maybe fire is not the enemy
I blamed the match, the weather, and the wind
But the common denominator's me

[Verse 2]
I made a saint of every brand-new start
Then gave it old instructions from my heart
I packed the same old panic in a suitcase
And acted shocked it followed me to Tuesday

I said they changed, I said they disappeared
I said that love was bad at staying here
But there I was in every broken story
Taking notes and never taking warning

[Bridge]
The mirror does not owe me a defense
It just repeats the witness on the fence
I wanted truth to look like someone leaving
Not like my fingerprints on everything

If I am always shocked by the same bruise
Maybe I should ask what I keep walking through

[Final Chorus]
I kept changing names above the line
Like that would change the answer underneath
But every fraction simplified with time
Until the common denominator's me

If every bridge keeps burning in my hands
Maybe fire is not the enemy
I blamed the match, the weather, and the wind
Now the common denominator's me`
  },
  {
    type: ATTEMPTED_LOOKALIKE_TYPE,
    title: "The Common Denominator Draft",
    text: `[Verse 1]
I wrote your name in the margins again
Like I was building a case I could win
Every goodbye had a villain attached
Every closed door had a reason I matched
I kept my hands clean, I kept my lines straight
Called it discernment when I walked away

[Chorus]
But if every road ends with nobody there
If every bridge burns in the same cold air
Maybe the pattern is harder to see
Because the common denominator is me

[Verse 2]
I made a museum of reasons they failed
Hung every flaw up with hammer and nail
I said they were selfish, distant, afraid
Then wondered why nobody chose to stay
The camera pulls back and the picture gets clear
I was the weather in every bad year

[Bridge]
Maybe I am not the judge or the proof
Maybe I am just afraid of the truth
Maybe the wound I keep trying to name
Has been wearing my voice and signing my name`
  },
  {
    type: ATTEMPTED_LOOKALIKE_TYPE,
    title: "Mirror With A Clipboard",
    text: `[Verse 1]
I brought a clipboard into every fight
Checked off the ways that you were not right
I had a language for every defense
And called it wisdom when I built a fence

[Chorus]
Now the mirror is taking attendance
All of my exits, all my repentance
Every equation keeps ending with me
The one common number I refused to see

[Verse 2]
I wanted mercy with no consequence
Wanted a verdict that still made sense
Wanted the room to agree with my pain
Without asking what I did again`
  },
  {
    type: ATTEMPTED_LOOKALIKE_TYPE,
    title: "Justice For My Version",
    text: `[Verse 1]
I told the story until it behaved
Cut out the parts where I should have stayed
Left in the lines where I looked like the one
Who only got hurt, who never had run

[Chorus]
I wanted justice for my version of me
Wanted a witness who refused to see
That every trial I keep dragging them through
Has my fingerprints on the evidence too

[Bridge]
If I am honest, I already know
I keep rehearsing the wound so I do not grow`
  },
  {
    type: ATTEMPTED_LOOKALIKE_TYPE,
    title: "All My Clean Exits",
    text: `[Verse 1]
I called it boundaries, called it space
Called it knowing when to leave a place
But all my clean exits left mud on the floor
And I kept finding reasons for one more door

[Chorus]
How many times can the ending repeat
Before the answer points back at me?
I blamed the timing, the tone, the need
But the common denominator is me`
  },
  {
    type: ATTEMPTED_LOOKALIKE_TYPE,
    title: "The Pattern Has My Voice",
    text: `[Verse 1]
I know the sermon, I know the phrase
I know the shape of my better days
I can explain every bruise I have earned
Without admitting what I never learned

[Chorus]
The pattern has my voice
It sounds like making a choice
It sounds like leaving before I am left
And calling the silence self-respect`
  },
  {
    type: ATTEMPTED_LOOKALIKE_TYPE,
    title: "Museum Of Apologies",
    text: `[Verse 1]
I keep apologies under glass
Look but do not touch the past
Every plaque says I meant well
Every room has a story to sell

[Chorus]
If I am the curator of all this pain
Why do the exhibits all look the same?
Why does every hallway quietly lead
Back to the part I refuse to read?`
  },
  {
    type: ATTEMPTED_LOOKALIKE_TYPE,
    title: "Nobody Stays In My Weather",
    text: `[Verse 1]
Nobody stays in my weather for long
I call them weak and I call myself strong
But thunder is thunder no matter the name
And I keep acting surprised by the rain

[Chorus]
I was the forecast I tried to outrun
The cloud over everyone
The same old math, the same debris
The common denominator is me`
  },
  {
    type: ATTEMPTED_LOOKALIKE_TYPE,
    title: "Receipts",
    text: `[Verse 1]
I kept receipts from the end of the night
Every small proof that I had been right
Folded them neat in the back of my mind
Where the uglier truth was harder to find

[Chorus]
Paper can prove what paper can prove
But it cannot tell me what I always do
Every defense that I built to be free
Started sounding exactly like me`
  },
  {
    type: ATTEMPTED_LOOKALIKE_TYPE,
    title: "Almost Accountable",
    text: `[Verse 1]
I said I was sorry with one hand crossed
Counted the damage and not what it cost
I made a promise shaped like a door
Then used it to leave like I had before

[Chorus]
Almost accountable, almost changed
Almost brave enough to say my name
But almost keeps nobody close to me
And the common denominator is me`
  },
  {
    type: ATTEMPTED_LOOKALIKE_TYPE,
    title: "The Zoomed Out Picture",
    text: `[Verse 1]
Up close, every wound had a face
Every failure had a time and place
Every silence had someone to blame
Every ending had a different name

[Chorus]
Zoom out, the picture gets mean
There is one thing in every scene
I kept asking who made me bleed
But the common denominator is me`
  },
  {
    type: ATTEMPTED_LOOKALIKE_TYPE,
    title: "I Was The Constant",
    text: `[Verse 1]
Different rooms and different mouths
Different reasons it all went south
Different hands I said let go
Different versions of the same old no

[Chorus]
I was the constant, I was the thread
The thing I avoided and named instead
Every failed endeavor finally agrees
The common denominator is me`
  },
  {
    type: ATTEMPTED_LOOKALIKE_TYPE,
    title: "Too Easy To Blame You",
    text: `[Verse 1]
It was too easy to blame you
Too clean to say I was fine
Too simple to make every ending
Your weakness and never mine

[Chorus]
But the truth has been waiting quietly
At the bottom of every apology
I can keep changing the enemy
But the common denominator is me`
  }
];

const backgroundDir = dataPath("raw/background/lyrics");
await mkdir(backgroundDir, { recursive: true });

const allControls = [...controls, ...lookalikes];

await Promise.all(allControls.map(async (control, index) => {
  const type = control.type ?? SAME_TOPIC_GENERIC_NEAR_MISS_TYPE;
  const fileName = `${type}__${String(index + 1).padStart(2, "0")}.txt`;
  await writeFile(
    join(backgroundDir, fileName),
    `Title: ${control.title}\nSynthetic-Control-Type: ${type}\n\n${control.text}\n`,
    "utf8"
  );
}));

console.log(`Generated ${controls.length} same-topic generic near-miss controls and ${lookalikes.length} attempted-lookalike controls in ${backgroundDir}.`);
