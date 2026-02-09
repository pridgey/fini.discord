import { SlashCommandBuilder } from "@discordjs/builders";
import { AttachmentBuilder, ChatInputCommandInteraction } from "discord.js";
import OpenAI from "openai";
import { converseWithAI } from "../modules/aiChat/aiChat";

export const data = new SlashCommandBuilder()
  .setName("generate-npc")
  .setDescription("Creates the markdown for a new D&D npc")
  .addStringOption((option) =>
    option
      .setName("prompt")
      .setDescription("information about the character that will be generated")
      .setRequired(true),
  )
  .addBooleanOption((option) =>
    option
      .setName("ephemeral")
      .setDescription("Sends the result to you ephemerally")
      .setRequired(false),
  );

export const execute = async (
  interaction: ChatInputCommandInteraction,
  logCommand: () => void,
) => {
  try {
    const additionalInfo =
      interaction.options.get("prompt")?.value?.toString() || "";
    const isEphemeral: boolean = Boolean(
      interaction.options.get("ephemeral")?.value?.toString() || false,
    );

    const prompt = `You are a helpful assistant who will generate a wiki style page entry for my D&D world. You will generate this in markdown for use in Obsidian, adhering to the following template:

    Template:
    \`\`\`
    *"{quote text}"*
*- {npc name}*
## Basic Information

| **Race** | Occupation   | Alignment   | Location         |
| -------- | ------------ | ----------- | ---------------- |
| {race}   | {occupation} | {alignment} | {location}       |
### Stats

| AC   | Strength | Dexterity | Constitution | Intelligence | Wisdom  | Charisma |
| ---- | -------- | --------- | ------------ | ------------ | ------- | -------- |
| {ac} | {str}    | {dex}     | {con}        | {int}        | {wis}   | {cha}    |

## Appearance

| Age           | Gender   | Height   | Build   | Eyes        | Hair         |
| ------------- | -------- | ------   | ------- | ----------- | ------------ |
| {age}         | {gender} | {height} | {build} | {eye color} | {hair color} |

### Notable Features:
 
- {notable feature that makes this npc unique}

### Clothing:

- {brief explanation of the clothes they character typically wears}

## Personality

### Traits

- **{personality trait name}:** {A personality trait of this npc}
- **{personality trait name}:** {A personality trait of this npc}
- **{personality trait name}:** {A personality trait of this npc}

### Flaws

- **{personality flaw name}:** {A personality flaw of this npc}
- **{personality flaw name}:** {A personality flaw of this npc}
- **{personality flaw name}:** {A personality flaw of this npc}

## Abilities

**{ability name}**
{ability description}

**{ability name}**
{ability description}

**{ability name}**
{ability description}

## History

{history of this npc including their background, where they might have come from and what they do today}
    \`\`\`

    Here are some following npc entries to help understand how the results should be:

    Example 1:
    \`\`\`
    Riches for riches sake waste for me the riches and wealth of these around me."*
*- Elara Thorne*
## Basic Information

| **Race** | Occupation | Alignment | Location         |
| -------- | ---------- | --------- | ---------------- |
| Human    | Thief      | Neutral   | Ancient Deluilia |
### Stats

| AC  | Strength | Dexterity | Constitution | Intelligence | Wisdom  | Charisma |
| --- | -------- | --------- | ------------ | ------------ | ------- | -------- |
| 18  | 10 (+0)  | 25 (+7)   | 12 (+1)      | 14 (+2)      | 13 (+1) | 16 (+3)  |

## Appearance

| Age           | Gender | Height | Build | Eyes  | Hair   |
| ------------- | ------ | ------ | ----- | ----- | ------ |
| 48 (Deceased) | Female | 5'8"   | Lean  | Green | Blonde |

### Notable Features:
 
- Elara has long blonde hair that she tends to keep hidden in her hood.
- Elara has a long scar up her left arm.
- Elara tends to hide any notable features to keep herself hidden.

### Clothing:

- Elara wears neutral tone robes that allow her to blend in a variety of situations. She rotates different articles of clothing to ensure she is unrecognizable. Any and all items that make noise are carefully and meticulously tied down.

## Personality

### Traits

- **Honest:** Although a thief, Elara has always prided herself on being a thief of her word. She has always kept her promises and upheld her side of the bargain.
- **Fearless:** Elara has no sense of fear. Encounters that might shake brave adventurers are seen as exciting opportunities to her.
- **Empathetic:** Elara has a soft heart and connects very well with those around her. She wants to help everyone she can.

### Flaws

- **Overzealous:** Elara believes strongly in her mission and abilities, often purposefully putting herself in dangerous situations. She has been responsible for many deaths from putting the mission before the people.
- **Heedless:** While a great planner, Elara will take every opportunity she can no matter how perilous.
- **Jaded:** Elara loves connecting with people, but working within groups of liars, thieves and assassins has made sure that she doesn't allow anyone close to her heart.

## Abilities

**Elusive**
Specializing in the art of escape, Elara can spot every way to avoid contact when in close proximity to dangerous foes. Elara is immune to attacks of opportunity.

**Eerily Still**
One thing that allows Elara to be so successful in her heists is a good old fashion stakeout. She will find a hidden spot and camp there motionless, potentially for days. This observation allows her to recognize patterns and opportunities. Elara has a +12 to stealth rolls.

## History

In the age of Harumok's Era, Elara was born to an ancient empire facing war and collapse. Her parents were part of a revolutionary movement to liberate the people of the city. The quality of life in the empire had plummeted in recent years as their power-hungry King hoarded power and wealth. Any excess resources were spent on armies as they waged war on neighbors.

Elara was born underground. Her birth and childhood was celebrated by a small group of assassins and thieves. As Elara grew, the group trained her in the ways of the rogue. She became adept at hiding in shadows, and stealing what she could.

One fateful day her group was found by a small noble militia. They were slaughtered and Elara was able to escape due to her small size. She took refuge in small bandit camps in the outside wilderness. Her time with the assassins and thieves gave Elara a network of connections that helped her maintain a sense of life.

As Elara's skills grew, she decided to use her abilities to help those that needed it most. She became an expert at planning heists to grab wealth from corrupt nobility and distribute it to those in need. An other-world Robin Hood.

Her heroic deeds, kind heart, and ability to seemingly escape any conflict as if through shadow resulted in her being a living legend. Over time tales of her accomplishments became embellished. She became known as [[Shade's Grasp]]. A legend that continued to be passed down generation to generation. With each passing time, the legend would grow and change to be full of partial truths. Many aspects of the legend grew to become larger than life.

Elara's biggest success was her heist of the King's prized artifact: The Cerulean Banner. A large tapestry of incredibly rare and beautiful sapphires. It was crafted for the King using money collected from the people and was seen by the population as a testament to the King's greed. For months Elara planned every detail of her heist, which was executed perfectly.

The tapestry was dismantled and the sapphires spread throughout the empire, enraging the King. Elara quickly became the most wanted criminal of the empire but this did not slow down her operations. She continued a number of heists from various noblemen, and even when it looked as though she would finally be captured or killed, she found a way to flee.

Later in life, a little after age 40, Elara settled down in a countryside villa. She could sense the oncoming war that would ravage the empires and sought a simple life. A tryst with a traveling adventurer led to pregnancy. A young boy was born who was the ancestral next step linking Elara and the modern day bard [[Dorian Thorne]].

7 years later, the boy's father passed through town again. He met his son for the first time and while it broke Elara's heart slightly, the boy left with his father pursuing a life of adventure that Elara no longer dreamed of.

A little more than a year later, through a connection to a guild of assassins, the old King finally managed to track her down and with a group of high level mages he magically trapped her within her own home, and burnt it to the ground.
    \`\`\`

    Example 2:
    \`\`\`
    *"Loyalty is a contract; A price. Not a sentiment."*
*- Erfiðr*

## Basic Information

|**Race**|Occupation|Alignment|Location|
|---|---|---|---|
|Kenku|Criminal Mastermind|Neutral Evil|Stor Carrea & Abasea|

### Stats

|AC|Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma|
|---|---|---|---|---|---|---|
|16|10 (+0)|16 (+3)|14 (+2)|18 (+4)|15 (+2)|13 (+1)|

## Appearance

|Age|Gender|Height|Build|Eyes|Feathers|
|---|---|---|---|---|---|
|70|Male|5'6"|Lean|Pitch Black|Midnight Blue & Black|

### Notable Features:

- Feathers meticulously maintained, showing pride and attention to detail
- Sharp, calculating eyes that seem to take in every minute detail
- Moves with a fluid, almost predatory grace
- Scars partially hidden beneath his feathers, hinting at a violent past
- Even when disguised as someone else, tends to have accent colors of black and dark blue.

### Clothing:

- Expertly tailored dark leather coat
- Multiple hidden pockets and compartments
- Ornate silver bracelets on the wrists

## Personality

### Traits

- **Calculating:** Approaches every situation with meticulous planning
- **Manipulative:** Exceptional at reading people and exploiting their weaknesses
- **Patient:** Willing to wait years to see a plan come to fruition

### Flaws

- **Paranoid:** Trusts no one completely, not even his closest lieutenants
- **Ego-Driven:** Believes himself to be several steps ahead of everyone else
- **Control Freak:** Cannot stand any situation outside of his direct influence

## Abilities

**Voice Thief** Can perfectly mimic any voice or sound he has heard, allowing for unparalleled disguise and manipulation. This ability extends beyond simple mimicry to capturing the nuanced speech patterns and emotional undertones of the original speaker.

**Shadow Network** Maintains an extensive network of informants across multiple social strata. Can, as an action, gather immediate intelligence about any person or organization within Stor Carrea or Abasea, with a 95% accuracy rate.

**Keeper of Secrets** Erfiðr loves collecting secrets, from mundane to life-ruining. His spry mind allows him to retain all secrets he has ever gathered and enjoys using them to assist in his exploits. His network means he likely has some sort of secret on anyone who comes across his path.

**Mask of Many Faces** A rare magical artifact that allows the wearer to transform their physical form into anything they can imagine. The wearer does not gain any new abilities of its transformed form, and its original clothes and carried equipment are transformed into the new form as well.

## Background

Erfiðr emerged from the shadowy corners of [[Stor Carrea|Stor Carrea's]] criminal underworld, building [[The Blood Root]] from a small-time criminal organization to a sophisticated network spanning multiple cities. His unique ability to mimic voices and mannerisms perfectly has been a cornerstone of his success, allowing him to infiltrate the highest echelons of society.

The origins of Erfiðr remain a mystery. Some whisper he was once a slave, others claim he was a discarded experiment. What is known is that he systematically built The Blood Root by eliminating rivals, corrupting officials, and creating an intricate web of blackmail and manipulation. His control over the [[Merchant Guild of Abasea]] is so subtle that most members believe they operate independently, unaware that every significant decision is subtly guided by Erfiðr's unseen hand.

Despite being 70 years old, Erfiðr shows no signs of slowing down and resembles an adult Kenku still in his prime. Thanks, secretly, to his supply of youth potions he keeps hidden. His network of informants, his strategic brilliance, and his ability to remain completely undetected have made him a ghost in the political and criminal landscapes of Stor Carrea and Abasea.

Erfiðr utilizes a special mask to magically transform his form into anything he can image. While not a true polymorph in that he does not gain any abilities, his physical form does change during the transformation. Making it not just an illusion. This, mixed with his Kenku mimicry, allows him to become anyone he chooses.
    \`\`\`
    `;

    await interaction.deferReply();

    // TODO: figure out how to do structured replies with anthropic
    // const response = await converseWithAI({
    //   userID: interaction.user.id,
    //   message: prompt,
    //   server: interaction.guild?.id ?? "unknown server id",
    //   options: {
    //     skipHistory: true,
    //     skipSave: true,
    //     skipPersonality: true,
    //   },
    // });

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY ?? "unknown open ai key",
    });

    const userMessage = `Here is all known information about this npc for you to use in the generation of this character. All other information should be created during generation: ${additionalInfo}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: [
            {
              type: "text",
              text: prompt,
            },
          ],
        },
        {
          role: "user",
          content: userMessage,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "characterMarkdown",
          strict: true,
          schema: {
            type: "object",
            properties: {
              markdown: {
                type: "string",
                description: "The markdown representation of a character.",
              },
            },
            required: ["markdown"],
            additionalProperties: false,
          },
        },
      },
      temperature: 1,
      max_tokens: 2048,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
    });

    const responseData = JSON.parse(
      response.choices[0].message.content ?? "{ markdown: ''}",
    );

    if (responseData.markdown.length > 0) {
      const buffer = Buffer.from(responseData.markdown, "utf-8");

      // Create an attachment from the buffer
      const attachment = new AttachmentBuilder(buffer, {
        name: "character-markdown.txt",
      });

      await interaction.editReply({
        files: [attachment],
        options: {
          ephemeral: isEphemeral,
        },
      });
    } else {
      await interaction.editReply("Error during npc generation.");
    }

    logCommand();
  } catch (err) {
    console.error("Error during /generate-npc", err);
    if (interaction.replied) {
      interaction.editReply("Error during /generate-npc");
    } else {
      interaction.reply("Error during /generate-npc");
    }
  }
};
