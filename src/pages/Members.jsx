import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import UserManagementSection from '@/components/users/UserManagementSection';

export default function Members() {
  const { user } = useAuth();

  // Members are managed by admins only.
  if (user?.role !== 'admin') return <Navigate to="/Dashboard" replace />;

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Members</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Add, edit or remove people in your society.
        </p>
      </div>

      <UserManagementSection />
    </div>
  );
}