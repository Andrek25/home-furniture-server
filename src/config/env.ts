interface Env {
  NODE_ENV: "development" | "production";
  DEV: boolean;
  PROD: boolean;
  PORT: number;
  PLAYFAB_TITLE_ID: string;
  PLAYFAB_DEVELOPER_SECRET_KEY: string;
}

const NODE_ENV = <Env["NODE_ENV"]>process.env.NODE_ENV || "development";

export const ENV: Env = {
  NODE_ENV,
  DEV: NODE_ENV === "development",
  PROD: NODE_ENV === "production",
  PORT: Number(process.env.PORT) || 4_000,
  PLAYFAB_TITLE_ID: process.env.PLAYFAB_TITLE_ID || "",
  PLAYFAB_DEVELOPER_SECRET_KEY: process.env.PLAYFAB_DEVELOPER_SECRET_KEY || "",
};
