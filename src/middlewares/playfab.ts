/**
 * Express middleware that authenticates requests via PlayFab session tickets.
 *
 * Applied to every furniture route. On success it attaches a `playfab` object
 * to the request so downstream controllers can read the caller's PlayFab ID
 * without repeating the auth call:
 *
 * ```ts
 * const playfab = (req as any).playfab; // { id: string }
 * ```
 *
 * The `as any` cast in controllers is necessary because Express does not
 * support typed request extensions without global module augmentation.
 */

import { type RequestHandler } from "express";
import { validatePlayFabToken } from "../services/playfab";

/**
 * Validates the `X-PlayFab-Auth-Token` request header against the PlayFab
 * `AuthenticateSessionTicket` API and, on success, attaches the caller's
 * PlayFab ID to `req.playfab.id` before calling `next()`.
 *
 * Responds `401` and short-circuits the chain when:
 * - The header is absent.
 * - The token is expired, invalid, or belongs to a banned title.
 * - The PlayFab API call itself fails.
 */
export const playfabMiddleware: RequestHandler = async (req, res, next) => {
  const headerToken = req.headers["x-playfab-auth-token"];
  if (!headerToken) {
    res.sendStatus(401);
    return;
  }
  // HTTP headers can technically appear multiple times; take only the first value.
  const token = Array.isArray(headerToken) ? headerToken[0] : headerToken;
  try {
    const result = await validatePlayFabToken(token);
    const id = result.data.UserInfo?.PlayFabId;
    if (!id) {
      // A successful API response with no PlayFabId should not happen, but
      // guard against it rather than propagating undefined downstream.
      res.sendStatus(401);
      return;
    }
    // Attach to req without module augmentation — controllers read this via
    // (req as any).playfab.
    Object.assign(req, { playfab: { id } });
    next();
  } catch (error) {
    console.error(error);
    res.sendStatus(401);
    return;
  }
};
