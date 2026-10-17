/**
 * Every assumption about instagram.com's markup lives here. When Instagram ships a UI change,
 * this is the file to fix. Text matchers cover English plus es, pt, fr, de, it, tr, fa, ar, ru;
 * only the English ones have been checked against the live site. Add a language by adding its strings.
 */
export const SEL = {
  loginForm: 'input[name="username"]',
  composer: 'div[role="textbox"][contenteditable="true"]',
  dialog: 'div[role="dialog"]',
  clickable: 'button, div[role="button"], a[role="link"], a[role="button"]',
};

/** Paths Instagram redirects to when the account is locked, suspended or must verify itself. */
export const CHECKPOINT_PATH = /^\/(accounts\/(suspended|disabled)|challenge)(\/|$)/;

/** A whole button label, case-insensitive. */
const label = (...words: string[]) => new RegExp(`^(${words.join('|')})$`, 'iu');
/** Text found anywhere in a page or dialog. */
const phrase = (...words: string[]) => new RegExp(words.join('|'), 'iu');

export const TEXT = {
  messageButton: label(
    'message', 'enviar mensaje', 'enviar mensagem', 'envoyer un message', 'nachricht senden', 'invia messaggio',
    'mesaj gönder', 'پیام', 'ارسال پیام', 'مراسلة', 'إرسال رسالة', 'отправить сообщение', 'написать',
  ),
  sendButton: label('send', 'enviar', 'envoyer', 'senden', 'invia', 'gönder', 'ارسال', 'إرسال', 'отправить'),
  dismissButton: label(
    'not now', 'cancel', 'ahora no', 'agora não', 'plus tard', 'jetzt nicht', 'non ora', 'şimdi değil', 'الان نه', 'اکنون نه',
    'ليس الآن', 'не сейчас', 'cancelar', 'annuler', 'abbrechen', 'annulla', 'iptal', 'لغو', 'إلغاء', 'отмена',
  ),
  notFound: phrase(
    'sorry, this page isn.t available', 'profile isn.t available', 'esta página no está disponible', 'esta página não está disponível',
    'cette page n.est pas disponible', 'diese seite ist leider nicht verfügbar', 'questa pagina non è disponibile',
    'bu sayfaya ulaşılamıyor', 'این صفحه در دسترس نیست', 'هذه الصفحة غير متاحة', 'эта страница недоступна',
  ),
  blocked: phrase(
    'try again later', 'we restrict certain activity', 'action blocked', 'temporarily (blocked|restricted)', 'suspicious activity',
    'inténtalo de nuevo más tarde', 'tente novamente mais tarde', 'réessayez plus tard', 'versuche es später',
    'riprova più tardi', 'daha sonra tekrar dene', 'بعدا? دوباره', 'بعداً دوباره', 'حاول مرة أخرى لاحق', 'повторите попытку позже',
  ),
  rateLimited: phrase(
    'please wait a few minutes', 'espera unos minutos', 'aguarde alguns minutos', 'patientez quelques minutes',
    'warte ein paar minuten', 'چند دقیقه صبر کنید', 'подождите несколько минут',
  ),
};
