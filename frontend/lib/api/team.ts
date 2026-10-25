import { api } from './client';
import type { CoHost, CoHostPermissions } from './event-access-admin';

/** The whole-band team: people who can help run EVERY event of an organisation. */

const base = (organizationId: string) =>
  `/organizations/${encodeURIComponent(organizationId)}/team`;

export const fetchTeam = (organizationId: string) =>
  api.get<{ data: CoHost[] }>(base(organizationId)).then((page) => page.data);

export const addTeamMember = (
  organizationId: string,
  email: string,
  permissions?: Partial<CoHostPermissions>,
) => api.post<CoHost>(base(organizationId), { email, ...(permissions ? { permissions } : {}) });

export const updateTeamMember = (
  organizationId: string,
  memberId: string,
  permissions: Partial<CoHostPermissions>,
) => api.patch<CoHost>(`${base(organizationId)}/${encodeURIComponent(memberId)}`, { permissions });

export const removeTeamMember = (organizationId: string, memberId: string) =>
  api.delete<void>(`${base(organizationId)}/${encodeURIComponent(memberId)}`);
