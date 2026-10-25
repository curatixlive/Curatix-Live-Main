import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { newTier, type DraftTier } from '@/lib/organizer/wizard/model';
import { SeatedGenderPrices } from './seated-gender-prices';

const section = (key: string, name: string, price: string): DraftTier => ({
  ...newTier(0),
  key,
  serverId: key,
  name,
  price,
});

describe('SeatedGenderPrices', () => {
  it('draws one row per seating section', () => {
    render(
      <SeatedGenderPrices
        tiers={[section('a', 'Gold', '1200'), section('b', 'Platinum', '2000')]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Gold — male price')).toBeTruthy();
    expect(screen.getByLabelText('Platinum — female price')).toBeTruthy();
  });

  it('writes the typed price onto ONLY that section', () => {
    const onChange = vi.fn();
    const tiers = [section('a', 'Gold', '1200'), section('b', 'Platinum', '2000')];
    render(<SeatedGenderPrices tiers={tiers} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Platinum — female price'), {
      target: { value: '1700' },
    });

    const next = onChange.mock.calls[0]![0] as DraftTier[];
    expect(next.find((tier) => tier.key === 'b')?.genderFemale).toBe('1700');
    expect(next.find((tier) => tier.key === 'a')?.genderFemale).toBe('');
  });

  it('renders nothing when there are no sections yet', () => {
    const { container } = render(<SeatedGenderPrices tiers={[]} onChange={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});
