import type { TypeToken } from '../../type-token';
import { TypeToken as Token } from '../../type-token';
import type { StandardSchemaV1 } from './standard-schema';

const describeIssue = (issue: StandardSchemaV1.Issue): string => {
  const path = issue.path?.map((segment) => (typeof segment === 'object' && segment !== null && 'key' in segment ? segment.key : segment)).map(String);
  return path?.length ? `${path.join('.')}: ${issue.message}` : issue.message;
};

/**
 * `schema(validator)` — bring your own schema: anything implementing Standard Schema v1 (Zod 4,
 * Valibot, ArkType, ...) validates the value and its output type is inferred. Issues become the
 * cast error message. No dependency involved — the interface is type-only.
 */
export const schema = <S extends StandardSchemaV1>(validator: S): TypeToken<StandardSchemaV1.InferOutput<S>> => {
  const standard = validator?.['~standard'];
  if (!standard || typeof standard.validate !== 'function')
    throw new Error('[@bou-co/parsing] schema(): expected a Standard Schema (an object with a "~standard" property)');
  const token = new Token<StandardSchemaV1.InferOutput<S>>({
    type: 'custom',
    name: `schema(${standard.vendor})`,
    fn: async (value) => {
      const result = await standard.validate(value);
      if (result.issues) throw new Error(result.issues.map(describeIssue).join('; '));
      return result.value as StandardSchemaV1.InferOutput<S>;
    },
  });
  return token;
};
