import { api } from './client';

export type AgentAccess = {
  id: string;
  user: { id: string; email: string; full_name: string };
  enabled: boolean;
  token_hint: string;
  created_at: string;
  last_used_at: string | null;
  /** Present ONLY in the response to a grant — the one time it is ever shown. */
  token?: string;
  path?: string;
};

export const fetchAgentAccess = () => api.get<{ data: AgentAccess[] }>('/admin/agent-access');

export const grantAgentAccess = (email: string) =>
  api.post<AgentAccess>('/admin/agent-access', { email });

export const setAgentAccessEnabled = (id: string, enabled: boolean) =>
  api.patch<AgentAccess>(`/admin/agent-access/${encodeURIComponent(id)}`, { enabled });

export const revokeAgentAccess = (id: string) =>
  api.delete<void>(`/admin/agent-access/${encodeURIComponent(id)}`);
