export function RoleStatusBadge({ status }) {
  const style =
    status === 'ACTIVE'
      ? 'bg-green-50 text-green-700 border border-green-200'
      : 'bg-slate-100 text-slate-600 border border-slate-200';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${style}`}>
      {status === 'ACTIVE' ? 'Active' : 'Inactive'}
    </span>
  );
}
