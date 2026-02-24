import puppeteer from "puppeteer";
import path from "path";
import fs from "fs";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const SCREENSHOTS_DIR = path.join(process.cwd(), "screenshots");

// Pages that require auth
const AUTH_PAGES = [
  { name: "dashboard", path: "/dashboard" },
  { name: "gastos", path: "/gastos" },
  { name: "categorias", path: "/categorias" },
  { name: "espacios", path: "/espacios" },
  { name: "configuracion", path: "/configuracion" },
];

// Public pages
const PUBLIC_PAGES = [
  { name: "login", path: "/login" },
  { name: "register", path: "/register" },
];

async function takeScreenshots() {
  // Ensure screenshots directory exists
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1440, height: 900 },
  });

  const page = await browser.newPage();

  // Screenshot public pages
  for (const pg of PUBLIC_PAGES) {
    await page.goto(`${BASE_URL}${pg.path}`, { waitUntil: "networkidle2", timeout: 15000 });
    await page.waitForSelector("body", { timeout: 5000 });
    await new Promise((r) => setTimeout(r, 500)); // wait for animations
    const filePath = path.join(SCREENSHOTS_DIR, `${pg.name}.png`);
    await page.screenshot({ path: filePath, fullPage: true });
    console.log(`  Captured: ${pg.name} -> ${filePath}`);
  }

  // Login to get auth tokens
  console.log("\n  Logging in as demo@misgastos.app...");
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle2", timeout: 15000 });

  // Fill and submit login form
  await page.waitForSelector('input[type="email"]', { timeout: 5000 });
  await page.type('input[type="email"]', "demo@misgastos.app");
  await page.type('input[type="password"]', "demo1234");
  await page.click('button[type="submit"]');

  // Wait for navigation to dashboard
  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1500)); // wait for data to load

  // Screenshot auth pages
  for (const pg of AUTH_PAGES) {
    await page.goto(`${BASE_URL}${pg.path}`, { waitUntil: "networkidle2", timeout: 15000 });
    await new Promise((r) => setTimeout(r, 1000)); // wait for data + animations
    const filePath = path.join(SCREENSHOTS_DIR, `${pg.name}.png`);
    await page.screenshot({ path: filePath, fullPage: true });
    console.log(`  Captured: ${pg.name} -> ${filePath}`);
  }

  // Mobile screenshots
  console.log("\n  Capturing mobile versions...");
  await page.setViewport({ width: 390, height: 844 });

  for (const pg of AUTH_PAGES) {
    await page.goto(`${BASE_URL}${pg.path}`, { waitUntil: "networkidle2", timeout: 15000 });
    await new Promise((r) => setTimeout(r, 1000));
    const filePath = path.join(SCREENSHOTS_DIR, `${pg.name}-mobile.png`);
    await page.screenshot({ path: filePath, fullPage: true });
    console.log(`  Captured: ${pg.name}-mobile -> ${filePath}`);
  }

  await browser.close();
  console.log(`\nDone! Screenshots saved to ${SCREENSHOTS_DIR}/`);
}

takeScreenshots().catch((err) => {
  console.error("Screenshot error:", err);
  process.exit(1);
});
