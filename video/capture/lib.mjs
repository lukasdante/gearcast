// Shared helpers for Playwright capture scripts against the local capture server (see README.md).
//   import { BASE, ACCOUNTS, AS_OF, newStoryContext, login } from '../capture/lib.mjs';
import { chromium } from 'playwright';

export const BASE = process.env.CAPTURE_BASE || `http://127.0.0.1:${process.env.CAPTURE_PORT || 8790}`;
/** Story clock: every take renders as this Manila local time (data is date-shifted relative to it). Override with
 *  CAPTURE_AS_OF="YYYY-MM-DD HH:MM", or CAPTURE_AS_OF=live to use the real clock. Keep it after 10:00 (P-101B's
 *  daily check is logged at 10:00) and on one fixed date so the PM calendar grid is the same in every take. */
export const AS_OF = process.env.CAPTURE_AS_OF || '2026-11-28 14:00';
export const ACCOUNTS = {
  'PS-01': { password: 'ps-1', role: 'Supervisor', name: 'Lemuel' },
  'EN-01': { password: 'engr-1', role: 'Engineer', name: 'Jun' },
  'MT-01': { password: 'tech-1', role: 'Technician', name: 'Mia' },
  'MT-02': { password: 'tech-2', role: 'Technician', name: 'Ken' },
  'MT-03': { password: 'tech-3', role: 'Technician', name: 'Rico' },
};
export const DEVICES = {
  laptop: { viewport: { width: 1920, height: 1200 }, deviceScaleFactor: 1 },
  tablet: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
};

/** Chromium with a GPU path that works headless (WebGL for the 3D views). */
export const launch = (opts = {}) => chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...(opts.args || [])], ...opts });

/** A fresh context (empty localStorage: no leftover simulation, drafts or caches) pinned to the story clock. */
export async function newStoryContext(browser, device = 'laptop', extra = {}) {
  const live = AS_OF === 'live';
  const ctx = await browser.newContext({
    ...DEVICES[device], timezoneId: 'Asia/Manila', locale: 'en-PH',
    // DEV_MODE=1 (capture server only): the Worker uses this as "now" for every API call
    extraHTTPHeaders: live ? {} : { 'x-gearcast-as-of': AS_OF },
    ...extra,
  });
  // the app shifts its bundled data from the browser clock: pin it to the same instant (time keeps running)
  if (!live) await ctx.clock.install({ time: new Date(AS_OF.replace(' ', 'T') + ':00+08:00') });
  return ctx;
}

/** Sign in through the real login form and wait until the start-up splash is gone. */
export async function login(page, user) {
  const a = ACCOUNTS[user];
  if (!a) throw new Error(`unknown account ${user}`);
  await page.goto(BASE + '/');
  await page.getByRole('tab', { name: a.role }).click();
  await page.locator('.login-card select').selectOption(user);
  await page.locator('.login-card input[type=password]').fill(a.password);
  await page.locator('.login-card button[type=submit]').click();
  await page.locator('.app-main').waitFor({ timeout: 30000 });
  await page.locator('.splash').waitFor({ state: 'detached', timeout: 30000 });
}
