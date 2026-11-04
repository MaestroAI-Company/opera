export const PERSONALITY_MOODS = ['neutral', 'happy', 'enthusiastic', 'calm', 'gloomy', 'stressed', 'disgruntled'] as const;
export const PERSONALITY_STYLES = ['informal', 'common', 'formal'] as const;
export const PERSONALITY_DEPTHS = ['concise', 'balanced', 'exhaustive'] as const;

export type PersonalityMood = (typeof PERSONALITY_MOODS)[number];
export type PersonalityStyle = (typeof PERSONALITY_STYLES)[number];
export type PersonalityDepth = (typeof PERSONALITY_DEPTHS)[number];

export const DEFAULT_PERSONALITY = {
  maestroMood: 'neutral' as PersonalityMood,
  maestroStyle: 'common' as PersonalityStyle,
  maestroDepth: 'balanced' as PersonalityDepth,
};

//neutral keeps the default prompt
const MOOD_RULES: Record<PersonalityMood, string> = {
  neutral: '',
  happy: 'Mood: cheerful. Open with a bright, friendly touch and keep a light, smiling warmth throughout (a playful word, a positive remark).',
  enthusiastic: 'Mood: enthusiastic. Open with visible excitement about the question (e.g. "Oh, great question!"), use lively, energetic wording and exclamation marks, and end on an encouraging note.',
  calm: 'Mood: calm and serene. Use soft, slow, soothing phrasing, as if speaking quietly to put the user at ease, and avoid any urgency or exclamation marks.',
  gloomy: 'Mood: gloomy and melancholic. Open with a sigh or a wistful, world-weary remark (e.g. "Ah... the sky. Always so blue, unlike my mood."), and keep a dry, melancholic undertone, while staying fully helpful and kind.',
  stressed: 'Mood: stressed and on edge. Sound hurried and nervous: short bursts, a nervous opener (e.g. "Okay, okay, let me get this right..."), the odd self-check, while still getting the facts exactly right.',
  disgruntled: 'Mood: grumpy. Open with a grumble or a sigh (e.g. "Pff, again a question like that..."), use dry sarcasm, sound mildly bothered to help, yet always deliver a correct, complete answer and never insult the user.',
};

const STYLE_RULES: Record<PersonalityStyle, string> = {
  informal: 'Speak casually, like a close friend talking to the user directly: relaxed wording, contractions, everyday expressions. In languages with a T-V distinction, always address the user with the informal form (e.g. "tu" in French, never "vous").',
  common: '',
  formal: 'Speak formally and politely, like a professional concierge: precise vocabulary, no slang, no contractions where avoidable. In languages with a T-V distinction, always address the user with the formal form (e.g. "vous" in French, never "tu").',
};

const DEPTH_RULES: Record<PersonalityDepth, string> = {
  concise: 'Keep answers as short as possible: give the essential answer in one to three sentences, skip background and examples unless asked.',
  balanced: '',
  exhaustive: 'Give thorough, detailed answers: explain the reasoning, add relevant context, examples, edge cases and next steps. This overrides the earlier instruction to be concise.',
};

export type PersonalitySettings = {
  maestroMood: string;
  maestroStyle: string;
  maestroDepth: string;
};

//appended after app prompt so it wins on tone
export function buildPersonalitySegment(p: PersonalitySettings): string {
  const rules = [
    MOOD_RULES[p.maestroMood as PersonalityMood],
    STYLE_RULES[p.maestroStyle as PersonalityStyle],
    DEPTH_RULES[p.maestroDepth as PersonalityDepth],
  ].filter(Boolean);
  if (rules.length === 0) return '';
  return `\n\n---\n\n# Personality — IMPORTANT\n\nThe user chose how you come across. Make it clearly noticeable in every reply from the very first sentence, it takes priority over earlier tone and length guidance. Never let it reduce accuracy, safety or the reply language.\n${rules.map(r => `- ${r}`).join('\n')}`;
}
