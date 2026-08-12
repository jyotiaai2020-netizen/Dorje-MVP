import type { LocalVoice } from '@/lib/studentStore';

export type KamalVoiceProfile = {
  label: string;
  description: string;
  sample: string;
  rate: number;
  pitch: number;
  preferredNames: string[];
};

type KamalSpeechMood = 'neutral' | 'warm' | 'concerned' | 'confirmed' | 'cautious' | 'guided';

export const KAMAL_VOICE_PROFILES: Record<LocalVoice, KamalVoiceProfile> = {
  Maya: {
    label: 'Maya',
    description: 'Mature woman voice — warm, steady, and clear.',
    sample: 'Hi, I am Kamal with the Maya voice. I will guide you calmly through Student-LAD.',
    rate: 0.9,
    pitch: 0.95,
    preferredNames: ['Samantha', 'Victoria', 'Karen', 'Moira', 'Tessa', 'Google US English'],
  },
  River: {
    label: 'River',
    description: 'Mature man voice — grounded, slower, and focused.',
    sample: 'Hi, I am Kamal with the River voice. I will keep guidance focused and steady.',
    rate: 0.86,
    pitch: 0.78,
    preferredNames: ['Alex', 'Daniel', 'Oliver', 'Google UK English Male', 'Microsoft David'],
  },
  Asha: {
    label: 'Asha',
    description: 'Young woman voice — bright, encouraging, and energetic.',
    sample: 'Hi, I am Kamal with the Asha voice. I will make your workflow feel lighter and clear.',
    rate: 1.03,
    pitch: 1.18,
    preferredNames: ['Veena', 'Samantha', 'Google UK English Female', 'Microsoft Zira'],
  },
  Noah: {
    label: 'Noah',
    description: 'Young man voice — concise, quick, and practical.',
    sample: 'Hi, I am Kamal with the Noah voice. I will help you move quickly through the app.',
    rate: 1.06,
    pitch: 0.9,
    preferredNames: ['Tom', 'Fred', 'Aaron', 'Microsoft Mark', 'Google US English'],
  },
};

export function selectKamalSpeechVoice(voices: SpeechSynthesisVoice[], selectedVoice: LocalVoice) {
  const profile = KAMAL_VOICE_PROFILES[selectedVoice];
  return profile.preferredNames
    .map((name) => voices.find((candidate) => candidate.name.toLowerCase().includes(name.toLowerCase())))
    .find(Boolean)
    || voices.find((candidate) => candidate.lang.toLowerCase() === 'en-us')
    || voices.find((candidate) => candidate.lang.toLowerCase().startsWith('en'));
}

function inferKamalSpeechMood(text: string): KamalSpeechMood {
  const lower = text.toLowerCase();
  if (/\b(error|failed|blocked|unable|cannot|can't|not allowed|problem|issue)\b/.test(lower)) return 'concerned';
  if (/\b(confirm|confirmed|completed|created|saved|done|ready)\b/.test(lower)) return 'confirmed';
  if (/\b(sensitive|privacy|permission|approval|legal|immigration|verify|warning)\b/.test(lower)) return 'cautious';
  if (/\b(opening|guiding|tour|next|previous|choose|select|navigate)\b/.test(lower)) return 'guided';
  if (/\b(hi|hello|good morning|good afternoon|good evening|welcome)\b/.test(lower)) return 'warm';
  return 'neutral';
}

function emotionalVoiceAdjustment(mood: KamalSpeechMood) {
  return ({
    neutral: { rate: 1, pitch: 1, volume: 1 },
    warm: { rate: 0.96, pitch: 1.04, volume: 1 },
    concerned: { rate: 0.88, pitch: 0.96, volume: 1 },
    confirmed: { rate: 0.98, pitch: 1.06, volume: 1 },
    cautious: { rate: 0.86, pitch: 0.94, volume: 0.96 },
    guided: { rate: 0.92, pitch: 1.02, volume: 1 },
  } as const)[mood];
}

function humanizeSpeechText(text: string, mood: KamalSpeechMood) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return clean;
  if (mood === 'concerned' && !/^(I’m sorry|Sorry|I understand)/i.test(clean)) return `I understand. ${clean}`;
  if (mood === 'cautious' && !/^(Please note|Careful|Before we continue)/i.test(clean)) return `Please note. ${clean}`;
  if (mood === 'guided' && !/^(Okay|Now|Let’s)/i.test(clean)) return `Okay. ${clean}`;
  return clean;
}

export function buildKamalUtterance(text: string, selectedVoice: LocalVoice) {
  const profile = KAMAL_VOICE_PROFILES[selectedVoice];
  const mood = inferKamalSpeechMood(text);
  const adjustment = emotionalVoiceAdjustment(mood);
  const utterance = new SpeechSynthesisUtterance(humanizeSpeechText(text, mood));
  utterance.lang = 'en-US';
  utterance.rate = Math.max(0.65, Math.min(1.25, profile.rate * adjustment.rate));
  utterance.pitch = Math.max(0.5, Math.min(1.7, profile.pitch * adjustment.pitch));
  utterance.volume = adjustment.volume;
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    const voice = selectKamalSpeechVoice(window.speechSynthesis.getVoices(), selectedVoice);
    if (voice) utterance.voice = voice;
  }
  return utterance;
}

export function previewKamalVoice(selectedVoice: LocalVoice) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(buildKamalUtterance(KAMAL_VOICE_PROFILES[selectedVoice].sample, selectedVoice));
  return true;
}
