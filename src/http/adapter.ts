import type { HeadersInit } from "bun";
import type { AdapterConfig, ErrorInterceptor, HttpMethod, HttpResponse, RequestConfig, RequestInterceptor, ResponseInterceptor } from "./http";
import { HttpError } from "./http-error";

export class HttpAdapter {
    private requestInterceptors: RequestInterceptor[] = [];
    private responseInterceptors: ResponseInterceptor[] = [];
    private errorInterceptors: ErrorInterceptor[] = [];
    private defaultConfig: AdapterConfig;

    constructor(config: AdapterConfig = {}) {
        this.defaultConfig = {
            timeout: 10000,
            retries: 3,
            validateStatus: (status) => status >= 200 && status < 300,
            headers: {
                'Content-Type': 'application/json',
            },
            ...config,
        };
    }

    addRequestInterceptor(interceptor: RequestInterceptor): void {
        this.requestInterceptors.push(interceptor);
    }

    addResponseInterceptor(interceptor: ResponseInterceptor): void {
        this.responseInterceptors.push(interceptor);
    }

    addErrorInterceptor(interceptor: ErrorInterceptor): void {
        this.errorInterceptors.push(interceptor);
    }

    async request<TResponse = any, TRequest = any>(
        config: RequestConfig<TRequest>
    ): Promise<HttpResponse<TResponse>> {
        try {
            const mergedConfig = this.mergeConfig(config);

            const finalConfig = await this.applyRequestInterceptors(mergedConfig);

            const response = await this.makeRequest<TResponse, TRequest>(finalConfig);

            return await this.applyResponseInterceptors(response);
        } catch (error) {
            return await this.handleError(error as HttpError);
        }
    }

    async get<TResponse = any>(
        url: string,
        config: Omit<RequestConfig, 'method' | 'url'> = {}
    ): Promise<HttpResponse<TResponse>> {
        return this.request<TResponse>({ ...config, method: 'GET', url });
    }

    async post<TResponse = any, TRequest = any>(
        url: string,
        data?: TRequest,
        config: Omit<RequestConfig<TRequest>, 'method' | 'url' | 'data'> = {}
    ): Promise<HttpResponse<TResponse>> {
        return this.request<TResponse, TRequest>({ ...config, method: 'POST', url, data });
    }

    async put<TResponse = any, TRequest = any>(
        url: string,
        data?: TRequest,
        config: Omit<RequestConfig<TRequest>, 'method' | 'url' | 'data'> = {}
    ): Promise<HttpResponse<TResponse>> {
        return this.request<TResponse, TRequest>({ ...config, method: 'PUT', url, data });
    }

    async patch<TResponse = any, TRequest = any>(
        url: string,
        data?: TRequest,
        config: Omit<RequestConfig<TRequest>, 'method' | 'url' | 'data'> = {}
    ): Promise<HttpResponse<TResponse>> {
        return this.request<TResponse, TRequest>({ ...config, method: 'PATCH', url, data });
    }

    async delete<TResponse = any>(
        url: string,
        config: Omit<RequestConfig, 'method' | 'url'> = {}
    ): Promise<HttpResponse<TResponse>> {
        return this.request<TResponse>({ ...config, method: 'DELETE', url });
    }

    async execute<TResponse = any, TRequest = any>(
        options: {
            endpoint: string;
            method?: HttpMethod;
            data?: TRequest;
            params?: Record<string, any>;
            headers?: Record<string, string>;
            transform?: {
                request?: (data: TRequest | undefined) => any;
                response?: <TResponse>(data: any) => TResponse;
            };
            validation?: {
                request?: (data: TRequest) => boolean;
                response?: (data: any) => boolean;
            };
            retries?: number;
            timeout?: number;
        }
    ): Promise<TResponse> {
        const config: RequestConfig<TRequest> = {
            url: options.endpoint,
            method: options.method || 'GET',
            data: options.data,
            params: options.params,
            headers: options.headers,
            retries: options.retries,
            timeout: options.timeout,
            transformRequest: options.transform?.request,
            transformResponse: options.transform?.response,
        };

        if (options.validation?.request && options.data) {
            if (!options.validation.request(options.data)) {
                throw new HttpError('Request validation failed', config);
            }
        }

        const response = await this.request<TResponse, TRequest>(config);

        if (options.validation?.response) {
            if (!options.validation.response(response.data)) {
                throw new HttpError('Response validation failed', config, undefined, response);
            }
        }

        return response.data;
    }

    private mergeConfig<TRequest>(config: RequestConfig<TRequest>): RequestConfig<TRequest> {
        const url = this.buildUrl(config.url || '', config.baseURL || this.defaultConfig.baseURL);

        return {
            ...this.defaultConfig,
            ...config,
            url,
            headers: {
                ...this.defaultConfig.headers,
                ...config.headers,
            },
        };
    }

    private async applyRequestInterceptors<TRequest>(
        config: RequestConfig<TRequest>
    ): Promise<RequestConfig<TRequest>> {
        let finalConfig = config;

        for (const interceptor of this.requestInterceptors) {
            finalConfig = await interceptor(finalConfig);
        }

        return finalConfig;
    }

    private async applyResponseInterceptors<TResponse>(
        response: HttpResponse<TResponse>
    ): Promise<HttpResponse<TResponse>> {
        let finalResponse = response;

        for (const interceptor of this.responseInterceptors) {
            finalResponse = await interceptor(finalResponse);
        }

        return finalResponse;
    }

    private async makeRequest<TResponse, TRequest>(
        config: RequestConfig<TRequest>
    ): Promise<HttpResponse<TResponse>> {
        const { url, method = 'GET', headers, data, timeout, signal } = config;

        if (!url) {
            throw new HttpError('URL is required', config);
        }

        const transformedData = config.transformRequest
            ? config.transformRequest(data)
            : data;

        let body: string | FormData | undefined;
        if (transformedData && method !== 'GET' && method !== 'HEAD') {
            if (transformedData instanceof FormData) {
                body = transformedData;
            } else {
                body = JSON.stringify(transformedData);
            }
        }

        const finalUrl = this.addQueryParams(url, config.params);

        const controller = new AbortController();
        const timeoutId = timeout ? setTimeout(() => controller.abort(), timeout) : null;

        try {
            const request = new Request(finalUrl, {
                method,
                headers: headers as HeadersInit,
                body,
                signal: signal || controller.signal,
            });

            const fetchResponse = await fetch(request);

            if (timeoutId) clearTimeout(timeoutId);

            const responseHeaders: Record<string, string> = {};
            fetchResponse.headers.forEach((value, key) => {
                responseHeaders[key] = value;
            });

            let responseData: any;
            const contentType = fetchResponse.headers.get('content-type');

            if (contentType?.includes('application/json')) {
                responseData = await fetchResponse.json();
            } else if (contentType?.includes('text/')) {
                responseData = await fetchResponse.text();
            } else {
                responseData = await fetchResponse.blob();
            }

            const transformedResponse = config.transformResponse
                ? config.transformResponse<TResponse>(responseData)
                : responseData;

            const response: HttpResponse<TResponse> = {
                data: transformedResponse,
                status: fetchResponse.status,
                statusText: fetchResponse.statusText,
                headers: responseHeaders,
                config,
                request,
            };

            const validateStatus = config.validateStatus || this.defaultConfig.validateStatus!;
            if (!validateStatus(response.status)) {
                throw HttpError.fromResponse(response, config);
            }

            return response;
        } catch (error) {
            if (timeoutId) clearTimeout(timeoutId);

            if (error instanceof HttpError) {
                throw error;
            }

            if (error instanceof Error) {
                if (error.name === 'AbortError') {
                    throw HttpError.fromTimeout(config);
                }
                throw HttpError.fromNetworkError(error, config);
            }

            throw new HttpError('Unknown error occurred', config);
        }
    }

    private async handleError(error: HttpError): Promise<HttpResponse> {
        let currentError = error;

        for (const interceptor of this.errorInterceptors) {
            try {
                return await interceptor(currentError);
            } catch (interceptorError) {
                currentError = interceptorError as HttpError;
            }
        }

        if (currentError.config?.retries && currentError.config.retries > 0) {
            const retryConfig = {
                ...currentError.config,
                retries: currentError.config.retries - 1,
            };

            const delay = Math.pow(2, (this.defaultConfig.retries || 3) - retryConfig.retries) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));

            return this.request(retryConfig);
        }

        throw currentError;
    }

    private buildUrl(url: string, baseURL?: string): string {
        if (url.startsWith('http://') || url.startsWith('https://')) {
            return url;
        }

        if (!baseURL) {
            return url;
        }

        const base = baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL;
        const path = url.startsWith('/') ? url : `/${url}`;

        return `${base}${path}`;
    }

    private addQueryParams(url: string, params?: Record<string, any>): string {
        if (!params || Object.keys(params).length === 0) {
            return url;
        }

        const urlObj = new URL(url, '');

        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                urlObj.searchParams.append(key, String(value));
            }
        });

        return url.includes('://') ? urlObj.toString() : `${urlObj.pathname}${urlObj.search}`;
    }
}

export function createHttpAdapter(config?: AdapterConfig): HttpAdapter {
    return new HttpAdapter(config);
}

export type InferResponseType<T> = T extends (...args: any[]) => Promise<HttpResponse<infer R>>
    ? R
    : never;

export class TypedRequestBuilder<TResponse = any, TRequest = any> {
    private config: RequestConfig<TRequest> = {};

    constructor(private adapter: HttpAdapter) { }

    url(url: string): this {
        this.config.url = url;
        return this;
    }

    method(method: HttpMethod): this {
        this.config.method = method;
        return this;
    }

    data(data: TRequest): this {
        this.config.data = data;
        return this;
    }

    headers(headers: Record<string, string>): this {
        this.config.headers = { ...this.config.headers, ...headers };
        return this;
    }

    params(params: Record<string, any>): this {
        this.config.params = params;
        return this;
    }

    timeout(timeout: number): this {
        this.config.timeout = timeout;
        return this;
    }

    retries(retries: number): this {
        this.config.retries = retries;
        return this;
    }

    transformRequest(transformer: (data: TRequest | undefined) => any): this {
        this.config.transformRequest = transformer;
        return this;
    }

    transformResponse(transformer: <TResponse>(data: any | undefined) => TResponse): this {
        this.config.transformResponse = transformer;
        return this;
    }

    async execute(): Promise<HttpResponse<TResponse>> {
        return this.adapter.request<TResponse, TRequest>(this.config);
    }

    async send(): Promise<TResponse> {
        const response = await this.execute();
        return response.data;
    }
}