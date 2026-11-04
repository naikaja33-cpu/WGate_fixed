import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { fineForPayment } from '@/lib/billing';

export default function MarkPaidModal({ bill, onConfirm, onClose, isLoading }) {
  const [paidDate, setPaidDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [paymentMode, setPaymentMode] = useState('upi');
    const [transactionId, setTransactionId] = useState('');
  const [waiveFine, setWaiveFine] = useState(false);
  const lateFine = fineForPayment(bill, paidDate); // 0 when paid on or before the due date
  const fine = waiveFine ? 0 : lateFine;
  const totalPaid = (Number(bill.amount) || 0) + fine;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
      <div className="bg-card w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Mark as Paid</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="bg-muted rounded-xl p-3 text-sm">
          <p className="font-medium">{bill.month_label} — Flat {bill.flat_number}</p>
                    <p className="text-muted-foreground mt-0.5">₹{Number(bill.amount).toLocaleString()}</p>
          {lateFine > 0 && (
            <div className="mt-2 space-y-1.5 border-t border-border pt-2">
              <p className="text-red-600">
                Paid after the due date: late fine ₹{lateFine.toLocaleString('en-IN')}
                {waiveFine ? ' (waived)' : ''}
              </p>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={waiveFine} onChange={(e) => setWaiveFine(e.target.checked)} />
                Waive the late fine
              </label>
              <p className="font-semibold text-foreground">Amount to collect: ₹{totalPaid.toLocaleString('en-IN')}</p>
            </div>
          )}
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Payment Date</Label>
            <Input type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Payment Mode</Label>
            <Select value={paymentMode} onValueChange={setPaymentMode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="upi">UPI</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Transaction ID (optional)</Label>
            <Input placeholder="UTR / Ref number" value={transactionId} onChange={e => setTransactionId(e.target.value)} />
          </div>
        </div>
        <Button className="w-full bg-emerald-500 hover:bg-emerald-600 text-white" disabled={isLoading}
          onClick={() => onConfirm({
            paid_date: paidDate, payment_mode: paymentMode, transaction_id: transactionId, status: 'paid',
            fine_applied: fine, fine_waived: waiveFine && lateFine > 0, amount_paid: totalPaid,
          })}>
          {isLoading ? 'Saving...' : 'Confirm Payment'}
        </Button>
      </div>
    </div>
  );
}
