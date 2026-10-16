/* eslint-disable @typescript-eslint/no-explicit-any */
import { evaluateVariableExpression } from './parser-patterns';
import { ParserContext } from './parser-types';

const createProxy = (path: string[] = []): any => {
  const expression = path.join('.');
  return new Proxy((context: ParserContext) => evaluateVariableExpression(expression, context), {
    get: (target, prop) => {
      if (prop === Symbol.toPrimitive || prop === 'toString' || prop === 'valueOf' || prop === 'toJSON') {
        return () => `{{${expression}}}`;
      }
      if (typeof prop === 'string') {
        return createProxy([...path, prop]);
      }
      return undefined;
    },
  });
};

export const variables = createProxy();
