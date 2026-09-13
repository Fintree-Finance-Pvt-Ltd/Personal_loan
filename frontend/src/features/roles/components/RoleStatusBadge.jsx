export function RoleStatusBadge({ status }) {
  const style =
    status === 'ACTIVE'
      ? 'bg-brand-50 text-brand-700 border border-brand-200'
      : 'bg-neutral-100 text-neutral-600 border border-neutral-200';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${style}`}>
      {status === 'ACTIVE' ? 'Active' : 'Inactive'}
    </span>
  );
}
