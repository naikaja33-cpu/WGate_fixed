import { Clock, Phone, Car, Check, X, LogOut as LogOutIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

const statusStyles = {
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  approved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
};

const purposeLabels = {
  delivery: '📦 Delivery',
  guest: '👤 Guest',
  cab: '🚕 Cab',
  service: '🔧 Service',
  other: '📋 Other',
};

export default function VisitorCard({ visitor, onApprove, onReject, onCheckout, showActions, role }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-4 space-y-3 transition-all hover:shadow-md">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h3 className="font-semibold text-foreground">{visitor.visitor_name}</h3>
          <p className="text-sm text-muted-foreground">Flat {visitor.flat_number}</p>
        </div>
        <Badge className={`text-xs border ${statusStyles[visitor.status]} capitalize`}>
          {visitor.status}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1 bg-muted px-2 py-1 rounded-lg">
          {purposeLabels[visitor.purpose] || visitor.purpose}
        </span>
        {visitor.visitor_phone && (
          <span className="flex items-center gap-1 bg-muted px-2 py-1 rounded-lg">
            <Phone className="w-3 h-3" /> {visitor.visitor_phone}
          </span>
        )}
        {visitor.vehicle_number && (
          <span className="flex items-center gap-1 bg-muted px-2 py-1 rounded-lg">
            <Car className="w-3 h-3" /> {visitor.vehicle_number}
          </span>
        )}
        {visitor.check_in_time && (
          <span className="flex items-center gap-1 bg-muted px-2 py-1 rounded-lg">
            <Clock className="w-3 h-3" /> {format(new Date(visitor.check_in_time), 'h:mm a')}
          </span>
        )}
      </div>

      {showActions && visitor.status === 'pending' && (
        <div className="flex gap-2 pt-1">
          <Button size="sm" className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white" onClick={() => onApprove(visitor)}>
            <Check className="w-4 h-4 mr-1" /> Approve
          </Button>
          <Button size="sm" variant="outline" className="flex-1 border-red-200 text-red-600 hover:bg-red-50" onClick={() => onReject(visitor)}>
            <X className="w-4 h-4 mr-1" /> Reject
          </Button>
        </div>
      )}

      {role === 'guard' && visitor.status === 'approved' && !visitor.check_out_time && (
        <Button size="sm" variant="outline" className="w-full" onClick={() => onCheckout(visitor)}>
          <LogOutIcon className="w-4 h-4 mr-1" /> Mark Checkout
        </Button>
      )}
    </div>
  );
}
