# Owners search over all visible columns

**Issue:** https://github.com/victorrentea/petclinic/issues/24
**Date:** 2026-06-02
**Branch:** `feature/owners-search-all-columns`

## Problem

The Owners list search filters only by `lastName`, with case-sensitive prefix
semantics (`GET /api/owners?lastName=X`). The issue asks for filtering across
any visible column content, case-insensitive, with contains semantics, based
on the visible textual content shown in the table.

The table shows five columns: Name (`firstName lastName`), Address, City,
Telephone, and Pets (pet names).

## Decisions

- **Backend filtering** via a new `?q=` query param (chosen over client-side
  filtering and over a hybrid).
- **`?q=` replaces `?lastName=`** — the Angular frontend is the only consumer;
  no dead params kept.
- **Name matches the concatenated visible string**: `"george fra"` matches
  George Franklin; `"rge fra"` does not.
- **Live as-you-type search** in the UI (debounced), replacing the
  "Find Owner" button.
- A match on any pet name returns the owner row with **all** its pets.

## Backend (`petclinic-backend-ts`)

`owner.controller.ts`:

- `listOwners(@Query('q') q = '')` replaces the `lastName` param. Swagger
  decorators updated; `openapi.yaml` regenerates via the existing sync
  guardrail.
- Private `findByLastNameStartingWith` becomes `findByVisibleText(q)`:
  - Reuses the existing escaping of `\`, `%`, `_` in user input.
  - QueryBuilder `WHERE`, each condition `ILIKE '%term%' ESCAPE '\'`:
    - `owner.first_name || ' ' || owner.last_name` (concatenated visible Name)
    - `owner.address`
    - `owner.city`
    - `owner.telephone`
    - `EXISTS (SELECT 1 FROM pets p WHERE p.owner_id = owner.id AND p.name ILIKE …)`
      — an `EXISTS` subquery, not a join filter, so a matched owner still
      returns all of its pets.
  - Keeps the existing eager `leftJoinAndSelect`s (pets, types, visits) and
    `ORDER BY owner.id ASC`.
  - Empty `q` yields the pattern `'%%'`, which matches every row — no
    special-case branch.

`ILIKE` and `||` string concatenation are PostgreSQL syntax; PostgreSQL is the
only supported database.

## Frontend (`petclinic-frontend`)

`owner.service.ts`:

- `searchOwners(q)` sends `?q=` using `HttpParams` (fixes the current
  unencoded string-concatenated URL).
- Existing `catchError → []` error handling stays.

`owner-list.component.ts`:

- The `lastName` ngModel, `searchByLastName()`, and the "Find Owner" button
  are removed, replaced by a reactive control:

```ts
searchControl = new FormControl('');
// ngOnInit:
this.searchControl.valueChanges.pipe(
  startWith(''), debounceTime(300), distinctUntilChanged(),
  switchMap(q => this.ownerService.searchOwners(q ?? ''))
).subscribe(owners => this.owners = owners);
```

- `switchMap` cancels stale in-flight requests so a slow earlier response
  cannot overwrite newer results.
- `startWith('')` replaces the separate initial `getOwners()` call — one code
  path for initial load and search. This delays the initial load by the 300ms
  debounce; accepted trade-off, do not add a second code path to avoid it.
- `ReactiveFormsModule` added to the owners module.

Template: a single labeled "Search" input (`id="ownersSearch"`), no submit
button. The table markup is unchanged.

## Tests (red-green TDD)

Backend e2e (`owner.e2e-spec.ts`) — failing tests first, using the suite's own
created fixtures (not migration seed data):

- Case-insensitive contains match on first name, last name, address, city,
  telephone.
- Concatenated name: a query like `"george fra"` matches a fixture owner named
  George Franklin.
- Pet-name match returns the owner with all of its pets.
- `%` and `_` in the query are treated literally.
- No match returns `[]`.
- Empty `q` returns all owners.
- The two existing `lastName` prefix tests are replaced.

Frontend Karma (`owner-list.component.spec.ts`):

- `fakeAsync`/`tick(300)`: rapid keystrokes produce a single backend call with
  the final term.
- Empty input on init loads all owners.

Playwright (`petclinic-ui-test`):

- `OwnersPage.searchByLastNamePrefix(prefix)` becomes `search(term)` — types
  into the input and awaits the debounced result.
- The prefix-filter spec becomes substring searches verified against the API,
  including a search by pet name.

## Out of scope

- Pagination, match highlighting.
- Changes to other `OwnerService` consumers.
- MCP server changes.
