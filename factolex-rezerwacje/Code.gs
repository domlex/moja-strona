/**
 * Factolex: bezpieczniejszy backend Google Apps Script.
 * Wklej jako Code.gs w https://script.google.com/
 * Jego uprawnienia są autoryzowane PRZEZ WŁAŚCICIELA konta Google.
 * Wymaga appsscript.json z timeZone: Europe/Warsaw.
 *
 * Nie udostępniaj skryptu do rezerwacji publicznie przed sprawdzeniem
 * informacji RODO, ustawień kalendarza, limitów i ochrony antyspamowej.
 */
const FACTOLEX = Object.freeze({
  adminEmail: 'marchewkadominik@gmail.com',
  timeZone: 'Europe/Warsaw',
  minHoursAhead: 12,
  maxDaysAhead: 60,
  maxBookingsPerDay: 20
});

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Factolex | Rezerwacja konsultacji');
}

/**
 * Uruchom ręcznie w edytorze, aby zatwierdzić wymagane zgody Google.
 * Gmail: MailApp wysyła e-maile z konta właściciela, nie czyta skrzynki.
 * Kalendarz: CalendarApp odczytuje zajętość i tworzy prywatne wydarzenia.
 */
function authorizeOnce_() {
  const calendar = bookingCalendar_();
  if (!calendar) throw new Error('Nie można otworzyć kalendarza głównego Google.');
  const calendarName = calendar.getName();
  const remainingEmails = MailApp.getRemainingDailyQuota();
  Logger.log('Autoryzowano. Kalendarz: ' + calendarName +
    '. Pozostała liczba odbiorców e-mail dzisiaj: ' + remainingEmails);
  return 'Autoryzowano: ' + calendarName;
}

/**
 * Po testach, zaakceptowaniu polityki prywatności i zabezpieczeniu publicznego
 * formularza właściciel ustawia we Właściwościach skryptu:
 * BOOKINGS_ENABLED = true
 * Bez tego publiczne przyjmowanie rezerwacji jest wyłączone.
 */
function publicStatus() {
  return {
    enabled: isEnabled_(),
    testMode: PropertiesService.getScriptProperties().getProperty('TEST_MODE') !== 'false',
    timezone: FACTOLEX.timeZone,
    minHoursAhead: FACTOLEX.minHoursAhead,
    maxDaysAhead: FACTOLEX.maxDaysAhead
  };
}

function getAvailability(input) {
  // Nie ujawniaj nawet informacji o zajętości przed świadomym uruchomieniem rezerwacji.
  if (!isEnabled_()) return {enabled:false, slots:[]};
  const office = validateOffice_(input && input.office);
  const day = parseDay_(input && input.day);
  const today = Utilities.formatDate(new Date(), FACTOLEX.timeZone, 'yyyy-MM-dd');
  if (day.text < today) return {enabled: true, slots: []};
  const futureLimit = new Date(Date.now() + FACTOLEX.maxDaysAhead * 86400000);
  if (day.date > futureLimit) return {enabled: true, slots: []};

  const calendar = bookingCalendar_();
  if (!calendar) throw new Error('Kalendarz jest niedostępny.');
  const first = new Date(day.y, day.m - 1, day.d, 0, 0, 0);
  const last = new Date(day.y, day.m - 1, day.d + 1, 0, 0, 0);
  const events = calendar.getEvents(first, last).concat(CalendarApp.getDefaultCalendar().getEvents(first, last));
  const hours = hoursFor_(office, day.date.getDay());
  const slots = hours.filter(function(hour) {
    const start = new Date(day.y, day.m - 1, day.d, hour, 0, 0);
    const end = new Date(start.getTime() + 3600000);
    if (start.getTime() < Date.now() + FACTOLEX.minHoursAhead * 3600000) return false;
    return !events.some(function(e) { return e.getStartTime() < end && e.getEndTime() > start; });
  }).map(function(hour) {
    const h = String(hour).padStart(2, '0');
    return {value: h + ':00', label: h + ':00–' + String(hour + 1).padStart(2, '0') + ':00'};
  });
  return {enabled: isEnabled_(), slots: slots};
}

/**
 * Wywołanie z UI przez google.script.run, bez CORS i bez sekretów w JS.
 * Wartości walidowane po stronie serwera. Rezerwacje pod blokadą.
 */
function submitBooking(input) {
  if (!isEnabled_()) throw new Error('Rezerwacja online jeszcze nie jest włączona.');
  if (!input || typeof input !== 'object' || input.website) throw new Error('Błędny formularz.');
  const office = validateOffice_(input.office);
  const day = parseDay_(input.day);
  const hourMatch = /^([01][0-9]|2[0-3]):00$/.exec(String(input.time || ''));
  if (!hourMatch) throw new Error('Wybierz poprawną godzinę.');
  const hour = Number(hourMatch[1]);
  if (hoursFor_(office, day.date.getDay()).indexOf(hour) < 0) {
    throw new Error('Ten termin nie jest oferowany w podanej lokalizacji.');
  }
  const start = new Date(day.y, day.m - 1, day.d, hour, 0, 0);
  const end = new Date(start.getTime() + 3600000);
  if (start.getTime() < Date.now() + FACTOLEX.minHoursAhead * 3600000 ||
      start.getTime() > Date.now() + FACTOLEX.maxDaysAhead * 86400000) {
    throw new Error('Termin jest poza dostępnym zakresem.');
  }
  const name = clean_(input.name, 100);
  const email = clean_(input.email, 180).toLowerCase();
  const phone = clean_(input.phone, 30);
  const kind = 'Konsultacja wstępna';
  if (name.length < 3 || !validEmail_(email) ||
      !/^[+()\d\s-]{6,30}$/.test(phone)) {
    throw new Error('Uzupełnij prawidłowe dane kontaktowe.');
  }
  if (input.privacyAccepted !== true) {
    throw new Error('Potwierdź zapoznanie się z informacją o danych osobowych.');
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('Trwa inna rezerwacja. Spróbuj ponownie.');
  try {
    if (!isEnabled_()) throw new Error('Rezerwacje zostały wyłączone.');
    const verified = verifiedContact_(input, email);
    if (verified.result) return verified.result;
    const calendar = bookingCalendar_();
    if (!calendar) throw new Error('Kalendarz jest niedostępny.');
    if (calendar.getEvents(start, end).concat(CalendarApp.getDefaultCalendar().getEvents(start, end)).some(function(event) {
      return event.getStartTime() < end && event.getEndTime() > start;
    })) throw new Error('Ten termin jest już zajęty. Wybierz inny.');

    const dayKey = Utilities.formatDate(new Date(), FACTOLEX.timeZone, 'yyyyMMdd');
    const store = PropertiesService.getScriptProperties();
    const bookingsKey = 'count_' + dayKey;
    const total = Number(store.getProperty(bookingsKey) || 0);
    if (total >= FACTOLEX.maxBookingsPerDay) {
      throw new Error('Limit rezerwacji na dziś został osiągnięty. Skontaktuj się telefonicznie.');
    }
    const contactHash = Utilities.base64EncodeWebSafe(
      Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, email)
    ).slice(0, 40);
    const contactKey = 'recent_' + contactHash;
    cleanup_(store);
    if (Number(store.getProperty(contactKey) || 0) > Date.now()) {
      throw new Error('Z tego adresu dokonano już ostatnio rezerwacji. Skontaktuj się telefonicznie.');
    }

    // Nie zapisujemy w systemie opisu sprawy ani poufnych materiałów klienta.
    const description = 'Kontakt: ' + name + '\nEmail: ' + email +
      '\nTelefon: ' + phone + '\nRodzaj konsultacji: ' + kind;
    const event = calendar.createEvent('FACTOLEX | ' + office, start, end, {
      description: description
    });
    try { event.setVisibility(CalendarApp.Visibility.PRIVATE); }
    catch (err) { event.deleteEvent(); throw new Error('Nie udało się bezpiecznie zapisać terminu.'); }
    store.setProperty(bookingsKey, String(total + 1));
    store.setProperty(contactKey, String(Date.now() + 21600000));

    const when = Utilities.formatDate(start, FACTOLEX.timeZone, 'dd.MM.yyyy HH:mm');
    const subject = 'Factolex – potwierdzenie rezerwacji';
    const receipt = {ok: true, mailSent: false, when: when, office: office};
    verified.result = receipt;
    verified.expires = Date.now() + 86400000;
    store.setProperty('verify_' + input.verificationId, JSON.stringify(verified));
    let mailSent = true;
    try {
      MailApp.sendEmail({
        to: email, subject: subject,
        body: 'Dzień dobry,\n\nPotwierdzamy konsultację prawną ' + when +
          ' (' + office + ').\n\nW sprawie zmiany terminu prosimy o kontakt z kancelarią.' +
          '\n\nKancelaria Adwokacka Factolex\nTelefon: 530 834 077',
        name: 'Kancelaria Adwokacka Factolex'
      });
      MailApp.sendEmail({
        to: FACTOLEX.adminEmail,
        subject: 'Factolex – nowa rezerwacja ' + when,
        body: 'Nowa rezerwacja: ' + when + '\nLokalizacja: ' + office + '\n' + description,
        name: 'Rezerwacje Factolex'
      });
    } catch (err) {
      // Utworzony termin pozostaje ważny, nawet jeśli skończył się limit Gmail.
      mailSent = false;
      Logger.log('Rezerwacja zapisana; błąd dostarczenia potwierdzenia.');
    }
    receipt.mailSent = mailSent;
    store.setProperty('verify_' + input.verificationId, JSON.stringify(verified));
    return receipt;
  } finally {
    lock.releaseLock();
  }
}

function isEnabled_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('BOOKINGS_ENABLED') !== 'true') return false;
  if (props.getProperty('TEST_MODE') !== 'false') return isOwner_();
  return props.getProperty('SECURITY_TESTS_PASSED') === 'true';
}

function clean_(value, max) {
  if (typeof value !== 'string' || value.length > max || /[\x00-\x1f\x7f<>]/.test(value)) throw new Error('Nieprawidłowa wartość pola.');
  return value.trim();
}

function validateOffice_(office) {
  const allowed = ['Kraków', 'Olkusz'];
  if (allowed.indexOf(office) < 0) throw new Error('Nieprawidłowa lokalizacja.');
  return office;
}

function parseDay_(value) {
  const text = String(value || '');
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) throw new Error('Wybierz poprawną datę.');
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const date = new Date(y, mo - 1, d, 12, 0, 0);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 ||
      date.getDate() !== d) throw new Error('Nieprawidłowa data.');
  return {text: text, y: y, m: mo, d: d, date: date};
}

function hoursFor_(office, dayOfWeek) {
  if (office === 'Kraków' && [1, 5].indexOf(dayOfWeek) >= 0) return [15, 16, 17, 18, 19];
  if (office === 'Olkusz' && dayOfWeek === 4) return [14, 15, 16];
  if (office === 'Olkusz' && dayOfWeek === 6) return [10, 11, 12];
  // Konsultacje telefoniczne są orientacyjne i wymagają zatwierdzenia harmonogramu.
  if (office === 'Telefonicznie' && dayOfWeek >= 1 && dayOfWeek <= 5)
    return [10, 11, 12, 13, 14, 15, 16];
  return [];
}


// Administrative routines end in underscore: inaccessible via google.script.run.
function isOwner_() {
  return Session.getActiveUser().getEmail().toLowerCase() === FACTOLEX.adminEmail;
}
function assertOwner_() {
  if (!isOwner_()) throw new Error('Dostęp tylko dla właściciela.');
}
function bookingCalendar_() {
  const id = PropertiesService.getScriptProperties().getProperty('BOOKING_CALENDAR_ID');
  if (!id) throw new Error('Kalendarz rezerwacji nie został skonfigurowany.');
  const calendar = CalendarApp.getCalendarById(id);
  if (!calendar) throw new Error('Kalendarz rezerwacji jest niedostępny.');
  return calendar;
}
function setupTest_() {
  assertOwner_();
  const props = PropertiesService.getScriptProperties();
  props.setProperties({BOOKINGS_ENABLED: 'false', TEST_MODE: 'true', SECURITY_TESTS_PASSED: 'false'});
  if (!props.getProperty('BOOKING_CALENDAR_ID')) {
    const cal = CalendarApp.createCalendar('Factolex – rezerwacje', {timeZone: FACTOLEX.timeZone});
    props.setProperty('BOOKING_CALENDAR_ID', cal.getId());
  }
  if (!props.getProperty('VERIFICATION_SECRET')) props.setProperty('VERIFICATION_SECRET', Utilities.getUuid() + Utilities.getUuid());
  authorizeOnce_();
  props.setProperty('BOOKINGS_ENABLED', 'true');
  Logger.log('Konfiguracja testowa zakończona. Dostęp wyłącznie dla właściciela.');
}
function validEmail_(email) {
  return typeof email === 'string' && email.length <= 180 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(email);
}
function digest_(text) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text));
}
function signature_(text) {
  const secret = PropertiesService.getScriptProperties().getProperty('VERIFICATION_SECRET');
  if (!secret) throw new Error('Brak konfiguracji weryfikacji.');
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(text, secret));
}
function cleanup_(props) {
  const all = props.getProperties();
  const today = Utilities.formatDate(new Date(), FACTOLEX.timeZone, 'yyyyMMdd');
  Object.keys(all).forEach(function(key) {
    if ((key.indexOf('count_') === 0 || key.indexOf('mailcount_') === 0) && key.slice(key.indexOf('_')+1) !== today) props.deleteProperty(key);
    else if (key.indexOf('verify_') === 0) {
      try { if (JSON.parse(all[key]).expires < Date.now()) props.deleteProperty(key); } catch (e) { props.deleteProperty(key); }
    } else if ((key.indexOf('recent_') === 0 || key.indexOf('mailrecent_') === 0) && Number(all[key]) < Date.now()) props.deleteProperty(key);
  });
}
function requestVerification(input) {
  if (!isEnabled_()) throw new Error('Rezerwacje nieaktywne.');
  if (!input || input.website) throw new Error('Błędny formularz.');
  const email = clean_(input.email, 180).toLowerCase();
  if (!validEmail_(email)) throw new Error('Podaj prawidłowy e-mail.');
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('TEST_MODE') !== 'false' && email !== FACTOLEX.adminEmail) throw new Error('W testach użyj adresu właściciela.');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Spróbuj za chwilę.');
  try {
    cleanup_(props);
    const day = Utilities.formatDate(new Date(), FACTOLEX.timeZone, 'yyyyMMdd');
    const countKey = 'mailcount_' + day;
    const count = Number(props.getProperty(countKey) || 0);
    const emailKey = 'mailrecent_' + digest_(email);
    if (count >= 30 || Number(props.getProperty(emailKey) || 0) > Date.now() || MailApp.getRemainingDailyQuota() < 5) {
      throw new Error('Limit wysyłki kodów. Spróbuj później lub zadzwoń do kancelarii.');
    }
    const id = Utilities.getUuid();
    const code = String(parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 12), 16) % 1000000).padStart(6, '0');
    const record = {emailHash: digest_(email), codeHash: signature_(id + ':' + code), expires: Date.now() + 600000, attempts: 0};
    props.setProperty('verify_' + id, JSON.stringify(record));
    props.setProperty(countKey, String(count + 1));
    props.setProperty(emailKey, String(Date.now() + 600000));
    try {
      MailApp.sendEmail({to: email, subject: 'Factolex – kod potwierdzający adres e-mail',
        body: 'Kod: ' + code + '\n\nKod jest ważny 10 minut. Wpisz go w formularzu rezerwacji Factolex. Sam kod nie rezerwuje terminu.\nJeśli nie zamawiano kodu, zignoruj wiadomość.', name: 'Kancelaria Adwokacka Factolex'});
    } catch (e) { props.deleteProperty('verify_' + id); throw new Error('Nie udało się wysłać kodu. Spróbuj później.'); }
    return {verificationId: id};
  } finally { lock.releaseLock(); }
}
function verifiedContact_(input, email) {
  const id = input.verificationId;
  const code = input.verificationCode;
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id) || typeof code !== 'string' || !/^\d{6}$/.test(code)) throw new Error('Podaj sześciocyfrowy kod z e-maila.');
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty('verify_' + id);
  if (!raw) throw new Error('Kod nieprawidłowy lub wygasł.');
  const record = JSON.parse(raw);
  if (record.expires <= Date.now() || record.attempts >= 5) throw new Error('Kod nieprawidłowy lub wygasł.');
  record.attempts++;
  props.setProperty('verify_' + id, JSON.stringify(record));
  if (record.emailHash !== digest_(email) || record.codeHash !== signature_(id + ':' + code)) throw new Error('Kod nieprawidłowy lub wygasł.');
  return record;
}

function integrationTest_() {
  assertOwner_();
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('TEST_MODE') !== 'true') throw new Error('Test wymaga trybu testowego.');
  const calendar = bookingCalendar_();
  const start = new Date('2099-01-05T12:00:00Z');
  const end = new Date(start.getTime() + 3600000);
  let event;
  try {
    event = calendar.createEvent('FACTOLEX TEST — można usunąć', start, end, {description:'Test techniczny bez danych klienta'});
    event.setVisibility(CalendarApp.Visibility.PRIVATE);
    if (event.getVisibility() !== CalendarApp.Visibility.PRIVATE) throw new Error('Test prywatności nieudany.');
    if (!calendar.getEvents(start, end).some(function(e){return e.getId() === event.getId();})) throw new Error('Test zapisu nieudany.');
    CalendarApp.getDefaultCalendar().getEvents(start, end);
    MailApp.sendEmail({to:FACTOLEX.adminEmail, subject:'Factolex – test integracji Google', body:'Test techniczny Factolex. Utworzono i odczytano prywatne wydarzenie testowe. Wydarzenie zostanie usunięte w ramach sprzątania testu. Nie jest to rezerwacja klienta.', name:'Factolex – test'});
    props.setProperty('INTEGRATION_TEST_PASSED', 'true');
    Logger.log('PASS: odczyt zajętości, zapis i prywatność wydarzenia, wysyłka testowa. Sprawdź odbiór wiadomości.');
  } finally {
    if (event) event.deleteEvent();
  }
}
