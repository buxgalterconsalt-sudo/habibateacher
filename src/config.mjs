import fs from "node:fs";
import path from "node:path";

function readConfig(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return {};
  }
}

export function loadAppConfig(baseDir, env = process.env) {
  const config = {
    siteName: "Habiba teacher",
    maxUploadMb: 100,
    notifyOnFinish: true,
    ...readConfig(path.join(baseDir, "config.json")),
    ...(env.SITE_NAME ? { siteName: env.SITE_NAME } : {}),
    ...(env.ADMIN_PASSWORD ? { adminPassword: env.ADMIN_PASSWORD } : {}),
    ...(env.TELEGRAM_BOT_TOKEN ? { telegramBotToken: env.TELEGRAM_BOT_TOKEN } : {}),
    ...(env.TELEGRAM_BOT_USERNAME ? { telegramBotUsername: env.TELEGRAM_BOT_USERNAME } : {}),
    ...(env.TELEGRAM_CHAT_ID ? { telegramChatId: env.TELEGRAM_CHAT_ID } : {}),
    ...(env.TELEGRAM_URL ? { telegram: env.TELEGRAM_URL } : {}),
    ...(env.CONTACT_PHONE ? { phone: env.CONTACT_PHONE } : {}),
    ...(env.APP_URL ? { appUrl: env.APP_URL } : {}),
    ...(env.MAX_UPLOAD_MB ? { maxUploadMb: Number(env.MAX_UPLOAD_MB) || 60 } : {}),
    ...(env.NOTIFY_ON_FINISH ? { notifyOnFinish: env.NOTIFY_ON_FINISH !== "0" } : {}),
  };

  const volumeDir = env.RAILWAY_VOLUME_MOUNT_PATH || "";
  return {
    config,
    port: Number(env.PORT || config.port || 8788),
    dataDir: env.DATA_DIR
      ? path.resolve(env.DATA_DIR)
      : volumeDir
      ? path.join(volumeDir, "data")
      : path.join(baseDir, "data"),
    storageDir: env.STORAGE_DIR
      ? path.resolve(env.STORAGE_DIR)
      : volumeDir
      ? path.join(volumeDir, "storage")
      : path.join(baseDir, "storage"),
    publicDir: path.join(baseDir, "public"),
    maxUpload: Number(config.maxUploadMb || 60) * 1024 * 1024,
  };
}
