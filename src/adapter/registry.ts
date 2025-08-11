import { AdapterError, type IAsyncAdapter, type ISyncAdapter } from "./types";

export class AdapterManager {
    private syncAdapters: ISyncAdapter[] = [];
    private asyncAdapters: IAsyncAdapter[] = [];

    registerSync<TInput, TOutput>(adapter: ISyncAdapter<TInput, TOutput>): void {
        this.syncAdapters.push(adapter);
        this.sortAdaptersByPriority(this.syncAdapters);
    }

    registerAsync<TInput, TOutput>(adapter: IAsyncAdapter<TInput, TOutput>): void {
        this.asyncAdapters.push(adapter);
        this.sortAdaptersByPriority(this.asyncAdapters);
    }

    async executeSync<TInput, TOutput>(input: TInput): Promise<TOutput> {
        for (const adapter of this.syncAdapters) {
            try {
                if (adapter.canHandle(input)) {
                    return (adapter as any).executeWithRetry ?
                        (adapter as any).executeWithRetry(input) :
                        adapter.execute(input);
                }
            } catch (error) {
                continue;
            }
        }

        throw new AdapterError('No suitable sync adapter found', 'sync', undefined, input);
    }

    async executeAsync<TInput, TOutput>(input: TInput): Promise<TOutput> {
        for (const adapter of this.asyncAdapters) {
            try {
                const canHandle = await Promise.resolve(adapter.canHandle(input));
                if (canHandle) {
                    return (adapter as any).executeWithRetry ?
                        await (adapter as any).executeWithRetry(input) :
                        await adapter.execute(input);
                }
            } catch (error) {
                continue;
            }
        }

        throw new AdapterError('No suitable async adapter found', 'async', undefined, input);
    }

    async executeAuto<TInput, TOutput>(input: TInput): Promise<TOutput> {
        try {
            return await this.executeSync<TInput, TOutput>(input);
        } catch (error) {
            return await this.executeAsync<TInput, TOutput>(input);
        }
    }

    private sortAdaptersByPriority(adapters: any[]): void {
        adapters.sort((a, b) => {
            const priorityA = (a.config?.priority || 1);
            const priorityB = (b.config?.priority || 1);
            return priorityB - priorityA;
        });
    }

    async getAdapterMetadata(): Promise<{
        sync: Record<string, any>[];
        async: Record<string, any>[];
    }> {
        const syncMeta = this.syncAdapters.map(adapter =>
            adapter.getMetadata ? adapter.getMetadata() : {}
        );

        const asyncMeta = await Promise.all(
            this.asyncAdapters.map(async adapter =>
                adapter.getMetadata ? await adapter.getMetadata() : {}
            )
        );

        return {
            sync: syncMeta,
            async: asyncMeta,
        };
    }

    getSyncAdapterCount(): number {
        return this.syncAdapters.length;
    }

    getAsyncAdapterCount(): number {
        return this.asyncAdapters.length;
    }

    clearSyncAdapters(): void {
        this.syncAdapters = [];
    }

    clearAsyncAdapters(): void {
        this.asyncAdapters = [];
    }

    clearAllAdapters(): void {
        this.clearSyncAdapters();
        this.clearAsyncAdapters();
    }
}