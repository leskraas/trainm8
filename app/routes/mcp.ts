import { handleMcpRequest } from '#app/mcp/handle.server.ts'
import { type Route } from './+types/mcp.ts'

/**
 * `/mcp`: the MCP server (ADR 0092 §8), a reader of the action registry. A
 * resource route, so React Router hands the request over whole; every method
 * goes to the same guarded handler, which answers GET and DELETE with 405 as
 * a stateless server does.
 */
export async function loader({ request }: Route.LoaderArgs) {
	return handleMcpRequest(request)
}

export async function action({ request }: Route.ActionArgs) {
	return handleMcpRequest(request)
}
