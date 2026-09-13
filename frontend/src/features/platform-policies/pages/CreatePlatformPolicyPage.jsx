import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createPlatformPolicySchema } from '../validation/platform-policy.schema';
import { platformPoliciesApi } from '../api/platform-policies.api';
import { Button, Card, Input, PageHeader, Textarea } from '../../../components/ui';

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
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Configuration" title="Create platform policy" description="Define a new global eligibility policy." />

      <Card>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <Input
            label="Policy name"
            {...register('name')}
            placeholder="e.g. Standard Prime Borrowers"
            error={errors.name?.message}
          />

          <Input
            label="Policy code"
            {...register('code')}
            placeholder="e.g. STD_PRIME"
            error={errors.code?.message}
          />

          <Textarea
            label="Description"
            {...register('description')}
            rows={3}
            error={errors.description?.message}
          />

          <div className="mt-6 flex justify-end gap-3 border-t border-neutral-100 pt-5">
            <Button variant="secondary" type="button" onClick={() => navigate('/admin-master/platform-policies')}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              Create policy
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
