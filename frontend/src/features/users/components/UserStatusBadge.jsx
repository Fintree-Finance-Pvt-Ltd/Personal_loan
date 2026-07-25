export function UserStatusBadge({ status }) {
  const styles = {
    ACTIVE: 'bg-green-50 text-green-700 border border-green-200',
    INACTIVE: 'bg-slate-100 text-slate-600 border border-slate-200',
    LOCKED: 'bg-amber-50 text-amber-700 border border-amber-200',
    DISABLED: 'bg-red-50 text-red-700 border border-red-200',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[status] ?? styles.INACTIVE}`}>
      {status}
    </span>
  );
}
