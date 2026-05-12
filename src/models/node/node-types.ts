export type Vulnerability = {
  file: string;
  severity: string;
  message: string;
  metadata?: {
    cwe?: string;
  };
};

export type NodeKind =
  | "service"
  | "rds"
  | "sqs";

export type GraphNode = {
  name: string;
  kind: NodeKind;
  publicExposed?: boolean;
  vulnerabilities?: Vulnerability[];
  metadata?: {
    cloud?: string;
    engine?: string;
    version?: string;
  };
};

export type NodeFilter = {
  kind?: NodeKind;
  publicExposed?: boolean;
  vulnerable?: boolean;
}