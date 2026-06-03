## Why

The owners list currently loads all records at once, which becomes unusable at production scale (100k+ owners). Adding server-side sorting and pagination makes the screen viable at scale and improves usability by letting users find records quickly by sorting on relevant columns.

## What Changes

- `GET /api/owners` now returns a `Page<OwnerDto>` envelope (`content`, `totalElements`, `totalPages`, `number`, `size`) instead of a flat array
- New query params on `GET /api/owners`: `?page=`, `?size=`, `?sort=col,dir`
- Server-side sort-chain expansion: a single client column maps to a stable multi-field sort ending in `id ASC` as tiebreaker
- Sortable columns: Name, Address, City (Pets column is not sortable)
- Name column display is unchanged (`firstName lastName`); sorting by Name sorts `lastName, firstName, id`, and the lastName portion of each cell is rendered **bold** while the name sort is active to signal the sort key
- Angular owners list replaces client-side rendering with server-driven pagination (`<mat-paginator>`) and column sort (`matSort`)
- Page sizes: 5 / 10 / 20, default 10
- Sort, page, and size state lives in the URL query string (bookmarkable, back-button safe)
- Loading UX: existing rows stay visible but dimmed with a spinner overlay during fetch
- **BREAKING**: `GET /api/owners` response shape changes from `OwnerDto[]` to `Page<OwnerDto>` — all consumers updated (tests, generated `api-types.ts`, frontend service)

## Capabilities

### New Capabilities

- `owners-pagination`: Server-side pagination of the owners list — paginator UI, `page`/`size` params, `Page<OwnerDto>` response envelope
- `owners-sorting`: Server-side column sorting of the owners list — `matSort` on table headers, sort-chain expansion on the backend, `sort` query param, URL state persistence

### Modified Capabilities

<!-- none — no existing specs to delta -->

## Impact

- **Backend:** `OwnersController.findAll`, `Owner` entity queries, new `Page` DTO, TypeORM `findAndCount` or QueryBuilder usage; all existing owner-list tests updated
- **Frontend:** `OwnerListComponent` template and component class, `OwnerService.getOwners()` return type, `api-types.ts` regenerated
- **E2E tests:** New Playwright test in `petclinic-ui-test/` covering sort, paginate, deep-link, and back-button
- **API contract:** Breaking change to `GET /api/owners` — `openapi.yaml` updated
