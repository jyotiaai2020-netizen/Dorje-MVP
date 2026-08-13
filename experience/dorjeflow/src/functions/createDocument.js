import { localWorkspaceDocuments } from '@/services/localWorkspaceDocuments';
export const createDocument = async (payload) => ({ data: { document: localWorkspaceDocuments.create(payload) } });
