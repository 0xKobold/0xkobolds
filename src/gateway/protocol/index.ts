/**
 * Gateway Protocol - Public API
 */

export {
  PROTOCOL_VERSION,
  ErrorCodes,
  errorShape,
  isValidRequestFrame,
  isValidEventFrame,
} from "./frames";

export type {
  RequestFrame,
  ResponseFrame,
  EventFrame,
  ErrorShape,
  HelloOk,
  ConnectParams,
} from "./frames";
