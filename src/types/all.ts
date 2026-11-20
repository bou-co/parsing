// Content types need peer dependencies and stay behind `@bou-co/parsing/types/content`
import { dataTypes } from './data';
import { formatTypes } from './format';

export * from './format';
export * from './data';

export const allTypes = { ...formatTypes, ...dataTypes };
