# Factolex – rezerwacja konsultacji prawnych z Google

Repozytorium zawiera aplikację Google Apps Script przygotowaną do połączenia z **Kalendarzem Google** i wysyłką potwierdzeń przez **MailApp** (adres nadawcy: konto Google, które autoryzuje aplikację). Nie udziela dostępu do czytania wiadomości Gmail.

## Pliki

- [Code.gs](Code.gs) – funkcje serwerowe, sprawdzenie wolnego terminu, blokada konfliktów, zapis wydarzenia i wysyłka potwierdzenia.
- [Index.html](Index.html) – formularz klienta, dynamiczne wyświetlanie wolnych terminów z Google Calendar.
- [appsscript.json](appsscript.json) – strefa `Europe/Warsaw`, minimalne zakresy OAuth do kalendarza i wysyłania poczty.
- [index.html](index.html) – podgląd statyczny (bez wdrożenia Apps Script rezerwacje nie będą działały).

## Uruchomienie i osobna autoryzacja Google

Połączenie Gmaila/Kalendarza w ChatGPT **nie jest autoryzacją tej aplikacji**. Tę zgodę musi wykonać właściciel konta Google.

1. Zaloguj się do https://script.google.com/ jako **marchewkadominik@gmail.com** i utwórz nowy projekt `Factolex – rezerwacje`.
2. Otwórz `Code.gs` w projekcie Apps Script, usuń treść domyślną i wklej całą zawartość pliku [Code.gs](Code.gs).
3. W edytorze dodaj plik **HTML** o nazwie `Index` (bez rozszerzenia w polu nazwy; Google utworzy `Index.html`) i wklej zawartość [Index.html](Index.html).
4. W **Ustawienia projektu** włącz „Pokaż plik manifestu appsscript.json w edytorze”, a następnie zastąp jego zawartość kodem [appsscript.json](appsscript.json). Strefa czasowa musi być ustawiona na **Europe/Warsaw**.
5. Zapisz projekt. Z menu funkcji wybierz `setupTest_` → **Uruchom**. Zatwierdź zgodę Google na **Kalendarz Google** i **wysyłanie wiadomości e-mail**. Nie przesyłaj nikomu kodów, tokenów ani haseł. Uwaga: ta aplikacja nie potrzebuje uprawnień odczytu treści Gmaila.
6. Testuj początkowo tylko na koncie właściciela. W **Wdróż → Nowe wdrożenie → Aplikacja internetowa** ustaw **Wykonuj jako: Ja** i początkowo **Dostęp: Tylko ja**. Otwórz testowy adres.
7. Domyślnie `BOOKINGS_ENABLED` jest wyłączone. Gdy polityka prywatności, ochrona przed spamem, harmonogram i adresy zostaną zatwierdzone, w **Ustawienia projektu → Właściwości skryptu** dodaj `BOOKINGS_ENABLED` z wartością `true`. Przetestuj rezerwację i anulowanie, blokadę kolizji oraz wysłanie wiadomości.
8. Dopiero po audycie zabezpieczeń wdroż wersję dostępną dla klientów, z ustawieniem „Wykonuj jako: Ja”. Skopiuj link kończący się na `/exec` i opublikuj go na stronie kancelarii `factolex.pl`.

## Ważne zabezpieczenia

**Publiczne udostępnienie bez dodatkowego ograniczania botów nie jest zalecane.** Załączony kod ma walidację, honeypot, ograniczenia liczby zgłoszeń, blokadę jednoczesnych zapisów i 6-godzinny limit na ten sam e-mail, ale te zabezpieczenia **nie zastępują** pełnej ochrony CAPTCHA / Turnstile, bardziej zaawansowanych limitów ruchu oraz monitoringu nadużyć. Nie włączaj publicznego formularza przed ich wdrożeniem.

W kalendarzu zapisane zostają dane kontaktowe klienta. Ustal ich retencję i podstawę prawną przetwarzania oraz zweryfikuj komunikat informacyjny RODO. Formularz **nie zbiera opisów spraw ani materiałów poufnych**. Wydarzenia są oznaczane jako prywatne; sprawdź ponadto ustawienia udostępniania kalendarza.

**Status:** kod aplikacji przygotowany i zapisany na GitHubie. Projekt Apps Script nie został utworzony, autoryzowany ani wdrożony na koncie Google w ramach tego połączenia. Nie ma jeszcze produkcyjnego URL `/exec`.

> Zamiast pełnego Gmail API zastosowano MailApp z uprawnieniem tylko do wysyłania wiadomości (zasada minimalnych uprawnień).


## Utwardzenie zabezpieczeń – 6 listopada 2026

- Kod weryfikujący e-mail przed rezerwacją: 10 minut ważności, maks. 5 prób.
- Trwałe limity wysyłki: 30 kodów/dobę globalnie i 1 kod/10 minut na adres; rezerwacje 20/dobę i 1/6 godzin na adres. Limity nie zależą od ulotnego cache.
- Oddzielny kalendarz na dane rezerwacji; kalendarz główny sprawdzany wyłącznie dla konfliktów.
- Domyślny tryb testowy dopuszcza wyłącznie właściciela. Funkcje administracyjne mają końcowy podkreślnik i nie są dostępne przez google.script.run.
- Odrzucanie znaków sterujących, HTML i list odbiorców; brak kategorii i opisu sprawy w formularzu.
- Zapis potwierdzenia zapewnia idempotentne ponowienie udanej rezerwacji.
- Publiczne uruchomienie wymaga TEST_MODE=false i SECURITY_TESTS_PASSED=true, oprócz BOOKINGS_ENABLED=true. Nie zmieniać tych flag przed testem integracji, interfejsu i przeglądem informacji o danych osobowych.

Test lokalny: `TZ=Europe/Warsaw node factolex-rezerwacje/security.test.cjs` — 16 testów z atrapami usług Google. To nie jest dowód działania wdrożenia.

W edytorze uruchom prywatną funkcję `setupTest_`, następnie `integrationTest_`. Test integracji tworzy tymczasowe prywatne wydarzenie bez danych klienta, usuwa je w finally i wysyła wiadomość wyłącznie do właściciela. Następnie test formularza należy wykonać w prywatnym wdrożeniu.

Ograniczenie: globalne limity chronią zasoby i wysyłkę, lecz nie gwarantują odporności na rozproszony DoS. Przy większym ruchu potrzebna dodatkowa warstwa antybot. Anulowanie odbywa się telefonicznie przez kancelarię (brak publicznego endpointu anulowania).
