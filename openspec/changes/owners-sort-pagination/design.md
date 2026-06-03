## Context

`GET /api/owners` currently returns a flat `OwnerDto[]` with no pagination or sorting. The Angular list loads all records in one shot, which is unacceptable at production scale (100k+ owners). The existing `findByVisibleText` query uses a raw `createQueryBuilder` with an `ILIKE` filter and a fixed `ORDER BY owner.id ASC`.

The frontend `OwnerListComponent` uses a reactive `searchControl` + `switchMap` pattern that already cancels stale in-flight requests — a good foundation to extend with pagination and sort params.

## Goals / Non-Goals

**Goals:**
- Server-side pagination: `page`, `size` query params; backend returns `Page<OwnerDto>` envelope
- Server-side sort on Name, Address, City columns; stable tiebreaker chain ending in `id ASC`
- Angular UI: `matSort` column headers + `<mat-paginator>`; page/sort/size state in URL
- All existing consumers of `GET /api/owners` updated to the new response shape
- Bookmarkable, back-button-safe URLs via Angular Router query params

**Non-Goals:**
- Client-side sorting or pagination (data volume rules it out)
- Sorting by the Pets column (1→N collection, semantically ambiguous)
- Persisting page size across sessions
- Case-insensitive lastName search
- Wiring `api-types.ts` into `OwnerService` (out of scope)
- Removing `/api/owners/count`

## Decisions

### 1. `Page<OwnerDto>` envelope shape

We adopt Spring-compatible shape `{ content, totalElements, totalPages, number, size }`. This is a well-understood convention and matches existing test expectations noted in the issue. The `content` array carries `OwnerDto[]`; the other fields drive the paginator.

**Alternative considered:** return total in a custom header. Rejected — headers are not accessible from `HttpClient` without extra options, and the envelope shape is standard.

### 2. Sort chain expansion on the server

The client sends a single column key + direction (e.g. `?sort=firstName,asc`). The backend expands it to a stable multi-field chain:
- `firstName` → `ORDER BY firstName, lastName, id ASC`
- `city` → `ORDER BY city, firstName, lastName, id ASC`
- `address` → `ORDER BY address, firstName, lastName, id ASC`
- `id ASC` is always the final tiebreaker to guarantee stable pagination with duplicate name/city rows.
- Unknown column or direction → `400 Bad Request` (`BadRequestException` via the global ProblemDetail filter).
- The direction (`asc`/`desc`) applies only to the primary column; tiebreakers always stay `ASC`.

**Alternative considered:** let the client send a full sort array. Rejected — it complicates the URL contract, exposes internals, and the tiebreaker would have to be enforced anyway.

### 3. URL state for page/sort/size/q

Angular Router `queryParams` carry `page`, `size`, `sort`, and `q` (e.g. `?q=smith&page=2&size=10&sort=city,asc`). The search term `q` is included because a bookmark of a paginated/sorted view is meaningless without the filter that produced it.

Page is **0-indexed** in the URL, matching Angular's `MatPaginator.pageIndex` and the Spring-style `Page.number` field — no translation layer needed.

Params equal to their default value are **omitted** from the URL to keep it clean (first page of unfiltered, unsorted list stays as `/owners`). A `buildQueryParams` helper strips falsy/default values before each `router.navigate` call. Defaults: `page=0`, `size=10`, no `sort`, `q=''`.

`ActivatedRoute.queryParams` is the **single source of truth** for all state after init. User input streams (search debounce, sort events, paginator events) only call `router.navigate`; the actual service call is triggered solely by the `queryParams` subscription. The subscription is set up in `ngAfterViewInit` so that `@ViewChild` refs (`MatSort`, `MatPaginator`) are available to sync state back on back-button navigation. Syncing `searchControl` from URL params uses `setValue(..., { emitEvent: false })` to avoid re-triggering navigation.

Sort direction is always explicit in the URL (e.g. `?sort=city,asc`, never `?sort=city`). `MatSort` `matSortDisableClear` is **not** set, so clicking an active header a third time deactivates sort and drops the `sort` param from the URL.

**Alternative considered:** component-local state only. Rejected — requirement explicitly requires URL persistence.

### 4. Snap to page 0 on filter/sort/size change

Whenever the search term (`q`), sort column/direction, or page size changes, the component resets `page` to 0. This avoids landing on a non-existent page.

### 5. Loading UX: dim + spinner overlay; snackbar on error

While a request is in-flight, the previous rows stay visible but are dimmed (`opacity: 0.4`) and a spinner overlay is shown. `isLoading` is set to `true` before the request and `false` in both the success and error callbacks. On error, a `MatSnackBar` notification is shown and the previous rows remain visible. The silent `catchError` fallback in `OwnerService.searchOwners` is removed so errors propagate to the component's error callback.

**Alternative considered:** clear rows immediately. Rejected — flickers badly on fast connections. Silent empty-result fallback in service also rejected — it would prevent the snackbar from ever firing.

### 6. TypeORM `findAndCount` vs `createQueryBuilder`

The `findByVisibleText` query already uses a `createQueryBuilder`. We extend it with `.skip(page * size).take(size)` and dynamic `orderBy` chains. `findAndCount` doesn't compose easily with the existing ILIKE sub-query, so we keep the builder.

### 7. Name column display and sort

The name cell continues to render as `firstName lastName` (unchanged from current). The column header stays "Name". Sorting by "Name" sorts by `firstName ASC, lastName ASC, id ASC`. The phonebook convention (`lastName, firstName`) was considered and rejected — the sort arrow already signals sort order; changing the display format adds scope without a compelling UX gain and would require updating existing E2E tests.

### 8. `<mat-paginator>` + `matSort` alongside Bootstrap table

Angular Material's `MatSort` directive attaches to `<thead>` and emits `MatSortable` events without replacing the Bootstrap `<table class="table table-striped">` markup. `<mat-paginator>` renders below the table as a standalone component. This avoids a full Material table migration.

### 9. Backend test scope

A dedicated controller unit test (`OwnersController.listOwners`) pins the sort-chain expansion logic — it asserts that a single column input produces the correct multi-field SQL `ORDER BY` (including the `id` tiebreaker). Full integration test via existing e2e suite.

### 10. Backend input validation

`page` and `size` query params are validated: `page` requires `@Min(0)`, `size` requires `@Min(1) @Max(100)`. The max-100 cap prevents a single request from loading the entire dataset, which would defeat the purpose of pagination. Both params go through NestJS class-validator with `transform: true` so string-to-number coercion happens automatically. Invalid values return `400 Bad Request` via the global ProblemDetail filter.

### 11. E2E test scope (Playwright)

A single Playwright spec in `petclinic-ui-test/` covers: click column header sorts, pagination controls navigate pages, deep-link URL loads correct state, browser back button restores previous state. CI-only (not pre-commit).

## Risks / Trade-offs

- **BREAKING change to `GET /api/owners`**: Any consumer not updated will break (currently: OwnerTest, OwnerSteps, generated `api-types.ts`, `OwnerService`). Mitigated by updating all in the same PR.
- **Pets join + pagination**: The current query does `leftJoinAndSelect('owner.pets', ...)` which inflates rows. Combined with SQL `LIMIT/OFFSET`, the count and content may diverge when pets count differs. Mitigation: use a subquery/`getMany` + `getCount` separately (TypeORM's `getManyAndCount` on a join query can double-count — use `.getCount()` + `.getMany()` on separate queries sharing the same WHERE).
- **Large page skip with OFFSET**: `OFFSET` becomes slow at high page numbers on large tables. Accepted trade-off for initial delivery; keyset pagination is out of scope.
- **`matSort` + Bootstrap table styling**: Material sort headers inject their own CSS classes and arrows. May need minor CSS to align with Bootstrap table look. Low risk — purely cosmetic.
