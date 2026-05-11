export type GraphEdge = {
    from: string;
    to: string[];
};

export type RawGraphEdge = {
    from: string;
    to: string | string[];
};