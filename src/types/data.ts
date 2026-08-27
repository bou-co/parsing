// `@bou-co/parsing/types/data` — data-shape helpers. Register with `initializeParser({ types: { ...dataTypes } })`
import { coords, CoordsType, type Coords } from './data/coords';
import { locale, LocaleType } from './data/locale';
import { record, RecordType } from './data/record';
import { schema } from './data/schema';
import type { StandardSchemaV1 } from './data/standard-schema';
import { notAPipe } from './namespace-marker';

export { coords, CoordsType, locale, LocaleType, record, RecordType, schema };
export type { Coords, StandardSchemaV1 };

export const dataTypes = { record, schema: notAPipe(schema), coords, locale };
