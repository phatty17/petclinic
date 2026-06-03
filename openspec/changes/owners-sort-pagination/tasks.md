## 1. Backend – Page envelope DTO

- [x] 1.1 Create `src/common/dto/page.dto.ts` with generic `PageDto<T>` class (`content`, `totalElements`, `totalPages`, `number`, `size`) annotated with `@ApiProperty`
- [x] 1.2 Write failing controller unit tests asserting: `GET /api/owners` returns a `PageDto<OwnerDto>` envelope (not a flat array); `?size=0` and `?size=101` return 400; `?page=-1` returns 400
- [x] 1.3 Update `listOwners` in `OwnersController` to accept `page` (`@Min(0)`, default 0) and `size` (`@Min(1) @Max(100)`, default 10) `@Query` params with `transform: true`; return `Promise<PageDto<OwnerDto>>`
- [x] 1.4 Update `@ApiOkResponse` decorator on `listOwners` to reflect the new `PageDto<OwnerDto>` response type

## 2. Backend – Sort chain expansion

- [x] 2.1 Write failing unit tests for sort-chain expansion: assert that `lastName` → `ORDER BY lastName, firstName, id ASC`; `city` → `ORDER BY city, lastName, firstName, id ASC`; `address` → `ORDER BY address, lastName, firstName, id ASC`; no sort param → `ORDER BY id ASC`; `desc` direction flips the whole chain except `id` (e.g. `lastName,desc` → `ORDER BY lastName DESC, firstName DESC, id ASC`); unknown column (e.g. `pets`) → throws `BadRequestException`; unknown direction (e.g. `sideways`) → throws `BadRequestException`
- [x] 2.2 Extract a `buildSortOrder(sortParam?: string)` pure helper (equivalent QueryBuilder `.orderBy` calls) and implement so all tests pass; throw `BadRequestException` for any column outside `['lastName', 'city', 'address']` or direction outside `['asc', 'desc']`
- [x] 2.3 Add `@ApiQuery` decorator for `sort` param (format `col,dir`, optional) to `listOwners`

## 3. Backend – Paginated query

- [x] 3.1 Refactor `findByVisibleText` to accept `page`, `size`, and sort order; apply `.skip(page * size).take(size)` and the sort chain to the existing `createQueryBuilder`
- [x] 3.2 Use separate `.getCount()` and `.getMany()` calls (avoid `getManyAndCount` with join inflation) and assemble the `PageDto`
- [x] 3.3 Confirm the existing failing test from 1.2 now passes end-to-end

## 4. Backend – Update consumers

- [x] 4.1 Update all backend tests that call `GET /api/owners` and expect `OwnerDto[]` to expect `PageDto<OwnerDto>` and unwrap `.content` where needed (controller spec, e2e owner steps, perf test)
- [x] 4.2 Regenerate `openapi.yaml` (run `npm run build` in backend to trigger Swagger export, or equivalent) and commit the updated spec

## 5. Frontend – Types and service

- [x] 5.1 Add `OwnerPage` interface to [owner-page.ts](petclinic-frontend/src/app/owners/owner-page.ts) (or create it) with fields `content: Owner[]`, `totalElements: number`, `totalPages: number`, `number: number`, `size: number`
- [x] 5.2 Update `OwnerService.searchOwners` to accept `{ q, page, size, sort }` params via `HttpParams` and return `Observable<OwnerPage>` instead of `Observable<Owner[]>`; remove the existing `catchError(this.handlerError(...))` so errors propagate to the component

## 6. Frontend – Angular Material modules

- [x] 6.1 Add `MatSortModule` and `MatPaginatorModule` imports to [owners.module.ts](petclinic-frontend/src/app/owners/owners.module.ts)
- [x] 6.2 Verify `MatSortModule` and `MatPaginatorModule` are available in the Angular Material package (already a dependency); no new `npm install` needed

## 7. Frontend – OwnerListComponent

- [x] 7.1 Add `MatSort` and `MatPaginator` `@ViewChild` references and inject `ActivatedRoute`, `Router`, and `MatSnackBar` into [owner-list.component.ts](petclinic-frontend/src/app/owners/owner-list/owner-list.component.ts)
- [x] 7.2 In `ngAfterViewInit`, subscribe to `ActivatedRoute.queryParams` as the **single fetch trigger**: on each emission read `q`, `page`, `size`, `sort`; sync controls (`searchControl.setValue(q, { emitEvent: false })`, `paginator.pageIndex`, `paginator.pageSize`, `sort.active`/`sort.direction`); set `isLoading = true`; call `ownerService.searchOwners`; on success set `totalElements` and `isLoading = false`; on error show `MatSnackBar` and set `isLoading = false`
- [x] 7.3 Replace the existing `searchControl` + `switchMap` stream with a combined stream merging `searchControl.valueChanges` (debounced 300 ms), `sort.sortChange` events, and `paginator.page` events; each emission calls `router.navigate` only — resetting `page` to 0 for search/sort/size changes but preserving it for paginator page-change events; use a `buildQueryParams` helper that strips params equal to their defaults (`page=0`, `size=10`, `q=''`, no sort) before navigating
- [x] 7.4 Add `isLoading` boolean and `totalElements` number to the component; `isLoading` drives the loading overlay; `totalElements` is bound to `[length]` on `<mat-paginator>`
- [x] 7.5 Update [owner-list.component.html](petclinic-frontend/src/app/owners/owner-list/owner-list.component.html): add `matSort` **with `matSortDisableClear`** (sort never clears once active — clicks only toggle asc↔desc) to `<thead>`, add `mat-sort-header="lastName"` to the Name `<th>` and `mat-sort-header` to Address/City `<th>` elements only (Pets column gets no sort header), add `<mat-paginator [pageSizeOptions]="[5,10,20]" [length]="totalElements">` below table, add loading overlay div
- [x] 7.6 Update [owner-list.component.css](petclinic-frontend/src/app/owners/owner-list/owner-list.component.css): add dimming style for loading state (`.loading-overlay`, `opacity: 0.4` on table during load)
- [x] 7.7 Name cell bold-on-sort cue: keep rendering `firstName lastName`, but wrap the lastName portion in a `<strong>` (or bold-styled `<span>`) shown only while the name sort is active (`sort.active === 'lastName'`); plain rendering when sort is inactive or on another column

## 8. End-to-end tests

- [x] 8.1 Create `petclinic-ui-test/tests/owners-sort-pagination.spec.ts` with Playwright tests covering: clicking Name/City/Address header sorts rows (Name sorts by lastName); clicking active header toggles direction; clicking active header a third time keeps cycling asc↔desc (sort never clears, `sort` param stays in URL); lastName portion of Name cells is bold while name sort is active and plain otherwise; paginator navigates pages; URL contains `sort`, `page`, `size`, and `q` params after interaction (default-value params are absent); deep-link `?page=2&size=5&sort=city,asc` loads correct state (page=2 is the **third** page, 0-indexed); back button restores previous state including search term and page
- [x] 8.2 Confirm the new test is tagged or configured as CI-only (not in pre-commit hook)
