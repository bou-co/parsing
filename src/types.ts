import { defineType, types } from './parser-casting';

export const string = types.string;
export const number = types.number;
export const boolean = types.boolean;
export const date = types.date;
export const object = types.object;
export const array = types.array;
export const any = types.any;
export const unknown = types.unknown;

export { defineType };
