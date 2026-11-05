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
function authorizeOnce() {
  const calendar = CalendarApp.getDefaultCalendar();
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
    timezone: FACTOLEX.timeZone,
    minHoursAhead: FACTOLEX.minHoursAhead,
    maxDaysAhead: FACTOLEX.maxDaysAhead
  };
}

function getAvailability(input) {
  if (!isEnabled_()) return {enabled: false, slots: []};
  const office = validateOffice_(input && input.office);
  const day = parseDay_(input && input.day);
  const today = Utilities.formatDate(new Date(), FACTOLEX.timeZone, 'yyyy-MM-dd');
  if (day.text < today) return {enabled: isEnabled_(), slots: []};
  const futureLimit = new Date(Date.now() + FACTOLEX.maxDaysAhead * 86400000);
  if (day.date > futureLimit) return {enabled: isEnabled_(), slots: []};

  const calendar = CalendarApp.getDefaultCalendar();
  if (!calendar) throw new Error('Kalendarz jest niedostępny.');
  const first = new Date(day.y, day.m - 1, day.d, 0, 0, 0);
  const last = new Date(day.y, day.m - 1, day.d + 1, 0, 0, 0);
  const events = calendar.getEvents(first, last);
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
  const kind = clean_(input.kind || 'Konsultacja wstępna', 80);
  if (name.length < 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !/^[+()\d\s-]{6,30}$/.test(phone)) {
    throw new Error('Uzupełnij prawidłowe dane kontaktowe.');
  }
  if (input.privacyAccepted !== true) {
    throw new Error('Potwierdź zapoznanie się z informacją o danych osobowych.');
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('Trwa inna rezerwacja. Spróbuj ponownie.');
  try {
    const calendar = CalendarApp.getDefaultCalendar();
    if (!calendar) throw new Error('Kalendarz jest niedostępny.');
    if (calendar.getEvents(start, end).some(function(event) {
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
    const cache = CacheService.getScriptCache();
    if (cache.get(contactKey)) {
      throw new Error('Z tego adresu dokonano już ostatnio rezerwacji. Skontaktuj się telefonicznie.');
    }

    // Nie zapisujemy w systemie opisu sprawy ani poufnych materiałów klienta.
    const description = 'Kontakt: ' + name + '\nEmail: ' + email +
      '\nTelefon: ' + phone + '\nRodzaj konsultacji: ' + kind;
    const event = calendar.createEvent('FACTOLEX | ' + office, start, end, {
      description: description
    });
    event.setVisibility(CalendarApp.Visibility.PRIVATE);
    store.setProperty(bookingsKey, String(total + 1));
    cache.put(contactKey, '1', 21600);

    const when = Utilities.formatDate(start, FACTOLEX.timeZone, 'dd.MM.yyyy HH:mm');
    const subject = 'Factolex – potwierdzenie rezerwacji';
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
      Logger.log('Wydarzenie ' + event.getId() + ' utworzono, błąd e-mail: ' + err);
    }
    return {ok: true, mailSent: mailSent, when: when, office: office};
  } finally {
    lock.releaseLock();
  }
}

function isEnabled_() {
  return PropertiesService.getScriptProperties().getProperty('BOOKINGS_ENABLED') === 'true';
}

function clean_(value, max) {
  return String(value == null ? '' : value).replace(/[\r\n\t]/g, ' ').trim().slice(0, max);
}

function validateOffice_(office) {
  const allowed = ['Kraków', 'Olkusz', 'Telefonicznie'];
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
