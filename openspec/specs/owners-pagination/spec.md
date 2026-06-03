# owners-pagination

## Purpose

Server-side pagination of the owners list: the `GET /api/owners` endpoint returns a page envelope
driven by `page`/`size` query params, and the Angular owners screen exposes a paginator whose state
lives in the URL so views are bookmarkable and back-button safe.

## Requirements

### Requirement: Paginated owners list API response
The `GET /api/owners` endpoint SHALL return a `Page<OwnerDto>` envelope instead of a flat array.
The envelope SHALL contain: `content` (array of `OwnerDto`), `totalElements` (integer), `totalPages` (integer), `number` (0-based page index), `size` (page size).

#### Scenario: Default page request
- **WHEN** `GET /api/owners` is called without `page` or `size` params
- **THEN** the response contains a page envelope with `number=0`, `size=10`, and `content` containing at most 10 owners

#### Scenario: Explicit page and size
- **WHEN** `GET /api/owners?page=1&size=5` is called
- **THEN** the response contains `number=1`, `size=5`, and `content` containing at most 5 owners from the second page

#### Scenario: Last page has fewer items
- **WHEN** `GET /api/owners?page=N&size=10` is called where page N is the last partial page
- **THEN** `content` contains fewer than 10 owners and `totalElements` equals the total count across all pages

#### Scenario: Page beyond total pages
- **WHEN** `GET /api/owners?page=999&size=10` is called and there are fewer than 9990 owners
- **THEN** the response contains an empty `content` array and correct `totalElements`

#### Scenario: Negative page is rejected
- **WHEN** `GET /api/owners?page=-1` is called
- **THEN** the backend responds `400 Bad Request` with an RFC-7807 ProblemDetail body

#### Scenario: Out-of-range size is rejected
- **WHEN** `GET /api/owners?size=0` or `GET /api/owners?size=101` is called
- **THEN** the backend responds `400 Bad Request` with an RFC-7807 ProblemDetail body (`size` must be 1–100)

### Requirement: Paginator UI with page size selector
The owners list screen SHALL display a `<mat-paginator>` below the table.
The paginator SHALL offer page sizes 5, 10, and 20. The default page size SHALL be 10.

#### Scenario: Paginator renders on page load
- **WHEN** the user navigates to the owners list
- **THEN** a paginator is visible below the table showing the current page, total items, and page size selector

#### Scenario: User changes page size
- **WHEN** the user selects page size 5 in the paginator
- **THEN** the table reloads with at most 5 rows and the page resets to page 0 (first page)

#### Scenario: User navigates to next page
- **WHEN** the user clicks the next-page button in the paginator
- **THEN** the table displays the next page of owners

### Requirement: Pagination state in URL
Non-default `page` and `size` values SHALL be reflected in the URL query string. Params equal to their defaults (`page=0`, `size=10`) SHALL be omitted, so the default view stays at a bare `/owners` URL. The `page` param is 0-indexed (`page=2` is the third page), matching `MatPaginator.pageIndex` and the `Page.number` response field.

#### Scenario: URL reflects page navigation
- **WHEN** the user navigates to the third page with size 5
- **THEN** the URL contains `?page=2&size=5`

#### Scenario: Default values are omitted from the URL
- **WHEN** the user is on the first page (page 0) with the default size 10
- **THEN** the URL contains neither `page` nor `size` params

#### Scenario: Deep-link restores correct page
- **WHEN** the user opens the owners list URL with `?page=2&size=5`
- **THEN** the table loads the third page (0-indexed page 2) with 5 rows per page without additional navigation

#### Scenario: Back button restores previous page
- **WHEN** the user is on the third page, navigates to an owner detail page, then presses the browser back button
- **THEN** the owners list returns to the third page

### Requirement: Snap to first page on filter, sort, or size change
Whenever the search term, sort column/direction, or page size changes, the current page SHALL reset to page 0 (first page).

#### Scenario: Filter change resets page
- **WHEN** the user is on the third page and modifies the search input
- **THEN** the page resets to page 0 and the table shows the first page of filtered results

#### Scenario: Sort change resets page
- **WHEN** the user is on the third page and clicks a sortable column header
- **THEN** the page resets to page 0 and the table shows the first page of the new sort order

#### Scenario: Size change resets page
- **WHEN** the user is on the third page and changes the page size
- **THEN** the page resets to page 0

### Requirement: Loading overlay during fetch
While a paginated request is in-flight, the owners list SHALL show the previous rows dimmed with a spinner overlay.

#### Scenario: Loading state visible during slow fetch
- **WHEN** a new page or filter is requested and the response is pending
- **THEN** the previous rows are visible but dimmed (reduced opacity) and a spinner is shown

#### Scenario: Loading state cleared after response
- **WHEN** the response arrives
- **THEN** the spinner is removed and the new rows are displayed at full opacity
