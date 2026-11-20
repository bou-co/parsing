import { coords, CoordsType, type Coords } from './data/coords';
import { locale, LocaleType } from './data/locale';
import { record, RecordType } from './data/record';
import { schema } from './data/schema';
import type { StandardSchemaV1 } from './data/standard-schema';

export { coords, CoordsType, locale, LocaleType, record, RecordType, schema };
export type { Coords, StandardSchemaV1 };

export const dataTypes = { record, schema, coords, locale };
