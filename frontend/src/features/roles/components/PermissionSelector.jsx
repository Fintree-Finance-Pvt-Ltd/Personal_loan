import { useMemo } from 'react';

export function PermissionSelector({ allPermissions, selectedIds, onChange, disabled }) {
  const grouped = useMemo(() => {
    const groups = {};
    for (const perm of allPermissions) {
      if (!groups[perm.module]) groups[perm.module] = [];
      groups[perm.module].push(perm);
    }
    return groups;
  }, [allPermissions]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  function toggle(id) {
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter(i => i !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  function selectAll(module) {
    const ids = grouped[module].map(p => p.id);
    const next = [...new Set([...selectedIds, ...ids])];
    onChange(next);
  }

  function clearAll(module) {
    const ids = new Set(grouped[module].map(p => p.id));
    onChange(selectedIds.filter(id => !ids.has(id)));
  }

  const allModules = Object.keys(grouped).sort();

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-slate-700">
        Permissions <span className="ml-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700">{selectedIds.length} selected</span>
      </p>
      {allModules.map(module => {
        const perms = grouped[module];
        const moduleIds = perms.map(p => p.id);
        const allSelected = moduleIds.every(id => selectedSet.has(id));
        const someSelected = moduleIds.some(id => selectedSet.has(id));
        return (
          <div key={module} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-500">{module}</span>
              {!disabled && (
                <div className="flex gap-2">
                  <button type="button" onClick={() => selectAll(module)} className="text-xs text-brand-600 hover:text-brand-800 font-medium">Select all</button>
                  <span className="text-slate-300">·</span>
                  <button type="button" onClick={() => clearAll(module)} className="text-xs text-slate-500 hover:text-slate-700 font-medium">Clear</button>
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 divide-y divide-slate-50 sm:grid-cols-2">
              {perms.map(perm => (
                <label key={perm.id} className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={selectedSet.has(perm.id)}
                    onChange={() => toggle(perm.id)}
                    disabled={disabled}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
                  />
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-brand-700">{perm.code}</p>
                    {perm.description && <p className="mt-0.5 text-xs text-slate-500">{perm.description}</p>}
                  </div>
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
