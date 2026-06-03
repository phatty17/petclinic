import { test, expect, Page } from '@playwright/test';
import { OwnersPage } from './pages/OwnersPage';

/**
 * E2E coverage for server-side sort & pagination on the Owners list
 * (OpenSpec change `owners-sort-pagination`, task 8.1).
 *
 * URL query params are the single source of truth: `q`, `page` (0-indexed),
 * `size`, `sort` (`col,dir`). Params equal to defaults (page=0, size=10,
 * empty q, no sort) are STRIPPED — the bare default view is `/owners`.
 */
test.describe('Owners list — server-side sort & pagination', () => {
  // The query string the SPA actually applied (router strips default-valued params).
  const queryParams = (page: Page): URLSearchParams =>
    new URLSearchParams(new URL(page.url()).search);

  // Wait for the URL's `sort` param to settle to the expected value after a header click.
  const expectSortParam = async (page: Page, expected: string) =>
    expect
      .poll(() => queryParams(page).get('sort'), { timeout: 5000 })
      .toBe(expected);

  test('clicking Name / City / Address headers sorts the rows', async ({ page }) => {
    const owners = new OwnersPage(page);
    await owners.open();

    // --- City ascending: cities on the page must be non-decreasing ---
    await owners.clickSort('City');
    await expectSortParam(page, 'city,asc');
    await expect(owners.cityCells.first()).toBeVisible();
    const cities = await owners.getCities();
    expect(cities.length).toBeGreaterThan(1);
    expect(cities).toEqual([...cities].sort((a, b) => a.localeCompare(b)));

    // --- Address ascending ---
    await owners.clickSort('Address');
    await expectSortParam(page, 'address,asc');
    const addresses = await owners.getAddresses();
    expect(addresses.length).toBeGreaterThan(1);
    expect(addresses).toEqual([...addresses].sort((a, b) => a.localeCompare(b)));

    // --- Name ascending: sorts by lastName (server expands to lastName,firstName,id) ---
    await owners.clickSort('Name');
    await expectSortParam(page, 'lastName,asc');
    const names = await owners.getDisplayedNames();
    const lastNames = names.map(n => n.split(' ').slice(-1)[0]);
    expect(lastNames.length).toBeGreaterThan(1);
    expect(lastNames).toEqual([...lastNames].sort((a, b) => a.localeCompare(b)));
    // With the seed data, the very first owner by lastName is Henry Baskerville.
    expect(names[0]).toBe('Henry Baskerville');
  });

  test('clicking the active header toggles direction asc <-> desc', async ({ page }) => {
    const owners = new OwnersPage(page);
    await owners.open();

    await owners.clickSort('City');
    await expectSortParam(page, 'city,asc');
    await expect.poll(() => owners.ariaSort('City')).toBe('ascending');

    // Second click on the active header -> descending
    await owners.clickSort('City');
    await expectSortParam(page, 'city,desc');
    await expect.poll(() => owners.ariaSort('City')).toBe('descending');

    const citiesDesc = await owners.getCities();
    expect(citiesDesc).toEqual([...citiesDesc].sort((a, b) => b.localeCompare(a)));
  });

  test('clicking the active header keeps cycling asc/desc — sort never clears', async ({ page }) => {
    const owners = new OwnersPage(page);
    await owners.open();

    await owners.clickSort('Name'); // asc
    await expectSortParam(page, 'lastName,asc');

    await owners.clickSort('Name'); // desc
    await expectSortParam(page, 'lastName,desc');

    // Third click: with matSortDisableClear the sort must NOT clear — it cycles back to asc.
    await owners.clickSort('Name');
    await expectSortParam(page, 'lastName,asc');
    expect(queryParams(page).has('sort')).toBe(true);

    // Fourth click: still cycling, still present.
    await owners.clickSort('Name');
    await expectSortParam(page, 'lastName,desc');
    expect(queryParams(page).has('sort')).toBe(true);
    await expect.poll(() => owners.ariaSort('Name')).not.toBe('none');
  });

  test('lastName is bold (<strong>) while name sort is active, plain otherwise', async ({ page }) => {
    const owners = new OwnersPage(page);

    // Default view (no sort): names are plain text, no <strong>.
    await owners.open();
    expect(await owners.boldLastNameCount()).toBe(0);

    // Name sort active: each visible name cell wraps lastName in <strong>.
    await owners.clickSort('Name');
    await expectSortParam(page, 'lastName,asc');
    const rowCount = (await owners.getDisplayedNames()).length;
    await expect.poll(() => owners.boldLastNameCount()).toBe(rowCount);

    // Sorting by a non-name column removes the bold styling again.
    await owners.clickSort('City');
    await expectSortParam(page, 'city,asc');
    await expect.poll(() => owners.boldLastNameCount()).toBe(0);
  });

  test('paginator navigates to the next page (different rows, URL gains page=1)', async ({ page }) => {
    const owners = new OwnersPage(page);
    // Sort by city so paging is deterministic regardless of insertion order.
    await owners.open('?sort=city,asc');
    await expect(owners.paginatorRangeLabel).toContainText('1');

    const firstPageNames = await owners.getDisplayedNames();
    expect(firstPageNames.length).toBe(10); // default size 10

    await owners.paginatorNext.click();

    // URL gains page=1; size stays default (10) so no `size` param.
    await expect.poll(() => queryParams(page).get('page')).toBe('1');
    expect(queryParams(page).has('size')).toBe(false);

    await expect(owners.paginatorRangeLabel).toContainText('11');
    const secondPageNames = await owners.getDisplayedNames();
    // The next page must show a different set of rows.
    expect(secondPageNames).not.toEqual(firstPageNames);
    expect(secondPageNames.some(n => firstPageNames.includes(n))).toBe(false);
  });

  test('default-valued params are stripped; non-default params are present', async ({ page }) => {
    const owners = new OwnersPage(page);
    await owners.open();

    // Bare default view: no params at all.
    expect(queryParams(page).toString()).toBe('');

    // Sorting adds only `sort` (still page 0, size 10 -> stripped).
    await owners.clickSort('City');
    await expectSortParam(page, 'city,asc');
    let params = queryParams(page);
    expect(params.get('sort')).toBe('city,asc');
    expect(params.has('page')).toBe(false);
    expect(params.has('size')).toBe(false);
    expect(params.has('q')).toBe(false);

    // Searching adds `q` and (since search resets to page 0) keeps page absent.
    await owners.search('London');
    await expect.poll(() => queryParams(page).get('q')).toBe('London');
    params = queryParams(page);
    expect(params.get('sort')).toBe('city,asc'); // sort preserved
    expect(params.has('page')).toBe(false);
  });

  test('deep-link /owners?page=2&size=5&sort=city,asc loads the correct state', async ({ page }) => {
    const owners = new OwnersPage(page);
    await owners.open('?page=2&size=5&sort=city,asc');

    // page=2 with size=5 is the THIRD page (0-indexed) -> range 11–15.
    await expect(owners.paginatorRangeLabel).toContainText('11');
    await expect(owners.paginatorRangeLabel).toContainText('15');

    // City header reflects ascending sort.
    await expect.poll(() => owners.ariaSort('City')).toBe('ascending');

    const cities = await owners.getCities();
    expect(cities.length).toBe(5);
    expect(cities).toEqual([...cities].sort((a, b) => a.localeCompare(b)));
    // Seed data: page 3 of city-asc begins at "La Mancha".
    expect(cities[0]).toBe('La Mancha');

    // URL params are preserved as given.
    const params = queryParams(page);
    expect(params.get('page')).toBe('2');
    expect(params.get('size')).toBe('5');
    expect(params.get('sort')).toBe('city,asc');
  });

  test('browser back button restores the previous sort/page state', async ({ page }) => {
    const owners = new OwnersPage(page);
    await owners.open();

    // State A: sort by city asc.
    await owners.clickSort('City');
    await expectSortParam(page, 'city,asc');
    const citiesAsc = await owners.getCities();

    // State B: go to page 2 (preserves the city sort).
    await owners.paginatorNext.click();
    await expect.poll(() => queryParams(page).get('page')).toBe('1');
    const page2Cities = await owners.getCities();
    expect(page2Cities).not.toEqual(citiesAsc);

    // Press back -> should restore State A (page 0, city asc).
    await page.goBack();
    await expect.poll(() => queryParams(page).get('page')).toBe(null);
    await expect.poll(() => queryParams(page).get('sort')).toBe('city,asc');
    await expect(owners.paginatorRangeLabel).toContainText('1');
    await expect.poll(() => owners.ariaSort('City')).toBe('ascending');
    expect(await owners.getCities()).toEqual(citiesAsc);
  });

  test('browser back restores a search term and page', async ({ page }) => {
    const owners = new OwnersPage(page);
    await owners.open();

    // Search "London" (multiple seed owners live in London).
    await owners.search('London');
    await expect.poll(() => queryParams(page).get('q')).toBe('London');
    const searchedNames = await owners.getDisplayedNames();
    expect(searchedNames.length).toBeGreaterThan(0);

    // Navigate away to a clean default view.
    await owners.open();
    expect(queryParams(page).toString()).toBe('');

    // Back -> the search term and its result set are restored.
    await page.goBack();
    await expect.poll(() => queryParams(page).get('q')).toBe('London');
    await expect(owners.searchInput).toHaveValue('London');
    await expect.poll(() => owners.getDisplayedNames()).toEqual(searchedNames);
  });
});
