// `@bou-co/parsing/types/all` — every dependency-free tier-2 type. Content types (peer dependencies) stay explicit: `@bou-co/parsing/types/content`
import { dataTypes } from './data';
import { formatTypes } from './format';

export * from './format';
export * from './data';

export const allTypes = { ...formatTypes, ...dataTypes };
