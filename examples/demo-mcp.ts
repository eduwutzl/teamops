/** Tiny demo arm (MCP server over stdio) with fake data, so "Test" and tool discovery work out of the box. */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'demo-helpdesk', version: '1.0.0' });
const tickets = [{ id: 101, title: 'Cannot log in', status: 'open' }, { id: 102, title: 'Invoice is wrong', status: 'open' }, { id: 103, title: 'Feature request: dark mode', status: 'closed' }];
const text = (v: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(v, null, 2) }] });

server.tool('list_tickets', 'List helpdesk tickets, optionally by status.', { status: z.enum(['open', 'closed']).optional() }, async ({ status }) => text(tickets.filter((t) => !status || t.status === status)));
server.tool('get_ticket', 'Read one ticket by id.', { id: z.number() }, async ({ id }) => text(tickets.find((t) => t.id === id) ?? null));
server.tool('create_ticket', 'Open a new ticket.', { title: z.string() }, async ({ title }) => text({ id: 104, title, status: 'open' }));
server.tool('send_reply', 'Send a reply to the customer of a ticket.', { id: z.number(), message: z.string() }, async ({ id }) => text({ sent: true, id }));
server.tool('delete_ticket', 'Permanently delete a ticket.', { id: z.number() }, async ({ id }) => text({ deleted: id }));

await server.connect(new StdioServerTransport());
