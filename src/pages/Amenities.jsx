import { useMemo, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { wgate } from '@/api/wgateClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { CalendarClock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

// Keep this in sync with the AMENITIES list in server/wgate-server.mjs —
// the backend is the source of truth and will reject anything not in it.
const AMENITIES = ['Clubhouse', 'Swimming Pool', 'Party Hall', 'Gym', 'Tennis Court'];

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function Amenities() {
  const { user } = useAuth();
  const role = user?.role || 'resident';
  const isAdmin = role === 'admin';
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    amenity: AMENITIES[0],
    booking_date: todayStr(),
    start_time: '18:00',
    end_time: '19:00',
    notes: '',
  });
  const [formError, setFormError] = useState('');

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['amenity-bookings'],
    queryFn: () => wgate.entities.AmenityBooking.list('-booking_date', 200),
  });

  const createMutation = useMutation({
    mutationFn: (data) => wgate.entities.AmenityBooking.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['amenity-bookings'] });
      setFormError('');
      setForm((f) => ({ ...f, notes: '' }));
    },
    onError: (err) => setFormError(err?.message || 'Failed to book amenity'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id) => wgate.entities.AmenityBooking.update(id, { status: 'cancelled' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['amenity-bookings'] }),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError('');
    if (form.start_time >= form.end_time) {
      setFormError('End time must be after start time');
      return;
    }
    createMutation.mutate(form);
  };

  // Existing (non-cancelled) bookings for the amenity + date currently
  // selected in the form — shown so the resident can see taken slots
  // before they even try to submit.
  const slotsForSelection = useMemo(
    () =>
      bookings
        .filter(
          (b) =>
            b.status !== 'cancelled' &&
            b.amenity === form.amenity &&
            b.booking_date === form.booking_date
        )
        .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [bookings, form.amenity, form.booking_date]
  );

  const myBookings = useMemo(
    () =>
      bookings
        .filter((b) => (isAdmin ? true : b.resident_email === user?.email))
        .filter((b) => b.status !== 'cancelled')
        .filter((b) => b.booking_date >= todayStr())
        .sort((a, b) => a.booking_date.localeCompare(b.booking_date) || a.start_time.localeCompare(b.start_time)),
    [bookings, isAdmin, user?.email]
  );

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-foreground">Amenities Booking</h1>
        <p className="text-sm text-muted-foreground mt-1">Book a slot — double-booking is blocked automatically.</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-card rounded-2xl border border-border p-4 space-y-4">
        <div className="space-y-2">
          <Label>Amenity</Label>
          <Select value={form.amenity} onValueChange={(v) => setForm((f) => ({ ...f, amenity: v }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AMENITIES.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Date</Label>
          <Input
            type="date"
            min={todayStr()}
            value={form.booking_date}
            onChange={(e) => setForm((f) => ({ ...f, booking_date: e.target.value }))}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Start time</Label>
            <Input
              type="time"
              value={form.start_time}
              onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>End time</Label>
            <Input
              type="time"
              value={form.end_time}
              onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Notes (optional)</Label>
          <Input
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="e.g. birthday party, 15 guests"
          />
        </div>

        {slotsForSelection.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 space-y-1">
            <p className="font-medium">Already booked on {form.booking_date} for {form.amenity}:</p>
            {slotsForSelection.map((b) => (
              <p key={b.id}>{b.start_time}–{b.end_time} (Flat {b.flat_number || '—'})</p>
            ))}
          </div>
        )}

        {formError && <p className="text-sm text-red-600">{formError}</p>}

        <Button type="submit" className="w-full" disabled={createMutation.isPending}>
          {createMutation.isPending ? 'Booking…' : 'Book Amenity'}
        </Button>
      </form>

      <div className="space-y-3">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-primary" />
          {isAdmin ? 'Upcoming bookings (all residents)' : 'My upcoming bookings'}
        </h2>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : myBookings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming bookings.</p>
        ) : (
          myBookings.map((b) => (
            <div key={b.id} className="bg-card rounded-2xl border border-border p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold text-foreground">{b.amenity}</p>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(b.booking_date), 'd MMM yyyy')} · {b.start_time}–{b.end_time}
                </p>
                {isAdmin && <p className="text-xs text-muted-foreground mt-1">Flat {b.flat_number || '—'} · {b.resident_email}</p>}
                {b.notes && <p className="text-xs text-muted-foreground mt-1">{b.notes}</p>}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-red-200 text-red-600 hover:bg-red-50"
                onClick={() => cancelMutation.mutate(b.id)}
                disabled={cancelMutation.isPending}
              >
                <X className="w-4 h-4 mr-1" /> Cancel
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
