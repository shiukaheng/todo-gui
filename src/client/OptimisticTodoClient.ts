import type {
    AppState,
    ViewListOut,
    BatchResponse,
    DefaultApi,
    BatchOperationsApiBatchPostRequest,
    DisplayBatchOperationsRequest,
} from 'todo-client';
import { subscribeToState, subscribeToDisplay } from 'todo-client';
import { applyBatchOps, applyDisplayOps } from './applyOptimistic';

/**
 * Structural interface matching the subset of DefaultApi that commands use.
 * DefaultApi satisfies this structurally, as does OptimisticTodoClient.
 */
export interface TodoApi {
    batchOperationsApiBatchPost(
        requestParameters: BatchOperationsApiBatchPostRequest,
        initOverrides?: RequestInit,
    ): Promise<BatchResponse>;
    displayBatchOperationsApiDisplayBatchPost(
        requestParameters: DisplayBatchOperationsRequest,
        initOverrides?: RequestInit,
    ): Promise<BatchResponse>;
}

/**
 * Wraps DefaultApi + SSE subscriptions to provide optimistic updates.
 *
 * Data flow:
 *   Command calls batchOperationsApiBatchPost(...)
 *     1. Clone stateSnapshot, apply ops → optimistic AppState
 *     2. Push to stateCallback → store re-renders instantly
 *     3. Forward to real DefaultApi → server processes
 *   Server SSE pushes authoritative AppState
 *     1. Overwrite stateSnapshot with server truth
 *     2. Push to stateCallback → store corrects with authoritative data
 */
export class OptimisticTodoClient implements TodoApi {
    private api: DefaultApi;
    private stateSnapshot: AppState | null = null;
    private displaySnapshot: ViewListOut | null = null;
    private stateCallback: ((data: AppState) => void) | null = null;
    private displayCallback: ((data: ViewListOut) => void) | null = null;

    constructor(api: DefaultApi) {
        this.api = api;
    }

    /**
     * Wraps subscribeToState — intercepts SSE to capture server state.
     */
    subscribeToState(
        onUpdate: (data: AppState) => void,
        options?: { baseUrl?: string; onError?: (err: Event) => void },
    ): () => void {
        this.stateCallback = onUpdate;
        return subscribeToState((data) => {
            this.stateSnapshot = data;
            onUpdate(data);
        }, options);
    }

    /**
     * Wraps subscribeToDisplay — same pattern.
     */
    subscribeToDisplay(
        onUpdate: (data: ViewListOut) => void,
        options?: { baseUrl?: string; onError?: (err: Event) => void },
    ): () => void {
        this.displayCallback = onUpdate;
        return subscribeToDisplay((data) => {
            this.displaySnapshot = data;
            onUpdate(data);
        }, options);
    }

    /**
     * Wraps api.batchOperationsApiBatchPost with optimistic update.
     */
    async batchOperationsApiBatchPost(
        requestParameters: BatchOperationsApiBatchPostRequest,
        initOverrides?: RequestInit,
    ): Promise<BatchResponse> {
        // 1. Apply optimistic update if we have a snapshot
        if (this.stateSnapshot && this.stateCallback) {
            const ops = requestParameters.batchRequest.operations;
            const optimistic = applyBatchOps(this.stateSnapshot, ops);
            this.stateCallback(optimistic);
        }

        // 2. Forward to real API — server SSE will override with truth
        return this.api.batchOperationsApiBatchPost(requestParameters, initOverrides);
    }

    /**
     * Wraps api.displayBatchOperationsApiDisplayBatchPost with optimistic update.
     */
    async displayBatchOperationsApiDisplayBatchPost(
        requestParameters: DisplayBatchOperationsRequest,
        initOverrides?: RequestInit,
    ): Promise<BatchResponse> {
        // 1. Apply optimistic update if we have a snapshot
        if (this.displaySnapshot && this.displayCallback) {
            const ops = requestParameters.displayBatchRequest.operations;
            const optimistic = applyDisplayOps(this.displaySnapshot, ops);
            this.displayCallback(optimistic);
        }

        // 2. Forward to real API — server SSE will override with truth
        return this.api.displayBatchOperationsApiDisplayBatchPost(requestParameters, initOverrides);
    }
}
