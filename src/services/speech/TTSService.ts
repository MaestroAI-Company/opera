import * as Speech from 'expo-speech';
import { deriveChatDisplay } from '../../components/ui/MarkdownText';
import { INTERRUPTED_MARKER } from '../ai/generation/chatGeneration';
import { Settings } from '../settings/SettingsService';
import { AudioPlayback, createPlayback, prepareAudio } from './AudioPlayback';
import { activate, getSpeed, getVoice, NEURAL_ENGINES } from './engines';
import { SynthesisOptions } from './NeuralEngine';
import { SentenceQueue } from './SentenceQueue';
import { VoicePack } from './VoicePack';

const CHUNK_MAX = 900;
//short head starts audio sooner
const FIRST_CHUNK_MIN = 20;

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

type SpeakOptions = { onDone?: () => void; language?: string; id?: string };

//handle fed by a streaming reply
export type LiveSpeech = {
  update(text: string): void;
  finish(text: string): void;
  cancel(): void;
};

class TextToSpeechService {
  private generation = 0;
  private speaking = false;
  private speakingId: string | null = null;
  private playback: AudioPlayback | null = null;
  private queue: SentenceQueue | null = null;
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
  async speak(text: string, options?: SpeakOptions): Promise<void> {
    const clean = this.cleanText(text);
    if (!clean || clean === '…') {
      options?.onDone?.();
      return;
    }
    const queue = new SentenceQueue();
    queue.push(this.splitSentences(clean));
    queue.close();
    await this.play(queue, options);
  }

  //read a reply while it streams
  speakLive(options?: SpeakOptions): LiveSpeech {
    const queue = new SentenceQueue();
    let taken = 0;
    const feed = (text: string, final: boolean) => {
      const sentences = this.splitSentences(this.cleanText(text));
      //last sentence may still grow
      const ready = final ? sentences.length : sentences.length - 1;
      if (ready > taken) {
        queue.push(sentences.slice(taken, ready));
        taken = ready;
      }
    };
    this.preload(options?.language);
    this.play(queue, options);
    return {
      update: (text) => feed(text, false),
      finish: (text) => {
        feed(text, true);
        queue.close();
      },
      cancel: () => {
        if (this.queue === queue) this.stop();
        queue.close();
      },
    };
  }

  //load the voice while generating
  private preload(language?: string): void {
    const engineId = Settings.getCached().ttsEngine;
    const engine = NEURAL_ENGINES[engineId];
    const lang = language || 'en';
    if (!engine?.supports(lang) || !engine.isInstalled()) return;
    activate(engineId)
      .then(() => {
        prepareAudio(engine.sampleRate);
        return engine.preload(lang, getVoice(engineId));
      })
      .catch((e) => console.warn('Neural TTS preload error:', e));
  }

  private async play(queue: SentenceQueue, options?: SpeakOptions): Promise<void> {
    //cancel any current speech
    const gen = ++this.generation;
    this.queue?.close();
    this.queue = queue;
    this.playback?.stop();
    this.playback = null;
    try {
      Speech.stop();
    } catch (e) {
      console.warn('TTS stop error:', e);
    }
    this.speaking = true;
    this.speakingId = options?.id ?? null;
    this.notify();

    //user picks a voice first
    await VoicePack.ask();
    //language needs the first sentences
    const head = await queue.peek();
    if (gen === this.generation && head.length > 0) {
      const lang = this.detectLanguage(head.join(' ')) || options?.language || 'en';
      const locale = LOCALES[lang] || (/^[a-z]{2,3}(-[a-z0-9]{2,4})?$/i.test(lang) ? lang : 'en-US');
      const engineId = Settings.getCached().ttsEngine;
      const engine = NEURAL_ENGINES[engineId];
      const speed = getSpeed();
      if (engine?.supports(lang) && engine.isInstalled()) {
        await this.speakNeural(engineId, queue, lang, gen, { voice: getVoice(engineId), speed });
      }
      //system voice takes what neural left
      await this.speakSystem(queue, locale, speed, gen);
    }

    if (gen === this.generation) {
      this.speaking = false;
      this.speakingId = null;
      this.queue = null;
      this.notify();
    }
    options?.onDone?.();
  }

  private async speakSystem(queue: SentenceQueue, locale: string, rate: number, gen: number): Promise<void> {
    while (gen === this.generation) {
      const chunks = this.mergeSentences(await queue.drain(), CHUNK_MAX);
      if (chunks.length === 0) break;
      for (const chunk of chunks) {
        if (gen !== this.generation) break;
        await new Promise<void>((resolve) => {
          try {
            Speech.speak(chunk, {
              language: locale,
              rate,
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
    }
  }

  //failed sentences go back
  private async speakNeural(engineId: string, queue: SentenceQueue, lang: string, gen: number, options: SynthesisOptions): Promise<void> {
    const start = performance.now();
    const engine = await activate(engineId);
    if (gen !== this.generation) return;
    let playback: AudioPlayback;
    try {
      playback = createPlayback(engine.sampleRate);
    } catch (e) {
      console.warn('Neural TTS playback error:', e);
      return;
    }
    this.playback = playback;

    let first = true;
    //neural has no per chunk pause
    for (let sentence = await queue.next(); sentence !== null; sentence = await queue.next()) {
      if (gen !== this.generation) break;
      if (first) sentence = this.splitHead(sentence, queue);
      try {
        //synthesis overlaps the chunk already playing
        const samples = await engine.synthesize(sentence, lang, options);
        if (gen !== this.generation) break;
        if (first) console.log(`[TTS:${engineId}] first audio after ${Math.round(performance.now() - start)}ms`);
        first = false;
        playback.enqueue(samples);
      } catch (e) {
        console.warn('Neural TTS synthesis error:', e);
        queue.unshift(sentence);
        break;
      }
    }
    await playback.finish();
    if (this.playback === playback) this.playback = null;
  }

  private splitHead(sentence: string, queue: SentenceQueue): string {
    const cut = sentence.indexOf(', ', FIRST_CHUNK_MIN);
    if (cut < 0 || sentence.length - cut < FIRST_CHUNK_MIN) return sentence;
    queue.unshift(sentence.slice(cut + 2));
    return sentence.slice(0, cut + 1);
  }

  //interrupt current speech
  stop(): void {
    this.generation++;
    this.speaking = false;
    this.speakingId = null;
    this.queue?.close();
    this.queue = null;
    this.playback?.stop();
    this.playback = null;
    try {
      Speech.stop();
    } catch (e) {
      console.warn('TTS stop error:', e);
    }
    this.notify();
  }

  //only what a listener should hear
  private cleanText(text: string): string {
    //same parsing as the bubble
    const { finalContent } = deriveChatDisplay(text.split(INTERRUPTED_MARKER).join(''), true, null);
    return finalContent
      //code and widgets are visual
      .replace(/```[\s\S]*?(?:```|$)/g, '\n')
      .replace(/\$\$[\s\S]*?(?:\$\$|$)/g, '\n')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/<\/?[a-z][^>]*>/gi, ' ')
      //table rules and list markers
      .replace(/^[ \t|:-]*-{3,}[ \t|:-]*$/gm, '')
      .replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/gm, '')
      .replace(/[*_~`#>|]/g, ' ')
      //titles and items need a stop
      .replace(/([^.!?…:;,\s])[ \t]*\n+/g, '$1.\n')
      .replace(/\s+/g, ' ')
      .trim();
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

  private splitSentences(text: string): string[] {
    //punctuation alone is not speech
    return text.split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter((s) => /[\p{L}\p{N}]/u.test(s));
  }

  //platform caps the chunk length
  private mergeSentences(sentences: string[], max: number): string[] {
    const chunks: string[] = [];
    let current = '';
    for (const sentence of sentences) {
      if (current && (current + ' ' + sentence).length > max) {
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
