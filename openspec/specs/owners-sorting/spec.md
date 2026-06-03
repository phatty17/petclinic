# owners-sorting

## Purpose

Server-side column sorting of the owners list: clickable Name/Address/City headers drive a `sort`
query param that the backend expands into a stable multi-field `ORDER BY` chain (always ending in
`id ASC`), with the active sort persisted in the URL.

## Requirements

### Requirement: Sortable column headers on owners list
The owners table SHALL support sorting by clicking the Name, Address, and City column headers.
The Pets column SHALL NOT be sortable.

#### Scenario: Click Name column to sort ascending
- **WHEN** the user clicks the "Name" column header (no active sort)
- **THEN** the table reloads sorted by last name ascending, then first name ascending, then id ascending

#### Scenario: Click active column to toggle direction
- **WHEN** the user clicks the currently sorted column header
- **THEN** the sort direction toggles between ascending and descending

#### Scenario: Sort never clears once active
- **WHEN** the user clicks the currently sorted column header repeatedly (third, fourth, … click)
- **THEN** the sort keeps cycling asc↔desc and is never deactivated (`matSortDisableClear`)

#### Scenario: Click different column resets to ascending
- **WHEN** the user clicks a different column than the currently sorted one
- **THEN** the new column sorts ascending and the previous sort is cleared

#### Scenario: Pets column header has no sort trigger
- **WHEN** the user clicks the Pets column header
- **THEN** no sort is applied and the sort state is unchanged

### Requirement: Server-side sort chain expansion
The backend SHALL expand a single sort column key into a stable multi-field `ORDER BY` chain.
The final field in every sort chain SHALL be `id ASC` as a tiebreaker.

#### Scenario: Sort by Name expands to lastName, firstName, id
- **WHEN** the client sends `?sort=lastName,asc`
- **THEN** the backend applies `ORDER BY lastName ASC, firstName ASC, id ASC`

#### Scenario: Sort by City expands to city, lastName, firstName, id
- **WHEN** the client sends `?sort=city,asc`
- **THEN** the backend applies `ORDER BY city ASC, lastName ASC, firstName ASC, id ASC`

#### Scenario: Sort by Address expands to address, lastName, firstName, id
- **WHEN** the client sends `?sort=address,asc`
- **THEN** the backend applies `ORDER BY address ASC, lastName ASC, firstName ASC, id ASC`

#### Scenario: Descending sort mirrors the whole chain
- **WHEN** the client sends `?sort=lastName,desc`
- **THEN** the backend applies `ORDER BY lastName DESC, firstName DESC, id ASC` — `desc` flips every field in the chain except the `id` tiebreaker, which always stays ASC

#### Scenario: No sort param falls back to id ascending
- **WHEN** the client sends no `sort` param
- **THEN** the backend applies `ORDER BY id ASC`

#### Scenario: Unknown sort column is rejected
- **WHEN** the client sends `?sort=pets,asc` (or any column outside `lastName`, `city`, `address`)
- **THEN** the backend responds `400 Bad Request` with an RFC-7807 ProblemDetail body

#### Scenario: Unknown sort direction is rejected
- **WHEN** the client sends `?sort=city,sideways` (or any direction outside `asc`, `desc`)
- **THEN** the backend responds `400 Bad Request` with an RFC-7807 ProblemDetail body

### Requirement: Sort state in URL
The active sort column and direction SHALL be reflected in the URL query string.

#### Scenario: Sort state in URL after clicking column header
- **WHEN** the user clicks the City column header
- **THEN** the URL contains `?sort=city,asc`

#### Scenario: Deep-link with sort param restores active sort
- **WHEN** the user opens the owners list with `?sort=address,desc`
- **THEN** the table renders with the Address column header showing a descending sort indicator and rows sorted accordingly

### Requirement: Name column sorts by lastName with a bold visual cue
The Name column header SHALL be labelled "Name" and cells SHALL keep displaying the owner's name as `firstName lastName` (unchanged). Sorting by Name SHALL sort by `lastName` first. While the name sort is active, the lastName portion of each cell SHALL be rendered bold to signal the sort key; when inactive, the cell renders plain.

#### Scenario: Name cell display is unchanged when not sorted
- **WHEN** the owners list is displayed with no active name sort
- **THEN** each row in the Name column shows the format "John Doe" (firstName lastName) with no emphasis

#### Scenario: lastName is bold while name sort is active
- **WHEN** the user sorts by the Name column
- **THEN** each Name cell renders the lastName portion in bold (e.g. "John **Doe**") while firstName stays plain

#### Scenario: Clicking Name header sorts by lastName
- **WHEN** the user clicks the Name column header
- **THEN** rows are sorted alphabetically by last name ascending (then first name, then id)
