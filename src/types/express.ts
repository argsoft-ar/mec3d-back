import { TokenPayload } from "../interfaces/auth.interface";

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}
