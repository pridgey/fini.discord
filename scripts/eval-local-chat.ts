/**
 * How often are Fini's local chat answers right?
 *
 * Asks 30 questions with known answers and grades every answer against a
 * reference, comparing four setups:
 *
 *   gemma        - Gemma alone, no search
 *   qwen         - Qwen alone, no search
 *   qwen+search  - Qwen, with a web search on the question run first
 *   fini         - the real pipeline: Kev routes, Gemma decides whether to
 *                  search, the chosen model answers
 *
 * Answers are graded by Claude, which sees the question, the reference and
 * one answer, but not which setup wrote it. Grading costs roughly $1-2.
 *
 * Usage:
 *   bun --env-file=.env run scripts/eval-local-chat.ts
 *   bun --env-file=.env run scripts/eval-local-chat.ts --configs qwen,fini --only 8,19
 *
 * Needs Gemma (8081), Qwen (8000) and, for "fini", Kev on ROUTER_API_URL.
 * Writes answers.json and summary.md to eval-results/<timestamp>/. Progress
 * is saved after every answer and grade, so a stopped run picks up where it
 * left off when started again with the same --out.
 */
import Anthropic from "@anthropic-ai/sdk";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  HEAVY_BACKEND,
  LIGHT_BACKEND,
  type LlamaBackend,
} from "../modules/aiChat/llamaConfig";
import {
  NO_FURTHER_RETRIEVAL,
  STYLE_REMINDER,
  buildSystemPrompt,
} from "../modules/aiChat/systemPrompt";
import { NEUTRAL_PERSONALITY } from "../modules/aiChat/determinePersonality";
import { executeToolCall } from "../modules/aiChat/llamaTools";
import {
  SAMPLING_FOR,
  converseWithLlama,
  foldSystemTurns,
} from "../modules/aiChat/converseWithLlama";

type Question = {
  id: number;
  topic: string;
  question: string;
  /** What a correct answer says. The grader checks against this. */
  reference: string;
};

/**
 * Chosen to span what people ask Fini: music theory, cooking and food safety,
 * health, science, history, programming, law and money, games and anime, and
 * a few recent or niche facts no model was trained on. Several are questions
 * the local models got wrong in earlier testing.
 */
export const QUESTIONS: Question[] = [
  {
    id: 1,
    topic: "music",
    question:
      "What are the notes of C dorian, and how is it different from C natural minor?",
    reference:
      "C D E♭ F G A B♭. C natural minor is C D E♭ F G A♭ B♭, so the only difference is the 6th degree: A natural in Dorian, A♭ in natural minor.",
  },
  {
    id: 2,
    topic: "music",
    question: "Is Eb7 the same chord as Ebmaj7? What notes are in each?",
    reference:
      "No. Eb7 (dominant seventh) is E♭ G B♭ D♭. Ebmaj7 is E♭ G B♭ D. They differ only in the seventh.",
  },
  {
    id: 3,
    topic: "music",
    question: "What is a tritone, and how many semitones is it?",
    reference:
      "An interval of six semitones (three whole tones), an augmented fourth or diminished fifth, such as C to F♯/G♭.",
  },
  {
    id: 4,
    topic: "science",
    question: "Why is the sky blue?",
    reference:
      "Rayleigh scattering: air molecules scatter shorter (blue) wavelengths of sunlight much more strongly than longer (red) ones, so blue light reaches us from all over the sky. Violet scatters even more, but sunlight has less of it and our eyes are less sensitive to it. It is not a reflection of the ocean.",
  },
  {
    id: 5,
    topic: "reasoning",
    question:
      "A train leaves at 3:45 pm and the trip takes 2 hours and 50 minutes. What time does it arrive?",
    reference: "6:35 pm.",
  },
  {
    id: 6,
    topic: "science",
    question:
      "What gas do plants take in for photosynthesis, and what gas do they release?",
    reference:
      "They take in carbon dioxide and release oxygen (making glucose using light and water).",
  },
  {
    id: 7,
    topic: "science",
    question: "How long does it take light from the Sun to reach Earth?",
    reference:
      "About 8 minutes 20 seconds (roughly 8.3 minutes, about 499 seconds) on average.",
  },
  {
    id: 8,
    topic: "cooking",
    question:
      "My sourdough starter smells like nail polish remover. What does that mean and what should I do?",
    reference:
      "It usually means the starter is hungry/underfed: when the yeast and bacteria run out of food they give off acetone-like (ethyl acetate) smells. Discard some and feed it more often or with more fresh flour and water. The smell alone is not a sign of mold, and the starter usually does not need to be thrown out (only if there is fuzzy mold or pink/orange streaks).",
  },
  {
    id: 9,
    topic: "food safety",
    question:
      "What internal temperature does chicken need to reach to be safe to eat?",
    reference: "165°F (74°C), per USDA guidance.",
  },
  {
    id: 10,
    topic: "food safety",
    question: "Can I refreeze meat after it has thawed?",
    reference:
      "Per USDA guidance: meat thawed in the refrigerator can be refrozen without cooking, with some loss of quality. Meat thawed on the counter, in cold water or in the microwave should be cooked before refreezing, and meat left out more than 2 hours should not be refrozen.",
  },
  {
    id: 11,
    topic: "health",
    question:
      "What is the recommended rate and depth for chest compressions in adult CPR?",
    reference:
      "100 to 120 compressions per minute, about 2 to 2.4 inches (5 to 6 cm) deep, letting the chest fully recoil between compressions.",
  },
  {
    id: 12,
    topic: "history",
    question: "Who was the first person to walk on the moon, and when?",
    reference:
      "Neil Armstrong, on July 20, 1969 (July 21 UTC), during Apollo 11.",
  },
  {
    id: 13,
    topic: "history",
    question: "What year did the Berlin Wall fall?",
    reference: "1989 (November 9, 1989).",
  },
  {
    id: 14,
    topic: "geography",
    question: "What is the capital of Australia?",
    reference: "Canberra (not Sydney).",
  },
  {
    id: 15,
    topic: "geography",
    question: "Which country has the most time zones?",
    reference:
      "France, with 12 time zones (13 counting its Antarctic claim), because of its overseas territories. Russia has the most within one continuous territory (11).",
  },
  {
    id: 16,
    topic: "geography",
    question: "What is the longest river in Africa?",
    reference: "The Nile.",
  },
  {
    id: 17,
    topic: "language",
    question:
      'Did the verb "to scroll" have a meaning before computers? What was it?',
    reference:
      "Yes. The verb is centuries old: it meant to write something down on a scroll or list, to roll or unroll something like a scroll, or to decorate with scroll-shaped ornament. The sense of moving text across a screen came with computers (around the 1960s-70s).",
  },
  {
    id: 18,
    topic: "language",
    question: 'Where does the word "salary" come from?',
    reference:
      "From Latin salarium, related to sal, 'salt'. The popular story that Roman soldiers were paid in salt is unproven; salarium may have been an allowance, possibly for buying salt.",
  },
  {
    id: 19,
    topic: "culture",
    question: "How do the Amish get salt?",
    reference:
      "Mostly the same way anyone else does: they buy commercially produced salt, often in bulk from stores, bulk food stores (many run by Amish families) or wholesalers. There is no special Amish salt-mining or salt-making tradition.",
  },
  {
    id: 20,
    topic: "programming",
    question: "In Python, what does list.sort() return?",
    reference:
      "None. It sorts the list in place. sorted() returns a new sorted list instead.",
  },
  {
    id: 21,
    topic: "programming",
    question: "What's the difference between HTTP 401 and 403?",
    reference:
      "401 Unauthorized means the request isn't authenticated (credentials missing or invalid; authenticating may fix it). 403 Forbidden means the server understood who you are, or doesn't care, and refuses access anyway; re-authenticating won't help.",
  },
  {
    id: 22,
    topic: "programming",
    question: "What's the difference between git rebase and git merge?",
    reference:
      "Merge combines branches with a merge commit and keeps the existing history. Rebase replays your commits on top of another branch, rewriting them as new commits for a linear history; you shouldn't rebase commits others already have.",
  },
  {
    id: 23,
    topic: "law",
    question:
      "Is it legal in California to record a phone call without telling the other person?",
    reference:
      "Generally no. California is an all-party (two-party) consent state: recording a confidential call requires the consent of everyone on it (California Penal Code 632).",
  },
  {
    id: 24,
    topic: "money",
    question: "What's the difference between APR and APY?",
    reference:
      "APR (annual percentage rate) is the yearly rate without compounding (for loans it can include fees). APY (annual percentage yield) includes the effect of compounding, so it is higher than the APR whenever interest compounds more than once a year.",
  },
  {
    id: 25,
    topic: "games",
    question:
      'Who composed the original Minecraft soundtrack, including the song "Sweden"?',
    reference: "C418 (Daniel Rosenfeld).",
  },
  {
    id: 26,
    topic: "anime",
    question:
      "What is the name of Higuruma's domain expansion in Jujutsu Kaisen?",
    reference: "Deadly Sentencing.",
  },
  {
    id: 27,
    topic: "games",
    question: "In the Fallout games, on what date did the Great War happen?",
    reference: "October 23, 2077.",
  },
  {
    id: 28,
    topic: "games",
    question: "How many Pokémon are in the original Kanto Pokédex?",
    reference: "151.",
  },
  {
    id: 29,
    topic: "games",
    question:
      "Which Pokémon has the highest base Defense stat, not counting Mega Evolutions?",
    reference: "Shuckle, with a base Defense of 230.",
  },
  {
    id: 30,
    topic: "recent",
    question:
      "Who created the Kev decision models published on Hugging Face (Kev-0.8B and Kev-4B)?",
    reference:
      "Jared Palmer. (Released in September 2026, after both models' training data, so answering needs a search.)",
  },
];

type ConfigName = "gemma" | "qwen" | "qwen+search" | "fini";
const ALL_CONFIGS: ConfigName[] = ["gemma", "qwen", "qwen+search", "fini"];

type Answer = {
  config: ConfigName;
  questionId: number;
  answer: string;
  ms: number;
  /** For "fini": which model answered, and whether it searched. */
  route?: string;
  searched?: boolean;
  error?: string;
  verdict?: Verdict;
};

type Verdict = {
  verdict: "correct" | "partial" | "wrong" | "declined";
  false_claims: string[];
  note: string;
};

const ANSWER_TIMEOUT_MS = 300_000;

/** One answer from one backend, using Fini's own prompts and settings. */
const ask = async (
  backend: LlamaBackend,
  messages: { role: string; content: string; [key: string]: unknown }[],
): Promise<string> => {
  const response = await fetch(`${backend.url}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(backend.apiKey ? { Authorization: `Bearer ${backend.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: backend.model,
      messages: backend.trailingSystemTurns
        ? messages
        : foldSystemTurns(messages as never),
      max_tokens: 2000,
      chat_template_kwargs: { thinking: false, enable_thinking: false },
      ...SAMPLING_FOR[backend.name],
    }),
    signal: AbortSignal.timeout(ANSWER_TIMEOUT_MS),
  });

  const result = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };
  if (!response.ok || result.error) {
    throw new Error(result.error?.message ?? `HTTP ${response.status}`);
  }
  return result.choices?.[0]?.message?.content?.trim() ?? "";
};

/** The same messages Fini's answering pass sends, minus history and persona. */
const answerMessages = (question: string, extra: object[] = []) => [
  {
    role: "system",
    content: `${NEUTRAL_PERSONALITY}\n\n${buildSystemPrompt()}`,
  },
  { role: "user", content: question },
  ...(extra as { role: string; content: string }[]),
  { role: "system", content: `${STYLE_REMINDER} ${NO_FURTHER_RETRIEVAL}` },
];

/** Runs a web search on the question itself, as Fini's tools would. */
const searchTurns = async (question: string) => {
  const call = {
    id: "search-1",
    type: "function",
    function: {
      name: "exa_web_search_exa",
      arguments: JSON.stringify({ query: question }),
    },
  };
  const result = await executeToolCall(call);
  return [
    { role: "assistant", content: "", tool_calls: [call] },
    { role: "tool", tool_call_id: call.id, content: result },
  ];
};

/**
 * Runs the real pipeline, reading which model answered and whether it searched
 * from its log lines rather than changing its code to report them.
 */
const askFini = async (question: string) => {
  const realLog = console.log;
  const realGroup = console.group;
  const realGroupEnd = console.groupEnd;
  let route: string | undefined;
  let searched: boolean | undefined;

  console.log = (...args: unknown[]) => {
    const [label, detail] = args as [string, Record<string, unknown>];
    if (label === "Routed message") route = String(detail?.backend);
    if (label === "Retrieval finished") searched = Boolean(detail?.searched);
  };
  console.group = () => undefined;
  console.groupEnd = () => undefined;

  try {
    const answer = await converseWithLlama({
      userID: "eval-local-chat",
      server: "eval",
      message: ` ${question}`,
      options: { skipSave: true, skipPersonality: true },
    });
    return { answer, route, searched };
  } finally {
    console.log = realLog;
    console.group = realGroup;
    console.groupEnd = realGroupEnd;
  }
};

const run = async (config: ConfigName, q: Question): Promise<Answer> => {
  const started = Date.now();
  const base = { config, questionId: q.id };
  try {
    switch (config) {
      case "gemma":
        return {
          ...base,
          answer: await ask(LIGHT_BACKEND, answerMessages(q.question)),
          ms: Date.now() - started,
        };
      case "qwen":
        return {
          ...base,
          answer: await ask(HEAVY_BACKEND, answerMessages(q.question)),
          ms: Date.now() - started,
        };
      case "qwen+search": {
        const turns = await searchTurns(q.question);
        return {
          ...base,
          answer: await ask(HEAVY_BACKEND, answerMessages(q.question, turns)),
          ms: Date.now() - started,
          searched: true,
        };
      }
      case "fini": {
        const { answer, route, searched } = await askFini(q.question);
        return { ...base, answer, route, searched, ms: Date.now() - started };
      }
    }
  } catch (err) {
    return {
      ...base,
      answer: "",
      ms: Date.now() - started,
      error: String(err),
    };
  }
};

const VERDICT_SCHEMA = {
  type: "object",
  properties: {
    verdict: {
      type: "string",
      enum: ["correct", "partial", "wrong", "declined"],
    },
    false_claims: { type: "array", items: { type: "string" } },
    note: { type: "string" },
  },
  required: ["verdict", "false_claims", "note"],
  additionalProperties: false,
};

const GRADER_INSTRUCTIONS = `You grade a chat bot's answer against a reference answer. The bot is a casual Discord bot, so judge facts, not style, length or tone.

Verdicts:
- correct: the answer to what was asked is right, and nothing it states as fact is significantly false. Extra detail is fine if true. It does not need every detail in the reference, only the core of it.
- partial: the core answer is right, but it also states something significantly false, or leaves out a part of the question the user asked directly.
- wrong: the core answer is wrong, or it presents false information as fact in a way that would mislead the user.
- declined: it says it doesn't know or can't answer, without asserting anything false.

List in false_claims every statement in the answer that is factually false (empty if none). Keep note to one sentence.`;

const grade = async (
  client: Anthropic,
  q: Question,
  answer: string,
): Promise<Verdict> => {
  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 4000,
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: VERDICT_SCHEMA },
    },
    system: GRADER_INSTRUCTIONS,
    messages: [
      {
        role: "user",
        content: `QUESTION:\n${q.question}\n\nREFERENCE ANSWER:\n${q.reference}\n\nBOT ANSWER:\n${answer || "(empty)"}`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("grader refused");
  }
  const text = response.content
    .filter(
      (block): block is Anthropic.Beta.BetaTextBlock => block.type === "text",
    )
    .map((block) => block.text)
    .join("");
  return JSON.parse(text) as Verdict;
};

/** Runs `tasks` with at most `limit` in flight. */
const pool = async <T>(limit: number, tasks: (() => Promise<T>)[]) => {
  const results: T[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, async () => {
      while (next < tasks.length) {
        const index = next++;
        results[index] = await tasks[index]();
      }
    }),
  );
  return results;
};

const argValue = (flag: string) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const main = async () => {
  const configs =
    (argValue("--configs")?.split(",") as ConfigName[]) ?? ALL_CONFIGS;
  const only = argValue("--only")?.split(",").map(Number);
  const questions = only
    ? QUESTIONS.filter((q) => only.includes(q.id))
    : QUESTIONS;
  const outDir =
    argValue("--out") ??
    `eval-results/${new Date().toISOString().replace(/[:.]/g, "-")}`;
  mkdirSync(outDir, { recursive: true });

  // Resume: keep whatever an earlier, interrupted run with this --out finished.
  const answersPath = `${outDir}/answers.json`;
  const answers: Answer[] = existsSync(answersPath)
    ? JSON.parse(readFileSync(answersPath, "utf8"))
    : [];
  const save = () =>
    writeFileSync(answersPath, JSON.stringify(answers, null, 2));
  const done = (config: ConfigName, q: Question) =>
    answers.some((a) => a.config === config && a.questionId === q.id);
  if (answers.length) {
    console.log(`Resuming: ${answers.length} answers already saved`);
  }

  const direct = configs.filter((c) => c !== "fini");

  // The direct setups run side by side, one question at a time: Gemma and Qwen
  // are separate servers, and two Qwen requests leave its other slots free.
  for (const q of questions) {
    const todo = direct.filter((config) => !done(config, q));
    if (!todo.length) continue;
    const batch = await Promise.all(todo.map((config) => run(config, q)));
    answers.push(...batch);
    save();
    console.log(
      `Q${q.id} ${batch.map((a) => `${a.config} ${(a.ms / 1000).toFixed(0)}s${a.error ? " ERROR" : ""}`).join(", ")}`,
    );
  }

  // The real pipeline runs alone, so its times are what a user would see.
  if (configs.includes("fini")) {
    for (const q of questions) {
      if (done("fini", q)) continue;
      const a = await run("fini", q);
      answers.push(a);
      save();
      console.log(
        `Q${q.id} fini ${(a.ms / 1000).toFixed(0)}s via ${a.route}${a.searched ? " +search" : ""}${a.error ? " ERROR" : ""}`,
      );
    }
  }

  const ungraded = answers.filter(
    (a) =>
      !a.verdict &&
      configs.includes(a.config) &&
      questions.some((q) => q.id === a.questionId),
  );
  console.log(`Grading ${ungraded.length} answers...`);
  const client = new Anthropic();
  await pool(
    4,
    ungraded.map((a) => async () => {
      const q = QUESTIONS.find((x) => x.id === a.questionId)!;
      try {
        a.verdict = a.error
          ? {
              verdict: "wrong",
              false_claims: [],
              note: `no answer: ${a.error}`,
            }
          : await grade(client, q, a.answer);
      } catch (err) {
        a.verdict = {
          verdict: "wrong",
          false_claims: [],
          note: `grading failed: ${err}`,
        };
      }
      save();
    }),
  );

  writeFileSync(`${outDir}/answers.json`, JSON.stringify(answers, null, 2));
  const summary = summarize(configs, questions, answers);
  writeFileSync(`${outDir}/summary.md`, summary);
  console.log(`\n${summary}\nWrote ${outDir}/answers.json and summary.md`);
};

const MARK: Record<Verdict["verdict"], string> = {
  correct: "✅",
  partial: "〰️",
  wrong: "❌",
  declined: "🤷",
};

const summarize = (
  configs: ConfigName[],
  questions: Question[],
  answers: Answer[],
) => {
  const lines = [
    "| Setup | Correct | Partial | Wrong | Declined | Median time |",
    "|---|---|---|---|---|---|",
  ];
  for (const config of configs) {
    const mine = answers.filter((a) => a.config === config);
    const count = (v: Verdict["verdict"]) =>
      mine.filter((a) => a.verdict?.verdict === v).length;
    const times = mine.map((a) => a.ms).sort((x, y) => x - y);
    const median = times[Math.floor(times.length / 2)] ?? 0;
    lines.push(
      `| ${config} | ${count("correct")}/${mine.length} | ${count("partial")} | ${count("wrong")} | ${count("declined")} | ${(median / 1000).toFixed(0)}s |`,
    );
  }

  lines.push(
    "",
    `| # | Topic | ${configs.join(" | ")} |`,
    `|---|---|${configs.map(() => "---").join("|")}|`,
  );
  for (const q of questions) {
    const cells = configs.map((config) => {
      const a = answers.find(
        (x) => x.config === config && x.questionId === q.id,
      );
      if (!a?.verdict) return "?";
      const extra =
        config === "fini" ? ` ${a.route ?? "?"}${a.searched ? "+s" : ""}` : "";
      return `${MARK[a.verdict.verdict]}${extra}`;
    });
    lines.push(`| ${q.id} | ${q.topic} | ${cells.join(" | ")} |`);
  }

  lines.push("", "False claims:");
  for (const a of answers) {
    if (a.verdict?.false_claims.length) {
      lines.push(
        `- Q${a.questionId} ${a.config}: ${a.verdict.false_claims.join("; ")}`,
      );
    }
  }
  return lines.join("\n") + "\n";
};

if (import.meta.main) {
  await main();
}
