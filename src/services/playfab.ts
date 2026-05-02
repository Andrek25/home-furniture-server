/**
 * Thin wrapper around the `playfab-sdk` Server API.
 *
 * The SDK is callback-based and uses a global settings object for credentials.
 * This module configures those credentials at import time and exposes
 * Promise-based helpers so the rest of the codebase can use async/await.
 *
 * Required environment variables (set before this module is imported):
 * - `PLAYFAB_TITLE_ID` — the PlayFab title identifier.
 * - `PLAYFAB_DEVELOPER_SECRET_KEY` — the server-side secret key; never expose
 *   this to clients.
 */

import { PlayFabServer } from "playfab-sdk";
import { ENV } from "../config/env";

// Configure the SDK globally. These must be set before any API call is made.
PlayFabServer.settings.titleId = ENV.PLAYFAB_TITLE_ID;
PlayFabServer.settings.developerSecretKey = ENV.PLAYFAB_DEVELOPER_SECRET_KEY;

/**
 * Validates a PlayFab session ticket obtained by a client after login.
 *
 * Wraps `PlayFabServer.AuthenticateSessionTicket`, which is a server-side
 * call that requires the developer secret key — clients cannot call it
 * themselves.
 *
 * Rejects (causing `playfabMiddleware` to respond `401`) when:
 * - The PlayFab API returns an error (invalid ticket format, network failure, etc.).
 * - `IsSessionTicketExpired` is `true` in the API response.
 * - The user's title account has been banned.
 *
 * @param token - The raw session ticket string from the `X-PlayFab-Auth-Token`
 *   request header.
 * @returns The full PlayFab success container on a valid, unexpired, unbanned ticket.
 * @throws A string error message on any validation failure.
 */
export async function validatePlayFabToken(
  token: string
): Promise<
  PlayFabModule.IPlayFabSuccessContainer<PlayFabServerModels.AuthenticateSessionTicketResult>
> {
  return new Promise((resolve, reject) => {
    PlayFabServer.AuthenticateSessionTicket(
      { SessionTicket: token },
      (error, result) => {
        if (error) {
          reject(error.errorMessage);
          return;
        }
        if (result.data.IsSessionTicketExpired) {
          reject("Session ticket expired");
          return;
        }
        // isBanned lives three levels deep in the response; all guards are
        // needed because any intermediate property can be absent.
        if (
          result.data.UserInfo &&
          result.data.UserInfo.TitleInfo &&
          result.data.UserInfo.TitleInfo.isBanned
        ) {
          reject("Title is banned");
          return;
        }
        resolve(result);
      }
    );
  });
}

/**
 * Checks whether a PlayFab account exists for the given PlayFab ID.
 *
 * Unlike `validatePlayFabToken`, this performs a direct account lookup rather
 * than validating a session ticket. It is a soft check: API errors resolve to
 * `false` rather than rejecting, making it safe to use as a guard without
 * try/catch at the call site.
 *
 * The `errorDetails.PlayFabId` field is appended to the log when present
 * because the SDK surfaces field-level validation errors there (e.g. the ID
 * format is wrong) in addition to the top-level `errorMessage`.
 *
 * @param playfabId - The PlayFab ID to look up.
 * @returns `true` if the account exists, `false` on any error or not-found.
 */
export async function checkIfPlayFabIdExists(
  playfabId: string
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    PlayFabServer.GetUserAccountInfo(
      { PlayFabId: playfabId },
      (error, result) => {
        if (error) {
          let errorMessage = error.errorMessage;
          // errorDetails.PlayFabId contains field-level validation messages
          // from the SDK (e.g. "Value '' is not valid") when the ID is malformed.
          if (error.errorDetails && error.errorDetails.PlayFabId) {
            errorMessage += ` - ${error.errorDetails.PlayFabId}`;
          }
          console.error(errorMessage);
          resolve(false);
          return;
        }
        resolve(true);
      }
    );
  });
}
