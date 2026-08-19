import { ParserContextHook } from './parser-types';

// This context can be modified per project
export interface CommonContext {
  pipeUndefined?: boolean;
  before?: ParserContextHook;
  after?: ParserContextHook;
}

// This context can be modified per project
export interface FunctionalContext {}

// This context can be modified per project
export interface GlobalContext {}

// This context can be modified per project
export interface CreateContext {}

// This context can be modified per project
export interface InstanceContext {}

// Add custom caching options per project
export interface ParserCachingOptions {
  enabled?: boolean;
}
