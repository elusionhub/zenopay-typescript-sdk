import type { HttpResponse, RequestConfig } from "./http";

export class HttpError extends Error implements HttpError {
    constructor(
        message: string,
        public config?: RequestConfig,
        public request?: Request,
        public response?: HttpResponse,
        public code?: string,
        public status?: number
    ) {
        super(message);
        this.name = 'HttpError';

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, HttpError);
        }
    }

    static fromResponse(response: HttpResponse, config: RequestConfig): HttpError {
        return new HttpError(
            `Request failed with status ${response.status}: ${response.statusText}`,
            config,
            undefined,
            response,
            'REQUEST_FAILED',
            response.status
        );
    }

    static fromNetworkError(error: Error, config: RequestConfig): HttpError {
        return new HttpError(
            `Network Error: ${error.message}`,
            config,
            undefined,
            undefined,
            'NETWORK_ERROR'
        );
    }

    static fromTimeout(config: RequestConfig): HttpError {
        return new HttpError(
            'Request timeout',
            config,
            undefined,
            undefined,
            'TIMEOUT'
        );
    }
}