# Owners Search Over All Visible Columns — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the case-sensitive last-name-prefix owners filter with a case-insensitive
contains-search (`GET /api/owners?q=`) over every visible table column (Name, Address, City,
Telephone, Pets), driven live (debounced) from the Angular UI.

**Architecture:** The NestJS `OwnerController` swaps its `?lastName=` prefix query for a `?q=`
ILIKE-contains query over the concatenated visible name, address, city, telephone, plus an
`EXISTS` subquery on pet names. The Angular owner-list component replaces its button-triggered
form with a reactive `FormControl` piped through `debounceTime(300) → distinctUntilChanged() →
switchMap`. The Playwright suite is updated to the new single search box.

**Tech Stack:** NestJS 10 + TypeORM 0.3 + PostgreSQL (ILIKE), Angular 16 (ReactiveFormsModule,
RxJS 7), Jest + supertest (backend e2e), Karma/Jasmine (frontend), Playwright (UI e2e).

**Spec:** `docs/superpowers/specs/2026-06-02-owners-search-all-columns-design.md`
**Branch:** all work happens on the existing `feature/owners-search-all-columns` branch.

**Prerequisite for any backend e2e run:** Postgres must be up — from the repo root run
`docker compose up -d` (or `./start-database.sh` in another terminal). ⚠️ The e2e suite
**silently skips** every test when the DB is unreachable (`isDbAvailable()` guard). If the
suite goes green in under ~5s with no DB, the tests did NOT run — check the DB.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `docs/superpowers/specs/2026-06-02-owners-search-all-columns-design.md` | Modify | Fix the wrong `rge fra` example |
| `petclinic-backend-ts/test/owner.e2e-spec.ts` | Modify | Replace 2 lastName-filter tests with the `?q=` test group |
| `petclinic-backend-ts/src/owners/owner.controller.ts` | Modify | `?q=` param + `findByVisibleText()` query |
| `openapi.yaml` | Regenerate | `npm run guardrail:openapi:generate` output |
| `petclinic-frontend/src/app/generated/api-types.ts` | Regenerate | `npm run generate:api` output |
| `petclinic-frontend/src/app/owners/owner.service.spec.ts` | Create | Unit test: `searchOwners` sends `?q=` |
| `petclinic-frontend/src/app/owners/owner.service.ts` | Modify | `searchOwners(q)` via `HttpParams` |
| `petclinic-frontend/src/app/owners/owner-list/owner-list.component.spec.ts` | Rewrite | Debounced live-search tests |
| `petclinic-frontend/src/app/owners/owner-list/owner-list.component.ts` | Rewrite | Reactive `searchControl` pipeline |
| `petclinic-frontend/src/app/owners/owner-list/owner-list.component.html` | Modify | Single search input, no button |
| `petclinic-frontend/src/app/owners/owners.module.ts` | Modify | Add `ReactiveFormsModule` |
| `petclinic-ui-test/tests/support/api-client.ts` | Modify | `fetchOwnersByQuery(q)`, `pets` on `OwnerDto` |
| `petclinic-ui-test/tests/pages/OwnersPage.ts` | Modify | `#ownersSearch` locator + `search(term)` |
| `petclinic-ui-test/tests/owners.spec.ts` | Modify | Substring + pet-name search tests |

---

### Task 1: Fix the wrong example in the spec

**Files:**
- Modify: `docs/superpowers/specs/2026-06-02-owners-search-all-columns-design.md`

The spec claims `"rge fra"` does not match George Franklin — but `"george franklin"`
**contains** the substring `"rge fra"` (g-e-o-**r-g-e-␣-f-r-a**-n…). A correct non-matching
example is the reversed order `"franklin geo"`.

- [ ] **Step 1: Fix the Decisions bullet**

In the spec file replace:

```markdown
- **Name matches the concatenated visible string**: `"george fra"` matches
  George Franklin; `"rge fra"` does not.
```

with:

```markdown
- **Name matches the concatenated visible string**: `"george fra"` matches
  George Franklin; the reversed `"franklin geo"` does not.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-06-02-owners-search-all-columns-design.md
git commit -m "Fix spec example: 'rge fra' is in fact a substring of 'George Franklin'"
```

---

### Task 2: Backend — `?q=` contains-search over visible columns

**Files:**
- Test: `petclinic-backend-ts/test/owner.e2e-spec.ts`
- Modify: `petclinic-backend-ts/src/owners/owner.controller.ts:58-68` and `:246-264`

Every positive test saves a **decoy owner** first. Without it, the suite's single fixture owner
makes "expect exactly [George]" pass even on the current implementation (which ignores `?q=`
and returns everyone) — the decoy is what makes the red phase actually red.

- [ ] **Step 1: Capture the fixture entities in the e2e spec**

In `petclinic-backend-ts/test/owner.e2e-spec.ts`, the pet-search test needs the owner/type
*entities* (not just ids) to add a second pet. Add imports at the top, next to the existing
fixture imports:

```typescript
import { Owner } from '../src/owners/owner.entity';
import { PetType } from '../src/pet-types/pet-type.entity';
```

Change the describe-level variables and `beforeEach` (currently lines 25-27 and 45-56) to also
keep the entities:

```typescript
  let ownerId: number;
  let petId: number;
  let petTypeId: number;
  let georgeOwner: Owner;
  let dogType: PetType;
```

```typescript
  beforeEach(async () => {
    if (!available) {
      return;
    }
    await cleanDatabase();
    const owner = await saveOwner(ds, { firstName: 'George', lastName: 'Franklin' });
    georgeOwner = owner;
    ownerId = owner.id;
    const type = await savePetType(ds, 'dog');
    dogType = type;
    petTypeId = type.id;
    const pet = await savePet(ds, owner, type, { name: 'Rosy', birthDate: todayIso() });
    petId = pet.id;
  });
```

(Fixture defaults, for reference: address `Baker St 221B`, city `London`, telephone
`1234567890` — see `test/fixtures.ts`.)

- [ ] **Step 2: Replace the two lastName-filter tests with the `?q=` test group**

Delete the tests `getAllWithLastNameFilter` and `getAllWithNameFilter_notFound`
(lines 88-100) and put this in their place:

```typescript
  // GET /api/owners?q= — case-insensitive 'contains' over the visible table
  // content: "first last" name, address, city, telephone, and pet names.
  // Each positive test saves a decoy owner that must NOT match, so the
  // assertions fail against the old return-everything behaviour.
  const saveDecoyOwner = () =>
    saveOwner(ds, {
      firstName: 'Zara',
      lastName: 'Quibble',
      address: 'Decoy Lane 1',
      city: 'Nowhere',
      telephone: '0000000000',
    });

  const ids = (body: { id: number }[]) => body.map((o) => o.id);

  it('search_byLastNameFragment_caseInsensitive', async () => {
    if (!available) return;
    await saveDecoyOwner();
    const res = await http().get('/api/owners').query({ q: 'rANKl' }).expect(200);
    expect(ids(res.body)).toEqual([ownerId]);
  });

  it('search_byFirstNameFragment', async () => {
    if (!available) return;
    await saveDecoyOwner();
    const res = await http().get('/api/owners').query({ q: 'eorg' }).expect(200);
    expect(ids(res.body)).toEqual([ownerId]);
  });

  it('search_byConcatenatedVisibleName', async () => {
    if (!available) return;
    await saveDecoyOwner();
    const res = await http().get('/api/owners').query({ q: 'george fra' }).expect(200);
    expect(ids(res.body)).toEqual([ownerId]);
  });

  it('search_reversedNameOrder_doesNotMatch', async () => {
    if (!available) return;
    const res = await http().get('/api/owners').query({ q: 'franklin geo' }).expect(200);
    expect(res.body).toEqual([]);
  });

  it('search_byAddressFragment', async () => {
    if (!available) return;
    await saveDecoyOwner();
    const res = await http().get('/api/owners').query({ q: 'aker st' }).expect(200);
    expect(ids(res.body)).toEqual([ownerId]);
  });

  it('search_byCityFragment', async () => {
    if (!available) return;
    await saveDecoyOwner();
    const res = await http().get('/api/owners').query({ q: 'ONDO' }).expect(200);
    expect(ids(res.body)).toEqual([ownerId]);
  });

  it('search_byTelephoneFragment', async () => {
    if (!available) return;
    await saveDecoyOwner();
    const res = await http().get('/api/owners').query({ q: '345678' }).expect(200);
    expect(ids(res.body)).toEqual([ownerId]);
  });

  it('search_byPetName_returnsOwnerWithAllPets', async () => {
    if (!available) return;
    await saveDecoyOwner();
    await savePet(ds, georgeOwner, dogType, { name: 'Max' });
    const res = await http().get('/api/owners').query({ q: 'osy' }).expect(200);
    expect(ids(res.body)).toEqual([ownerId]);
    const petNames = res.body[0].pets.map((p: { name: string }) => p.name).sort();
    expect(petNames).toEqual(['Max', 'Rosy']);
  });

  it('search_treatsLikeWildcardsLiterally', async () => {
    if (!available) return;
    const discount = await saveOwner(ds, { lastName: 'Wild', address: '50% Discount Rd' });
    const res = await http().get('/api/owners').query({ q: '50%' }).expect(200);
    expect(ids(res.body)).toEqual([discount.id]);

    const underscore = await http().get('/api/owners').query({ q: '_' }).expect(200);
    expect(underscore.body).toEqual([]);
  });

  it('search_noMatch_returnsEmpty', async () => {
    if (!available) return;
    const res = await http().get('/api/owners').query({ q: 'zzz-no-such' }).expect(200);
    expect(res.body).toEqual([]);
  });

  it('search_emptyQ_returnsAllOwners', async () => {
    if (!available) return;
    const decoy = await saveDecoyOwner();
    const res = await http().get('/api/owners').query({ q: '' }).expect(200);
    expect(ids(res.body)).toEqual([ownerId, decoy.id]);
  });
```

- [ ] **Step 3: Run the new tests — verify they FAIL (red)**

```bash
cd petclinic-backend-ts
npm run test:e2e -- owner.e2e-spec --testNamePattern='search_'
```

Expected: **FAIL** — every positive test gets the decoy id in the array; the negative tests
get non-empty arrays. (`search_emptyQ_returnsAllOwners` passes already — it pins existing
behaviour.) If everything "passes" in a flash, the DB is down and the suite skipped — see the
prerequisite note at the top.

- [ ] **Step 4: Implement `?q=` in the controller**

In `petclinic-backend-ts/src/owners/owner.controller.ts`, replace the `listOwners` endpoint
(doc comment + method, lines 58-68) with:

```typescript
  /**
   * GET /api/owners?q= — case-insensitive 'contains' filter over the visible
   * table content: the "first last" name, address, city, telephone, and pet
   * names; an empty q matches every owner.
   */
  @Get()
  @ApiOperation({ operationId: 'listOwners', summary: 'List owners' })
  @ApiOkResponse({ type: [OwnerDto] })
  async listOwners(@Query('q') q = ''): Promise<OwnerDto[]> {
    const owners = await this.findByVisibleText(q);
    return toOwnerDtoCollection(owners);
  }
```

Replace the private `findByLastNameStartingWith` method (doc comment + method,
lines 246-264) with:

```typescript
  /**
   * Finds owners whose visible table row contains the query, case-insensitively
   * (ILIKE '%q%'): the concatenated "first last" name, address, city, telephone,
   * or any pet name. Pet names are matched with an EXISTS subquery (not a join
   * filter) so a match on one pet still returns the owner with ALL its pets.
   * LIKE wildcards in the user-supplied query are escaped; an empty query
   * matches every owner. ILIKE / || / COALESCE are PostgreSQL syntax — the only
   * supported database.
   */
  private async findByVisibleText(q: string): Promise<Owner[]> {
    const escaped = q.replace(/[\\%_]/g, (ch) => `\\${ch}`);
    const term = `%${escaped}%`;
    // Eager-load pets (+ each pet's type and visits) so the owner mapper can
    // project them, so each owner in the list carries its full pets/visits.
    // Order by owner id to keep the list stable (id-ascending).
    return this.ownerRepository
      .createQueryBuilder('owner')
      .leftJoinAndSelect('owner.pets', 'pet')
      .leftJoinAndSelect('pet.type', 'type')
      .leftJoinAndSelect('pet.visits', 'visit')
      .where(
        "COALESCE(owner.firstName, '') || ' ' || COALESCE(owner.lastName, '') ILIKE :term ESCAPE '\\' " +
          "OR COALESCE(owner.address, '') ILIKE :term ESCAPE '\\' " +
          "OR COALESCE(owner.city, '') ILIKE :term ESCAPE '\\' " +
          "OR COALESCE(owner.telephone, '') ILIKE :term ESCAPE '\\' " +
          'OR EXISTS (SELECT 1 FROM pets pet_match WHERE pet_match.owner_id = owner.id ' +
          "AND pet_match.name ILIKE :term ESCAPE '\\')",
        { term },
      )
      .orderBy('owner.id', 'ASC')
      .getMany();
  }
```

Notes for the implementer:
- `owner.firstName` etc. inside the WHERE string are TypeORM *property paths* — the
  QueryBuilder rewrites them to `"owner"."first_name"`. `pet_match` is raw SQL (not a
  registered alias), so its columns use the real DB names `owner_id` / `name`
  (see `@Entity({ name: 'pets' })` / `@JoinColumn({ name: 'owner_id' })` in `pet.entity.ts`).
- `COALESCE` matters: the owner columns are nullable; without it a NULL field would make the
  whole concatenation NULL and an all-NULL owner would vanish even from the empty-query list.

- [ ] **Step 5: Run the e2e tests — verify they PASS (green)**

```bash
cd petclinic-backend-ts
npm run test:e2e -- owner.e2e-spec
```

Expected: **PASS** — all tests in the file, not just the `search_` group (the CRUD tests must
not regress).

- [ ] **Step 6: Run lint + unit tests**

```bash
cd petclinic-backend-ts
npm run lint && npm test
```

Expected: lint clean, unit tests PASS (none cover the controller's query today).

- [ ] **Step 7: Commit**

```bash
git add petclinic-backend-ts/src/owners/owner.controller.ts petclinic-backend-ts/test/owner.e2e-spec.ts
git commit -m "Owners API: replace ?lastName= prefix filter with ?q= contains-search over visible columns (#24)"
```

---

### Task 3: Regenerate the OpenAPI contract and frontend API types

**Files:**
- Regenerate: `openapi.yaml` (repo root)
- Regenerate: `petclinic-frontend/src/app/generated/api-types.ts`

Both files are generated artifacts guarded by CI drift checks — never hand-edit them.

- [ ] **Step 1: Regenerate `openapi.yaml`**

```bash
cd petclinic-backend-ts
npm run guardrail:openapi:generate
```

Expected: `openapi.yaml` at the repo root changes — the `listOwners` operation now has a `q`
query parameter instead of `lastName`.

- [ ] **Step 2: Verify the guardrail is satisfied**

```bash
cd petclinic-backend-ts
npm run guardrail:openapi
```

Expected: exit 0, no drift reported.

- [ ] **Step 3: Regenerate the frontend API types**

```bash
cd petclinic-frontend
npm run generate:api
```

Expected: `src/app/generated/api-types.ts` updated (parameter rename in the owners list
operation).

- [ ] **Step 4: Commit both artifacts**

```bash
git add openapi.yaml petclinic-frontend/src/app/generated/api-types.ts
git commit -m "Regenerate OpenAPI contract and frontend API types for ?q= owners search"
```

Note: `openapi.yaml` is CODEOWNERS-protected (`@victorrentea/elders`) — the PR will require
their review; nothing to do now.

---

### Task 4: Frontend service — `searchOwners` sends `?q=` via HttpParams

**Files:**
- Create: `petclinic-frontend/src/app/owners/owner.service.spec.ts`
- Modify: `petclinic-frontend/src/app/owners/owner.service.ts:53-61`

- [ ] **Step 1: Write the failing service test**

Create `petclinic-frontend/src/app/owners/owner.service.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { of } from 'rxjs';

import { OwnerService } from './owner.service';
import { HttpErrorHandler } from '../error.service';

// Stub mirroring HttpErrorHandler.createHandleError: swallow the error, emit the fallback.
class HttpErrorHandlerStub {
  createHandleError = (serviceName: string) =>
    (operation: string, result: any) => (error: any) => of(result);
}

describe('OwnerService', () => {
  let service: OwnerService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        OwnerService,
        {provide: HttpErrorHandler, useClass: HttpErrorHandlerStub}
      ]
    });
    service = TestBed.inject(OwnerService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('searchOwners issues GET /owners with q as an encoded query param', () => {
    service.searchOwners('george fra').subscribe();

    const req = httpMock.expectOne((r) => r.url === service.entityUrl);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('q')).toBe('george fra');
    req.flush([]);
  });
});
```

- [ ] **Step 2: Run it — verify it FAILS (red)**

```bash
cd petclinic-frontend
npm run test-headless
```

Expected: FAIL — the current implementation concatenates `'?lastName=' + lastName` into the
URL, so `r.url === service.entityUrl` never matches (`expectOne` finds no request).

- [ ] **Step 3: Implement `searchOwners(q)`**

In `petclinic-frontend/src/app/owners/owner.service.ts`, change the `HttpClient` import line to
also pull in `HttpParams`:

```typescript
import { HttpClient, HttpParams } from '@angular/common/http';
```

Replace the `searchOwners` method (lines 53-61) with:

```typescript
  searchOwners(q: string): Observable<Owner[]> {
    const params = new HttpParams().set('q', q);
    return this.http
      .get<Owner[]>(this.entityUrl, { params })
      .pipe(catchError(this.handlerError('searchOwners', [])));
  }
```

- [ ] **Step 4: Run the tests — verify PASS (green)**

```bash
cd petclinic-frontend
npm run test-headless
```

Expected: the new service spec PASSES. The two old `owner-list.component.spec.ts` tests
(`searchByLastName …`) still pass at this point — the component is unchanged until Task 5.

- [ ] **Step 5: Commit**

```bash
git add petclinic-frontend/src/app/owners/owner.service.spec.ts petclinic-frontend/src/app/owners/owner.service.ts
git commit -m "OwnerService: send the search term as ?q= via HttpParams"
```

---

### Task 5: Frontend component — debounced live search

**Files:**
- Rewrite: `petclinic-frontend/src/app/owners/owner-list/owner-list.component.spec.ts`
- Rewrite: `petclinic-frontend/src/app/owners/owner-list/owner-list.component.ts`
- Modify: `petclinic-frontend/src/app/owners/owner-list/owner-list.component.html:5-25`
- Modify: `petclinic-frontend/src/app/owners/owners.module.ts`

- [ ] **Step 1: Rewrite the component spec (failing tests first)**

Replace the entire content of
`petclinic-frontend/src/app/owners/owner-list/owner-list.component.spec.ts` with:

```typescript
/* tslint:disable:no-unused-variable */

import { ComponentFixture, TestBed, fakeAsync, tick, waitForAsync } from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {DebugElement, NO_ERRORS_SCHEMA} from '@angular/core';

import {OwnerListComponent} from './owner-list.component';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute} from '@angular/router';
import { OwnerService } from '../owner.service';
import {Owner} from '../owner';
import {Observable, of} from 'rxjs';
import {RouterTestingModule} from '@angular/router/testing';
import {CommonModule} from '@angular/common';
import {PartsModule} from '../../parts/parts.module';
import {ActivatedRouteStub} from '../../testing/router-stubs';
import {OwnerDetailComponent} from '../owner-detail/owner-detail.component';
import {OwnersModule} from '../owners.module';
import {DummyComponent} from '../../testing/dummy.component';
import {OwnerAddComponent} from '../owner-add/owner-add.component';
import {OwnerEditComponent} from '../owner-edit/owner-edit.component';
import Spy = jasmine.Spy;


class OwnerServiceStub {
  searchOwners(q: string): Observable<Owner[]> {
    return of();
  }
}

describe('OwnerListComponent', () => {

  let component: OwnerListComponent;
  let fixture: ComponentFixture<OwnerListComponent>;
  let ownerService = new OwnerServiceStub();
  let searchOwnersSpy: Spy;
  let de: DebugElement;
  let el: HTMLElement;


  const testOwner: Owner = {
    id: 1,
    firstName: 'George',
    lastName: 'Franklin',
    address: '110 W. Liberty St.',
    city: 'Madison',
    telephone: '6085551023',
    pets: []
  };
  let testOwners: Owner[];

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [DummyComponent],
      schemas: [NO_ERRORS_SCHEMA],
      imports: [CommonModule, FormsModule, PartsModule, OwnersModule,
        RouterTestingModule.withRoutes(
          [{path: 'owners', component: OwnerListComponent},
            {path: 'owners/add', component: OwnerAddComponent},
            {path: 'owners/:id', component: OwnerDetailComponent},
            {path: 'owners/:id/edit', component: OwnerEditComponent}
          ])],
      providers: [
        {provide: OwnerService, useValue: ownerService},
        {provide: ActivatedRoute, useClass: ActivatedRouteStub}
      ]
    })
      .compileComponents();
  }));

  beforeEach(() => {
    testOwners = [testOwner];

    fixture = TestBed.createComponent(OwnerListComponent);
    component = fixture.componentInstance;
    ownerService = fixture.debugElement.injector.get(OwnerService);
    searchOwnersSpy = spyOn(ownerService, 'searchOwners')
      .and.returnValue(of(testOwners));
  });

  it('should create OwnerListComponent', () => {
    expect(component).toBeTruthy();
  });

  it('loads all owners on init with an empty query (after the debounce)', fakeAsync(() => {
    fixture.detectChanges();
    tick(300);

    expect(searchOwnersSpy).toHaveBeenCalledWith('');
    expect(component.owners).toEqual(testOwners);
    expect(component.isOwnersDataReceived).toBe(true);
  }));

  it('shows the owner full name after the initial load', fakeAsync(() => {
    fixture.detectChanges();
    tick(300);
    fixture.detectChanges();

    de = fixture.debugElement.query(By.css('.ownerFullName'));
    el = de.nativeElement;
    expect(el.innerText).toBe('George Franklin');
  }));

  it('debounces keystrokes into a single search with the final term', fakeAsync(() => {
    fixture.detectChanges();
    tick(300);
    searchOwnersSpy.calls.reset();

    component.searchControl.setValue('F');
    tick(100);
    component.searchControl.setValue('Fr');
    tick(100);
    component.searchControl.setValue('Fra');
    tick(300);

    expect(searchOwnersSpy).toHaveBeenCalledTimes(1);
    expect(searchOwnersSpy).toHaveBeenCalledWith('Fra');
  }));

  it('does not repeat the search when the term is unchanged', fakeAsync(() => {
    fixture.detectChanges();
    tick(300);
    searchOwnersSpy.calls.reset();

    component.searchControl.setValue('Fra');
    tick(300);
    component.searchControl.setValue('Fra');
    tick(300);

    expect(searchOwnersSpy).toHaveBeenCalledTimes(1);
  }));

});
```

What changed: the `getOwners` stub/spy and the two `searchByLastName` tests are gone; the
component is now exercised through `searchControl` + `fakeAsync`/`tick(300)`.

- [ ] **Step 2: Run — verify FAIL (red)**

```bash
cd petclinic-frontend
npm run test-headless
```

Expected: FAIL — `component.searchControl` doesn't exist yet (TS compile error in the spec is
the failure mode here; that counts as red).

- [ ] **Step 3: Rewrite the component**

Replace the entire content of
`petclinic-frontend/src/app/owners/owner-list/owner-list.component.ts` with:

```typescript
import {Component, OnInit} from '@angular/core';
import {FormControl} from '@angular/forms';
import {OwnerService} from '../owner.service';
import {Owner} from '../owner';
import {Router} from '@angular/router';
import {debounceTime, distinctUntilChanged, startWith, switchMap} from 'rxjs/operators';

@Component({
  selector: 'app-owner-list',
  templateUrl: './owner-list.component.html',
  styleUrls: ['./owner-list.component.css']
})
export class OwnerListComponent implements OnInit {
  searchControl = new FormControl('');
  owners: Owner[];
  isOwnersDataReceived: boolean = false;

  constructor(private router: Router, private ownerService: OwnerService) {

  }

  ngOnInit() {
    // One code path for the initial load and the live search: startWith('')
    // issues the first (unfiltered) query. The 300ms debounce also delays that
    // first load — accepted trade-off (see the spec), do not special-case it.
    // switchMap cancels stale in-flight requests so a slow earlier response
    // cannot overwrite newer results.
    this.searchControl.valueChanges.pipe(
      startWith(''),
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(q => this.ownerService.searchOwners(q ?? ''))
    ).subscribe(owners => {
      this.owners = owners;
      this.isOwnersDataReceived = true;
    });
  }

  onSelect(owner: Owner) {
    this.router.navigate(['/owners', owner.id]);
  }

  addOwner() {
    this.router.navigate(['/owners/add']);
  }
}
```

(The `errorMessage`, `lastName`, and `listOfOwnersWithLastName` fields and `searchByLastName()`
are deliberately gone — service-level `catchError` already maps errors to `[]`.)

- [ ] **Step 4: Update the template**

In `petclinic-frontend/src/app/owners/owner-list/owner-list.component.html`, replace the form
and the no-owners div (lines 5-25) with:

```html
    <form class="form-horizontal" id="search-owner-form">
      <div class="form-group">
        <div class="control-group" id="searchGroup">
          <label class="col-sm-2 control-label" for="ownersSearch">Search </label>
          <div class="col-sm-10">
            <input class="form-control" size="30" maxlength="80"
                   id="ownersSearch" name="search" [formControl]="searchControl"
                   placeholder="Name, address, city, telephone or pet"/>
          </div>
        </div>
      </div>
    </form>

    <div *ngIf="owners && owners.length === 0">No owners found matching "{{searchControl.value}}"</div>
```

Leave the `#ownersTable` div's `*ngIf="owners"` and everything below it unchanged (with
`owners = []` the table renders empty and the Add Owner button stays visible, as before).

- [ ] **Step 5: Add ReactiveFormsModule to the owners module**

In `petclinic-frontend/src/app/owners/owners.module.ts`:

```typescript
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
```

and in the `imports` array:

```typescript
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    OwnersRoutingModule,
    PetsModule
  ],
```

- [ ] **Step 6: Run — verify PASS (green)**

```bash
cd petclinic-frontend
npm run test-headless
```

Expected: PASS — all suites, including the unrelated component specs.

- [ ] **Step 7: Commit**

```bash
git add petclinic-frontend/src/app/owners/owner-list/ petclinic-frontend/src/app/owners/owners.module.ts
git commit -m "Owners list: debounced live search box replacing the Find Owner button (#24)"
```

---

### Task 6: Playwright UI tests

**Files:**
- Modify: `petclinic-ui-test/tests/support/api-client.ts`
- Modify: `petclinic-ui-test/tests/pages/OwnersPage.ts`
- Modify: `petclinic-ui-test/tests/owners.spec.ts`

Playwright tests can't be red-green against a not-yet-running app; write them, then verify
against the locally running stack.

- [ ] **Step 1: Update the ApiClient**

In `petclinic-ui-test/tests/support/api-client.ts`:

Add a pet shape and a `pets` field to `OwnerDto` (the backend returns pets on each owner):

```typescript
export interface PetDto {
  id?: number;
  name: string;
}

export interface OwnerDto {
  firstName: string;
  lastName: string;
  id?: number;
  address?: string;
  city?: string;
  telephone?: string;
  pets?: PetDto[];
}
```

Replace `fetchOwnersByPrefix` with:

```typescript
  async fetchOwnersByQuery(q: string): Promise<OwnerDto[]> {
    const response = await this.client.get<OwnerDto[]>('/owners', {
      params: { q }
    });
    return response.data;
  }
```

Delete the now-unused static helpers `extractLastName` and `choosePrefixFrom`.

- [ ] **Step 2: Update the page object**

In `petclinic-ui-test/tests/pages/OwnersPage.ts`:

- Replace the `lastNameInput` and `findOwnerButton` locator fields with:

```typescript
  readonly searchInput: Locator;
```

and in the constructor:

```typescript
    this.searchInput = page.locator('#ownersSearch');
```

- In `getOwnerFullNames`, update the readiness selector (the old one referenced `#lastName`):

```typescript
    await this.page.waitForSelector('#ownersTable td.ownerFullName, #ownersSearch', { timeout: 10000 });
```

- Replace `searchByLastNamePrefix` with (Playwright's `fill` replaces the content and fires the
  input event; the app debounces 300ms, and `waitForOwnersCount` absorbs that wait):

```typescript
  async search(term: string) {
    await this.searchInput.waitFor({ state: 'visible' });
    await this.searchInput.fill(term);
  }
```

`waitForOwnersCount` stays as-is.

- [ ] **Step 3: Rewrite the filter test in `owners.spec.ts`**

Keep `shows all owners on initial load` unchanged. Replace the
`filters owners by last name prefix` test with these two:

```typescript
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
```

- [ ] **Step 4: Run the UI suite against the running stack**

All three must be up (separate terminals / background): database (`./start-database.sh`),
backend (`./start-backend-ts.sh`), frontend (`./start-frontend.sh`). Then:

```bash
cd petclinic-ui-test
npx playwright test tests/owners.spec.ts
```

Expected: 3 tests PASS. (Per `petclinic-ui-test/CLAUDE.md`: run from that directory; both apps
must be up first.)

- [ ] **Step 5: Run the full Playwright suite (regression)**

```bash
cd petclinic-ui-test
npm test
```

Expected: PASS — other specs (visits, …) are untouched but share the stack.

- [ ] **Step 6: Commit**

```bash
git add petclinic-ui-test/tests/
git commit -m "UI tests: cover the live owners search over all visible columns (#24)"
```

---

### Task 7: Full verification sweep

No new code — final proof before handing the branch over.

- [ ] **Step 1: Backend — lint, unit, e2e, guardrails**

```bash
cd petclinic-backend-ts
npm run lint && npm test && npm run test:e2e && npm run guardrail
```

Expected: all green; the OpenAPI guardrail confirms `openapi.yaml` matches the live contract.

- [ ] **Step 2: Frontend — build + headless tests**

```bash
cd petclinic-frontend
npm run build && npm run test-headless
```

Expected: production build succeeds (this also re-runs `generate:api` via `prebuild`; the
working tree must stay clean afterwards — if `api-types.ts` changed, Task 3 was skipped),
Karma suite green.

- [ ] **Step 3: Check the working tree is clean**

```bash
git status --short
```

Expected: empty (the pre-existing unrelated `petclinic-frontend/package-lock.json` modification
from before this feature may still show — leave it out of this branch's commits).

After this task, use the superpowers:finishing-a-development-branch skill (verify, then PR).
