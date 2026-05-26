export type Vulnerability = {
  file: string;
  severity: string;
  message: string;
  metadata?: {
    cwe?: string;
  };
};

export enum NodeKind {
  Service = "service",
  RDS = "rds",
  SQS = "sqs",
}

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
