import { SyncAdapterError, type ISyncAdapter, type SyncAdapterConfig } from "./types";

export abstract class BaseSyncAdapter<TInput = any, TOutput = any> implements ISyncAdapter<TInput, TOutput> {
    protected config: SyncAdapterConfig;

    constructor(config: SyncAdapterConfig = {}) {
        this.config = {
            retries: 1,
            maxExecutionTime: 5000,
            priority: 1,
            ...config,
        };
    }

    abstract execute(input: TInput): TOutput;
    abstract canHandle(input: TInput): boolean;

    executeWithRetry(input: TInput): TOutput {
        let lastError: Error | undefined;
        const maxRetries = this.config.retries || 1;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const startTime = Date.now();
                const result = this.execute(input);
                const executionTime = Date.now() - startTime;

                if (this.config.maxExecutionTime && executionTime > this.config.maxExecutionTime) {
                    throw new SyncAdapterError(
                        `Execution time ${executionTime}ms exceeded maximum ${this.config.maxExecutionTime}ms`,
                        undefined,
                        input
                    );
                }

                return result;
            } catch (error) {
                lastError = error as Error;
                if (attempt === maxRetries - 1) {
                    throw new SyncAdapterError(
                        `Sync adapter failed after ${maxRetries} attempts: ${lastError.message}`,
                        lastError,
                        input
                    );
                }
            }
        }

        throw lastError!;
    }

    getMetadata(): Record<string, any> {
        return {
            type: 'sync',
            config: this.config,
            timestamp: new Date().toISOString(),
        };
    }
}