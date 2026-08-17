import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createPlatformPolicySchema } from '../validation/platform-policy.schema';
import { platformPoliciesApi } from '../api/platform-policies.api';
import { Button } from '../../../components/ui';

export default function CreatePlatformPolicyPage() {
  const navigate = useNavigate();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(createPlatformPolicySchema)
  });

  const onSubmit = async (data) => {
    try {
      const policy = await platformPoliciesApi.createPolicy(data);
      navigate(`/admin-master/platform-policies/${policy.id}`);
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to create policy');
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Create Platform Policy</h1>
      
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Policy Name</label>
            <input
              type="text"
              {...register('name')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="e.g. Standard Prime Borrowers"
            />
            {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Policy Code</label>
            <input
              type="text"
              {...register('code')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="e.g. STD_PRIME"
            />
            {errors.code && <p className="text-red-500 text-sm mt-1">{errors.code.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              {...register('description')}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
            {errors.description && <p className="text-red-500 text-sm mt-1">{errors.description.message}</p>}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 mt-6">
            <Button variant="outline" type="button" onClick={() => navigate('/admin-master/platform-policies')}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              Create Policy
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
