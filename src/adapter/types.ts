export type AsyncOrSync<T> = T | Promise<T>;

export interface BaseOperation<TInput = any, TOutput = any> {
    input?: TInput;
    output?: TOutput;
    metadata?: Record<string, any>;
}

export interface SyncOperation<TInput = any, TOutput = any> extends BaseOperation<TInput, TOutput> {
    execute(input: TInput): TOutput;
}

export interface AsyncOperation<TInput = any, TOutput = any> extends BaseOperation<TInput, TOutput> {
    execute(input: TInput): Promise<TOutput>;
}

export interface UniversalOperation<TInput = any, TOutput = any> extends BaseOperation<TInput, TOutput> {
    execute(input: TInput): AsyncOrSync<TOutput>;
}

export interface ISyncAdapter<TInput = any, TOutput = any> {
    execute(input: TInput): TOutput;
    canHandle(input: TInput): boolean;
    getMetadata?(): Record<string, any>;
}

export interface IAsyncAdapter<TInput = any, TOutput = any> {
    execute(input: TInput): Promise<TOutput>;
    canHandle(input: TInput): boolean | Promise<boolean>;
    getMetadata?(): Record<string, any> | Promise<Record<string, any>>;
}

export interface IUniversalAdapter<TInput = any, TOutput = any> {
    execute(input: TInput): AsyncOrSync<TOutput>;
    canHandle(input: TInput): AsyncOrSync<boolean>;
    isAsync(): boolean;
    getMetadata?(): AsyncOrSync<Record<string, any>>;
}

export interface AdapterConfig {
    timeout?: number;
    retries?: number;
    cache?: boolean;
    priority?: number;
    fallback?: boolean;
}

export interface SyncAdapterConfig extends AdapterConfig {
    maxExecutionTime?: number;
}

export interface AsyncAdapterConfig extends AdapterConfig {
    concurrency?: number;
    queueSize?: number;
    backoff?: 'linear' | 'exponential';
}

export class AdapterError extends Error {
    constructor(
        message: string,
        public adapterType: 'sync' | 'async' | 'universal',
        public originalError?: Error,
        public input?: any
    ) {
        super(message);
        this.name = 'AdapterError';
    }
}

export class SyncAdapterError extends AdapterError {
    constructor(message: string, originalError?: Error, input?: any) {
        super(message, 'sync', originalError, input);
        this.name = 'SyncAdapterError';
    }
}

export class AsyncAdapterError extends AdapterError {
    constructor(message: string, originalError?: Error, input?: any) {
        super(message, 'async', originalError, input);
        this.name = 'AsyncAdapterError';
    }
}