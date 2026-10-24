import * as React from 'react';
import type { Metadata } from 'next';
import { AgentAccessAdmin } from '@/components/admin/agent-access-admin';

export const metadata: Metadata = { title: 'AI assistant access' };

export default function AdminAssistantPage() {
  return <AgentAccessAdmin />;
}
