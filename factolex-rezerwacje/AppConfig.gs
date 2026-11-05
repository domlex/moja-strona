/**
 * Factolex 2.0 – ustawienia i ekran aplikacji.
 * Domyślnie WYŁĄCZONE. Klucze przechowuj wyłącznie we Właściwościach skryptu.
 */
const FX = Object.freeze({
  timezone:'Europe/Warsaw',
  owner:'marchewkadominik@gmail.com',
  maxDays:60,
  advanceHours:12,
  cancelHours:12,
  dailyLimit:12
});
function fxProp_(key) {
  return PropertiesService.getScriptProperties().getProperty(key)||'';
}
function fxConfigured_() {
  return !!(fxProp_('RESERVATIONS_CALENDAR_ID') &&
    fxProp_('TURNSTILE_SITE_KEY') && fxProp_('TURNSTILE_SECRET_KEY') &&
    fxProp_('TURNSTILE_ALLOWED_HOSTNAME'));
}
function fxEnabled_() {return fxConfigured_() && fxProp_('BOOKINGS_ENABLED')==='true';}
function doGet(e) {
  const page=HtmlService.createTemplateFromFile('BookingView');
  page.turnstileSiteKey=fxProp_('TURNSTILE_SITE_KEY');
  const cancel=String(e&&e.parameter&&e.parameter.cancel||'');
  page.cancelToken=/^[a-f0-9]{64}$/.test(cancel)?cancel:'';
  return page.evaluate().setTitle('Factolex – rezerwacje');
}
function publicStatus() {
  return {enabled:fxEnabled_(),minHours:FX.advanceHours,maxDays:FX.maxDays};
}
/** Uruchom z edytora Apps Script, aby udzielić wymaganych zgód. */
function authorizeOnce_() {
  const c=CalendarApp.getDefaultCalendar();
  if(!c)throw Error('Brak uprawnień do kalendarza.');
  const n=MailApp.getRemainingDailyQuota();
  Logger.log('Autoryzowano kalendarz, limit e-mail: '+n);
  return {ok:true};
}
function fxSelfTest_() {
  if(fxHours_('Kraków',1).join()!=='15,16,17,18,19') throw Error('Błędny harmonogram Krakowa.');
  if(fxHours_('Olkusz',6).join()!=='10,11,12') throw Error('Błędny harmonogram Olkusza.');
  if(fxHours_('Kraków',0).length)throw Error('Kraków: błędnie dostępna niedziela.');
  try{fxDay_('2026-02-30');throw Error('Błędna walidacja daty.');}
  catch(err){if(String(err.message).includes('Błędna walidacja'))throw err;}
  Logger.log('Testy walidacji harmonogramu zakończone poprawnie.');
  return true;
}
