import mysql from "mysql2/promise";
import { appRouter } from "../server/routers.ts";
import { createUser, getUserByEmail, PENDING_ALLOWLIST_LOGIN_METHOD } from "../server/services/auth.service.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not configured");
}

const pool = mysql.createPool(databaseUrl);
const tempEmail = `setup-check-${Date.now()}@example.com`;
const capturedCookies = [];

const ctx = {
  user: null,
  req: {
    protocol: "https",
    headers: {},
    cookies: {},
  },
  res: {
    cookie: (name, value, options) => {
      capturedCookies.push({ name, value, options });
    },
    clearCookie: () => {},
  },
};

try {
  await pool.query("delete from users where lower(email) = ?", [tempEmail]);

  await createUser({
    email: tempEmail,
    name: "Pending Setup",
    role: "viewer",
    loginMethod: PENDING_ALLOWLIST_LOGIN_METHOD,
    isActive: true,
  });

  const caller = appRouter.createCaller(ctx);
  const result = await caller.auth.setupPassword({
    email: tempEmail,
    name: "Setup Validation",
    password: "ValidPass123!",
  });

  const updatedUser = await getUserByEmail(tempEmail);
  if (!updatedUser) {
    throw new Error("Temporary validation user was not found after setupPassword");
  }

  if (updatedUser.loginMethod !== "password") {
    throw new Error(`Expected loginMethod=password but received ${updatedUser.loginMethod}`);
  }

  if (!updatedUser.passwordHash) {
    throw new Error("Expected passwordHash to be populated after setupPassword");
  }

  console.log(JSON.stringify({
    success: true,
    email: tempEmail,
    result,
    cookieCount: capturedCookies.length,
    loginMethod: updatedUser.loginMethod,
    hasPasswordHash: Boolean(updatedUser.passwordHash),
  }, null, 2));
} finally {
  await pool.query("delete from users where lower(email) = ?", [tempEmail]);
  await pool.end();
}
