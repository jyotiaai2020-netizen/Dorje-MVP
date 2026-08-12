'use client';

import { useCallback, type RefObject } from 'react';
import { API_BASE_URL, authenticatedFetch, authorizationHeaders } from '@/lib/api';
import type { CedaSuggestion } from './CedaSuggestionButtons';

type UseCedaSuggestionComposerOptions<T extends HTMLElement> = {
  setInput: (value: string) => void;
  setSelectedSuggestionId: (value: string) => void;
  composerRef?: RefObject<T | null>;
  onNotice?: (message: string) => void;
  confirmationNotice?: string;
};

export function useCedaSuggestionComposer<T extends HTMLElement = HTMLTextAreaElement>({
  setInput,
  setSelectedSuggestionId,
  composerRef,
  onNotice,
  confirmationNotice = 'A preview was prepared. You will confirm before anything changes.',
}: UseCedaSuggestionComposerOptions<T>) {
  const copyToComposer = useCallback(async (suggestion: CedaSuggestion) => {
    setSelectedSuggestionId(suggestion.id);
    setInput(suggestion.editable_instruction);
    window.setTimeout(() => composerRef?.current?.focus(), 0);
    onNotice?.('Suggestion copied to the composer. Edit it there, then send when ready.');
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/suggestions/${suggestion.id}/select`, { method: 'POST', headers: authorizationHeaders() });
      const data = await response.json();
      if (response.ok && data.requires_confirmation) onNotice?.(confirmationNotice);
    } catch {
      // Copying to the local composer is still valid when observability logging is unavailable.
    }
  }, [composerRef, confirmationNotice, onNotice, setInput, setSelectedSuggestionId]);

  return { copyToComposer };
}
