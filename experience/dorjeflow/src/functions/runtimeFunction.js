import { base44 } from '@/api/base44Client';
import { runtimeProvider } from '@/services/studentLadApi';

export async function invokeBase44Function(name, payload) {
  if (runtimeProvider !== 'base44') {
    throw new Error(`${name} is not yet mapped to the Student-LAD core. No external action was performed.`);
  }
  return base44.functions.invoke(name, payload);
}
