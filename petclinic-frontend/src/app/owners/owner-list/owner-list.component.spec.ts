/* tslint:disable:no-unused-variable */

import { ComponentFixture, TestBed, fakeAsync, tick, waitForAsync } from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {DebugElement, NO_ERRORS_SCHEMA} from '@angular/core';

import {OwnerListComponent} from './owner-list.component';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute, Router} from '@angular/router';
import { OwnerService } from '../owner.service';
import {Owner} from '../owner';
import {OwnerPage} from '../owner-page';
import {Observable, of} from 'rxjs';
import {RouterTestingModule} from '@angular/router/testing';
import {CommonModule} from '@angular/common';
import {NoopAnimationsModule} from '@angular/platform-browser/animations';
import {MatSnackBarModule} from '@angular/material/snack-bar';
import {PartsModule} from '../../parts/parts.module';
import {ActivatedRouteStub} from '../../testing/router-stubs';
import {OwnerDetailComponent} from '../owner-detail/owner-detail.component';
import {OwnersModule} from '../owners.module';
import {DummyComponent} from '../../testing/dummy.component';
import {OwnerAddComponent} from '../owner-add/owner-add.component';
import {OwnerEditComponent} from '../owner-edit/owner-edit.component';
import Spy = jasmine.Spy;


class OwnerServiceStub {
  searchOwners(params: object): Observable<OwnerPage> {
    return of();
  }
}

describe('OwnerListComponent', () => {

  let component: OwnerListComponent;
  let fixture: ComponentFixture<OwnerListComponent>;
  let ownerService = new OwnerServiceStub();
  let searchOwnersSpy: Spy;
  let router: Router;
  let navigateSpy: Spy;
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
  let testPage: OwnerPage;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [DummyComponent],
      schemas: [NO_ERRORS_SCHEMA],
      imports: [CommonModule, FormsModule, PartsModule, NoopAnimationsModule, MatSnackBarModule, OwnersModule,
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
    testPage = {
      content: testOwners,
      totalElements: testOwners.length,
      totalPages: 1,
      number: 0,
      size: 10
    };

    fixture = TestBed.createComponent(OwnerListComponent);
    component = fixture.componentInstance;
    ownerService = fixture.debugElement.injector.get(OwnerService);
    searchOwnersSpy = spyOn(ownerService, 'searchOwners')
      .and.returnValue(of(testPage));
    router = fixture.debugElement.injector.get(Router);
    navigateSpy = spyOn(router, 'navigate').and.resolveTo(true);
  });

  it('should create OwnerListComponent', () => {
    expect(component).toBeTruthy();
  });

  it('loads owners on init from the queryParams (default page/size)', fakeAsync(() => {
    fixture.detectChanges();
    tick();

    expect(searchOwnersSpy).toHaveBeenCalledWith(
      jasmine.objectContaining({q: '', page: 0, size: 10})
    );
    expect(component.owners).toEqual(testOwners);
    expect(component.totalElements).toEqual(testOwners.length);
    expect(component.isOwnersDataReceived).toBe(true);
    expect(component.isLoading).toBe(false);
  }));

  it('shows the owner full name after the initial load', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    de = fixture.debugElement.query(By.css('.ownerFullName'));
    el = de.nativeElement;
    expect(el.innerText.trim()).toBe('George Franklin');
  }));

  it('navigates (does not fetch) when the search term changes, debounced to the final term', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    searchOwnersSpy.calls.reset();
    navigateSpy.calls.reset();

    component.searchControl.setValue('F');
    tick(100);
    component.searchControl.setValue('Fr');
    tick(100);
    component.searchControl.setValue('Fra');
    tick(300);

    // Input streams only navigate; fetching happens via queryParams.
    expect(searchOwnersSpy).not.toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledTimes(1);
    expect(navigateSpy).toHaveBeenCalledWith(
      [], jasmine.objectContaining({queryParams: jasmine.objectContaining({q: 'Fra'})})
    );
  }));

  it('does not navigate again when the term is unchanged', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    navigateSpy.calls.reset();

    component.searchControl.setValue('Fra');
    tick(300);
    component.searchControl.setValue('Fra');
    tick(300);

    expect(navigateSpy).toHaveBeenCalledTimes(1);
  }));

});
