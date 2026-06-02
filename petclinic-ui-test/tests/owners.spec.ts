import { test, expect } from '@playwright/test';
import { OwnersPage } from './pages/OwnersPage';
import { ApiClient } from './support/api-client';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Owners Page', () => {
  let apiClient: ApiClient;
  let screenshotDir: string;

  test.beforeAll(() => {
    apiClient = new ApiClient();
    screenshotDir = path.join(__dirname, '..', 'test-results', 'screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
  });

  test.afterEach(async ({ page }, testInfo) => {
    // Capture screenshot after each test
    const sanitizedTitle = testInfo.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotPath = path.join(screenshotDir, `${sanitizedTitle}_${timestamp}.png`);

    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Screenshot saved: ${screenshotPath}`);
  });

  test('shows all owners on initial load', async ({ page }) => {
    const ownersPage = new OwnersPage(page);

    // Fetch expected owners from API
    const expectedOwners = await apiClient.fetchOwners();
    const expectedFullNames = ApiClient.getFullNames(expectedOwners);

    // Open the owners page
    await ownersPage.open();

    // Wait for the expected number of owners
    await ownersPage.waitForOwnersCount(expectedFullNames.length);

    // Get actual owner names from the page
    const actualFullNames = await ownersPage.getOwnerFullNames();

    // Assert that all expected owners are displayed
    expect(ApiClient.sorted(actualFullNames)).toEqual(ApiClient.sorted(expectedFullNames));
  });

  test('filters owners live by a mid-word city fragment (case-insensitive contains)', async ({ page }) => {
    // Derive a mid-word, lower-cased fragment from a real owner's city
    const allOwners = await apiClient.fetchOwners();
    const source = allOwners.find(o => o.city && o.city.trim().length >= 4);
    expect(source).toBeDefined();
    const fragment = source!.city!.trim().slice(1, 4).toLowerCase();

    // Expected result set straight from the API
    const expectedOwners = await apiClient.fetchOwnersByQuery(fragment);
    const expectedFullNames = ApiClient.getFullNames(expectedOwners);
    expect(expectedFullNames.length).toBeGreaterThan(0);

    const ownersPage = new OwnersPage(page);
    await ownersPage.open();

    // Type into the search box — no button; the list refreshes after the debounce
    await ownersPage.search(fragment);
    await ownersPage.waitForOwnersCount(expectedFullNames.length);

    const actualFullNames = await ownersPage.getOwnerFullNames();
    expect(ApiClient.sorted(actualFullNames)).toEqual(ApiClient.sorted(expectedFullNames));
  });

  test('filters owners by pet name', async ({ page }) => {
    const allOwners = await apiClient.fetchOwners();
    const withPet = allOwners.find(o => o.pets && o.pets.length > 0 && o.pets[0].name);
    expect(withPet).toBeDefined();
    const petName = withPet!.pets![0].name;

    const expectedOwners = await apiClient.fetchOwnersByQuery(petName);
    const expectedFullNames = ApiClient.getFullNames(expectedOwners);
    expect(expectedFullNames).toContain(`${withPet!.firstName} ${withPet!.lastName}`.trim());

    const ownersPage = new OwnersPage(page);
    await ownersPage.open();

    await ownersPage.search(petName);
    await ownersPage.waitForOwnersCount(expectedFullNames.length);

    const actualFullNames = await ownersPage.getOwnerFullNames();
    expect(ApiClient.sorted(actualFullNames)).toEqual(ApiClient.sorted(expectedFullNames));
  });
});
