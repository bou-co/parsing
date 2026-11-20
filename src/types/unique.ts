import type { TypeToken } from '../type-token';
import { array, ArrayType } from './array';
import { notAPipe } from './namespace-marker';

/** `unique(item)`: same as `types.array.of(item).unique` */
export const unique = /* @__PURE__ */ notAPipe(<T>(item: TypeToken<T>): ArrayType<T> => array.of(item).unique);
