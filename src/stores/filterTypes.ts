export interface Filter {
    includeRecursive: string[] | null;
    excludeRecursive: string[] | null;
    hideCompletedFor: number | null;
}

export const EMPTY_FILTER: Filter = {
    includeRecursive: null,
    excludeRecursive: null,
    hideCompletedFor: null,
};
