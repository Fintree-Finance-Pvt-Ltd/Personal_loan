import { Target, Users, Layers, Activity, Ban } from 'lucide-react';
import { StatCard } from '../../../components/ui';

const formatCurrency = (value) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
};

export default function DistributionSummary({ summary }) {
  if (!summary) return null;

  return (
    <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-5">
      <StatCard icon={Target} label="Target allocation" value={`${summary.totalTargetPercentage}%`} tone="info" />
      <StatCard icon={Layers} label="Allocated amount" value={formatCurrency(summary.totalAllocatedAmount)} tone="brand" />
      <StatCard icon={Users} label="Allocated apps" value={summary.totalAllocatedCount} tone="accent" />
      <StatCard icon={Activity} label="Active routes" value={summary.activeRoutesCount} tone="brand" />
      <StatCard icon={Ban} label="Inactive routes" value={summary.inactiveRoutesCount} tone="danger" />
    </div>
  );
}
