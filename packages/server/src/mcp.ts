/** Tests an arm (MCP server) and discovers its tools with the official SDK: initialize + tools/list. */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export interface McpConfig { transport: 'stdio' | 'http' | 'sse'; command: string; args: string[]; url: string; env: Record<string, string> }
export interface McpTestResult { ok: boolean; message: string; server: string; ms: number; tools: { name: string; description: string }[] }

export async function testMcp(cfg: McpConfig, timeoutMs = 20_000): Promise<McpTestResult> {
  const started = Date.now();
  const client = new Client({ name: 'teamops', version: '2.0.0' });
  try {
    const transport = cfg.transport === 'stdio'
      ? new StdioClientTransport({ command: cfg.command, args: cfg.args, env: { ...(process.env as Record<string, string>), ...cfg.env }, stderr: 'ignore' })
      : cfg.transport === 'sse' ? new SSEClientTransport(new URL(cfg.url)) : new StreamableHTTPClientTransport(new URL(cfg.url));
    await client.connect(transport, { timeout: timeoutMs });
    const list = await client.listTools(undefined, { timeout: timeoutMs });
    const info = client.getServerVersion();
    const tools = list.tools.map((t) => ({ name: t.name, description: (t.description ?? '').split('\n')[0].slice(0, 300) }));
    return { ok: true, message: `Respondeu em ${Date.now() - started} ms com ${tools.length} ferramenta(s).`, server: info ? `${info.name} ${info.version}` : '', ms: Date.now() - started, tools };
  } catch (e) {
    const msg = (e as Error).message || 'erro desconhecido';
    const friendly = /ENOENT/.test(msg) ? 'Comando não encontrado nesta máquina.' : /timed out|timeout/i.test(msg) ? 'O braço não respondeu a tempo.' : /ECONNREFUSED|fetch failed/i.test(msg) ? 'Ninguém respondeu nesse endereço.' : msg.slice(0, 200);
    return { ok: false, message: friendly, server: '', ms: Date.now() - started, tools: [] };
  } finally {
    await client.close().catch(() => {});
  }
}
