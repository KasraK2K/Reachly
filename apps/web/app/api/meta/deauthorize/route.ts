import { forwardSignedRequest } from "../forward"

/** Public: Meta calls this when someone removes the app from their Instagram account. */
export const POST = (req: Request) => forwardSignedRequest(req, "/meta/deauthorize")
