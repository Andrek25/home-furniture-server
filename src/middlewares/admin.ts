import { type RequestHandler } from "express";
import { ENV } from "../config/env";
import { validatePlayFabToken } from "../services/playfab";

/**
 * Gates /admin/* routes to a single PlayFab account (ENV.ADMIN_PLAYFAB_ID,
 * default DAB674F3C666368C — ivrishostapp). The caller authenticates with the
 * same X-PlayFab-Auth-Token header used by the rest of the API; we resolve it
 * via PlayFab and only allow the request through if the returned PlayFabId
 * matches the configured admin ID.
 */
export const adminMiddleware: RequestHandler = async (req, res, next) => {
  const headerToken = req.headers["x-playfab-auth-token"];
  if (!headerToken) {
    res.sendStatus(401);
    return;
  }
  const token = Array.isArray(headerToken) ? headerToken[0] : headerToken;
  try {
    const result = await validatePlayFabToken(token);
    const id = result.data.UserInfo?.PlayFabId;
    if (!id || id !== ENV.ADMIN_PLAYFAB_ID) {
      res.sendStatus(403);
      return;
    }
    Object.assign(req, { playfab: { id } });
    next();
  } catch (error) {
    console.error(error);
    res.sendStatus(401);
  }
};
