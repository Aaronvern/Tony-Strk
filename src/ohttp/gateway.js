import { OHTTPServer } from 'ohttp-ts';
import { validatePublicUrl } from '../mcp/url-policy.js';

export function createOhttpGateway({ keyConfig, browse, validate = validatePublicUrl }) {
  const server = new OHTTPServer([keyConfig]);

  return {
    async handle(request) {
      const { request: innerRequest, context } = await server.decapsulateRequest(request);
      try {
        const url = await validate(innerRequest.url);
        const result = await browse({ url: url.href });
        return context.encapsulateResponse(Response.json(result));
      } catch (error) {
        return context.encapsulateResponse(Response.json({ error: error.message }, { status: 400 }));
      }
    },
  };
}
