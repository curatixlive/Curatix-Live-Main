import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SeatMap } from '@/lib/api/seating';
import { SeatPicker } from './seat-picker';

const toggleSeat = vi.fn();
let state: {
  seatMap: SeatMap | null;
  seatMapLoading: boolean;
  seatIds: string[];
  toggleSeat: typeof toggleSeat;
};

vi.mock('./booking-context', () => ({ useBooking: () => state }));

const map: SeatMap = {
  event_id: 'e',
  rows: 1,
  cols: 3,
  max_per_booking: 2,
  sections: [
    { id: 'gold', name: 'Gold', ticket_type_id: 't1', price_minor: 50_000, total: 3, available: 2 },
  ],
  seats: [
    { id: 's1', label: 'A1', row: 0, col: 0, section_id: 'gold', status: 'available' },
    { id: 's2', label: 'A2', row: 0, col: 1, section_id: 'gold', status: 'sold' },
    { id: 's3', label: 'A3', row: 0, col: 2, section_id: 'gold', status: 'available' },
  ],
};

describe('SeatPicker', () => {
  it('shows taken seats as unavailable and available ones as buttons', () => {
    state = { seatMap: map, seatMapLoading: false, seatIds: [], toggleSeat };
    render(<SeatPicker />);
    expect(screen.getByRole('button', { name: /Seat A2.*not available/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Seat A1, Gold/ })).toBeEnabled();
  });

  it('toggles a seat when pressed', () => {
    toggleSeat.mockClear();
    state = { seatMap: map, seatMapLoading: false, seatIds: [], toggleSeat };
    render(<SeatPicker />);
    fireEvent.click(screen.getByRole('button', { name: /Seat A1/ }));
    expect(toggleSeat).toHaveBeenCalledWith('s1');
  });

  it('marks chosen seats pressed and stops offering more at the limit', () => {
    state = { seatMap: map, seatMapLoading: false, seatIds: ['s1', 's3'], toggleSeat };
    render(<SeatPicker />);
    expect(screen.getByRole('button', { name: /Seat A1/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/2 seats selected/)).toBeInTheDocument();
  });

  it('says so when the map could not load', () => {
    state = { seatMap: null, seatMapLoading: false, seatIds: [], toggleSeat };
    render(<SeatPicker />);
    expect(screen.getByRole('alert')).toHaveTextContent(/could not be loaded/);
  });
});
