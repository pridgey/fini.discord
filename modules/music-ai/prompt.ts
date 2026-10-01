/**
 * Turning three slash command options into one sentence for MusicGen.
 *
 * MusicGen has no style parameter and no tempo parameter. It has a text
 * encoder, and everything the user picked has to arrive as part of the
 * description or not at all - so `style` and `tempo` are prompt engineering
 * wearing the costume of configuration.
 *
 * Kept out of the command and out of the generator because it is the one part
 * of this feature that is pure, worth testing, and likely to be fiddled with.
 */

/**
 * Style choices offered by `/music-ai`.
 *
 * `value` is what Discord sends back and `label` is what goes into the
 * prompt, which is why they are not just capitalisation apart: "hip-hop" is a
 * tidy option value and "hip hop" is what the model was trained on.
 *
 * Hand-written rather than generated, same as `CURATED_VOICES` in
 * `modules/tts`: Discord caps a string option at 25 choices, and the order is
 * a decision. These lead with the genres MusicGen demonstrably does well.
 */
export const MUSIC_STYLES = [
  { name: "Lo-fi", value: "lofi", label: "lo-fi hip hop" },
  { name: "Ambient", value: "ambient", label: "ambient" },
  { name: "Synthwave", value: "synthwave", label: "synthwave" },
  { name: "Electronic", value: "electronic", label: "electronic" },
  { name: "Orchestral", value: "orchestral", label: "orchestral" },
  { name: "Classical", value: "classical", label: "classical" },
  { name: "Jazz", value: "jazz", label: "jazz" },
  { name: "Rock", value: "rock", label: "rock" },
  { name: "Pop", value: "pop", label: "pop" },
  { name: "Hip Hop", value: "hip-hop", label: "hip hop" },
  { name: "Folk", value: "folk", label: "folk" },
  { name: "Country", value: "country", label: "country" },
  { name: "Metal", value: "metal", label: "heavy metal" },
  { name: "Reggae", value: "reggae", label: "reggae" },
  { name: "Blues", value: "blues", label: "blues" },
];

/**
 * Tempo choices.
 *
 * Spelled out in BPM as well as in words because the model responds to both
 * and the number is the more specific signal - "fast" alone is a weaker
 * instruction than "fast tempo, around 140 BPM".
 */
export const MUSIC_TEMPOS = [
  { name: "Slow", value: "slow", label: "slow tempo, around 70 BPM" },
  { name: "Medium", value: "medium", label: "moderate tempo, around 100 BPM" },
  { name: "Fast", value: "fast", label: "fast tempo, around 140 BPM" },
];

/**
 * Discord choice lists for the two options.
 * @returns `{name, value}` pairs, without the prompt labels
 */
export const styleChoices = () =>
  MUSIC_STYLES.map(({ name, value }) => ({ name, value }));

export const tempoChoices = () =>
  MUSIC_TEMPOS.map(({ name, value }) => ({ name, value }));

/**
 * The text a style value contributes, if it is one we know.
 * @param value The option value from the interaction
 * @returns The prompt fragment, or undefined
 */
export const styleLabel = (value: string | undefined): string | undefined =>
  MUSIC_STYLES.find((style) => style.value === value)?.label;

/**
 * The text a tempo value contributes, if it is one we know.
 * @param value The option value from the interaction
 * @returns The prompt fragment, or undefined
 */
export const tempoLabel = (value: string | undefined): string | undefined =>
  MUSIC_TEMPOS.find((tempo) => tempo.value === value)?.label;

export type PromptParts = {
  description: string;
  style?: string;
  tempo?: string;
};

/**
 * Builds the description handed to the text encoder.
 *
 * Comma-joined rather than written as a sentence, because that is the shape
 * of MusicGen's training captions - "90s rock song with loud guitars and
 * heavy drums" rather than prose about what the music should evoke.
 *
 * The user's own words lead. Style and tempo are appended, and only when they
 * are values we recognise: a stale client can still send a choice that has
 * since been removed, and pasting an unknown string into the prompt would
 * quietly steer the generation with something nobody chose.
 *
 * Whitespace is flattened for the same reason it is in the reply - a prompt
 * with newlines is still one caption to the model, and the fragments have to
 * read as a list after it.
 * @param parts The user's description and their two picks
 * @returns A single-line caption
 */
export const buildMusicPrompt = ({
  description,
  style,
  tempo,
}: PromptParts): string =>
  [
    description.replace(/\s+/g, " ").trim(),
    styleLabel(style),
    tempoLabel(tempo),
  ]
    .filter(Boolean)
    .join(", ");
