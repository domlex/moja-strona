# Factolex – rezerwacja konsultacji

Frontend: `index.html`. Backend: `google-apps-script.gs`.

**Stan:** gotowy szkielet aplikacji. Integracja Gmail / Google Calendar **nie jest aktywna**, dopóki właściciel nie wdroży i autoryzuje Google Apps Script i nie umieści URL wdrożenia w `CONFIG.apiUrl` w `index.html`.

## Konfiguracja
1. Utwórz nowy projekt w https://script.google.com/ na koncie kancelarii.
2. Wklej `google-apps-script.gs`, ustaw w projekcie strefę czasową Europe/Warsaw, sprawdź `ADMIN_EMAIL` i `CALENDAR_ID`.
3. Przed upublicznieniem dodaj ochronę przed spamem i nadużyciami (np. pośredniczący backend z Turnstile), weryfikację limitów i politykę retencji danych. Publiczny Apps Script wykonujący akcje na Gmail jest ryzykowny bez zabezpieczeń.
4. Wdróż aplikację webową i autoryzuj Calendar/Gmail na koncie właściciela. Wklej jej URL do `CONFIG.apiUrl`.
5. Włącz hosting statyczny (GitHub Pages lub Netlify), przetestuj rezerwację oraz zajętość i potwierdzenia e-mail.
6. Połącz ze stroną www.factolex.pl przez odnośnik lub podstronę.

Nie przechowuj tokenów OAuth ani sekretów w publicznym repozytorium. Nie należy zbierać opisów spraw zawierających tajemnicę adwokacką przez publiczny formularz. Dane i zakres lokalizacji/godzin wymagają akceptacji kancelarii.

To autorski projekt inspirowany funkcją rezerwacji, a nie kopia kodu strony referencyjnej.
