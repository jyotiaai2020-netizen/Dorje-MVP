import { invokeBase44Function } from './runtimeFunction';
import { runtimeProvider, studentLadApi } from '@/services/studentLadApi';

export const analyzeAttachment = (payload) => runtimeProvider === 'student-lad'
  ? studentLadApi.attachments.analyze(payload)
  : invokeBase44Function('analyzeAttachment', payload);
