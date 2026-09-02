---
title: Raport architektoniczny — Moduł 4 (10xArchitect)
created: 2026-08-19
type: architect-report
---

# Raport architektoniczny — Moduł 4 (ścieżka 10xArchitect)

> Oparty wyłącznie na artefaktach wymienionych niżej. Gdzie artefakt nie zawierał danej informacji, zapisano wprost "BRAK artefaktu" zamiast domysłu.

## 1. Opisane projekty

| Repo                                        | Stack                                                                                                                                                                          | Skala (orientacyjnie)                                                                                                                                                                                                                                           | Artefakt   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **Sxx** (`company repo`, poza `obitracker`) | SaaS order-management/fulfillment: hybrydowy frontend React 17 + AngularJS 1.8 (`Web/Sxx.Web.Site`), API .NET 6/8, CQRS handlery (`Data/Sxx.Data/Handlers`), 3 bazy SQL Server | BRAK dokładnych metryk LOC/liczby plików w artefakcie. Sygnały pośrednie: najbusiejszy plik repo ma 2 720 linii (`edit-package-contents.tsx`); `Sxx.Data` tworzy jeden cykl importów o 2 644 krawędziach / 75 subnamespace'ów; `Handlers` — 1 117 dotknięć/12mo | L2, L3, L4 |
| **ObiTracker** (bieżące repo)               | Astro 6 SSR + React 19 wyspy, Supabase (Postgres + Auth), Cloudflare Workers                                                                                                   | Solo, 3-tygodniowe MVP (cytat z `tech-stack.md` przywołany w L5); brak metryk LOC w artefakcie                                                                                                                                                                  | L5         |

**Uwaga**: L2–L4 dotyczą repo Sxx, L5 dotyczy ObiTrackera — to dwa różne projekty, nie jeden ciągły case study.

## 2. Mapa projektu (z L2, repo Sxx)

- **Aktywność przesunęła się do frontendu**: udział frontendu w commitach rósł co kwartał (856→1234→1574→2771), obecnie >2× reszta repo łącznie; backend (`Data`) stabilny w liczbach bezwzględnych, malejący udziałowo.
- **Strefa ryzyka #1**: `reactApp/globals` ↔ `GlobalProviders` ↔ legacy Angular bridge — najwyższy fan-in w frontendzie (243/170), potwierdzony import-graphem cykl międzywarstwowy, własność skoncentrowana u 2 osób (Person1: 55 dotknięć, Person2: 31).
- **Strefa ryzyka #2**: `Sxx.Data` — jeden cykliczny komponent 2 644 krawędzi / 75 subnamespace'ów; struktura folderów CQRS (Commands/Queries) nie wymusza jednokierunkowego przepływu — potwierdzone przez ArchUnitNET, nie stylistyczna uwaga.
- **Znana, udokumentowana konwencja łamana masowo**: `IRequestInfo` przecieka poza kontrolery w 381 przypadkach (165/381 w `Handlers.Queries`/`Handlers.Commands`) — bezpośrednio sprzeczne z `CLAUDE.md`.
- **Unknowns**: `Middleware`, `SupportSite`, `Extensions` mają realną aktywność git (366 dotknięć na `Middleware/Services`) ale zero pokrycia grafem importów — traktowane jako niezmapowane, nie jako "czyste".
- Entry pointy dnia pierwszego: `CLAUDE.md`, `reactApp/globals/index.ts`, `GlobalProviders.tsx`, `edit-package-contents.tsx`, `ApplyPostageHandler.cs`.

## 3. Analiza ficzera (z L3, repo Sxx)

**Zbadany przepływ**: "Edit package contents" (edycja SKU/ilości/danych celnych paczki) — wybrany bo repo-map wskazał go jako strefę ryzyka #1 (najbusiejszy plik repo, cykl międzywarstwowy, skoncentrowana własność).

**Feature overview**: Komponent React (`edit-package-contents.tsx`, 2 720 linii) montowany ręcznie (`ReactDOM.render()` + imperatywny ref) w legacy szablony AngularJS. Zapis POST-uje do `orders/updateOrderLines/` → `UpdateOrderLinesHandler`, który zapisuje `Order`/`OrderLine`/`OrderCustomsInformation` przez EF Core, a mutację paczek deleguje do **zewnętrznego mikroserwisu Order** przez REST (`IOrderServiceClient.PutOrderPackages`), nie do lokalnej bazy.

**Technical debt (top 3, przynajmniej jeden potwierdzony ast-grepem)**:

1. **Zero automatycznych testów frontendu** — `jest.config.js` skopowany na `reactApp/`, cała funkcja (~6 000 linii) leży w `app/_react/`/`app/_shared/`, poza zasięgiem configu. 11 czystych funkcji pomocniczych i 17 reguł walidacji — policzone dokładnie ast-grepem (`export const $NAME = $$$`, `case $NAME:`) — nie ma ani jednego testu.
2. **`IRequestInfo` wstrzykiwane bezpośrednio do handlerów** (`GetOrdersLinesHandler:37,45`, `UpdateOrderLinesHandler:25,33`) zamiast tylko do kontrolerów — potwierdzone dokładnie ast-grepem (`IRequestInfo $NAME`, `_requestInfo.$PROP` na dokładnie tych liniach), łamie regułę z `CLAUDE.md`.
3. **Read handler bez testów w ogóle** — `GetOrdersLinesHandler`, najbardziej rozgałęziony i najczęściej współzmieniany backendowy plik przepływu, nie ma pliku testowego; zasila dane, które (też nietestowany) frontend edytuje i zapisuje.
   (Dodatkowo skorygowano istotny błąd we wcześniejszej analizie: rzekomy "zamknięty cykl" `app/_react → GlobalProviders → app/constants.js` okazał się jednokierunkowym łańcuchem — `app/constants.js` ma 0 importów, potwierdzone ast-grepem.)

## 4. Plan refaktoryzacji (z L4, repo Sxx)

**Co refaktoryzowane**: Kandydaci C + A z rankingu w `research.md` tego change'a.

- **Faza 1 (Kandydat C)**: wyodrębnienie `countCharacters`/`runValidations` z plików nazwanych po funkcji (`edit-package-contents-*`) do neutralnego `field-validation-helpers.js` — obecnie generyczny `FormElement` jest ukryto sprzężony z logiką jednej funkcji.
- **Faza 2 (Kandydat A)**: usunięcie `IRequestInfo` z `GetOrdersLinesHandler`/`UpdateOrderLinesHandler`; `AccountID`/`CurrentCarrierTypeID` przenoszone jawnie jako właściwości komend/zapytań, ustawiane przez kontroler (wzorzec skopiowany z `BatchController.cs`).

**Czego świadomie NIE robimy**: Kandydat B (zamknięcie łańcucha `app/constants.js`), Kandydat D (retyping `serverConsts.ts`), Kandydat E (brak cleanup przy unmount), dodanie testów dla `GetOrdersLinesHandler` (nieosiągalne bez realnej bazy — surowe ADO, nie EF LINQ), przepisanie systemowego wzorca `IRequestInfo`-w-handlerze poza tymi dwoma handlerami (336/833 plików handlerów pozostaje nietknięte).

**Fazy i weryfikacja**:

- Faza 1: `npm run reactApp:typeCheck`/`lint`/`format` (auto) — ale oba pliki konsumujące mają `@ts-nocheck`, więc typecheck nie złapie złego importu; realna weryfikacja jest **ręczna** (modal edit-package-contents + wariant LQDG, walidacja pól, kontrolka wagi).
- Faza 2: `dotnet build`, testy `UpdateOrderLinesTests`/`SaveManageOrderHandlerTests` (auto) + ręczne sprawdzenie get/update order lines dla kont App3 i OLP oraz ścieżki `SaveManageOrderHandler.Update`.
- Po każdej fazie: pauza na ręczne potwierdzenie człowieka przed przejściem dalej.

## 5. Domena wg DDD (z L5, repo ObiTracker)

**Ubiquitous language (kluczowe pojęcia)**: _Handler_ (jedyna persona, brak encji `Account`/`Handler` w kodzie — to wiersz `auth.users`), _Dog_ (root własności), _Training element_ (customowa jednostka treningu per pies — cecha różnicująca produktu), _Training log/tick_ (rekord obecności, insert-lub-delete, bez notatek), _Highlight (green/red)_ (klasyfikacja rzędów).

**Największy rozjazd model-vs-kod**: PRD (`prd.md:106-108`) mówi, że highlight powinien zależeć od wybranego okna (7/14/30 dni); kod liczy highlight **zawsze** z pełnej stałej historii 30-dniowej, niezależnie od selektora okna — udokumentowana, świadoma decyzja implementacyjna, nigdy nie wpisana z powrotem do PRD. Dodatkowo PRD opisuje jedną prostą regułę top-3/bottom-3, a kod ma pięciokrotnie skorygowany algorytm 3-poziomowy (próg gęstości danych, suppresja przy ≥50% pokrycia, ochrona przed arbitralnym awansem przy remisie).

**Niezmiennik #1 i agregat**: _"Klasyfikacja highlight musi być kompletną, deterministyczną funkcją historii ticków psa"_ — najbardziej core (jest dosłownie Primary Success Criterion, `prd.md:38`) i najmniej egzekwowany: jedynym strażnikiem jest komponent UI (`TrainingGrid.tsx`, `useMemo`), bez żadnej warstwy serwisu/API/repozytorium. Zaproponowany agregat: **`TrainingBoard`** (`src/lib/domain/training-board.ts`) z jedyną fabryką `TrainingBoard.create()`, która fail-fast rzuca `UnknownElementTickError` zamiast cicho gubić ticki nieznanych elementów (dziś ten "swallow" jest wręcz asertowany jako poprawny w istniejącym teście).

**Anti-Corruption Layer**: Wybrany przeciek (Leak B, "gorszy" bo niewidoczny) to typ `User` z `@supabase/supabase-js` wpisany wprost do globalnego ambient-kontraktu `App.Locals` (`src/env.d.ts:3`) — **każda** strona/route dziedziczy zależność od kształtu GoTrue'a bez jednego importu. Przecieka przez **2 warstwy widoczne wprost** (`env.d.ts`, `middleware.ts`), ale efektywnie przez **wszystkie** route'y/strony aplikacji pośrednio (7 plików konsumujących w Step 1, z czego wszystkie czytają wyłącznie `.id` z ~20 pól typu `User`). Projekt ACL: value object `AuthenticatedAccount { id }` + port `SessionPort` + adapter `SupabaseSessionAdapter` — jedyne miejsce znające GoTrue. Leak A (`SupabaseClient` wstrzykiwany do 3 plików serwisów) świadomie odłożony — zbyt kosztowny względem obecnego drivera (solo MVP, brak drugiego backendu na horyzoncie).

## 6. Decyzje, które należą do mnie

AI (Claude) zbudował mapę repo Sxx z trzech niezależnych narzędzi (git log, dependency-cruiser/ArchUnitNET, kontrybutorzy), wykonał trace e2e i ranking długu technicznego dla `edit-package-contents`, oraz — kluczowe — samodzielnie zweryfikował własne wcześniejsze twierdzenia ast-grepem, znajdując i korygując 3 błędne liczby i 1 błędną klasyfikację ("cykl" → "łańcuch jednokierunkowy") zanim trafiły do planu refaktoryzacji. To rozstrzygnięcie ("czy to naprawdę cykl") **musiałem zweryfikować ja**, bo błędna klasyfikacja zmieniłaby priorytet naprawy (cykl = pilniejszy niż jednokierunkowa zależność). Podobnie w L5: to ja rozstrzygam, że Leak B (niewidoczny globalny typ) jest ważniejszy do naprawy niż Leak A (widoczny, ale kosztowny) — AI dało analizę kosztu/ryzyka, ale wybór priorytetu i zakresu (odłożenie Leak A, brak dodawania testów dla `GetOrdersLinesHandler`) to decyzje produktowe/inżynierskie, które zostawiłem sobie, opierając się na tym, że koszt-korzyść był jednoznaczny, a nie na ślepym zaufaniu do rankingu AI.
