import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { createBrowseHandler } from '../src/mcp/browse.js';

function createServer() {
  const browse = createBrowseHandler();
  const server = new McpServer({ name: 'tony-strk', version: '0.1.0' });

  server.registerTool(
    'browse',
    {
      title: 'Browse through the isolated worker',
      description: 'Loads one public HTTP(S) URL through the configured isolated worker. No wallet, payment, or STRK20 transaction is used.',
      inputSchema: { url: z.string().url() },
    },
    async ({ url }) => {
      try {
        const result = await browse({ url });
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: error.message }], isError: true };
      }
    },
  );
  return server;
}

serveStdio(createServer, { onerror: (error) => process.stderr.write(`${error.message}\n`) });
