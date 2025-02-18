import { type RequestHandler } from "express";
import { validatePlayFabToken } from "../services/playfab";

export const playfabMiddleware: RequestHandler = async (req, res, next) => {
  const headerToken = req.headers["x-playfab-auth-token"];
  if (!headerToken) {
    res.sendStatus(401);
    return;
  }
  const token = Array.isArray(headerToken) ? headerToken[0] : headerToken;
  try {
    const result = await validatePlayFabToken(token);
    const id = result.data.UserInfo?.TitleInfo?.TitlePlayerAccount?.Id;
    if (!id) {
      res.sendStatus(401);
      return;
    }
    Object.assign(req, { playfab: { id } });
    next();
  } catch (error) {
    console.error(error);
    res.sendStatus(401);
    return;
  }
};
