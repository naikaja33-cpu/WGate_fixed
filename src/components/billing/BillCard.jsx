import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, CheckCircle2, Clock, IndianRupee } from 'lucide-react';
import { format } from 'date-fns';

const statusStyles = {
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  paid: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  overdue: 'bg-red-100 text-red-700 border-red-200',
};

export default function BillCard({ bill, onMarkPaid, isAdmin }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-4 space-y-3 hover:shadow-md transition-all">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-foreground">{bill.month_label || bill.month}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Flat {bill.flat_number}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={`text-xs border capitalize ${statusStyles[bill.status]}`}>{bill.status}</Badge>
        </div>
      </div>

      <div className="flex items-center gap-1 text-xl font-bold text-foreground">
        <IndianRupee className="w-4 h-4" />
        {Number(bill.amount).toLocaleString()}
      </div>

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

      {isAdmin && bill.status !== 'paid' && (
        <Button size="sm" variant="outline" className="w-full border-emerald-200 text-emerald-700 hover:bg-emerald-50"
          onClick={() => onMarkPaid(bill)}>
          <CheckCircle2 className="w-4 h-4 mr-1" /> Mark as Paid
        </Button>
      )}
    </div>
  );
}
