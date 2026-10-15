/**
 * Every assumption about instagram.com's markup lives here. When Instagram ships a UI change,
 * this is the file to fix. Text matchers assume the Instagram UI language is English.
 */
export const SEL = {
  loginForm: 'input[name="username"]',
  composer: 'div[role="textbox"][contenteditable="true"]',
  dialog: 'div[role="dialog"]',
  clickable: 'button, div[role="button"], a[role="link"], a[role="button"]',
};

export const TEXT = {
  messageButton: /^message$/i,
  sendButton: /^send$/i,
  dismissButton: /^(not now|cancel)$/i,
  notFound: /sorry, this page isn.t available|profile isn.t available/i,
  blocked: /try again later|we restrict certain activity|action blocked|temporarily (blocked|restricted)|suspicious activity/i,
  rateLimited: /please wait a few minutes/i,
};
