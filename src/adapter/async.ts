import { type IAsyncAdapter, type AsyncAdapterConfig, AsyncAdapterError } from "./types";

export abstract class BaseAsyncAdapter<TInput = any, TOutput = any> implements IAsyncAdapter<TInput, TOutput> {
    protected config: AsyncAdapterConfig;
    private executionQueue: Array<() => Promise<any>> = [];
    private activeExecutions = 0;

    constructor(config: AsyncAdapterConfig = {}) {
        this.config = {
            timeout: 10000,
            retries: 3,
            concurrency: 5,
            queueSize: 100,
            backoff: 'exponential',
            priority: 1,
            ...config,
        };
    }

    abstract execute(input: TInput): Promise<TOutput>;
    abstract canHandle(input: TInput): boolean | Promise<boolean>;

    async executeWithRetry(input: TInput): Promise<TOutput> {
        return this.addToQueue(() => this.performExecuteWithRetry(input));
    }

    private async performExecuteWithRetry(input: TInput): Promise<TOutput> {
        let lastError: Error | undefined;
        const maxRetries = this.config.retries || 1;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                this.activeExecutions++;

                const timeoutPromise = this.config.timeout
                    ? new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new AsyncAdapterError('Request timeout', undefined, input)), this.config.timeout)
                    )
                    : null;

                const executePromise = this.execute(input);
                const result = timeoutPromise
                    ? await Promise.race([executePromise, timeoutPromise])
                    : await executePromise;

                return result;
            } catch (error) {
                lastError = error as Error;

                if (attempt < maxRetries - 1) {
                    const delay = this.calculateBackoffDelay(attempt);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            } finally {
                this.activeExecutions--;
            }
        }

        throw new AsyncAdapterError(
            `Async adapter failed after ${maxRetries} attempts: ${lastError!.message}`,
            lastError,
            input
        );
    }

    private async addToQueue<T>(operation: () => Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            if (this.executionQueue.length >= (this.config.queueSize || 100)) {
                reject(new AsyncAdapterError('Execution queue is full'));
                return;
            }

            const queuedOperation = async () => {
                try {
                    while (this.activeExecutions >= (this.config.concurrency || 5)) {
                        await new Promise(resolve => setTimeout(resolve, 10));
                    }
                    const result = await operation();
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            };

            this.executionQueue.push(queuedOperation);
            this.processQueue();
        });
    }

    private async processQueue(): Promise<void> {
        if (this.executionQueue.length === 0 || this.activeExecutions >= (this.config.concurrency || 5)) {
            return;
        }

        const operation = this.executionQueue.shift();
        if (operation) {
            operation().finally(() => this.processQueue());
        }
    }

    private calculateBackoffDelay(attempt: number): number {
        const baseDelay = 1000;
        return this.config.backoff === 'exponential'
            ? baseDelay * Math.pow(2, attempt)
            : baseDelay * (attempt + 1);
    }

    async getMetadata(): Promise<Record<string, any>> {
        return {
            type: 'async',
            config: this.config,
            queueSize: this.executionQueue.length,
            activeExecutions: this.activeExecutions,
            timestamp: new Date().toISOString(),
        };
    }
}