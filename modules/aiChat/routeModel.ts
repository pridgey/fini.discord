import { HEAVY_BACKEND, ROUTER_API_URL } from "./llamaConfig";

/**
 * Picks which local model answers a message: Gemma for everyday chat, or the
 * bigger Qwen for questions that need real knowledge.
 *
 * The decision comes from Kev-0.8B, a "decision model": given a message and a
 * multiple-choice question it returns a probability per option in one pass,
 * without writing any text. On the CPU it takes about half a second.
 *
 * Measured on 24 messages (16 used while designing this, 8 held back), Kev on
 * its own picked the right tier 23 times. Gemma asked the same question as a
 * forced one-word answer did as well, but took about 1.3 seconds and gives no
 * probability to set a threshold on.
 */

export type Tier = "light" | "heavy";

export type RouteDecision = {
  tier: Tier;
  /** Kev's probability that the message, read on its own, needs the big model. */
  pHeavy?: number;
  /** Kev's probability that the message continues the previous answer. */
  pFollowUp?: number;
  /** Why this tier was picked, for the logs. */
  reason: string;
};

/** The previous turn, so a follow-up like "continue" stays on the same model. */
export type PreviousExchange = { asked: string; answered: string };

/**
 * How likely "heavy" has to be, on the message alone, to use the big model.
 *
 * Below a coin flip on purpose. Sending a light message to Qwen costs little -
 * on the GPU it answers about as fast as Gemma does on the CPU - while sending
 * a hard question to Gemma gets a wrong answer. At 0.4, the misses in testing
 * were all borderline cooking questions going to Qwen; the one hard question
 * missed at 0.5 (a long "how many genin could they defeat" battle analysis, at
 * 0.41) is caught.
 */
export const HEAVY_THRESHOLD = 0.4;

/**
 * How likely a message has to be to continue the previous answer, for it to
 * stay with the big model that wrote that answer.
 *
 * This is what keeps "continue" after a long music-theory answer from being
 * finished by Gemma: on its own "continue" is plainly light. Measured against
 * real previous exchanges, follow-ups ("continue", "tell me more about number
 * 3", "what about antarctica?") scored 56-84% and everything else (thanks,
 * goodbyes, reactions, new questions) 31-53%. The bar sits in the gap, which is
 * narrow, so it only ever applies after the big model answered - a mistake can
 * keep a conversation on the big model one message too long, but never move a
 * light conversation onto it.
 */
export const FOLLOW_UP_THRESHOLD = 0.55;

/** The decision should never be what makes Fini slow. */
const ROUTER_TIMEOUT_MS = 3_000;

/** How long to wait to find out whether the big model is free. */
const HEAVY_STATUS_TIMEOUT_MS = 1_000;

/** How much of the previous answer Kev is shown - enough to know its topic. */
const PREVIOUS_ANSWER_CHARS = 300;

const LIGHT_CRITERIA =
  'small talk, greetings, thanks, jokes, opinions, simple everyday or cooking questions, simple arithmetic, "continue" or rewording requests';
const HEAVY_CRITERIA =
  "needs precise specialized knowledge (music theory, science, medicine, law, finance, history details, programming), multi-step reasoning, careful analysis, or a long structured answer";

/** Which model answered each user's last message, so follow-ups can stay with it. */
const lastTier = new Map<string, Tier>();

/**
 * Remembers which model answered, for the next message's follow-up check.
 *
 * Kept in memory only: after a restart the first follow-up is judged on its
 * own, which at worst sends one "continue" to Gemma.
 * @param conversationKey Identifies the user's conversation
 * @param tier The model that answered
 */
export const rememberTier = (conversationKey: string, tier: Tier) => {
  lastTier.set(conversationKey, tier);
};

/**
 * Applies the two thresholds. Kept apart from the network calls so the rule
 * can be tested on its own.
 * @param pHeavy Probability of heavy for the message alone
 * @param pFollowUp Probability the message continues the previous answer;
 *   only measured when the big model wrote that answer
 * @returns The tier, and which check decided it
 */
export const decideTier = (
  pHeavy: number,
  pFollowUp?: number,
): { tier: Tier; reason: string } => {
  if (pHeavy >= HEAVY_THRESHOLD) {
    return { tier: "heavy", reason: "message needs the bigger model" };
  }
  if (pFollowUp !== undefined && pFollowUp >= FOLLOW_UP_THRESHOLD) {
    return { tier: "heavy", reason: "follow-up to the bigger model's answer" };
  }
  return { tier: "light", reason: "everyday message" };
};

/**
 * Asks Kev one multiple-choice question and returns one option's probability.
 * @param state What Kev reads
 * @param question The question, in /v1/systemone's choice format
 * @param option Which option's probability to return
 */
const askRouter = async (
  state: Record<string, unknown>,
  question: { instructions: string; criteria: Record<string, string> },
  option: string,
): Promise<number> => {
  const response = await fetch(`${ROUTER_API_URL}/v1/systemone`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      state,
      questions: { q: { type: "choice", ...question } },
    }),
    signal: AbortSignal.timeout(ROUTER_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`router responded ${response.status}`);
  }

  const result = (await response.json()) as {
    answers?: { q?: { probabilities?: Record<string, number> } };
  };
  const probability = result.answers?.q?.probabilities?.[option];

  if (typeof probability !== "number") {
    throw new Error(`router response had no probability for ${option}`);
  }

  return probability;
};

/** Does the message itself need the big model? */
const NEEDS_HEAVY = {
  instructions: "Which kind of model should answer this chat message?",
  criteria: { light: LIGHT_CRITERIA, heavy: HEAVY_CRITERIA },
};

/** Is the message carrying on from the previous answer? */
const CONTINUES_PREVIOUS = {
  instructions: "How does the latest message relate to the previous exchange?",
  criteria: {
    continues:
      "asks to continue, expand on, or ask about the content of the previous answer",
    new: "a new question or topic, small talk, greetings, thanks or a reaction",
  },
};

/**
 * Decides which model should answer a message.
 *
 * Never throws: if the router is down, the message goes to Gemma, which is
 * what every message did before routing existed.
 * @param message What the user just said
 * @param conversationKey Identifies the conversation, for the follow-up check
 * @param previous The last exchange, if there was one
 * @param hasImage Whether an image is attached. Gemma's image support is
 *   tested; the big model's isn't, so pictures always go to Gemma.
 */
export const routeMessage = async (
  message: string,
  conversationKey: string,
  previous?: PreviousExchange,
  hasImage = false,
): Promise<RouteDecision> => {
  if (hasImage) {
    return { tier: "light", reason: "image attached" };
  }

  // Follow-ups only matter when the big model wrote the answer being followed.
  const checkFollowUp = previous && lastTier.get(conversationKey) === "heavy";

  try {
    // Both at once: each is about half a second, so in parallel the decision
    // costs one of them.
    const [pHeavy, pFollowUp] = await Promise.all([
      askRouter({ message }, NEEDS_HEAVY, "heavy"),
      checkFollowUp
        ? askRouter(
            {
              latest_message: message,
              previous_exchange: {
                asked: previous.asked,
                answered:
                  previous.answered.length > PREVIOUS_ANSWER_CHARS
                    ? `${previous.answered.slice(0, PREVIOUS_ANSWER_CHARS)}...`
                    : previous.answered,
              },
            },
            CONTINUES_PREVIOUS,
            "continues",
          )
        : Promise.resolve(undefined),
    ]);

    return { ...decideTier(pHeavy, pFollowUp), pHeavy, pFollowUp };
  } catch (err) {
    console.error("Model router unavailable, using the light model:", err);
    return { tier: "light", reason: "router unavailable" };
  }
};

/**
 * Whether the big model can take a request right now.
 *
 * It's a shared server, also used for coding, so "up" isn't enough: if every
 * slot is busy, a chat message would queue behind someone else's work. In that
 * case Gemma answers instead.
 * @returns Whether the big model is up and has a free slot
 */
export const isHeavyAvailable = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${HEAVY_BACKEND.url}/slots`, {
      headers: HEAVY_BACKEND.apiKey
        ? { Authorization: `Bearer ${HEAVY_BACKEND.apiKey}` }
        : {},
      signal: AbortSignal.timeout(HEAVY_STATUS_TIMEOUT_MS),
    });

    // Some servers turn the slots endpoint off; then "up" is all we can know.
    if (response.status === 404 || response.status === 501) {
      const health = await fetch(`${HEAVY_BACKEND.url}/health`, {
        signal: AbortSignal.timeout(HEAVY_STATUS_TIMEOUT_MS),
      });
      return health.ok;
    }

    if (!response.ok) return false;

    const slots = (await response.json()) as { is_processing?: boolean }[];
    return slots.some((slot) => !slot.is_processing);
  } catch {
    return false;
  }
};
