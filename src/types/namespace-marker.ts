/* eslint-disable @typescript-eslint/no-explicit-any */
import type { TypeToken } from '../type-token';

/** A parameterised type (`oneOf(...)`, `pattern(re)`): called with its parameters, returns a token */
export type ParserTypeFactory = (...params: any[]) => TypeToken;

/** Mark a factory that takes tokens as parameters, so the pipe layer never calls it with template literals */
export const notAPipe = <F extends ParserTypeFactory>(factory: F): F => Object.assign(factory, { _pipe: false });
