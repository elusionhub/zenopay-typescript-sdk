import type { HttpError } from "./http-error";

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface RequestConfig<TRequest = any> {
    method?: HttpMethod;
    url?: string;
    baseURL?: string;
    headers?: Record<string, string>;
    params?: Record<string, any>;
    data?: TRequest;
    timeout?: number;
    retries?: number;
    validateStatus?: (status: number) => boolean;
    transformRequest?: (data: TRequest | undefined) => any;
    transformResponse?: <TResponse>(data: any) => TResponse;
    signal?: AbortSignal;
}

export interface HttpResponse<TResponse = any> {
    data: TResponse;
    status: number;
    statusText: string;
    headers: Record<string, string>;
    config: RequestConfig;
    request?: Request;
}

export type RequestInterceptor = (config: RequestConfig) => RequestConfig | Promise<RequestConfig>;
export type ResponseInterceptor<T = any> = (response: HttpResponse<T>) => HttpResponse<T> | Promise<HttpResponse<T>>;
export type ErrorInterceptor = (error: HttpError) => Promise<never> | Promise<HttpResponse>;

export interface AdapterConfig {
    baseURL?: string;
    timeout?: number;
    headers?: Record<string, string>;
    retries?: number;
    validateStatus?: (status: number) => boolean;
    transformRequest?: (data: any) => any;
    transformResponse?: (data: any) => any;
}