export function UserStatusBadge({ status }) {
  const styles = {
    ACTIVE: 'bg-brand-50 text-brand-700 border border-brand-200',
    INACTIVE: 'bg-neutral-100 text-neutral-600 border border-neutral-200',
    LOCKED: 'bg-caution-50 text-caution-700 border border-caution-200',
    DISABLED: 'bg-danger-50 text-danger-700 border border-danger-200',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[status] ?? styles.INACTIVE}`}>
      {status}
    </span>
  );
}
