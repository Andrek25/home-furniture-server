import { PlayFabServer } from "playfab-sdk";
import { ENV } from "../config/env";

PlayFabServer.settings.titleId = ENV.PLAYFAB_TITLE_ID;
PlayFabServer.settings.developerSecretKey = ENV.PLAYFAB_DEVELOPER_SECRET_KEY;

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
