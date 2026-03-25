export interface CloudflareEnvelope<T> {
  success: boolean;
  result: T;
  errors: CloudflareApiError[];
  messages: CloudflareApiMessage[];
  result_info?: CloudflareResultInfo;
}

export interface CloudflareApiError {
  code: number;
  message: string;
}

export interface CloudflareApiMessage {
  code: number;
  message: string;
}

export interface CloudflareResultInfo {
  count?: number;
  page?: number;
  per_page?: number;
  total_count?: number;
}

export interface CloudflareAccountRef {
  id: string;
  name?: string;
}

export interface CloudflareZone {
  id: string;
  name: string;
  status?: string;
  account: CloudflareAccountRef;
}

export interface CloudflareDestinationAddress {
  id: string;
  email: string;
  created?: string;
  modified?: string;
  verified: string | null;
}

export interface CloudflareEmailRoutingSettings {
  id: string;
  name: string;
  enabled: boolean;
}

export interface CloudflareDnsRecord {
  content: string;
  name: string;
  priority?: number;
  ttl?: number;
  type: string;
}

export interface CloudflareEmailRoutingRuleAction {
  type: string;
  value?: string[];
}

export interface CloudflareEmailRoutingRuleMatcher {
  type: string;
  field: string;
  value: string;
}

export interface CloudflareEmailRoutingRule {
  id: string;
  name: string;
  enabled: boolean;
  actions: CloudflareEmailRoutingRuleAction[];
  matchers: CloudflareEmailRoutingRuleMatcher[];
  priority?: number;
  tag?: string;
}
