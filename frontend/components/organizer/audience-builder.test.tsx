import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PRESETS, validateRules, type Match, type RuleDraft } from '@/lib/organizer/audience';
import { AudienceBuilder } from './audience-builder';

function Harness({ count = 7 }: { count?: number | null }) {
  const [rules, setRules] = React.useState<RuleDraft[]>(() => PRESETS[0].rules());
  const [match, setMatch] = React.useState<Match>('all');
  return (
    <AudienceBuilder
      rules={rules}
      match={match}
      onRules={(next, m) => {
        setRules(next);
        if (m) setMatch(m);
      }}
      onMatch={setMatch}
      events={[{ id: 'e1', title: 'Summer Sessions' }]}
      cities={['Mumbai', 'Pune']}
      issues={validateRules(rules)}
      count={count}
      counting={false}
      countError={null}
    />
  );
}

describe('AudienceBuilder', () => {
  it('shows the live count the server returned', () => {
    render(<Harness count={7} />);
    expect(screen.getByRole('status')).toHaveTextContent('7 people match');
  });

  it('a preset replaces the rules, and adding a rule reveals the all/any choice', async () => {
    render(<Harness />);
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Bought but never attended' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('radio', { name: 'Match all rules' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'Match any rule' }));
    expect(screen.getByRole('radio', { name: 'Match any rule' })).toBeChecked();
  });

  it('a rule can be turned into "do NOT match" and scoped to a city and an event', async () => {
    render(<Harness />);
    await userEvent.selectOptions(screen.getByLabelText('Rule 1: condition'), 'not');
    await userEvent.selectOptions(screen.getByLabelText('Rule 1: city'), 'Pune');
    await userEvent.selectOptions(screen.getByLabelText('Rule 1: event'), 'e1');
    expect(screen.getByLabelText('Rule 1: condition')).toHaveValue('not');
    expect(screen.getByLabelText('Rule 1: city')).toHaveValue('Pune');
    expect(screen.getByLabelText('Rule 1: event')).toHaveValue('e1');
  });

  it('a rule needing a number shows an error until it has one, and cannot be removed when alone', async () => {
    render(<Harness />);
    await userEvent.selectOptions(screen.getByLabelText('Rule 1: what to check'), 'orders');
    await userEvent.clear(screen.getByLabelText('Rule 1: number'));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a whole number');
    expect(screen.getByRole('button', { name: 'Remove rule 1' })).toBeDisabled();
  });
});
