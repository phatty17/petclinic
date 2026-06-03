## 1. Backend – Page envelope DTO

- [ ] 1.1 Create `src/common/dto/page.dto.ts` with generic `PageDto<T>` class (`content`, `totalElements`, `totalPages`, `number`, `size`) annotated with `@ApiProperty`
- [ ] 1.2 Write a failing controller unit test asserting `GET /api/owners` returns a `PageDto<OwnerDto>` envelope (not a flat array)
- [ ] 1.3 Update `listOwners` in `OwnersController` to accept `page` (default 0) and `size` (default 10) `@Query` params and return `Promise<PageDto<OwnerDto>>`
- [ ] 1.4 Update `@ApiOkResponse` decorator on `listOwners` to reflect the new `PageDto<OwnerDto>` response type

## 2. Backend – Sort chain expansion

- [ ] 2.1 Write failing unit tests for sort-chain expansion: assert that `lastName` → `ORDER BY lastName, firstName, id ASC`; `city` → `ORDER BY city, lastName, firstName, id ASC`; `address` → `ORDER BY address, lastName, firstName, id ASC`; no sort param → `ORDER BY id ASC`; `desc` direction → tiebreaker stays `ASC`
- [ ] 2.2 Extract a `buildSortOrder(sortParam?: string): FindOptionsOrder<Owner>` (or equivalent QueryBuilder `.orderBy` calls) pure helper and implement so all tests pass
- [ ] 2.3 Add `@ApiQuery` decorator for `sort` param (format `col,dir`, optional) to `listOwners`

## 3. Backend – Paginated query

- [ ] 3.1 Refactor `findByVisibleText` to accept `page`, `size`, and sort order; apply `.skip(page * size).take(size)` and the sort chain to the existing `createQueryBuilder`
- [ ] 3.2 Use separate `.getCount()` and `.getMany()` calls (avoid `getManyAndCount` with join inflation) and assemble the `PageDto`
- [ ] 3.3 Confirm the existing failing test from 1.2 now passes end-to-end

## 4. Backend – Update consumers

- [ ] 4.1 Update all backend tests that call `GET /api/owners` and expect `OwnerDto[]` to expect `PageDto<OwnerDto>` and unwrap `.content` where needed (controller spec, e2e owner steps, perf test)
- [ ] 4.2 Regenerate `openapi.yaml` (run `npm run build` in backend to trigger Swagger export, or equivalent) and commit the updated spec

## 5. Frontend – Types and service

- [ ] 5.1 Add `OwnerPage` interface to [owner-page.ts](petclinic-frontend/src/app/owners/owner-page.ts) (or create it) with fields `content: Owner[]`, `totalElements: number`, `totalPages: number`, `number: number`, `size: number`
- [ ] 5.2 Update `OwnerService.searchOwners` to accept `{ q, page, size, sort }` params via `HttpParams` and return `Observable<OwnerPage>` instead of `Observable<Owner[]>`

## 6. Frontend – Angular Material modules

- [ ] 6.1 Add `MatSortModule` and `MatPaginatorModule` imports to [owners.module.ts](petclinic-frontend/src/app/owners/owners.module.ts)
- [ ] 6.2 Verify `MatSortModule` and `MatPaginatorModule` are available in the Angular Material package (already a dependency); no new `npm install` needed

## 7. Frontend – OwnerListComponent

- [ ] 7.1 Add `MatSort` and `MatPaginator` `@ViewChild` references to [owner-list.component.ts](petclinic-frontend/src/app/owners/owner-list/owner-list.component.ts)
- [ ] 7.2 Inject `ActivatedRoute` and `Router`; read initial `page`, `size`, `sort` from `queryParams` snapshot on init
- [ ] 7.3 Replace the existing `searchControl` + `switchMap` stream with a combined stream merging `searchControl.valueChanges`, sort events, and paginator events; on any change, reset page to 0 (except paginator page-change events), write params to URL via `router.navigate`, then call `ownerService.searchOwners`
- [ ] 7.4 Add `isLoading` boolean; set to `true` before each request and `false` on response (including errors)
- [ ] 7.5 Update [owner-list.component.html](petclinic-frontend/src/app/owners/owner-list/owner-list.component.html): add `matSort` to `<thead>`, add `mat-sort-header` to Name/Address/City `<th>` elements, rename Name header to "Name" (renders "Lastname, Firstname" in cells), add `<mat-paginator>` below table, add loading overlay div
- [ ] 7.6 Update [owner-list.component.css](petclinic-frontend/src/app/owners/owner-list/owner-list.component.css): add dimming style for loading state (`.loading-overlay`, `opacity: 0.4` on table during load)
- [ ] 7.7 Update each name cell to render `{{ owner.lastName }}, {{ owner.firstName }}` instead of `{{ owner.firstName }} {{ owner.lastName }}`

## 8. End-to-end tests

- [ ] 8.1 Create `petclinic-ui-test/tests/owners-sort-pagination.spec.ts` with Playwright tests covering: clicking Name/City/Address header sorts rows; clicking active header toggles direction; paginator navigates pages; URL contains sort+page+size params after interaction; deep-link `?page=2&size=5&sort=city,asc` loads correct state; back button restores previous state
- [ ] 8.2 Confirm the new test is tagged or configured as CI-only (not in pre-commit hook)
