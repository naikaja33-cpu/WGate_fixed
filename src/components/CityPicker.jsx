import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { INDIA_STATES } from '@/lib/indiaCities';

// A dropdown of Indian states and union territories. The person can only pick from the list.
export default function CityPicker({ id, value, onChange }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={value ? 'truncate text-foreground' : 'truncate text-muted-foreground'}>{value || 'Select state'}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[14rem] p-1" align="start">
        <div className="max-h-64 overflow-y-auto" role="listbox">
          {INDIA_STATES.map((state) => (
            <button
              key={state}
              type="button"
              role="option"
              aria-selected={state === value}
              onClick={() => { onChange(state); setOpen(false); }}
              className="flex w-full items-center justify-between rounded-md px-2 py-2.5 text-left text-sm hover:bg-accent active:bg-accent"
            >
              <span>{state}</span>
              {state === value && <Check className="h-4 w-4" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}