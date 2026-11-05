# Factolex — aplikacja rezerwacji z Google Calendar i Gmail

## Status (2026-11-05)
Kod aplikacji i integracji gotowy do przeniesienia do **Google Apps Script**. Właściciel konta musi utworzyć projekt Google, autoryzować wymagane uprawnienia i wdrożyć aplikację. **Autoryzacja NIE została przeprowadzona i aplikacja NIE przyjmuje obecnie rezerwacji.**

Konto docelowe: `marchewkadominik@gmail.com`; domena kancelarii: `https://www.factolex.pl/`.

## Pliki
- `Code.gs` – serwer: CalendarApp, MailApp (Gmail – tylko wysyłka), blokada równoczesnych rezerwacji, walidacja danych i limity.
- `Index.html` – rzeczywisty formularz przeznaczony do **Google Apps Script HTML Service**, korzysta z `google.script.run` (bez zewnętrznego CORS i publicznych kluczy).
- `appsscript.json` – strefa czasowa i zakresy OAuth: zarządzanie kalendarzem oraz wysyłka wiadomości.
- `index.html` – wcześniejszy, samodzielny prototyp statyczny; **nie jest połączony z działającym serwerem**.
- `google-apps-script.gs` – wcześniejsza wersja demonstracyjna; **nie używać do uruchamiania**.

## Uruchomienie / autoryzacja właściciela konta Google

1. Zaloguj się do `marchewkadominik@gmail.com`, otwórz https://script.google.com/home/projects/create i utwórz projekt o nazwie `Factolex Rezerwacje`.
2. Zastąp zawartość domyślnego `Code.gs` zawartością pliku **`Code.gs`** z tego folderu GitHub.
3. Kliknij przycisk **+ → HTML** w edytorze Apps Script, nazwij plik **`Index`** (aby powstał `Index.html`) i wklej jego zawartość z GitHub.
4. W **Ustawieniach projektu** zaznacz **Pokaż plik manifestu appsscript.json w edytorze**. Zastąp manifest zawartością `appsscript.json` z tego folderu. Na początku wdrażaj dostęp **tylko dla siebie**.
5. Z menu funkcji wybierz **`authorizeOnce`** i kliknij **Uruchom**. Google poprosi o wybór konta i zgodę na uprawnienia: kalendarz oraz wysyłkę e-mail. Przejrzyj dokładnie uprawnienia i zatwierdź je tylko dla własnego, zaufanego projektu. Nie podawaj haseł ani kodów logowania w ChatGPT.
6. Kliknij **Wdróż → Nowe wdrożenie → Aplikacja internetowa**, ustaw **Wykonuj jako: Ja**, **Kto ma dostęp: Tylko ja** i wdroż. Google wyświetli adres `https://script.google.com/macros/s/.../exec`. Otwórz go, aby sprawdzić widok. Rezerwacje pozostają wyłączone z założenia.
7. Po weryfikacji godzin, polityki prywatności, ochrony formularza przed nadużyciami oraz przeprowadzeniu kontrolnej rezerwacji można włączyć usługę: **Ustawienia projektu → Właściwości skryptu → Dodaj właściwość**: nazwa `BOOKINGS_ENABLED`, wartość `true`. Do testów można użyć dostępu tylko dla siebie. Publiczną dostępność ustaw dopiero po zapewnieniu ochrony antyspamowej, limitów i RODO. W razie nadużyć ustaw `BOOKINGS_ENABLED=false` natychmiast.
8. Jeżeli zatwierdzisz publiczne uruchomienie, w **Zarządzaj wdrożeniami** dostosuj dostęp aplikacji do docelowych klientów (anonimowo lub z kontem Google, zależnie od polityki bezpieczeństwa). Link wdrożenia umieść na stronie `factolex.pl` i zweryfikuj działanie jako klient.

## Działanie

- Aplikacja sprawdza zajętość w **głównym Kalendarzu Google** właściciela; nie pokazuje klientom tytułów istniejących wydarzeń.
- Zapobiega podwójnym zapisom, wykorzystując blokadę skryptu, oraz wymaga co najmniej 12 godzin wyprzedzenia.
- Po przyjęciu rezerwacji tworzy wydarzenie prywatne w kalendarzu i wysyła potwierdzenie do klienta oraz informację do kancelarii za pośrednictwem `MailApp`.
- Gdy wiadomość e-mail nie zostanie wysłana, wydarzenie pozostaje w kalendarzu, a aplikacja zwróci ostrzeżenie.
- System **nie czyta przychodzącej poczty Gmail** i nie synchronizuje konwersacji. Integracja Gmail obejmuje tylko wysyłanie e-maili.
- W formularzu nie ma pola na opis sprawy. Dane kontaktowe są zapisywane w opisie wydarzenia kalendarza właściciela.
- Na starcie połączenie **nie jest aktywne**. Zgodą w ChatGPT nie można zastąpić OAuth udzielonego z poziomu Google Apps Script.

## Bezpieczeństwo i uwagi wdrożeniowe

**Nie publikuj niezabezpieczonego formularza dla wszystkich użytkowników.** Obecne zabezpieczenia (honeypot, limit 20 rezerwacji dziennie, blokada 6-godzinna na adres e-mail i blokada równoległych żądań) ograniczają nadużycia, lecz nie zastępują weryfikacji CAPTCHA/Turnstile po stronie serwera, filtrów IP i nadzoru nad rezerwacjami. Publiczne wdrożenie wymaga dodatkowego zabezpieczenia.

MailApp wymaga zakresu `script.send_mail`; CalendarApp wymaga zakresu `calendar`. To znaczące uprawnienia: aplikacja działa jako właściciel, dlatego kod musi być przeglądany przed autoryzacją. Do aplikacji nie należy dodawać odczytu treści wiadomości z Gmaila ani ujawniać tokenów OAuth, haseł, danych klientów czy tajemnicy adwokackiej w publicznym repozytorium. Zalecana jest oddzielna baza rezerwacji i zewnętrzna bramka antyspamowa, jeśli system będzie intensywnie używany.

Przed włączeniem produkcji sprawdź harmonogram kancelarii, sposób informowania osób rezerwujących o ochronie danych osobowych, politykę retencji i kontrolę dostępu do kalendarza. Podane godziny i miejsca to ustawienia robocze wymagające zaakceptowania przez właściciela.

## Gdzie są linki?

- [Kod projektu w GitHub](https://github.com/domlex/moja-strona/tree/main/factolex-rezerwacje)
- [Nowy projekt Google Apps Script](https://script.google.com/home/projects/create)
- Po wdrożeniu przez właściciela aplikacja będzie miała własny URL, który Google pokaże w panelu wdrożenia.
