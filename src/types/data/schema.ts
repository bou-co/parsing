import { defineType } from '../../type-token';
import type { TypeToken } from '../../type-token';
import { notAPipe } from '../namespace-marker';
import type { StandardSchemaV1 } from './standard-schema';

const describeIssue = (issue: StandardSchemaV1.Issue): string => {
  const path = issue.path?.map((segment) => (typeof segment === 'object' && segment !== null && 'key' in segment ? segment.key : segment)).map(String);
  return path?.length ? `${path.join('.')}: ${issue.message}` : issue.message;
};

/** Validate with any Standard Schema v1 validator (Zod 4, Valibot, ArkType, ...). The output type is inferred and issues become the cast error message */
export const schema = /* @__PURE__ */ notAPipe(<S extends StandardSchemaV1>(validator: S): TypeToken<StandardSchemaV1.InferOutput<S>> => {
  const standard = validator?.['~standard'];
  if (!standard || typeof standard.validate !== 'function')
    throw new Error('[@bou-co/parsing] schema(): expected a Standard Schema (an object with a "~standard" property)');
  return defineType({
    name: `schema(${standard.vendor})`,
    fn: async (value): Promise<StandardSchemaV1.InferOutput<S>> => {
      const result = await standard.validate(value);
      if (result.issues) throw new Error(result.issues.map(describeIssue).join('; '));
      return result.value as StandardSchemaV1.InferOutput<S>;
    },
  }) as TypeToken<StandardSchemaV1.InferOutput<S>>;
});
