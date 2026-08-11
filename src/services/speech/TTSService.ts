import * as Speech from 'expo-speech';

const CHUNK_MAX = 900;

//app language codes -> tts locale
const LOCALES: Record<string, string> = {
  en: 'en-US',
  fr: 'fr-FR',
  de: 'de-DE',
  es: 'es-ES',
  it: 'it-IT',
  pt: 'pt-PT',
  nl: 'nl-NL',
  ru: 'ru-RU',
  zh: 'zh-CN',
  ja: 'ja-JP',
  ko: 'ko-KR',
  ar: 'ar-SA',
  he: 'he-IL',
  hi: 'hi-IN',
  th: 'th-TH',
  el: 'el-GR',
};

//common stopwords for latin-language scoring
const STOPWORDS: Record<string, string[]> = {
  en: ['the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'from', 'by', 'that', 'this', 'it', 'he', 'she', 'they', 'we', 'you', 'i', 'not', 'as', 'have', 'has', 'do', 'does', 'did', 'what', 'which', 'will', 'would', 'can', 'could'],
  fr: ['le', 'la', 'les', 'un', 'une', 'des', 'et', 'est', 'que', 'qui', 'pour', 'dans', 'de', 'du', 'au', 'aux', 'je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles', 'ne', 'pas', 'plus', 'avec', 'sur', 'se', 'ce', 'cette', 'son', 'sa', 'ses', 'mais', 'ou', 'où', 'par'],
  es: ['el', 'la', 'los', 'las', 'un', 'una', 'y', 'o', 'es', 'son', 'fue', 'de', 'en', 'para', 'con', 'por', 'que', 'como', 'del', 'al', 'se', 'su', 'sus', 'no', 'si', 'pero', 'más', 'este', 'esta', 'ser', 'hay'],
  de: ['der', 'die', 'das', 'ein', 'eine', 'und', 'oder', 'aber', 'ist', 'sind', 'war', 'waren', 'von', 'zu', 'für', 'mit', 'auf', 'bei', 'aus', 'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'nicht', 'den', 'dem', 'einem', 'einer', 'zum', 'zur'],
  it: ['il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'una', 'e', 'o', 'è', 'sono', 'era', 'di', 'a', 'in', 'per', 'con', 'da', 'che', 'come', 'del', 'al', 'se', 'non', 'si', 'ma', 'più', 'questo', 'questa'],
  pt: ['o', 'a', 'os', 'as', 'um', 'uma', 'e', 'ou', 'é', 'são', 'foi', 'de', 'em', 'para', 'com', 'por', 'que', 'como', 'do', 'da', 'no', 'na', 'se', 'não', 'mas', 'mais', 'este', 'esta', 'ser'],
  nl: ['de', 'het', 'een', 'en', 'of', 'maar', 'is', 'zijn', 'was', 'waren', 'van', 'te', 'voor', 'met', 'op', 'bij', 'ik', 'jij', 'hij', 'zij', 'wij', 'niet', 'dat', 'die', 'dan', 'ook', 'als'],
};

class TextToSpeechService {
  private generation = 0;
  private speaking = false;
  private speakingId: string | null = null;
  private listeners = new Set<() => void>();

  isSpeaking(): boolean {
    return this.speaking;
  }

  //id passed to the current speak() call, lets ui know which item is playing regardless of who triggered it
  getSpeakingId(): string | null {
    return this.speakingId;
  }

  //notified whenever speakingId changes (start, stop, or natural end)
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
  }

  //read text aloud
  async speak(text: string, options?: { onDone?: () => void; language?: string; id?: string }): Promise<void> {
    const clean = this.cleanText(text);
    if (!clean || clean === '…') {
      options?.onDone?.();
      return;
    }

    //cancel any current speech
    const gen = ++this.generation;
    try {
      Speech.stop();
    } catch (e) {
      console.warn('TTS stop error:', e);
    }
    this.speaking = true;
    this.speakingId = options?.id ?? null;
    this.notify();

    const lang = this.detectLanguage(clean) || options?.language || 'en';
    const locale = LOCALES[lang] || (/^[a-z]{2,3}(-[a-z0-9]{2,4})?$/i.test(lang) ? lang : 'en-US');
    const chunks = this.chunkText(clean);

    for (let i = 0; i < chunks.length; i++) {
      if (gen !== this.generation) break;
      await new Promise<void>((resolve) => {
        try {
          Speech.speak(chunks[i], {
            language: locale,
            rate: 1.0,
            pitch: 1.05,
            onDone: () => resolve(),
            onStopped: () => resolve(),
            onError: () => resolve(),
          });
        } catch (e) {
          console.warn('TTS speak error:', e);
          resolve();
        }
      });
    }

    if (gen === this.generation) {
      this.speaking = false;
      this.speakingId = null;
      this.notify();
    }
    options?.onDone?.();
  }

  //interrupt current speech
  stop(): void {
    this.generation++;
    this.speaking = false;
    this.speakingId = null;
    try {
      Speech.stop();
    } catch (e) {
      console.warn('TTS stop error:', e);
    }
    this.notify();
  }

  //remove markdown and think blocks before speaking
  private cleanText(text: string): string {
    let t = text
      .replace(/<think>[\s\S]*?<\/think>/g, ' ')
      .replace(/<think>[\s\S]*$/g, ' ')
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
      .replace(/[*_~`#>|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return t;
  }

  //detect text language
  private detectLanguage(text: string): string {
    const sample = text.slice(0, 500);
    if (/[\u4E00-\u9FFF\u3400-\u4DBF]/.test(sample)) return 'zh';
    if (/[\u3040-\u309F\u30A0-\u30FF]/.test(sample)) return 'ja';
    if (/[\uAC00-\uD7AF]/.test(sample)) return 'ko';
    if (/[\u0400-\u04FF]/.test(sample)) return 'ru';
    if (/[\u0600-\u06FF]/.test(sample)) return 'ar';
    if (/[\u0590-\u05FF]/.test(sample)) return 'he';
    if (/[\u0900-\u097F]/.test(sample)) return 'hi';
    if (/[\u0E00-\u0E7F]/.test(sample)) return 'th';
    if (/[\u0370-\u03FF]/.test(sample)) return 'el';

    const words = sample.toLowerCase().match(/[a-zà-ÿ'-]+/g) || [];
    let best = { lang: '', score: 0 };
    for (const [lang, stopwords] of Object.entries(STOPWORDS)) {
      let score = 0;
      for (const w of words) {
        if (stopwords.includes(w)) score++;
      }
      if (score > best.score) best = { lang, score };
    }
    return best.score >= 3 ? best.lang : '';
  }

  //split long text for platform limits
  private chunkText(text: string): string[] {
    const sentences = text.split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean);
    const chunks: string[] = [];
    let current = '';
    for (const sentence of sentences) {
      if (current && (current + ' ' + sentence).length > CHUNK_MAX) {
        chunks.push(current);
        current = sentence;
      } else {
        current = current ? current + ' ' + sentence : sentence;
      }
    }
    if (current) chunks.push(current);
    return chunks;
  }
}

export const TTS = new TextToSpeechService();
