// This context can be modified per project
export interface CommonContext {
  pipeUndefined?: boolean;
}

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
