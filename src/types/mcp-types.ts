export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface MCPRequest {
  method: string;
  params?: any;
}

export interface MCPResponse {
  content?: Array<{
    type: string;
    text: string;
  }>;
  isError?: boolean;
}

export interface MCPError {
  code: number;
  message: string;
  data?: any;
}

export interface MCPServerConfig {
  name: string;
  version: string;
  capabilities: {
    tools?: boolean;
    resources?: boolean;
    prompts?: boolean;
    logging?: boolean;
  };
}