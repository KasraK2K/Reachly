import { forwardSignedRequest } from "../forward"

/** Public: Meta's data deletion request callback. */
export const POST = (req: Request) => forwardSignedRequest(req, "/meta/data-deletion")
