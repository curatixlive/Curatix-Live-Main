import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrganizerSupport } from './organizer-support';

vi.mock('@/components/support/support-queue', () => ({
  SupportQueue: ({ scope }: { scope: string }) => <div>queue:{scope}</div>,
}));
vi.mock('@/components/support/support-centre', () => ({
  SupportCentre: ({ platformOnly }: { platformOnly?: boolean }) => (
    <div>centre:{platformOnly ? 'platform-only' : 'any'}</div>
  ),
}));

describe('OrganizerSupport', () => {
  it('opens on the customers queue and switches to a platform-only thread with Curatix', async () => {
    render(<OrganizerSupport />);
    expect(screen.getByRole('tab', { name: /From your customers/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText('queue:organizer')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /Contact Curatix/ }));
    expect(screen.getByText('centre:platform-only')).toBeInTheDocument();
    expect(screen.queryByText('queue:organizer')).not.toBeInTheDocument();
  });
});
