import { vdiscussionApi, vdiscussionDomain, vdiscussionHooks } from '@/features/vdiscussion';
import { sharedHooks } from '@/features/shared';
import { vtrainingApi, vtrainingDomain, vtrainingHooks } from '@/features/vtraining';

function assertFeatureNamespaces(feature: Record<string, unknown>, expected: string[]) {
  for (const key of expected) {
    if (!(key in feature)) {
      throw new Error(`Missing feature namespace: ${key}`);
    }
  }
}

assertFeatureNamespaces(vdiscussionDomain, ['steps', 'contributionSchemas']);
assertFeatureNamespaces(vdiscussionApi, ['monitorApi', 'resultApi']);
assertFeatureNamespaces(vdiscussionHooks, ['queries']);

assertFeatureNamespaces(vtrainingDomain, ['types', 'scoring']);
assertFeatureNamespaces(vtrainingApi, ['classApi', 'resultApi']);
assertFeatureNamespaces(vtrainingHooks, ['queries']);

assertFeatureNamespaces(sharedHooks, ['queries']);
