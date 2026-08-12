'use client';

export type WorkspaceToolKind = 'email' | 'social' | 'report' | 'media';

export type WorkspaceToolAttachment = {
  filename: string;
  content_type: string;
  data_base64: string;
  size?: number;
};

export type WorkspaceToolPayload = {
  tool: WorkspaceToolKind;
  context?: string;
  imageUrl?: string;
  attachments?: WorkspaceToolAttachment[];
  sourceMessageId?: string;
  sourceAssetIds?: string[];
  workspaceId?: string;
  initialContent?: string;
};

export const WORKSPACE_TOOL_OPEN_EVENT = 'workspace-tool:open';

export function openWorkspaceTool(tool: WorkspaceToolKind, payload: Omit<WorkspaceToolPayload, 'tool'> = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<WorkspaceToolPayload>(WORKSPACE_TOOL_OPEN_EVENT, { detail: { tool, ...payload } }));
}
