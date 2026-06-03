import { Page, Locator } from '@playwright/test';

export class OwnersPage {
  readonly page: Page;
  readonly pageTitle: Locator;
  readonly searchInput: Locator;
  readonly ownerNameCells: Locator;
  readonly ownersTable: Locator;
  readonly addressCells: Locator;
  readonly cityCells: Locator;
  readonly paginatorRangeLabel: Locator;
  readonly paginatorNext: Locator;
  readonly paginatorPrev: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageTitle = page.locator('h2:has-text("Owners")');
    this.searchInput = page.locator('#ownersSearch');
    this.ownerNameCells = page.locator('#ownersTable td.ownerFullName');
    this.ownersTable = page.locator('#ownersTable');
    // Name=1st col, Address=2nd, City=3rd, Telephone=4th, Pets=5th
    this.addressCells = page.locator('#ownersTable tbody tr td:nth-child(2)');
    this.cityCells = page.locator('#ownersTable tbody tr td:nth-child(3)');
    this.paginatorRangeLabel = page.locator('.mat-mdc-paginator-range-label');
    this.paginatorNext = page.locator('.mat-mdc-paginator-navigation-next');
    this.paginatorPrev = page.locator('.mat-mdc-paginator-navigation-previous');
  }

  /** Header <th> for a sortable column. label = visible text (Name/Address/City). */
  sortHeader(label: string): Locator {
    return this.page.locator(`#ownersTable thead th:has-text("${label}")`);
  }

  /** aria-sort reflects the Material sort state: 'none' | 'ascending' | 'descending'. */
  async ariaSort(label: string): Promise<string | null> {
    return this.sortHeader(label).getAttribute('aria-sort');
  }

  async clickSort(label: string) {
    await this.sortHeader(label).click();
  }

  async open(query: string = '') {
    // Quirk: a default `goto` (waitUntil 'load') only resolves after Angular has
    // bootstrapped, by which point the router may already have re-navigated and
    // dropped any deep-link query params (the goto then resolves to the bare URL).
    // `waitUntil: 'commit'` resolves the moment the navigation commits — before
    // bootstrap — so the address bar (and thus the component's queryParams read)
    // keeps the deep-link params. This is reliable for both bare and deep-link opens.
    await this.page.goto('/owners' + query, { waitUntil: 'commit' });
    await this.page.waitForSelector('#ownersTable td.ownerFullName', { timeout: 10000 });
  }

  /** Owner full names with collapsed whitespace (handles "First <strong>Last</strong>"). */
  async getDisplayedNames(): Promise<string[]> {
    const raw = await this.ownerNameCells.allTextContents();
    return raw.map(n => n.replace(/\s+/g, ' ').trim()).filter(n => n.length > 0);
  }

  async getCities(): Promise<string[]> {
    return (await this.cityCells.allTextContents()).map(c => c.trim());
  }

  async getAddresses(): Promise<string[]> {
    return (await this.addressCells.allTextContents()).map(a => a.trim());
  }

  /** Count of <strong> elements inside name cells (lastName is bold during name sort). */
  async boldLastNameCount(): Promise<number> {
    return this.page.locator('#ownersTable td.ownerFullName strong').count();
  }

  async getOwnerFullNames(): Promise<string[]> {
    await this.page.waitForSelector('#ownersTable td.ownerFullName, #ownersSearch', { timeout: 10000 });

    const elements = await this.ownerNameCells.all();
    const names: string[] = [];

    for (const element of elements) {
      const text = await element.textContent();
      if (text && text.trim()) {
        names.push(text.trim());
      }
    }

    return names;
  }

  async search(term: string) {
    await this.searchInput.waitFor({ state: 'visible' });
    await this.searchInput.fill(term);
  }

  async waitForOwnersCount(expectedCount: number) {
    try {
      await this.page.waitForFunction(
        (count) => {
          const cells = document.querySelectorAll('#ownersTable td.ownerFullName');
          return cells.length === count;
        },
        expectedCount,
        { timeout: 10000 }
      );
    } catch (error) {
      // Let assertions fail with actual values when wait condition is not met
    }
  }
}
