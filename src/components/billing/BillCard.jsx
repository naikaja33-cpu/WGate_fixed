import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, CheckCircle2, Clock, IndianRupee,Smartphone } from 'lucide-react';
import { format } from 'date-fns';
import { effectiveStatus, lateFineFor } from '@/lib/billing';

const statusStyles = {
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  paid: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  overdue: 'bg-red-100 text-red-700 border-red-200',
};

export default function BillCard({ bill, onMarkPaid, isAdmin, payEnabled, onPay, onRejectClaim }) {
  const status = effectiveStatus(bill);
  const fine = lateFineFor(bill);
  const fineConfigured = Math.round(Number(bill.late_fine) || 0);
  const finePaid = Math.round(Number(bill.fine_applied) || 0);
  return (
    <div className="bg-card rounded-2xl border border-border p-4 space-y-3 hover:shadow-md transition-all">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-foreground">{bill.month_label || bill.month}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Flat {bill.flat_number}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={`text-xs border capitalize ${statusStyles[status]}`}>{status}</Badge>
        </div>
      </div>

      <div className="flex items-center gap-1 text-xl font-bold text-foreground">
        <IndianRupee className="w-4 h-4" />
        {Number(bill.amount).toLocaleString()}
      </div>

                  {status === 'overdue' && fine > 0 && (
        <p className="text-sm font-medium text-red-600">
          + ₹{fine.toLocaleString('en-IN')} late fine · Total due ₹{(Number(bill.amount) + fine).toLocaleString('en-IN')}
        </p>
      )}
      {status === 'pending' && fineConfigured > 0 && (
        <p className="text-xs text-amber-700">
          A late fine of ₹{fineConfigured.toLocaleString('en-IN')} applies if paid after the due date.
        </p>
      )}
      {status === 'paid' && finePaid > 0 && (
        <p className="text-xs text-muted-foreground">
          Includes late fine ₹{finePaid.toLocaleString('en-IN')} · Paid ₹{(Number(bill.amount) + finePaid).toLocaleString('en-IN')}
        </p>
      )}

      {bill.area_sqft > 0 && bill.rate_per_sqft > 0 && (
        <p className="text-xs text-muted-foreground">
          {Number(bill.area_sqft).toLocaleString('en-IN')} sq ft × ₹{Number(bill.rate_per_sqft).toLocaleString('en-IN')} per sq ft
        </p>
      )}

      {bill.line_items?.length > 0 && (
        <div className="bg-muted rounded-xl p-3 space-y-1">
          {bill.line_items.map((item, i) => (
            <div key={i} className="flex justify-between text-xs text-muted-foreground">
              <span>{item.label}</span>
              <span>₹{Number(item.amount).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {bill.due_date && (
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" /> Due {format(new Date(bill.due_date), 'MMM d')}
          </span>
        )}
        {bill.paid_date && (
          <span className="flex items-center gap-1 text-emerald-600">
            <CheckCircle2 className="w-3 h-3" /> Paid {format(new Date(bill.paid_date), 'MMM d')}
          </span>
        )}
        {bill.transaction_id && (
          <span className="flex items-center gap-1 font-mono">
            ID: {bill.transaction_id}
          </span>
        )}
      </div>

            {!isAdmin && bill.status !== 'paid' && (
        bill.payment_claim ? (
          <p className="text-xs rounded-xl bg-blue-50 text-blue-700 border border-blue-200 px-3 py-2">
            Payment submitted (ID {bill.payment_claim.utr}). It will be marked paid once the admin confirms it.
          </p>
        ) : (
          <>
            {bill.claim_rejected && (
              <p className="text-xs text-red-600">
                Your last payment could not be verified. Please check the transaction ID and submit again.
              </p>
            )}
            {payEnabled && (
              <Button size="sm" className="w-full" onClick={() => onPay(bill)}>
                <Smartphone className="w-4 h-4 mr-1" /> Pay ₹{(Number(bill.amount) + fine).toLocaleString('en-IN')}
              </Button>
            )}
          </>
        )
      )}

      {isAdmin && bill.status !== 'paid' && bill.payment_claim && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 space-y-2">
          <p className="text-xs text-blue-800">
            <strong>{bill.payment_claim.claimed_by || 'A resident'}</strong> says they paid. Transaction ID:{' '}
            <span className="font-mono">{bill.payment_claim.utr}</span>. Check this ID in your bank or UPI statement before confirming.
          </p>
          <div className="flex gap-2">
            <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => onMarkPaid(bill)}>
              Confirm and close
            </Button>
            <Button size="sm" variant="outline" className="flex-1 border-red-200 text-red-700 hover:bg-red-50"
              onClick={() => onRejectClaim(bill)}>
              Not received
            </Button>
          </div>
        </div>
      )}

      {isAdmin && bill.status !== 'paid' && !bill.payment_claim && (
        <Button size="sm" variant="outline" className="w-full border-emerald-200 text-emerald-700 hover:bg-emerald-50"
          onClick={() => onMarkPaid(bill)}>
          <CheckCircle2 className="w-4 h-4 mr-1" /> Mark as Paid
        </Button>
      )}
    </div>
  );
}
